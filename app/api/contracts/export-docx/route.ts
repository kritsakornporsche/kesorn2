import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/authz';

// commit 28a: guests and tenants get the contract as PDF only (/contract-print); the Word file is for owner / manager
const STAFF = ['owner', 'manager'];
const WORD_STAFF_ONLY = 'ไฟล์ Word สำหรับเจ้าของหอ/ผู้จัดการเท่านั้น — ดาวน์โหลดสัญญาเป็น PDF ได้ที่หน้าสัญญา';
import { canViewContract } from '@/lib/contract-files';
import { contractPrintData } from '@/lib/contract-print';
import { depositFor, getContractParty, getPaymentInfo, getRates, ratesForRoom } from '@/lib/billing';
import { buildContractText, contractAddress, type ContractText, type ContractTextInput } from '@/lib/settings-fields';
import { Document, Paragraph, TextRun, Packer, AlignmentType, TabStopType } from 'docx';

// Word file of the contract: the same text as the print page (lib/settings-fields buildContractText).
// The main "download" for tenants and staff is the print page (PDF); this file is the staff's secondary button.

const FONT = 'TH Sarabun New';
// Thai text: language th-TH (also as the complex-script language) and the font / size / bold set for complex script too,
// so Word breaks Thai lines at word boundaries instead of wrapping whole phrases early.
const THAI = { value: 'th-TH', bidirectional: 'th-TH', eastAsia: 'th-TH' };
const THAI_FONT = { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT, hint: 'cs' };
// Word without Thai word breaking (no Thai proofing installed) still wraps whole phrases: a zero-width space between
// Thai words (Intl.Segmenter) gives it a place to break. Invisible when printed.
const THAI_WORDS = new Intl.Segmenter('th', { granularity: 'word' });
const breakable = (text: string) => [...THAI_WORDS.segment(text)].map((s) => s.segment).join('​').replace(/​(\s)|(\s)​/g, '$1$2');
const run = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
  const size = opts.size ?? 28;
  return new TextRun({ text: breakable(text), font: THAI_FONT, language: THAI, size, sizeComplexScript: size, bold: opts.bold, boldComplexScript: opts.bold });
};
const para = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; indent?: boolean; spaceBefore?: number } = {}) =>
  new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT, // justified spreads Thai lines (no spaces between words)
    indent: opts.indent ? { firstLine: 720 } : undefined,
    spacing: opts.spaceBefore ? { before: opts.spaceBefore } : undefined,
    children: [run(text, opts)],
  });

function createContractDocx(t: ContractText) {
  // Two signature columns: left at the margin, right from the middle of the page
  const sigRow = (left: string, right: string) => new Paragraph({
    tabStops: [{ type: TabStopType.LEFT, position: 4800 }],
    children: [run(left), run('\t'), run(right)],
  });
  return new Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children: [
        para(t.title, { bold: true, size: 34, align: AlignmentType.CENTER }),
        para(t.header, { align: AlignmentType.CENTER }),
        para(t.dateLine, { align: AlignmentType.RIGHT, spaceBefore: 200 }),
        para(t.parties[0], { indent: true, spaceBefore: 200 }),
        para(t.parties[1]),
        para(t.roomLine),
        para(t.parties[2]),
        ...t.clauses.flatMap((c) => c.paragraphs.map((p, i) => para(p, { indent: i > 0 }))),
        para(t.closing, { spaceBefore: 300 }),
        ...t.signatures.flatMap((row, i) => [
          new Paragraph({ spacing: { before: i === 0 ? 400 : 300 }, children: [] }),
          sigRow(`ลงชื่อ ....................................... ${row[0].role}`, `ลงชื่อ ....................................... ${row[1].role}`),
          sigRow(`( ${row[0].name} )`, `( ${row[1].name} )`),
        ]),
        para(t.notesTitle, { bold: true, size: 26, spaceBefore: 400 }),
        ...t.notes.map((n) => para(`• ${n}`, { size: 26 })),
      ],
    }],
  });
}

async function docxResponse(input: ContractTextInput) {
  const buffer = await Packer.toBuffer(createContractDocx(buildContractText(input)));
  const filename = `สัญญาเช่า_ห้อง${input.roomNumber || ''}_${String(input.tenantName || '').replace(/\s+/g, '_')}.docx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

// POST — a draft not saved yet (signed-in users): names / dates from the page; room, rent, deposit, rates,
// landlord and payment details from the database. With an id of a saved contract → as GET (access checked).
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    if (!STAFF.includes(user.role)) return NextResponse.json({ success: false, message: WORD_STAFF_ONLY }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const c = { ...(body?.contract || body) };
    if (Number(c.id) > 0) {
      const access = await canViewContract(Number(c.id));
      if (!access.ok) return NextResponse.json({ success: false, message: 'ไม่พบสัญญา' }, { status: access.status });
      const saved = await contractPrintData(Number(c.id));
      if (saved) return docxResponse(saved.input);
    }
    const sql = getDb();
    const room = c.room_number ? (await sql`SELECT room_number, floor, price, deposit_amount FROM rooms WHERE room_number = ${String(c.room_number)} LIMIT 1`)[0] : null;
    const rent = Number(room?.price || 0) || null;
    return docxResponse({
      createdAt: new Date(),
      roomNumber: room?.room_number ?? c.room_number ?? null,
      floor: room?.floor ?? null,
      tenantName: c.tenant_name ?? null,
      tenantPhone: c.tenant_phone ?? null,
      parentPhone: c.parent_phone ?? null,
      occupants: Number(c.occupants) || null,
      address: contractAddress(c.tenant_address),
      startDate: c.start_date ?? null,
      endDate: c.end_date ?? null,
      deposit: depositFor(room || { room_number: c.room_number }),
      firstRent: rent,
      monthlyRent: rent,
      rates: ratesForRoom(await getRates(sql), c.room_number),
      payment: await getPaymentInfo(sql),
      party: await getContractParty(sql),
    });
  } catch (error) {
    console.error('[Export DOCX Error]', error);
    return NextResponse.json({ success: false, message: 'สร้างไฟล์ Word ไม่สำเร็จ' }, { status: 500 });
  }
}

// GET ?id= — a saved contract. Owner/manager, or the contract's own tenant.
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (user && !STAFF.includes(user.role)) return NextResponse.json({ success: false, message: WORD_STAFF_ONLY }, { status: 403 });
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, message: 'Missing contract id' }, { status: 400 });
    const access = await canViewContract(Number(id));
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'Contract not found' }, { status: access.status });
    }
    const data = await contractPrintData(Number(id));
    if (!data) return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });
    return docxResponse(data.input);
  } catch (error) {
    console.error('[Export DOCX GET Error]', error);
    return NextResponse.json({ success: false, message: 'สร้างไฟล์ Word ไม่สำเร็จ' }, { status: 500 });
  }
}
