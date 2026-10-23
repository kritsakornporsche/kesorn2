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
}

export interface DynamicPaymentSession {
  sessionId: string;
  billId?: number | null;
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
    desc: () => 'AID A000000677010111 + เบอร์พร้อมเพย์ผู้รับเงิน (063-604-0550)',
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
      error: data.error,
    };
  } catch (err: any) {
    return {
      foundWindow: false,
      windows: '',
      text: '',
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

export function createDynamicPaymentSession(params: {
  sessionId?: string;
  billId?: number | null;
  roomNumber?: string;
  tenantName?: string;
  billTitle?: string;
  baseAmount: number;
  enableSatang?: boolean;
}): DynamicPaymentSession {
  const roomNumber = params.roomNumber || '104';
  const tenantName = params.tenantName || 'นายกฤษกร บัวอินทร์';
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

  const promptpayNumber = '0636040550';
  const promptpayName = 'นาย กฤษกร บัวอินทร์';
  const promptpayBank = 'ธนาคารกรุงไทย (Krungthai NEXT)';

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
    baselineToastCount: 0,
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

  session.status = 'PAID';
  session.verifiedBy = verifiedBy;
  session.matchedEmail = matchedEmail;
  session.paidAt = paidAt;
  session.receiptNo = receiptNo;
  session.receiptHash = `SHA256-${receiptHash}`;

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
  for (const regex of amountPatterns) {
    const m = combined.match(regex);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        parsedAmount = Number(val.toFixed(2));
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
    accountMask: 'พร้อมเพย์ 063-604-0550 (กรุงไทย)',
    transRef,
    receivedAt: meta?.date || new Date().toISOString(),
    rawSnippet: cleanText.slice(0, 280),
  };
}

export function buildSimulatedKrungthaiEmail(params: {
  amount: number;
  roomNumber: string;
  tenantName?: string;
}): { subject: string; from: string; to: string; body: string } {
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
    to: '063-604-0550 (นาย กฤษกร บัวอินทร์)',
    body: [
      `Krungthai Connext แจ้งเตือนเงินเข้า`,
      `- บัญชีพร้อมเพย์: 063-604-0550 (นาย กฤษกร บัวอินทร์)`,
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
  const hasExactMatch = ocrText.includes(targetFormatted) || ocrText.includes(targetPlain);

  if (hasExactMatch) {
    const parsed: ParsedBankEmail = {
      found: true,
      bankName: 'LINE Krungthai Connext (Windows OCR)',
      senderEmail: `หน้าต่างแชท: ${ocrRes.windows}`,
      subject: `ตรวจพบยอดเงินเข้า +${targetFormatted} บาท ในแชท Krungthai Connext`,
      amount: targetAmt,
      accountMask: 'พร้อมเพย์ 063-604-0550 (กรุงไทย)',
      transRef: `KTB-LINE-${Date.now().toString(36).toUpperCase()}`,
      receivedAt: new Date().toISOString(),
      rawSnippet: ocrText.slice(0, 240),
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
