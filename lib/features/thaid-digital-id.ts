import crypto from 'crypto';
import { parseThaiAddress, type ThaiAddressParts } from '@/lib/address-parser';

export interface ThaIdVerifiedPayload {
  /** Pairwise Pseudonymous Identifier (Hash อ้างอิงการยืนยันตัวตนโดยไม่ใช้เลขบัตร 13 หลัก) */
  sub_pid_hash: string;
  /** รหัสใบรับรองการทำ e-KYC ผ่าน D.DOPA */
  kyc_Session_id: string;
  kyc_signature: string;
  /** ระดับความน่าเชื่อถือของการพิสูจน์และยืนยันตัวตนตามมาตรฐาน ETDA / D.DOPA */
  ial_level: 'IAL 2.3';
  aal_level: 'AAL 2.2';
  /** ข้อมูลส่วนบุคคลเท่าที่จำเป็นสำหรับทำสัญญาเช่า (PDPA Data Minimization) */
  title_th: string;
  first_name_th: string;
  last_name_th: string;
  full_name_th: string;
  full_name_en: string;
  birth_date: string;
  address: string;
  address_parts: ThaiAddressParts;
  /** บังคับค่าว่างเสมอตามหลัก PDPA Zero-ID Storage */
  id_card_number: '';
  verified_at: string;
  provider: 'D.DOPA ThaID OpenID Connect (OAuth 2.0)';
  mode: 'production_oidc' | 'sandbox_simulation';
}

export interface ThaIdAuthSession {
  session_id: string;
  state: string;
  nonce: string;
  code_verifier: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  scope: 'openid title given_name family_name given_name_en family_name_en birthdate address';
  authorization_endpoint: string;
  qr_payload: string;
  expires_in: number;
  created_at: string;
}

/**
 * สร้าง OAuth 2.0 + PKCE (RFC 7636) Session ตามมาตรฐานกรมการปกครอง (D.DOPA ThaID)
 * โดยขอ Scope เฉพาะ ชื่อ-นามสกุล และ ที่อยู่ตามทะเบียนราษฎร์ (ไม่ขอScope pid เลข 13 หลัก)
 */
export function createThaIdOAuthSession(originUrl = 'http://localhost:3000'): ThaIdAuthSession {
  const sessionId = `THAID-SES-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const clientId = process.env.THAID_CLIENT_ID || 'SMARTDOM_KESORN2_SANDBOX_CLIENT';
  const redirectUri = `${originUrl}/api/features/thaid/callback`;
  const scope = 'openid title given_name family_name given_name_en family_name_en birthdate address';

  const authUrl = new URL('https://imauth.bora.dopa.go.th/api/v2/oauth2/authorize/');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // สำหรับสแกนผ่าน QR Code ในหน้าจอจองห้องพัก
  const qrPayload = JSON.stringify({
    iss: 'D.DOPA-ThaID-OAuth2',
    rp: 'SmartDom (หอพักเกษร 2)',
    session_id: sessionId,
    state,
    code_challenge: codeChallenge,
    scope: 'name,address (Zero-PID PDPA Mode)',
  });

  return {
    session_id: sessionId,
    state,
    nonce,
    code_verifier: codeVerifier,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope,
    authorization_endpoint: authUrl.toString(),
    qr_payload: qrPayload,
    expires_in: 300,
    created_at: new Date().toISOString(),
  };
}

/**
 * รายชื่อโปรไฟล์จำลองจากฐานข้อมูลทะเบียนราษฎร์จำลอง (D.DOPA Sandbox Profiles)
 * สำหรับใช้สาธิตและทดสอบระบบตอนสอบวิจัย
 */
export const THAID_SANDBOX_PROFILES = [
  {
    id: 'citizen-up-student',
    label: 'นักศึกษา ม.พะเยา (ต.แม่กา อ.เมืองพะเยา)',
    title_th: 'นาย',
    first_name_th: 'กิตติพงศ์',
    last_name_th: 'เจริญรัตน์',
    full_name_en: 'Mr. Kittipong Charoenrat',
    birth_date: '14 พ.ค. 2547',
    address: '199/4 หมู่ 2 ตำบลแม่กา อำเภอเมืองพะเยา จังหวัดพะเยา 56000',
  },
  {
    id: 'citizen-chiangrai',
    label: 'ผู้เช่าจังหวัดใกล้เคียง (อ.เมืองเชียงราย)',
    title_th: 'นางสาว',
    first_name_th: 'พิมพ์ชนก',
    last_name_th: 'วงศ์สวัสดิ์',
    full_name_en: 'Miss Pimchanok Wongsawat',
    birth_date: '22 ต.ค. 2546',
    address: '88/12 หมู่ 5 ถนนพหลโยธิน ตำบลรอบเวียง อำเภอเมืองเชียงราย จังหวัดเชียงราย 57000',
  },
  {
    id: 'citizen-bangkok',
    label: 'ผู้เช่าจากกรุงเทพมหานคร (เขตจตุจักร)',
    title_th: 'นาย',
    first_name_th: 'ธนภัทร',
    last_name_th: 'อัครเดชโชติ',
    full_name_en: 'Mr. Thanaphat Akkaradejchot',
    birth_date: '09 ม.ค. 2545',
    address: '99/50 หมู่ 3 ซอยงามวงศ์วาน 54 แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900',
  },
];

/**
 * ประมวลผลการแลกเปลี่ยน Authorization Code เป็นข้อมูลผู้เช่าที่ผ่านการรับรอง (Verified Claims)
 * พร้อมสร้างลายเซ็นดิจิทัล HMAC-SHA256 เพื่อใช้ยืนยันในสัญญาเช่าโดยไม่เก็บเลข 13 หลัก
 */
export function verifyAndCreateThaIdClaims(input: {
  sessionId?: string;
  state?: string;
  profileId?: string;
  customName?: string;
  customAddress?: string;
}): ThaIdVerifiedPayload {
  const preset =
    THAID_SANDBOX_PROFILES.find((p) => p.id === input.profileId) || THAID_SANDBOX_PROFILES[0];

  let titleTh = preset.title_th;
  let firstNameTh = preset.first_name_th;
  let lastNameTh = preset.last_name_th;
  let fullNameTh = `${preset.title_th}${preset.first_name_th} ${preset.last_name_th}`.trim();

  if (input.customName && input.customName.trim()) {
    fullNameTh = input.customName.trim();
    const parts = fullNameTh.split(/\s+/);
    firstNameTh = parts[0] || fullNameTh;
    lastNameTh = parts.slice(1).join(' ') || '';
  }

  const address =
    input.customAddress && input.customAddress.trim()
      ? input.customAddress.trim()
      : preset.address;

  const addressParts = parseThaiAddress(address);
  const verifiedAt = new Date().toISOString();
  const kycSessionId =
    input.sessionId ||
    `THAID-KYC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  // สร้าง Pairwise Pseudonymous Identifier (PPID) แทนการเก็บเลขบัตร 13 หลัก
  const secretSalt = process.env.NEXTAUTH_SECRET || 'SMARTDOM_THAID_PDPA_SALT_2026';
  const subPidHash =
    'PPID-' +
    crypto
      .createHmac('sha256', secretSalt)
      .update(`${fullNameTh}|${address}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

  // สร้างลายเซ็นดิจิทัลรับรองผลการพิสูจน์ตัวตน (Cryptographic KYC Attestation)
  const kycSignature = crypto
    .createHmac('sha256', secretSalt)
    .update(`${kycSessionId}|${subPidHash}|${fullNameTh}|${address}|IAL2.3|${verifiedAt}`)
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();

  return {
    sub_pid_hash: subPidHash,
    kyc_Session_id: kycSessionId,
    kyc_signature: kycSignature,
    ial_level: 'IAL 2.3',
    aal_level: 'AAL 2.2',
    title_th: titleTh,
    first_name_th: firstNameTh,
    last_name_th: lastNameTh,
    full_name_th: fullNameTh,
    full_name_en: preset.full_name_en,
    birth_date: preset.birth_date,
    address,
    address_parts: addressParts,
    id_card_number: '',
    verified_at: verifiedAt,
    provider: 'D.DOPA ThaID OpenID Connect (OAuth 2.0)',
    mode: 'sandbox_simulation',
  };
}
