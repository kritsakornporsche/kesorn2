import crypto from 'crypto';

export interface SignedContractRecord {
  docId: string;
  docType: 'E_CONTRACT' | 'E_RECEIPT';
  roomNumber: string;
  floor: 1 | 2;
  tenantName: string;
  monthlyRent: number;
  depositAmount: number;
  startDate: string;
  endDate: string;
  dormName: string;
  ownerName: string;
  canonicalPayload: string;
  sha256Hash: string;
  hmacSignature: string;
  verificationUrl: string;
  issuedAt: string;
}

const CONTRACT_SIGNING_SECRET =
  process.env.CONTRACT_CRYPTO_SECRET || 'KESORN2-DORM-SHA256-DIGITAL-SEAL-2026';

export function buildCanonicalContractPayload(input: {
  docId: string;
  docType: 'E_CONTRACT' | 'E_RECEIPT';
  roomNumber: string;
  tenantName: string;
  monthlyRent: number;
  depositAmount: number;
  startDate: string;
  endDate: string;
}): string {
  return [
    `DOC_ID=${String(input.docId).trim()}`,
    `DOC_TYPE=${String(input.docType).trim()}`,
    `DORM=KESORN_2`,
    `ROOM=${String(input.roomNumber).trim()}`,
    `TENANT=${String(input.tenantName).trim()}`,
    `RENT=${Number(input.monthlyRent).toFixed(2)}`,
    `DEPOSIT=${Number(input.depositAmount).toFixed(2)}`,
    `START=${String(input.startDate).trim()}`,
    `END=${String(input.endDate).trim()}`,
  ].join('|');
}

export function computeContractSha256(canonicalPayload: string): {
  sha256Hash: string;
  hmacSignature: string;
} {
  const sha256Hash = crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex')
    .toUpperCase();

  const hmacSignature = crypto
    .createHmac('sha256', CONTRACT_SIGNING_SECRET)
    .update(canonicalPayload, 'utf8')
    .digest('hex')
    .toUpperCase();

  return { sha256Hash, hmacSignature };
}

export function createSignedContractRecord(input: {
  docId: string;
  docType?: 'E_CONTRACT' | 'E_RECEIPT';
  roomNumber: string;
  floor?: 1 | 2;
  tenantName: string;
  monthlyRent: number;
  depositAmount: number;
  startDate: string;
  endDate: string;
}): SignedContractRecord {
  const docType = input.docType || 'E_CONTRACT';
  const canonicalPayload = buildCanonicalContractPayload({
    docId: input.docId,
    docType,
    roomNumber: input.roomNumber,
    tenantName: input.tenantName,
    monthlyRent: input.monthlyRent,
    depositAmount: input.depositAmount,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const { sha256Hash, hmacSignature } = computeContractSha256(canonicalPayload);
  const shortSig = hmacSignature.slice(0, 16);
  const verificationUrl = `/researcher/lab/econtract-verify?docId=${encodeURIComponent(
    input.docId
  )}&hash=${sha256Hash.slice(0, 16)}&sig=${shortSig}`;

  return {
    docId: input.docId,
    docType,
    roomNumber: input.roomNumber,
    floor: input.floor || (input.roomNumber.startsWith('2') ? 2 : 1),
    tenantName: input.tenantName,
    monthlyRent: Number(input.monthlyRent),
    depositAmount: Number(input.depositAmount),
    startDate: input.startDate,
    endDate: input.endDate,
    dormName: 'หอพักเกษร 2 (หน้ามหาวิทยาลัยพะเยา)',
    ownerName: 'นาย กฤษกร บัวอินทร์ (ผู้ให้เช่า)',
    canonicalPayload,
    sha256Hash,
    hmacSignature,
    verificationUrl,
    issuedAt: new Date().toISOString(),
  };
}

export function verifyContractIntegrity(
  official: SignedContractRecord,
  candidate: {
    roomNumber: string;
    tenantName: string;
    monthlyRent: number;
    depositAmount: number;
    startDate: string;
    endDate: string;
  }
): {
  verified: boolean;
  officialHash: string;
  candidateHash: string;
  tamperedFields: string[];
  canonicalCandidate: string;
} {
  const canonicalCandidate = buildCanonicalContractPayload({
    docId: official.docId,
    docType: official.docType,
    roomNumber: candidate.roomNumber,
    tenantName: candidate.tenantName,
    monthlyRent: candidate.monthlyRent,
    depositAmount: candidate.depositAmount,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
  });

  const { sha256Hash: candidateHash } = computeContractSha256(canonicalCandidate);
  const tamperedFields: string[] = [];

  if (String(candidate.roomNumber).trim() !== official.roomNumber) {
    tamperedFields.push(`เลขห้อง (${official.roomNumber} → ${candidate.roomNumber})`);
  }
  if (String(candidate.tenantName).trim() !== official.tenantName) {
    tamperedFields.push(`ชื่อผู้เช่า (${official.tenantName} → ${candidate.tenantName})`);
  }
  if (Number(candidate.monthlyRent) !== official.monthlyRent) {
    tamperedFields.push(
      `ค่าเช่ารายเดือน (฿${official.monthlyRent.toLocaleString()} → ฿${Number(
        candidate.monthlyRent
      ).toLocaleString()})`
    );
  }
  if (Number(candidate.depositAmount) !== official.depositAmount) {
    tamperedFields.push(
      `เงินประกันสัญญา (฿${official.depositAmount.toLocaleString()} → ฿${Number(
        candidate.depositAmount
      ).toLocaleString()})`
    );
  }
  if (String(candidate.startDate).trim() !== official.startDate) {
    tamperedFields.push(`วันเริ่มสัญญา (${official.startDate} → ${candidate.startDate})`);
  }
  if (String(candidate.endDate).trim() !== official.endDate) {
    tamperedFields.push(`วันสิ้นสุดสัญญา (${official.endDate} → ${candidate.endDate})`);
  }

  return {
    verified: candidateHash === official.sha256Hash && tamperedFields.length === 0,
    officialHash: official.sha256Hash,
    candidateHash,
    tamperedFields,
    canonicalCandidate,
  };
}
