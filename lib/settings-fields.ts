import { parseThaiAddress } from '@/lib/address-parser';

// Fields of the rates page (dormitory_profile) shared by lib/settings.ts and the page. No server imports here.

export const RATE_FIELDS = ['electricity_rate', 'water_rate', 'common_fee', 'late_fee_per_day', 'cleaning_fee'] as const;
export const PAYMENT_FIELDS = ['promptpay_number', 'promptpay_name', 'bank_name', 'bank_account', 'bank_account_name', 'tax_id'] as const;

// Landlord shown on the contract (migration 018). Empty = a dotted line filled in by hand.
export const LANDLORD_FIELDS = ['landlord_name', 'landlord_phone'] as const;

export type RateField = (typeof RATE_FIELDS)[number];
export type LandlordField = (typeof LANDLORD_FIELDS)[number];
export type PaymentField = (typeof PAYMENT_FIELDS)[number];

/** Allowed range of each rate (baht). Electricity must be above 0; the maximums only catch typing mistakes. */
export const RATE_LIMITS: Record<RateField, { min: number; max: number; aboveZero?: boolean }> = {
  electricity_rate: { min: 0, max: 20, aboveZero: true },
  water_rate: { min: 0, max: 2000 },
  common_fee: { min: 0, max: 5000 },
  late_fee_per_day: { min: 0, max: 1000 },
  cleaning_fee: { min: 0, max: 10000 },
};

export const FIELD_LABELS: Record<RateField | PaymentField, string> = {
  electricity_rate: 'ค่าไฟ (บาท/หน่วย)',
  water_rate: 'ค่าน้ำ (บาท/คน/เดือน)',
  common_fee: 'ค่าส่วนกลาง (บาท/เดือน)',
  late_fee_per_day: 'ค่าปรับชำระล่าช้า (บาท/วัน)',
  cleaning_fee: 'ค่าทำความสะอาด (บาท/ครั้ง)',
  promptpay_number: 'หมายเลขพร้อมเพย์',
  promptpay_name: 'ชื่อบัญชีพร้อมเพย์',
  bank_name: 'ธนาคาร / สาขา / ประเภทบัญชี',
  bank_account: 'เลขที่บัญชีธนาคาร',
  bank_account_name: 'ชื่อบัญชีธนาคาร',
  tax_id: 'เลขประจำตัวผู้เสียภาษี',
};

/** Shown under the rate inputs (text only, the value is not blocked). */
export const RATE_NOTES: Partial<Record<RateField, string>> = {
  electricity_rate: 'ตามประกาศ สคบ. พ.ศ. 2568 ต้องไม่เกินอัตราที่การไฟฟ้าเรียกเก็บจริง',
  water_rate: 'ตามประกาศ สคบ. พ.ศ. 2568 ต้องไม่เกินอัตราที่การประปาเรียกเก็บจริง',
};

export const LANDLORD_LABELS: Record<LandlordField, string> = {
  landlord_name: 'ชื่อผู้ให้เช่า',
  landlord_phone: 'เบอร์โทรผู้ให้เช่า',
};

/** Dorm and landlord details printed on the contract, from the settings page (lib/billing getContractParty). */
export interface ContractParty {
  dormName: string | null;
  dormAddress: string | null;
  dormPhone: string | null;
  landlordName: string | null;
  landlordPhone: string | null;
}

const PARTY_DOTS = '..............................................';

// ── Contract text (commit 18c) ───────────────────────────────────────────────────────────────────────────────
// The wording follows the dorm's signed-off contract (docs/review/contract-final.docx, not in git). Every value comes
// from the contract or the settings page; a value that is not known is a dotted line to fill in by hand.
// The print page (components/ContractDocument) renders this; the PDF saved from it is the contract file (commit 28-6).

/** Monthly rent is due on this day of the month after the billing cycle (lib/billing calcDueDate). */
export const RENT_DUE_DAY = 5;

export interface ContractTextInput {
  createdAt?: string | Date | null;
  roomNumber?: string | null;
  /** rooms.floor — null prints a dotted line (never guessed from the room number) */
  floor?: number | string | null;
  tenantName?: string | null;
  /** นาย / นาง / นางสาว (commit 28-8); empty → "นาย/นางสาว" is printed for the person to circle */
  tenantTitle?: string | null;
  tenantPhone?: string | null;
  parentPhone?: string | null;
  /** occupants of the room (commit 27, lib/occupants) — printed on the room line; null prints a dotted line */
  occupants?: number | null;
  address?: { houseNo?: string; village?: string; road?: string; subdistrict?: string; district?: string; province?: string } | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  /** full deposit of the room (the booking fee is part of it) */
  deposit?: number | null;
  firstRent?: number | null;
  monthlyRent?: number | null;
  rates?: { electricityPerUnit?: number | null; waterPerPerson?: number | null; commonFee?: number | null; cleaningFee?: number | null; lateFeePerDay?: number | null } | null;
  payment?: Parameters<typeof contractPaymentLines>[0];
  party?: ContractParty | null;
}

/** A piece of a form line: plain text (runs of dots are blanks), or a value printed on a fixed field of `dots` length */
export type FormSegment = string | { value: string; dots: number };

export interface ContractText {
  title: string;
  header: string;
  dateLine: string;
  /** opening paragraph: the parties (3 lines in the original) */
  parties: string[];
  /** room details line, printed between parties[1] and parties[2] (commit 27) */
  roomLine: string;
  /** commit 28-11: the same lines (parties[0], parties[1], roomLine, parties[2]) as pieces — a known value on a fixed field */
  partyForm: FormSegment[][];
  /** clause number → paragraphs (the first one starts with "ข้อ n.") */
  clauses: { no: number; paragraphs: string[] }[];
  closing: string;
  /** [left, right] per row: tenant / landlord, then the two witnesses */
  signatures: { role: string; name: string }[][];
  notesTitle: string;
  notes: string[];
}

const BKK = 'Asia/Bangkok';
const blank = (n: number) => '.'.repeat(n);

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00+07:00` : String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
const thaiDate = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: BKK });
const thaiMonthYear = (d: Date) => d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: BKK });
const money = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(Number(v)) || Number(v) <= 0 ? null : Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const rate = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const text = (v: unknown) => String(v ?? '').trim();

/** Address parts for the contract; an address the parser cannot split goes whole into "บ้านเลขที่". */
export function contractAddress(raw: string | null | undefined): ContractTextInput['address'] {
  const value = String(raw || '').trim();
  if (!value) return null;
  const p = parseThaiAddress(value);
  const split = p.village || p.road || p.subdistrict || p.district || p.province;
  // the parser writes "-" for a part it did not find: print a dotted line instead
  const part = (s: string) => (s && s.trim() !== '-' ? s : '');
  return split
    ? { houseNo: part(p.houseNo), village: part(p.village), road: part(p.road), subdistrict: part(p.subdistrict), district: part(p.district), province: part(p.province) }
    : { houseNo: value };
}

/** Whole months of the lease (start → end inclusive), in Thai dates; null when a date is missing. */
export function leaseMonths(start: string | Date | null | undefined, end: string | Date | null | undefined): number | null {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e || e < s) return null;
  return Math.max(1, Math.round((e.getTime() - s.getTime() + 86_400_000) / (86_400_000 * 30.4375)));
}

/** The whole contract as text lines (the print page → PDF). */
export function buildContractText(c: ContractTextInput): ContractText {
  const party = contractPartyText(c.party);
  const landlordName = text(c.party?.landlordName);
  const landlordPhone = text(c.party?.landlordPhone);
  const created = toDate(c.createdAt) || null;
  const start = toDate(c.startDate);
  const end = toDate(c.endDate);
  const months = leaseMonths(c.startDate, c.endDate);
  const a = c.address || {};
  const v = (value: unknown, dots: number) => text(value) || blank(dots);
  // commit 28-11: the parties' details as fixed fields (the line keeps the form's layout when filled in)
  const fld = (value: unknown, dots: number): FormSegment => (text(value) ? { value: text(value), dots } : blank(dots));
  const tenant: FormSegment[] = text(c.tenantTitle) && text(c.tenantName)
    ? [fld(`${text(c.tenantTitle)}${text(c.tenantName)}`, 59)]
    : [`${text(c.tenantTitle) || 'นาย/นางสาว'} `, fld(c.tenantName, 59)];
  const partyForm: FormSegment[][] = [
    [`สัญญาเช่าฉบับนี้ทำขึ้นระหว่าง ${landlordName || blank(40)} ดังที่อยู่ข้างต้น ซึ่งต่อไปในสัญญานี้จะเรียกว่า "ผู้ให้เช่า" ฝ่ายหนึ่งกับ `, ...tenant, ' อยู่บ้านเลขที่ ', fld(a.houseNo, 30)],
    ['หมู่บ้าน ', fld(a.village, 20), ' ถนน ', fld(a.road, 20), ' ตำบล/แขวง ', fld(a.subdistrict, 20), ' อำเภอ/เขต ', fld(a.district, 20), ' จังหวัด ', fld(a.province, 20),
      ' เบอร์โทรผู้พัก ', fld(c.tenantPhone, 25), ' เบอร์โทรผู้ปกครอง ', fld(c.parentPhone, 25)],
    ['ข้อมูลห้องพัก: ห้องเลขที่ ', fld(c.roomNumber, 12), ' จำนวนผู้พักอาศัย ', fld(c.occupants ? String(Number(c.occupants)) : '', 6), ' คน'],
    ['ซึ่งต่อไปในสัญญานี้จะเรียกว่า "ผู้เช่า" อีกฝ่ายหนึ่ง คู่สัญญาได้ตกลงกันดังนี้'],
  ];
  const line = (segs: FormSegment[]) => segs.map((s) => (typeof s === 'string' ? s : s.value)).join('');
  const r = c.rates || {};
  const pay = contractPaymentLines(c.payment);
  const payLine = [pay.bank, pay.promptpay].filter(Boolean).join(' ');

  return {
    title: 'สัญญาเช่าห้องพักหอพักเกษร',
    header: party.header || blank(60),
    dateLine: created
      ? `วันที่ ${created.toLocaleDateString('th-TH', { day: 'numeric', timeZone: BKK })} เดือน ${created.toLocaleDateString('th-TH', { month: 'long', timeZone: BKK })} พ.ศ. ${created.toLocaleDateString('th-TH', { year: 'numeric', timeZone: BKK }).replace(/\D/g, '')}`
      : `วันที่${blank(20)}เดือน${blank(40)}พ.ศ.${blank(17)}`,
    parties: [line(partyForm[0]), line(partyForm[1]), line(partyForm[3])],
    roomLine: line(partyForm[2]),
    partyForm,
    clauses: [
      { no: 1, paragraphs: [`ข้อ 1. ผู้ให้เช่าตกลงให้เช่าและผู้เช่าตกลงเช่าห้องพักเลขที่ ${v(c.roomNumber, 12)} ชั้นที่ ${v(c.floor, 12)} ในอาคารของผู้ให้เช่าเพื่อเป็นที่อยู่อาศัยภายใต้ระเบียบที่ผู้ให้เช่ากำหนด โดยเฉพาะไม่ก่อกวน ต้องสงบในยามวิกาล ไม่ทะเลาะวิวาท ไม่ทำผิดศีลธรรมและกฎหมาย สัญญาเช่านี้มีกำหนด ${months ?? blank(10)} เดือน เริ่มวันที่ ${start ? thaiDate(start) : blank(20)} สิ้นสุดวันที่ ${end ? thaiDate(end) : blank(20)}`] },
      { no: 2, paragraphs: [
        'ข้อ 2. ผู้เช่าตกลงชำระเงินให้แก่ผู้ให้เช่า ดังนี้',
        `เงินประกันจำนวน ${money(c.deposit) ?? blank(10)} บาท (รวมค่าจองห้องที่ชำระไว้แล้ว) ผู้ให้เช่าจะคืนเงินประกันภายใน 7 วันนับแต่วันที่สัญญาสิ้นสุดและผู้เช่าส่งมอบห้องคืน หากห้องและทรัพย์สินไม่เสียหาย กรณีมีความเสียหายหรือค่าใช้จ่ายค้างชำระ ผู้ให้เช่าจะแจ้งรายการหักพร้อมหลักฐานเป็นหนังสือ และคืนเงินส่วนที่เหลือภายใน 14 วันนับแต่วันที่ผู้เช่าส่งมอบห้องคืน`,
        `ค่าเช่าเดือนแรกจำนวน ${money(c.firstRent) ?? blank(10)} บาท เป็นค่าเช่าของเดือน ${start ? thaiMonthYear(start) : blank(20)} ทั้งนี้ เงินประกันและค่าเช่าล่วงหน้ารวมกันไม่เกินสามเดือนของค่าเช่า ค่าเช่าเดือนละ ${money(c.monthlyRent) ?? blank(10)} บาท ชำระภายในวันที่ ${RENT_DUE_DAY} ของเดือนถัดไป โดยผู้ให้เช่าจะส่งใบแจ้งหนี้ให้ผู้เช่าทราบล่วงหน้าไม่น้อยกว่า 3 วันก่อนถึงกำหนดชำระ หากชำระล่าช้า ผู้ให้เช่ามีสิทธิ์เรียกค่าปรับวันละ ${rate(r.lateFeePerDay) ?? blank(10)} บาท`,
      ] },
      { no: 3, paragraphs: ['ข้อ 3. ผู้เช่าตกลงชำระค่าเช่าและค่าใช้จ่ายตามช่องทางที่ระบุในข้อ 5 ภายในวันเวลาที่กำหนด'] },
      { no: 4, paragraphs: ['ข้อ 4. ห้ามผู้เช่านำห้องไปให้ผู้อื่นเช่าช่วงเป็นอันขาด เว้นแต่ผู้ให้เช่าตกลงยินยอมด้วยเป็นลายลักษณ์อักษร'] },
      { no: 5, paragraphs: [`ข้อ 5. ค่าไฟฟ้าคิดตามหน่วยที่ใช้จริงจากมิเตอร์ของห้อง ในอัตราหน่วยละ ${rate(r.electricityPerUnit) ?? blank(10)} บาท ซึ่งคำนวณจากยอดเงินตามใบแจ้งค่าไฟฟ้าของการไฟฟ้าหารด้วยจำนวนหน่วยในใบแจ้งค่าไฟฟ้า ไม่เกินอัตราที่การไฟฟ้าเรียกเก็บ ค่าน้ำประปาเหมาจ่ายคนละ ${rate(r.waterPerPerson) ?? blank(10)} บาทต่อเดือน เนื่องจากหอพักใช้มิเตอร์น้ำประปารวม ค่าส่วนกลางเดือนละ ${rate(r.commonFee) ?? blank(10)} บาท ค่าบริการทำความสะอาดห้องครั้งละ ${rate(r.cleaningFee) ?? blank(10)} บาท (เมื่อผู้เช่าแจ้งขอใช้บริการ) ผู้เช่าชำระค่าใช้จ่ายทั้งหมดผ่านพร้อมเพย์ การโอนเงิน หรือเงินสด ณ ที่ทำการของผู้ให้เช่า`] },
      { no: 6, paragraphs: ['ข้อ 6. ผู้เช่าต้องบำรุงรักษาห้องเช่ารวมถึงอุปกรณ์ไฟฟ้า มุ้งลวด กระจกบานเกล็ด กุญแจห้อง กลอนประตู พัดลม หลอดไฟ เสื่อ ฝาผนัง และอื่น ๆ ให้อยู่ในสภาพที่ดีอยู่เสมอ หากเกิดชำรุดเสียหายจากการกระทำของผู้เช่า ผู้เช่าต้องทำให้กลับคืนสู่สภาพเดิมหรือรับผิดชอบค่าซ่อมแซม เว้นแต่เป็นการเสื่อมสภาพจากการใช้งานตามปกติ'] },
      { no: 7, paragraphs: ['ข้อ 7. ผู้เช่ามีหน้าที่รักษาความสะอาดตามกฎหมาย ไม่เก็บวัตถุไวไฟหรือสิ่งอันตรายหรือสิ่งต้องห้ามตามกฎหมายผู้เช่ายินยอมให้ผู้ให้เช่าเข้าตรวจความถูกต้องเรียบร้อยในห้อง'] },
      { no: 8, paragraphs: ['ข้อ 8. ผู้เช่าจะดัดแปลงต่อเติมหรือรื้อถอนทรัพย์สินที่เช่าทั้งหมดหรือบางส่วนได้ต่อเมื่อได้รับความยินยอมเป็นหนังสือจากผู้ให้เช่า'] },
      { no: 9, paragraphs: ['ข้อ 9. หากผู้เช่าผิดสัญญาข้อใดข้อหนึ่ง ผู้ให้เช่ามีสิทธิ์บอกเลิกสัญญาได้ โดยต้องแจ้งเป็นหนังสือให้ผู้เช่าปฏิบัติตามสัญญาภายในเวลาไม่น้อยกว่า 30 วัน หากผู้เช่าไม่ปฏิบัติตามภายในกำหนด ผู้ให้เช่าจึงบอกเลิกสัญญาได้'] },
      { no: 10, paragraphs: ['ข้อ 10. ผู้เช่าบอกเลิกสัญญาก่อนครบกำหนดได้ เมื่อเช่ามาแล้วไม่น้อยกว่ากึ่งหนึ่งของระยะเวลาเช่า โดยต้องแจ้งเป็นหนังสือให้ผู้ให้เช่าทราบล่วงหน้าไม่น้อยกว่า 30 วัน และไม่ค้างชำระค่าเช่าหรือค่าใช้จ่ายอื่น ในกรณีนี้ผู้เช่าจะได้รับเงินประกันคืนตามข้อ 2.'] },
      { no: 11, paragraphs: ['ข้อ 11. ในวันทำสัญญานี้ คู่สัญญาได้ตรวจสภาพห้องและทรัพย์สินที่เช่าร่วมกัน ตามบันทึกการตรวจสภาพห้องแนบท้ายสัญญา ซึ่งถือเป็นส่วนหนึ่งของสัญญานี้ และผู้ให้เช่าได้ส่งมอบห้องที่เช่าให้แก่ผู้เช่าแล้ว'] },
      { no: 12, paragraphs: ['ข้อ 12. ผู้เช่าได้มอบสำเนาบัตรประจำตัว สำเนาทะเบียนบ้านและเอกสารแสดงตัวตามกฎหมายที่ไม่หมดอายุ พร้อมรูปถ่าย ให้ไว้กับผู้ให้เช่า เพื่อใช้ประกอบสัญญานี้เท่านั้น'] },
      { no: 13, paragraphs: ['ข้อ 13. สัญญานี้และบันทึกการตรวจสภาพห้องทำขึ้นสองฉบับมีข้อความตรงกัน คู่สัญญาเก็บไว้ฝ่ายละหนึ่งฉบับ'] },
    ],
    closing: 'คู่สัญญาทั้งสองฝ่ายได้อ่านและทำความเข้าใจดีแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน',
    signatures: [
      [{ role: 'ผู้เช่า', name: text(c.tenantName) ? `${text(c.tenantTitle)}${text(c.tenantName)}` : blank(55) }, { role: 'ผู้ให้เช่า', name: landlordName || blank(55) }],
      // Witnesses are always written by hand
      [{ role: 'พยาน', name: blank(55) }, { role: 'พยาน', name: blank(55) }],
    ],
    notesTitle: 'หมายเหตุ:',
    notes: [
      `ค่าน้ำคนละ ${rate(r.waterPerPerson) ?? blank(10)} บาท  • ค่าไฟหน่วยละ ${rate(r.electricityPerUnit) ?? blank(10)} บาท`,
      `ติดต่อเจ้าของหอพัก ${landlordName || blank(40)} ${landlordPhone || blank(25)}`,
      'ห้ามทิ้งขยะลงโถชักโครก ห้ามเสียงดัง ห้ามดื่มเหล้า สูบบุหรี่ ให้รักษาความสะอาดห้องพักสม่ำเสมอ',
      'โปรดแยกขยะและทิ้งขยะบริเวณที่เตรียมไว้',
      payLine || `ช่องทางชำระเงิน ${blank(80)}`,
    ],
  };
}


/**
 * Text of the contract's landlord parts. Nothing is written into the code: a detail that is not set
 * becomes a dotted line (name / phone) or is left out (dorm address line).
 */
export function contractPartyText(p: ContractParty | null | undefined) {
  const t = (v: unknown) => String(v ?? '').trim();
  const name = t(p?.landlordName);
  const phone = t(p?.landlordPhone);
  const dormPhone = t(p?.dormPhone);
  return {
    header: [t(p?.dormName), t(p?.dormAddress), dormPhone ? `โทร ${dormPhone}` : ''].filter(Boolean).join(' '),
    landlordName: name || PARTY_DOTS,
    contact: `ติดต่อผู้ให้เช่า ${name || PARTY_DOTS} โทร ${phone || PARTY_DOTS}`,
  };
}

/**
 * Transfer details printed on the contract form (print page), from the settings page.
 * A detail that is not set is left out (no fallback numbers).
 */
export function contractPaymentLines(p: {
  promptpayNumber?: string | null; promptpayName?: string | null;
  bankName?: string | null; bankAccount?: string | null; bankAccountName?: string | null;
} | null | undefined): { bank: string | null; promptpay: string | null } {
  if (!p) return { bank: null, promptpay: null };
  const join = (...parts: (string | null | undefined)[]) => parts.map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  const bank = p.bankAccount ? join('กรณีโอนเงิน', p.bankName, p.bankAccountName, `เลขที่บัญชี ${p.bankAccount}`) : null;
  const promptpay = p.promptpayNumber ? join(bank ? 'หรือ พร้อมเพย์' : 'ชำระผ่านพร้อมเพย์', p.promptpayNumber, p.promptpayName) : null;
  return { bank, promptpay };
}
