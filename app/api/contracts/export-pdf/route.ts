import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PDFDocument, rgb } from 'pdf-lib';
import * as fontkit from 'fontkit';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || searchParams.get('contractId');

    if (!id) {
      return NextResponse.json({ success: false, message: 'Missing contract id' }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT 
        c.*, 
        r.room_number, 
        r.floor, 
        r.price, 
        COALESCE(t.name, u.name, '') as tenant_name, 
        COALESCE(t.phone, u.phone, '') as tenant_phone, 
        COALESCE(c.id_card_number, t.id_card_number, '') as id_card_number, 
        COALESCE(c.tenant_address, t.address, '') as tenant_address,
        c.parent_phone
      FROM contracts c
      LEFT JOIN rooms r ON c.room_id = r.id
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id OR t.email = u.email
      WHERE c.id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });
    }

    const data = rows[0];

    // Read original PDF template
    const templatePath = path.join(process.cwd(), 'docs', 'สัญญาเช่าห้องพักหอพักเกษร.pdf');
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ success: false, message: 'Template PDF not found' }, { status: 500 });
    }
    const templateBytes = fs.readFileSync(templatePath);

    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);

    // Load Sarabun font
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Sarabun-Regular.ttf');
    const fontBytes = fs.readFileSync(fontPath);
    const font = await pdfDoc.embedFont(fontBytes);

    const pages = pdfDoc.getPages();
    const page1 = pages[0];
    const page2 = pages[1];

    const createdDate = data.created_at ? new Date(data.created_at) : new Date();
    const thaiYear = (createdDate.getFullYear() + 543).toString().slice(-2);
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const dayStr = createdDate.getDate().toString();
    const monthStr = thaiMonths[createdDate.getMonth()];
    const yearStr = thaiYear;

    let tenantName = (data.tenant_name || '').trim();
    if (tenantName.startsWith('นาย') || tenantName.startsWith('นางสาว') || tenantName.startsWith('นาง')) {
      // keep full
    } else if (tenantName) {
      tenantName = 'นาย' + tenantName;
    }

    const tenantAddress = (data.tenant_address || '').trim();
    const tenantPhone = (data.tenant_phone || '').trim();
    const parentPhone = (data.parent_phone || '').trim();
    const roomNumber = String(data.room_number || '');
    const floor = String(data.floor || (roomNumber.length >= 2 ? roomNumber[0] : '1'));
    const depositAmount = Number(data.deposit_amount || 1000).toLocaleString();
    const monthlyRent = Number(data.price || data.monthly_rent || 2800).toLocaleString();
    const startMonthStr = data.start_date ? new Date(data.start_date).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : '';

    const color = rgb(0, 0, 0); // Pure sharp black
    const size = 11; // 11pt matches original Sarabun font size

    // Parse Address intelligently
    let houseNo = '';
    let moo = '';
    let tambon = '';
    let amphoe = '';
    let province = '';

    if (tenantAddress) {
      const matchHouse = tenantAddress.match(/^([^หมูหมู่ตตำบล\s]+)/);
      if (matchHouse) houseNo = matchHouse[1];

      const matchMoo = tenantAddress.match(/(หมู|หมู่|หมู่ที่|หมูที่)\s*([0-9\/\-]+)/);
      if (matchMoo) moo = matchMoo[0];

      const matchTambon = tenantAddress.match(/(ต\.|ตำบล|ตําบล)\s*([^\s,]+)/);
      if (matchTambon) tambon = matchTambon[0];

      const matchAmphoe = tenantAddress.match(/(อ\.|อำเภอ|อําเภอ)\s*([^\s,]+)/);
      if (matchAmphoe) amphoe = matchAmphoe[0];

      const matchProv = tenantAddress.match(/(จ\.|จังหวัด)\s*([^\s,]+)/);
      if (matchProv) province = matchProv[2];
      else {
        const words = tenantAddress.split(/\s+/);
        if (words.length > 0) province = words[words.length - 1].replace(/จ\./g, '');
      }

      if (!houseNo) houseNo = tenantAddress;
    }

    // ==========================================
    // Page 1 Exact Baseline Coordinates (Aligned directly on dotted lines)
    // ==========================================
    // วันที่ ... เดือน ... พ.ศ. ... (Baseline 652.8)
    page1.drawText(dayStr, { x: 345, y: 652.8, size, font, color });
    page1.drawText(monthStr, { x: 412, y: 652.8, size, font, color });
    page1.drawText(yearStr, { x: 512, y: 652.8, size, font, color });

    // นาย/นางสาว [ชื่อ] อยูบานเลขที่ [houseNo] หมูบาน [moo] (Baseline 597.0)
    if (tenantName) {
      page1.drawText(tenantName, { x: 145, y: 597.0, size, font, color });
    }
    if (houseNo) {
      page1.drawText(houseNo, { x: 358, y: 597.0, size, font, color });
    }
    if (moo) {
      page1.drawText(moo, { x: 472, y: 597.0, size, font, color });
    }

    // ถนน [] ตำบล/แขวง [tambon] อำเภอ/เขต [amphoe] จังหวัด [province] (Baseline 573.0)
    if (tambon) {
      page1.drawText(tambon, { x: 220, y: 573.0, size, font, color });
    }
    if (amphoe) {
      page1.drawText(amphoe, { x: 326, y: 573.0, size, font, color });
    }
    if (province) {
      page1.drawText(province, { x: 418, y: 573.0, size, font, color });
    }

    // เบอรโทรผูพัก [0636040550] เบอรโทรผปู กครอง [0856145414] (Baseline 541.2)
    if (tenantPhone) {
      page1.drawText(tenantPhone, { x: 152, y: 541.2, size, font, color });
    }
    if (parentPhone) {
      page1.drawText(parentPhone, { x: 395, y: 541.2, size, font, color });
    }

    // ขอ 1. หองพักเลขที่ [1] ชั้นที่ [1] (Baseline 477.6)
    page1.drawText(roomNumber, { x: 345, y: 477.6, size, font, color });
    page1.drawText(floor, { x: 382, y: 477.6, size, font, color });

    // • คามัดจําจํานวน [1,000] บาท (Baseline 421.8)
    page1.drawText(depositAmount, { x: 236, y: 421.8, size, font, color });

    // • คาเชาจํานวน [2,800] บาท เปนคาเชาของเดือน [ตุลาคม 2569] (Baseline 358.2)
    page1.drawText(monthlyRent, { x: 236, y: 358.2, size, font, color });
    if (startMonthStr) {
      page1.drawText(startMonthStr, { x: 405, y: 358.2, size, font, color });
    }

    // ในอัตราคาเชาเดือนละ [2,800] บาท (Baseline 310.2)
    page1.drawText(monthlyRent, { x: 462, y: 310.2, size, font, color });

    // ==========================================
    // Page 2 Exact Baseline Coordinates (Aligned directly on dotted lines)
    // ==========================================
    // ( ในวงเล็บ ผู้เช่า Baseline 188.4 )
    if (tenantName && page2) {
      page2.drawText(tenantName, { x: 125, y: 188.4, size, font, color });
    }

    const pdfBytes = await pdfDoc.save();

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="contract_room_${roomNumber}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('[Export PDF Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
