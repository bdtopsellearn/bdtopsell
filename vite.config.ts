import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import {
  listDirectoryFiles,
  readTextFileContent,
  writeTextFileContent,
  createNewItem,
  deleteFileOrFolder,
  renameFileOrFolder,
  moveOrCopyItem,
  updateFilePermissions,
  extractZipInManager,
  uploadFileDirect,
  deployOrReplaceWebsite,
  rollbackWebsiteDeployment,
  bundleFolderOrFileForDownload,
  loadSiteMetadata,
  getSubscriptionSiteRoot,
  getMimeType,
  resolveSafePath
} from './hosting-file-engine';
import {
  getDomainCatalog,
  createInbox,
  fetchInboxMessages,
  fetchSingleMessage,
  injectTestOtpMessage,
} from './tempmail-engine';
import {
  getWorkspaceContext,
  readFileSafe,
  writeFileSafe,
  planOperations,
  executeOperations,
  getHistory,
  rollbackOperation,
  generateDeveloperAIResponse
} from './developer-ai-engine';
import {
  startHostedBot,
  stopHostedBot,
  getHostedBotStatus,
  clearHostedBotLogs
} from './bot-hosting-engine';
import {
  listProjects,
  getProjectById,
  createAndDeployProject,
  triggerDeploymentPipeline,
  rollbackProject,
  restartProject,
  stopProject,
  deleteProject,
  updateProjectEnvVars,
  updateProjectCustomDomain,
  listDatabases,
  createDatabase,
  restartDatabase,
  stopDatabase,
  deleteDatabase,
  listVPS,
  createVPS,
  deleteVPS,
  vpsAction,
  createVpsSnapshot,
  listBackups,
  createBackup,
  getClusterOverview,
  analyzeProjectFiles,
  getDeploymentLogs,
  executeVpsTerminalCommand
} from './cloud-platform-engine';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  plugins: [
    {
      name: 'mail-shop-proxy-plugin',
      configureServer(server) {
        // TempMailGo Multi-Provider Endpoint Suite
        server.middlewares.use('/api/tempmail/domains', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          try {
            const domains = await getDomainCatalog();
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, domains }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/tempmail/generate', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          try {
            let body: any = {};
            if (req.method === 'POST') {
              const chunks: any[] = [];
              for await (const chunk of req) chunks.push(chunk);
              const str = Buffer.concat(chunks).toString();
              try { body = JSON.parse(str); } catch (_) { body = {}; }
            } else {
              const u = new URL(req.url || '', 'http://localhost');
              body = {
                provider: u.searchParams.get('provider'),
                domain: u.searchParams.get('domain'),
                username: u.searchParams.get('username')
              };
            }

            const mailbox = await createInbox(body);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, ...mailbox }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to generate temp mail' }));
          }
        });

        server.middlewares.use('/api/tempmail/inbox', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          try {
            const u = new URL(req.url || '', 'http://localhost');
            const token = u.searchParams.get('token') || (req.headers['x-mail-token'] as string) || '';
            const address = u.searchParams.get('address') || '';
            if (!token && !address) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Token or address required' }));
              return;
            }

            const messages = await fetchInboxMessages(token, address);
            res.statusCode = 200;
            res.end(JSON.stringify({
              success: true,
              address,
              count: messages.length,
              messages
            }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to fetch inbox' }));
          }
        });

        server.middlewares.use('/api/tempmail/message', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          try {
            const u = new URL(req.url || '', 'http://localhost');
            const token = u.searchParams.get('token') || (req.headers['x-mail-token'] as string) || '';
            const id = u.searchParams.get('id') || '';
            if (!id) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Message ID required' }));
              return;
            }

            const message = await fetchSingleMessage(token, id);
            if (!message) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, error: 'Message not found' }));
              return;
            }

            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, message }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to fetch message' }));
          }
        });

        server.middlewares.use('/api/tempmail/test-send', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.statusCode = 200;
          res.end(JSON.stringify({
            success: false,
            error: 'ডেমো ওটিপি স্থায়ীভাবে বন্ধ করা হয়েছে। শুধুমাত্র আসল ইনকামিং ওটিপি সমর্থিত।'
          }));
        });

        // Universal proxy for external APIs
        server.middlewares.use('/api/dongvan-proxy', async (req, res) => {
          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const targetUrl = urlObj.searchParams.get('url');
            if (!targetUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing target url parameter' }));
              return;
            }
            const fetchRes = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json, text/plain, */*'
              }
            });
            const text = await fetchRes.text();
            res.statusCode = fetchRes.status;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(text);
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message || 'Proxy fetch failed' }));
          }
        });

        // Direct Microsoft Live / Graph API inbox fetcher
        server.middlewares.use('/api/ms-mail-inbox', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          try {
            let bodyData: any = {};
            if (req.method === 'POST') {
              const chunks: any[] = [];
              for await (const chunk of req) chunks.push(chunk);
              const bodyStr = Buffer.concat(chunks).toString();
              try { bodyData = JSON.parse(bodyStr); } catch (e) { bodyData = {}; }
            } else {
              const urlObj = new URL(req.url || '', 'http://localhost');
              bodyData = {
                refreshToken: urlObj.searchParams.get('refreshToken'),
                clientId: urlObj.searchParams.get('clientId'),
                email: urlObj.searchParams.get('email')
              };
            }

            const refreshToken = bodyData.refreshToken;
            const requestedClientId = bodyData.clientId;

            if (!refreshToken) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'No refresh token provided' }));
              return;
            }

            // Client ID candidate list to handle different Microsoft App credentials
            const clientCandidateIds = Array.from(new Set([
              requestedClientId,
              '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
              '00000000402BD666',
              'd35fe4ca-3b11-4726-a9e6-0a70142b08a9',
              '000000004C12AE6F'
            ])).filter(Boolean) as string[];

            let accessToken = '';
            let tokenError = '';

            // Step 1: Attempt token exchange across client_id candidates
            for (const cid of clientCandidateIds) {
              try {
                const tokenRes = await fetch('https://login.live.com/oauth20_token.srf', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    client_id: cid,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    scope: 'https://graph.microsoft.com/mail.read wl.offline_access'
                  })
                });

                const tokenData: any = await tokenRes.json();
                if (tokenData && tokenData.access_token) {
                  accessToken = tokenData.access_token;
                  break;
                } else {
                  tokenError = tokenData.error_description || tokenData.error || 'Invalid token response';
                }
              } catch (err: any) {
                tokenError = err.message || 'OAuth network error';
              }
            }

            if (!accessToken) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                source: 'microsoft_oauth',
                error: tokenError || 'Failed to exchange Microsoft refresh token with candidate Client IDs'
              }));
              return;
            }

            // Step 2: Parallel fetch from Inbox AND Junk/Spam folders
            const fetchFolderMessages = async (folderEndpoint: string, folderTag: string) => {
              try {
                const res = await fetch(folderEndpoint, {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json'
                  }
                });
                if (!res.ok) return [];
                const data: any = await res.json();
                return (data.value || []).map((m: any) => ({
                  id: m.id,
                  subject: m.subject || '(No Subject)',
                  from: m.from?.emailAddress?.address || m.from?.emailAddress?.name || 'Unknown',
                  fromName: m.from?.emailAddress?.name || '',
                  date: m.receivedDateTime ? new Date(m.receivedDateTime).toLocaleString() : '',
                  folder: folderTag,
                  body: m.bodyPreview || (m.body?.content ? m.body.content.replace(/<[^>]*>?/gm, '') : '')
                }));
              } catch (e) {
                return [];
              }
            };

            const [inboxMsgs, junkMsgs] = await Promise.all([
              fetchFolderMessages('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=20&$orderby=receivedDateTime%20desc', 'INBOX'),
              fetchFolderMessages('https://graph.microsoft.com/v1.0/me/mailFolders/junkemail/messages?$top=20&$orderby=receivedDateTime%20desc', 'SPAM/JUNK')
            ]);

            // Combine and deduplicate
            const allFetched = [...inboxMsgs, ...junkMsgs];
            const seenIds = new Set<string>();
            const uniqueMessages = allFetched.filter(m => {
              if (seenIds.has(m.id)) return false;
              seenIds.add(m.id);
              return true;
            });

            // Sort by date descending
            uniqueMessages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            res.statusCode = 200;
            res.end(JSON.stringify({
              success: true,
              source: 'graph_api',
              count: uniqueMessages.length,
              messages: uniqueMessages
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: err.message || 'Internal server error' }));
          }
        });

        // ══════════════════════════════════════════════════════════════════
        // DEVELOPER AI (OpenBrowser Architecture) API Suite
        // ══════════════════════════════════════════════════════════════════

        // Helper to parse JSON body
        const parseJsonBody = async (req: any) => {
          const chunks: any[] = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            return JSON.parse(raw);
          } catch (_) {
            return {};
          }
        };

        // 1. Status & Bridge Diagnostics
        server.middlewares.use('/api/developer-ai/status', async (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          try {
            const ctx = getWorkspaceContext();
            res.statusCode = 200;
            res.end(JSON.stringify({
              success: true,
              version: '1.0.0',
              engine: 'OpenBrowser-CLI-Bridge',
              bridgePort: 5000,
              webPort: 3000,
              hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
              totalFiles: ctx.files.length,
              sampleFiles: ctx.files.slice(0, 10),
              providers: ['chatgpt', 'claude', 'gemini', 'deepseek', 'perplexity', 'grok', 'glm', 'ollama'],
              modes: ['ask', 'agent'],
              status: 'running'
            }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 2. Workspace Context & File Tree
        server.middlewares.use('/api/developer-ai/context', async (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          try {
            const ctx = getWorkspaceContext();
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, ...ctx }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 3. File Read Safe
        server.middlewares.use('/api/developer-ai/file-read', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            let filePath = '';
            if (req.method === 'POST') {
              const body = await parseJsonBody(req);
              filePath = body.path || '';
            } else {
              const u = new URL(req.url || '', 'http://localhost');
              filePath = u.searchParams.get('path') || '';
            }

            if (!filePath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Path is required' }));
              return;
            }

            const data = readFileSafe(filePath);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, path: filePath, ...data }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 4. File Write Safe
        server.middlewares.use('/api/developer-ai/file-write', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            if (!body.path) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'File path required' }));
              return;
            }

            const result = writeFileSafe(body.path, body.content ?? '');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, path: body.path, ...result }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 5. Operations Preview (Diff Engine)
        server.middlewares.use('/api/developer-ai/operations/preview', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const ops = Array.isArray(body.operations) ? body.operations : [];
            const plans = await planOperations(ops);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, plans }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 6. Operations Apply (Workspace Committer)
        server.middlewares.use('/api/developer-ai/operations/apply', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const ops = Array.isArray(body.operations) ? body.operations : [];
            const convId = body.conversationId || 'web-' + Date.now();
            const result = await executeOperations(ops, convId);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 7. Developer AI Chat & Completion Engine (Ask / Agent)
        server.middlewares.use('/api/developer-ai/chat', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const prompt = body.prompt || '';
            const mode = body.mode === 'agent' ? 'agent' : 'ask';
            const provider = body.provider || 'chatgpt';
            const contextFiles = Array.isArray(body.contextFiles) ? body.contextFiles : [];

            if (!prompt.trim()) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Prompt is required' }));
              return;
            }

            const output = await generateDeveloperAIResponse({
              prompt,
              mode,
              provider,
              contextFiles
            });

            // If in agent mode and operations were generated, compute live diff preview immediately
            let previewPlans: any[] = [];
            if (output.operations && output.operations.length > 0) {
              previewPlans = await planOperations(output.operations);
            }

            res.statusCode = 200;
            res.end(JSON.stringify({
              success: true,
              mode,
              provider: output.providerUsed,
              text: output.text,
              operations: output.operations,
              previewPlans
            }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 8. History & Rollback Logs
        server.middlewares.use('/api/developer-ai/history', async (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          try {
            const history = getHistory();
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, history }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 9. Rollback File
        server.middlewares.use('/api/developer-ai/rollback', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            if (!body.historyId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'History ID required' }));
              return;
            }
            const result = rollbackOperation(body.historyId, body.path);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // 10. Extension Info & Metadata
        server.middlewares.use('/api/developer-ai/extension/info', async (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.statusCode = 200;
          res.end(JSON.stringify({
            name: 'OpenBrowser Chrome Extension',
            version: '0.1.0',
            bridgeDefaultUrl: 'http://127.0.0.1:5000',
            manifestLocation: '/OpenBrowser-main/browser-extension/manifest.json',
            providers: ['ChatGPT', 'Claude', 'Gemini', 'DeepSeek', 'Perplexity', 'GLM', 'Grok', 'Qwen'],
            instructions: 'Chrome -> chrome://extensions -> Developer Mode ON -> Load Unpacked -> select /OpenBrowser-main/browser-extension'
          }));
        });

        // 11. BD Hosting Real Bot Deployment & Runtime Endpoints
        server.middlewares.use('/api/bdhosting/bot-start', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          try {
            const body = await parseJsonBody(req);
            const orderId = body.orderId || 'bot_' + Date.now();
            const result = await startHostedBot({
              orderId,
              projectName: body.projectName,
              mainFile: body.mainFile,
              fileName: body.fileName,
              fileData: body.fileData,
              filesList: body.filesList,
              pkgCommands: body.pkgCommands,
              botTokenEnv: body.botTokenEnv
            });

            res.statusCode = 200;
            res.end(JSON.stringify({
              ...result,
              orderId,
              serverIp: '103.145.2.18:8080'
            }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Bot runner failed' }));
          }
        });

        server.middlewares.use('/api/bdhosting/bot-logs', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const orderId = urlObj.searchParams.get('orderId') || '';
            const afterIndex = parseInt(urlObj.searchParams.get('after') || '0', 10);

            const status = getHostedBotStatus(orderId, afterIndex);
            res.statusCode = 200;
            res.end(JSON.stringify(status));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/bdhosting/bot-stop', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          try {
            const body = await parseJsonBody(req);
            const orderId = body.orderId || '';
            const result = stopHostedBot(orderId);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/bdhosting/bot-restart', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          try {
            const body = await parseJsonBody(req);
            const orderId = body.orderId || '';
            const result = await startHostedBot({
              orderId,
              projectName: body.projectName,
              mainFile: body.mainFile,
              fileName: body.fileName,
              fileData: body.fileData,
              filesList: body.filesList,
              pkgCommands: body.pkgCommands,
              botTokenEnv: body.botTokenEnv
            });
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // ════════════════════════════════════════════════════════════════════
        //  BD TOPSELL CLOUD PLATFORM - REST API MIDDLEWARES
        // ════════════════════════════════════════════════════════════════════

        server.middlewares.use('/api/cloud/overview', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
          try {
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, data: getClusterOverview() }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/projects', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            if (req.method === 'POST') {
              const body = await parseJsonBody(req);
              const project = await createAndDeployProject(body);
              res.statusCode = 201;
              res.end(JSON.stringify({ success: true, project }));
            } else {
              const projects = listProjects();
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, projects }));
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/project-action', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { id, action, version } = body;
            const project = getProjectById(id);
            if (!project) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, error: 'Project not found' }));
              return;
            }

            if (action === 'restart') {
              const updated = restartProject(id);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, project: updated }));
            } else if (action === 'stop') {
              const updated = stopProject(id);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, project: updated }));
            } else if (action === 'redeploy') {
              const dep = triggerDeploymentPipeline(project, 'Manual Redeployment Triggered');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, deployment: dep, project }));
            } else if (action === 'rollback') {
              const dep = rollbackProject(project, version);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, deployment: dep, project }));
            } else if (action === 'delete') {
              deleteProject(id);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: 'Project removed' }));
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Unknown action' }));
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/project-env', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const updated = updateProjectEnvVars(body.id, body.envVars || {});
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, project: updated }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/project-domain', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const updated = updateProjectCustomDomain(body.id, body.customDomain || '');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, project: updated }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/databases', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            if (req.method === 'POST') {
              const body = await parseJsonBody(req);
              const db = createDatabase(body);
              res.statusCode = 201;
              res.end(JSON.stringify({ success: true, database: db }));
            } else {
              const databases = listDatabases();
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, databases }));
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/database-action', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { id, action } = body;
            if (action === 'restart') {
              const db = restartDatabase(id);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, database: db }));
            } else if (action === 'stop') {
              const db = stopDatabase(id);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, database: db }));
            } else if (action === 'delete') {
              deleteDatabase(id);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Unknown action' }));
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/vps', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            if (req.method === 'POST') {
              const body = await parseJsonBody(req);
              const { id, action, snapshotName } = body;
              if (action === 'snapshot' && id) {
                const updated = createVpsSnapshot(id, snapshotName);
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, vps: updated }));
              } else if (id && action) {
                const updated = vpsAction(id, action);
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, vps: updated }));
              } else if (body.name) {
                const newVps = createVPS(body);
                res.statusCode = 201;
                res.end(JSON.stringify({ success: true, vps: newVps }));
              } else {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'Missing parameters' }));
              }
            } else {
              const list = listVPS();
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, vpsList: list }));
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/backups', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            if (req.method === 'POST') {
              const body = await parseJsonBody(req);
              const bk = createBackup(body.targetType, body.targetId, body.name);
              res.statusCode = 201;
              res.end(JSON.stringify({ success: true, backup: bk }));
            } else {
              const list = listBackups();
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, backups: list }));
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/deploy', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const project = await createAndDeployProject({
              name: body.name,
              sourceType: body.sourceType,
              sourceUrl: body.gitUrl || body.sourceUrl,
              branch: body.branch,
              dockerImage: body.dockerImage,
              fileBase64: body.fileContentBase64 || body.fileBase64,
              fileName: body.fileName,
              customDomain: body.customDomain,
              runtime: body.runtime,
              framework: body.framework,
              buildCommand: body.buildCommand,
              startCommand: body.startCommand,
              port: body.port ? parseInt(body.port, 10) : undefined,
              envVars: body.envVars
            });
            res.statusCode = 201;
            res.end(JSON.stringify({ success: true, project, deployment: project.deployments[0] }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/vps-action', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { id, action } = body;
            const updated = vpsAction(id, action);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, vps: updated }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/vps-snapshot', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { id, name } = body;
            const updated = createVpsSnapshot(id, name);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, vps: updated }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/analyze', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const result = analyzeProjectFiles(body.files || [], body.packageJson);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, result }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/logs-stream', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const projectId = urlObj.searchParams.get('projectId') || '';
            const deploymentId = urlObj.searchParams.get('deploymentId') || undefined;

            if (!projectId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Project ID required' }));
              return;
            }

            const data = getDeploymentLogs(projectId, deploymentId);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, ...data }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        server.middlewares.use('/api/cloud/vps-terminal', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const cmd = body.command || '';
            const output = executeVpsTerminalCommand(cmd);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, output }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });

        // ════════════════════════════════════════════════════════════════════
        //  BD HOSTING - WEBSITE FILE MANAGEMENT & DEPLOYMENT API SUITE
        // ════════════════════════════════════════════════════════════════════

        // 1. List Files & Folders
        server.middlewares.use('/api/hosting-files/list', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const subscriptionId = urlObj.searchParams.get('subscriptionId') || '';
            const dir = urlObj.searchParams.get('dir') || '';

            if (!subscriptionId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID is required' }));
              return;
            }

            const data = listDirectoryFiles(subscriptionId, dir);
            const siteMeta = loadSiteMetadata(subscriptionId);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, ...data, siteMeta }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to list files' }));
          }
        });

        // 2. Read Text/Code File
        server.middlewares.use('/api/hosting-files/read', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const subscriptionId = urlObj.searchParams.get('subscriptionId') || '';
            const filePath = urlObj.searchParams.get('filePath') || '';

            if (!subscriptionId || !filePath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID and file path are required' }));
              return;
            }

            const fileData = readTextFileContent(subscriptionId, filePath);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, ...fileData }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to read file' }));
          }
        });

        // 3. Save Text/Code File
        server.middlewares.use('/api/hosting-files/save', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, filePath, content } = body;

            if (!subscriptionId || !filePath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID and filePath required' }));
              return;
            }

            const result = writeTextFileContent(subscriptionId, filePath, content ?? '');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, ...result }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to save file' }));
          }
        });

        // 4. Create New File or Folder
        server.middlewares.use('/api/hosting-files/create', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, dir = '', name, type = 'file' } = body;

            if (!subscriptionId || !name) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID and name are required' }));
              return;
            }

            const result = createNewItem(subscriptionId, dir, name, type);
            res.statusCode = 201;
            res.end(JSON.stringify({ success: true, ...result }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to create item' }));
          }
        });

        // 5. Delete File or Folder
        server.middlewares.use('/api/hosting-files/delete', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, path: itemPath } = body;

            if (!subscriptionId || !itemPath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID and path required' }));
              return;
            }

            const result = deleteFileOrFolder(subscriptionId, itemPath);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to delete item' }));
          }
        });

        // 6. Rename File or Folder
        server.middlewares.use('/api/hosting-files/rename', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, path: itemPath, newName } = body;

            if (!subscriptionId || !itemPath || !newName) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID, path, and newName required' }));
              return;
            }

            const result = renameFileOrFolder(subscriptionId, itemPath, newName);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to rename item' }));
          }
        });

        // 7. Move or Copy File/Folder
        server.middlewares.use('/api/hosting-files/move-copy', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, sourcePath, destDir = '', mode = 'move' } = body;

            if (!subscriptionId || !sourcePath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID and sourcePath required' }));
              return;
            }

            const result = moveOrCopyItem(subscriptionId, sourcePath, destDir, mode);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to move/copy item' }));
          }
        });

        // 8. Update File Permissions
        server.middlewares.use('/api/hosting-files/chmod', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, path: itemPath, permissions } = body;

            if (!subscriptionId || !itemPath || !permissions) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Missing subscriptionId, path or permissions' }));
              return;
            }

            const result = updateFilePermissions(subscriptionId, itemPath, permissions);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to chmod item' }));
          }
        });

        // 9. Extract ZIP within File Manager
        server.middlewares.use('/api/hosting-files/extract-zip', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, zipPath, targetDir = '' } = body;

            if (!subscriptionId || !zipPath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID and zipPath required' }));
              return;
            }

            const result = extractZipInManager(subscriptionId, zipPath, targetDir);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to extract ZIP' }));
          }
        });

        // 10. Direct File Upload (Single or Multi File)
        server.middlewares.use('/api/hosting-files/upload', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, dir = '', fileName, fileBase64, files } = body;

            if (!subscriptionId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID required' }));
              return;
            }

            const uploaded: any[] = [];

            // Batch upload support
            if (Array.isArray(files) && files.length > 0) {
              for (const f of files) {
                const b64Data = (f.fileBase64 || '').replace(/^data:.*?;base64,/, '');
                const buf = Buffer.from(b64Data, 'base64');
                const resItem = uploadFileDirect(subscriptionId, dir, f.fileName || 'file.dat', buf);
                uploaded.push(resItem);
              }
            } else if (fileName && fileBase64) {
              const b64Data = fileBase64.replace(/^data:.*?;base64,/, '');
              const buf = Buffer.from(b64Data, 'base64');
              const resItem = uploadFileDirect(subscriptionId, dir, fileName, buf);
              uploaded.push(resItem);
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'No file data provided' }));
              return;
            }

            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, count: uploaded.length, files: uploaded }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Upload failed' }));
          }
        });

        // 11. Download File or Folder as ZIP
        server.middlewares.use('/api/hosting-files/download', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const subscriptionId = urlObj.searchParams.get('subscriptionId') || '';
            const itemPath = urlObj.searchParams.get('path') || '';

            if (!subscriptionId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Subscription ID required' }));
              return;
            }

            const bundle = bundleFolderOrFileForDownload(subscriptionId, itemPath);
            res.setHeader('Content-Type', bundle.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${bundle.fileName}"`);
            res.setHeader('Content-Length', bundle.buffer.length);
            res.statusCode = 200;
            res.end(bundle.buffer);
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: e.message || 'Download failed' }));
          }
        });

        // 12. Deploy or Replace Website (ZIP Upload + Atomic Extraction + Auto Backup)
        server.middlewares.use('/api/hosting-deploy/upload-replace', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, fileName = 'website.zip', fileBase64, projectName, note, isReplace = true } = body;

            if (!subscriptionId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID required' }));
              return;
            }

            if (!fileBase64) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'ZIP file data required in base64 format' }));
              return;
            }

            const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
            const zipBuffer = Buffer.from(cleanBase64, 'base64');

            const result = await deployOrReplaceWebsite({
              subscriptionId,
              zipBuffer,
              fileName,
              projectName,
              note,
              isReplace
            });

            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Deployment failed' }));
          }
        });

        // 13. Deployment History & Status
        server.middlewares.use('/api/hosting-deploy/history', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const subscriptionId = urlObj.searchParams.get('subscriptionId') || '';

            if (!subscriptionId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID required' }));
              return;
            }

            const meta = loadSiteMetadata(subscriptionId);
            res.statusCode = 200;
            res.end(JSON.stringify({
              success: true,
              subscriptionId,
              currentVersion: meta.currentVersion,
              activeDeploymentId: meta.activeDeploymentId,
              lastDeployedAt: meta.lastDeployedAt,
              deployments: meta.deployments,
              siteMeta: meta
            }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Failed to fetch history' }));
          }
        });

        // 14. 1-Click Rollback to Previous Deployment Backup
        server.middlewares.use('/api/hosting-deploy/rollback', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const body = await parseJsonBody(req);
            const { subscriptionId, deploymentId } = body;

            if (!subscriptionId || !deploymentId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID and deployment ID required' }));
              return;
            }

            const result = await rollbackWebsiteDeployment({
              subscriptionId,
              targetDeploymentId: deploymentId
            });

            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Rollback failed' }));
          }
        });

        // 15. Site Overview & Live Status
        server.middlewares.use('/api/hosting-site/status', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const subscriptionId = urlObj.searchParams.get('subscriptionId') || '';

            if (!subscriptionId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Subscription ID required' }));
              return;
            }

            const meta = loadSiteMetadata(subscriptionId);
            const liveUrl = `/sites/${encodeURIComponent(subscriptionId)}/`;

            res.statusCode = 200;
            res.end(JSON.stringify({
              success: true,
              siteMeta: meta,
              liveUrl,
              previewUrl: liveUrl
            }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message || 'Status fetch failed' }));
          }
        });

        // 16. LIVE WEBSITE HTTP SERVER (/sites/:subscriptionId/*)
        server.middlewares.use('/sites', async (req, res, next) => {
          try {
            const rawUrl = req.url || '';
            const parsedUrl = new URL(rawUrl, 'http://localhost');
            const pathname = decodeURIComponent(parsedUrl.pathname);

            // Path pattern: /sites/:subscriptionId or /sites/:subscriptionId/subpath
            const cleanPath = pathname.replace(/^\/+/, '');
            const segments = cleanPath.split('/').filter(Boolean);

            if (segments.length === 0) {
              next();
              return;
            }

            const subscriptionId = segments[0];
            const relativeSubPath = segments.slice(1).join('/');

            let siteRoot: string;
            try {
              siteRoot = getSubscriptionSiteRoot(subscriptionId);
            } catch (err: any) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(`<h3>Website Not Found</h3><p>${err.message}</p>`);
              return;
            }

            let candidatePath = resolveSafePath(subscriptionId, relativeSubPath);

            // Directory resolution (look for index.html / index.htm / index.php)
            if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
              if (fs.existsSync(path.join(candidatePath, 'index.html'))) {
                candidatePath = path.join(candidatePath, 'index.html');
              } else if (fs.existsSync(path.join(candidatePath, 'index.htm'))) {
                candidatePath = path.join(candidatePath, 'index.htm');
              } else if (fs.existsSync(path.join(candidatePath, 'index.php'))) {
                candidatePath = path.join(candidatePath, 'index.php');
              } else {
                // Generate clean file directory listing
                const dirFiles = fs.readdirSync(candidatePath);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                let dirListHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Index of /${relativeSubPath}</title><style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:30px;}a{color:#38bdf8;text-decoration:none;display:block;margin:6px 0;}a:hover{text-decoration:underline;}ul{list-style:none;padding:0;}</style></head><body><h2>📁 Index of /${relativeSubPath}</h2><ul>`;
                dirListHtml += `<li><a href="../">📁 .. (Parent Directory)</a></li>`;
                for (const f of dirFiles) {
                  const isDir = fs.statSync(path.join(candidatePath, f)).isDirectory();
                  dirListHtml += `<li><a href="${encodeURIComponent(f)}${isDir ? '/' : ''}">${isDir ? '📁' : '📄'} ${f}</a></li>`;
                }
                dirListHtml += `</ul></body></html>`;
                res.end(dirListHtml);
                return;
              }
            }

            if (!fs.existsSync(candidatePath)) {
              // Check fallback for SPA / single page apps if html requested
              const rootIndex = path.join(siteRoot, 'index.html');
              if (fs.existsSync(rootIndex) && !path.extname(candidatePath)) {
                candidatePath = rootIndex;
              } else {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>404 Not Found</title><style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;text-align:center;padding:50px;}h1{color:#f43f5e;}</style></head><body><h1>404 - File Not Found</h1><p>The requested URL <code>/${relativeSubPath}</code> was not found on this hosted website.</p><p><a href="/sites/${encodeURIComponent(subscriptionId)}/" style="color:#38bdf8;">Return to Website Root</a></p></body></html>`);
                return;
              }
            }

            const mime = getMimeType(candidatePath);
            res.setHeader('Content-Type', mime);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.statusCode = 200;

            const stream = fs.createReadStream(candidatePath);
            stream.pipe(res);
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<h3>500 Internal Server Error</h3><p>${e.message}</p>`);
          }
        });
      }
    }
  ]
});
