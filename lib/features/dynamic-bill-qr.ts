import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import generatePayload from 'promptpay-qr';

const execFileAsync = promisify(execFile);

export interface EmvcoTlvTag {
  tag: string;
  length: number;
  value: string;
  label: string;
  description: string;
}

export interface ParsedBankEmail {
  found: boolean;
  bankName: string;
  senderEmail: string;
  subject: string;
  amount: number | null;
  accountMask: string;
  transRef: string;
  receivedAt: string;
  rawSnippet: string;
  screenshotDataUrl?: string | null;
  /** the amount exactly as written in the message (e.g. "1,234.56") — a match needs both satang digits */
  amountText?: string | null;
}

export interface DynamicPaymentSession {
  sessionId: string;
  billId?: number | null;
  /** user who opened the QR (commit 29: only they or staff may read / check it) */
  ownerUserId?: number | null;
  roomNumber: string;
  tenantName: string;
  billTitle: string;
  baseAmount: number;
  satangTag: number;
  enableSatang: boolean;
  expectedAmount: number;
  promptpayNumber: string;
  promptpayName: string;
  promptpayBank: string;
  emvcoPayload: string;
  emvcoTags: EmvcoTlvTag[];
  crc16Checksum: string;
  baselineToastCount: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  verifiedBy?:
    | 'LINE_SERVER_LISTENER'
    | 'GMAIL_IMAP'
    | 'IOS_SHORTCUT_WEBHOOK'
    | 'EMAIL_SIMULATOR'
    | null;
  matchedEmail?: ParsedBankEmail | null;
  receiptNo?: string | null;
  receiptHash?: string | null;
  screenshotDataUrl?: string | null;
  createdAt: string;
  paidAt?: string | null;
  expiresAt: string;
}

// Persist sessions and OCR state across Next.js hot reloads
const globalForQr = globalThis as unknown as {
  __dynamicQrSessions?: Map<string, DynamicPaymentSession>;
  __dynamicQrHistory?: DynamicPaymentSession[];
  __lastSatangByRoom?: Map<string, number>;
  __lastLineOcrText?: string;
};

if (!globalForQr.__dynamicQrSessions) {
  globalForQr.__dynamicQrSessions = new Map<string, DynamicPaymentSession>();
}
if (!globalForQr.__dynamicQrHistory) {
  globalForQr.__dynamicQrHistory = [];
}
if (!globalForQr.__lastSatangByRoom) {
  globalForQr.__lastSatangByRoom = new Map<string, number>();
}
if (globalForQr.__lastLineOcrText === undefined) {
  globalForQr.__lastLineOcrText = '';
}

export const dynamicQrSessions = globalForQr.__dynamicQrSessions;
export const dynamicQrHistory = globalForQr.__dynamicQrHistory;
export const lastSatangByRoom = globalForQr.__lastSatangByRoom;

const EMVCO_TAG_DICTIONARY: Record<string, { label: string; desc: (val: string) => string }> = {
  '00': {
    label: 'Payload Format Indicator',
    desc: (v) => `เวอร์ชันโครงสร้าง EMVCo (${v})`,
  },
  '01': {
    label: 'Point of Initiation Method',
    desc: (v) => (v === '12' ? '12 = Dynamic QR (ฝังยอดเงินรายบิล)' : '11 = Static QR (ไม่มีการฝังยอดเงิน)'),
  },
  '29': {
    label: 'Merchant Account Info (PromptPay)',
    desc: () => 'AID A000000677010111 + เลขพร้อมเพย์ผู้รับเงิน (จากหน้าตั้งค่าหอพัก)',
  },
  '53': {
    label: 'Transaction Currency (ISO 4217)',
    desc: (v) => (v === '764' ? '764 = สกุลเงินบาทไทย (THB)' : v),
  },
  '54': {
    label: 'Transaction Amount (Embedded)',
    desc: (v) => `ยอดเงินที่ฝังลงใน QR อัตโนมัติ: ฿${Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
  },
  '58': {
    label: 'Country Code (ISO 3166-1)',
    desc: (v) => `${v} = ประเทศไทย (Thailand)`,
  },
  '63': {
    label: 'CRC-16/CCITT-FALSE Checksum',
    desc: (v) => `รหัสตรวจสอบความถูกต้อง 16-bit (${v}) ป้องกันการแก้ไขยอดเงิน`,
  },
};

export function decodeEmvcoTlvPayload(payload: string): EmvcoTlvTag[] {
  const tags: EmvcoTlvTag[] = [];
  let idx = 0;

  while (idx + 4 <= payload.length) {
    const tag = payload.slice(idx, idx + 2);
    const lenStr = payload.slice(idx + 2, idx + 4);
    const length = parseInt(lenStr, 10);
    if (isNaN(length) || length < 0 || idx + 4 + length > payload.length) {
      break;
    }
    const value = payload.slice(idx + 4, idx + 4 + length);
    const meta = EMVCO_TAG_DICTIONARY[tag];

    tags.push({
      tag,
      length,
      value,
      label: meta ? meta.label : `Tag ${tag}`,
      description: meta ? meta.desc(value) : value,
    });

    idx += 4 + length;
  }

  return tags;
}

/**
 * ดึงภาพหน้าต่างแชท LINE (Krungthai Connext) ในเครื่องเซิร์ฟเวอร์ด้วย Win32 PrintWindow + Windows.Media.Ocr
 */
export async function readLineChatWindowOcr(): Promise<{
  foundWindow: boolean;
  windows: string;
  text: string;
  screenshotDataUrl?: string | null;
  windowEntries?: Array<{ text: string; screenshotDataUrl?: string | null }>;
  error?: string;
}> {
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'read-line-ocr.ps1');
    if (!fs.existsSync(scriptPath)) {
      return { foundWindow: false, windows: '', text: '', error: 'SCRIPT_NOT_FOUND' };
    }

    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { timeout: 7000 }
    );

    const trimmed = (stdout || '').trim();
    const jsonLine = trimmed.split(/\r?\n/).pop() || '{}';
    const data = JSON.parse(jsonLine);

    if (data.text) {
      globalForQr.__lastLineOcrText = String(data.text);
    }

    return {
      foundWindow: Boolean(data.foundWindow),
      windows: String(data.windows || ''),
      text: String(data.text || ''),
      screenshotDataUrl: data.screenshotDataUrl || null,
      windowEntries: Array.isArray(data.windowEntries) ? data.windowEntries : [],
      error: data.error,
    };
  } catch (err: any) {
    return {
      foundWindow: false,
      windows: '',
      text: '',
      screenshotDataUrl: null,
      windowEntries: [],
      error: err.message,
    };
  }
}

/**
 * สุ่มและจองเศษสตางค์รายบิล (.01 - .99) แบบไม่ซ้ำกับบิลอื่นที่กำลังเปิดรอชำระ และไม่ซ้ำกับตัวเลขที่ค้างอยู่บนหน้าจอ LINE
 */
export function computeDynamicAmountWithSatang(
  baseAmount: number,
  roomNumber: string,
  enableSatang: boolean
): { expectedAmount: number; satangTag: number } {
  const cleanBase = Math.max(0.01, Number(baseAmount) || 1);

  if (!enableSatang) {
    return {
      expectedAmount: Number(cleanBase.toFixed(2)),
      satangTag: 0,
    };
  }

  const existingSatang = Math.round((cleanBase - Math.floor(cleanBase)) * 100);
  if (existingSatang > 0) {
    return {
      expectedAmount: Number(cleanBase.toFixed(2)),
      satangTag: existingSatang,
    };
  }

  const nowMs = Date.now();
  const usedAmounts = new Set<string>();

  for (const existingSession of dynamicQrSessions.values()) {
    const expMs = new Date(existingSession.expiresAt).getTime();
    if (existingSession.status === 'PENDING' && expMs > nowMs) {
      if (existingSession.roomNumber !== roomNumber) {
        usedAmounts.add(existingSession.expectedAmount.toFixed(2));
      }
    }
  }

  const prevSatang = lastSatangByRoom.get(roomNumber) || 0;
  const intBase = Math.floor(cleanBase);
  const lastOcr = globalForQr.__lastLineOcrText || '';

  const candidates: number[] = [];
  for (let s = 1; s <= 99; s++) {
    candidates.push(s);
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  let chosenSatang = candidates[0];
  for (const s of candidates) {
    const candidateAmtStr = (intBase + s / 100).toFixed(2);
    const alreadyOnLineScreen = lastOcr.includes(candidateAmtStr);
    // ห้ามชนกับบิลห้องอื่น, ห้ามซ้ำกับเลขครั้งก่อนหน้า และห้ามตรงกับยอดเก่าที่โชว์ค้างอยู่บนหน้าแชท LINE
    if (!usedAmounts.has(candidateAmtStr) && s !== prevSatang && !alreadyOnLineScreen) {
      chosenSatang = s;
      break;
    }
  }

  lastSatangByRoom.set(roomNumber, chosenSatang);
  const finalAmount = Number((intBase + chosenSatang / 100).toFixed(2));

  return {
    expectedAmount: finalAmount,
    satangTag: chosenSatang,
  };
}

/** PromptPay account of the dorm, from the settings table (lib/billing getPaymentInfo) */
export interface DormPromptPay {
  number: string;
  name: string;
  bank: string;
}

export function createDynamicPaymentSession(params: {
  sessionId?: string;
  billId?: number | null;
  ownerUserId?: number | null;
  roomNumber?: string;
  tenantName?: string;
  billTitle?: string;
  baseAmount: number;
  enableSatang?: boolean;
  /** commit 29: the dorm's PromptPay from the settings page — never a number written in the code */
  promptpay: DormPromptPay;
}): DynamicPaymentSession {
  const roomNumber = params.roomNumber || '-';
  const tenantName = params.tenantName || 'ผู้เช่า';
  const billTitle = params.billTitle || `ค่าเช่าและสาธารณูปโภค ห้อง ${roomNumber}`;
  const enableSatang = params.enableSatang !== undefined ? params.enableSatang : true;

  if (!params.sessionId) {
    for (const [oldId, oldSes] of dynamicQrSessions.entries()) {
      if (oldSes.status === 'PENDING' && oldSes.roomNumber === roomNumber) {
        oldSes.status = 'EXPIRED';
        dynamicQrSessions.set(oldId, oldSes);
      }
    }
  }

  const { expectedAmount, satangTag } = computeDynamicAmountWithSatang(
    params.baseAmount,
    roomNumber,
    enableSatang
  );

  const promptpayNumber = String(params.promptpay?.number || '').replace(/[\s-]/g, '');
  if (!promptpayNumber) throw new Error('ยังไม่ได้ตั้งค่าเลขพร้อมเพย์ของหอพัก (หน้าตั้งค่า → ช่องทางชำระเงิน)');
  const promptpayName = params.promptpay.name || '';
  const promptpayBank = params.promptpay.bank || 'พร้อมเพย์';

  const emvcoPayload = generatePayload(promptpayNumber, { amount: expectedAmount });
  const emvcoTags = decodeEmvcoTlvPayload(emvcoPayload);
  const crcTag = emvcoTags.find((t) => t.tag === '63');
  const crc16Checksum = crcTag ? crcTag.value : emvcoPayload.slice(-4);

  const sessionId =
    params.sessionId ||
    `DQR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  const session: DynamicPaymentSession = {
    sessionId,
    billId: params.billId ?? null,
    ownerUserId: params.ownerUserId ?? null,
    roomNumber,
    tenantName,
    billTitle,
    baseAmount: Number(params.baseAmount),
    satangTag,
    enableSatang,
    expectedAmount,
    promptpayNumber,
    promptpayName,
    promptpayBank,
    emvcoPayload,
    emvcoTags,
    crc16Checksum,
    // how many times this exact amount is already on the LINE screen: only a newer message can pay this QR
    baselineToastCount: findExactAmount(globalForQr.__lastLineOcrText || '', expectedAmount).length,
    status: 'PENDING',
    verifiedBy: null,
    matchedEmail: null,
    receiptNo: null,
    receiptHash: null,
    createdAt: now.toISOString(),
    paidAt: null,
    expiresAt: expiresAt.toISOString(),
  };

  dynamicQrSessions.set(sessionId, session);
  return session;
}

export function generateReceiptSlipDataUrl(params: {
  amount: number;
  roomNumber: string;
  tenantName?: string;
  transRef: string;
  paidAt: string;
  methodTitle?: string;
  promptpayNumber?: string;
  promptpayName?: string;
}): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
  const formattedAmt = params.amount.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dateStr = new Date(params.paidAt).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const method = params.methodTitle || 'Krungthai Connext (LINE)';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780" viewBox="0 0 600 780">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0284c7" />
        <stop offset="100%" stop-color="#0369a1" />
      </linearGradient>
    </defs>
    <rect width="600" height="780" rx="32" fill="#0f172a" />
    <rect x="20" y="20" width="560" height="740" rx="24" fill="#1e293b" stroke="#334155" stroke-width="2" />
    <rect x="20" y="20" width="560" height="150" rx="24" fill="url(#bg)" />
    
    <text x="50" y="70" font-family="sans-serif" font-size="22" font-weight="900" fill="#ffffff">ธนาคารกรุงไทย · Krungthai NEXT</text>
    <text x="50" y="100" font-family="sans-serif" font-size="14" fill="#e0f2fe">หลักฐานการรับชำระเงินอัตโนมัติ (Dynamic Bill QR)</text>
    <text x="50" y="135" font-family="sans-serif" font-size="13" font-weight="bold" fill="#38bdf8">✓ ชำระเงินสำเร็จ (VERIFIED)</text>
    
    <rect x="40" y="195" width="520" height="110" rx="20" fill="#0f172a" stroke="#0284c7" stroke-width="1.5" />
    <text x="65" y="235" font-family="sans-serif" font-size="14" fill="#94a3b8">จำนวนเงินที่โอนเข้า</text>
    <text x="65" y="280" font-family="sans-serif" font-size="36" font-weight="900" fill="#38bdf8">฿${formattedAmt}</text>
    <text x="520" y="280" text-anchor="end" font-family="sans-serif" font-size="14" font-weight="bold" fill="#4ade80">เงินเข้าบัญชีแล้ว</text>
    
    <g transform="translate(50, 340)" font-family="sans-serif">
      <text x="0" y="25" font-size="14" fill="#94a3b8">ไปยังบัญชี</text>
      <text x="500" y="25" text-anchor="end" font-size="14" font-weight="bold" fill="#f8fafc">พร้อมเพย์ ${esc(params.promptpayNumber || '-')}</text>
      <text x="500" y="48" text-anchor="end" font-size="12" fill="#94a3b8">${esc(params.promptpayName || '')}</text>
      <line x1="0" y1="65" x2="500" y2="65" stroke="#334155" stroke-dasharray="4" />

      <text x="0" y="95" font-size="14" fill="#94a3b8">ห้องพัก</text>
      <text x="500" y="95" text-anchor="end" font-size="14" font-weight="bold" fill="#38bdf8">ห้อง ${params.roomNumber}</text>
      <line x1="0" y1="115" x2="500" y2="115" stroke="#334155" stroke-dasharray="4" />

      <text x="0" y="145" font-size="14" fill="#94a3b8">ชื่อผู้เช่า / ผู้ชำระ</text>
      <text x="500" y="145" text-anchor="end" font-size="14" font-weight="bold" fill="#f8fafc">${esc(params.tenantName || 'ผู้เช่าห้อง ' + params.roomNumber)}</text>
      <line x1="0" y1="165" x2="500" y2="165" stroke="#334155" stroke-dasharray="4" />

      <text x="0" y="195" font-size="14" fill="#94a3b8">ช่องทางตรวจจับ</text>
      <text x="500" y="195" text-anchor="end" font-size="14" font-weight="bold" fill="#a78bfa">${method}</text>
      <line x1="0" y1="215" x2="500" y2="215" stroke="#334155" stroke-dasharray="4" />

      <text x="0" y="245" font-size="14" fill="#94a3b8">วัน-เวลาที่ตรวจพบ</text>
      <text x="500" y="245" text-anchor="end" font-size="14" font-weight="bold" fill="#f8fafc">${dateStr}</text>
      <line x1="0" y1="265" x2="500" y2="265" stroke="#334155" stroke-dasharray="4" />

      <text x="0" y="295" font-size="13" fill="#94a3b8">รหัสอ้างอิง</text>
      <text x="500" y="295" text-anchor="end" font-size="13" font-family="monospace" font-weight="bold" fill="#e2e8f0">${params.transRef}</text>
    </g>

    <rect x="40" y="685" width="520" height="50" rx="14" fill="#0f172a" />
    <text x="300" y="715" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#64748b">หลักฐานนี้ถูกบันทึกอัตโนมัติโดยระบบตรวจจับยอดเงินเข้า หอพักเกษร</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function approveDynamicPaymentSession(
  session: DynamicPaymentSession,
  matchedEmail: ParsedBankEmail,
  verifiedBy: DynamicPaymentSession['verifiedBy'] = 'LINE_SERVER_LISTENER'
): DynamicPaymentSession {
  const paidAt = new Date().toISOString();
  const receiptNo = `RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${session.roomNumber}-${session.sessionId.slice(-4)}`;
  const receiptHash = crypto
    .createHash('sha256')
    .update(`${receiptNo}|${session.expectedAmount.toFixed(2)}|${matchedEmail.transRef}|${paidAt}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();

  const screenshotDataUrl =
    matchedEmail.screenshotDataUrl ||
    generateReceiptSlipDataUrl({
      amount: session.expectedAmount,
      roomNumber: session.roomNumber,
      tenantName: session.tenantName,
      transRef: matchedEmail.transRef,
      paidAt,
      promptpayNumber: session.promptpayNumber,
      promptpayName: session.promptpayName,
      methodTitle: verifiedBy === 'LINE_SERVER_LISTENER' ? 'LINE Krungthai Connext (Screen OCR)' : 'Krungthai Connext Notification',
    });

  session.status = 'PAID';
  session.verifiedBy = verifiedBy;
  session.matchedEmail = matchedEmail;
  session.paidAt = paidAt;
  session.receiptNo = receiptNo;
  session.receiptHash = `SHA256-${receiptHash}`;
  session.screenshotDataUrl = screenshotDataUrl;

  dynamicQrSessions.set(session.sessionId, session);

  const existingIdx = dynamicQrHistory.findIndex((h) => h.sessionId === session.sessionId);
  if (existingIdx >= 0) {
    dynamicQrHistory[existingIdx] = { ...session };
  } else {
    dynamicQrHistory.unshift({ ...session });
    if (dynamicQrHistory.length > 20) dynamicQrHistory.pop();
  }

  return session;
}

export function parseThaiBankEmailContent(
  rawText: string,
  meta?: { subject?: string; from?: string; date?: string }
): ParsedBankEmail {
  const cleanText = (rawText || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const combined = `${meta?.subject || ''} ${meta?.from || ''} ${cleanText}`;

  const amountPatterns = [
    /(?:จำนวนเงิน|จำนวน|ยอดเงิน|ยอดโอนเข้า|รับโอนเงิน|เงินเข้า|โอนเงิน|Amount|THB|฿|\+)\s*[:：]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2}))\s*(?:บาท|THB|บ\.)?/i,
    /([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})\s*(?:บาท|THB|บ\.)/i,
    /([0-9]+\.[0-9]{2})/,
  ];

  let parsedAmount: number | null = null;
  let amountText: string | null = null;
  for (const regex of amountPatterns) {
    const m = combined.match(regex);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        parsedAmount = Number(val.toFixed(2));
        amountText = m[1];
        break;
      }
    }
  }

  const transRef = `KTB-LINE-${Date.now().toString(36).toUpperCase()}`;

  return {
    found: parsedAmount !== null,
    bankName: 'LINE Krungthai Connext (ธนาคารกรุงไทย)',
    senderEmail: meta?.from || 'LINE: Krungthai Connext',
    subject: meta?.subject || 'ตรวจพบยอดเงินเข้าจากหน้าต่างแชท LINE Krungthai Connext',
    amount: parsedAmount,
    amountText,
    accountMask: 'พร้อมเพย์ของหอพัก',
    transRef,
    receivedAt: meta?.date || new Date().toISOString(),
    rawSnippet: cleanText.slice(0, 280),
  };
}

/**
 * commit 29: a bank message pays a QR only with the full amount including both satang digits (1,234.56 — never
 * 1,234 or 1,234.5) and only when it was received after the QR was made.
 */
export function messageMatchesSession(parsed: ParsedBankEmail, session: DynamicPaymentSession): { ok: boolean; reason: string } {
  if (parsed.amount === null || !parsed.amountText) return { ok: false, reason: 'ไม่พบยอดเงินในข้อความ' };
  if (!/\.\d{2}$/.test(parsed.amountText)) return { ok: false, reason: `ยอด ${parsed.amountText} ไม่มีสตางค์ครบ 2 หลัก — ต้องตรงยอดเต็ม` };
  if (Math.round(parsed.amount * 100) !== Math.round(session.expectedAmount * 100)) {
    return { ok: false, reason: `ยอด ฿${parsed.amount.toFixed(2)} ไม่ตรงกับยอดใน QR (฿${session.expectedAmount.toFixed(2)})` };
  }
  const received = new Date(parsed.receivedAt).getTime();
  if (Number.isNaN(received) || received < new Date(session.createdAt).getTime()) {
    return { ok: false, reason: 'ข้อความเงินเข้าเก่ากว่าเวลาที่สร้าง QR' };
  }
  return { ok: true, reason: '' };
}

/** Positions of an exact amount in OCR text ("1,234.56" or "1234.56", not part of a longer number) */
export function findExactAmount(text: string, amount: number): number[] {
  const plain = amount.toFixed(2);
  const grouped = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const alt = [grouped, plain].filter((v, i, a) => a.indexOf(v) === i).map((v) => v.replace(/[.,]/g, (c) => '\\' + c));
  const re = new RegExp(`(?<![\\d.,])(?:${alt.join('|')})(?![\\d]|[.,]\\d)`, 'g');
  const at: number[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) at.push(m.index);
  return at;
}

/** A chat time (HH:MM) near a position in OCR text, as a time today in Thai time; null when none is close by */
function chatTimeNear(text: string, index: number, now: Date): Date | null {
  const around = text.slice(Math.max(0, index - 60), index + 80);
  const m = around.match(/(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/);
  if (!m) return null;
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const t = new Date(`${ymd}T${m[1].padStart(2, '0')}:${m[2]}:00+07:00`);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function buildSimulatedKrungthaiEmail(params: {
  amount: number;
  roomNumber: string;
  tenantName?: string;
  promptpayNumber?: string;
  promptpayName?: string;
}): { subject: string; from: string; to: string; body: string } {
  const account = `${params.promptpayNumber || '-'}${params.promptpayName ? ` (${params.promptpayName})` : ''}`;
  const formattedAmt = params.amount.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const nowThai = new Date().toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const refCode = `KTB${Date.now().toString().slice(-10)}`;

  return {
    subject: `[Krungthai Connext] เงินเข้า +${formattedAmt} บาท`,
    from: 'LINE: Krungthai Connext',
    to: account,
    body: [
      `Krungthai Connext แจ้งเตือนเงินเข้า`,
      `- บัญชีพร้อมเพย์: ${account}`,
      `- จำนวนเงินเข้า: +${formattedAmt} บาท`,
      `- เวลา: ${nowThai}`,
      `- เลขที่อ้างอิง: ${refCode}`,
    ].join('\n'),
  };
}

/**
 * ตรวจจับยอดเงินเข้าจากหน้าต่างแชท LINE (Krungthai Connext) ในเครื่องเซิร์ฟเวอร์ด้วย PrintWindow + Windows OCR
 */
export async function checkGmailImapForAmount(params: {
  expectedAmount: number;
  sessionCreatedAt?: string;
  sessionId?: string;
  /** occurrences of the amount already on screen when the QR was made (session.baselineToastCount) */
  baselineCount?: number;
  promptpayNumber?: string;
}): Promise<{
  connected: boolean;
  emailUser: string;
  matched: boolean;
  parsedEmail?: ParsedBankEmail | null;
  checkedCount: number;
  message: string;
}> {
  const targetAmt = Number(params.expectedAmount.toFixed(2));
  const targetFormatted = targetAmt.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const targetPlain = targetAmt.toFixed(2);

  const ocrRes = await readLineChatWindowOcr();

  if (!ocrRes.foundWindow) {
    return {
      connected: false,
      emailUser: 'LINE PC (Krungthai Connext)',
      matched: false,
      checkedCount: 0,
      message: 'ไม่พบหน้าต่างแชท Krungthai Connext ที่เปิดอยู่ (กรุณาเปิดหน้าแชท Krungthai Connext ทิ้งไว้โดยไม่กดย่อพับ)',
    };
  }

  const ocrText = ocrRes.text || '';
  // commit 29: the exact amount (both satang digits, not inside a longer number), seen more times than when the QR was
  // made (a new message), and when a chat time is next to it, not earlier than the QR
  const found = findExactAmount(ocrText, targetAmt);
  const createdAt = params.sessionCreatedAt ? new Date(params.sessionCreatedAt) : null;
  const newest = found.length > (params.baselineCount ?? 0) ? found[found.length - 1] : -1;
  const chatTime = newest >= 0 ? chatTimeNear(ocrText, newest, new Date()) : null;
  const createdMinute = createdAt ? Math.floor(createdAt.getTime() / 60000) * 60000 : 0;
  const hasExactMatch = newest >= 0 && (!chatTime || chatTime.getTime() >= createdMinute);

  if (hasExactMatch) {
    let matchingScreenshot = ocrRes.screenshotDataUrl || null;
    if (ocrRes.windowEntries && ocrRes.windowEntries.length > 0) {
      const match = ocrRes.windowEntries.find(
        (w) => w.text && (w.text.includes(targetFormatted) || w.text.includes(targetPlain))
      );
      if (match && match.screenshotDataUrl) {
        matchingScreenshot = match.screenshotDataUrl;
      }
    }

    const parsed: ParsedBankEmail = {
      found: true,
      bankName: 'LINE Krungthai Connext (Windows OCR)',
      senderEmail: `หน้าต่างแชท: ${ocrRes.windows}`,
      subject: `ตรวจพบยอดเงินเข้า +${targetFormatted} บาท ในแชท Krungthai Connext`,
      amount: targetAmt,
      amountText: targetPlain,
      accountMask: `พร้อมเพย์ ${params.promptpayNumber || 'ของหอพัก'}`,
      transRef: `KTB-LINE-${Date.now().toString(36).toUpperCase()}`,
      receivedAt: new Date().toISOString(),
      rawSnippet: ocrText.slice(0, 240),
      screenshotDataUrl: matchingScreenshot,
    };

    return {
      connected: true,
      emailUser: 'LINE Krungthai Connext',
      matched: true,
      parsedEmail: parsed,
      checkedCount: 1,
      message: `✅ อ่านพบยอดเงินเข้า ฿${targetFormatted} ในหน้าต่างแชท Krungthai Connext สำเร็จ! อนุมัติบิลอัตโนมัติทันที`,
    };
  }

  return {
    connected: true,
    emailUser: 'LINE Krungthai Connext',
    matched: false,
    checkedCount: 1,
    message: `กำลังส่องหน้าต่าง "${ocrRes.windows}" อัตโนมัติ • รอยอดเฉพาะบิลนี้ ฿${targetFormatted}`,
  };
}
