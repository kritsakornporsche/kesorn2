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
 * Transfer details printed on the contract form (print page and .docx), from the settings page.
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
