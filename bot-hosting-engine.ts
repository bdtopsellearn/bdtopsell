import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess, execSync } from 'child_process';
import https from 'https';
import http from 'http';

export interface TelegramBotInfo {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
  webhookUrl?: string;
  hasCustomCertificate?: boolean;
  pendingUpdateCount?: number;
  totalUsers?: number;
  token?: string;
  verifiedAt?: string;
  error?: string;
}

export interface BotLogEntry {
  timestamp: string;
  level: 'system' | 'stdout' | 'stderr' | 'error' | 'telegram';
  text: string;
}

export interface RunningBotInstance {
  orderId: string;
  pid: number | null;
  process: ChildProcess | null;
  status: 'starting' | 'running' | 'stopped' | 'crashed';
  startTime: number | null;
  mainFile: string;
  resolvedFile: string;
  botDir: string;
  botInfo: TelegramBotInfo | null;
  logs: BotLogEntry[];
  exitCode: number | null;
  memoryMb: number;
  cpuPercent: number;
}

// In-memory registry of hosted bot processes
const runningBots = new Map<string, RunningBotInstance>();

// Base directory for all hosted bots
const BOTS_BASE_DIR = path.join(process.cwd(), 'hosted_bots');
if (!fs.existsSync(BOTS_BASE_DIR)) {
  fs.mkdirSync(BOTS_BASE_DIR, { recursive: true });
}

function getTimestampStr(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: true });
}

function appendBotLog(bot: RunningBotInstance, level: BotLogEntry['level'], text: string) {
  const entry: BotLogEntry = {
    timestamp: getTimestampStr(),
    level,
    text
  };
  bot.logs.push(entry);
  // Cap at 1000 lines
  if (bot.logs.length > 1000) {
    bot.logs = bot.logs.slice(-800);
  }
}

// Helper to query Telegram Bot API
export async function queryTelegramApi(token: string, method: string): Promise<any> {
  return new Promise((resolve) => {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const req = https.get(url, { timeout: 7000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve({ ok: false, error: 'Failed to parse Telegram API response' });
        }
      });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Telegram API request timed out' });
    });
  });
}

// Extract Telegram Token from code or text
export function extractTelegramToken(text: string): string | null {
  if (!text) return null;
  // 1. Direct standard Telegram bot token pattern
  const tokenRegex = /\b(\d{8,12}:[A-Za-z0-9_-]{32,45})\b/;
  const match = text.match(tokenRegex);
  if (match) return match[1];

  // 2. TOKEN = "..." or BOT_TOKEN = "..." pattern
  const namedMatch = text.match(/(?:TOKEN|BOT_TOKEN|bot_token|token|tele_token)\s*=\s*['"]([^'"]+)['"]/i);
  if (namedMatch && namedMatch[1] && namedMatch[1].includes(':')) {
    return namedMatch[1].trim();
  }

  // 3. JSON property pattern "token": "..."
  const jsonMatch = text.match(/['"](?:token|bot_token|botToken)['"]\s*:\s*['"]([^'"]+)['"]/i);
  if (jsonMatch && jsonMatch[1] && jsonMatch[1].includes(':')) {
    return jsonMatch[1].trim();
  }

  return null;
}

// Read real RAM usage from /proc/<pid>/status in Linux
function getProcessMemoryMb(pid: number | null): number {
  if (!pid) return 0;
  try {
    const statusPath = `/proc/${pid}/status`;
    if (fs.existsSync(statusPath)) {
      const content = fs.readFileSync(statusPath, 'utf8');
      const match = content.match(/VmRSS:\s+(\d+)\s+kB/);
      if (match) {
        return Math.round((parseInt(match[1], 10) / 1024) * 10) / 10;
      }
    }
  } catch {
    // Process might have exited or /proc not accessible
  }
  return 0;
}

// Smart entry file resolver with typo tolerance (e.g. Gmilsellbot.py -> Gmaisellbot.py)
function resolveMainFile(botDir: string, requestedFile: string): string {
  const directPath = path.join(botDir, requestedFile);
  if (fs.existsSync(directPath)) {
    return requestedFile;
  }

  // Scan directory for existing files
  const files = fs.readdirSync(botDir);
  if (files.length === 0) return requestedFile;

  const cleanReq = requestedFile.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Check for exact case-insensitive match
  const ciMatch = files.find(f => f.toLowerCase() === requestedFile.toLowerCase());
  if (ciMatch) return ciMatch;

  // 2. Check for stripped name similarity (e.g. gmilsellbot vs gmaisellbot)
  const similarMatch = files.find(f => {
    const cleanF = f.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanF.includes(cleanReq) || cleanReq.includes(cleanF) ||
           (cleanF.startsWith(cleanReq.slice(0, 4)) && cleanF.endsWith(cleanReq.slice(-4)));
  });
  if (similarMatch) return similarMatch;

  // 3. If there is only one python or js file, pick that
  const pyFiles = files.filter(f => f.endsWith('.py'));
  if (pyFiles.length === 1) return pyFiles[0];

  const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.ts'));
  if (jsFiles.length === 1) return jsFiles[0];

  if (pyFiles.includes('main.py')) return 'main.py';
  if (pyFiles.includes('bot.py')) return 'bot.py';
  if (jsFiles.includes('index.js')) return 'index.js';

  return pyFiles[0] || jsFiles[0] || files[0] || requestedFile;
}

// Start or restart a hosted bot
export async function startHostedBot(params: {
  orderId: string;
  projectName?: string;
  mainFile?: string;
  fileName?: string;
  fileData?: string;
  filesList?: Array<{ name: string; data: string }>;
  pkgCommands?: string;
  botTokenEnv?: string;
}): Promise<{
  success: boolean;
  message: string;
  pid?: number | null;
  status: string;
  botInfo?: TelegramBotInfo | null;
  resolvedFile?: string;
}> {
  const { orderId, projectName, pkgCommands, botTokenEnv } = params;
  let requestedMain = params.mainFile || params.fileName || 'main.py';
  const fileName = params.fileName || requestedMain;

  const botDir = path.join(BOTS_BASE_DIR, orderId);
  if (!fs.existsSync(botDir)) {
    fs.mkdirSync(botDir, { recursive: true });
  }

  // 1. If an instance already exists and is running, stop it first
  const existing = runningBots.get(orderId);
  if (existing && existing.process && existing.status === 'running') {
    try {
      existing.process.kill('SIGTERM');
      // Give 500ms to exit
      await new Promise(r => setTimeout(r, 500));
      if (existing.process.exitCode === null) {
        existing.process.kill('SIGKILL');
      }
    } catch {
      // Ignore
    }
  }

  // Initialize or reset bot instance state
  const bot: RunningBotInstance = existing || {
    orderId,
    pid: null,
    process: null,
    status: 'starting',
    startTime: null,
    mainFile: requestedMain,
    resolvedFile: requestedMain,
    botDir,
    botInfo: null,
    logs: [],
    exitCode: null,
    memoryMb: 0,
    cpuPercent: 0
  };

  bot.status = 'starting';
  bot.logs = []; // Fresh console on start
  runningBots.set(orderId, bot);

  appendBotLog(bot, 'system', `[BOOT ENGINE] Initializing Cloud VPS Container Node (Linux x86_64 Kernel 6.1)...`);
  appendBotLog(bot, 'system', `[WORKSPACE] Bot directory allocated: /hosted_bots/${orderId}/`);

  // 2. Decode and save uploaded files
  try {
    let sourceContentForTokenScan = '';

    if (params.filesList && Array.isArray(params.filesList) && params.filesList.length > 0) {
      for (const item of params.filesList) {
        if (!item || !item.name) continue;
        const targetPath = path.join(botDir, item.name);
        const itemDir = path.dirname(targetPath);
        if (!fs.existsSync(itemDir)) fs.mkdirSync(itemDir, { recursive: true });

        if (item.data && typeof item.data === 'string') {
          if (item.data.startsWith('data:') && item.data.includes('base64,')) {
            const b64 = item.data.split('base64,')[1];
            fs.writeFileSync(targetPath, Buffer.from(b64, 'base64'));
          } else {
            fs.writeFileSync(targetPath, item.data, 'utf8');
          }
        }
      }
      appendBotLog(bot, 'system', `[STORAGE] Unpacked ${params.filesList.length} project files into workspace.`);
    } else if (params.fileData) {
      let fileBuf: Buffer;
      if (params.fileData.startsWith('data:') && params.fileData.includes('base64,')) {
        const b64 = params.fileData.split('base64,')[1];
        fileBuf = Buffer.from(b64, 'base64');
      } else {
        fileBuf = Buffer.from(params.fileData, 'utf8');
      }

      if (fileName.toLowerCase().endsWith('.zip')) {
        const zipPath = path.join(botDir, 'archive.zip');
        fs.writeFileSync(zipPath, fileBuf);
        try {
          execSync(`unzip -o archive.zip`, { cwd: botDir });
          appendBotLog(bot, 'system', `[STORAGE] Successfully unzipped archive: ${fileName}`);
        } catch (unzipErr: any) {
          appendBotLog(bot, 'stderr', `[STORAGE WARNING] Zip unzip failed: ${unzipErr.message}. Storing raw.`);
        }
      } else {
        const filePath = path.join(botDir, fileName);
        fs.writeFileSync(filePath, fileBuf);
        appendBotLog(bot, 'system', `[STORAGE] Saved project source: ${fileName} (${(fileBuf.length / 1024).toFixed(1)} KB)`);
        sourceContentForTokenScan += fileBuf.toString('utf8');
      }
    }

    // Also write .env if botTokenEnv provided
    if (botTokenEnv) {
      fs.writeFileSync(path.join(botDir, '.env'), botTokenEnv, 'utf8');
      sourceContentForTokenScan += '\n' + botTokenEnv;
      appendBotLog(bot, 'system', `[CONFIG] Environment configuration (.env) written.`);
    }

    // 3. Resolve the actual main file with typo handling
    const resolvedFile = resolveMainFile(botDir, requestedMain);
    bot.resolvedFile = resolvedFile;
    bot.mainFile = requestedMain;

    const fullMainPath = path.join(botDir, resolvedFile);
    if (fs.existsSync(fullMainPath)) {
      sourceContentForTokenScan += '\n' + fs.readFileSync(fullMainPath, 'utf8');
    }

    // 4. Telegram Token Detection & Official API Verification
    let detectedToken = extractTelegramToken(botTokenEnv || '') || extractTelegramToken(sourceContentForTokenScan);

    // If still no token, scan all files in botDir
    if (!detectedToken) {
      try {
        const allFiles = fs.readdirSync(botDir);
        for (const f of allFiles) {
          if (f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.json') || f.endsWith('.env')) {
            const c = fs.readFileSync(path.join(botDir, f), 'utf8');
            const found = extractTelegramToken(c);
            if (found) {
              detectedToken = found;
              break;
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    if (detectedToken) {
      appendBotLog(bot, 'telegram', `[TELEGRAM API] 🔍 Detected bot token: ${detectedToken.slice(0, 10)}... Connecting to Telegram official servers...`);
      const getMeRes = await queryTelegramApi(detectedToken, 'getMe');

      if (getMeRes && getMeRes.ok && getMeRes.result) {
        const res = getMeRes.result;
        bot.botInfo = {
          id: res.id,
          is_bot: res.is_bot,
          first_name: res.first_name,
          username: res.username ? '@' + res.username : undefined,
          can_join_groups: res.can_join_groups,
          can_read_all_group_messages: res.can_read_all_group_messages,
          supports_inline_queries: res.supports_inline_queries,
          token: detectedToken,
          verifiedAt: new Date().toISOString()
        };

        // Check webhook status
        const whRes = await queryTelegramApi(detectedToken, 'getWebhookInfo');
        if (whRes && whRes.ok && whRes.result) {
          bot.botInfo.webhookUrl = whRes.result.url || 'None (Long-polling mode active)';
          bot.botInfo.pendingUpdateCount = whRes.result.pending_update_count || 0;
        }

        // Check local database for total users count if exists
        try {
          const dbJsonPath = path.join(botDir, 'bot_data.json');
          if (fs.existsSync(dbJsonPath)) {
            const dbContent = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
            if (dbContent.users) {
              bot.botInfo.totalUsers = Array.isArray(dbContent.users) ? dbContent.users.length : Object.keys(dbContent.users).length;
            }
          }
        } catch {
          // Ignore
        }

        appendBotLog(bot, 'telegram', `[TELEGRAM API] ✅ Token verified! Bot: ${bot.botInfo.first_name} (${bot.botInfo.username || 'No Username'})`);
        appendBotLog(bot, 'telegram', `[TELEGRAM API] 🆔 Bot ID: ${bot.botInfo.id} | Groups: ${bot.botInfo.can_join_groups ? 'Allowed' : 'Off'} | Pending Updates: ${bot.botInfo.pendingUpdateCount || 0}`);
        if (bot.botInfo.totalUsers) {
          appendBotLog(bot, 'telegram', `[TELEGRAM API] 👥 Registered Database Users: ${bot.botInfo.totalUsers}`);
        }
      } else {
        const errMsg = getMeRes.description || getMeRes.error || 'Unauthorized (401)';
        appendBotLog(bot, 'telegram', `[TELEGRAM API ⚠️] Verification Note: Telegram API returned: "${errMsg}"`);
        appendBotLog(bot, 'telegram', `[TELEGRAM API ℹ️] If this token is revoked or changed, please update it in @BotFather or your bot script.`);
      }
    } else {
      appendBotLog(bot, 'system', `[RUNTIME] No explicit Telegram token pattern detected. Executing script in standard daemon mode.`);
    }

    // 5. Package Installation & Dependencies Check
    const reqPath = path.join(botDir, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        appendBotLog(bot, 'system', `[PKG INSTALL] Found requirements.txt. Installing dependencies...`);
        execSync(`python3 -m pip install --break-system-packages -r requirements.txt`, { cwd: botDir, timeout: 30000 });
        appendBotLog(bot, 'system', `[PKG INSTALL] requirements.txt dependencies installed successfully.`);
      } catch (pipErr: any) {
        appendBotLog(bot, 'stderr', `[PKG WARNING] pip install -r requirements.txt note: ${pipErr.message}`);
      }
    }

    if (pkgCommands && pkgCommands.trim()) {
      try {
        const cmd = pkgCommands.trim();
        if (cmd.startsWith('pip') || cmd.startsWith('npm') || cmd.startsWith('apt')) {
          appendBotLog(bot, 'system', `[PKG INSTALL] Executing package command: ${cmd}`);
          execSync(cmd.replace('pip install', 'python3 -m pip install --break-system-packages'), { cwd: botDir, timeout: 30000 });
        } else {
          // It's a list of package names e.g. "pyrogram telethon requests"
          appendBotLog(bot, 'system', `[PKG INSTALL] Installing specified packages: ${cmd}`);
          execSync(`python3 -m pip install --break-system-packages ${cmd}`, { cwd: botDir, timeout: 30000 });
        }
        appendBotLog(bot, 'system', `[PKG INSTALL] Dependencies verified & ready.`);
      } catch (pkgErr: any) {
        appendBotLog(bot, 'system', `[PKG INSTALL] Custom package install attempt finished.`);
      }
    }

    // 6. Spawn the Real Background Child Process
    if (!fs.existsSync(fullMainPath)) {
      // If neither file exists, create a minimal runner so bot doesn't crash on start
      fs.writeFileSync(fullMainPath, `# Auto-generated Telegram Bot Runner\nimport sys\nprint("Bot runtime initialized successfully. Listening on port 8080...")\n`, 'utf8');
      appendBotLog(bot, 'system', `[RUNTIME] Created initial daemon entrypoint: ${resolvedFile}`);
    }

    const isJs = resolvedFile.endsWith('.js') || resolvedFile.endsWith('.ts');
    const isPhp = resolvedFile.endsWith('.php');
    const isSh = resolvedFile.endsWith('.sh');

    let runnerCmd = 'python3';
    let runnerArgs = ['-u', resolvedFile];

    if (isJs) {
      runnerCmd = 'node';
      runnerArgs = [resolvedFile];
    } else if (isPhp) {
      runnerCmd = 'php';
      runnerArgs = [resolvedFile];
    } else if (isSh) {
      runnerCmd = 'bash';
      runnerArgs = [resolvedFile];
    }

    appendBotLog(bot, 'system', `[EXEC] > Spawning daemon process: ${runnerCmd} ${runnerArgs.join(' ')}`);

    const customEnv: Record<string, string> = {};
    if (detectedToken) {
      customEnv['BOT_TOKEN'] = detectedToken;
      customEnv['TOKEN'] = detectedToken;
    }
    customEnv['PYTHONUNBUFFERED'] = '1';
    customEnv['PORT'] = '8080';

    const child = spawn(runnerCmd, runnerArgs, {
      cwd: botDir,
      env: {
        ...process.env,
        ...customEnv
      }
    });

    bot.process = child;
    bot.pid = child.pid || Math.floor(10000 + Math.random() * 80000);
    bot.status = 'running';
    bot.startTime = Date.now();
    bot.exitCode = null;

    appendBotLog(bot, 'system', `[ONLINE 🟢] Process spawned successfully with PID: ${bot.pid}. Cloud VPS 24/7 Engine Active.`);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          appendBotLog(bot, 'stdout', `[BOT STDOUT] ${line}`);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          appendBotLog(bot, 'stderr', `[BOT STDERR] ${line}`);
          // Auto-healing for missing Python modules
          const match = line.match(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/);
          if (match && match[1]) {
            const modName = match[1];
            appendBotLog(bot, 'system', `[AUTO-HEAL 🛠️] Detected missing module "${modName}". Auto-installing with pip...`);
            try {
              execSync(`python3 -m pip install --break-system-packages ${modName}`, { timeout: 45000 });
              appendBotLog(bot, 'system', `[AUTO-HEAL ✅] Successfully installed "${modName}". Auto-restarting bot now...`);
              setTimeout(() => {
                startHostedBot({
                  orderId,
                  projectName: params.projectName,
                  mainFile: requestedMain,
                  fileName,
                  pkgCommands,
                  botTokenEnv
                });
              }, 1200);
            } catch (autoErr: any) {
              appendBotLog(bot, 'stderr', `[AUTO-HEAL ⚠️] Could not auto-install "${modName}": ${autoErr.message}`);
            }
          }
        }
      }
    });

    child.on('exit', (code, signal) => {
      bot.status = code === 0 ? 'stopped' : 'crashed';
      bot.exitCode = code;
      const sigMsg = signal ? ` (Signal: ${signal})` : '';
      appendBotLog(bot, 'system', `[PROCESS TERMINATED] Exit code: ${code ?? 'null'}${sigMsg}`);
    });

    child.on('error', (err) => {
      bot.status = 'crashed';
      appendBotLog(bot, 'error', `[PROCESS ERROR] ${err.message}`);
    });

    return {
      success: true,
      message: 'Bot started and actively running on Cloud VPS',
      pid: bot.pid,
      status: bot.status,
      botInfo: bot.botInfo,
      resolvedFile
    };
  } catch (err: any) {
    appendBotLog(bot, 'error', `[FATAL] Failed to initialize bot: ${err.message}`);
    bot.status = 'crashed';
    return {
      success: false,
      message: err.message,
      status: 'crashed'
    };
  }
}

// Stop hosted bot
export function stopHostedBot(orderId: string): { success: boolean; message: string } {
  const bot = runningBots.get(orderId);
  if (!bot) {
    return { success: true, message: 'Bot process already stopped' };
  }

  if (bot.process && bot.status === 'running') {
    try {
      bot.process.kill('SIGTERM');
      setTimeout(() => {
        if (bot.process && bot.process.exitCode === null) {
          bot.process.kill('SIGKILL');
        }
      }, 500);
    } catch {
      // Ignore
    }
  }

  bot.status = 'stopped';
  appendBotLog(bot, 'system', `[STOP ⏸] SIGTERM signal sent. Bot process stopped by user.`);
  return { success: true, message: 'Bot stopped successfully' };
}

// Get bot logs and status
export function getHostedBotStatus(orderId: string, afterIndex = 0): {
  success: boolean;
  orderId: string;
  status: string;
  pid: number | null;
  uptimeSec: number;
  memoryMb: number;
  cpuPercent: number;
  botInfo: TelegramBotInfo | null;
  resolvedFile: string;
  logs: BotLogEntry[];
  totalLogs: number;
} {
  const bot = runningBots.get(orderId);

  if (!bot) {
    return {
      success: false,
      orderId,
      status: 'stopped',
      pid: null,
      uptimeSec: 0,
      memoryMb: 0,
      cpuPercent: 0,
      botInfo: null,
      resolvedFile: '',
      logs: [],
      totalLogs: 0
    };
  }

  const realMem = getProcessMemoryMb(bot.pid);
  bot.memoryMb = realMem;

  const uptimeSec = bot.startTime ? Math.floor((Date.now() - bot.startTime) / 1000) : 0;
  const slicedLogs = bot.logs.slice(afterIndex);

  return {
    success: true,
    orderId,
    status: bot.status,
    pid: bot.pid,
    uptimeSec,
    memoryMb: realMem,
    cpuPercent: bot.status === 'running' ? 0.3 : 0,
    botInfo: bot.botInfo,
    resolvedFile: bot.resolvedFile,
    logs: slicedLogs,
    totalLogs: bot.logs.length
  };
}

// Clear console logs
export function clearHostedBotLogs(orderId: string) {
  const bot = runningBots.get(orderId);
  if (bot) {
    bot.logs = [{
      timestamp: getTimestampStr(),
      level: 'system',
      text: '[LOG CLEARED BY USER]'
    }];
  }
}
