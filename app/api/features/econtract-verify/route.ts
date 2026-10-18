import { NextRequest, NextResponse } from 'next/server';
import qrcode from 'qrcode';
import { getDb } from '@/lib/db';
import {
  createSignedContractRecord,
  verifyContractIntegrity,
  type SignedContractRecord,
} from '@/lib/features/contract-crypto';

const DEFAULT_SIGNED_CONTRACTS_SEED = [
  {
    docId: 'CTR-2569-104',
    docType: 'E_CONTRACT' as const,
    roomNumber: '104',
    floor: 1 as const,
    tenantName: 'นายกฤษกร บัวอินทร์',
    monthlyRent: 4000,
    depositAmount: 3000,
    startDate: '2026-06-01',
    endDate: '2027-05-31',
  },
  {
    docId: 'CTR-2569-101',
    docType: 'E_CONTRACT' as const,
    roomNumber: '101',
    floor: 1 as const,
    tenantName: 'นายธนกฤต วงศ์สวัสดิ์',
    monthlyRent: 3500,
    depositAmount: 3000,
    startDate: '2026-06-01',
    endDate: '2027-05-31',
  },
  {
    docId: 'CTR-2569-102',
    docType: 'E_CONTRACT' as const,
    roomNumber: '102',
    floor: 1 as const,
    tenantName: 'นางสาวพิมพ์ชนก สุขเกษม',
    monthlyRent: 3500,
    depositAmount: 3000,
    startDate: '2026-06-01',
    endDate: '2027-05-31',
  },
  {
    docId: 'CTR-2569-108',
    docType: 'E_CONTRACT' as const,
    roomNumber: '108',
    floor: 1 as const,
    tenantName: 'นางสาวกมลชนก ศรีวิชัย',
    monthlyRent: 3500,
    depositAmount: 3000,
    startDate: '2026-06-01',
    endDate: '2027-05-31',
  },
  {
    docId: 'CTR-2569-205',
    docType: 'E_CONTRACT' as const,
    roomNumber: '205',
    floor: 2 as const,
    tenantName: 'นายศุภณัฐ อินทร์แก้ว',
    monthlyRent: 4200,
    depositAmount: 3000,
    startDate: '2026-06-01',
    endDate: '2027-05-31',
  },
  {
    docId: 'RCP-2569-104',
    docType: 'E_RECEIPT' as const,
    roomNumber: '104',
    floor: 1 as const,
    tenantName: 'นายกฤษกร บัวอินทร์',
    monthlyRent: 4000,
    depositAmount: 3000,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  },
];

const globalForCrypto = globalThis as unknown as {
  signedContractsRegistry?: Map<string, SignedContractRecord>;
};

function getSignedContractsMap(): Map<string, SignedContractRecord> {
  if (!globalForCrypto.signedContractsRegistry) {
    const map = new Map<string, SignedContractRecord>();
    for (const item of DEFAULT_SIGNED_CONTRACTS_SEED) {
      const signed = createSignedContractRecord(item);
      map.set(signed.docId, signed);
    }
    globalForCrypto.signedContractsRegistry = map;
  }
  return globalForCrypto.signedContractsRegistry;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docIdParam = searchParams.get('docId');
    const registry = getSignedContractsMap();

    // Sync any real active contracts from MySQL contracts table into registry
    try {
      const sql = getDb();
      const dbContracts = await sql`
        SELECT c.id, c.start_date, c.end_date, c.monthly_rent, c.deposit_amount,
               r.room_number, r.floor, t.name as tenant_name
        FROM contracts c
        LEFT JOIN rooms r ON r.id = c.room_id
        LEFT JOIN tenants t ON t.id = c.tenant_id
        WHERE c.status = 'Active'
        ORDER BY c.id DESC
        LIMIT 10
      `;
      for (const row of dbContracts as any[]) {
        if (!row.room_number || !row.tenant_name) continue;
        const dbDocId = `CTR-DB-${row.id}`;
        if (!registry.has(dbDocId)) {
          const signed = createSignedContractRecord({
            docId: dbDocId,
            docType: 'E_CONTRACT',
            roomNumber: String(row.room_number),
            floor: Number(row.floor) === 2 ? 2 : 1,
            tenantName: String(row.tenant_name),
            monthlyRent: Number(row.monthly_rent) || 3500,
            depositAmount: Number(row.deposit_amount) || 3000,
            startDate: row.start_date
              ? new Date(row.start_date).toISOString().slice(0, 10)
              : '2026-06-01',
            endDate: row.end_date
              ? new Date(row.end_date).toISOString().slice(0, 10)
              : '2027-05-31',
          });
          registry.set(dbDocId, signed);
        }
      }
    } catch {
      // fallback to pre-seeded registry
    }

    const records = Array.from(registry.values());
    const targetRecord =
      (docIdParam && registry.get(docIdParam)) || records[0];

    const qrPayload = JSON.stringify({
      docId: targetRecord.docId,
      room: targetRecord.roomNumber,
      tenant: targetRecord.tenantName,
      rent: targetRecord.monthlyRent,
      sha256: targetRecord.sha256Hash,
      sig: targetRecord.hmacSignature.slice(0, 24),
    });

    const qrDataUrl = await qrcode.toDataURL(qrPayload, {
      type: 'image/png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return NextResponse.json({
      success: true,
      records,
      selectedRecord: targetRecord,
      qrDataUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'ไม่สามารถโหลดข้อมูลสัญญา SHA-256 ได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, docId, candidate } = body;
    const registry = getSignedContractsMap();

    // 1. Verify contract authenticity & detect any tampering
    if (action === 'verify') {
      const official = registry.get(docId);
      if (!official) {
        return NextResponse.json(
          {
            success: false,
            verified: false,
            message: '❌ ไม่พบรหัสสัญญานี้ในทะเบียน блокเชน/SHA-256 ของหอพักเกษร 2',
          },
          { status: 404 }
        );
      }

      const result = verifyContractIntegrity(official, {
        roomNumber: candidate?.roomNumber ?? official.roomNumber,
        tenantName: candidate?.tenantName ?? official.tenantName,
        monthlyRent: Number(candidate?.monthlyRent ?? official.monthlyRent),
        depositAmount: Number(candidate?.depositAmount ?? official.depositAmount),
        startDate: candidate?.startDate ?? official.startDate,
        endDate: candidate?.endDate ?? official.endDate,
      });

      return NextResponse.json({
        success: true,
        ...result,
        official,
      });
    }

    // 2. Sign and register a new E-Contract / E-Receipt
    if (action === 'sign_new') {
      const newDocId =
        body.newDocId ||
        `${body.docType === 'E_RECEIPT' ? 'RCP' : 'CTR'}-2569-${body.roomNumber || '104'}-${Math.floor(
          Math.random() * 900 + 100
        )}`;

      const signed = createSignedContractRecord({
        docId: newDocId,
        docType: body.docType || 'E_CONTRACT',
        roomNumber: String(body.roomNumber || '104'),
        tenantName: String(body.tenantName || 'นายกฤษกร บัวอินทร์'),
        monthlyRent: Number(body.monthlyRent) || 3500,
        depositAmount: Number(body.depositAmount) || 3000,
        startDate: String(body.startDate || '2026-06-01'),
        endDate: String(body.endDate || '2027-05-31'),
      });

      registry.set(signed.docId, signed);

      const qrPayload = JSON.stringify({
        docId: signed.docId,
        room: signed.roomNumber,
        tenant: signed.tenantName,
        rent: signed.monthlyRent,
        sha256: signed.sha256Hash,
        sig: signed.hmacSignature.slice(0, 24),
      });

      const qrDataUrl = await qrcode.toDataURL(qrPayload, {
        type: 'image/png',
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280,
      });

      return NextResponse.json({
        success: true,
        selectedRecord: signed,
        records: Array.from(registry.values()),
        qrDataUrl,
      });
    }

    return NextResponse.json(
      { success: false, message: 'ไม่รู้จักคำสั่ง action' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'เกิดข้อผิดพลาดในการตรวจสอบ SHA-256' },
      { status: 500 }
    );
  }
}
