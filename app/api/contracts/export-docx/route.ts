import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/authz';
import { canViewContract, formDeposit } from '@/lib/contract-files';
import { depositFor, getPaymentInfo, getRates, ratesForRoom, type PaymentInfo, type Rates } from '@/lib/billing';
import { contractPaymentLines } from '@/lib/settings-fields';
import { Document, Paragraph, TextRun, Packer, AlignmentType } from 'docx';

const rateText = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

function createContractDocx(data: any, rates: Rates, payment: PaymentInfo) {
  // Transfer details from the settings page; a detail that is not set is left out
  const pay = contractPaymentLines(payment);
  const payText = [pay.bank, pay.promptpay].filter(Boolean).join(' ');
  const roomNumber = data.room_number || '-';
  const floor = data.floor || (roomNumber.length >= 2 ? roomNumber[0] : '1');
  const tenantName = data.tenant_name || '..........................................................';
  // PDPA (commit 16): the ID number is not stored — always a blank line, filled in by hand when signing
  const idCardNumber = '..........................................................';
  const tenantAddress = data.tenant_address || '................................................................................................................................................';
  const tenantPhone = data.tenant_phone || data.phone || '..............................................';
  const parentPhone = data.parent_phone || '..................................................................................';
  const depositAmount = Number(data.deposit_amount || 0).toLocaleString();
  const monthlyRent = Number(data.monthly_rent || data.price || 0).toLocaleString();
  
  const createdDate = data.created_at ? new Date(data.created_at) : new Date();
  const thaiYear = createdDate.getFullYear() + 543;
  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const dayStr = createdDate.getDate().toString();
  const monthStr = thaiMonths[createdDate.getMonth()];
  const yearStr = thaiYear.toString();

  const startMonthStr = data.start_date ? new Date(data.start_date).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : '....................................................';

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1000,
            bottom: 1000,
            left: 1200,
            right: 1200,
          }
        }
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'สัญญาเช่าห้องพักหอพักเกษร', bold: true, size: 30, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'หอพักเกษร 224 หมู่ 2 แม่กาห้วยเคียน เมือง พะเยา 56000 โทร 09-3048-0607', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: `วันที่ ${dayStr} เดือน ${monthStr} พ.ศ. ${yearStr}`, size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: '        สัญญาเช่าฉบับนี้ทำขึ้นระหว่าง ขันแก้ว คำบัว ดังที่อยู่ข้างต้น ซึ่งต่อไปในสัญญานี้จะเรียกว่า "ผู้ให้เช่า" ฝ่ายหนึ่งกับ', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `นาย/นางสาว ${tenantName}`, bold: true, size: 24, font: 'TH Sarabun New' }),
            new TextRun({ text: ` เลขประจำตัวประชาชน ${idCardNumber}`, size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `อยู่บ้านเลขที่ ${tenantAddress}`, size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `เบอร์โทรผู้พัก ${tenantPhone}    เบอร์โทรผู้ปกครอง ${parentPhone}`, size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ซึ่งต่อไปในสัญญานี้จะเรียกว่า "ผู้เช่า" อีกฝ่ายหนึ่ง คู่สัญญาได้ตกลงกันดังนี้', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: `ข้อ 1. ผู้ให้เช่าตกลงให้เช่าและผู้เช่าตกลงเช่าห้องพักเลขที่ ${roomNumber} ชั้นที่ ${floor} ในอาคารของผู้ให้เช่าเพื่อเป็นที่อยู่อาศัยภายใต้ระเบียบที่ผู้ให้เช่ากำหนด โดยเฉพาะไม่ก่อกวน ต้องสงบในยามวิกาล ไม่ทะเลาะวิวาท ไม่ทำผิดศีลธรรมและกฎหมาย`, size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `ข้อ 2. ผู้เช่าตกลงชำระค่าเช่าให้แก่ผู้ให้เช่าล่วงหน้า ผู้เช่าได้วางเงินประกันจำนวน ${depositAmount} บาท ผู้ให้เช่าจะคืนเงินประกันภายใน 7 วันนับแต่วันที่ผู้เช่าส่งมอบห้องคืน หากมีการหักค่าเสียหายหรือค่าใช้จ่ายที่ค้างชำระ ผู้ให้เช่าจะแจ้งรายการหักเป็นหนังสือ และคืนเงินส่วนที่เหลือภายใน 14 วันนับแต่วันที่ผู้เช่าส่งมอบห้องคืน ค่าเช่าจำนวน ${monthlyRent} บาท เป็นค่าเช่าของเดือน ${startMonthStr} ส่วนค่าเช่าชำระโดยกำหนดชำระค่าเช่าภายในวันที่ 5 ของทุกเดือน ในอัตราค่าเช่าเดือนละ ${monthlyRent} บาท หากผู้เช่าชำระเงินล่าช้ากว่ากำหนด ผู้ให้เช่ามีสิทธิ์เรียกขอค่าล่าช้าวันละ ${rateText(rates.lateFeePerDay)} บาท`, size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 3. ผู้เช่าตกลงจะนำค่าเช่ามาชำระให้ ณ ที่ทำการของผู้ให้เช่าหรือตัวแทนภายกำหนด', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 4. ห้ามเช่าช่วงเป็นอันขาด เว้นแต่ผู้ให้เช่าตกลงยินยอมด้วยเป็นลายลักษณ์อักษร', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 5. ค่าน้ำประปา ค่าไฟฟ้า และค่าใช้จ่ายอื่น ถ้ามิให้เรียกเก็บตามอัตราในมิเตอร์หรือโดยเฉลี่ยจากผู้เช่า', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 6. ผู้เช่าต้องบำรุงรักษาห้องเช่ารวมถึงอุปกรณ์ไฟฟ้า มุ้งลวด กระจกบานเกล็ด กุญแจห้อง กลอนประตู พัดลม หลอดไฟ เสื่อ ฝาผนัง และอื่น ๆ ให้อยู่ในสภาพที่ดีอยู่เสมอ หากเกิดชำรุดเสียหายไม่ว่าด้วยเหตุใดก็ตาม ผู้เช่าต้องทำให้กลับคืนสู่สภาพเดิมทันที ด้วยค่าใช้จ่ายของผู้เช่า', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 7. ผู้เช่ามีหน้าที่รักษาความสะอาดตามกฎหมาย ไม่เก็บวัตถุไวไฟหรือสิ่งอันตรายหรือสิ่งต้องห้ามตามกฎหมาย ผู้เช่ายินยอมให้ผู้ให้เช่าเข้าตรวจความถูกต้องเรียบร้อยในห้อง', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 8. ผู้เช่าจะดัดแปลงต่อเติมหรือรื้อถอนทรัพย์สินที่เช่าทั้งหมดหรือบางส่วนได้ ต่อเมื่อได้รับความยินยอมเป็นหนังสือจากผู้ให้เช่า', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 9. ถ้าผู้เช่าผิดสัญญาไม่ชำระค่าเช่าตามกำหนดไว้ในข้อ 2. ผู้ให้เช่าต้องทวงสิทธิไว้ในการกลับเข้าครอบครองทรัพย์สินที่เช่าตามสัญญานี้โดยฉับพลัน และผู้เช่ายอมให้ผู้ให้เช่าย้ายบุคคลหรือทรัพย์สินของผู้เช่าออกไปจากทรัพย์ที่เช่าตามสัญญานี้', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 10. ผู้เช่ามีหน้าที่แจ้งให้ผู้ให้เช่าทราบล่วงหน้าในการเลิกเช่าไม่น้อยกว่าสามสิบวันจึงจะได้รับเงินล่วงหน้าคืนหรืออยู่อาศัยโดยหักจากการชำระล่วงหน้าตามข้อ 2.', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 11. ในวันทำสัญญานี้ ผู้เช่าได้ตรวจตราทรัพย์สินที่เช่าแล้วเห็นว่ามีสภาพปกติดีทุกประการและผู้ให้เช่าได้ส่งมอบทรัพย์สินที่เช่าให้แก่ผู้เช่าแล้ว', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ข้อ 12. ผู้เช่าได้มอบสำเนาบัตรประจำตัว สำเนาทะเบียนบ้านและเอกสารแสดงตัวตามกฎหมายที่ไม่หมดอายุ พร้อมรูปถ่าย ให้ไว้กับผู้ให้เช่า', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: 'คู่สัญญาทั้งสองฝ่ายได้อ่านและทำความเข้าใจดีแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ลงชื่อ ....................................................... ผู้เช่า                ลงชื่อ ....................................................... ผู้ให้เช่า', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `      ( ${tenantName} )                                      ( นายขันแก้ว คำบัว )`, size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: 'ลงชื่อ ....................................................... พยาน                ลงชื่อ ....................................................... พยาน', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '      ( ....................................................... )                                      ( นางเกษร คำบัว )', size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: 'หมายเหตุ:', bold: true, size: 24, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `• ค่าน้ำคนละ ${rateText(rates.waterPerPerson)} บาท  • ค่าไฟหน่วยละ ${rateText(rates.electricityPerUnit)} บาท`, size: 22, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '• ติดต่อเจ้าของหอพัก นายขันแก้ว คำบัว 09-3048-0607, นายวรรธนันท์ คำบัว 081-842-4948', size: 22, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '• กรณีผู้เช่าเลิกสัญญาก่อนครบกำหนด ผู้ให้เช่ามีสิทธิ์ไม่คืนเงินประกัน เว้นแต่ผู้เช่าได้เช่ามาแล้วไม่น้อยกว่ากึ่งหนึ่งของระยะเวลาเช่า ได้แจ้งเลิกสัญญาเป็นหนังสือล่วงหน้าไม่น้อยกว่า 30 วัน และไม่ค้างชำระค่าเช่าหรือค่าใช้จ่ายอื่น', size: 22, font: 'TH Sarabun New' })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '• ห้ามทิ้งขยะลงโถชักโครก ห้ามเสียงดัง ห้ามดื่มเหล้า สูบบุหรี่ ให้รักษาความสะอาดห้องพักสม่ำเสมอ', size: 22, font: 'TH Sarabun New' })
          ]
        }),
        ...(payText ? [new Paragraph({
          children: [
            new TextRun({ text: `• ${payText}`, size: 22, font: 'TH Sarabun New' })
          ]
        })] : []),
      ]
    }]
  });

  return doc;
}

export async function POST(req: Request) {
  try {
    // Builds the document from what the page sends (amounts come from the database), only for signed-in users
    if (!(await getCurrentUser())) {
      return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    const body = await req.json();
    const contract = { ...(body.contract || body) };
    // The deposit printed on the form comes from the server, never from the page: the contract's formDeposit when it
    // exists, otherwise the room's total deposit (depositFor)
    const sql = getDb();
    const saved = Number(contract.id) > 0 ? await sql`
      SELECT c.status, c.deposit_amount, r.room_number, r.deposit_amount AS room_deposit_amount
      FROM contracts c JOIN rooms r ON r.id = c.room_id WHERE c.id = ${Number(contract.id)} LIMIT 1
    ` : [];
    if (saved[0]) {
      contract.deposit_amount = formDeposit(saved[0]);
    } else {
      const room = contract.room_number ? await sql`SELECT room_number, deposit_amount FROM rooms WHERE room_number = ${String(contract.room_number)} LIMIT 1` : [];
      contract.deposit_amount = depositFor(room[0] || { room_number: contract.room_number });
    }
    // Rates always from the dorm settings (demo room T01 has its own), never from the page
    const rates = ratesForRoom(await getRates(getDb()), contract.room_number);
    const doc = createContractDocx(contract, rates, await getPaymentInfo(getDb()));
    const buffer = await Packer.toBuffer(doc);

    const roomNumber = contract.room_number || 'Room';
    const tenantName = (contract.tenant_name || 'Tenant').replace(/\s+/g, '_');
    const filename = `สัญญาเช่า_หอพักเกษร_ห้อง${roomNumber}_${tenantName}.docx`;

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error: any) {
    console.error('[Export DOCX Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'Missing contract id' }, { status: 400 });
    }

    // Owner/manager, or the contract's own tenant (the document shows the ID card number and address)
    const access = await canViewContract(Number(id));
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'Contract not found' }, { status: access.status });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT c.*, r.room_number, r.floor, r.price, r.deposit_amount as room_deposit_amount, t.name as tenant_name, t.phone as tenant_phone, t.email as tenant_email, t.id_card_number, t.address as tenant_address
      FROM contracts c
      LEFT JOIN rooms r ON c.room_id = r.id
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE c.id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });
    }

    const contract = { ...rows[0], deposit_amount: formDeposit(rows[0]) };
    const rates = ratesForRoom(await getRates(sql), contract.room_number);
    const doc = createContractDocx(contract, rates, await getPaymentInfo(sql));
    const buffer = await Packer.toBuffer(doc);

    const filename = `สัญญาเช่า_หอพักเกษร_ห้อง${contract.room_number}_${(contract.tenant_name || '').replace(/\s+/g, '_')}.docx`;

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error: any) {
    console.error('[Export DOCX GET Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
