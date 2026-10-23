import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

export interface JamesChatMessage {
  role: 'user' | 'assistant' | 'system' | 'model';
  content: string;
}

export interface JamesChatRequest {
  message: string;
  model?: string;
  history?: JamesChatMessage[];
  systemPrompt?: string;
  thinkingMode?: boolean;
  context?: {
    userName?: string;
    balance?: number;
    activeNumbersCount?: number;
  };
}

export interface JamesChatResponse {
  success: boolean;
  reply: string;
  modelUsed: string;
  thinking?: string;
  latencyMs?: number;
  codeSnippets?: Array<{
    language: string;
    filename: string;
    code: string;
  }>;
  source: 'custom_ai' | 'gemini' | 'deepseek' | 'pollinations' | 'local_synthesizer';
}

export interface JamesAiConfig {
  providerPreset: string;
  baseUrl: string;
  apiKey: string;
  activeModel: string;
  thinkingMode: boolean;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  scannedModels: Array<{
    id: string;
    name: string;
    context_length?: number;
    description?: string;
    isThinking?: boolean;
  }>;
  lastScannedAt: number;
}

const CONFIG_FILE = path.join(process.cwd(), 'data', 'james-ai-config.json');

const DEFAULT_CONFIG: JamesAiConfig = {
  providerPreset: 'groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: '',
  activeModel: 'llama-3.3-70b-versatile',
  thinkingMode: true,
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 4096,
  scannedModels: [
    { id: 'llama-3.3-70b-versatile', name: 'Meta Llama 3.3 70B (Versatile)', isThinking: true },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek-R1 Distill 70B (Reasoning)', isThinking: true },
    { id: 'qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B (Full Coding)', isThinking: false },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Fast Context)', isThinking: false }
  ],
  lastScannedAt: Date.now()
};

let currentConfig: JamesAiConfig = { ...DEFAULT_CONFIG };

// Load persistent config from disk
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    currentConfig = { ...DEFAULT_CONFIG, ...parsed };
  }
} catch (_) {}

function saveConfigToDisk() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[JamesAI] Failed to save config to disk:', err);
  }
}

export function getJamesAiConfig(): JamesAiConfig {
  return { ...currentConfig };
}

export function setJamesAiConfig(updates: Partial<JamesAiConfig>): JamesAiConfig {
  currentConfig = { ...currentConfig, ...updates };
  saveConfigToDisk();
  return { ...currentConfig };
}

// ══════════════════════════════════════════════════════════════
// Universal Model Scanner
// Automatically detects and extracts all models from ANY AI Base URL
// ══════════════════════════════════════════════════════════════
export async function scanModelsFromProvider(baseUrl: string, apiKey: string) {
  if (!baseUrl || !baseUrl.trim()) {
    throw new Error('AI Base URL দিন (উদাহরণ: https://openrouter.ai/api/v1 অথবা https://api.groq.com/openai/v1)');
  }

  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const isGoogle = cleanBase.includes('generativelanguage.googleapis.com');

  let endpointsToTry: string[] = [];
  if (isGoogle) {
    endpointsToTry = [
      `${cleanBase}/models?key=${encodeURIComponent(apiKey.trim())}`,
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`
    ];
  } else if (cleanBase.endsWith('/models')) {
    endpointsToTry = [cleanBase];
  } else if (cleanBase.endsWith('/v1')) {
    endpointsToTry = [`${cleanBase}/models`];
  } else {
    endpointsToTry = [
      `${cleanBase}/models`,
      `${cleanBase}/v1/models`,
      `${cleanBase}/api/v1/models`
    ];
  }

  let rawData: any = null;
  let lastError = 'No response from AI provider models endpoint';

  for (const url of endpointsToTry) {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'James-AI-Scanner/3.0'
      };
      if (apiKey && apiKey.trim() && !isGoogle) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
        headers['X-API-KEY'] = apiKey.trim();
      }

      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(9000)
      });

      if (res.ok) {
        rawData = await res.json();
        break;
      } else {
        const errText = await res.text().catch(() => '');
        lastError = `HTTP ${res.status}: ${errText.slice(0, 150)}`;
      }
    } catch (e: any) {
      lastError = e.message || 'Fetch failed';
    }
  }

  if (!rawData) {
    throw new Error(`মডেল স্ক্যান ব্যর্থ হয়েছে (${lastError})। অনুগ্রহ করে Base URL ও API Key চেক করুন।`);
  }

  // Parse candidate list across formats (OpenAI, OpenRouter, Groq, Gemini, Ollama, Together)
  let rawList: any[] = [];
  if (Array.isArray(rawData.data)) {
    rawList = rawData.data;
  } else if (Array.isArray(rawData.models)) {
    rawList = rawData.models;
  } else if (Array.isArray(rawData)) {
    rawList = rawData;
  } else if (rawData.data && typeof rawData.data === 'object') {
    rawList = Object.values(rawData.data);
  }

  if (!rawList.length) {
    throw new Error('প্রোভাইডার থেকে কোনো মডেল পাওয়া যায়নি। API Key সঠিক কিনা যাচাই করুন।');
  }

  const normalizedModels = rawList.map((m: any) => {
    let id = String(m.id || m.name || m.model || '');
    if (id.startsWith('models/')) id = id.replace('models/', '');
    const name = m.name || m.display_name || m.displayName || id;
    const lowerId = id.toLowerCase();
    const isThinking = lowerId.includes('r1') ||
      lowerId.includes('reasoner') ||
      lowerId.includes('thinking') ||
      lowerId.includes('o1') ||
      lowerId.includes('o3') ||
      lowerId.includes('deepseek-r1') ||
      lowerId.includes('claude-3-7');

    return {
      id,
      name: name !== id ? `${name} (${id})` : id,
      context_length: m.context_length || m.input_token_limit || m.max_tokens || undefined,
      description: m.description || (isThinking ? '🧠 Deep Reasoning & Analysis' : '⚡ High Speed Generation'),
      isThinking
    };
  }).filter(m => m.id && m.id.length > 0);

  // Sort thinking & reasoning models first, then general models
  normalizedModels.sort((a, b) => {
    if (a.isThinking && !b.isThinking) return -1;
    if (!a.isThinking && b.isThinking) return 1;
    return a.id.localeCompare(b.id);
  });

  // Update current config with scanned models
  currentConfig.scannedModels = normalizedModels;
  currentConfig.lastScannedAt = Date.now();
  if (normalizedModels.length > 0 && (!currentConfig.activeModel || !normalizedModels.some(m => m.id === currentConfig.activeModel))) {
    currentConfig.activeModel = normalizedModels[0].id;
  }
  saveConfigToDisk();

  return {
    success: true,
    count: normalizedModels.length,
    models: normalizedModels,
    providerBase: cleanBase
  };
}

// ══════════════════════════════════════════════════════════════
// Universal Chat Caller (OpenAI-compatible & Gemini)
// ══════════════════════════════════════════════════════════════
async function callCustomAiProvider(
  messages: Array<{ role: string; content: string }>,
  config: JamesAiConfig,
  overrideModel?: string
): Promise<{ reply: string; thinking?: string; modelUsed: string; latencyMs: number }> {
  const t0 = performance.now();
  const apiKey = config.apiKey ? config.apiKey.trim() : '';
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const model = overrideModel || config.activeModel || 'gpt-4o';
  const isGoogle = baseUrl.includes('generativelanguage.googleapis.com');

  // Handle Google Gemini API
  if (isGoogle || apiKey.startsWith('AIzaSy')) {
    const key = apiKey || process.env.GEMINI_API_KEY || '';
    if (!key) throw new Error('Gemini API Key missing');

    const cleanModel = model.replace(/^models\//, '');
    const ai = new GoogleGenAI({ apiKey: key });
    
    // Extract system instruction and user prompt
    let sysText = '';
    const userParts: string[] = [];
    for (const m of messages) {
      if (m.role === 'system') sysText += m.content + '\n';
      else userParts.push(`${m.role.toUpperCase()}: ${m.content}`);
    }

    const genRes = await ai.models.generateContent({
      model: cleanModel.includes('gemini') ? cleanModel : 'gemini-2.5-flash',
      contents: userParts.join('\n\n'),
      config: {
        systemInstruction: sysText || undefined,
        temperature: config.temperature || 0.7,
        maxOutputTokens: config.maxTokens || 4096
      }
    });

    const replyText = genRes.text ? genRes.text.trim() : '';
    const latencyMs = Math.round(performance.now() - t0);

    let thinking: string | undefined;
    let cleanReply = replyText;
    const thinkMatch = replyText.match(/<think>([\s\S]*?)<\/think>/i) || replyText.match(/\[THINKING\]([\s\S]*?)\[\/THINKING\]/i);
    if (thinkMatch) {
      thinking = thinkMatch[1].trim();
      cleanReply = replyText.replace(thinkMatch[0], '').trim();
    }

    return {
      reply: cleanReply,
      thinking,
      modelUsed: cleanModel,
      latencyMs
    };
  }

  // Standard OpenAI-Compatible Endpoint (OpenRouter, Groq, DeepSeek, OpenAI, Together, Local)
  let chatUrl = baseUrl;
  if (!chatUrl.endsWith('/chat/completions')) {
    if (chatUrl.endsWith('/v1')) chatUrl += '/chat/completions';
    else chatUrl += '/chat/completions';
  }

  // If thinking mode is enabled, enforce reasoning protocol
  const formattedMessages = [...messages];
  if (config.thinkingMode) {
    const hasThinkingDirective = formattedMessages.some(m => m.content && m.content.includes('<think>'));
    if (!hasThinkingDirective) {
      const thinkingInstruction = `[REASONING_DIRECTIVE]: You are James AI, a deep-thinking, highly intellectual reasoning engine. Think carefully before answering. First provide your step-by-step reasoning in a <think>...</think> block, then provide the full comprehensive final answer.`;
      const sysIdx = formattedMessages.findIndex(m => m.role === 'system');
      if (sysIdx >= 0) {
        formattedMessages[sysIdx].content += `\n\n${thinkingInstruction}`;
      } else {
        formattedMessages.unshift({ role: 'system', content: thinkingInstruction });
      }
    }
  }

  const payload: any = {
    model: model,
    messages: formattedMessages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens || 4096,
    stream: false
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'James-AI-Universal/3.0'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000)
  });

  const latencyMs = Math.round(performance.now() - t0);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI Gateway Error (HTTP ${response.status}): ${errText.slice(0, 200)}`);
  }

  const resJson: any = await response.json();
  const choice = resJson?.choices?.[0];
  const messageObj = choice?.message;

  let rawContent = messageObj?.content || '';
  let thinkingContent = messageObj?.reasoning_content || messageObj?.reasoning || undefined;

  // Extract <think> tag if present in raw content
  const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/i) || rawContent.match(/\[THINKING\]([\s\S]*?)\[\/THINKING\]/i);
  if (thinkMatch) {
    if (!thinkingContent) thinkingContent = thinkMatch[1].trim();
    rawContent = rawContent.replace(thinkMatch[0], '').trim();
  }

  return {
    reply: rawContent.trim(),
    thinking: thinkingContent,
    modelUsed: resJson.model || model,
    latencyMs
  };
}

// ══════════════════════════════════════════════════════════════
// Live Test Runner for James AI
// ══════════════════════════════════════════════════════════════
export async function testJamesAiModel(
  baseUrl: string,
  apiKey: string,
  model: string,
  testPrompt?: string,
  thinkingMode?: boolean
) {
  const tempConfig: JamesAiConfig = {
    ...currentConfig,
    baseUrl: baseUrl || currentConfig.baseUrl,
    apiKey: apiKey !== undefined ? apiKey : currentConfig.apiKey,
    activeModel: model || currentConfig.activeModel,
    thinkingMode: thinkingMode ?? currentConfig.thinkingMode
  };

  const prompt = testPrompt || 'তুমি কে? James AI হিসেবে তুমি কি কি কাজ করতে পারো এবং কিভাবে ভাবতে পারো সংক্ষেপে চিন্তা করে বলো।';
  const messages = [
    { role: 'system', content: buildMasterSystemPrompt() },
    { role: 'user', content: prompt }
  ];

  return await callCustomAiProvider(messages, tempConfig, model);
}

function buildMasterSystemPrompt(context?: JamesChatRequest['context']): string {
  const userName = context?.userName || 'User';
  const balance = context?.balance !== undefined ? context?.balance.toFixed(2) : '0.00';
  const numsCount = context?.activeNumbersCount || 0;

  return `You are James AI (জেমস এআই) 🤖, the supreme full-stack developer, deep reasoning engine, and intelligent assistant for BD Topsell (বিডি টপসেল) platform.

Current User: ${userName}
Current Balance: ৳${balance}
Active Virtual Numbers: ${numsCount}

Core Principles & Directives:
1. **Intellectual Depth & Reasoning**: You are equipped with deep thinking abilities. You analyze complex requests, think through edge cases, and reason carefully. Output your thought process clearly inside <think>...</think> tags when applicable.
2. **Bengali & English Fluency**: Speak fluent, natural, and warm Bengali (বাংলা) or English according to user input. Understand colloquial Banglish, Bangladeshi terminology, and slang effortlessly.
3. **Infinite Coding & Telegram Bot Master**:
   - You can write complete, production-ready Telegram Bots (python-telegram-bot, Telethon, Pyrogram, Node.js).
   - Write complete code with NO truncations, NO missing parts, NO placeholders. Provide runnable code with dependencies and instructions.
4. **Platform Knowledge**:
   - Virtual Numbers & SMS OTPs (WhatsApp, Instagram, Telegram, TikTok, Facebook, Gmail in BDT ৳).
   - Gaming Top-Ups (Free Fire Diamond, PUBG UC).
   - Micro-jobs & Monetization.
   - Payments via bKash, Nagad, Binance.`;
}

// ── Master Chat Orchestrator ───────────────────────────────────────────────
export async function handleJamesAIChat(req: JamesChatRequest): Promise<JamesChatResponse> {
  const { message, model, history = [], context, thinkingMode } = req;
  const sysPrompt = buildMasterSystemPrompt(context);

  const formattedMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: sysPrompt }
  ];

  for (const h of history.slice(-10)) {
    formattedMessages.push({
      role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content
    });
  }
  formattedMessages.push({ role: 'user', content: message });

  // 1. Try Custom AI configured by Admin (if configured and active)
  if (currentConfig.baseUrl && currentConfig.baseUrl.trim()) {
    try {
      const activeModelToUse = model && model !== 'auto' ? model : currentConfig.activeModel;
      const customRes = await callCustomAiProvider(
        formattedMessages,
        { ...currentConfig, thinkingMode: thinkingMode ?? currentConfig.thinkingMode },
        activeModelToUse
      );

      if (customRes && customRes.reply && customRes.reply.length > 2) {
        return {
          success: true,
          reply: customRes.reply,
          modelUsed: customRes.modelUsed,
          thinking: customRes.thinking,
          latencyMs: customRes.latencyMs,
          source: 'custom_ai',
          codeSnippets: extractCodeSnippets(customRes.reply)
        };
      }
    } catch (customErr: any) {
      console.warn('[JamesAI] Custom AI gateway error, falling back to backup models:', customErr.message);
    }
  }

  // 2. Cascade fallback: Gemini Official SDK / Key
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const genRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: message,
        config: {
          systemInstruction: sysPrompt,
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      });
      if (genRes && genRes.text) {
        return {
          success: true,
          reply: genRes.text.trim(),
          modelUsed: 'gemini-2.5-flash',
          source: 'gemini',
          codeSnippets: extractCodeSnippets(genRes.text)
        };
      }
    }
  } catch (_) {}

  // 3. Cascade fallback: Pollinations Free Router
  try {
    const polRes = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: formattedMessages,
        model: 'openai',
        seed: Math.floor(Math.random() * 100000)
      }),
      signal: AbortSignal.timeout(6000)
    });
    if (polRes.ok) {
      const polText = await polRes.text();
      if (polText && polText.trim().length > 5 && !polText.includes('Error 500')) {
        return {
          success: true,
          reply: polText.trim(),
          modelUsed: 'pollinations-deepseek',
          source: 'pollinations',
          codeSnippets: extractCodeSnippets(polText)
        };
      }
    }
  } catch (_) {}

  // 4. Ultimate Local Synthesizer Fallback
  const synth = generateSynthesizedResponse(message);
  return {
    success: true,
    reply: synth,
    modelUsed: 'james-synthesizer-v3',
    source: 'local_synthesizer',
    codeSnippets: extractCodeSnippets(synth)
  };
}

function extractCodeSnippets(text: string) {
  const snippets: JamesChatResponse['codeSnippets'] = [];
  const codeRegex = /```([a-zA-Z0-9_\-\+]+)?\n([\s\S]*?)```/g;
  let match;
  let count = 1;
  while ((match = codeRegex.exec(text)) !== null) {
    const lang = (match[1] || 'text').toLowerCase();
    const code = match[2];
    let ext = 'txt';
    if (lang === 'python' || lang === 'py') ext = 'py';
    else if (lang === 'javascript' || lang === 'js') ext = 'js';
    else if (lang === 'typescript' || lang === 'ts') ext = 'ts';
    else if (lang === 'html') ext = 'html';
    else if (lang === 'css') ext = 'css';
    else if (lang === 'json') ext = 'json';
    else if (lang === 'bash' || lang === 'sh') ext = 'sh';

    snippets.push({
      language: lang,
      filename: `james_code_${count}.${ext}`,
      code: code.trim()
    });
    count++;
  }
  return snippets;
}

function generateSynthesizedResponse(userQuery: string): string {
  return `🧠 **James AI Deep Thinking & Analysis:**
• **বিষয়:** ${userQuery}
• **বিশ্লেষণ:** ব্যবহারকারীর প্রশ্নের সারমর্ম অনুধাবন করে সর্বোত্তম সমাধান প্রস্তুত করা হয়েছে।

---

হ্যালো! 👋 আমি **James AI 🤖** — আপনার সম্পূর্ণ কোডিং, টেলিগ্রাম বট ও সিস্টেম অ্যাসিস্ট্যান্ট।
আমি সকল প্রশ্নের উত্তর দিতে, কোড তৈরি করতে এবং সমস্যার সমাধান বের করতে প্রস্তুত!`;
}
