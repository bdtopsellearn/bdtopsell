import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';

export type PanelType = 'captcha' | 'non_captcha' | 'api';
export type BoardCurrency = 'USDT' | 'BDT';

export const USD_TO_BDT = 130;
export const MAX_NUMBERS_PER_USER_REQUEST = 10;
export const NUMBER_REQUEST_COOLDOWN_SECONDS = 5;
export const DEFAULT_NUMBER_VALID_TIME_MINUTES = 10;
export const MIN_NUMBER_VALID_TIME_MINUTES = 1;
export const MAX_NUMBER_VALID_TIME_MINUTES = 10080;
export const MAX_NUMBERS_PER_UPLOAD = 100_000;
export const MAX_OTP_GROUPS = 100;
export const API_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const API_MAX_ROWS = 1000;
export const API_BLOCK_RETRY_SECONDS = 10;
export const LEADERBOARD_MIN_ORDERS = 5;

const DATA_DIR = path.join(process.cwd(), 'storage');
const DB_FILE = path.join(DATA_DIR, 'number_system_db.json');

export interface NsCountry {
  id: number;
  name: string;
  iso2: string;
  emoji: string;
  price: number; // stored in USDT
  active: boolean;
  createdAt: string;
}

export interface NsService {
  id: number;
  name: string;
  icon: string;
  active: boolean;
  createdAt: string;
}

export interface NsServiceCountry {
  id: number;
  serviceId: number;
  countryId: number;
  amount: number; // stored in USDT
}

export interface NsNumber {
  id: number;
  countryId: number;
  number: string; // canonical 7-15 digits
  used: 0 | 1;
  assignedUid: string | null;
  assignedName: string | null;
  assignedServiceId: number | null;
  assignedAt: string | null; // ISO UTC
  assignedAtMs: number | null;
  addedAt: string;
}

export interface NsPanel {
  id: number;
  name: string;
  panelType: PanelType;
  loginUrl: string;
  username: string;
  password: string;
  statsUrl: string;
  cookies: Record<string, string>;
  lastSeenTs: string;
  lastSeenKey: string;
  lastScannedAt: string | null;
  active: boolean;
  scanInterval: number; // seconds >= 3
  numberColName: string;
  numberColIdx: number;
  senderColName: string;
  senderColIdx: number;
  messageColName: string;
  messageColIdx: number;
  apiKey: string;
  apiMethod: 'GET' | 'POST';
  apiAuthType: string;
  apiAuthName: string;
  apiRowsPath: string;
  apiNumberField: string;
  apiSenderField: string;
  apiMessageField: string;
  apiTimestampField: string;
  apiRangeField: string;
  apiLastError: string | null;
  lastSmsJson: NsSmsRow | null;
  addedAt: string;
}

export interface NsSmsRow {
  ts: string;
  range: string;
  number: string;
  sender: string;
  message: string;
}

export interface NsTrafficEvent {
  eventKey: string;
  occurredAt: string;
  occurredAtMs: number;
  serviceName: string;
  iso2: string;
  countryName: string;
}

export interface NsOtpDelivery {
  id: string;
  uid: string;
  referrerUid: string | null;
  panelId: number;
  panelName: string;
  serviceId: number | null;
  serviceName: string;
  serviceShort: string;
  countryId: number;
  countryName: string;
  iso2: string;
  emoji: string;
  number: string;
  sender: string;
  message: string;
  otpCode: string;
  otpBonusUsdt: number;
  otpBonusBdt: number;
  ts: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface NsLeaderboardWeeklyCount {
  weekStart: string; // 'YYYY-MM-DD HH:MM:SS'
  uid: string;
  name: string;
  otpCount: number;
}

export interface NsLeaderboardEvent {
  id: number;
  uid: string;
  eventType: 'referral' | 'qualified_referral';
  relatedUid: string;
  occurredAt: string;
}

export interface NsUserMeta {
  uid: string;
  name: string;
  email?: string;
  numericId?: number | string;
  referredByUid?: string | null;
  otpCount: number;
  referralQualified: boolean;
  qualifiedReferrals: number;
  totalInvited: number;
  referralEarningsUsdt: number;
  balanceSnapshotBdt: number;
  lastNumberRequestAtMs: number;
  joinedAt: string;
}

export interface NsForceJoinChannel {
  name: string;
  username: string;
  url?: string;
}

export interface NsSettings {
  numPerUser: number;
  numberValidTimeMinutes: number;
  boardCurrency: BoardCurrency;
  usdToBdt: number;
  leaderboardEnabled: boolean;
  liveTrafficUserEnabled: boolean;
  referralQualificationOtps: number;
  referralQualifiedReward: number; // USDT
  referralOtpCommissionRate: number; // 0..1
  otpGroupIds: string[];
  supportLink: string;
  otpLink: string;
  getNumberLink: string;
  channelLink: string;
  forceJoinEnabled: boolean;
  forceJoinChannels: NsForceJoinChannel[];
  tgBotToken: string;
  withdrawEnabled: boolean;
  minWithdrawUsdt: number;
}

interface NsDatabase {
  version: number;
  seq: {
    country: number;
    service: number;
    serviceCountry: number;
    number: number;
    panel: number;
    lbEvent: number;
  };
  countries: NsCountry[];
  services: NsService[];
  serviceCountries: NsServiceCountry[];
  numbers: NsNumber[];
  panels: NsPanel[];
  trafficEvents: NsTrafficEvent[];
  otpDeliveries: NsOtpDelivery[];
  leaderboardWeeklyCounts: NsLeaderboardWeeklyCount[];
  leaderboardEvents: NsLeaderboardEvent[];
  users: Record<string, NsUserMeta>;
  settings: NsSettings;
  panelUtcRollover: Record<string, string>;
}

const DEFAULT_SETTINGS: NsSettings = {
  numPerUser: 1,
  numberValidTimeMinutes: DEFAULT_NUMBER_VALID_TIME_MINUTES,
  boardCurrency: 'USDT',
  usdToBdt: USD_TO_BDT,
  leaderboardEnabled: true,
  liveTrafficUserEnabled: true,
  referralQualificationOtps: 50,
  referralQualifiedReward: 0.10,
  referralOtpCommissionRate: 0.10,
  otpGroupIds: [],
  supportLink: 'https://t.me/sxsupportgroup',
  otpLink: 'https://t.me/sxotp99',
  getNumberLink: 'https://t.me/sxotp99',
  channelLink: 'https://t.me/sxsupportgroup',
  forceJoinEnabled: false,
  forceJoinChannels: [],
  tgBotToken: '',
  withdrawEnabled: true,
  minWithdrawUsdt: 0.50,
};

// Complete Phone Prefix -> ISO2 Mapping ported from originalbotnu.py
export const PHONE_PREFIX_MAP: Record<string, string> = {
  '1': 'US', '7': 'RU', '20': 'EG', '27': 'ZA', '30': 'GR', '31': 'NL',
  '32': 'BE', '33': 'FR', '34': 'ES', '36': 'HU', '39': 'IT', '40': 'RO',
  '41': 'CH', '43': 'AT', '44': 'GB', '45': 'DK', '46': 'SE', '47': 'NO',
  '48': 'PL', '49': 'DE', '51': 'PE', '52': 'MX', '53': 'CU', '54': 'AR',
  '55': 'BR', '56': 'CL', '57': 'CO', '58': 'VE', '60': 'MY', '61': 'AU',
  '62': 'ID', '63': 'PH', '64': 'NZ', '65': 'SG', '66': 'TH', '81': 'JP',
  '82': 'KR', '84': 'VN', '86': 'CN', '90': 'TR', '91': 'IN', '92': 'PK',
  '93': 'AF', '94': 'LK', '95': 'MM', '98': 'IR', '212': 'MA', '213': 'DZ',
  '216': 'TN', '218': 'LY', '220': 'GM', '221': 'SN', '222': 'MR',
  '223': 'ML', '224': 'GN', '225': 'CI', '226': 'BF', '227': 'NE',
  '228': 'TG', '229': 'BJ', '230': 'MU', '231': 'LR', '232': 'SL',
  '233': 'GH', '234': 'NG', '235': 'TD', '236': 'CF', '237': 'CM',
  '238': 'CV', '240': 'GQ', '241': 'GA', '242': 'CG', '243': 'CD',
  '244': 'AO', '245': 'GW', '248': 'SC', '249': 'SD', '250': 'RW',
  '251': 'ET', '252': 'SO', '253': 'DJ', '254': 'KE', '255': 'TZ',
  '256': 'UG', '257': 'BI', '258': 'MZ', '260': 'ZM', '261': 'MG',
  '263': 'ZW', '264': 'NA', '265': 'MW', '266': 'LS', '267': 'BW',
  '268': 'SZ', '269': 'KM', '291': 'ER', '297': 'AW', '298': 'FO',
  '299': 'GL', '350': 'GI', '351': 'PT', '352': 'LU', '353': 'IE',
  '354': 'IS', '355': 'AL', '356': 'MT', '357': 'CY', '358': 'FI',
  '359': 'BG', '370': 'LT', '371': 'LV', '372': 'EE', '373': 'MD',
  '374': 'AM', '375': 'BY', '376': 'AD', '380': 'UA', '381': 'RS',
  '385': 'HR', '386': 'SI', '387': 'BA', '389': 'MK', '420': 'CZ',
  '421': 'SK', '501': 'BZ', '502': 'GT', '503': 'SV', '504': 'HN',
  '505': 'NI', '506': 'CR', '507': 'PA', '509': 'HT', '591': 'BO',
  '592': 'GY', '593': 'EC', '595': 'PY', '597': 'SR', '598': 'UY',
  '670': 'TL', '673': 'BN', '675': 'PG', '676': 'TO', '677': 'SB',
  '678': 'VU', '679': 'FJ', '685': 'WS', '686': 'KI', '687': 'NC',
  '689': 'PF', '850': 'KP', '852': 'HK', '853': 'MO', '855': 'KH',
  '856': 'LA', '880': 'BD', '886': 'TW', '960': 'MV', '961': 'LB',
  '962': 'JO', '963': 'SY', '964': 'IQ', '965': 'KW', '966': 'SA',
  '967': 'YE', '968': 'OM', '970': 'PS', '971': 'AE', '972': 'IL',
  '973': 'BH', '974': 'QA', '975': 'BT', '976': 'MN', '977': 'NP',
  '992': 'TJ', '993': 'TM', '994': 'AZ', '995': 'GE', '996': 'KG',
  '998': 'UZ',
};

const COUNTRY_NAME_TO_ISO2: Array<[RegExp, string, string]> = [
  [/bangladesh|\bbd\b|\+880/i, 'BD', 'Bangladesh'],
  [/india|\bin\b|\+91/i, 'IN', 'India'],
  [/pakistan|\bpk\b|\+92/i, 'PK', 'Pakistan'],
  [/indonesia|\bid\b|\+62/i, 'ID', 'Indonesia'],
  [/philippines|\bph\b|\+63/i, 'PH', 'Philippines'],
  [/vietnam|\bvn\b|\+84/i, 'VN', 'Vietnam'],
  [/thailand|\bth\b|\+66/i, 'TH', 'Thailand'],
  [/malaysia|\bmy\b|\+60/i, 'MY', 'Malaysia'],
  [/myanmar|burma|\bmm\b|\+95/i, 'MM', 'Myanmar'],
  [/nepal|\bnp\b|\+977/i, 'NP', 'Nepal'],
  [/sri\s*lanka|\blk\b|\+94/i, 'LK', 'Sri Lanka'],
  [/cambodia|\bkh\b|\+855/i, 'KH', 'Cambodia'],
  [/laos|\bla\b|\+856/i, 'LA', 'Laos'],
  [/singapore|\bsg\b|\+65/i, 'SG', 'Singapore'],
  [/united\s*states|\busa\b|\bus\b|\+1\b/i, 'US', 'United States'],
  [/united\s*kingdom|\buk\b|\bgb\b|\+44/i, 'GB', 'United Kingdom'],
  [/russia|\bru\b|\+7\b/i, 'RU', 'Russia'],
  [/nigeria|\bng\b|\+234/i, 'NG', 'Nigeria'],
  [/kenya|\bke\b|\+254/i, 'KE', 'Kenya'],
  [/ghana|\bgh\b|\+233/i, 'GH', 'Ghana'],
  [/ethiopia|\bet\b|\+251/i, 'ET', 'Ethiopia'],
  [/egypt|\beg\b|\+20/i, 'EG', 'Egypt'],
  [/morocco|\bma\b|\+212/i, 'MA', 'Morocco'],
  [/algeria|\bdz\b|\+213/i, 'DZ', 'Algeria'],
  [/turkey|turkiye|\btr\b|\+90/i, 'TR', 'Turkey'],
  [/brazil|\bbr\b|\+55/i, 'BR', 'Brazil'],
  [/mexico|\bmx\b|\+52/i, 'MX', 'Mexico'],
  [/colombia|\bco\b|\+57/i, 'CO', 'Colombia'],
  [/argentina|\bar\b|\+54/i, 'AR', 'Argentina'],
  [/germany|\bde\b|\+49/i, 'DE', 'Germany'],
  [/france|\bfr\b|\+33/i, 'FR', 'France'],
  [/italy|\bit\b|\+39/i, 'IT', 'Italy'],
  [/spain|\bes\b|\+34/i, 'ES', 'Spain'],
  [/poland|\bpl\b|\+48/i, 'PL', 'Poland'],
  [/ukraine|\bua\b|\+380/i, 'UA', 'Ukraine'],
  [/saudi|\bsa\b|\+966/i, 'SA', 'Saudi Arabia'],
  [/uae|emirates|\bae\b|\+971/i, 'AE', 'UAE'],
  [/iraq|\biq\b|\+964/i, 'IQ', 'Iraq'],
  [/afghanistan|\baf\b|\+93/i, 'AF', 'Afghanistan'],
  [/iran|\bir\b|\+98/i, 'IR', 'Iran'],
  [/china|\bcn\b|\+86/i, 'CN', 'China'],
  [/japan|\bjp\b|\+81/i, 'JP', 'Japan'],
  [/korea|\bkr\b|\+82/i, 'KR', 'South Korea'],
  [/hong\s*kong|\bhk\b|\+852/i, 'HK', 'Hong Kong'],
  [/taiwan|\btw\b|\+886/i, 'TW', 'Taiwan'],
  [/south\s*africa|\bza\b|\+27/i, 'ZA', 'South Africa'],
  [/tanzania|\btz\b|\+255/i, 'TZ', 'Tanzania'],
  [/uganda|\bug\b|\+256/i, 'UG', 'Uganda'],
  [/senegal|\bsn\b|\+221/i, 'SN', 'Senegal'],
  [/cameroon|\bcm\b|\+237/i, 'CM', 'Cameroon'],
  [/ivory\s*coast|cote\s*d|\bci\b|\+225/i, 'CI', 'Ivory Coast'],
  [/uzbekistan|\buz\b|\+998/i, 'UZ', 'Uzbekistan'],
  [/kazakhstan|\bkz\b/i, 'KZ', 'Kazakhstan'],
  [/kyrgyzstan|\bkg\b|\+996/i, 'KG', 'Kyrgyzstan'],
  [/tajikistan|\btj\b|\+992/i, 'TJ', 'Tajikistan'],
];

const SERVICE_SHORT_NAMES: Record<string, string> = {
  facebook: 'FB',
  whatsapp: 'WA',
  telegram: 'TG',
  instagram: 'IG',
  tik: 'TT',
  tiktok: 'TT',
  google: 'GO',
  gmail: 'GM',
  twitter: 'TW',
  x: 'X',
  microsoft: 'MS',
  outlook: 'OL',
  amazon: 'AM',
  apple: 'AP',
  snapchat: 'SC',
  discord: 'DC',
  viber: 'VB',
  imo: 'IM',
  line: 'LN',
  wechat: 'WC',
};

const SERVICE_DEFAULT_ICONS: Record<string, string> = {
  whatsapp: '💬',
  facebook: '📘',
  instagram: '📸',
  telegram: '✈️',
  tiktok: '🎵',
  google: '🔍',
  gmail: '📧',
  twitter: '🐦',
  x: '✖️',
  imo: '📞',
  viber: '🟣',
  discord: '🎮',
  snapchat: '👻',
};

// Runtime caches & rate limiters (mirrors Python module globals cleanly)
const panelSmsCache = new Map<number, { fetchedAtMs: number; rows: NsSmsRow[] }>();
const apiThrottledUntil = new Map<number, number>();
const apiInFlight = new Set<number>();
let dirtyFlag = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let backgroundStarted = false;
let lastKeepaliveMs = 0;
let lastUtcRolloverMs = 0;
let otpGroupLastSentMs = 0;
const otpGroupQueue: Array<{ chatId: string; text: string; replyMarkup: any }> = [];
let otpGroupDrainRunning = false;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createInitialDb(): NsDatabase {
  return {
    version: 1,
    seq: {
      country: 0,
      service: 0,
      serviceCountry: 0,
      number: 0,
      panel: 0,
      lbEvent: 0,
    },
    countries: [],
    services: [],
    serviceCountries: [],
    numbers: [],
    panels: [],
    trafficEvents: [],
    otpDeliveries: [],
    leaderboardWeeklyCounts: [],
    leaderboardEvents: [],
    users: {},
    settings: { ...DEFAULT_SETTINGS },
    panelUtcRollover: {},
  };
}

function loadDb(): NsDatabase {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    const fresh = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const fresh = createInitialDb();
    return {
      ...fresh,
      ...parsed,
      seq: { ...fresh.seq, ...(parsed.seq || {}) },
      settings: { ...fresh.settings, ...(parsed.settings || {}) },
      users: parsed.users || {},
      panelUtcRollover: parsed.panelUtcRollover || {},
      countries: Array.isArray(parsed.countries) ? parsed.countries : [],
      services: Array.isArray(parsed.services) ? parsed.services : [],
      serviceCountries: Array.isArray(parsed.serviceCountries) ? parsed.serviceCountries : [],
      numbers: Array.isArray(parsed.numbers) ? parsed.numbers : [],
      panels: Array.isArray(parsed.panels) ? parsed.panels : [],
      trafficEvents: Array.isArray(parsed.trafficEvents) ? parsed.trafficEvents : [],
      otpDeliveries: Array.isArray(parsed.otpDeliveries) ? parsed.otpDeliveries : [],
      leaderboardWeeklyCounts: Array.isArray(parsed.leaderboardWeeklyCounts) ? parsed.leaderboardWeeklyCounts : [],
      leaderboardEvents: Array.isArray(parsed.leaderboardEvents) ? parsed.leaderboardEvents : [],
    };
  } catch {
    return createInitialDb();
  }
}

const db: NsDatabase = loadDb();

function flushDbNow() {
  ensureDir();
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
  dirtyFlag = false;
}

function markDirty() {
  dirtyFlag = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (dirtyFlag) {
      try {
        flushDbNow();
      } catch (e) {
        console.error('[NumberSystem] Persist failed:', e);
      }
    }
  }, 500);
}

// ─── PHONE / FLAG / TEXT UTILITIES ───────────────────────────────────────────

export function countryFlagEmoji(code: string): string {
  const c = String(code || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) {
    return (
      String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65) +
      String.fromCodePoint(0x1f1e6 + c.charCodeAt(1) - 65)
    );
  }
  return '🌐';
}

export function phoneToIso2(number: string): { iso2: string | null; dialCode: string | null } {
  const clean = String(number || '').replace(/\D/g, '');
  for (const len of [3, 2, 1]) {
    const prefix = clean.slice(0, len);
    if (prefix && PHONE_PREFIX_MAP[prefix]) {
      return { iso2: PHONE_PREFIX_MAP[prefix], dialCode: prefix };
    }
  }
  return { iso2: null, dialCode: null };
}

export function normalizePhoneNumber(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return digits;
}

export function normalizeUniqueNumbers(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const num = normalizePhoneNumber(v);
    if (!num || seen.has(num)) continue;
    seen.add(num);
    out.push(num);
  }
  return out;
}

export function stripHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function serviceShortName(name: string): string {
  const clean = String(name || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toLowerCase();
  if (!clean) return 'OTP';
  const first = clean.split(/\s+/)[0];
  if (SERVICE_SHORT_NAMES[first]) return SERVICE_SHORT_NAMES[first];
  const letters = clean.replace(/[^a-z]/g, '');
  return (letters.slice(0, 2) || 'OT').toUpperCase();
}

export function serviceDefaultIcon(name: string): string {
  const clean = String(name || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toLowerCase();
  const first = clean.split(/\s+/)[0];
  return SERVICE_DEFAULT_ICONS[first] || '🔔';
}

export function serviceMappingKey(name: string): string {
  return String(name || '').replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
}

export function extractOtp(message: string): string | null {
  const text = String(message || '');
  const patterns = [
    /(?:OTP|code|kode|verification|verify|confirm|passcode|password|PIN|token)[^\d]{0,12}(\d{4,8})/i,
    /(\d{4,8})(?:\s+is\s+your|\s+ist\s+dein|\s+es\s+tu)/i,
    /\b(\d{4,8})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function parseCountryInput(raw: string): { name: string; iso2: string; emoji: string } {
  const trimmed = String(raw || '').trim();
  const digitsOnly = trimmed.replace(/^\+/, '');
  // Check flag emoji inside string
  const flagMatch = trimmed.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
  if (/^\d{1,3}$/.test(digitsOnly) && PHONE_PREFIX_MAP[digitsOnly]) {
    const iso2 = PHONE_PREFIX_MAP[digitsOnly];
    const found = COUNTRY_NAME_TO_ISO2.find(([, code]) => code === iso2);
    return {
      name: found ? found[2] : iso2,
      iso2,
      emoji: countryFlagEmoji(iso2),
    };
  }
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const iso2 = trimmed.toUpperCase();
    const found = COUNTRY_NAME_TO_ISO2.find(([, code]) => code === iso2);
    return {
      name: found ? found[2] : iso2,
      iso2,
      emoji: countryFlagEmoji(iso2),
    };
  }
  for (const [regex, iso2, canonical] of COUNTRY_NAME_TO_ISO2) {
    if (regex.test(trimmed)) {
      const cleanName = trimmed.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '').trim() || canonical;
      return {
        name: cleanName,
        iso2,
        emoji: flagMatch ? flagMatch[0] : countryFlagEmoji(iso2),
      };
    }
  }
  const cleanName = trimmed.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '').trim() || trimmed;
  return {
    name: cleanName,
    iso2: cleanName.slice(0, 2).toUpperCase() || 'UN',
    emoji: flagMatch ? flagMatch[0] : '🌐',
  };
}

// ─── BULK FILE PARSING (TXT / CSV / XLSX via AdmZip) ────────────────────────

export function parseNumberFileBase64(filename: string, base64Data: string): string[] {
  const cleanB64 = String(base64Data || '').replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(cleanB64, 'base64');
  const ext = path.extname(filename || '').toLowerCase();

  if (ext === '.xlsx' || ext === '.xlsm') {
    return parseXlsxBuffer(buf);
  }
  const text = buf.toString('utf-8');
  if (ext === '.csv') {
    return text
      .split(/\r?\n/)
      .flatMap((line) => line.split(/[,;\t]/))
      .map((c) => c.replace(/^["']|["']$/g, '').trim())
      .filter(Boolean);
  }
  // Default .txt or raw lines
  return text
    .split(/\r?\n|[,;\t]+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseXlsxBuffer(buf: Buffer): string[] {
  const out: string[] = [];
  const zip = new AdmZip(buf);
  const sharedStrings: string[] = [];

  const ssEntry = zip.getEntry('xl/sharedStrings.xml');
  if (ssEntry) {
    const ssXml = ssEntry.getData().toString('utf-8');
    const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
      const joined = tMatches
        .map((t) => stripHtml(t))
        .join('');
      sharedStrings.push(joined);
    }
  }

  for (const entry of zip.getEntries()) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.entryName)) continue;
    const xml = entry.getData().toString('utf-8');
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let m: RegExpExecArray | null;
    while ((m = cellRegex.exec(xml)) !== null) {
      const attrs = m[1] || '';
      const inner = m[2] || '';
      const tAttr = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
      if (tAttr === 'inlineStr') {
        const inlineVal = (inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '';
        if (inlineVal) out.push(stripHtml(inlineVal));
      } else {
        const vMatch = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        if (!vMatch) continue;
        const rawVal = vMatch[1].trim();
        if (tAttr === 's') {
          const idx = parseInt(rawVal, 10);
          if (!Number.isNaN(idx) && sharedStrings[idx] !== undefined) {
            out.push(sharedStrings[idx]);
          }
        } else {
          // Handle scientific notation like 8.80171E+12 from Excel numeric columns
          if (/^\d+(?:\.\d+)?[eE]\+\d+$/.test(rawVal)) {
            const num = Number(rawVal);
            if (Number.isFinite(num)) out.push(num.toLocaleString('fullwide', { useGrouping: false }));
          } else {
            out.push(rawVal);
          }
        }
      }
    }
  }
  return out;
}

// ─── API FIELD / ENVELOPE PARSING & PANEL CONNECTORS ─────────────────────────

function apiKeyName(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function apiPathValue(value: unknown, dottedPath: string | null | undefined): unknown {
  if (!dottedPath) return value;
  let cur: any = value;
  for (const part of String(dottedPath).trim().split('.')) {
    if (!part) continue;
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      if (!(part in cur)) return undefined;
      cur = cur[part];
    } else if (Array.isArray(cur) && /^\d+$/.test(part)) {
      const idx = parseInt(part, 10);
      if (idx >= cur.length) return undefined;
      cur = cur[idx];
    } else {
      return undefined;
    }
  }
  return cur;
}

function apiMappingValue(
  row: Record<string, unknown>,
  customName: string | null | undefined,
  normalized: Record<string, unknown>
): unknown {
  if (!customName) return undefined;
  const clean = String(customName).trim();
  if (clean.includes('.')) return apiPathValue(row, clean);
  return normalized[apiKeyName(clean)];
}

export function apiPayloadRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const preferred = [
    'data', 'results', 'messages', 'aaData', 'items', 'rows',
    'records', 'response', 'result', 'payload',
  ];
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    normalized[apiKeyName(k)] = v;
  }
  for (const key of preferred) {
    const val = normalized[apiKeyName(key)];
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object') {
      const nested = apiPayloadRows(val);
      if (nested.length > 0) return nested;
    }
  }
  const smsFields = new Set([
    'number', 'phone', 'phonenumber', 'msisdn', 'mobile',
    'message', 'sms', 'text', 'body', 'content',
  ]);
  for (const k of Object.keys(normalized)) {
    if (smsFields.has(k)) return [obj];
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) return v;
  }
  return [];
}

function apiRowValues(
  row: unknown,
  numberIdx: number,
  senderIdx: number,
  messageIdx: number,
  fieldMap: Record<string, string | undefined> = {}
): string[] {
  const size = Math.max(numberIdx, senderIdx, messageIdx, 1) + 1;
  if (Array.isArray(row)) {
    const copy = row.map((v) => String(v ?? ''));
    while (copy.length < size) copy.push('');
    return copy;
  }
  if (row && typeof row === 'object') {
    const obj = row as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      normalized[apiKeyName(k)] = v;
    }
    const firstValue = (names: string[]): string => {
      for (const n of names) {
        const val = normalized[apiKeyName(n)];
        if (val !== undefined && val !== null && String(val).trim()) {
          return String(val);
        }
      }
      return '';
    };
    const configuredValue = (key: string, defaults: string[]): string => {
      const custom = apiMappingValue(obj, fieldMap[key], normalized);
      if (custom !== undefined && custom !== null && String(custom).trim()) {
        return String(custom);
      }
      return firstValue(defaults);
    };

    const ts = configuredValue('timestamp', [
      'timestamp', 'time', 'date', 'datetime', 'created_at', 'created', 'createdAt',
      'received_at', 'receivedAt', 'sent_at', 'sentAt', 'date_time', 'dateTime',
      'dt', 'created_on', 'createdOn', 'received_on', 'receivedOn',
      'message_id', 'messageId', 'sms_id', 'smsId', 'id',
    ]);
    const rng = configuredValue('range', ['range', 'country', 'country_code', 'countryCode']);
    const number = configuredValue('number', [
      'number', 'phone', 'phone_number', 'phoneNumber', 'msisdn',
      'mobile', 'mobile_number', 'mobileNumber', 'recipient',
      'to', 'destination', 'num', 'phone_num', 'phoneNo',
      'recipient_number', 'number_value',
    ]);
    const sender = configuredValue('sender', [
      'sender', 'cli', 'service', 'from', 'origin', 'source',
      'sender_id', 'senderId', 'from_number', 'fromNumber',
    ]);
    const message = configuredValue('message', [
      'message', 'sms', 'text', 'body', 'content', 'message_text',
      'messageText', 'sms_text', 'smsText', 'msg',
    ]);
    if (number || sender || message) {
      const vals = new Array<string>(size).fill('');
      vals[0] = ts;
      vals[1] = rng;
      vals[numberIdx] = number;
      vals[senderIdx] = sender;
      vals[messageIdx] = message;
      return vals;
    }
    const rawVals = Object.values(obj).map((v) => String(v ?? ''));
    while (rawVals.length < size) rawVals.push('');
    return rawVals;
  }
  return [];
}

export function parseApiMappingString(raw: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  const text = String(raw || '').trim();
  if (!text || ['none', 'auto', '-'].includes(text.toLowerCase())) return mapping;
  for (const item of text.split(/[;,]\s*/)) {
    const eq = item.indexOf('=');
    if (eq === -1) continue;
    const key = item.slice(0, eq).trim().toLowerCase();
    const val = item.slice(eq + 1).trim();
    const aliases: Record<string, string> = {
      rows: 'apiRowsPath',
      path: 'apiRowsPath',
      number: 'apiNumberField',
      phone: 'apiNumberField',
      sender: 'apiSenderField',
      cli: 'apiSenderField',
      message: 'apiMessageField',
      sms: 'apiMessageField',
      time: 'apiTimestampField',
      timestamp: 'apiTimestampField',
      range: 'apiRangeField',
      country: 'apiRangeField',
    };
    if (aliases[key] && val) mapping[aliases[key]] = val;
  }
  return mapping;
}

function cleanApiToken(val: string): string {
  return String(val || '').trim().replace(/^(?:bearer|token|api[\s_-]*key)\s+/i, '');
}

interface RequestAttempt {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  query?: Record<string, string>;
  bodyForm?: Record<string, string>;
  bodyJson?: Record<string, string>;
  authConfig: [string, string];
}

function buildApiRequestAttempts(panel: NsPanel): RequestAttempt[] {
  const method: 'GET' | 'POST' = panel.apiMethod === 'POST' ? 'POST' : 'GET';
  const key = String(panel.apiKey || '').trim();
  const authType = String(panel.apiAuthType || 'auto').toLowerCase();
  const authName = String(panel.apiAuthName || '').trim();
  const token = cleanApiToken(key);
  const baseHeaders: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (compatible; SMSBot/1.0)',
  };

  const one = (
    authConfig: [string, string],
    extraHeaders?: Record<string, string>,
    extra: Partial<RequestAttempt> = {}
  ): RequestAttempt => ({
    method: extra.method || method,
    headers: { ...baseHeaders, ...(extraHeaders || {}) },
    query: extra.query,
    bodyForm: extra.bodyForm,
    bodyJson: extra.bodyJson,
    authConfig,
  });

  if (authType === 'none' || !token) return [one(['none', ''])];
  if (authType === 'basic') {
    if (!key.includes(':')) return [];
    const encoded = Buffer.from(key, 'utf-8').toString('base64');
    return [one(['basic', ''], { Authorization: `Basic ${encoded}` })];
  }
  if (authType === 'bearer') return [one(['bearer', ''], { Authorization: `Bearer ${token}` })];
  if (authType === 'raw_authorization' || authType === 'raw') return [one(['raw_authorization', ''], { Authorization: key })];
  if (authType === 'token') return [one(['token', ''], { Authorization: `Token ${token}` })];
  if (authType === 'x_auth_token') return [one(['x_auth_token', ''], { 'X-Auth-Token': token })];
  if (authType === 'x_api_key') return [one(['x_api_key', ''], { 'X-API-Key': token })];
  if (authType === 'api_key_header') return [one(['api_key_header', ''], { 'api-key': token })];
  if (authType === 'custom_header') return [one(['custom_header', authName || 'Authorization'], { [authName || 'Authorization']: token })];
  if (authType === 'custom_query' || authType === 'query') return [one(['custom_query', authName || 'api_key'], undefined, { query: { [authName || 'api_key']: token } })];
  if (authType === 'token_query') return [one(['token_query', 'token'], undefined, { query: { token } })];
  if (authType === 'post_form') return [one(['post_form', authName || 'api_key'], { 'Content-Type': 'application/x-www-form-urlencoded' }, { method: 'POST', bodyForm: { [authName || 'api_key']: token } })];
  if (authType === 'post_json') return [one(['post_json', authName || 'api_key'], { 'Content-Type': 'application/json' }, { method: 'POST', bodyJson: { [authName || 'api_key']: token } })];

  // Auto mode (all 9 fallback formats just like originalbotnu.py)
  return [
    one(['bearer', ''], { Authorization: `Bearer ${token}` }),
    one(['x_api_key', ''], { 'X-API-Key': token }),
    one(['raw_authorization', ''], { Authorization: token }),
    one(['token', ''], { Authorization: `Token ${token}` }),
    one(['x_auth_token', ''], { 'X-Auth-Token': token }),
    one(['api_key_header', ''], { 'api-key': token }),
    one(['token_query', ''], undefined, { query: { token } }),
    one(['custom_query', 'api_key'], undefined, { query: { api_key: token } }),
    one(['custom_query', 'access_token'], undefined, { query: { access_token: token } }),
  ];
}

function apiResponseIsAuthError(status: number, payload: unknown): boolean {
  if (status === 401 || status === 403) return true;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const obj = payload as Record<string, unknown>;
  const stat = String(obj.status || obj.state || obj.result || '').toLowerCase();
  const success = obj.success;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const nk = apiKeyName(k);
    if (['status', 'state', 'result', 'success', 'error', 'errors', 'message', 'msg', 'detail', 'reason', 'code'].includes(nk)) {
      parts.push(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
    }
  }
  const msg = parts.join(' ').toLowerCase();
  const authWords = ['unauthor', 'invalid key', 'invalid token', 'authentication', 'access denied', 'forbidden', 'not allowed'];
  const authMatch = authWords.some((w) => msg.includes(w));
  return authMatch && (['error', 'failed', 'failure', 'false'].includes(stat) || success === false || msg.includes('unauthor'));
}

// Lightweight Cookie Jar & HTTP helper (mirrors requests.Session)
function extractSetCookies(res: Response, jar: Record<string, string>) {
  const anyHeaders = res.headers as any;
  let setCookies: string[] = [];
  if (typeof anyHeaders.getSetCookie === 'function') {
    setCookies = anyHeaders.getSetCookie();
  } else {
    const raw = res.headers.get('set-cookie');
    if (raw) setCookies = raw.split(/,(?=[^;]+=[^;]+)/);
  }
  for (const item of setCookies) {
    const pair = item.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (k) jar[k] = v;
    }
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function fetchWithCookies(
  url: string,
  jar: Record<string, string>,
  opts: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    maxRedirects?: number;
    timeoutMs?: number;
  } = {}
): Promise<{ status: number; finalUrl: string; text: string }> {
  let currentUrl = url;
  let method = opts.method || 'GET';
  let body = opts.body;
  const maxRedirects = opts.maxRedirects ?? 6;
  const baseHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(opts.headers || {}),
  };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const headers: Record<string, string> = { ...baseHeaders };
    const ch = cookieHeader(jar);
    if (ch) headers['Cookie'] = ch;

    const res = await fetch(currentUrl, {
      method,
      headers,
      body: method === 'POST' ? body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    extractSetCookies(res, jar);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        currentUrl = new URL(loc, currentUrl).toString();
        if (res.status === 301 || res.status === 302 || res.status === 303) {
          method = 'GET';
          body = undefined;
          delete baseHeaders['Content-Type'];
        }
        continue;
      }
    }
    const text = await res.text();
    return { status: res.status, finalUrl: currentUrl, text };
  }
  throw new Error('Too many redirects');
}

function panelSessionExpired(status: number, text: string, finalUrl: string): boolean {
  if (status === 401 || status === 403) return true;
  const body = String(text || '').toLowerCase();
  const u = String(finalUrl || '').toLowerCase();
  if (['dashboard', 'smscdr', 'cdr reports', 'logout', 'sign out'].some((m) => body.includes(m))) {
    return false;
  }
  const hasPass =
    body.includes('name="password"') ||
    body.includes("name='password'") ||
    body.includes('type="password"') ||
    body.includes("type='password'");
  return hasPass || ['/login', '/signin', '/auth'].some((m) => u.includes(m));
}

function parseLoginForms(loginUrl: string, html: string) {
  const candidates: Array<{ method: 'GET' | 'POST'; action: string; fields: Record<string, string> }> = [];
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let fm: RegExpExecArray | null;
  while ((fm = formRegex.exec(html || '')) !== null) {
    const attrs = fm[1] || '';
    const inner = fm[2] || '';
    const actionRaw = (attrs.match(/\baction\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const methodRaw = ((attrs.match(/\bmethod\s*=\s*["']([^"']*)["']/i) || [])[1] || 'POST').toUpperCase();
    const fields: Record<string, string> = {};
    const inputRegex = /<input\b([^>]*)>/gi;
    let im: RegExpExecArray | null;
    while ((im = inputRegex.exec(inner)) !== null) {
      const ia = im[1] || '';
      const name = (ia.match(/\bname\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!name) continue;
      const val = (ia.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
      fields[name] = val;
    }
    const normalized: Record<string, string> = {};
    for (const k of Object.keys(fields)) normalized[apiKeyName(k)] = k;

    const userNames = ['username', 'user_name', 'user', 'email', 'login', 'account'];
    const passNames = ['password', 'pass', 'passwd', 'user_password'];

    let userField = userNames.map((n) => normalized[apiKeyName(n)]).find(Boolean);
    if (!userField) {
      userField = Object.entries(normalized).find(([nk]) => ['user', 'login', 'email', 'account'].some((m) => nk.includes(m)))?.[1] || 'username';
    }
    let passField = passNames.map((n) => normalized[apiKeyName(n)]).find(Boolean);
    if (!passField) {
      passField = Object.entries(normalized).find(([nk]) => ['pass', 'pwd', 'secret'].some((m) => nk.includes(m)))?.[1] || 'password';
    }
    fields[userField] = '__PANEL_USERNAME__';
    fields[passField] = '__PANEL_PASSWORD__';
    candidates.push({
      method: methodRaw === 'GET' ? 'GET' : 'POST',
      action: new URL(actionRaw || loginUrl, loginUrl).toString(),
      fields,
    });
  }
  if (candidates.length === 0) {
    candidates.push(
      { method: 'POST', action: loginUrl, fields: { username: '__PANEL_USERNAME__', password: '__PANEL_PASSWORD__' } },
      { method: 'POST', action: new URL('signin', loginUrl).toString(), fields: { username: '__PANEL_USERNAME__', password: '__PANEL_PASSWORD__' } }
    );
  }
  return candidates;
}

export async function panelDoLogin(
  panelType: PanelType,
  loginUrl: string,
  username: string,
  password: string,
  statsUrl: string
): Promise<{ ok: boolean; cookies?: Record<string, string>; error?: string }> {
  const jar: Record<string, string> = {};
  try {
    const first = await fetchWithCookies(loginUrl, jar, {
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    if (first.status >= 400) {
      return { ok: false, error: `HTTP ${first.status} fetching login page` };
    }
    const parsedLogin = new URL(loginUrl);
    const origin = `${parsedLogin.protocol}//${parsedLogin.host}`;

    if (panelType === 'captcha') {
      const q = first.text.match(/What is (\d+)\s*\+\s*(\d+)/i) || first.text.match(/(?<!\d)(\d+)\s*\+\s*(\d+)(?!\d)/);
      if (!q) {
        return { ok: false, error: 'Math captcha ("What is X + Y") not found on login page' };
      }
      const ans = String(parseInt(q[1], 10) + parseInt(q[2], 10));
      const base = loginUrl.replace(/\/[^/]*$/, '');
      const signinUrl = `${base}/signin`;
      const formBody = new URLSearchParams({ username, password, capt: ans }).toString();
      const res2 = await fetchWithCookies(signinUrl, jar, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: loginUrl,
          Origin: origin,
        },
        body: formBody,
      });
      if (res2.status >= 400) {
        return { ok: false, error: `Signin HTTP ${res2.status}` };
      }
      const body = res2.text.toLowerCase();
      const invalidCred = ['username/password invalid', 'invalid username', 'invalid password', 'incorrect username', 'incorrect password'].some((m) => body.includes(m));
      const loginFormVisible = body.includes('name="username"') && body.includes('name="password"');
      if (!loginFormVisible && !invalidCred && (body.includes('dashboard') || body.includes('agent panel') || body.includes('smscdrstats') || !res2.finalUrl.toLowerCase().includes('/login'))) {
        return { ok: true, cookies: jar };
      }
      return { ok: false, error: invalidCred ? 'Invalid username/password or wrong captcha' : 'Login rejected' };
    }

    // non_captcha HTML form login
    const candidates = parseLoginForms(loginUrl, first.text);
    for (const c of candidates) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(c.fields)) {
        params.set(
          k,
          v === '__PANEL_USERNAME__' ? username : v === '__PANEL_PASSWORD__' ? password : v
        );
      }
      let targetUrl = c.action;
      let body: string | undefined;
      const headers: Record<string, string> = { Referer: loginUrl, Origin: origin };
      if (c.method === 'GET') {
        const u = new URL(targetUrl);
        params.forEach((val, key) => u.searchParams.set(key, val));
        targetUrl = u.toString();
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = params.toString();
      }
      const cookiesBefore = JSON.stringify(jar);
      const r2 = await fetchWithCookies(targetUrl, jar, { method: c.method, headers, body });
      if (r2.status >= 400) continue;

      let jsonOk = false;
      try {
        const j = JSON.parse(r2.text);
        if (j && typeof j === 'object') {
          if (j.success === false || j.authenticated === false) continue;
          if (j.success === true || j.authenticated === true || j.access_token || j.token) jsonOk = true;
        }
      } catch {
        // HTML response
      }
      const bodyLow = r2.text.toLowerCase();
      const invalidMarker = ['invalid username', 'invalid password', 'invalid credentials', 'incorrect password', 'login failed', 'authentication failed'].some((m) => bodyLow.includes(m));
      if (invalidMarker) continue;
      const okMarker = ['dashboard', 'smscdr', 'cdr reports', 'logout', 'sign out'].some((m) => bodyLow.includes(m));
      const hasPassField = bodyLow.includes('name="password"') || bodyLow.includes('type="password"');
      const changedCookies = JSON.stringify(jar) !== cookiesBefore;
      const movedPath = !['/login', '/signin', '/auth'].some((m) => new URL(r2.finalUrl).pathname.toLowerCase().includes(m));
      if (jsonOk || okMarker || (!hasPassField && (changedCookies || movedPath))) {
        if (statsUrl) {
          const check = await fetchWithCookies(statsUrl, jar);
          if (check.status < 400 && !panelSessionExpired(check.status, check.text, check.finalUrl)) {
            return { ok: true, cookies: jar };
          }
        } else {
          return { ok: true, cookies: jar };
        }
      }
    }
    return { ok: false, error: 'Web panel login failed (check credentials or JS-only protection)' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Panel login network error' };
  }
}

function extractAjaxSource(html: string, statsUrl: string): string | null {
  const patterns = [
    /"sAjaxSource"\s*:\s*"([^"]+)"/,
    /AjaxSource"?\s*:\s*"([^"]+)"/,
    /"ajax"\s*:\s*"([^"]+)"/,
    /'sAjaxSource'\s*:\s*'([^']+)'/,
    /'ajax'\s*:\s*'([^']+)'/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const cleaned = m[1].replace(/\\\//g, '/').replace(/&amp;/g, '&');
      return new URL(cleaned, statsUrl).toString();
    }
  }
  return null;
}

function extractHtmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const tbodyMatch = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  const scope = tbodyMatch ? tbodyMatch[1] : html;
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRegex.exec(scope)) !== null) {
    const cells: string[] = [];
    const tdRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRegex.exec(tr[1])) !== null) {
      cells.push(stripHtml(td[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

export async function panelFetchRawRow(panel: NsPanel): Promise<{ ok: boolean; row: unknown; expired?: boolean; error?: string }> {
  if (panel.panelType === 'api') {
    const statsUrl = String(panel.statsUrl || '').trim();
    if (!statsUrl) return { ok: false, row: null, error: 'Missing API URL' };
    try {
      const attempts = buildApiRequestAttempts(panel);
      for (const att of attempts) {
        const u = new URL(statsUrl);
        if (att.query) {
          for (const [k, v] of Object.entries(att.query)) u.searchParams.set(k, v);
        }
        let body: string | undefined;
        if (att.bodyForm) body = new URLSearchParams(att.bodyForm).toString();
        else if (att.bodyJson) body = JSON.stringify(att.bodyJson);
        const res = await fetch(u.toString(), {
          method: att.method,
          headers: att.headers,
          body,
          signal: AbortSignal.timeout(15000),
        });
        if (res.status === 429) {
          const retry = parseFloat(res.headers.get('retry-after') || '0') || API_BLOCK_RETRY_SECONDS;
          apiThrottledUntil.set(panel.id, Date.now() + retry * 1000);
          panel.apiLastError = `HTTP 429 rate limited; retry in ${Math.ceil(retry)}s`;
          markDirty();
          return { ok: false, row: null, error: panel.apiLastError };
        }
        const text = await res.text();
        let payload: unknown = null;
        try { payload = JSON.parse(text); } catch { /* not json */ }
        if (apiResponseIsAuthError(res.status, payload)) continue;
        if (res.status >= 400) continue;
        if (payload === null) continue;
        let rows = apiPathValue(payload, panel.apiRowsPath);
        if (!Array.isArray(rows)) rows = apiPayloadRows(payload);
        return { ok: true, row: (rows as unknown[])[0] ?? [] };
      }
      return { ok: false, row: null, error: 'API authentication failed' };
    } catch (e: any) {
      return { ok: false, row: null, error: e?.message || 'API raw fetch error' };
    }
  }

  // Web panel
  const jar = { ...(panel.cookies || {}) };
  try {
    let r = await fetchWithCookies(panel.statsUrl, jar);
    if (panelSessionExpired(r.status, r.text, r.finalUrl)) {
      const relogin = await panelDoLogin(panel.panelType, panel.loginUrl, panel.username, panel.password, panel.statsUrl);
      if (!relogin.ok || !relogin.cookies) {
        return { ok: false, row: null, expired: true, error: relogin.error || 'Session expired' };
      }
      Object.assign(jar, relogin.cookies);
      panel.cookies = jar;
      markDirty();
      r = await fetchWithCookies(panel.statsUrl, jar);
    }
    const ajaxUrl = extractAjaxSource(r.text, panel.statsUrl);
    if (ajaxUrl) {
      const r2 = await fetchWithCookies(ajaxUrl, jar, {
        headers: {
          Referer: panel.statsUrl,
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/javascript, */*',
        },
      });
      const data = JSON.parse(r2.text);
      const rows = Array.isArray(data?.aaData) ? data.aaData : Array.isArray(data?.data) ? data.data : apiPayloadRows(data);
      return { ok: true, row: rows[0] ?? [] };
    }
    const htmlRows = extractHtmlTableRows(r.text);
    return { ok: true, row: htmlRows[0] ?? [] };
  } catch (e: any) {
    return { ok: false, row: null, error: e?.message || 'Raw fetch error' };
  }
}

export async function panelFetchSms(
  panel: NsPanel,
  limit?: number,
  forceRefresh = false
): Promise<{ ok: boolean; rows: NsSmsRow[]; expired?: boolean; error?: string }> {
  const ttlMs = panel.panelType === 'api' ? 3000 : 15000;
  if (!forceRefresh) {
    const cached = panelSmsCache.get(panel.id);
    if (cached && Date.now() - cached.fetchedAtMs < ttlMs) {
      return { ok: true, rows: limit ? cached.rows.slice(0, limit) : cached.rows };
    }
  }

  const numIdx = panel.numberColIdx ?? 2;
  const sndIdx = panel.senderColIdx ?? 3;
  const msgIdx = panel.messageColIdx ?? 5;
  const minLen = Math.max(numIdx, sndIdx, msgIdx) + 1;

  if (panel.panelType === 'api') {
    const now = Date.now();
    const blocked = apiThrottledUntil.get(panel.id) || 0;
    if (blocked > now && !forceRefresh) {
      const stale = panelSmsCache.get(panel.id)?.rows || (panel.lastSmsJson ? [panel.lastSmsJson] : []);
      return { ok: true, rows: limit ? stale.slice(0, limit) : stale };
    }
    if (!panel.statsUrl) return { ok: false, rows: [], error: 'Missing API URL' };
    try {
      const attempts = buildApiRequestAttempts(panel);
      let payload: unknown = null;
      let authFailed = false;
      let lastErr = '';
      for (let i = 0; i < attempts.length; i++) {
        const att = attempts[i];
        const u = new URL(panel.statsUrl);
        if (att.query) for (const [k, v] of Object.entries(att.query)) u.searchParams.set(k, v);
        let body: string | undefined;
        if (att.bodyForm) body = new URLSearchParams(att.bodyForm).toString();
        else if (att.bodyJson) body = JSON.stringify(att.bodyJson);

        const res = await fetch(u.toString(), {
          method: att.method,
          headers: att.headers,
          body,
          signal: AbortSignal.timeout(15000),
        });
        const text = await res.text();
        if (text.length > API_MAX_RESPONSE_BYTES) {
          lastErr = 'API response exceeded 2MB limit';
          continue;
        }
        let parsed: unknown = null;
        try { parsed = JSON.parse(text); } catch { /* ignore */ }
        if (apiResponseIsAuthError(res.status, parsed)) {
          authFailed = true;
          continue;
        }
        if (res.status === 429) {
          const retry = parseFloat(res.headers.get('retry-after') || '0') || API_BLOCK_RETRY_SECONDS;
          apiThrottledUntil.set(panel.id, Date.now() + retry * 1000);
          if (panel.apiAuthType === 'auto' && i < attempts.length - 1) continue;
          panel.apiLastError = `HTTP 429 rate limited; retry in ${Math.ceil(retry)}s`;
          markDirty();
          const stale = panelSmsCache.get(panel.id)?.rows || (panel.lastSmsJson ? [panel.lastSmsJson] : []);
          return { ok: true, rows: limit ? stale.slice(0, limit) : stale };
        }
        if (res.status >= 400 || parsed === null) {
          lastErr = `HTTP ${res.status}`;
          continue;
        }
        payload = parsed;
        if (panel.apiAuthType === 'auto') {
          panel.apiAuthType = att.authConfig[0];
          panel.apiAuthName = att.authConfig[1];
        }
        break;
      }

      if (payload === null) {
        panel.apiLastError = authFailed ? 'Authentication failed (401/403)' : lastErr || 'API fetch failed';
        markDirty();
        return { ok: false, rows: [], expired: authFailed, error: panel.apiLastError };
      }

      let rawRows = apiPathValue(payload, panel.apiRowsPath);
      if (!Array.isArray(rawRows)) rawRows = apiPayloadRows(payload);
      const bounded = (rawRows as unknown[]).slice(0, API_MAX_ROWS);
      const fieldMap = {
        number: panel.apiNumberField,
        sender: panel.apiSenderField,
        message: panel.apiMessageField,
        timestamp: panel.apiTimestampField,
        range: panel.apiRangeField,
      };
      const results: NsSmsRow[] = [];
      bounded.forEach((row, idx) => {
        const vals = apiRowValues(row, numIdx, sndIdx, msgIdx, fieldMap);
        if (vals.length < minLen) return;
        let ts = stripHtml(vals[0] || '');
        const rng = stripHtml(vals[1] || '');
        const number = stripHtml(vals[numIdx] || '');
        const sender = stripHtml(vals[sndIdx] || '');
        const message = stripHtml(vals[msgIdx] || '');
        if (!ts) ts = String(bounded.length - idx).padStart(12, '0');
        if (!number) return;
        results.push({ ts, range: rng, number, sender, message });
      });
      results.sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0));
      panel.apiLastError = null;
      if (results[0]) panel.lastSmsJson = results[0];
      markDirty();
      panelSmsCache.set(panel.id, { fetchedAtMs: Date.now(), rows: results });
      return { ok: true, rows: limit ? results.slice(0, limit) : results };
    } catch (e: any) {
      panel.apiLastError = e?.message || 'Network request failed';
      markDirty();
      const stale = panelSmsCache.get(panel.id)?.rows || (panel.lastSmsJson ? [panel.lastSmsJson] : []);
      return { ok: false, rows: limit ? stale.slice(0, limit) : stale, error: panel.apiLastError };
    }
  }

  // Web panel (captcha / non_captcha)
  const jar = { ...(panel.cookies || {}) };
  try {
    let r = await fetchWithCookies(panel.statsUrl, jar);
    if (panelSessionExpired(r.status, r.text, r.finalUrl)) {
      const relogin = await panelDoLogin(panel.panelType, panel.loginUrl, panel.username, panel.password, panel.statsUrl);
      if (!relogin.ok || !relogin.cookies) {
        panel.apiLastError = relogin.error || 'Session expired & auto re-login failed';
        markDirty();
        return { ok: false, rows: [], expired: true, error: panel.apiLastError };
      }
      Object.assign(jar, relogin.cookies);
      panel.cookies = jar;
      markDirty();
      r = await fetchWithCookies(panel.statsUrl, jar);
      if (panelSessionExpired(r.status, r.text, r.finalUrl)) {
        panel.apiLastError = 'Session still expired after re-login';
        markDirty();
        return { ok: false, rows: [], expired: true, error: panel.apiLastError };
      }
    }

    let rawRows: unknown[] = [];
    const ajaxUrl = extractAjaxSource(r.text, panel.statsUrl);
    if (ajaxUrl) {
      const r2 = await fetchWithCookies(ajaxUrl, jar, {
        headers: {
          Referer: panel.statsUrl,
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/javascript, */*',
        },
      });
      if (r2.status < 400) {
        const parsed = JSON.parse(r2.text);
        rawRows = Array.isArray(parsed?.aaData) ? parsed.aaData : Array.isArray(parsed?.data) ? parsed.data : apiPayloadRows(parsed);
      }
    } else {
      rawRows = extractHtmlTableRows(r.text);
    }

    const fieldMap = {
      number: panel.numberColName,
      sender: panel.senderColName,
      message: panel.messageColName,
    };
    const results: NsSmsRow[] = [];
    rawRows.forEach((row, idx) => {
      const vals = apiRowValues(row, numIdx, sndIdx, msgIdx, fieldMap);
      if (vals.length < minLen) return;
      let ts = stripHtml(vals[0] || '');
      const rng = stripHtml(vals[1] || '');
      const number = stripHtml(vals[numIdx] || '');
      const sender = stripHtml(vals[sndIdx] || '');
      const message = stripHtml(vals[msgIdx] || '');
      if (!ts) ts = String(rawRows.length - idx).padStart(12, '0');
      if (!number) return;
      results.push({ ts, range: rng, number, sender, message });
    });
    results.sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0));
    panel.cookies = jar;
    panel.apiLastError = null;
    if (results[0]) panel.lastSmsJson = results[0];
    markDirty();
    panelSmsCache.set(panel.id, { fetchedAtMs: Date.now(), rows: results });
    return { ok: true, rows: limit ? results.slice(0, limit) : results };
  } catch (e: any) {
    panel.apiLastError = e?.message || 'Web panel fetch error';
    markDirty();
    const stale = panelSmsCache.get(panel.id)?.rows || (panel.lastSmsJson ? [panel.lastSmsJson] : []);
    return { ok: false, rows: limit ? stale.slice(0, limit) : stale, error: panel.apiLastError };
  }
}

// ─── CURSOR, TRAFFIC, LEADERBOARD, OTP DELIVERY ──────────────────────────────

function smsCursorKey(sms: NsSmsRow): string {
  const payload = [sms.ts, sms.number, sms.sender, sms.message].join('\x1f');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function getActiveWeekPeriod(refDate = new Date()): { weekStart: string; weekEnd: string } {
  // Friday 00:00 UTC to next Friday 00:00 UTC
  const day = refDate.getUTCDay(); // Sun=0..Fri=5..Sat=6
  const daysSinceFriday = (day - 5 + 7) % 7;
  const start = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate() - daysSinceFriday, 0, 0, 0));
  const end = new Date(start.getTime() + 7 * 86400 * 1000);
  const fmt = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
  return { weekStart: fmt(start), weekEnd: fmt(end) };
}

function recordTrafficEvent(panelId: number, sms: NsSmsRow): boolean {
  const senderClean = String(sms.sender || '').replace(/\s+/g, ' ').trim() || 'Unknown';
  const eventKey = crypto
    .createHash('sha256')
    .update([String(panelId), sms.ts, sms.number, senderClean, sms.message].join('|'))
    .digest('hex');
  if (db.trafficEvents.some((e) => e.eventKey === eventKey)) return false;

  const digits = normalizePhoneNumber(sms.number);
  const { iso2 } = phoneToIso2(digits || sms.number);
  let countryName = '';
  const invMatch = db.numbers.find((n) => n.number === digits);
  if (invMatch) {
    countryName = db.countries.find((c) => c.id === invMatch.countryId)?.name || '';
  }
  if (!countryName && iso2) {
    countryName = db.countries.find((c) => c.active && c.iso2 === iso2)?.name || '';
  }

  const matchedService = db.services.find(
    (s) => s.active && (serviceMappingKey(s.name) === serviceMappingKey(senderClean) || senderClean.toLowerCase().includes(s.name.toLowerCase()))
  );

  const nowMs = Date.now();
  db.trafficEvents.push({
    eventKey,
    occurredAt: new Date(nowMs).toISOString(),
    occurredAtMs: nowMs,
    serviceName: matchedService ? matchedService.name : senderClean,
    iso2: iso2 || '',
    countryName: countryName || iso2 || 'Unknown',
  });

  // Prune traffic events older than 2 hours
  const cutoffMs = nowMs - 2 * 3600 * 1000;
  db.trafficEvents = db.trafficEvents.filter((e) => e.occurredAtMs >= cutoffMs);
  markDirty();
  return true;
}

// Telegram Group OTP Forwarder (rate-limited at 20 messages/minute = ~3.15s spacing)
function enqueueTelegramOtpGroup(number: string, sender: string, otpCode: string) {
  const token = String(db.settings.tgBotToken || '').trim();
  const groupIds = db.settings.otpGroupIds || [];
  if (!token || groupIds.length === 0) return;

  const digits = String(number || '').replace(/\D/g, '');
  const { iso2, dialCode } = phoneToIso2(digits);
  const flag = iso2 ? countryFlagEmoji(iso2) : '🌐';
  const rest = dialCode ? digits.slice(dialCode.length) : digits;
  const maskedNum = dialCode
    ? `${dialCode}◉◉◉${(rest || digits).slice(-4)}`
    : `◉◉◉${digits.slice(-4)}`;
  const shortSvc = serviceShortName(sender);
  const text = `<b>${flag} ${escapeHtml(iso2 || 'UN')} ${escapeHtml(shortSvc)} ${escapeHtml(maskedNum)}</b>`;

  const inlineRows: any[][] = [];
  if (otpCode) {
    inlineRows.push([{ text: String(otpCode), copy_text: { text: String(otpCode) } }]);
  }
  const getNumUrl = db.settings.getNumberLink || db.settings.otpLink || 'https://t.me/sxotp99';
  const channelUrl = db.settings.channelLink || db.settings.supportLink || 'https://t.me/sxsupportgroup';
  inlineRows.push([
    { text: 'Number', url: getNumUrl },
    { text: 'Channel', url: channelUrl },
  ]);

  for (const chatId of groupIds) {
    if (otpGroupQueue.length < 5000) {
      otpGroupQueue.push({
        chatId,
        text,
        replyMarkup: { inline_keyboard: inlineRows },
      });
    }
  }
  drainTelegramOtpQueue();
}

async function drainTelegramOtpQueue() {
  if (otpGroupDrainRunning) return;
  otpGroupDrainRunning = true;
  try {
    while (otpGroupQueue.length > 0) {
      const token = String(db.settings.tgBotToken || '').trim();
      if (!token) {
        otpGroupQueue.length = 0;
        break;
      }
      const item = otpGroupQueue.shift()!;
      const elapsed = Date.now() - otpGroupLastSentMs;
      const minInterval = 3160; // ~19-20 msgs/minute per Telegram group limits
      if (elapsed < minInterval) {
        await new Promise((r) => setTimeout(r, minInterval - elapsed));
      }
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: item.chatId,
            text: item.text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: item.replyMarkup,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // never crash queue
      }
      otpGroupLastSentMs = Date.now();
    }
  } finally {
    otpGroupDrainRunning = false;
  }
}

function recordLeaderboardOtp(uid: string, name: string) {
  const { weekStart } = getActiveWeekPeriod();
  let row = db.leaderboardWeeklyCounts.find((r) => r.weekStart === weekStart && r.uid === uid);
  if (!row) {
    row = { weekStart, uid, name: name || 'User', otpCount: 0 };
    db.leaderboardWeeklyCounts.push(row);
  }
  row.name = name || row.name;
  row.otpCount += 1;

  if (!db.users[uid]) {
    db.users[uid] = {
      uid,
      name: name || 'User',
      otpCount: 0,
      referralQualified: false,
      qualifiedReferrals: 0,
      totalInvited: 0,
      referralEarningsUsdt: 0,
      balanceSnapshotBdt: 0,
      lastNumberRequestAtMs: 0,
      joinedAt: new Date().toISOString(),
    };
  }
  db.users[uid].otpCount += 1;
}

export async function scanPanelNow(panel: NsPanel, forceRefresh = false): Promise<{ newCount: number; deliveredCount: number; error?: string }> {
  const fetched = await panelFetchSms(panel, undefined, forceRefresh);
  panel.lastScannedAt = new Date().toISOString();
  if (!fetched.ok && fetched.rows.length === 0) {
    markDirty();
    return { newCount: 0, deliveredCount: 0, error: fetched.error };
  }

  const lastTs = panel.lastSeenTs || '';
  const lastKey = panel.lastSeenKey || '';
  let newLastTs = lastTs;
  let newLastKey = lastKey;

  const pending = fetched.rows
    .filter((sms) => {
      const key = smsCursorKey(sms);
      return sms.ts > lastTs || (sms.ts === lastTs && key > lastKey);
    })
    .sort((a, b) => {
      if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
      const ka = smsCursorKey(a);
      const kb = smsCursorKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  let deliveredCount = 0;
  const validMs = Math.max(1, db.settings.numberValidTimeMinutes || 10) * 60 * 1000;
  const nowMs = Date.now();

  for (const sms of pending) {
    const key = smsCursorKey(sms);
    const isNew = recordTrafficEvent(panel.id, sms);
    const otpCode = extractOtp(sms.message) || '';

    if (isNew && db.settings.otpGroupIds.length > 0 && db.settings.tgBotToken) {
      enqueueTelegramOtpGroup(sms.number, sms.sender, otpCode);
    }

    const numClean = normalizePhoneNumber(sms.number);
    const matchedIdx = db.numbers.findIndex(
      (n) =>
        n.used === 1 &&
        n.assignedUid &&
        n.number === numClean &&
        (!n.assignedAtMs || nowMs - n.assignedAtMs <= validMs)
    );

    if (matchedIdx !== -1) {
      const numRow = db.numbers[matchedIdx];
      const country = db.countries.find((c) => c.id === numRow.countryId);
      const svc = numRow.assignedServiceId ? db.services.find((s) => s.id === numRow.assignedServiceId) : null;
      const mapping = svc && country
        ? db.serviceCountries.find((sc) => sc.serviceId === svc.id && sc.countryId === country.id)
        : null;
      const bonusUsdt = Number(mapping ? mapping.amount : country?.price ?? 0);
      const bonusBdt = Number((bonusUsdt * (db.settings.usdToBdt || USD_TO_BDT)).toFixed(2));
      const { iso2 } = phoneToIso2(numClean);
      const uid = numRow.assignedUid!;
      const userMeta = db.users[uid];

      const deliveryId = crypto
        .createHash('sha256')
        .update(`${uid}|${panel.id}|${key}`)
        .digest('hex')
        .slice(0, 20);

      if (!db.otpDeliveries.some((d) => d.id === deliveryId)) {
        const delivery: NsOtpDelivery = {
          id: deliveryId,
          uid,
          referrerUid: userMeta?.referredByUid || null,
          panelId: panel.id,
          panelName: panel.name,
          serviceId: svc?.id || null,
          serviceName: svc?.name || sms.sender || 'OTP',
          serviceShort: serviceShortName(svc?.name || sms.sender || 'OTP'),
          countryId: numRow.countryId,
          countryName: country?.name || iso2 || 'Unknown',
          iso2: country?.iso2 || iso2 || 'UN',
          emoji: country?.emoji || countryFlagEmoji(iso2 || ''),
          number: numClean,
          sender: sms.sender || svc?.name || '',
          message: sms.message,
          otpCode: otpCode || '—',
          otpBonusUsdt: bonusUsdt,
          otpBonusBdt: bonusBdt,
          ts: sms.ts,
          createdAt: new Date().toISOString(),
          acknowledged: false,
        };
        db.otpDeliveries.unshift(delivery);
        if (db.otpDeliveries.length > 5000) db.otpDeliveries.length = 5000;
        recordLeaderboardOtp(uid, numRow.assignedName || userMeta?.name || 'User');
        deliveredCount++;
      }

      // A number that has completed a user request must NEVER return to inventory or be reused
      db.numbers.splice(matchedIdx, 1);
    }

    if (sms.ts > newLastTs || (sms.ts === newLastTs && key > newLastKey)) {
      newLastTs = sms.ts;
      newLastKey = key;
    }
  }

  panel.lastSeenTs = newLastTs;
  panel.lastSeenKey = newLastKey;
  markDirty();
  return { newCount: pending.length, deliveredCount };
}

function expireAssignedNumbers() {
  const validMs = Math.max(1, db.settings.numberValidTimeMinutes || 10) * 60 * 1000;
  const now = Date.now();
  const before = db.numbers.length;
  db.numbers = db.numbers.filter((n) => {
    if (n.used === 1 && n.assignedAtMs && now - n.assignedAtMs > validMs) {
      return false; // Never return a user-assigned number to available inventory
    }
    return true;
  });
  if (db.numbers.length !== before) markDirty();
}

export function startNumberSystemBackgroundWorkers() {
  if (backgroundStarted) return;
  backgroundStarted = true;

  setInterval(async () => {
    expireAssignedNumbers();
    const now = Date.now();

    // Daily UTC rollover refresh check every 30s
    const utcToday = new Date().toISOString().slice(0, 10);
    if (now - lastUtcRolloverMs >= 30000) {
      lastUtcRolloverMs = now;
      for (const p of db.panels) {
        if (!p.active) continue;
        if (db.panelUtcRollover[String(p.id)] !== utcToday) {
          db.panelUtcRollover[String(p.id)] = utcToday;
          panelSmsCache.delete(p.id);
          panelFetchSms(p, 1, true).catch(() => {});
        }
      }
    }

    // Keepalive every 60s for web panels
    if (now - lastKeepaliveMs >= 60000) {
      lastKeepaliveMs = now;
      for (const p of db.panels) {
        if (!p.active || p.panelType === 'api' || !p.statsUrl) continue;
        const jar = { ...(p.cookies || {}) };
        fetchWithCookies(p.statsUrl, jar)
          .then((r) => {
            if (panelSessionExpired(r.status, r.text, r.finalUrl)) {
              return panelDoLogin(p.panelType, p.loginUrl, p.username, p.password, p.statsUrl).then((res) => {
                if (res.ok && res.cookies) {
                  p.cookies = res.cookies;
                  markDirty();
                }
              });
            }
            p.cookies = jar;
            return undefined;
          })
          .catch(() => {});
      }
    }

    // Per-panel scan interval check (matches master job every 3s)
    for (const p of db.panels) {
      if (!p.active || apiInFlight.has(p.id)) continue;
      const intervalMs = Math.max(3, p.scanInterval || 60) * 1000;
      const lastScanMs = p.lastScannedAt ? Date.parse(p.lastScannedAt) : 0;
      if (now - lastScanMs < intervalMs) continue;
      apiInFlight.add(p.id);
      scanPanelNow(p, false)
        .catch(() => {})
        .finally(() => apiInFlight.delete(p.id));
    }
  }, 3000);
}

// Auto-start scanner daemon on import
startNumberSystemBackgroundWorkers();

// ─── SANITIZED VIEW HELPERS & API DISPATCHER ─────────────────────────────────

function sanitizePanel(p: NsPanel) {
  return {
    id: p.id,
    name: p.name,
    panelType: p.panelType,
    loginUrl: p.loginUrl,
    username: p.username,
    statsUrl: p.statsUrl,
    hasPassword: Boolean(p.password),
    hasCookies: Object.keys(p.cookies || {}).length > 0,
    hasApiKey: Boolean(p.apiKey),
    active: p.active,
    scanInterval: p.scanInterval,
    numberColName: p.numberColName,
    numberColIdx: p.numberColIdx,
    senderColName: p.senderColName,
    senderColIdx: p.senderColIdx,
    messageColName: p.messageColName,
    messageColIdx: p.messageColIdx,
    apiMethod: p.apiMethod,
    apiAuthType: p.apiAuthType,
    apiAuthName: p.apiAuthName,
    apiRowsPath: p.apiRowsPath,
    apiNumberField: p.apiNumberField,
    apiSenderField: p.apiSenderField,
    apiMessageField: p.apiMessageField,
    apiTimestampField: p.apiTimestampField,
    apiRangeField: p.apiRangeField,
    apiLastError: p.apiLastError,
    lastSmsJson: p.lastSmsJson,
    lastScannedAt: p.lastScannedAt,
    addedAt: p.addedAt,
  };
}

function getCountryInventorySummary() {
  const counts = new Map<number, { total: number; available: number; used: number }>();
  for (const n of db.numbers) {
    let entry = counts.get(n.countryId);
    if (!entry) {
      entry = { total: 0, available: 0, used: 0 };
      counts.set(n.countryId, entry);
    }
    entry.total++;
    if (n.used === 0) entry.available++;
    else entry.used++;
  }
  return db.countries
    .filter((c) => c.active)
    .map((c) => {
      const st = counts.get(c.id) || { total: 0, available: 0, used: 0 };
      return { ...c, ...st };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getAvailableServiceCountries() {
  const availByCountry = new Map<number, number>();
  for (const n of db.numbers) {
    if (n.used === 0) {
      availByCountry.set(n.countryId, (availByCountry.get(n.countryId) || 0) + 1);
    }
  }
  const results: Array<{
    serviceId: number;
    serviceName: string;
    serviceIcon: string;
    countryId: number;
    countryName: string;
    iso2: string;
    emoji: string;
    priceUsdt: number;
    priceBdt: number;
    availableCount: number;
  }> = [];

  for (const sc of db.serviceCountries) {
    const svc = db.services.find((s) => s.id === sc.serviceId && s.active);
    const country = db.countries.find((c) => c.id === sc.countryId && c.active);
    const cnt = availByCountry.get(sc.countryId) || 0;
    if (!svc || !country || cnt <= 0) continue;
    const priceUsdt = Number(sc.amount ?? country.price ?? 0);
    results.push({
      serviceId: svc.id,
      serviceName: svc.name,
      serviceIcon: svc.icon || serviceDefaultIcon(svc.name),
      countryId: country.id,
      countryName: country.name,
      iso2: country.iso2,
      emoji: country.emoji,
      priceUsdt,
      priceBdt: Number((priceUsdt * (db.settings.usdToBdt || USD_TO_BDT)).toFixed(2)),
      availableCount: cnt,
    });
  }
  return results.sort((a, b) => a.serviceName.localeCompare(b.serviceName) || a.countryName.localeCompare(b.countryName));
}

export function buildLiveTrafficReport() {
  const cutoffMs = Date.now() - 30 * 60 * 1000;
  const recent = db.trafficEvents.filter((e) => e.occurredAtMs >= cutoffMs);
  const total = recent.length;

  const serviceMap = new Map<string, { serviceName: string; icon: string; count: number }>();
  const countryMap = new Map<string, { countryName: string; iso2: string; emoji: string; count: number }>();

  for (const e of recent) {
    const sk = e.serviceName.toLowerCase();
    const sEntry = serviceMap.get(sk) || { serviceName: e.serviceName, icon: serviceDefaultIcon(e.serviceName), count: 0 };
    sEntry.count++;
    serviceMap.set(sk, sEntry);

    const ck = (e.iso2 || e.countryName || 'unknown').toLowerCase();
    const cEntry = countryMap.get(ck) || {
      countryName: e.countryName || e.iso2 || 'Unknown',
      iso2: e.iso2 || '',
      emoji: e.iso2 ? countryFlagEmoji(e.iso2) : '🌐',
      count: 0,
    };
    cEntry.count++;
    countryMap.set(ck, cEntry);
  }

  const activeServices = Array.from(serviceMap.values())
    .sort((a, b) => b.count - a.count || a.serviceName.localeCompare(b.serviceName))
    .map((s) => ({ ...s, percent: total ? Number(((s.count * 100) / total).toFixed(1)) : 0 }));

  const topCountries = Array.from(countryMap.values())
    .sort((a, b) => b.count - a.count || a.countryName.localeCompare(b.countryName))
    .slice(0, 5)
    .map((c) => ({ ...c, percent: total ? Number(((c.count * 100) / total).toFixed(1)) : 0 }));

  return {
    windowMinutes: 30,
    totalEvents: total,
    resultsSentPercent: total > 0 ? 100 : 0,
    topCountry: topCountries[0] || null,
    activeServices,
    topCountries,
  };
}

function maskDisplayName(name: string, adminView: boolean): string {
  const clean = String(name || 'User').trim() || 'User';
  if (adminView) return clean;
  const chars = Array.from(clean.replace(/\s+/g, ''));
  if (chars.length <= 1) return (chars[0] || 'U') + '•••';
  return `${chars[0]}••••${chars[chars.length - 1]}`;
}

export function buildLeaderboardReport(callerUid: string, adminView: boolean) {
  const { weekStart, weekEnd } = getActiveWeekPeriod();
  const weeklyRows = db.leaderboardWeeklyCounts
    .filter((r) => r.weekStart >= weekStart && r.weekStart < weekEnd)
    .map((r) => {
      const u = db.users[r.uid];
      return {
        uid: r.uid,
        name: r.name || u?.name || 'User',
        weeklyOtpCount: r.otpCount,
        balanceBdt: u?.balanceSnapshotBdt || 0,
        joinedAt: u?.joinedAt || '',
      };
    })
    .sort((a, b) => b.weeklyOtpCount - a.weeklyOtpCount || b.balanceBdt - a.balanceBdt || a.joinedAt.localeCompare(b.joinedAt));

  const topOtpUsers = weeklyRows.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    uid: adminView ? r.uid : undefined,
    displayName: maskDisplayName(r.name, adminView),
    weeklyOtpCount: r.weeklyOtpCount,
    balanceBdt: r.balanceBdt,
  }));

  let myRank: { rank: number | null; weeklyOtpCount: number; eligible: boolean; minRequired: number } | null = null;
  if (callerUid) {
    const idx = weeklyRows.findIndex((r) => r.uid === callerUid);
    const cnt = idx !== -1 ? weeklyRows[idx].weeklyOtpCount : 0;
    myRank = {
      rank: cnt >= LEADERBOARD_MIN_ORDERS && idx !== -1 ? idx + 1 : null,
      weeklyOtpCount: cnt,
      eligible: cnt >= LEADERBOARD_MIN_ORDERS,
      minRequired: LEADERBOARD_MIN_ORDERS,
    };
  }

  // Referral Leaderboard (grouped by referrer in active period or overall user metrics)
  const refMap = new Map<string, { uid: string; totalInvited: number; validReferrals: number }>();
  for (const ev of db.leaderboardEvents) {
    if (ev.eventType === 'referral' && ev.occurredAt >= weekStart && ev.occurredAt < weekEnd) {
      const entry = refMap.get(ev.uid) || { uid: ev.uid, totalInvited: 0, validReferrals: 0 };
      entry.totalInvited++;
      const qual = db.leaderboardEvents.some(
        (q) => q.eventType === 'qualified_referral' && q.uid === ev.uid && q.relatedUid === ev.relatedUid && q.occurredAt >= ev.occurredAt && q.occurredAt < weekEnd
      );
      if (qual) entry.validReferrals++;
      refMap.set(ev.uid, entry);
    }
  }

  const topReferrers = Array.from(refMap.values())
    .map((r) => {
      const u = db.users[r.uid];
      return {
        uid: adminView ? r.uid : undefined,
        displayName: maskDisplayName(u?.name || 'User', adminView),
        totalInvited: r.totalInvited,
        validReferrals: r.validReferrals,
        referralEarningsUsdt: u?.referralEarningsUsdt || 0,
        balanceBdt: u?.balanceSnapshotBdt || 0,
        joinedAt: u?.joinedAt || '',
      };
    })
    .sort((a, b) => b.validReferrals - a.validReferrals || b.totalInvited - a.totalInvited || b.referralEarningsUsdt - a.referralEarningsUsdt || b.balanceBdt - a.balanceBdt)
    .slice(0, 10)
    .map((r, i) => ({ rank: i + 1, ...r }));

  return {
    weekStart,
    weekEnd,
    minOrdersForRank: LEADERBOARD_MIN_ORDERS,
    topOtpUsers,
    topReferrers,
    myRank,
  };
}

export function buildBackupZipBuffer(): Buffer {
  const zip = new AdmZip();
  const numbersPayload = {
    version: 1,
    database: 'numbers',
    exportedAt: new Date().toISOString(),
    countries: db.countries,
    services: db.services,
    serviceCountries: db.serviceCountries,
    numbers: db.numbers,
  };
  const usersPayload = {
    version: 1,
    database: 'users',
    exportedAt: new Date().toISOString(),
    users: Object.values(db.users),
    settings: { ...db.settings, tgBotToken: db.settings.tgBotToken ? '[CONFIGURED]' : '' },
    leaderboardWeeklyCounts: db.leaderboardWeeklyCounts,
    leaderboardEvents: db.leaderboardEvents,
  };

  zip.addFile('numbers.json', Buffer.from(JSON.stringify(numbersPayload, null, 2), 'utf-8'));
  zip.addFile('users.json', Buffer.from(JSON.stringify(usersPayload, null, 2), 'utf-8'));

  const csvLines = ['UID,Name,NumericID,OTPs,QualifiedReferrals,TotalInvited,ReferralEarningsUSDT,BalanceBDT,JoinedAt'];
  for (const u of Object.values(db.users)) {
    csvLines.push(
      [
        u.uid,
        `"${String(u.name || '').replace(/"/g, '""')}"`,
        u.numericId || '',
        u.otpCount,
        u.qualifiedReferrals,
        u.totalInvited,
        u.referralEarningsUsdt.toFixed(4),
        u.balanceSnapshotBdt.toFixed(2),
        u.joinedAt,
      ].join(',')
    );
  }
  zip.addFile('users_summary.csv', Buffer.from(csvLines.join('\n'), 'utf-8'));
  zip.addFile(
    'README.txt',
    Buffer.from(
      `BD Topsell Number System Backup\nExported: ${new Date().toISOString()}\nCountries: ${db.countries.length}\nNumbers: ${db.numbers.length}\nServices: ${db.services.length}\nPanels: ${db.panels.length}\n`,
      'utf-8'
    )
  );
  return zip.toBuffer();
}

export async function handleNumberSystemApiRequest(
  pathname: string,
  method: string,
  query: URLSearchParams,
  body: any
): Promise<{ status: number; contentType?: string; filename?: string; buffer?: Buffer; json?: any }> {
  expireAssignedNumbers();

  // ── 1. GET /state ──
  if (pathname === '/state' && method === 'GET') {
    const uid = query.get('uid') || '';
    const isAdmin = query.get('admin') === '1';
    const countries = getCountryInventorySummary();
    const totalNumbers = db.numbers.length;
    const usedNumbers = db.numbers.filter((n) => n.used === 1).length;
    const availableNumbers = totalNumbers - usedNumbers;

    return {
      status: 200,
      json: {
        success: true,
        countries,
        services: db.services.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name)),
        serviceCountries: db.serviceCountries,
        availableServiceCountries: getAvailableServiceCountries(),
        panels: isAdmin ? db.panels.map(sanitizePanel) : [],
        settings: isAdmin
          ? { ...db.settings }
          : {
              numPerUser: db.settings.numPerUser,
              numberValidTimeMinutes: db.settings.numberValidTimeMinutes,
              boardCurrency: db.settings.boardCurrency,
              usdToBdt: db.settings.usdToBdt,
              leaderboardEnabled: db.settings.leaderboardEnabled,
              liveTrafficUserEnabled: db.settings.liveTrafficUserEnabled,
              referralQualificationOtps: db.settings.referralQualificationOtps,
              referralQualifiedReward: db.settings.referralQualifiedReward,
              referralOtpCommissionRate: db.settings.referralOtpCommissionRate,
              supportLink: db.settings.supportLink,
              otpLink: db.settings.otpLink,
              getNumberLink: db.settings.getNumberLink,
              channelLink: db.settings.channelLink,
              forceJoinEnabled: db.settings.forceJoinEnabled,
              forceJoinChannels: db.settings.forceJoinChannels,
              withdrawEnabled: db.settings.withdrawEnabled,
              minWithdrawUsdt: db.settings.minWithdrawUsdt,
            },
        stats: {
          totalNumbers,
          availableNumbers,
          usedNumbers,
          activeCountries: countries.length,
          activeServices: db.services.filter((s) => s.active).length,
          totalPanels: db.panels.length,
          activePanels: db.panels.filter((p) => p.active).length,
          totalOtpUsers: Object.keys(db.users).length,
        },
        userMeta: uid ? db.users[uid] || null : null,
      },
    };
  }

  // ── 2. POST /user/sync (keeps Number System user/referrer graph in sync with Firebase user) ──
  if (pathname === '/user/sync' && method === 'POST') {
    const uid = String(body.uid || '').trim();
    if (!uid) return { status: 400, json: { success: false, error: 'UID required' } };
    const existed = Boolean(db.users[uid]);
    const existing = db.users[uid] || {
      uid,
      name: String(body.name || 'User'),
      email: body.email || '',
      numericId: body.numericId || '',
      referredByUid: body.referredByUid || null,
      otpCount: 0,
      referralQualified: false,
      qualifiedReferrals: 0,
      totalInvited: 0,
      referralEarningsUsdt: 0,
      balanceSnapshotBdt: Number(body.balanceBdt || 0),
      lastNumberRequestAtMs: 0,
      joinedAt: new Date().toISOString(),
    };
    existing.name = String(body.name || existing.name || 'User');
    if (body.numericId) existing.numericId = body.numericId;
    if (typeof body.balanceBdt === 'number') existing.balanceSnapshotBdt = body.balanceBdt;
    if (body.referredByUid && !existing.referredByUid && body.referredByUid !== uid) {
      existing.referredByUid = String(body.referredByUid);
    }
    db.users[uid] = existing;

    if (!existed && existing.referredByUid) {
      const refUid = existing.referredByUid;
      if (!db.leaderboardEvents.some((e) => e.eventType === 'referral' && e.uid === refUid && e.relatedUid === uid)) {
        db.seq.lbEvent++;
        db.leaderboardEvents.push({
          id: db.seq.lbEvent,
          uid: refUid,
          eventType: 'referral',
          relatedUid: uid,
          occurredAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        });
        if (db.users[refUid]) db.users[refUid].totalInvited++;
      }
    }
    markDirty();
    return { status: 200, json: { success: true, userMeta: existing } };
  }

  // ── 3. POST /country (add, updatePrice, resetNumbers, delete) ──
  if (pathname === '/country' && method === 'POST') {
    const action = String(body.action || 'add');
    if (action === 'add') {
      const parsed = parseCountryInput(body.name || body.input || '');
      if (!parsed.name) return { status: 400, json: { success: false, error: 'Country name required' } };
      const price = Math.max(0, Number(body.price || 0) || 0);
      const dup = db.countries.find(
        (c) => c.active && c.name.toLowerCase() === parsed.name.toLowerCase()
      );
      if (dup) return { status: 400, json: { success: false, error: `Country "${dup.name}" already exists` } };

      // Purge any legacy soft-deleted entry of same name
      db.countries = db.countries.filter((c) => c.active || c.name.toLowerCase() !== parsed.name.toLowerCase());
      db.seq.country++;
      const row: NsCountry = {
        id: db.seq.country,
        name: parsed.name,
        iso2: body.iso2 ? String(body.iso2).toUpperCase().slice(0, 2) : parsed.iso2,
        emoji: body.emoji || parsed.emoji,
        price,
        active: true,
        createdAt: new Date().toISOString(),
      };
      db.countries.push(row);
      markDirty();
      return { status: 200, json: { success: true, country: row } };
    }

    const countryId = Number(body.countryId || 0);
    const country = db.countries.find((c) => c.id === countryId && c.active);
    if (!country) return { status: 404, json: { success: false, error: 'Country not found' } };

    if (action === 'updatePrice') {
      let priceUsdt = Number(body.price);
      if (!Number.isFinite(priceUsdt) || priceUsdt < 0) {
        return { status: 400, json: { success: false, error: 'Valid non-negative price required' } };
      }
      if (body.currency === 'BDT') {
        priceUsdt = priceUsdt / (db.settings.usdToBdt || USD_TO_BDT);
      }
      country.price = Number(priceUsdt.toFixed(6));
      // Sync service_countries.amount just like Country Price in originalbotnu.py
      for (const sc of db.serviceCountries) {
        if (sc.countryId === countryId) sc.amount = country.price;
      }
      markDirty();
      return { status: 200, json: { success: true, country } };
    }

    if (action === 'resetNumbers') {
      const before = db.numbers.length;
      db.numbers = db.numbers.filter((n) => n.countryId !== countryId);
      const removed = before - db.numbers.length;
      markDirty();
      return { status: 200, json: { success: true, removed } };
    }

    if (action === 'delete') {
      // Permanent delete (cascades service_countries & numbers)
      db.serviceCountries = db.serviceCountries.filter((sc) => sc.countryId !== countryId);
      db.numbers = db.numbers.filter((n) => n.countryId !== countryId);
      db.countries = db.countries.filter((c) => c.id !== countryId);
      markDirty();
      return { status: 200, json: { success: true } };
    }

    return { status: 400, json: { success: false, error: 'Unknown country action' } };
  }

  // ── 4. POST /service (add, delete, map, unmap, command) ──
  if (pathname === '/service' && method === 'POST') {
    const action = String(body.action || 'add');
    if (action === 'add') {
      const name = String(body.name || '').trim();
      if (!name) return { status: 400, json: { success: false, error: 'Service name required' } };
      const existing = db.services.find((s) => s.active && s.name.toLowerCase() === name.toLowerCase());
      if (existing) return { status: 400, json: { success: false, error: `Service "${existing.name}" already exists` } };
      db.seq.service++;
      const row: NsService = {
        id: db.seq.service,
        name,
        icon: String(body.icon || '').trim() || serviceDefaultIcon(name),
        active: true,
        createdAt: new Date().toISOString(),
      };
      db.services.push(row);
      markDirty();
      return { status: 200, json: { success: true, service: row } };
    }

    if (action === 'delete') {
      const serviceId = Number(body.serviceId || 0);
      db.serviceCountries = db.serviceCountries.filter((sc) => sc.serviceId !== serviceId);
      db.services = db.services.filter((s) => s.id !== serviceId);
      markDirty();
      return { status: 200, json: { success: true } };
    }

    if (action === 'toggleMap' || action === 'map' || action === 'unmap') {
      const serviceId = Number(body.serviceId || 0);
      const countryId = Number(body.countryId || 0);
      const svc = db.services.find((s) => s.id === serviceId && s.active);
      const country = db.countries.find((c) => c.id === countryId && c.active);
      if (!svc || !country) return { status: 404, json: { success: false, error: 'Service or Country not found' } };

      const idx = db.serviceCountries.findIndex((sc) => sc.serviceId === serviceId && sc.countryId === countryId);
      if (action === 'unmap' || (action === 'toggleMap' && idx !== -1)) {
        if (idx !== -1) db.serviceCountries.splice(idx, 1);
        markDirty();
        return { status: 200, json: { success: true, mapped: false } };
      } else {
        const customAmount = body.amount !== undefined && body.amount !== '' ? Number(body.amount) : country.price;
        if (idx === -1) {
          db.seq.serviceCountry++;
          db.serviceCountries.push({
            id: db.seq.serviceCountry,
            serviceId,
            countryId,
            amount: Number.isFinite(customAmount) ? customAmount : country.price,
          });
        } else if (Number.isFinite(customAmount)) {
          db.serviceCountries[idx].amount = customAmount;
        }
        markDirty();
        return { status: 200, json: { success: true, mapped: true } };
      }
    }

    if (action === 'command') {
      // Handles commands like "WhatsApp Bangladesh", "unmap WhatsApp Bangladesh", "delete WhatsApp", "WhatsApp"
      const raw = String(body.command || '').replace(/\s+/g, ' ').trim();
      const lower = raw.toLowerCase();
      if (!raw) return { status: 400, json: { success: false, error: 'Empty command' } };

      if (lower.startsWith('delete ')) {
        const svcName = raw.slice(7).trim();
        const svc = db.services.find((s) => s.active && serviceMappingKey(s.name) === serviceMappingKey(svcName));
        if (!svc) return { status: 404, json: { success: false, error: `Service "${svcName}" not found` } };
        db.serviceCountries = db.serviceCountries.filter((sc) => sc.serviceId !== svc.id);
        db.services = db.services.filter((s) => s.id !== svc.id);
        markDirty();
        return { status: 200, json: { success: true, message: `Deleted service "${svc.name}"` } };
      }

      const isUnmap = lower.startsWith('unmap ');
      const payloadText = isUnmap ? raw.slice(6).trim() : raw;
      const sortedCountries = [...db.countries].filter((c) => c.active).sort((a, b) => b.name.length - a.name.length);
      for (const c of sortedCountries) {
        const cname = c.name.toLowerCase();
        if (payloadText.toLowerCase().endsWith(' ' + cname)) {
          const svcPart = payloadText.slice(0, payloadText.length - cname.length - 1).trim();
          if (!svcPart) break;
          let svc = db.services.find((s) => s.active && serviceMappingKey(s.name) === serviceMappingKey(svcPart));
          if (!svc && !isUnmap) {
            db.seq.service++;
            svc = { id: db.seq.service, name: svcPart, icon: serviceDefaultIcon(svcPart), active: true, createdAt: new Date().toISOString() };
            db.services.push(svc);
          }
          if (!svc) return { status: 404, json: { success: false, error: `Service "${svcPart}" not found` } };

          const idx = db.serviceCountries.findIndex((sc) => sc.serviceId === svc!.id && sc.countryId === c.id);
          if (isUnmap) {
            if (idx !== -1) db.serviceCountries.splice(idx, 1);
            markDirty();
            return { status: 200, json: { success: true, message: `Unmapped ${svc.name} ← ${c.name}` } };
          } else {
            if (idx === -1) {
              db.seq.serviceCountry++;
              db.serviceCountries.push({ id: db.seq.serviceCountry, serviceId: svc.id, countryId: c.id, amount: c.price });
            }
            markDirty();
            return { status: 200, json: { success: true, message: `Mapped ${svc.name} → ${c.name}` } };
          }
        }
      }

      // Single word = add service
      const existing = db.services.find((s) => s.active && serviceMappingKey(s.name) === serviceMappingKey(raw));
      if (existing) return { status: 400, json: { success: false, error: `Service "${existing.name}" already exists` } };
      db.seq.service++;
      const row: NsService = { id: db.seq.service, name: raw, icon: serviceDefaultIcon(raw), active: true, createdAt: new Date().toISOString() };
      db.services.push(row);
      markDirty();
      return { status: 200, json: { success: true, message: `Added service "${row.name}"` } };
    }

    return { status: 400, json: { success: false, error: 'Unknown service action' } };
  }

  // ── 5. POST /numbers/upload (Bulk upload TXT/CSV/XLSX/Text up to 100k unique canonical numbers) ──
  if (pathname === '/numbers/upload' && method === 'POST') {
    const countryId = Number(body.countryId || 0);
    const country = db.countries.find((c) => c.id === countryId && c.active);
    if (!country) return { status: 404, json: { success: false, error: 'Country not found' } };

    let rawList: string[] = [];
    if (body.fileData && body.fileName) {
      rawList = parseNumberFileBase64(String(body.fileName), String(body.fileData));
    } else if (typeof body.text === 'string') {
      rawList = body.text
        .split(/\r?\n|[,;\t\s]+/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    const normalized = normalizeUniqueNumbers(rawList);
    if (normalized.length === 0) {
      return { status: 400, json: { success: false, error: 'No valid 7-15 digit numbers found' } };
    }
    if (normalized.length > MAX_NUMBERS_PER_UPLOAD) {
      return { status: 400, json: { success: false, error: `Max ${MAX_NUMBERS_PER_UPLOAD.toLocaleString()} numbers per upload` } };
    }

    const existingSet = new Set(db.numbers.map((n) => n.number));
    const nowIso = new Date().toISOString();
    let inserted = 0;
    let duplicates = 0;

    for (const num of normalized) {
      if (existingSet.has(num)) {
        duplicates++;
        continue;
      }
      existingSet.add(num);
      db.seq.number++;
      db.numbers.push({
        id: db.seq.number,
        countryId,
        number: num,
        used: 0,
        assignedUid: null,
        assignedName: null,
        assignedServiceId: null,
        assignedAt: null,
        assignedAtMs: null,
        addedAt: nowIso,
      });
      inserted++;
    }
    markDirty();
    return {
      status: 200,
      json: {
        success: true,
        parsed: normalized.length,
        inserted,
        duplicates,
        countryName: country.name,
      },
    };
  }

  // ── 6. POST /numbers/claim (Claim / Change Number with numPerUser, cooldown, validMinutes) ──
  if (pathname === '/numbers/claim' && method === 'POST') {
    const uid = String(body.uid || '').trim();
    const userName = String(body.name || 'User');
    const countryId = Number(body.countryId || 0);
    const serviceId = body.serviceId ? Number(body.serviceId) : null;
    const isChange = Boolean(body.change);
    if (!uid || !countryId) return { status: 400, json: { success: false, error: 'UID and Country required' } };

    const country = db.countries.find((c) => c.id === countryId && c.active);
    if (!country) return { status: 404, json: { success: false, error: 'Country not available' } };

    if (!db.users[uid]) {
      db.users[uid] = {
        uid,
        name: userName,
        otpCount: 0,
        referralQualified: false,
        qualifiedReferrals: 0,
        totalInvited: 0,
        referralEarningsUsdt: 0,
        balanceSnapshotBdt: 0,
        lastNumberRequestAtMs: 0,
        joinedAt: new Date().toISOString(),
      };
    }
    const userMeta = db.users[uid];
    const nowMs = Date.now();
    if (!isChange && userMeta.lastNumberRequestAtMs && nowMs - userMeta.lastNumberRequestAtMs < NUMBER_REQUEST_COOLDOWN_SECONDS * 1000) {
      const waitSec = Math.ceil((NUMBER_REQUEST_COOLDOWN_SECONDS * 1000 - (nowMs - userMeta.lastNumberRequestAtMs)) / 1000);
      return { status: 429, json: { success: false, error: `Please wait ${waitSec}s before requesting another number.` } };
    }

    // Retire previously active numbers of this user when pressing Change Number (never returned to pool)
    if (isChange) {
      db.numbers = db.numbers.filter((n) => !(n.used === 1 && n.assignedUid === uid));
    }

    const reqCount = Math.min(MAX_NUMBERS_PER_USER_REQUEST, Math.max(1, db.settings.numPerUser || 1));
    const available = db.numbers.filter((n) => n.countryId === countryId && n.used === 0);
    if (available.length === 0) {
      return { status: 400, json: { success: false, error: `No available numbers left for ${country.name}.` } };
    }

    const picked = available.slice(0, reqCount);
    const validMins = db.settings.numberValidTimeMinutes || DEFAULT_NUMBER_VALID_TIME_MINUTES;
    const expiresAtMs = nowMs + validMins * 60 * 1000;
    const assignedIso = new Date(nowMs).toISOString();

    for (const row of picked) {
      row.used = 1;
      row.assignedUid = uid;
      row.assignedName = userName;
      row.assignedServiceId = serviceId;
      row.assignedAt = assignedIso;
      row.assignedAtMs = nowMs;
    }
    userMeta.lastNumberRequestAtMs = nowMs;
    markDirty();

    const mapping = serviceId
      ? db.serviceCountries.find((sc) => sc.serviceId === serviceId && sc.countryId === countryId)
      : null;
    const priceUsdt = Number(mapping ? mapping.amount : country.price);
    const priceBdt = Number((priceUsdt * (db.settings.usdToBdt || USD_TO_BDT)).toFixed(2));
    const svc = serviceId ? db.services.find((s) => s.id === serviceId) : null;

    return {
      status: 200,
      json: {
        success: true,
        assigned: picked.map((n) => {
          const { iso2, dialCode } = phoneToIso2(n.number);
          return {
            id: n.id,
            number: n.number,
            withPlus: `+${n.number}`,
            withoutCc: dialCode && n.number.startsWith(dialCode) ? n.number.slice(dialCode.length) : n.number,
            iso2: country.iso2 || iso2 || 'UN',
            emoji: country.emoji || countryFlagEmoji(iso2 || ''),
            dialCode: dialCode || '',
            countryId: country.id,
            countryName: country.name,
            serviceId,
            serviceName: svc?.name || 'OTP',
            serviceIcon: svc?.icon || '🔔',
            priceUsdt,
            priceBdt,
            assignedAtMs: nowMs,
            expiresAtMs,
            validMinutes: validMins,
          };
        }),
      },
    };
  }

  // ── 7. GET /numbers/active?uid=... (active numbers + delivered OTP inbox) ──
  if (pathname === '/numbers/active' && method === 'GET') {
    const uid = String(query.get('uid') || '').trim();
    if (!uid) return { status: 400, json: { success: false, error: 'UID required' } };
    const validMs = Math.max(1, db.settings.numberValidTimeMinutes || 10) * 60 * 1000;

    const activeNumbers = db.numbers
      .filter((n) => n.used === 1 && n.assignedUid === uid)
      .map((n) => {
        const country = db.countries.find((c) => c.id === n.countryId);
        const svc = n.assignedServiceId ? db.services.find((s) => s.id === n.assignedServiceId) : null;
        const mapping = svc && country
          ? db.serviceCountries.find((sc) => sc.serviceId === svc.id && sc.countryId === country.id)
          : null;
        const priceUsdt = Number(mapping ? mapping.amount : country?.price ?? 0);
        const priceBdt = Number((priceUsdt * (db.settings.usdToBdt || USD_TO_BDT)).toFixed(2));
        const { iso2, dialCode } = phoneToIso2(n.number);
        const assignedAtMs = n.assignedAtMs || Date.now();
        return {
          id: n.id,
          number: n.number,
          withPlus: `+${n.number}`,
          withoutCc: dialCode && n.number.startsWith(dialCode) ? n.number.slice(dialCode.length) : n.number,
          iso2: country?.iso2 || iso2 || 'UN',
          emoji: country?.emoji || countryFlagEmoji(iso2 || ''),
          dialCode: dialCode || '',
          countryId: n.countryId,
          countryName: country?.name || 'Unknown',
          serviceId: n.assignedServiceId,
          serviceName: svc?.name || 'OTP',
          serviceIcon: svc?.icon || '🔔',
          priceUsdt,
          priceBdt,
          assignedAtMs,
          expiresAtMs: assignedAtMs + validMs,
          validMinutes: db.settings.numberValidTimeMinutes || 10,
        };
      });

    const userDeliveries = db.otpDeliveries.filter((d) => d.uid === uid).slice(0, 50);
    return {
      status: 200,
      json: {
        success: true,
        activeNumbers,
        deliveries: userDeliveries,
        userMeta: db.users[uid] || null,
      },
    };
  }

  // ── 8. POST /numbers/ack-otp (mark OTP delivery credited into Firebase wallet + process referral rules) ──
  if (pathname === '/numbers/ack-otp' && method === 'POST') {
    const uid = String(body.uid || '').trim();
    const deliveryIds: string[] = Array.isArray(body.deliveryIds) ? body.deliveryIds : [];
    const results: Array<{
      deliveryId: string;
      otpBonusUsdt: number;
      otpBonusBdt: number;
      referrerUid: string | null;
      becameQualified: boolean;
      qualificationRewardUsdt: number;
      qualificationRewardBdt: number;
      commissionUsdt: number;
      commissionBdt: number;
      newOtpCount: number;
    }> = [];

    for (const id of deliveryIds) {
      const del = db.otpDeliveries.find((d) => d.id === id && d.uid === uid);
      if (!del || del.acknowledged) continue;
      del.acknowledged = true;

      const user = db.users[uid];
      let becameQualified = false;
      let qualRewardUsdt = 0;
      let commissionUsdt = 0;
      const refUid = user?.referredByUid || null;

      if (user) {
        if (refUid && !user.referralQualified && user.otpCount >= (db.settings.referralQualificationOtps || 50)) {
          user.referralQualified = true;
          becameQualified = true;
          qualRewardUsdt = db.settings.referralQualifiedReward || 0;
          db.seq.lbEvent++;
          db.leaderboardEvents.push({
            id: db.seq.lbEvent,
            uid: refUid,
            eventType: 'qualified_referral',
            relatedUid: uid,
            occurredAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
          });
          if (db.users[refUid]) {
            db.users[refUid].qualifiedReferrals++;
            db.users[refUid].referralEarningsUsdt += qualRewardUsdt;
          }
        }
        if (refUid && (user.referralQualified || becameQualified) && del.otpBonusUsdt > 0) {
          commissionUsdt = del.otpBonusUsdt * (db.settings.referralOtpCommissionRate || 0);
          if (db.users[refUid]) {
            db.users[refUid].referralEarningsUsdt += commissionUsdt;
          }
        }
      }

      const rate = db.settings.usdToBdt || USD_TO_BDT;
      results.push({
        deliveryId: del.id,
        otpBonusUsdt: del.otpBonusUsdt,
        otpBonusBdt: del.otpBonusBdt,
        referrerUid: refUid,
        becameQualified,
        qualificationRewardUsdt: qualRewardUsdt,
        qualificationRewardBdt: Number((qualRewardUsdt * rate).toFixed(2)),
        commissionUsdt,
        commissionBdt: Number((commissionUsdt * rate).toFixed(2)),
        newOtpCount: user?.otpCount || 1,
      });
    }
    if (results.length > 0) markDirty();
    return { status: 200, json: { success: true, credited: results } };
  }

  // ── 9. POST /panel/add ──
  if (pathname === '/panel/add' && method === 'POST') {
    const name = String(body.name || '').trim();
    const panelType: PanelType =
      body.panelType === 'api' ? 'api' : body.panelType === 'non_captcha' ? 'non_captcha' : 'captcha';
    const statsUrl = String(body.statsUrl || '').trim();
    const loginUrl = String(body.loginUrl || (panelType === 'api' ? statsUrl : '')).trim();
    const username = String(body.username || (panelType === 'api' ? 'API' : '')).trim();
    const password = String(body.password || '');
    const apiKey = String(body.apiKey || '').trim();

    if (!name || !statsUrl) {
      return { status: 400, json: { success: false, error: 'Panel name and Stats/API URL required' } };
    }

    let initialCookies: Record<string, string> = {};
    if (panelType !== 'api') {
      if (!loginUrl || !username || !password) {
        return { status: 400, json: { success: false, error: 'Login URL, Username, and Password required for web panels' } };
      }
      const loginRes = await panelDoLogin(panelType, loginUrl, username, password, statsUrl);
      if (!loginRes.ok) {
        return { status: 400, json: { success: false, error: loginRes.error || 'Web panel login failed' } };
      }
      initialCookies = loginRes.cookies || {};
    }

    const mapped = parseApiMappingString(body.apiMapping || '');
    db.seq.panel++;
    const panel: NsPanel = {
      id: db.seq.panel,
      name,
      panelType,
      loginUrl,
      username,
      password,
      statsUrl,
      cookies: initialCookies,
      lastSeenTs: '',
      lastSeenKey: '',
      lastScannedAt: null,
      active: true,
      scanInterval: Math.max(3, Number(body.scanInterval || 60) || 60),
      numberColName: String(body.numberColName || 'Number'),
      numberColIdx: Number(body.numberColIdx ?? 2),
      senderColName: String(body.senderColName || 'CLI'),
      senderColIdx: Number(body.senderColIdx ?? 3),
      messageColName: String(body.messageColName || 'Message'),
      messageColIdx: Number(body.messageColIdx ?? 5),
      apiKey,
      apiMethod: body.apiMethod === 'POST' ? 'POST' : 'GET',
      apiAuthType: String(body.apiAuthType || 'auto'),
      apiAuthName: String(body.apiAuthName || ''),
      apiRowsPath: String(mapped.apiRowsPath || body.apiRowsPath || ''),
      apiNumberField: String(mapped.apiNumberField || body.apiNumberField || ''),
      apiSenderField: String(mapped.apiSenderField || body.apiSenderField || ''),
      apiMessageField: String(mapped.apiMessageField || body.apiMessageField || ''),
      apiTimestampField: String(mapped.apiTimestampField || body.apiTimestampField || ''),
      apiRangeField: String(mapped.apiRangeField || body.apiRangeField || ''),
      apiLastError: null,
      lastSmsJson: null,
      addedAt: new Date().toISOString(),
    };

    // Baseline fetch so existing historical SMS on first add do not flood, OR capture latest SMS preview
    const testFetch = await panelFetchSms(panel, 20, true);
    if (panelType === 'api' && !testFetch.ok) {
      db.seq.panel--;
      return { status: 400, json: { success: false, error: testFetch.error || 'API panel check failed' } };
    }
    if (testFetch.rows.length > 0) {
      panel.lastSeenTs = testFetch.rows[0].ts;
      panel.lastSeenKey = smsCursorKey(testFetch.rows[0]);
      panel.lastSmsJson = testFetch.rows[0];
    }

    db.panels.push(panel);
    markDirty();
    return { status: 200, json: { success: true, panel: sanitizePanel(panel) } };
  }

  // ── 10. POST /panel/action (toggle, delete, lastmsg, rawdata, editcols, interval, scannow) ──
  if (pathname === '/panel/action' && method === 'POST') {
    const panelId = Number(body.panelId || 0);
    const action = String(body.action || '');
    const idx = db.panels.findIndex((p) => p.id === panelId);
    if (idx === -1) return { status: 404, json: { success: false, error: 'Panel not found' } };
    const panel = db.panels[idx];

    if (action === 'toggle') {
      panel.active = !panel.active;
      markDirty();
      return { status: 200, json: { success: true, panel: sanitizePanel(panel) } };
    }
    if (action === 'delete') {
      panelSmsCache.delete(panel.id);
      apiThrottledUntil.delete(panel.id);
      db.panels.splice(idx, 1);
      markDirty();
      return { status: 200, json: { success: true } };
    }
    if (action === 'editcols') {
      panel.numberColIdx = Math.max(0, Number(body.numberColIdx ?? panel.numberColIdx));
      panel.senderColIdx = Math.max(0, Number(body.senderColIdx ?? panel.senderColIdx));
      panel.messageColIdx = Math.max(0, Number(body.messageColIdx ?? panel.messageColIdx));
      if (body.numberColName !== undefined) panel.numberColName = String(body.numberColName);
      if (body.senderColName !== undefined) panel.senderColName = String(body.senderColName);
      if (body.messageColName !== undefined) panel.messageColName = String(body.messageColName);
      panelSmsCache.delete(panel.id);
      markDirty();
      return { status: 200, json: { success: true, panel: sanitizePanel(panel) } };
    }
    if (action === 'interval') {
      panel.scanInterval = Math.max(3, Math.min(86400, Number(body.scanInterval || 60)));
      markDirty();
      return { status: 200, json: { success: true, panel: sanitizePanel(panel) } };
    }
    if (action === 'lastmsg') {
      const res = await panelFetchSms(panel, 5, true);
      return {
        status: 200,
        json: {
          success: res.ok || res.rows.length > 0,
          panelName: panel.name,
          messages: res.rows.slice(0, 5),
          error: res.error,
        },
      };
    }
    if (action === 'rawdata') {
      const raw = await panelFetchRawRow(panel);
      return {
        status: 200,
        json: {
          success: raw.ok,
          panelName: panel.name,
          rawRow: raw.row,
          currentCols: {
            numberColIdx: panel.numberColIdx,
            senderColIdx: panel.senderColIdx,
            messageColIdx: panel.messageColIdx,
          },
          error: raw.error,
        },
      };
    }
    if (action === 'scannow') {
      const res = await scanPanelNow(panel, true);
      return { status: 200, json: { success: !res.error, ...res, panel: sanitizePanel(panel) } };
    }
    return { status: 400, json: { success: false, error: 'Unknown panel action' } };
  }

  // ── 11. GET /traffic ──
  if (pathname === '/traffic' && method === 'GET') {
    const isAdmin = query.get('admin') === '1';
    if (!isAdmin && !db.settings.liveTrafficUserEnabled) {
      return { status: 403, json: { success: false, error: 'Live Traffic is currently disabled by Admin' } };
    }
    return { status: 200, json: { success: true, traffic: buildLiveTrafficReport() } };
  }

  // ── 12. GET /leaderboard ──
  if (pathname === '/leaderboard' && method === 'GET') {
    const isAdmin = query.get('admin') === '1';
    const uid = String(query.get('uid') || '');
    if (!isAdmin && !db.settings.leaderboardEnabled) {
      return { status: 403, json: { success: false, error: 'Leaderboard is currently disabled by Admin' } };
    }
    return { status: 200, json: { success: true, leaderboard: buildLeaderboardReport(uid, isAdmin) } };
  }

  // ── 13. POST /settings ──
  if (pathname === '/settings' && method === 'POST') {
    const s = db.settings;
    if (body.numPerUser !== undefined) {
      s.numPerUser = Math.min(MAX_NUMBERS_PER_USER_REQUEST, Math.max(1, Number(body.numPerUser) || 1));
    }
    if (body.numberValidTimeMinutes !== undefined) {
      s.numberValidTimeMinutes = Math.min(MAX_NUMBER_VALID_TIME_MINUTES, Math.max(MIN_NUMBER_VALID_TIME_MINUTES, Number(body.numberValidTimeMinutes) || 10));
    }
    if (body.boardCurrency === 'BDT' || body.boardCurrency === 'USDT') {
      s.boardCurrency = body.boardCurrency;
    }
    if (body.usdToBdt !== undefined && Number(body.usdToBdt) > 0) {
      s.usdToBdt = Number(body.usdToBdt);
    }
    if (body.leaderboardEnabled !== undefined) s.leaderboardEnabled = Boolean(body.leaderboardEnabled);
    if (body.liveTrafficUserEnabled !== undefined) s.liveTrafficUserEnabled = Boolean(body.liveTrafficUserEnabled);
    if (body.referralQualificationOtps !== undefined) {
      s.referralQualificationOtps = Math.min(100000, Math.max(1, Math.floor(Number(body.referralQualificationOtps) || 50)));
    }
    if (body.referralQualifiedReward !== undefined) {
      s.referralQualifiedReward = Math.max(0, Number(body.referralQualifiedReward) || 0);
    }
    if (body.referralOtpCommissionRate !== undefined) {
      // Accept percent 0-100 or fraction if <=1
      const rawRate = Number(body.referralOtpCommissionRate);
      if (Number.isFinite(rawRate)) {
        s.referralOtpCommissionRate = rawRate > 1 ? Math.min(1, rawRate / 100) : Math.max(0, rawRate);
      }
    }
    if (Array.isArray(body.otpGroupIds)) {
      const cleaned: string[] = [];
      for (const g of body.otpGroupIds) {
        const val = String(g || '').trim();
        if ((val.startsWith('@') || /^-?\d+$/.test(val)) && !cleaned.includes(val) && cleaned.length < MAX_OTP_GROUPS) {
          cleaned.push(val);
        }
      }
      s.otpGroupIds = cleaned;
    }
    if (body.supportLink !== undefined) s.supportLink = String(body.supportLink || '').trim();
    if (body.otpLink !== undefined) s.otpLink = String(body.otpLink || '').trim();
    if (body.getNumberLink !== undefined) s.getNumberLink = String(body.getNumberLink || '').trim();
    if (body.channelLink !== undefined) s.channelLink = String(body.channelLink || '').trim();
    if (body.tgBotToken !== undefined && String(body.tgBotToken).trim()) {
      s.tgBotToken = String(body.tgBotToken).trim();
    }
    if (body.forceJoinEnabled !== undefined) s.forceJoinEnabled = Boolean(body.forceJoinEnabled);
    if (Array.isArray(body.forceJoinChannels)) {
      s.forceJoinChannels = body.forceJoinChannels
        .map((c: any) => ({
          name: String(c?.name || c?.username || '').trim(),
          username: String(c?.username || '').trim().replace(/^@/, ''),
          url: String(c?.url || '').trim(),
        }))
        .filter((c: NsForceJoinChannel) => Boolean(c.name || c.username));
    }
    markDirty();
    return { status: 200, json: { success: true, settings: s } };
  }

  // ── 14. POST /demo-otp (Admin Send Demo OTP preview/group test matching BTN_OTP_DEMO_SEND) ──
  if (pathname === '/demo-otp' && method === 'POST') {
    const sampleNum = String(body.number || '996550290869').replace(/\D/g, '');
    const sampleSender = String(body.sender || 'WhatsApp');
    const sampleOtp = String(body.otpCode || '842915');
    const token = String(body.tgBotToken || db.settings.tgBotToken || '').trim();
    if (token) db.settings.tgBotToken = token;

    let sentGroups = 0;
    if (token && db.settings.otpGroupIds.length > 0) {
      enqueueTelegramOtpGroup(sampleNum, sampleSender, sampleOtp);
      sentGroups = db.settings.otpGroupIds.length;
    }
    const { iso2, dialCode } = phoneToIso2(sampleNum);
    const flag = countryFlagEmoji(iso2 || '');
    const masked = dialCode ? `${dialCode}◉◉◉${sampleNum.slice(dialCode.length).slice(-4)}` : `◉◉◉${sampleNum.slice(-4)}`;
    return {
      status: 200,
      json: {
        success: true,
        previewText: `${flag} ${iso2 || 'UN'} ${serviceShortName(sampleSender)} ${masked}`,
        otpCode: sampleOtp,
        sentGroups,
      },
    };
  }

  // ── 15. GET /backup (Download ZIP with numbers.json, users.json, users_summary.csv) ──
  if (pathname === '/backup' && method === 'GET') {
    const buf = buildBackupZipBuffer();
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return {
      status: 200,
      contentType: 'application/zip',
      filename: `number_system_backup_${today}.zip`,
      buffer: buf,
    };
  }

  return { status: 404, json: { success: false, error: 'Number system route not found' } };
}
