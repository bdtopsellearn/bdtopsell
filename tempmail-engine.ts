// TempMailGo Real Multi-Provider Engine for BD TopSell
// Integrates 5 providers: Inboxes.com (GetAirMail/Nada), Mail.tm, Guerrilla Mail, DropMail, and Mailinator
// Optimized for Real Instagram & Facebook Verification OTP Delivery with Auto-Failover

export interface TempMailAccount {
  address: string;
  token: string;
  provider: 'inboxes' | 'mailtm' | 'dropmail' | 'guerrilla' | 'mailinator';
  createdAt: number;
  expiresAt: number;
  domain: string;
}

export interface TempMailMessage {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  otp: string | null;
  receivedAt: number;
  text?: string;
  html?: string;
}

// ── Text & OTP Utilities ────────────────────────────────────────────────────
export function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Robust OTP extractor matching azx0.py bot extraction logic + Instagram, Facebook, Google, WhatsApp, Microsoft.
 * Handles:
 *  - Spaced or hyphenated 6-digit: "123 456", "123-456", "809-761"
 *  - Multi-part pairs: "12-34-56"
 *  - Keyword prefixes: "Your code is 123456", "OTP: 123456", "কোড 123456", "رمز 123456"
 *  - Reverse keyword: "123456 is your Instagram code"
 *  - Prefixes: "FB-123456", "G-123456"
 *  - Clean hidden unicode zero-width spaces
 */
export function extractOtp(subject: string, text: string, html: string): string | null {
  const s = String(subject || '').trim();
  const t = String(text || '').trim();
  const h = stripHtml(html || '');
  const all = `${s}\n${t}\n${h}`.replace(/[\u200B-\u200D\uFEFF]/g, ' ');

  // 1. Spaced or hyphenated multi-part OTPs (e.g. 123 456 or 123-456 or 809-761 or 12-34-56)
  const multiPart = all.match(/(?<!\d)((\d{3})[-\s]+(\d{3}))(?!\d)|(?<!\d)((\d{2})[-\s]+(\d{2})[-\s]+(\d{2}))(?!\d)/);
  if (multiPart) {
    return (multiPart[1] || multiPart[4]).replace(/[-\s]/g, '');
  }

  // 2. Facebook FB-123456 / FB-12345
  const fbMatch = all.match(/\bFB-(\d{4,8})\b/i);
  if (fbMatch) return fbMatch[1];

  // 3. Google G-123456
  const gMatch = all.match(/\bG-(\d{6})\b/i);
  if (gMatch) return gMatch[1];

  // 4. Keyword context: "Instagram code: 123456" / "your code is 123456" / "OTP: 123456" / "কোড 123456" / "رمز 123456"
  const kwMatch = all.match(/(?:code|otp|pin|verification|auth|passcode|security\s*code|কোড|رمز|your\s*code)\s*(?:is|:|-|=)?\s*([a-z0-9]{4,10})/i);
  if (kwMatch && /^\d+$/.test(kwMatch[1])) {
    return kwMatch[1];
  }

  // 5. Reverse keyword context: "123456 is your Instagram code" / "123456 is the verification code"
  const kwRev = all.match(/(?<!\d)([a-z0-9]{4,10})\s*(?:is\s*your|is\s*the|to\s*verify|কোড|is\s*your\s*instagram|is\s*your\s*facebook)/i);
  if (kwRev && /^\d+$/.test(kwRev[1])) {
    return kwRev[1];
  }

  // 6. Subject-priority: standalone 6 digits in subject
  const sMatch6 = s.match(/(?<!\d)(\d{6})(?!\d)/);
  if (sMatch6) return sMatch6[1];

  // 7. Standalone 6 digits in body
  const body6 = all.match(/(?<!\d)(\d{6})(?!\d)/);
  if (body6) return body6[1];

  // 8. General 4 to 8 digit sequence fallback (filter out standard year stamps)
  const genDigits = all.match(/(?<!\d)\d{4,8}(?!\d)/g);
  if (genDigits && genDigits.length > 0) {
    const nonYear = genDigits.find(d => d !== '2024' && d !== '2025' && d !== '2026' && d !== '2027');
    return nonYear || genDigits[0];
  }

  return null;
}

// ── In-Memory Sessions & Message Cache ───────────────────────────────────────
const sessions = new Map<string, TempMailAccount>();
const messageCache = new Map<string, TempMailMessage>();

// ── 1. Inboxes.com Client (GetAirMail / GetNada / InboxBear) ─────────────────
// Highly reliable, zero-auth, live MX exchange servers that receive Instagram verification emails
const INBOXES_BASE = 'https://inboxes.com/api/v2';
const INBOXES_DEFAULT_DOMAINS = [
  'getairmail.com',
  'getnada.com',
  'inboxbear.com',
  'dropjar.com',
  'fivermail.com',
  'robot-mail.com',
  'replyloop.com',
  'blondmail.com',
  'chapsmail.com',
  'tafmail.com',
  'temptami.com',
  'tupmail.com',
  'vomoto.com',
];

export async function inboxesGetDomains(): Promise<string[]> {
  const preferred = ['getairmail.com', 'getnada.com', 'inboxbear.com', 'dropjar.com', 'fivermail.com', 'robot-mail.com'];
  try {
    const res = await fetch(`${INBOXES_BASE}/domain`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return INBOXES_DEFAULT_DOMAINS;
    const data: any = await res.json();
    const rawList: string[] = (data.domains || []).map((d: any) => d.qdn).filter(Boolean);
    const sorted = [
      ...preferred.filter(p => rawList.includes(p)),
      ...rawList.filter(d => !preferred.includes(d)),
    ];
    return sorted.length > 0 ? sorted : INBOXES_DEFAULT_DOMAINS;
  } catch (_) {
    return INBOXES_DEFAULT_DOMAINS;
  }
}

export async function inboxesCreate(customDomain?: string, username?: string): Promise<{ ok: boolean; address: string; token: string }> {
  try {
    const domains = await inboxesGetDomains();
    let dom = customDomain && domains.includes(customDomain) ? customDomain : (customDomain || domains[0] || 'getairmail.com');
    if (!domains.includes(dom) && !dom.includes('.')) {
      dom = 'getairmail.com';
    }
    const uname = (username || 'user' + Math.floor(Math.random() * 899999 + 100000)).toLowerCase().replace(/[^a-z0-9]/g, '');
    const address = `${uname}@${dom}`;
    const token = 'in:' + address;
    return { ok: true, address, token };
  } catch (_) {
    const fallback = 'user' + Math.floor(Math.random() * 899999 + 100000) + '@getairmail.com';
    return { ok: true, address: fallback, token: 'in:' + fallback };
  }
}

export async function inboxesListMessages(address: string): Promise<TempMailMessage[]> {
  try {
    const res = await fetch(`${INBOXES_BASE}/inbox/${encodeURIComponent(address.toLowerCase())}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const msgs: any[] = data.msgs || [];
    const results: TempMailMessage[] = [];

    // Extract immediately from top 12 messages without blocking the event loop
    const topMsgs = msgs.slice(0, 12);
    for (const m of topMsgs) {
      const msgId = String(m.uid || m.id);
      if (messageCache.has(msgId)) {
        results.push(messageCache.get(msgId)!);
        continue;
      }

      const sub = m.s || '(No Subject)';
      const snippet = m.ph || '';
      const from = m.f || 'unknown';
      const receivedAt = m.cr ? new Date(m.cr).getTime() : (m.r ? Number(m.r) * 1000 : Date.now());
      let otp = extractOtp(sub, snippet, '');

      // If OTP was found in subject or snippet, we are good immediately
      if (otp) {
        const parsed: TempMailMessage = {
          id: msgId,
          from,
          fromName: '',
          subject: sub,
          snippet: (snippet || sub).slice(0, 140),
          otp,
          receivedAt,
          text: snippet,
          html: '',
        };
        messageCache.set(msgId, parsed);
        results.push(parsed);
      } else {
        // Only fetch full message for at most the top 2 messages if no OTP in snippet/subject
        let full: TempMailMessage | null = null;
        if (results.length < 2) {
          try {
            full = await inboxesGetMessage(msgId);
          } catch (_) {}
        }
        if (full) {
          results.push(full);
        } else {
          const parsed: TempMailMessage = {
            id: msgId,
            from,
            fromName: '',
            subject: sub,
            snippet: (snippet || sub).slice(0, 140),
            otp: null,
            receivedAt,
            text: snippet,
            html: '',
          };
          messageCache.set(msgId, parsed);
          results.push(parsed);
        }
      }
    }
    return results;
  } catch (_) {
    return [];
  }
}

export async function inboxesGetMessage(id: string): Promise<TempMailMessage | null> {
  if (messageCache.has(id) && messageCache.get(id)?.text) {
    return messageCache.get(id)!;
  }
  try {
    const res = await fetch(`${INBOXES_BASE}/message/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const m: any = await res.json();
    if (!m) return null;
    const subject = m.s || '(No Subject)';
    const text = m.text || '';
    const html = m.html || '';
    const from = m.f || 'unknown';
    const otp = extractOtp(subject, text, html);
    const item: TempMailMessage = {
      id: String(id),
      from,
      fromName: '',
      subject,
      snippet: (text || stripHtml(html)).slice(0, 140),
      otp,
      receivedAt: m.d ? new Date(m.d).getTime() : Date.now(),
      text,
      html,
    };
    messageCache.set(id, item);
    return item;
  } catch (_) {
    return null;
  }
}

// ── 2. Mail.tm Client ───────────────────────────────────────────────────────
const MAILTM_BASE = 'https://api.mail.tm';

export async function mailtmGetDomains(): Promise<string[]> {
  try {
    const res = await fetch(`${MAILTM_BASE}/domains?page=1`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return ['uberip.com'];
    const data: any = await res.json();
    const members = data['hydra:member'] || data || [];
    const list = members
      .filter((d: any) => d && d.isActive !== false)
      .map((d: any) => d.domain)
      .filter(Boolean);
    return list.length > 0 ? list : ['uberip.com'];
  } catch (_) {
    return ['uberip.com'];
  }
}

export async function mailtmCreateAccount(address: string, pass: string): Promise<{ ok: boolean; id?: string }> {
  try {
    const res = await fetch(`${MAILTM_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ address, password: pass }),
    });
    const data: any = await res.json();
    return { ok: res.ok, id: data.id };
  } catch (_) {
    return { ok: false };
  }
}

export async function mailtmGetToken(address: string, pass: string): Promise<{ ok: boolean; token?: string }> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${MAILTM_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ address, password: pass }),
      });
      const data: any = await res.json();
      if (res.ok && data.token) return { ok: true, token: data.token };
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 600));
  }
  return { ok: false };
}

export async function mailtmListMessages(token: string): Promise<TempMailMessage[]> {
  try {
    const res = await fetch(`${MAILTM_BASE}/messages?page=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const list = data['hydra:member'] || [];
    const results: TempMailMessage[] = [];

    for (const m of list) {
      const msgId = String(m.id);
      if (messageCache.has(msgId)) {
        results.push(messageCache.get(msgId)!);
        continue;
      }
      const subject = m.subject || '(No Subject)';
      const intro = m.intro || '';
      let otp = extractOtp(subject, intro, '');

      // If OTP was not in intro or subject, immediately fetch the full message
      if (!otp) {
        const full = await mailtmGetMessage(token, msgId);
        if (full) {
          messageCache.set(msgId, full);
          results.push(full);
          continue;
        }
      }

      const fromAddr = m.from?.address || m.from?.name || 'unknown';
      const fromName = m.from?.name || '';
      const item: TempMailMessage = {
        id: msgId,
        from: fromAddr,
        fromName,
        subject,
        snippet: intro,
        otp,
        receivedAt: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
      };
      messageCache.set(msgId, item);
      results.push(item);
    }
    return results;
  } catch (_) {
    return [];
  }
}

export async function mailtmGetMessage(token: string, id: string): Promise<TempMailMessage | null> {
  if (messageCache.has(id) && messageCache.get(id)?.text) {
    return messageCache.get(id)!;
  }
  try {
    const res = await fetch(`${MAILTM_BASE}/messages/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const m: any = await res.json();
    const subject = m.subject || '(No Subject)';
    const text = m.text || '';
    const html = Array.isArray(m.html) ? m.html.join('\n') : (m.html || '');
    const item: TempMailMessage = {
      id: m.id,
      from: m.from?.address || m.from?.name || 'unknown',
      fromName: m.from?.name || '',
      subject,
      snippet: text.slice(0, 140) || stripHtml(html).slice(0, 140),
      otp: extractOtp(subject, text, html),
      receivedAt: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
      text,
      html,
    };
    messageCache.set(id, item);
    return item;
  } catch (_) {
    return null;
  }
}

// ── 3. Guerrilla Mail Client ────────────────────────────────────────────────
const GUERRILLA_BASE = 'https://api.guerrillamail.com/ajax.php';

export async function guerrillaCreate(username?: string): Promise<{ ok: boolean; address: string; token: string }> {
  try {
    const res = await fetch(`${GUERRILLA_BASE}?f=get_email_address`);
    const data: any = await res.json();
    if (!data.email_addr || !data.sid_token) return { ok: false, address: '', token: '' };
    let address = data.email_addr;
    const sid = data.sid_token;

    if (username) {
      try {
        const dom = address.split('@')[1] || 'guerrillamailblock.com';
        const setRes = await fetch(`${GUERRILLA_BASE}?f=set_email_user&email_user=${encodeURIComponent(username)}&domain=${encodeURIComponent(dom)}&sid_token=${encodeURIComponent(sid)}`);
        const setData: any = await setRes.json();
        if (setData && setData.email_addr) address = setData.email_addr;
      } catch (_) {}
    }

    const token = 'g:' + Buffer.from(JSON.stringify({ sid })).toString('base64url');
    return { ok: true, address, token };
  } catch (_) {
    return { ok: false, address: '', token: '' };
  }
}

export async function guerrillaListMessages(token: string): Promise<TempMailMessage[]> {
  try {
    const raw = Buffer.from(token.slice(2), 'base64url').toString();
    const { sid } = JSON.parse(raw);
    const res = await fetch(`${GUERRILLA_BASE}?f=check_email&seq=0&sid_token=${encodeURIComponent(sid)}`);
    const data: any = await res.json();
    const list = (data.list || []).filter((m: any) => m.mail_from !== 'no-reply@guerrillamail.com');
    const results: TempMailMessage[] = [];

    for (const m of list) {
      const msgId = String(m.mail_id);
      if (messageCache.has(msgId)) {
        results.push(messageCache.get(msgId)!);
        continue;
      }
      const subject = m.mail_subject || '(No Subject)';
      const excerpt = m.mail_excerpt || '';
      let otp = extractOtp(subject, excerpt, '');

      if (!otp) {
        const full = await guerrillaGetMessage(token, msgId);
        if (full) {
          messageCache.set(msgId, full);
          results.push(full);
          continue;
        }
      }

      const item: TempMailMessage = {
        id: msgId,
        from: m.mail_from || 'unknown',
        fromName: '',
        subject,
        snippet: excerpt,
        otp,
        receivedAt: m.mail_timestamp ? Number(m.mail_timestamp) * 1000 : Date.now(),
      };
      messageCache.set(msgId, item);
      results.push(item);
    }
    return results;
  } catch (_) {
    return [];
  }
}

export async function guerrillaGetMessage(token: string, id: string): Promise<TempMailMessage | null> {
  if (messageCache.has(id) && messageCache.get(id)?.text) {
    return messageCache.get(id)!;
  }
  try {
    const raw = Buffer.from(token.slice(2), 'base64url').toString();
    const { sid } = JSON.parse(raw);
    const res = await fetch(`${GUERRILLA_BASE}?f=fetch_email&email_id=${encodeURIComponent(id)}&sid_token=${encodeURIComponent(sid)}`);
    const data: any = await res.json();
    if (!data.mail_id) return null;
    const html = data.mail_body || '';
    const text = stripHtml(html);
    const subject = data.mail_subject || '(No Subject)';
    const item: TempMailMessage = {
      id: String(data.mail_id),
      from: data.mail_from || 'unknown',
      fromName: '',
      subject,
      snippet: text.slice(0, 140),
      otp: extractOtp(subject, text, html),
      receivedAt: data.mail_timestamp ? Number(data.mail_timestamp) * 1000 : Date.now(),
      text,
      html,
    };
    messageCache.set(id, item);
    return item;
  } catch (_) {
    return null;
  }
}

// ── 4. DropMail.me Client ───────────────────────────────────────────────────
export async function dropmailCreate(): Promise<{ ok: boolean; address: string; token: string }> {
  try {
    const res = await fetch('https://dropmail.me/api/token/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'af', lifetime: '1h' }),
    });
    const data: any = await res.json();
    if (!data.token) return { ok: false, address: '', token: '' };
    const afToken = data.token;

    const query = 'mutation { introduceSession { id addresses { address } } }';
    const sesRes = await fetch(`https://dropmail.me/api/graphql/${afToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const sesData: any = await sesRes.json();
    const session = sesData?.data?.introduceSession;
    const address = session?.addresses?.[0]?.address;
    if (!session?.id || !address) return { ok: false, address: '', token: '' };

    const token = 'd:' + Buffer.from(JSON.stringify({ s: session.id, t: afToken })).toString('base64url');
    return { ok: true, address, token };
  } catch (_) {
    return { ok: false, address: '', token: '' };
  }
}

export async function dropmailListMessages(token: string): Promise<TempMailMessage[]> {
  try {
    const raw = Buffer.from(token.slice(2), 'base64url').toString();
    const { s, t } = JSON.parse(raw);
    const query = `query($id: ID!) { session(id:$id) { mails { id headerSubject headerFrom fromAddr text html receivedAt } } }`;
    const res = await fetch(`https://dropmail.me/api/graphql/${t}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: s } }),
    });
    const data: any = await res.json();
    const mails = data?.data?.session?.mails || [];
    return mails.map((m: any) => {
      const subject = m.headerSubject || '(No Subject)';
      const text = m.text || '';
      const html = m.html || '';
      return {
        id: m.id,
        from: m.fromAddr || m.headerFrom || 'unknown',
        fromName: m.headerFrom || '',
        subject,
        snippet: (text || stripHtml(html)).slice(0, 140),
        otp: extractOtp(subject, text, html),
        receivedAt: m.receivedAt ? new Date(m.receivedAt).getTime() : Date.now(),
        text,
        html,
      };
    });
  } catch (_) {
    return [];
  }
}

// ── 5. Mailinator Client ────────────────────────────────────────────────────
export function mailinatorCreate(username?: string): { ok: boolean; address: string; token: string } {
  const uname = (username || 'user' + Math.random().toString(36).slice(2, 10)).toLowerCase().replace(/[^a-z0-9]/g, '');
  const address = `${uname}@mailinator.com`;
  return { ok: true, address, token: 'mi:' + uname };
}

export async function mailinatorListMessages(token: string): Promise<TempMailMessage[]> {
  try {
    const uname = token.slice(3);
    const res = await fetch(`https://www.mailinator.com/api/v2/domains/public/inboxes/${encodeURIComponent(uname)}/messages`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const msgs = data.messages || [];
    return msgs.map((m: any) => ({
      id: m.id,
      from: m.from || 'unknown',
      fromName: '',
      subject: m.subject || '(No Subject)',
      snippet: '',
      otp: extractOtp(m.subject || '', '', ''),
      receivedAt: m.time || Date.now(),
    }));
  } catch (_) {
    return [];
  }
}

export async function mailinatorGetMessage(id: string): Promise<TempMailMessage | null> {
  try {
    const res = await fetch(`https://www.mailinator.com/api/v2/domains/public/messages/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const m: any = await res.json();
    const subject = m.subject || '(No Subject)';
    const text = m.text || '';
    const html = m.html || '';
    return {
      id: m.id,
      from: m.from || 'unknown',
      fromName: '',
      subject,
      snippet: text.slice(0, 140) || stripHtml(html).slice(0, 140),
      otp: extractOtp(subject, text, html),
      receivedAt: m.time || Date.now(),
      text,
      html,
    };
  } catch (_) {
    return null;
  }
}

// ── Unified Multi-Engine Orchestrator ───────────────────────────────────────

export async function getDomainCatalog(): Promise<string[]> {
  const domains: string[] = [];
  const inDomains = await inboxesGetDomains();
  domains.push(...inDomains);
  const mtDomains = await mailtmGetDomains();
  domains.push(...mtDomains);
  domains.push('guerrillamailblock.com', 'dropmail.me');
  return Array.from(new Set(domains));
}

export async function createInbox(params: {
  provider?: string;
  domain?: string;
  username?: string;
}): Promise<TempMailAccount> {
  const chosenProvider = params.provider || 'auto';
  const customUser = (params.username || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const reqDomain = (params.domain || '').toLowerCase().trim();

  // If user specifically requested Mail.tm or uberip domain
  if (chosenProvider === 'mailtm' || reqDomain.includes('uberip')) {
    const domains = await mailtmGetDomains();
    const dom = reqDomain && domains.includes(reqDomain) ? reqDomain : (domains[0] || 'uberip.com');
    const local = customUser || ('user' + Math.floor(Math.random() * 899999 + 100000));
    const address = `${local}@${dom}`;
    const pass = 'Pass' + Math.random().toString(36).slice(2, 10) + '99!';
    const acc = await mailtmCreateAccount(address, pass);
    if (acc.ok) {
      const tok = await mailtmGetToken(address, pass);
      if (tok.ok && tok.token) {
        const item: TempMailAccount = {
          address,
          token: tok.token,
          provider: 'mailtm',
          createdAt: Date.now(),
          expiresAt: Date.now() + 60 * 60 * 1000,
          domain: dom,
        };
        sessions.set(address.toLowerCase(), item);
        return item;
      }
    }
  }

  // If user requested Guerrilla
  if (chosenProvider === 'guerrilla' || reqDomain.includes('guerrilla') || reqDomain.includes('sharklasers') || reqDomain.includes('grr.la')) {
    const gm = await guerrillaCreate(customUser);
    if (gm.ok && gm.address) {
      const item: TempMailAccount = {
        address: gm.address,
        token: gm.token,
        provider: 'guerrilla',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
        domain: gm.address.split('@')[1] || 'guerrillamailblock.com',
      };
      sessions.set(gm.address.toLowerCase(), item);
      return item;
    }
  }

  // If user requested Dropmail
  if (chosenProvider === 'dropmail' || reqDomain.includes('dropmail') || reqDomain.includes('10mail') || reqDomain.includes('emlhub')) {
    const dm = await dropmailCreate();
    if (dm.ok && dm.address) {
      const item: TempMailAccount = {
        address: dm.address,
        token: dm.token,
        provider: 'dropmail',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
        domain: dm.address.split('@')[1] || 'dropmail.me',
      };
      sessions.set(dm.address.toLowerCase(), item);
      return item;
    }
  }

  // Primary Default & High-Deliverability Engine: Inboxes (GetAirMail / GetNada / InboxBear)
  // These domains have active MX records and consistently receive Instagram verification codes
  const inb = await inboxesCreate(reqDomain || undefined, customUser || undefined);
  if (inb.ok && inb.address) {
    const item: TempMailAccount = {
      address: inb.address,
      token: inb.token,
      provider: 'inboxes',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      domain: inb.address.split('@')[1] || 'getairmail.com',
    };
    sessions.set(inb.address.toLowerCase(), item);
    return item;
  }

  // Fallback to Mail.tm
  const mDoms = await mailtmGetDomains();
  const mDom = mDoms[0] || 'uberip.com';
  const mLocal = customUser || ('user' + Math.floor(Math.random() * 899999 + 100000));
  const mAddr = `${mLocal}@${mDom}`;
  const mPass = 'Pass' + Math.random().toString(36).slice(2, 10) + '99!';
  await mailtmCreateAccount(mAddr, mPass);
  const mTok = await mailtmGetToken(mAddr, mPass);
  if (mTok.ok && mTok.token) {
    const item: TempMailAccount = {
      address: mAddr,
      token: mTok.token,
      provider: 'mailtm',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      domain: mDom,
    };
    sessions.set(mAddr.toLowerCase(), item);
    return item;
  }

  // Final fallback: Guerrilla
  const fallbackGm = await guerrillaCreate(customUser);
  const finalItem: TempMailAccount = {
    address: fallbackGm.address || 'fallback@guerrillamailblock.com',
    token: fallbackGm.token || 'g:none',
    provider: 'guerrilla',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000,
    domain: 'guerrillamailblock.com',
  };
  sessions.set(finalItem.address.toLowerCase(), finalItem);
  return finalItem;
}

export async function fetchInboxMessages(token: string, address?: string): Promise<TempMailMessage[]> {
  const addr = (address || '').toLowerCase().trim();
  const session = sessions.get(addr);
  const effectiveToken = token || session?.token || '';
  let liveMsgs: TempMailMessage[] = [];

  if (effectiveToken.startsWith('in:') || (addr && (addr.includes('@getairmail') || addr.includes('@getnada') || addr.includes('@inboxbear') || addr.includes('@fivermail') || addr.includes('@dropjar') || addr.includes('@robot-mail')))) {
    const cleanAddr = effectiveToken.startsWith('in:') ? effectiveToken.slice(3) : addr;
    liveMsgs = await inboxesListMessages(cleanAddr);
  } else if (effectiveToken.startsWith('g:')) {
    liveMsgs = await guerrillaListMessages(effectiveToken);
  } else if (effectiveToken.startsWith('d:')) {
    liveMsgs = await dropmailListMessages(effectiveToken);
  } else if (effectiveToken.startsWith('mi:')) {
    liveMsgs = await mailinatorListMessages(effectiveToken);
  } else if (effectiveToken) {
    liveMsgs = await mailtmListMessages(effectiveToken);
  } else if (addr) {
    // Universal fallback: try inboxes first, then guerrilla if domain matches
    liveMsgs = await inboxesListMessages(addr);
  }

  // Sort descending by received time
  liveMsgs.sort((a, b) => b.receivedAt - a.receivedAt);
  return liveMsgs;
}

export async function fetchSingleMessage(token: string, id: string): Promise<TempMailMessage | null> {
  if (token.startsWith('in:')) {
    return inboxesGetMessage(id);
  } else if (token.startsWith('g:')) {
    return guerrillaGetMessage(token, id);
  } else if (token.startsWith('d:')) {
    const list = await dropmailListMessages(token);
    return list.find((m) => m.id === id) || null;
  } else if (token.startsWith('mi:')) {
    return mailinatorGetMessage(id);
  } else if (token) {
    return mailtmGetMessage(token, id);
  }
  return inboxesGetMessage(id);
}

// Kept for backward compatibility but permanently disabled demo OTP injection
export function injectTestOtpMessage(_address: string, _serviceName = 'Instagram'): null {
  // Demo OTP has been permanently disabled per user request. Only real incoming messages are supported.
  return null;
}
