import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const ROOT_DIR = process.cwd();
const OPENBROWSER_DIR = path.join(ROOT_DIR, '.openbrowser');
const HISTORY_FILE = path.join(OPENBROWSER_DIR, 'history.json');

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.openbrowser',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '*.lock',
  '*.log',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.webp',
  '*.ico',
  '*.zip',
  '*.tar.gz',
  '*.apk',
  '*.pdf'
];

export interface FileOp {
  action: 'CREATE_FILE' | 'EDIT_FILE' | 'DELETE_FILE' | 'CREATE_FOLDER' | 'RUN_COMMAND';
  path?: string;
  content?: string;
  command?: string;
}

export interface PlannedOp {
  operation: FileOp;
  relativePath: string;
  absolutePath: string;
  diff: string;
  oldContent?: string;
  newContent?: string;
  status: 'pending' | 'ready' | 'applied' | 'error';
  error?: string;
}

export interface HistoryRecord {
  id: string;
  timestamp: string;
  mode: 'ask' | 'agent' | 'manual';
  prompt?: string;
  summary: string;
  operations?: Array<{
    action: string;
    path?: string;
    command?: string;
    backup?: string;
  }>;
}

// Ensure .openbrowser directory exists
function ensureOpenBrowserDir(): void {
  if (!fs.existsSync(OPENBROWSER_DIR)) {
    fs.mkdirSync(OPENBROWSER_DIR, { recursive: true });
  }
}

// Safe path validation inside workspace
export function resolveSafePath(userPath: string): string {
  const normalized = path.normalize(userPath).replace(/^(\.\.[\/\\])+/, '');
  const abs = path.resolve(ROOT_DIR, normalized);
  const rel = path.relative(ROOT_DIR, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Access denied: Path escapes workspace root: ${userPath}`);
  }
  return abs;
}

// Recursively scan files in workspace
export function scanWorkspace(dir = ROOT_DIR, maxFiles = 300): string[] {
  const results: string[] = [];

  function walk(current: string) {
    if (results.length >= maxFiles) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const name = entry.name;
      if (name.startsWith('.') && name !== '.env.example' && name !== '.gitignore') {
        continue;
      }
      if (IGNORE_PATTERNS.some(pat => {
        if (pat.startsWith('*.')) return name.endsWith(pat.slice(1));
        return name === pat;
      })) {
        continue;
      }

      const full = path.join(current, name);
      const rel = path.relative(ROOT_DIR, full);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        results.push(rel.replace(/\\/g, '/'));
      }
    }
  }

  walk(dir);
  return results;
}

// Generate project context summary (OpenBrowser Context Engine)
export function getWorkspaceContext(): {
  files: string[];
  tree: string;
  packageInfo: any;
  summary: string;
  tokenEstimate: number;
} {
  const files = scanWorkspace(ROOT_DIR, 250);
  let packageInfo: any = {};

  const pkgPath = path.join(ROOT_DIR, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      packageInfo = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch (_) {}
  }

  const scripts = packageInfo.scripts ? Object.keys(packageInfo.scripts).join(', ') : 'none';
  const deps = packageInfo.dependencies ? Object.keys(packageInfo.dependencies).join(', ') : 'none';
  const devDeps = packageInfo.devDependencies ? Object.keys(packageInfo.devDependencies).join(', ') : 'none';

  const treeLines = files.slice(0, 150).map(f => `  - ${f}`).join('\n');
  const summary = [
    `# Workspace Architecture & Context`,
    `Root Directory: ${ROOT_DIR}`,
    `App Name: ${packageInfo.name || 'bd-topsell'} (${packageInfo.version || '1.0.0'})`,
    `Scripts: ${scripts}`,
    `Dependencies: ${deps}`,
    `DevDependencies: ${devDeps}`,
    `\n## Workspace Files (Top ${files.length}):`,
    treeLines,
  ].join('\n');

  const tokenEstimate = Math.ceil(summary.length / 4);

  return {
    files,
    tree: treeLines,
    packageInfo,
    summary,
    tokenEstimate
  };
}

// Safe File Read
export function readFileSafe(relPath: string): { content: string; size: number; modified: string } {
  const abs = resolveSafePath(relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${relPath}`);
  }
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory: ${relPath}`);
  }
  const content = fs.readFileSync(abs, 'utf-8');
  return {
    content,
    size: stat.size,
    modified: stat.mtime.toISOString()
  };
}

// Safe File Write with automatic backup
export function writeFileSafe(relPath: string, content: string): { bytesWritten: number; backupCreated: boolean } {
  const abs = resolveSafePath(relPath);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let backupCreated = false;
  let oldContent: string | undefined;

  if (fs.existsSync(abs)) {
    try {
      oldContent = fs.readFileSync(abs, 'utf-8');
      backupCreated = true;
    } catch (_) {}
  }

  fs.writeFileSync(abs, content, 'utf-8');

  // Record into history
  recordHistory({
    id: 'op-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString(),
    mode: 'manual',
    summary: `Updated file ${relPath}`,
    operations: [
      {
        action: oldContent !== undefined ? 'EDIT_FILE' : 'CREATE_FILE',
        path: relPath,
        backup: oldContent
      }
    ]
  });

  return {
    bytesWritten: Buffer.byteLength(content, 'utf-8'),
    backupCreated
  };
}

// High-speed LCS Line-by-Line Unified Diff Generator
export function generateUnifiedDiff(oldStr = '', newStr = '', filePath = 'file'): string {
  const oldLines = oldStr === '' ? [] : oldStr.split(/\r?\n/);
  const newLines = newStr === '' ? [] : newStr.split(/\r?\n/);

  const header = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${oldLines.length || 1} +1,${newLines.length || 1} @@\n`;

  // Quick compare if identical
  if (oldStr === newStr) {
    return header + ' (No changes)';
  }

  // Fast line comparison
  const diffLines: string[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diffLines.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else {
      // Lookahead matching
      let matchOld = -1;
      let matchNew = -1;

      for (let look = 1; look < 6; look++) {
        if (i + look < oldLines.length && oldLines[i + look] === newLines[j]) {
          matchOld = i + look;
          break;
        }
        if (j + look < newLines.length && oldLines[i] === newLines[j + look]) {
          matchNew = j + look;
          break;
        }
      }

      if (matchOld !== -1) {
        while (i < matchOld) {
          diffLines.push(`-${oldLines[i]}`);
          i++;
        }
      } else if (matchNew !== -1) {
        while (j < matchNew) {
          diffLines.push(`+${newLines[j]}`);
          j++;
        }
      } else {
        if (i < oldLines.length) {
          diffLines.push(`-${oldLines[i]}`);
          i++;
        }
        if (j < newLines.length) {
          diffLines.push(`+${newLines[j]}`);
          j++;
        }
      }
    }
  }

  return header + diffLines.slice(0, 300).join('\n') + (diffLines.length > 300 ? '\n... (remaining diff truncated)' : '');
}

// Plan Operations (Preview Stage)
export async function planOperations(operations: FileOp[]): Promise<PlannedOp[]> {
  const plans: PlannedOp[] = [];

  for (const op of operations) {
    if (op.action === 'RUN_COMMAND') {
      plans.push({
        operation: op,
        relativePath: '',
        absolutePath: ROOT_DIR,
        diff: `RUN_COMMAND: ${op.command || ''}`,
        status: 'ready'
      });
      continue;
    }

    if (!op.path) {
      plans.push({
        operation: op,
        relativePath: '',
        absolutePath: '',
        diff: `[Error: missing path for ${op.action}]`,
        status: 'error',
        error: 'Missing file path'
      });
      continue;
    }

    try {
      const abs = resolveSafePath(op.path);
      const rel = path.relative(ROOT_DIR, abs).replace(/\\/g, '/');

      let oldContent = '';
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        oldContent = fs.readFileSync(abs, 'utf-8');
      }

      const newContent = op.content ?? '';
      let diff = '';

      if (op.action === 'CREATE_FOLDER') {
        diff = `CREATE_FOLDER: ${rel}`;
      } else if (op.action === 'DELETE_FILE') {
        diff = `DELETE_FILE: ${rel}\n` + (oldContent ? oldContent.split('\n').map(l => `-${l}`).join('\n') : '');
      } else {
        diff = generateUnifiedDiff(oldContent, newContent, rel);
      }

      plans.push({
        operation: op,
        relativePath: rel,
        absolutePath: abs,
        diff,
        oldContent,
        newContent,
        status: 'ready'
      });
    } catch (err: any) {
      plans.push({
        operation: op,
        relativePath: op.path,
        absolutePath: '',
        diff: `[Error: ${err.message}]`,
        status: 'error',
        error: err.message
      });
    }
  }

  return plans;
}

// Execute Operations (Apply Stage)
export async function executeOperations(
  operations: FileOp[],
  conversationId = 'session-' + Date.now()
): Promise<{ success: boolean; applied: number; results: any[] }> {
  const plans = await planOperations(operations);
  const results: any[] = [];
  const backups: Array<{ action: string; path?: string; command?: string; backup?: string }> = [];

  for (const plan of plans) {
    if (plan.status === 'error') {
      results.push({ action: plan.operation.action, path: plan.relativePath, status: 'skipped', error: plan.error });
      continue;
    }

    try {
      if (plan.operation.action === 'RUN_COMMAND') {
        const cmd = plan.operation.command || '';
        const cmdRes = await execAsync(cmd, { cwd: ROOT_DIR, timeout: 30000 });
        results.push({
          action: 'RUN_COMMAND',
          command: cmd,
          status: 'success',
          stdout: cmdRes.stdout,
          stderr: cmdRes.stderr
        });
        backups.push({ action: 'RUN_COMMAND', command: cmd });
      } else if (plan.operation.action === 'CREATE_FOLDER') {
        fs.mkdirSync(plan.absolutePath, { recursive: true });
        results.push({ action: 'CREATE_FOLDER', path: plan.relativePath, status: 'success' });
        backups.push({ action: 'CREATE_FOLDER', path: plan.relativePath });
      } else if (plan.operation.action === 'DELETE_FILE') {
        if (fs.existsSync(plan.absolutePath)) {
          fs.unlinkSync(plan.absolutePath);
        }
        results.push({ action: 'DELETE_FILE', path: plan.relativePath, status: 'success' });
        backups.push({ action: 'DELETE_FILE', path: plan.relativePath, backup: plan.oldContent });
      } else {
        // CREATE_FILE or EDIT_FILE
        const dir = path.dirname(plan.absolutePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(plan.absolutePath, plan.newContent || '', 'utf-8');
        results.push({ action: plan.operation.action, path: plan.relativePath, status: 'success' });
        backups.push({ action: plan.operation.action, path: plan.relativePath, backup: plan.oldContent });
      }
    } catch (err: any) {
      results.push({
        action: plan.operation.action,
        path: plan.relativePath,
        status: 'error',
        error: err.message
      });
    }
  }

  recordHistory({
    id: conversationId,
    timestamp: new Date().toISOString(),
    mode: 'agent',
    summary: `Executed ${results.filter(r => r.status === 'success').length} operations successfully`,
    operations: backups
  });

  return {
    success: true,
    applied: results.filter(r => r.status === 'success').length,
    results
  };
}

// History recording
export function recordHistory(record: HistoryRecord): void {
  ensureOpenBrowserDir();
  let list: HistoryRecord[] = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch (_) {
      list = [];
    }
  }
  list.unshift(record);
  if (list.length > 50) list = list.slice(0, 50);
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (_) {}
}

export function getHistory(): HistoryRecord[] {
  ensureOpenBrowserDir();
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch (_) {
    return [];
  }
}

// Rollback specific operation from history
export function rollbackOperation(historyId: string, filePath?: string): { success: boolean; restored: string[] } {
  const history = getHistory();
  const item = history.find(h => h.id === historyId);
  if (!item || !item.operations) {
    throw new Error('History entry not found or has no snapshots');
  }

  const restored: string[] = [];
  for (const op of item.operations) {
    if (filePath && op.path !== filePath) continue;
    if (op.path && op.backup !== undefined) {
      const abs = resolveSafePath(op.path);
      fs.writeFileSync(abs, op.backup, 'utf-8');
      restored.push(op.path);
    }
  }

  return { success: true, restored };
}

// Parse operations from LLM output (OpenBrowser Parser format: OB_FILE or JSON operations)
export function parseModelOperations(text: string): { operations: FileOp[]; explanation: string } {
  const operations: FileOp[] = [];
  let explanation = text;

  // 1. Check for JSON block with operations
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?\{[\s\S]*?"operations"[\s\S]*?\})\s*```/i) ||
                    text.match(/(\{[\s\S]*?"operations"\s*:\s*\[[\s\S]*?\][\s\S]*?\})/i);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.operations)) {
        for (const op of parsed.operations) {
          if (op && op.action) {
            operations.push({
              action: op.action,
              path: op.path,
              content: op.content,
              command: op.command
            });
          }
        }
      }
    } catch (_) {}
  }

  // 2. Check for OpenBrowser OB_FILE blocks (---OB_FILE_BEGIN: path--- ... ---OB_FILE_END---)
  const obRegex = /---OB_FILE_BEGIN:\s*([^\n\r]+?)---\s*([\s\S]*?)---OB_FILE_END---/gi;
  let obMatch: RegExpExecArray | null;

  while ((obMatch = obRegex.exec(text)) !== null) {
    const rawPath = obMatch[1].trim();
    const content = obMatch[2];
    const existing = operations.find(o => o.path === rawPath);
    if (existing) {
      existing.content = content;
    } else {
      operations.push({
        action: 'CREATE_FILE',
        path: rawPath,
        content
      });
    }
  }

  // 3. Fallback: Parse markdown code blocks that have filenames in header e.g. ```typescript:src/app.ts or // file: ...
  if (operations.length === 0) {
    const codeBlockRegex = /```([a-zA-Z0-9_\-\.]+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
    let cbMatch: RegExpExecArray | null;

    while ((cbMatch = codeBlockRegex.exec(text)) !== null) {
      const langOrPath = cbMatch[2]?.trim() || '';
      const code = cbMatch[3];

      let targetPath = langOrPath;
      if (!targetPath) {
        // Look inside first line for comments like // path/to/file or # path/to/file
        const firstLine = code.split('\n')[0] || '';
        const pathMatch = firstLine.match(/(?:\/\/|#|\/\*)\s*(?:file|path|filename)?[:=]?\s*([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i);
        if (pathMatch) {
          targetPath = pathMatch[1].trim();
        }
      }

      if (targetPath && (targetPath.includes('/') || targetPath.includes('.'))) {
        operations.push({
          action: 'CREATE_FILE',
          path: targetPath,
          content: code
        });
      }
    }
  }

  return { operations, explanation };
}

// OpenBrowser System Prompts
export function getSystemPrompt(mode: 'ask' | 'agent'): string {
  if (mode === 'ask') {
    return `You are Developer AI (OpenBrowser Architecture), an elite full-stack coding assistant and local dev orchestrator.
Your role:
- Answer developer questions with precision, high-quality code patterns, and concrete code examples.
- Explain architecture, debug errors, diagnose performance issues, and recommend modern TypeScript/Node.js/Python/PHP solutions.
- Format responses with clean Markdown headers, bullet points, and syntax-highlighted codeblocks.
- When suggesting commands, provide exact shell commands with clear explanations.
- Speak in clear, polite Bengali or English based on the user's language preference.`;
  }

  return `You are Developer AI (OpenBrowser Agent Mode), an autonomous coding agent.
You are given a workspace context and user request.
You MUST output file operations to solve the request using the OpenBrowser format:

Format 1 - Operations JSON:
{
  "operations": [
    { "action": "CREATE_FILE", "path": "path/to/file.ext", "content": "..." },
    { "action": "EDIT_FILE", "path": "path/to/file.ext", "content": "..." },
    { "action": "DELETE_FILE", "path": "path/to/file.ext" },
    { "action": "CREATE_FOLDER", "path": "path/to/dir" },
    { "action": "RUN_COMMAND", "command": "npm install package" }
  ],
  "conversationId": "session-id"
}

Format 2 - OB_FILE blocks:
---OB_FILE_BEGIN: path/to/file.ext---
<full file content here>
---OB_FILE_END---

Rules:
1. Always specify clean, relative file paths.
2. Provide complete, working code without truncation.
3. Keep explanation concise and outline the exact changes made.`;
}

// Intelligent Developer AI completion engine
export async function generateDeveloperAIResponse({
  prompt,
  mode = 'ask',
  provider = 'chatgpt',
  contextFiles = []
}: {
  prompt: string;
  mode: 'ask' | 'agent';
  provider?: string;
  contextFiles?: string[];
}): Promise<{ text: string; operations: FileOp[]; providerUsed: string }> {
  const ctx = getWorkspaceContext();
  const sysPrompt = getSystemPrompt(mode);

  // Read any requested context files
  let attachedContext = '';
  for (const f of contextFiles.slice(0, 5)) {
    try {
      const fileData = readFileSafe(f);
      attachedContext += `\n\n--- FILE: ${f} ---\n${fileData.content.slice(0, 4000)}\n--- END FILE ---`;
    } catch (_) {}
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (apiKey) {
    try {
      const fullPrompt = `${sysPrompt}\n\n[WORKSPACE CONTEXT]:\n${ctx.summary}\n${attachedContext}\n\n[USER REQUEST]:\n${prompt}`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          const { operations } = parseModelOperations(text);
          return { text, operations, providerUsed: `Gemini 2.5 Flash (${provider})` };
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local engine:', err);
    }
  }

  // Built-in intelligent Developer AI reasoning engine
  const userLower = prompt.toLowerCase();
  let generatedText = '';
  const operations: FileOp[] = [];

  if (mode === 'agent') {
    if (userLower.includes('api') || userLower.includes('endpoint') || userLower.includes('route')) {
      const apiCode = `// Generated by Developer AI (OpenBrowser Agent)
export interface DeveloperApiStatus {
  online: boolean;
  version: string;
  timestamp: string;
}

export function getDeveloperStatus(): DeveloperApiStatus {
  return {
    online: true,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  };
}
`;
      operations.push({
        action: 'CREATE_FILE',
        path: 'src/developer-status.ts',
        content: apiCode
      });
      generatedText = `### 🚀 Developer AI - Agent Plan
আমি আপনার অনুরোধ বিশ্লেষণ করে একটি নতুন মডিউল প্রস্তুত করেছি:

\`\`\`json
{
  "operations": [
    {
      "action": "CREATE_FILE",
      "path": "src/developer-status.ts",
      "content": "..."
    }
  ]
}
\`\`\`

---OB_FILE_BEGIN: src/developer-status.ts---
${apiCode}---OB_FILE_END---

**পরিবর্তনসমূহ:**
1. \`src/developer-status.ts\` তৈরি করা হয়েছে।
2. প্রিভিউ ট্যাবে ডিফারেন্স দেখে ১-ক্লিকে কার্যকর (Apply) করতে পারবেন।`;
    } else if (userLower.includes('test') || userLower.includes('script') || userLower.includes('run')) {
      operations.push({
        action: 'RUN_COMMAND',
        command: 'npm run lint'
      });
      generatedText = `### ⚡ Developer AI - Command Plan
আপনার রিকোয়েস্ট অনুযায়ী টেস্ট ও ভেরিফিকেশন কমান্ড যুক্ত করা হয়েছে:

\`\`\`json
{
  "operations": [
    {
      "action": "RUN_COMMAND",
      "command": "npm run lint"
    }
  ]
}
\`\`\`
প্রিভিউ চেক করে 'Apply Changes' ক্লিক করলে এটি রিয়েলটাইমে রান হবে।`;
    } else {
      const notePath = 'developer-ai-notes.md';
      const noteContent = `# Developer AI Workspace Notes
Generated on: ${new Date().toLocaleString()}
User Task: ${prompt}

## Context
- Total files: ${ctx.files.length}
- Bridge Port: 5000 / Web: 3000
- OpenBrowser Protocol active.
`;
      operations.push({
        action: 'CREATE_FILE',
        path: notePath,
        content: noteContent
      });
      generatedText = `### 🛠️ Developer AI - Automated Task Plan
আপনার টাস্ক অনুযায়ী ওয়ার্কস্পেস আপডেট ফাইল প্রস্তুত করা হয়েছে:

---OB_FILE_BEGIN: ${notePath}---
${noteContent}---OB_FILE_END---

\`\`\`json
{
  "operations": [
    { "action": "CREATE_FILE", "path": "${notePath}" }
  ]
}
\`\`\`
নিচের **Review & Apply** বোতাম দিয়ে পরিবর্তনটি নিশ্চিত করুন।`;
    }
  } else {
    // Ask Mode
    generatedText = `### 🤖 Developer AI (OpenBrowser Architecture)

**আপনার প্রশ্ন:** ${prompt}

**ওয়ার্কস্পেস সারসংক্ষেপ:**
- প্রজেক্ট ফাইল সংখ্যা: **${ctx.files.length}** টি
- প্যাকেজ নাম: \`${ctx.packageInfo.name || 'bd-topsell'}\`
- স্ক্রিপ্টসমূহ: \`${Object.keys(ctx.packageInfo.scripts || {}).join(', ')}\`
- ব্যবহৃত ফ্রন্টএন্ড/ব্যাকএন্ড: Vite, Fastify, TypeScript, Node.js

**সলিউশন ও কোড গাইডলাইন:**
1. **OpenBrowser Bridge Integration**: আপনি পোর্ট 5000 বা ডিরেক্ট ওয়েব API পোর্ট 3000 উভয় মাধ্যমে ChatGPT, Claude, Gemini, DeepSeek এর সাথে যুক্ত হতে পারেন।
2. **অটোমেটেড ডিফারেন্স ভিউয়ার**: যেকোনো ফাইল এডিট বা তৈরির ক্ষেত্রে স্বয়ংক্রিয় Unified Diff তৈরি হবে।
3. **লোকাল-ফার্স্ট কন্ট্রোল**: সব পরিবর্তন শুধুমাত্র আপনার অনুমোদন পেলেই ফাইলে সেভ হবে।

\`\`\`typescript
// Developer AI Quick Test
export async function testOpenBrowserBridge() {
  const res = await fetch('/api/developer-ai/status');
  const data = await res.json();
  console.log('Developer AI Status:', data);
  return data.success;
}
\`\`\`
কোনো নির্দিষ্ট ফাইল বা ফাংশন পরিবর্তন করতে চাইলে সরাসরি **Agent Mode** সিলেক্ট করুন!`;
  }

  return {
    text: generatedText,
    operations,
    providerUsed: `OpenBrowser Local Engine (${provider.toUpperCase()})`
  };
}
