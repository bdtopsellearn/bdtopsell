import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'storage');
const DB_FILE = path.join(DATA_DIR, 'ff_topup_db.json');
const KEY_FILE = path.join(DATA_DIR, '.ff_master.key');

const DUPLICATE_WINDOW_MS = 10_000;
const SPIKE_RATIO = 2;

export type ProviderType = 'EPINBY' | 'SMM_GENERIC';
export type MarkupType = 'PERCENT' | 'FIXED';
export type FfOrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

export interface FfProvider {
  id: string;
  name: string;
  providerType: ProviderType;
  baseUrl: string;
  apiKeyEnc: string;
  apiSecretEnc: string;
  currency: string;
  isActive: boolean;
  lastBalance?: string;
  lastCheckedAt?: string;
  createdAt: string;
}

export interface FfCatalogPkg {
  id: string;
  gameId: string;
  catId: string;
  name: string;
  diamondAmount: string;
  price: number;
  costPrice: number | null;
  srcCost: number | null;
  autoPrice: boolean;
  markupType: MarkupType | null;
  markupValue: number | null;
  apiProviderId: string | null;
  apiServiceId: string | null;
  srcGameId: number | null;
  srcCategoryId: number | null;
  hot: boolean;
  enabled: boolean;
  updatedAt: string;
}

export interface FfServerOrder {
  id: string;
  orderCode: string;
  firestoreOrderId?: string;
  userId: string;
  userName: string;
  gameId: string;
  gameName: string;
  pkgId: string;
  pkgName: string;
  quantity: number;
  unitPrice: number;
  pricePaid: number;
  costBdt: number;
  playerId: string;
  playerNickname?: string;
  status: FfOrderStatus;
  deliveryNote?: string;
  apiProviderId?: string | null;
  apiServiceId?: string | null;
  apiOrderId?: string | null;
  apiStatus?: string | null;
  lastApiSync?: string | null;
  needsReview: boolean;
  adminAlerted: boolean;
  refundRequired: boolean;
  refundApplied: boolean;
  createdAt: string;
  deliveredAt?: string | null;
}

export interface FfPaymentMethod {
  id: string;
  methodName: string;
  accountNumber: string;
  accountType: string;
  instructions: string;
  isActive: boolean;
  createdAt: string;
}

export interface FfAutoDeposit {
  id: string;
  userId: string;
  userName: string;
  transactionId: string;
  amount: number;
  paymentMethod: string;
  status: string;
  walletCredited: boolean;
  createdAt: string;
}

export interface FfPaymentIntent {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  gatewayTxnId: string | null;
  paymentUrl: string;
  status: 'CREATED' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  createdAt: string;
}

export interface FfActivityLog {
  id: string;
  actor: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface FfSyncReport {
  ranAt: string;
  checked: number;
  priceChanges: string[];
  deactivated: string[];
  warnings: string[];
  updatedPackages: Array<{
    id: string;
    name: string;
    price: number;
    srcCost: number | null;
    costPrice: number | null;
    enabled: boolean;
  }>;
}

interface FfTopupDb {
  providers: FfProvider[];
  rates: Record<string, number>;
  catalog: Record<string, FfCatalogPkg>;
  orders: FfServerOrder[];
  userLastUid: Record<string, string>;
  paymentMethods: FfPaymentMethod[];
  autoDeposits: FfAutoDeposit[];
  paymentIntents: FfPaymentIntent[];
  logs: FfActivityLog[];
  mraipay: {
    enabled: boolean;
    apiKeyEnc: string;
    secretKeyEnc: string;
    brandKeyEnc: string;
  };
  settings: {
    serverLabel: string;
    orderStuckMinutes: number;
    referralMinDeposit: number;
    referralBonusAmount: number;
    autoSyncEnabled: boolean;
    autoPriceSyncEnabled: boolean;
    uidCheckRequired: boolean;
    noticeText: string;
  };
  lastPriceSync: FfSyncReport | null;
}

// ── Encryption Helpers (AES-256-GCM) ─────────────────────────────────────────
function ensureStorageDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getMasterKey(): Buffer {
  const envSecret = process.env.FF_SECRET_KEY || process.env.SECRET_KEY || '';
  if (envSecret && envSecret.length >= 16) {
    return crypto.createHash('sha256').update(envSecret).digest();
  }
  ensureStorageDir();
  if (fs.existsSync(KEY_FILE)) {
    const raw = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (raw.length >= 32) {
      return crypto.createHash('sha256').update(raw).digest();
    }
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_FILE, generated, { mode: 0o600 });
  return crypto.createHash('sha256').update(generated).digest();
}

function encryptSecret(plain: string): string {
  const clean = (plain || '').trim();
  if (!clean) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptSecret(token: string): string {
  const clean = (token || '').trim();
  if (!clean) return '';
  if (!clean.startsWith('v1:')) return clean;
  try {
    const parts = clean.split(':');
    if (parts.length !== 4) return '';
    const key = getMasterKey();
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const enc = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(plainOrEnc: string): string {
  const plain = plainOrEnc.startsWith('v1:') ? decryptSecret(plainOrEnc) : plainOrEnc;
  if (!plain) return '—';
  if (plain.length <= 6) return '••••••';
  return `${plain.slice(0, 3)}••••${plain.slice(-3)}`;
}

// ── Text / Number / Security Helpers ─────────────────────────────────────────
const BN_TO_EN: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

export function translateBnDigits(input: string): string {
  return String(input || '').replace(/[০-৯]/g, (ch) => BN_TO_EN[ch] ?? ch);
}

export function parseUid(text: unknown): string | null {
  if (text == null) return null;
  const cleaned = translateBnDigits(String(text)).trim();
  return /^[0-9]{6,14}$/.test(cleaned) ? cleaned : null;
}

export function normalizeTxnId(text: unknown): string | null {
  if (text == null) return null;
  const cleaned = String(text).replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9_\-]{4,128}$/.test(cleaned) ? cleaned : null;
}

export function parseMarkup(text: unknown): { type: MarkupType; value: number } | null {
  if (text == null) return null;
  const cleaned = translateBnDigits(String(text)).trim().replace(/,/g, '');
  const m = cleaned.match(/^(?:৳|tk\.?|bdt)?\s*(\d+(?:\.\d+)?)\s*(%|tk\.?|bdt|taka|টাকা)?$/i);
  if (!m) return null;
  const val = Number(m[1]);
  if (!Number.isFinite(val) || val < 0) return null;
  if (m[2] === '%') {
    return val <= 1000 ? { type: 'PERCENT', value: val } : null;
  }
  return val <= 1_000_000 ? { type: 'FIXED', value: val } : null;
}

export function computeSellPrice(cost: number, rate: number, markupType: MarkupType, markupValue: number): number {
  const base = Number(cost) * Number(rate);
  const price = markupType === 'PERCENT' ? base * (1 + markupValue / 100) : base + markupValue;
  return Math.max(1, Math.ceil(price - 1e-9));
}

export function extractAmountLabel(name: string): string {
  const m = String(name || '').match(/\d[\d,]*/);
  return (m ? m[0].replace(/,/g, '') : name).slice(0, 32);
}

function genOrderCode(): string {
  return 'FF-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function validateProviderUrl(raw: string): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid Base URL format');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Provider URL must use https:// or http://');
  }
  if (isPrivateOrBlockedHost(parsed.hostname)) {
    throw new Error('Private or localhost provider URLs are blocked');
  }
  return trimmed;
}

// ── Persistence ──────────────────────────────────────────────────────────────
function defaultDb(): FfTopupDb {
  return {
    providers: [],
    rates: { USD: 125, BDT: 1 },
    catalog: {},
    orders: [],
    userLastUid: {},
    paymentMethods: [
      {
        id: 'pm_bkash_default',
        methodName: 'bKash',
        accountNumber: '01XXXXXXXXX',
        accountType: 'Personal (Send Money)',
        instructions: 'Send Money করে নিচে Transaction ID (TrxID) ও সেন্ডার নম্বর দিন।',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pm_nagad_default',
        methodName: 'Nagad',
        accountNumber: '01XXXXXXXXX',
        accountType: 'Personal (Send Money)',
        instructions: 'Send Money করে নিচে Transaction ID (TrxID) ও সেন্ডার নম্বর দিন।',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
    autoDeposits: [],
    paymentIntents: [],
    logs: [],
    mraipay: {
      enabled: false,
      apiKeyEnc: '',
      secretKeyEnc: '',
      brandKeyEnc: '',
    },
    settings: {
      serverLabel: 'Bangladesh (BD) Server',
      orderStuckMinutes: 30,
      referralMinDeposit: 50,
      referralBonusAmount: 20,
      autoSyncEnabled: true,
      autoPriceSyncEnabled: true,
      uidCheckRequired: false,
      noticeText: '🇧🇩 শুধুমাত্র Bangladesh (BD) Server UID-তে ডায়মন্ড টপ-আপ ডেলিভারি করা হয়।',
    },
    lastPriceSync: null,
  };
}

let dbCache: FfTopupDb | null = null;

function loadDb(): FfTopupDb {
  if (dbCache) return dbCache;
  ensureStorageDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const def = defaultDb();
      dbCache = {
        ...def,
        ...raw,
        rates: { ...def.rates, ...(raw.rates || {}) },
        mraipay: { ...def.mraipay, ...(raw.mraipay || {}) },
        settings: { ...def.settings, ...(raw.settings || {}) },
      };
      return dbCache!;
    } catch {
      // fall through to default
    }
  }
  dbCache = defaultDb();
  saveDb();
  return dbCache;
}

function saveDb() {
  if (!dbCache) return;
  ensureStorageDir();
  const tmp = DB_FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(dbCache, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function appendLog(db: FfTopupDb, actor: string, action: string, details: string) {
  db.logs.unshift({
    id: 'log_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'),
    actor: actor || 'admin',
    action,
    details: String(details || '').slice(0, 300),
    createdAt: new Date().toISOString(),
  });
  if (db.logs.length > 250) db.logs = db.logs.slice(0, 250);
}

// ── Provider API Clients (Epinby & Generic SMM) ──────────────────────────────
class ApiClientError extends Error {
  definitiveReject: boolean;
  constructor(message: string, definitiveReject = false) {
    super(message);
    this.definitiveReject = definitiveReject;
  }
}

type NormalizedStatus = 'completed' | 'processing' | 'failed' | 'partial';

function normalizeStatus(raw: string): NormalizedStatus {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (['completed', 'complete', 'success', 'successful', 'delivered', 'done'].includes(s)) {
    return 'completed';
  }
  if (['partial', 'partially_completed', 'partial_refund'].includes(s)) {
    return 'partial';
  }
  if (['canceled', 'cancelled', 'failed', 'fail', 'failure', 'refunded', 'error', 'rejected'].includes(s)) {
    return 'failed';
  }
  return 'processing';
}

function isDefinitiveHttpError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err: any) {
    throw new ApiClientError(`Network error: ${err?.name === 'AbortError' ? 'Timeout' : err?.message || 'Fetch failed'}`, false);
  } finally {
    clearTimeout(timer);
  }
}

class EpinbyClient {
  baseUrl: string;
  apiKey: string;
  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private async request(method: string, route: string, body?: any, params?: Record<string, string | number>, extraHeaders?: Record<string, string>) {
    const u = new URL(this.baseUrl + route);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      'X-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    };
    const resp = await fetchWithTimeout(u.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    const defReject = isDefinitiveHttpError(resp.status);
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiClientError(`Invalid response (HTTP ${resp.status}): ${text.slice(0, 160)}`, defReject);
    }
    if (!data || typeof data !== 'object') {
      throw new ApiClientError(`Unexpected response (HTTP ${resp.status})`, defReject);
    }
    if (resp.status >= 400 || data.success === false) {
      const errObj = data.error;
      const msg = typeof errObj === 'object' && errObj?.message ? errObj.message : (typeof errObj === 'string' ? errObj : data.message || `HTTP ${resp.status}`);
      throw new ApiClientError(String(msg), resp.status < 500 && resp.status !== 408);
    }
    return data;
  }

  async getBalance() {
    const res = await this.request('GET', '/getMe');
    return res.data ?? res;
  }

  async validatePlayer(productId: string, playerId: string, serverId?: string) {
    const pid = /^\d+$/.test(String(productId).trim()) ? Number(productId) : productId;
    const body: any = { product_id: pid, player_id: playerId };
    if (serverId) body.server_id = serverId;
    const res = await this.request('POST', '/validate-player', body);
    return res.data ?? res;
  }

  async addOrder(productId: string, playerId: string, quantity = 1, idempotencyKey?: string): Promise<string> {
    const pid = /^\d+$/.test(String(productId).trim()) ? Number(productId) : productId;
    const headers = idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined;
    const res = await this.request('POST', '/order', { product_id: pid, qty: quantity, player_id: playerId }, undefined, headers);
    const data = res.data ?? res;
    const orderId = data && typeof data === 'object' ? (data.order_id ?? data.id) : null;
    if (!orderId) {
      throw new ApiClientError(`Unexpected order response: ${JSON.stringify(res).slice(0, 160)}`, false);
    }
    return String(orderId);
  }

  async listGames() {
    const res = await this.request('GET', '/games');
    const items = Array.isArray(res.data) ? res.data : [];
    return items.filter((g: any) => g && g.id != null).map((g: any) => ({
      id: Number(g.id),
      name: String(g.name || ''),
    }));
  }

  async listCategories(gameId: number) {
    const res = await this.request('GET', '/categories', undefined, { game_id: gameId });
    const items = Array.isArray(res.data) ? res.data : [];
    return items.filter((c: any) => c && c.id != null).map((c: any) => ({
      id: Number(c.id),
      name: String(c.name || ''),
    }));
  }

  async listProducts(opts: { gameId?: number; categoryId?: number; game?: string; category?: string; productType?: string; maxPages?: number } = {}) {
    const maxPages = opts.maxPages ?? 10;
    const products: Array<{
      id: number;
      name: string;
      price: number;
      gameId: number;
      game: string;
      categoryId: number;
      category: string;
      stockStatus: string;
      stockCount: any;
    }> = [];
    for (let page = 1; page <= maxPages; page++) {
      const params: Record<string, string | number> = {
        type: opts.productType || 'topup',
        per_page: 100,
        page,
      };
      if (opts.gameId) params.game_id = opts.gameId;
      if (opts.categoryId) params.category_id = opts.categoryId;
      if (opts.game) params.game = opts.game;
      if (opts.category) params.category = opts.category;
      const res = await this.request('GET', '/products', undefined, params);
      for (const item of (Array.isArray(res.data) ? res.data : [])) {
        const price = Number(item?.price);
        if (!Number.isFinite(price) || price < 0 || item?.id == null) continue;
        products.push({
          id: Number(item.id),
          name: String(item.name || ''),
          price,
          gameId: Number(item.game_id || 0),
          game: String(item.game || ''),
          categoryId: Number(item.category_id || 0),
          category: String(item.category || ''),
          stockStatus: String(item.stock_status || ''),
          stockCount: item.stock_count ?? null,
        });
      }
      const lastPage = Number(res.meta?.last_page || 1);
      if (page >= lastPage) break;
    }
    return products;
  }

  async getStatus(orderId: string): Promise<{ status: NormalizedStatus; raw: string }> {
    const res = await this.request('GET', `/order/${encodeURIComponent(orderId)}`);
    const data = res.data ?? res;
    const raw = data && typeof data === 'object' ? String(data.status || '') : '';
    return { status: normalizeStatus(raw), raw };
  }
}

class SmmGenericClient {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  constructor(baseUrl: string, apiKey: string, apiSecret = '') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private async post(payload: Record<string, string | number>) {
    const form = new URLSearchParams();
    form.set('key', this.apiKey);
    if (this.apiSecret) form.set('secret', this.apiSecret);
    for (const [k, v] of Object.entries(payload)) {
      form.set(k, String(v));
    }
    const resp = await fetchWithTimeout(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const text = await resp.text();
    if (resp.status !== 200) {
      throw new ApiClientError(`HTTP ${resp.status}`, isDefinitiveHttpError(resp.status));
    }
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiClientError(`Invalid JSON: ${text.slice(0, 140)}`, false);
    }
    if (!data || typeof data !== 'object') {
      throw new ApiClientError('Unexpected provider response', false);
    }
    return data;
  }

  async getBalance() {
    const res = await this.post({ action: 'balance' });
    if (res.error) throw new ApiClientError(String(res.error), false);
    return res;
  }

  async addOrder(serviceId: string, playerId: string, quantity = 1): Promise<string> {
    const res = await this.post({ action: 'add', service: serviceId, link: playerId, quantity });
    if (res.error) throw new ApiClientError(String(res.error), true);
    if (!res.order) throw new ApiClientError(`Unexpected response: ${JSON.stringify(res).slice(0, 140)}`, false);
    return String(res.order);
  }

  async getStatus(orderId: string): Promise<{ status: NormalizedStatus; raw: string }> {
    const res = await this.post({ action: 'status', order: orderId });
    if (res.error) throw new ApiClientError(String(res.error), false);
    const raw = String(res.status || '');
    return { status: normalizeStatus(raw), raw };
  }
}

function getProviderClient(p: FfProvider): EpinbyClient | SmmGenericClient {
  const key = decryptSecret(p.apiKeyEnc);
  const secret = decryptSecret(p.apiSecretEnc);
  if (p.providerType === 'EPINBY') {
    return new EpinbyClient(p.baseUrl, key);
  }
  return new SmmGenericClient(p.baseUrl, key, secret);
}

// ── Mr Ai Pay Client ─────────────────────────────────────────────────────────
const MRAIPAY_CREATE_URL = 'https://pay.mraipay.top/api/payment/create';
const MRAIPAY_VERIFY_URL = 'https://pay.mraipay.top/api/payment/verify';

async function mrAiPayPost(url: string, body: any, creds: { apiKey: string; secretKey: string; brandKey: string }) {
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-KEY': creds.apiKey,
      'SECRET-KEY': creds.secretKey,
      'BRAND-KEY': creds.brandKey,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid response from Mr Ai Pay: ${text.slice(0, 140)}`);
  }
  return data;
}

function getDecryptedMrAiPay(db: FfTopupDb) {
  if (!db.mraipay.enabled) return null;
  const apiKey = decryptSecret(db.mraipay.apiKeyEnc);
  const secretKey = decryptSecret(db.mraipay.secretKeyEnc);
  const brandKey = decryptSecret(db.mraipay.brandKeyEnc);
  if (!apiKey || !secretKey || !brandKey) return null;
  return { apiKey, secretKey, brandKey };
}

// ── Core Background Sync Engines ─────────────────────────────────────────────
let syncInProgress = false;

export async function runOrderSync(targetOrderId?: string): Promise<{
  checked: number;
  completedIds: string[];
  failedRefundOrders: Array<{ id: string; firestoreOrderId?: string; userId: string; amount: number; orderCode: string; pkgName: string }>;
  partialIds: string[];
  stuckCount: number;
}> {
  if (syncInProgress && !targetOrderId) {
    return { checked: 0, completedIds: [], failedRefundOrders: [], partialIds: [], stuckCount: 0 };
  }
  syncInProgress = true;
  try {
    const db = loadDb();
    const candidates = db.orders.filter((o) =>
      targetOrderId
        ? o.id === targetOrderId || o.firestoreOrderId === targetOrderId
        : o.status === 'processing' && Boolean(o.apiOrderId) && Boolean(o.apiProviderId)
    );

    const completedIds: string[] = [];
    const failedRefundOrders: Array<{ id: string; firestoreOrderId?: string; userId: string; amount: number; orderCode: string; pkgName: string }> = [];
    const partialIds: string[] = [];
    let checked = 0;

    for (const order of candidates) {
      if (!order.apiProviderId || !order.apiOrderId || order.status !== 'processing') continue;
      const provider = db.providers.find((p) => p.id === order.apiProviderId);
      if (!provider || !provider.isActive) continue;

      checked++;
      try {
        const client = getProviderClient(provider);
        const res = await client.getStatus(order.apiOrderId);
        const now = new Date().toISOString();
        order.apiStatus = (res.raw || order.apiStatus || '').slice(0, 64);
        order.lastApiSync = now;

        if (res.status === 'completed') {
          order.status = 'completed';
          order.deliveredAt = now;
          order.needsReview = false;
          completedIds.push(order.firestoreOrderId || order.id);
          appendLog(db, 'auto-sync', 'ORDER_DELIVERED', `${order.orderCode} -> completed`);
        } else if (res.status === 'failed') {
          order.status = 'cancelled';
          order.refundRequired = true;
          order.needsReview = false;
          if (!order.refundApplied) {
            failedRefundOrders.push({
              id: order.id,
              firestoreOrderId: order.firestoreOrderId,
              userId: order.userId,
              amount: order.pricePaid,
              orderCode: order.orderCode,
              pkgName: order.pkgName,
            });
          }
          appendLog(db, 'auto-sync', 'ORDER_AUTO_REFUND', `${order.orderCode} failed at provider -> refund queued`);
        } else if (res.status === 'partial') {
          order.needsReview = true;
          order.adminAlerted = true;
          partialIds.push(order.firestoreOrderId || order.id);
        }
      } catch {
        // leave order in processing; transient network error
      }
    }

    const stuckCutoff = Date.now() - (db.settings.orderStuckMinutes || 30) * 60_000;
    let stuckCount = 0;
    for (const order of db.orders) {
      if (order.status === 'processing' && new Date(order.createdAt).getTime() <= stuckCutoff) {
        stuckCount++;
        if (!order.adminAlerted) {
          order.adminAlerted = true;
        }
      }
    }

    saveDb();
    return { checked, completedIds, failedRefundOrders, partialIds, stuckCount };
  } finally {
    syncInProgress = false;
  }
}

export async function runPriceSync(providerIdFilter?: string): Promise<FfSyncReport> {
  const db = loadDb();
  const report: FfSyncReport = {
    ranAt: new Date().toISOString(),
    checked: 0,
    priceChanges: [],
    deactivated: [],
    warnings: [],
    updatedPackages: [],
  };

  const pkgs = Object.values(db.catalog).filter(
    (p) =>
      p.autoPrice &&
      p.apiProviderId &&
      p.apiServiceId &&
      (!providerIdFilter || p.apiProviderId === providerIdFilter)
  );

  const groups = new Map<string, FfCatalogPkg[]>();
  for (const pkg of pkgs) {
    const key = `${pkg.apiProviderId}:${pkg.srcGameId || 0}:${pkg.srcCategoryId || 0}`;
    const list = groups.get(key) || [];
    list.push(pkg);
    groups.set(key, list);
  }

  for (const [groupKey, groupPkgs] of groups.entries()) {
    const [provId, gRaw, cRaw] = groupKey.split(':');
    const gameId = Number(gRaw) || undefined;
    const categoryId = Number(cRaw) || undefined;
    const provider = db.providers.find((p) => p.id === provId);
    if (!provider || !provider.isActive || provider.providerType !== 'EPINBY') continue;

    const cur = (provider.currency || 'USD').toUpperCase();
    const rate = cur === 'BDT' || cur === 'TK' ? 1 : Number(db.rates[cur] || 0);
    if (!rate || rate <= 0) {
      report.warnings.push(`${provider.name}: ${cur} → ৳ এক্সচেঞ্জ রেট সেট করা নেই`);
      continue;
    }

    let products: Awaited<ReturnType<EpinbyClient['listProducts']>> = [];
    try {
      const client = getProviderClient(provider) as EpinbyClient;
      products = await client.listProducts({ gameId, categoryId, maxPages: 10 });
    } catch (err: any) {
      report.warnings.push(`${provider.name}: ক্যাটালগ আনা যায়নি (${err?.message || 'Error'})`);
      continue;
    }

    const byId = new Map(products.map((p) => [String(p.id), p]));
    const narrow = Boolean(gameId || categoryId);
    const missing: FfCatalogPkg[] = [];

    for (const pkg of groupPkgs) {
      report.checked++;
      const prod = pkg.apiServiceId ? byId.get(String(pkg.apiServiceId)) : undefined;
      if (!prod || (prod.stockStatus.toUpperCase() === 'FINITE' && Number(prod.stockCount) === 0)) {
        missing.push(pkg);
        continue;
      }
      if (!pkg.markupType || pkg.markupValue == null) {
        report.warnings.push(`${pkg.name}: লাভ (Markup) সেট নেই — আবার Import করুন`);
        continue;
      }
      const newCost = Number(prod.price.toFixed(4));
      const oldCost = pkg.srcCost;
      if (oldCost && oldCost > 0 && (newCost > oldCost * SPIKE_RATIO || newCost * SPIKE_RATIO < oldCost)) {
        report.warnings.push(
          `${pkg.name}: cost ${oldCost} → ${newCost} (২× এর বেশি পরিবর্তন — অটো আপডেট স্থগিত)`
        );
        continue;
      }

      const newSell = computeSellPrice(newCost, rate, pkg.markupType, pkg.markupValue);
      const oldSell = pkg.price;
      if (oldCost !== newCost || oldSell !== newSell) {
        report.priceChanges.push(`${pkg.name}: ৳${oldSell} → ৳${newSell} (cost ${newCost} ${cur})`);
        pkg.srcCost = newCost;
        pkg.costPrice = Number((newCost * rate).toFixed(2));
        pkg.price = newSell;
        pkg.updatedAt = new Date().toISOString();
        report.updatedPackages.push({
          id: pkg.id,
          name: pkg.name,
          price: pkg.price,
          srcCost: pkg.srcCost,
          costPrice: pkg.costPrice,
          enabled: pkg.enabled,
        });
      }
    }

    if (missing.length > 0) {
      const safeToDisable = narrow && products.length > 0 && missing.length <= Math.max(1, Math.floor(groupPkgs.length / 2));
      for (const pkg of missing) {
        if (safeToDisable) {
          if (pkg.enabled) {
            pkg.enabled = false;
            pkg.updatedAt = new Date().toISOString();
            report.deactivated.push(`${pkg.name} — provider-এ স্টক নেই`);
            report.updatedPackages.push({
              id: pkg.id,
              name: pkg.name,
              price: pkg.price,
              srcCost: pkg.srcCost,
              costPrice: pkg.costPrice,
              enabled: false,
            });
          }
        } else {
          report.warnings.push(`${pkg.name}: provider লিস্টে পাওয়া যায়নি (সুরক্ষার জন্য বন্ধ করা হয়নি)`);
        }
      }
    }
  }

  db.lastPriceSync = report;
  if (report.priceChanges.length || report.deactivated.length) {
    appendLog(db, 'price-sync', 'PRICE_SYNC', `${report.priceChanges.length} price changes, ${report.deactivated.length} disabled`);
  }
  saveDb();
  return report;
}

// Start background schedulers once
let schedulersStarted = false;
function ensureSchedulers() {
  if (schedulersStarted) return;
  schedulersStarted = true;
  setInterval(() => {
    const db = loadDb();
    if (db.settings.autoSyncEnabled) {
      runOrderSync().catch(() => {});
    }
  }, 60_000).unref?.();

  setInterval(() => {
    const db = loadDb();
    if (db.settings.autoPriceSyncEnabled) {
      runPriceSync().catch(() => {});
    }
  }, 15 * 60_000).unref?.();
}
ensureSchedulers();

// ── Public & Admin Serializers ───────────────────────────────────────────────
function serializeProviderAdmin(p: FfProvider) {
  return {
    id: p.id,
    name: p.name,
    providerType: p.providerType,
    baseUrl: p.baseUrl,
    apiKeyMasked: maskSecret(p.apiKeyEnc),
    apiSecretMasked: maskSecret(p.apiSecretEnc),
    currency: p.currency,
    isActive: p.isActive,
    lastBalance: p.lastBalance || null,
    lastCheckedAt: p.lastCheckedAt || null,
    createdAt: p.createdAt,
  };
}

function buildStats(db: FfTopupDb) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const stuckCutoff = Date.now() - (db.settings.orderStuckMinutes || 30) * 60_000;

  let totalRevenue = 0;
  let totalCost = 0;
  let todayOrders = 0;
  let todayRevenue = 0;
  let pendingCount = 0;
  let processingCount = 0;
  let deliveredCount = 0;
  let cancelledCount = 0;
  let reviewCount = 0;
  let stuckCount = 0;

  for (const o of db.orders) {
    const createdMs = new Date(o.createdAt).getTime();
    if (o.status !== 'cancelled') {
      totalRevenue += o.pricePaid || 0;
      totalCost += o.costBdt || 0;
      if (createdMs >= todayStart) {
        todayOrders++;
        todayRevenue += o.pricePaid || 0;
      }
    }
    if (o.status === 'pending') pendingCount++;
    else if (o.status === 'processing') {
      processingCount++;
      if (createdMs <= stuckCutoff) stuckCount++;
    } else if (o.status === 'completed') deliveredCount++;
    else if (o.status === 'cancelled') cancelledCount++;
    if (o.needsReview && o.status === 'processing') reviewCount++;
  }

  const activeProviders = db.providers.filter((p) => p.isActive).length;
  const activeAutoPackages = Object.values(db.catalog).filter((c) => c.enabled && c.apiProviderId).length;

  return {
    totalOrders: db.orders.length,
    todayOrders,
    todayRevenue: Number(todayRevenue.toFixed(2)),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    estimatedProfit: Number(Math.max(0, totalRevenue - totalCost).toFixed(2)),
    pendingCount,
    processingCount,
    deliveredCount,
    cancelledCount,
    reviewCount,
    stuckCount,
    activeProviders,
    activeAutoPackages,
    totalAutoDeposits: db.autoDeposits.filter((d) => d.status === 'COMPLETED').reduce((s, d) => s + d.amount, 0),
  };
}

// ── HTTP Request Router ──────────────────────────────────────────────────────
export async function handleFfTopupApiRequest(
  subPath: string,
  method: string,
  query: URLSearchParams,
  body: any
): Promise<{ status: number; json?: any; text?: string; contentType?: string; filename?: string }> {
  const db = loadDb();

  // 1. Public State (user-safe, NO keys exposed)
  if (subPath === '/public-state' && method === 'GET') {
    const uid = String(query.get('uid') || '').trim();
    const hasEpinby = db.providers.some((p) => p.isActive && p.providerType === 'EPINBY') &&
      Object.values(db.catalog).some((c) => c.enabled && c.apiProviderId && c.apiServiceId);
    const activeAutoPackages = Object.values(db.catalog).reduce((acc, p) => {
      acc[p.id] = {
        price: p.price,
        enabled: p.enabled,
        autoDelivery: Boolean(p.apiProviderId && p.apiServiceId),
        autoPrice: p.autoPrice,
      };
      return acc;
    }, {} as Record<string, any>);

    const pendingRefunds = uid
      ? db.orders.filter((o) => o.userId === uid && o.status === 'cancelled' && o.refundRequired && !o.refundApplied)
      : [];

    const userOrders = uid ? db.orders.filter((o) => o.userId === uid).slice(0, 30) : [];

    return {
      status: 200,
      json: {
        success: true,
        serverLabel: db.settings.serverLabel,
        noticeText: db.settings.noticeText,
        uidCheckAvailable: hasEpinby,
        savedPlayerUid: uid ? (db.userLastUid[uid] || '') : '',
        mraipayEnabled: Boolean(getDecryptedMrAiPay(db)),
        paymentMethods: db.paymentMethods.filter((m) => m.isActive),
        referralMinDeposit: db.settings.referralMinDeposit,
        referralBonusAmount: db.settings.referralBonusAmount,
        catalogMeta: activeAutoPackages,
        userOrders,
        pendingRefunds,
      },
    };
  }

  // 2. Player UID Validation & In-Game Nickname Lookup (Epinby)
  if (subPath === '/validate-player' && method === 'POST') {
    const rawUid = body?.playerUid ?? body?.uid;
    const playerId = parseUid(rawUid);
    if (!playerId) {
      return {
        status: 400,
        json: { success: false, validFormat: false, error: '⚠️ সঠিক Free Fire UID লিখুন (৬–১৪ ডিজিটের সংখ্যা)।' },
      };
    }

    let pkg = body?.pkgId ? db.catalog[String(body.pkgId)] : undefined;
    let provider = pkg?.apiProviderId
      ? db.providers.find((p) => p.id === pkg!.apiProviderId && p.isActive && p.providerType === 'EPINBY')
      : undefined;

    if (!provider) {
      for (const p of db.providers) {
        if (!p.isActive || p.providerType !== 'EPINBY') continue;
        const linked = Object.values(db.catalog).find((c) => c.apiProviderId === p.id && c.apiServiceId && c.enabled);
        if (linked) {
          provider = p;
          pkg = linked;
          break;
        }
      }
    }

    if (!provider || !pkg?.apiServiceId) {
      return {
        status: 200,
        json: {
          success: true,
          validFormat: true,
          lookupSupported: false,
          playerUid: playerId,
          nickname: null,
          message: '✅ UID ফরম্যাট সঠিক আছে (লাইভ ইন-গেম নাম যাচাইয়ের জন্য Epinby API সংযুক্ত নেই)।',
        },
      };
    }

    try {
      const client = getProviderClient(provider) as EpinbyClient;
      const info = await client.validatePlayer(pkg.apiServiceId, playerId, body?.serverId);
      const nickname = info?.nickname || info?.username || info?.name || null;
      return {
        status: 200,
        json: {
          success: true,
          validFormat: true,
          lookupSupported: true,
          playerUid: playerId,
          nickname,
          message: nickname
            ? `✅ পাওয়া গেছে! In-game Name: ${nickname}`
            : '⚠️ এই UID-এর জন্য কোনো নাম পাওয়া যায়নি। UID সঠিক কিনা যাচাই করুন।',
        },
      };
    } catch (err: any) {
      return {
        status: 200,
        json: {
          success: true,
          validFormat: true,
          lookupSupported: true,
          lookupError: true,
          playerUid: playerId,
          nickname: null,
          message: `⚠️ UID যাচাই করা যায়নি: ${err?.message || 'সার্ভার ব্যস্ত'}। অর্ডারের আগে গেম থেকে UID মিলিয়ে নিন।`,
        },
      };
    }
  }

  // 3. Order Dispatch / Recording
  if (subPath === '/orders/dispatch' && method === 'POST') {
    const userId = String(body?.userId || '').trim() || 'guest';
    const userName = String(body?.userName || 'User').trim();
    const playerId = parseUid(body?.playerUid);
    if (!playerId) {
      return { status: 400, json: { success: false, error: '⚠️ সঠিক Player UID দিন (৬–১৪ ডিজিট সংখ্যা)।' } };
    }

    const pkgId = String(body?.pkgId || '').trim();
    const pkgName = String(body?.pkgName || 'Diamond Package').trim();
    const quantity = Math.max(1, Math.min(100, parseInt(String(body?.quantity || '1'), 10) || 1));
    const unitPrice = Number(body?.unitPrice || 0);
    const totalPrice = Number(body?.totalPrice || unitPrice * quantity);
    const firestoreOrderId = String(body?.firestoreOrderId || '').trim() || undefined;

    // Duplicate click protection
    const nowMs = Date.now();
    const dup = db.orders.find(
      (o) =>
        o.userId === userId &&
        o.pkgId === pkgId &&
        o.playerId === playerId &&
        o.status !== 'cancelled' &&
        nowMs - new Date(o.createdAt).getTime() < DUPLICATE_WINDOW_MS
    );
    if (dup && !body?.allowDuplicate) {
      return {
        status: 409,
        json: { success: false, duplicate: true, error: '⏳ একই অর্ডার মাত্রই করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।' },
      };
    }

    const serverPkg = db.catalog[pkgId];
    if (serverPkg && serverPkg.enabled === false) {
      return { status: 400, json: { success: false, error: '❌ এই প্যাকেজটি বর্তমানে বন্ধ আছে।' } };
    }
    if (serverPkg && body?.expectedUnitPrice != null && Math.abs(serverPkg.price - Number(body.expectedUnitPrice)) > 0.01) {
      return {
        status: 409,
        json: {
          success: false,
          priceChanged: true,
          newUnitPrice: serverPkg.price,
          error: `💱 প্যাকেজের দাম আপডেট হয়ে ৳${serverPkg.price} হয়েছে। রিফ্রেশ করে আবার অর্ডার করুন।`,
        },
      };
    }

    // Save last used Player ID
    if (userId !== 'guest') {
      db.userLastUid[userId] = playerId;
    }

    const isApiLinked = Boolean(serverPkg?.apiProviderId && serverPkg?.apiServiceId);
    const provider = isApiLinked
      ? db.providers.find((p) => p.id === serverPkg!.apiProviderId)
      : undefined;

    if (isApiLinked && (!provider || !provider.isActive)) {
      return {
        status: 503,
        json: {
          success: false,
          refunded: true,
          error: '🔴 অটো-ডেলিভারি সার্ভার বর্তমানে রক্ষণাবেক্ষণে আছে। কোনো টাকা কাটা হয়নি।',
        },
      };
    }

    const costBdtPerUnit = serverPkg?.costPrice ?? 0;
    const order: FfServerOrder = {
      id: 'ffo_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'),
      orderCode: genOrderCode(),
      firestoreOrderId,
      userId,
      userName,
      gameId: String(body?.gameId || 'ff'),
      gameName: String(body?.gameName || 'Free Fire'),
      pkgId,
      pkgName,
      quantity,
      unitPrice: serverPkg ? serverPkg.price : unitPrice,
      pricePaid: totalPrice,
      costBdt: Number((costBdtPerUnit * quantity).toFixed(2)),
      playerId,
      playerNickname: body?.playerNickname ? String(body.playerNickname) : undefined,
      status: isApiLinked ? 'processing' : 'pending',
      apiProviderId: provider?.id || null,
      apiServiceId: serverPkg?.apiServiceId || null,
      apiOrderId: null,
      apiStatus: isApiLinked ? 'DISPATCHING' : null,
      lastApiSync: null,
      needsReview: false,
      adminAlerted: false,
      refundRequired: false,
      refundApplied: false,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    };

    db.orders.unshift(order);
    if (db.orders.length > 1000) db.orders = db.orders.slice(0, 1000);

    if (!isApiLinked || !provider || !serverPkg?.apiServiceId) {
      appendLog(db, userName, 'NEW_MANUAL_ORDER', `${order.orderCode} | ${pkgName} ×${quantity} | UID ${playerId}`);
      saveDb();
      return {
        status: 200,
        json: {
          success: true,
          mode: 'manual',
          outcome: 'pending',
          order,
        },
      };
    }

    // Dispatch to Automatic Provider API
    try {
      const client = getProviderClient(provider);
      const apiOrderId = await client.addOrder(serverPkg.apiServiceId, playerId, quantity, order.orderCode);
      order.apiOrderId = apiOrderId;
      order.apiStatus = 'SUBMITTED';
      order.lastApiSync = new Date().toISOString();
      appendLog(db, userName, 'NEW_AUTO_ORDER', `${order.orderCode} -> ${provider.name} (#${apiOrderId})`);
      saveDb();
      return {
        status: 200,
        json: {
          success: true,
          mode: 'auto',
          outcome: 'processing',
          order,
        },
      };
    } catch (err: any) {
      const now = new Date().toISOString();
      order.lastApiSync = now;
      if (err instanceof ApiClientError && err.definitiveReject) {
        order.status = 'cancelled';
        order.apiStatus = 'REJECTED';
        order.deliveryNote = `Provider rejected: ${err.message}`;
        order.refundRequired = true;
        order.refundApplied = true; // caller handles immediate refund
        appendLog(db, 'system', 'AUTO_ORDER_REJECTED', `${order.orderCode}: ${err.message}`);
        saveDb();
        return {
          status: 200,
          json: {
            success: false,
            mode: 'auto',
            outcome: 'rejected',
            refunded: true,
            error: `🔴 প্রোভাইডার অর্ডার গ্রহণ করেনি (${err.message})। আপনার টাকা ওয়ালেটে ফেরত দেওয়া হয়েছে।`,
            order,
          },
        };
      }

      // Uncertain outcome -> DO NOT auto-refund, DO NOT retry; flag needsReview!
      order.status = 'processing';
      order.apiStatus = 'UNCERTAIN';
      order.needsReview = true;
      order.adminAlerted = true;
      order.deliveryNote = `Uncertain provider response: ${err?.message || 'Timeout'}`;
      appendLog(db, 'system', 'AUTO_ORDER_UNCERTAIN', `${order.orderCode}: ${err?.message || 'Timeout'}`);
      saveDb();
      return {
        status: 200,
        json: {
          success: true,
          mode: 'auto',
          outcome: 'uncertain',
          order,
        },
      };
    }
  }

  // 4. Order Status Sync (User or Admin) + Acknowledge Applied Refunds
  if (subPath === '/orders/sync' && method === 'POST') {
    const targetId = body?.orderId ? String(body.orderId) : undefined;
    const syncRes = await runOrderSync(targetId);
    return { status: 200, json: { success: true, ...syncRes } };
  }

  if (subPath === '/orders/ack-refund' && method === 'POST') {
    const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds.map(String) : [];
    for (const o of db.orders) {
      if (orderIds.includes(o.id) || (o.firestoreOrderId && orderIds.includes(o.firestoreOrderId))) {
        o.refundApplied = true;
      }
    }
    saveDb();
    return { status: 200, json: { success: true } };
  }

  // 5. Mr Ai Pay: Create Payment Link
  if (subPath === '/mraipay/create' && method === 'POST') {
    const creds = getDecryptedMrAiPay(db);
    if (!creds) {
      return { status: 503, json: { success: false, error: '⚠️ Auto Deposit (Mr Ai Pay) বর্তমানে বন্ধ আছে।' } };
    }
    const amount = Number(translateBnDigits(String(body?.amount || '0')));
    if (!Number.isFinite(amount) || amount < 10 || amount > 100000) {
      return { status: 400, json: { success: false, error: '⚠️ সর্বনিম্ন ৳১০ থেকে সর্বোচ্চ ৳১,০০,০০০ পর্যন্ত ডিপোজিট করা যাবে।' } };
    }
    const userId = String(body?.userId || '').trim();
    if (!userId) {
      return { status: 401, json: { success: false, error: 'আগে লগইন করুন।' } };
    }
    const userName = String(body?.userName || 'Customer').trim();
    const originUrl = String(body?.originUrl || process.env.APP_URL || 'https://imspro.site').replace(/\/+$/, '');
    const successUrl = `${originUrl}/?mraipay=success#wallet`;
    const cancelUrl = `${originUrl}/?mraipay=cancel#wallet`;

    try {
      const res = await mrAiPayPost(
        MRAIPAY_CREATE_URL,
        {
          cus_name: userName,
          cus_email: `user_${userId.slice(0, 24)}@imspro.local`,
          success_url: successUrl,
          cancel_url: cancelUrl,
          amount: Number.isInteger(amount) ? String(amount) : amount.toFixed(2),
          metadata: { site_uid: userId },
          meta_data: { site_uid: userId },
        },
        creds
      );

      if (!res?.status || !res?.payment_url) {
        return { status: 502, json: { success: false, error: String(res?.message || 'Payment link তৈরি করা যায়নি।') } };
      }

      let gatewayTxnId = res.transaction_id || res.transactionId || null;
      if (!gatewayTxnId) {
        try {
          const u = new URL(res.payment_url);
          gatewayTxnId = u.searchParams.get('transaction_id') || u.searchParams.get('transactionId');
        } catch {
          // ignore
        }
      }

      const intent: FfPaymentIntent = {
        id: 'pi_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'),
        userId,
        userName,
        amount,
        gatewayTxnId: gatewayTxnId ? String(gatewayTxnId) : null,
        paymentUrl: String(res.payment_url),
        status: 'CREATED',
        createdAt: new Date().toISOString(),
      };
      db.paymentIntents.unshift(intent);
      if (db.paymentIntents.length > 300) db.paymentIntents = db.paymentIntents.slice(0, 300);
      saveDb();

      return { status: 200, json: { success: true, paymentUrl: intent.paymentUrl, intent } };
    } catch (err: any) {
      return { status: 502, json: { success: false, error: err?.message || 'Mr Ai Pay gateway error' } };
    }
  }

  // 6. Mr Ai Pay: Verify Transaction ID (Idempotent Credit Guard!)
  if (subPath === '/mraipay/verify' && method === 'POST') {
    const creds = getDecryptedMrAiPay(db);
    if (!creds) {
      return { status: 503, json: { success: false, error: 'Auto Deposit (Mr Ai Pay) বর্তমানে বন্ধ আছে।' } };
    }
    const trxId = normalizeTxnId(body?.transactionId);
    const currentUserId = String(body?.userId || '').trim();
    if (!trxId) {
      return { status: 400, json: { success: false, error: '⚠️ সঠিক Transaction ID লিখুন।' } };
    }

    const existing = db.autoDeposits.find((d) => d.transactionId === trxId);
    if (existing && existing.status === 'COMPLETED' && existing.walletCredited) {
      return {
        status: 200,
        json: {
          success: true,
          status: 'COMPLETED',
          newlyCredited: false,
          amount: existing.amount,
          message: 'ℹ️ এই Transaction ID-এর টাকা আগেই ওয়ালেটে যোগ হয়েছে।',
        },
      };
    }

    try {
      const res = await mrAiPayPost(MRAIPAY_VERIFY_URL, { transaction_id: trxId }, creds);
      if (res?.status === false) {
        return { status: 400, json: { success: false, error: String(res?.message || 'Transaction ID খুঁজে পাওয়া যায়নি।') } };
      }

      const gatewayStatus = String(res?.status || '').toUpperCase();
      const amount = Number(res?.amount || 0);
      let meta = res?.metadata || res?.meta_data || {};
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
      }
      const ownerUid = String(meta?.site_uid || currentUserId || '').trim();
      if (!ownerUid || (currentUserId && ownerUid !== currentUserId && !body?.isAdmin)) {
        return { status: 403, json: { success: false, error: '❌ এই পেমেন্টটি অন্য অ্যাকাউন্টের সাথে যুক্ত।' } };
      }

      const isCompleted = gatewayStatus === 'COMPLETED' && Number.isFinite(amount) && amount > 0;
      let newlyCredited = false;

      if (!existing) {
        db.autoDeposits.unshift({
          id: 'ad_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'),
          userId: ownerUid,
          userName: String(body?.userName || 'User'),
          transactionId: trxId,
          amount: Number.isFinite(amount) ? amount : 0,
          paymentMethod: String(res?.payment_method || 'MrAiPay'),
          status: isCompleted ? 'COMPLETED' : (gatewayStatus || 'UNKNOWN'),
          walletCredited: isCompleted,
          createdAt: new Date().toISOString(),
        });
        newlyCredited = isCompleted;
      } else if (existing.status !== 'COMPLETED' && isCompleted) {
        existing.status = 'COMPLETED';
        existing.amount = amount;
        existing.paymentMethod = String(res?.payment_method || existing.paymentMethod);
        existing.walletCredited = true;
        newlyCredited = true;
      } else if (!isCompleted && gatewayStatus) {
        existing.status = gatewayStatus;
      }

      if (newlyCredited) {
        appendLog(db, ownerUid, 'AUTO_DEPOSIT_VERIFIED', `৳${amount} via Mr Ai Pay (${trxId})`);
      }
      saveDb();

      return {
        status: 200,
        json: {
          success: true,
          status: gatewayStatus,
          newlyCredited,
          amount,
          paymentMethod: String(res?.payment_method || 'MrAiPay'),
          referralEligible: newlyCredited && amount >= db.settings.referralMinDeposit,
          referralBonusAmount: db.settings.referralBonusAmount,
          message: newlyCredited
            ? `✅ ৳${amount} সফলভাবে আপনার ওয়ালেটে যোগ হয়েছে!`
            : gatewayStatus === 'PENDING'
              ? '⏳ পেমেন্ট এখনো PENDING অবস্থায় আছে। একটু পরে আবার Verify করুন।'
              : '❌ পেমেন্টটি সম্পন্ন হয়নি।',
        },
      };
    } catch (err: any) {
      return { status: 502, json: { success: false, error: err?.message || 'Verification failed' } };
    }
  }

  // ═══════════════ ADMIN ENDPOINTS ═══════════════

  // A1. Admin Dashboard & Full State
  if (subPath === '/admin/state' && method === 'GET') {
    const stuckCutoff = Date.now() - (db.settings.orderStuckMinutes || 30) * 60_000;
    const stuckOrders = db.orders.filter(
      (o) => o.status === 'processing' && new Date(o.createdAt).getTime() <= stuckCutoff
    );
    return {
      status: 200,
      json: {
        success: true,
        stats: buildStats(db),
        providers: db.providers.map(serializeProviderAdmin),
        rates: db.rates,
        catalog: Object.values(db.catalog),
        orders: db.orders.slice(0, 100),
        stuckOrders,
        paymentMethods: db.paymentMethods,
        autoDeposits: db.autoDeposits.slice(0, 50),
        mraipay: {
          enabled: db.mraipay.enabled,
          apiKeyMasked: maskSecret(db.mraipay.apiKeyEnc),
          secretKeyMasked: maskSecret(db.mraipay.secretKeyEnc),
          brandKeyMasked: maskSecret(db.mraipay.brandKeyEnc),
          configured: Boolean(db.mraipay.apiKeyEnc && db.mraipay.secretKeyEnc && db.mraipay.brandKeyEnc),
        },
        settings: db.settings,
        lastPriceSync: db.lastPriceSync,
        logs: db.logs.slice(0, 60),
      },
    };
  }

  // A2. Save / Add Provider
  if (subPath === '/admin/providers/save' && method === 'POST') {
    const name = String(body?.name || '').trim();
    const providerType: ProviderType = body?.providerType === 'SMM_GENERIC' ? 'SMM_GENERIC' : 'EPINBY';
    const currency = String(body?.currency || 'USD').trim().toUpperCase() || 'USD';
    let baseUrl: string;
    try {
      baseUrl = validateProviderUrl(String(body?.baseUrl || ''));
    } catch (err: any) {
      return { status: 400, json: { success: false, error: err.message } };
    }
    if (!name) return { status: 400, json: { success: false, error: 'Provider নাম দিন।' } };

    const editId = String(body?.id || '').trim();
    const rawKey = String(body?.apiKey || '').trim();
    const rawSecret = String(body?.apiSecret || '').trim();

    if (editId) {
      const existing = db.providers.find((p) => p.id === editId);
      if (!existing) return { status: 404, json: { success: false, error: 'Provider পাওয়া যায়নি' } };
      existing.name = name;
      existing.providerType = providerType;
      existing.baseUrl = baseUrl;
      existing.currency = currency;
      if (rawKey) existing.apiKeyEnc = encryptSecret(rawKey);
      if (rawSecret === '-') existing.apiSecretEnc = '';
      else if (rawSecret) existing.apiSecretEnc = encryptSecret(rawSecret);
      appendLog(db, 'admin', 'UPDATE_API_PROVIDER', name);
      saveDb();
      return { status: 200, json: { success: true, provider: serializeProviderAdmin(existing) } };
    }

    if (!rawKey) return { status: 400, json: { success: false, error: 'API Key দিন।' } };
    const created: FfProvider = {
      id: 'prov_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'),
      name,
      providerType,
      baseUrl,
      apiKeyEnc: encryptSecret(rawKey),
      apiSecretEnc: rawSecret && rawSecret !== '-' ? encryptSecret(rawSecret) : '',
      currency,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    db.providers.push(created);
    if (!db.rates[currency]) db.rates[currency] = currency === 'BDT' ? 1 : 125;
    appendLog(db, 'admin', 'ADD_API_PROVIDER', `${name} (${providerType})`);
    saveDb();
    return { status: 200, json: { success: true, provider: serializeProviderAdmin(created) } };
  }

  if (subPath === '/admin/providers/toggle' && method === 'POST') {
    const id = String(body?.id || '');
    const p = db.providers.find((x) => x.id === id);
    if (!p) return { status: 404, json: { success: false, error: 'Provider not found' } };
    p.isActive = !p.isActive;
    appendLog(db, 'admin', 'TOGGLE_PROVIDER', `${p.name} -> ${p.isActive ? 'ON' : 'OFF'}`);
    saveDb();
    return { status: 200, json: { success: true, provider: serializeProviderAdmin(p) } };
  }

  if (subPath === '/admin/providers/delete' && method === 'POST') {
    const id = String(body?.id || '');
    const idx = db.providers.findIndex((x) => x.id === id);
    if (idx === -1) return { status: 404, json: { success: false, error: 'Provider not found' } };
    const prov = db.providers[idx];
    const linkedCount = Object.values(db.catalog).filter((c) => c.apiProviderId === id).length;
    if (linkedCount > 0 && !body?.force) {
      return {
        status: 400,
        json: { success: false, error: `এই প্রোভাইডারের সাথে ${linkedCount} টি প্যাকেজ যুক্ত আছে। আগে সেগুলো Manual করুন বা Force Delete দিন।` },
      };
    }
    if (body?.force) {
      for (const pkg of Object.values(db.catalog)) {
        if (pkg.apiProviderId === id) {
          pkg.apiProviderId = null;
          pkg.apiServiceId = null;
          pkg.autoPrice = false;
        }
      }
    }
    const usedInOrders = db.orders.some((o) => o.apiProviderId === id);
    if (usedInOrders && !body?.force) {
      prov.isActive = false;
      appendLog(db, 'admin', 'ARCHIVE_PROVIDER', prov.name);
      saveDb();
      return { status: 200, json: { success: true, archived: true, message: 'অর্ডার হিস্ট্রি থাকায় প্রোভাইডার Disable করা হয়েছে।' } };
    }
    db.providers.splice(idx, 1);
    appendLog(db, 'admin', 'DELETE_PROVIDER', prov.name);
    saveDb();
    return { status: 200, json: { success: true, deleted: true } };
  }

  if (subPath === '/admin/providers/test' && method === 'POST') {
    const id = String(body?.id || '');
    const p = db.providers.find((x) => x.id === id);
    if (!p) return { status: 404, json: { success: false, error: 'Provider not found' } };
    try {
      const client = getProviderClient(p);
      const data = await client.getBalance();
      const bal = data?.balance ?? data?.wallet_balance ?? JSON.stringify(data).slice(0, 120);
      p.lastBalance = `${bal} ${p.currency}`;
      p.lastCheckedAt = new Date().toISOString();
      saveDb();
      return { status: 200, json: { success: true, balance: p.lastBalance, raw: data } };
    } catch (err: any) {
      return { status: 502, json: { success: false, error: err?.message || 'Connection failed' } };
    }
  }

  // A3. Browse Provider Catalog (Games -> Categories [BD First] -> Products)
  if (subPath === '/admin/catalog/browse' && method === 'POST') {
    const providerId = String(body?.providerId || '');
    const provider = db.providers.find((p) => p.id === providerId);
    if (!provider) return { status: 404, json: { success: false, error: 'Provider পাওয়া যায়নি।' } };
    if (provider.providerType !== 'EPINBY') {
      return { status: 400, json: { success: false, error: 'Catalog Import শুধুমাত্র Epinby provider-এ কাজ করে।' } };
    }
    const client = getProviderClient(provider) as EpinbyClient;
    const step = String(body?.step || 'games');

    try {
      if (step === 'games') {
        const search = String(body?.query || '').trim().toLowerCase();
        const games = await client.listGames();
        const matches = search
          ? games.filter((g) => g.name.toLowerCase().includes(search))
          : games;
        return { status: 200, json: { success: true, step: 'games', games: matches.slice(0, 40) } };
      }

      if (step === 'categories') {
        const gameId = Number(body?.gameId || 0);
        if (!gameId) return { status: 400, json: { success: false, error: 'gameId required' } };
        const cats = await client.listCategories(gameId);
        // Sort Bangladesh / BD categories first!
        cats.sort((a, b) => {
          const aBd = /bangladesh|\bbd\b/i.test(a.name) ? 0 : 1;
          const bBd = /bangladesh|\bbd\b/i.test(b.name) ? 0 : 1;
          if (aBd !== bBd) return aBd - bBd;
          return a.name.localeCompare(b.name);
        });
        return { status: 200, json: { success: true, step: 'categories', categories: cats } };
      }

      if (step === 'products') {
        const gameId = body?.gameId ? Number(body.gameId) : undefined;
        const categoryId = body?.categoryId ? Number(body.categoryId) : undefined;
        const queryText = body?.query ? String(body.query).trim() : undefined;
        const products = await client.listProducts({
          gameId,
          categoryId,
          game: queryText,
          maxPages: 5,
        });
        products.sort((a, b) => a.price - b.price);
        return {
          status: 200,
          json: {
            success: true,
            step: 'products',
            currency: provider.currency,
            rate: provider.currency === 'BDT' ? 1 : (db.rates[provider.currency] || 125),
            products: products.slice(0, 300),
          },
        };
      }
    } catch (err: any) {
      return { status: 502, json: { success: false, error: err?.message || 'Provider fetch failed' } };
    }
    return { status: 400, json: { success: false, error: 'Invalid browse step' } };
  }

  // A4. Bulk Import Selected Epinby Products into Catalog
  if (subPath === '/admin/catalog/import' && method === 'POST') {
    const providerId = String(body?.providerId || '');
    const provider = db.providers.find((p) => p.id === providerId);
    if (!provider) return { status: 404, json: { success: false, error: 'Provider not found' } };

    const products = Array.isArray(body?.products) ? body.products : [];
    if (!products.length) return { status: 400, json: { success: false, error: 'অন্তত একটি প্রোডাক্ট বাছাই করুন।' } };

    const markupParsed = parseMarkup(body?.markup);
    if (!markupParsed) {
      return { status: 400, json: { success: false, error: 'সঠিক লাভ লিখুন (যেমন 10% অথবা 15)।' } };
    }

    const cur = (provider.currency || 'USD').toUpperCase();
    let rate = cur === 'BDT' || cur === 'TK' ? 1 : Number(translateBnDigits(String(body?.rate || db.rates[cur] || 125)));
    if (!Number.isFinite(rate) || rate <= 0) rate = 125;
    if (cur !== 'BDT' && cur !== 'TK') db.rates[cur] = rate;

    const targetGameId = String(body?.targetGameId || 'ff');
    const targetCatId = String(body?.targetCatId || 'ff_diamond');
    const now = new Date().toISOString();

    let created = 0;
    let updated = 0;
    const importedPackages: FfCatalogPkg[] = [];

    for (const item of products) {
      const serviceId = String(item.id || '').trim();
      const name = String(item.name || '').trim().slice(0, 128);
      const srcCost = Number(item.price);
      if (!serviceId || !name || !Number.isFinite(srcCost) || srcCost < 0) continue;

      const existing = Object.values(db.catalog).find(
        (c) => c.apiProviderId === provider.id && c.apiServiceId === serviceId
      );
      const sell = computeSellPrice(srcCost, rate, markupParsed.type, markupParsed.value);
      const costBdt = Number((srcCost * rate).toFixed(2));

      if (existing) {
        existing.name = name;
        existing.price = sell;
        existing.costPrice = costBdt;
        existing.srcCost = Number(srcCost.toFixed(4));
        existing.autoPrice = true;
        existing.markupType = markupParsed.type;
        existing.markupValue = markupParsed.value;
        existing.srcGameId = Number(item.gameId || body?.srcGameId || 0) || existing.srcGameId;
        existing.srcCategoryId = Number(item.categoryId || body?.srcCategoryId || 0) || existing.srcCategoryId;
        existing.enabled = true;
        existing.updatedAt = now;
        importedPackages.push(existing);
        updated++;
      } else {
        const id = `imp_${provider.id.slice(-4)}_${serviceId}`;
        const pkg: FfCatalogPkg = {
          id,
          gameId: targetGameId,
          catId: targetCatId,
          name,
          diamondAmount: extractAmountLabel(name),
          price: sell,
          costPrice: costBdt,
          srcCost: Number(srcCost.toFixed(4)),
          autoPrice: true,
          markupType: markupParsed.type,
          markupValue: markupParsed.value,
          apiProviderId: provider.id,
          apiServiceId: serviceId,
          srcGameId: Number(item.gameId || body?.srcGameId || 0) || null,
          srcCategoryId: Number(item.categoryId || body?.srcCategoryId || 0) || null,
          hot: false,
          enabled: true,
          updatedAt: now,
        };
        db.catalog[id] = pkg;
        importedPackages.push(pkg);
        created++;
      }
    }

    appendLog(db, 'admin', 'IMPORT_PACKAGES', `${provider.name}: +${created} new, ${updated} updated`);
    saveDb();
    return {
      status: 200,
      json: {
        success: true,
        created,
        updated,
        rate,
        markup: markupParsed,
        importedPackages,
      },
    };
  }

  // A5. Sync Local Website Catalog (gmData) <-> Server Engine
  if (subPath === '/admin/catalog/sync-local' && method === 'POST') {
    const items = Array.isArray(body?.packages) ? body.packages : [];
    const now = new Date().toISOString();
    const keepIds = new Set<string>();
    for (const item of items) {
      const id = String(item?.id || '').trim();
      if (!id) continue;
      keepIds.add(id);
      const existing = db.catalog[id];
      db.catalog[id] = {
        id,
        gameId: String(item.gameId || existing?.gameId || 'ff'),
        catId: String(item.catId || existing?.catId || 'ff_diamond'),
        name: String(item.name || existing?.name || 'Package'),
        diamondAmount: String(item.diamondAmount || existing?.diamondAmount || extractAmountLabel(String(item.name || ''))),
        price: Number(item.price ?? existing?.price ?? 0),
        costPrice: item.costPrice !== undefined ? (item.costPrice === null ? null : Number(item.costPrice)) : (existing?.costPrice ?? null),
        srcCost: item.srcCost !== undefined ? (item.srcCost === null ? null : Number(item.srcCost)) : (existing?.srcCost ?? null),
        autoPrice: Boolean(item.autoPrice ?? existing?.autoPrice ?? false),
        markupType: item.markupType ?? existing?.markupType ?? null,
        markupValue: item.markupValue != null ? Number(item.markupValue) : (existing?.markupValue ?? null),
        apiProviderId: item.apiProviderId !== undefined ? (item.apiProviderId || null) : (existing?.apiProviderId ?? null),
        apiServiceId: item.apiServiceId !== undefined ? (item.apiServiceId || null) : (existing?.apiServiceId ?? null),
        srcGameId: item.srcGameId ?? existing?.srcGameId ?? null,
        srcCategoryId: item.srcCategoryId ?? existing?.srcCategoryId ?? null,
        hot: Boolean(item.hot ?? existing?.hot ?? false),
        enabled: item.enabled !== false,
        updatedAt: now,
      };
    }
    if (body?.prune) {
      for (const k of Object.keys(db.catalog)) {
        if (!keepIds.has(k)) delete db.catalog[k];
      }
    }
    saveDb();
    return { status: 200, json: { success: true, count: Object.keys(db.catalog).length } };
  }

  // A6. Set Exchange Rate & Re-run Price Sync
  if (subPath === '/admin/rate/set' && method === 'POST') {
    const currency = String(body?.currency || 'USD').trim().toUpperCase();
    const rate = Number(translateBnDigits(String(body?.rate || '0')));
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
      return { status: 400, json: { success: false, error: 'সঠিক রেট লিখুন (যেমন 125)।' } };
    }
    db.rates[currency] = rate;
    appendLog(db, 'admin', 'SET_RATE', `1 ${currency} = ৳${rate}`);
    saveDb();
    const report = await runPriceSync();
    return { status: 200, json: { success: true, currency, rate, report } };
  }

  // A7. Trigger Price Sync Now
  if (subPath === '/admin/catalog/sync-prices' && method === 'POST') {
    const report = await runPriceSync(body?.providerId ? String(body.providerId) : undefined);
    return { status: 200, json: { success: true, report } };
  }

  // A8. Admin Order Actions (safe cancel & refund check, mark delivered, delivery note, manual re-sync)
  if (subPath === '/admin/orders/action' && method === 'POST') {
    const orderId = String(body?.orderId || '').trim();
    const action = String(body?.action || '').trim();
    const order = db.orders.find((o) => o.id === orderId || o.firestoreOrderId === orderId);

    if (action === 'sync_one') {
      const res = await runOrderSync(orderId);
      return { status: 200, json: { success: true, ...res, order: db.orders.find((o) => o.id === orderId || o.firestoreOrderId === orderId) } };
    }

    if (!order) {
      return { status: 404, json: { success: false, error: 'সার্ভার রেকর্ড পাওয়া যায়নি (ম্যানুয়াল Firestore অর্ডার হলে সরাসরি স্ট্যাটাস পরিবর্তন করুন)।' } };
    }

    if (action === 'deliver') {
      if (order.status !== 'pending' && order.status !== 'processing') {
        return { status: 400, json: { success: false, error: 'অর্ডারটি আগেই চূড়ান্ত করা হয়েছে।' } };
      }
      order.status = 'completed';
      order.deliveredAt = new Date().toISOString();
      order.needsReview = false;
      appendLog(db, 'admin', 'DELIVER_ORDER', order.orderCode);
      saveDb();
      return { status: 200, json: { success: true, outcome: 'delivered', order } };
    }

    if (action === 'note') {
      order.deliveryNote = String(body?.note || '').trim().slice(0, 500);
      saveDb();
      return { status: 200, json: { success: true, order } };
    }

    if (action === 'safe_cancel') {
      if (order.status !== 'pending' && order.status !== 'processing') {
        return { status: 400, json: { success: false, error: 'অর্ডারটি Cancel করার অবস্থায় নেই।' } };
      }
      const force = Boolean(body?.force);
      if (!force && order.status === 'processing' && order.apiOrderId && order.apiProviderId) {
        const provider = db.providers.find((p) => p.id === order.apiProviderId);
        if (provider) {
          try {
            const st = await getProviderClient(provider).getStatus(order.apiOrderId);
            if (st.status === 'completed') {
              order.status = 'completed';
              order.apiStatus = st.raw;
              order.deliveredAt = new Date().toISOString();
              order.needsReview = false;
              appendLog(db, 'admin', 'DELIVER_INSTEAD_OF_CANCEL', order.orderCode);
              saveDb();
              return {
                status: 200,
                json: {
                  success: true,
                  outcome: 'delivered_instead',
                  message: 'ℹ️ প্রোভাইডার ইতিমধ্যেই টপ-আপ Delivered করে দিয়েছে! তাই রিফান্ড না করে Delivered করা হলো।',
                  order,
                },
              };
            }
            if (st.status !== 'failed') {
              return {
                status: 409,
                json: {
                  success: false,
                  outcome: 'blocked_processing',
                  error: `⚠️ প্রোভাইডারের সার্ভারে অর্ডারটি এখনো "${st.raw || 'processing'}" অবস্থায় আছে। প্রোভাইডার শেষ না করা পর্যন্ত রিফান্ড ব্লক করা হয়েছে।`,
                },
              };
            }
          } catch {
            return {
              status: 502,
              json: {
                success: false,
                outcome: 'blocked_unreachable',
                error: '⚠️ প্রোভাইডার সার্ভারের সাথে যোগাযোগ করা যায়নি। আগে প্রোভাইডার প্যানেল যাচাই করুন বা Force Refund দিন।',
              },
            };
          }
        }
      }

      order.status = 'cancelled';
      order.refundRequired = true;
      order.refundApplied = Boolean(body?.refundAppliedOnClient);
      order.needsReview = false;
      appendLog(db, 'admin', 'CANCEL_AND_REFUND', `${order.orderCode} (৳${order.pricePaid})`);
      saveDb();
      return {
        status: 200,
        json: {
          success: true,
          outcome: 'refunded',
          refundAmount: order.pricePaid,
          userId: order.userId,
          order,
        },
      };
    }

    return { status: 400, json: { success: false, error: 'Unknown action' } };
  }

  // A9. Save Mr Ai Pay Config
  if (subPath === '/admin/mraipay/save' && method === 'POST') {
    if (body?.enabled !== undefined) db.mraipay.enabled = Boolean(body.enabled);
    if (body?.apiKey && String(body.apiKey).trim()) db.mraipay.apiKeyEnc = encryptSecret(String(body.apiKey).trim());
    if (body?.secretKey && String(body.secretKey).trim()) db.mraipay.secretKeyEnc = encryptSecret(String(body.secretKey).trim());
    if (body?.brandKey && String(body.brandKey).trim()) db.mraipay.brandKeyEnc = encryptSecret(String(body.brandKey).trim());
    appendLog(db, 'admin', 'MRAIPAY_CONFIG', `enabled=${db.mraipay.enabled}`);
    saveDb();
    return {
      status: 200,
      json: {
        success: true,
        mraipay: {
          enabled: db.mraipay.enabled,
          apiKeyMasked: maskSecret(db.mraipay.apiKeyEnc),
          secretKeyMasked: maskSecret(db.mraipay.secretKeyEnc),
          brandKeyMasked: maskSecret(db.mraipay.brandKeyEnc),
          configured: Boolean(db.mraipay.apiKeyEnc && db.mraipay.secretKeyEnc && db.mraipay.brandKeyEnc),
        },
      },
    };
  }

  // A10. Custom Manual Payment Methods CRUD
  if (subPath === '/admin/payment-methods/save' && method === 'POST') {
    const id = String(body?.id || '').trim();
    const methodName = String(body?.methodName || '').trim();
    const accountNumber = String(body?.accountNumber || '').trim();
    const accountType = String(body?.accountType || '').trim();
    const instructions = String(body?.instructions || '').trim();
    if (!methodName || !accountNumber) {
      return { status: 400, json: { success: false, error: 'মেথড নাম ও নম্বর দিন।' } };
    }
    if (id) {
      const m = db.paymentMethods.find((x) => x.id === id);
      if (!m) return { status: 404, json: { success: false, error: 'Not found' } };
      m.methodName = methodName;
      m.accountNumber = accountNumber;
      m.accountType = accountType;
      m.instructions = instructions;
    } else {
      db.paymentMethods.push({
        id: 'pm_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'),
        methodName,
        accountNumber,
        accountType,
        instructions,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }
    appendLog(db, 'admin', 'SAVE_PAYMENT_METHOD', methodName);
    saveDb();
    return { status: 200, json: { success: true, paymentMethods: db.paymentMethods } };
  }

  if (subPath === '/admin/payment-methods/toggle' && method === 'POST') {
    const m = db.paymentMethods.find((x) => x.id === String(body?.id || ''));
    if (!m) return { status: 404, json: { success: false, error: 'Not found' } };
    m.isActive = !m.isActive;
    saveDb();
    return { status: 200, json: { success: true, paymentMethods: db.paymentMethods } };
  }

  if (subPath === '/admin/payment-methods/delete' && method === 'POST') {
    const id = String(body?.id || '');
    db.paymentMethods = db.paymentMethods.filter((x) => x.id !== id);
    appendLog(db, 'admin', 'DELETE_PAYMENT_METHOD', id);
    saveDb();
    return { status: 200, json: { success: true, paymentMethods: db.paymentMethods } };
  }

  // A11. Admin Settings Save
  if (subPath === '/admin/settings/save' && method === 'POST') {
    const s = db.settings;
    if (body?.serverLabel !== undefined) s.serverLabel = String(body.serverLabel || '').trim() || 'Bangladesh (BD) Server';
    if (body?.orderStuckMinutes !== undefined) {
      const mins = parseInt(String(body.orderStuckMinutes), 10);
      if (mins >= 1 && mins <= 1440) s.orderStuckMinutes = mins;
    }
    if (body?.referralMinDeposit !== undefined) {
      const minDep = Number(body.referralMinDeposit);
      if (Number.isFinite(minDep) && minDep >= 0) s.referralMinDeposit = minDep;
    }
    if (body?.referralBonusAmount !== undefined) {
      const bonus = Number(body.referralBonusAmount);
      if (Number.isFinite(bonus) && bonus >= 0) s.referralBonusAmount = bonus;
    }
    if (body?.autoSyncEnabled !== undefined) s.autoSyncEnabled = Boolean(body.autoSyncEnabled);
    if (body?.autoPriceSyncEnabled !== undefined) s.autoPriceSyncEnabled = Boolean(body.autoPriceSyncEnabled);
    if (body?.uidCheckRequired !== undefined) s.uidCheckRequired = Boolean(body.uidCheckRequired);
    if (body?.noticeText !== undefined) s.noticeText = String(body.noticeText || '').trim();
    appendLog(db, 'admin', 'UPDATE_FF_SETTINGS', s.serverLabel);
    saveDb();
    return { status: 200, json: { success: true, settings: s } };
  }

  // A12. CSV Export (Packages or Orders)
  if (subPath === '/admin/export-csv' && method === 'GET') {
    const kind = query.get('kind') || 'packages';
    if (kind === 'orders') {
      const rows = [
        ['OrderCode', 'Date', 'UserName', 'UserId', 'Game', 'Package', 'Qty', 'PlayerUID', 'Nickname', 'PriceBDT', 'CostBDT', 'Status', 'ProviderOrderId'].join(','),
      ];
      for (const o of db.orders) {
        rows.push([
          o.orderCode,
          o.createdAt,
          `"${(o.userName || '').replace(/"/g, '""')}"`,
          o.userId,
          `"${(o.gameName || '').replace(/"/g, '""')}"`,
          `"${(o.pkgName || '').replace(/"/g, '""')}"`,
          o.quantity,
          o.playerId,
          `"${(o.playerNickname || '').replace(/"/g, '""')}"`,
          o.pricePaid,
          o.costBdt,
          o.status,
          o.apiOrderId || '',
        ].join(','));
      }
      return {
        status: 200,
        text: rows.join('\n'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'ff_topup_orders.csv',
      };
    }

    const rows = [
      ['ID', 'GameID', 'CategoryID', 'Name', 'AmountLabel', 'SellPriceBDT', 'CostBDT', 'AutoPrice', 'MarkupType', 'MarkupVal', 'ProviderID', 'ServiceID', 'Enabled'].join(','),
    ];
    for (const p of Object.values(db.catalog)) {
      rows.push([
        p.id,
        p.gameId,
        p.catId,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.diamondAmount.replace(/"/g, '""')}"`,
        p.price,
        p.costPrice ?? '',
        p.autoPrice ? 'YES' : 'NO',
        p.markupType || '',
        p.markupValue ?? '',
        p.apiProviderId || '',
        p.apiServiceId || '',
        p.enabled ? 'ACTIVE' : 'OFF',
      ].join(','));
    }
    return {
      status: 200,
      text: rows.join('\n'),
      contentType: 'text/csv; charset=utf-8',
      filename: 'ff_topup_packages.csv',
    };
  }

  return { status: 404, json: { success: false, error: `Unknown /api/ff-topup route: ${subPath}` } };
}
