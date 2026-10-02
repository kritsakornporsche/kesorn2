const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const outDir = path.resolve('d:\\Works\\thesiss\\kesorn\\docs\\tc-28-9');
const scratchDir = path.resolve('d:\\Works\\thesiss\\kesorn\\scratch');
const realSlipPath = path.join(scratchDir, 'real_slip_1000.png');
const fakeSlipPath = path.join(scratchDir, 'fake_slip.png');

// Ensure dummy fake slip exists
if (!fs.existsSync(fakeSlipPath)) {
  fs.writeFileSync(fakeSlipPath, Buffer.from('FAKE_SLIP_IMAGE_CONTENT_NOT_A_VALID_BANK_RECEIPT'));
}

async function loginFast(page, username) {
  console.log(`[AUTH] Fast login as ${username}...`);
  await page.goto('http://localhost:3001/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email-input', { timeout: 10000 });
  
  await page.evaluate((u) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const roleBtn = buttons.find(b => {
      const t = b.innerText.toLowerCase();
      if (u === 'owner' && t.includes('เจ้าของ')) return true;
      if (u === 'tenant' && t.includes('ลูกหอ')) return true;
      if (u === 'guest' && t.includes('แขก')) return true;
      return false;
    });
    if (roleBtn) roleBtn.click();
  }, username);

  await new Promise(r => setTimeout(r, 2000));
}

// Function to blur sensitive personal info directly in DOM before taking clean screenshots
async function maskSensitiveData(page) {
  await page.evaluate(() => {
    // Mask Thai ID Cards (e.g. 1-1002-01384-95-2 or 13 digits)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const textNodes = [];
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    for (const t of textNodes) {
      // Mask ID card
      t.nodeValue = t.nodeValue.replace(/\b\d{1}-\d{4}-\d{5}-\d{2}-\d{1}\b/g, 'x-xxxx-xxxxx-xx-x');
      t.nodeValue = t.nodeValue.replace(/\b\d{13}\b/g, 'xxxxxxxxxxxxx');
      // Mask phone numbers (063-604-0550, 081-987-6543, 08x-xxx-xxxx)
      t.nodeValue = t.nodeValue.replace(/063\s*604\s*0550/g, '063-xxx-0550');
      t.nodeValue = t.nodeValue.replace(/063-604-0550/g, '063-xxx-0550');
      t.nodeValue = t.nodeValue.replace(/0636040550/g, '063-xxx-0550');
      // Mask name in PromptPay if present
      t.nodeValue = t.nodeValue.replace(/นาย กฤษกร บัวอินทร์/g, 'นาย ก*** บ*** (ผู้รับเงิน)');
      t.nodeValue = t.nodeValue.replace(/กฤษกร บัวอินทร์/g, 'ก*** บ***');
    }
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  page.on('dialog', async dialog => {
    console.log(`[DIALOG] ${dialog.message()}`);
    await dialog.accept();
  });

  console.log('====================================================');
  console.log('STARTING PRECISION CAPTURE FOR ALL REQUESTED TEST CASES');
  console.log('====================================================');

  // ----------------------------------------------------
  // TC-04: (2 ภาพ) 1. ฟอร์มก่อนบันทึก 2. ห้อง 101 ขึ้นในผังห้องหลังบันทึก
  // ----------------------------------------------------
  console.log('>>> TC-04 Add Room Flow...');
  await loginFast(page, 'owner');
  await page.goto('http://localhost:3001/owner/rooms', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Open modal & fill
  await page.evaluate(() => {
    const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('เพิ่มห้องพัก'));
    if (addBtn) addBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const roomInp = document.querySelector('input[placeholder*="101"], input[name="room_number"]');
    const priceInp = document.querySelector('input[placeholder*="4500"], input[name="price"]');
    if (roomInp) { roomInp.value = '101'; roomInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (priceInp) { priceInp.value = '4500'; priceInp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-04_1_add_room_form.png') });

  // Submit
  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('บันทึกข้อมูล') || b.innerText.includes('บันทึกห้อง'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 2500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-04_owner_rooms_list.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-04_2_room_added_in_grid.png') });
  console.log('✓ TC-04 (2 images) captured!');

  // ----------------------------------------------------
  // TC-05: (2 ภาพ) 1. ฟอร์มแก้ไข 2. ค่าที่แก้แล้ว (฿4,600) แสดงบนการ์ดห้อง
  // ----------------------------------------------------
  console.log('>>> TC-05 Edit Room Flow...');
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.rounded-\\[2\\.5rem\\], tr, div.border'));
    const room101 = cards.find(c => c.innerText.includes('101'));
    if (room101) {
      const editBtn = Array.from(room101.querySelectorAll('button')).find(b => b.innerText.includes('แก้ไข'));
      if (editBtn) editBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const priceInp = document.querySelector('input[placeholder*="4500"], input[name="price"]');
    if (priceInp) { priceInp.value = '4600'; priceInp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-05_1_edit_room_form.png') });

  // Submit edit
  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('บันทึกการแก้ไข') || b.innerText.includes('บันทึก'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 2500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-05_owner_room_management.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-05_2_room_price_updated.png') });
  console.log('✓ TC-05 (2 images) captured!');

  // ----------------------------------------------------
  // TC-07: (2 ภาพ) 1. ฟอร์มอัปโหลด 2. รายการสัญญามีปุ่ม "ดูสัญญาที่เซ็น"
  // ----------------------------------------------------
  console.log('>>> TC-07 Owner Contract Signed Flow...');
  await page.goto('http://localhost:3001/owner/contracts', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.rounded-\\[2\\.5rem\\], tr, div.border'));
    const target = cards[0];
    if (target) {
      const uploadBtn = Array.from(target.querySelectorAll('button')).find(b => b.innerText.includes('แนบไฟล์') || b.innerText.includes('ดูสัญญา'));
      if (uploadBtn) uploadBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-07_1_upload_signed_contract_modal.png') });

  // Attach sample signed file
  const contractInput = await page.$('input[type="file"]');
  if (contractInput) {
    await contractInput.uploadFile(realSlipPath);
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('บันทึกไฟล์') || b.innerText.includes('อัปโหลด'));
      if (saveBtn) saveBtn.click();
    });
    await new Promise(r => setTimeout(r, 2500));
  }
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-07_owner_contracts_active.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-07_2_signed_contract_attached.png') });
  console.log('✓ TC-07 (2 images) captured!');

  // ----------------------------------------------------
  // TC-29: (2 ภาพ) 1. บิลค่าบริการในหน้าเจ้าของ 2. บิลในหน้าผู้เช่า
  // ----------------------------------------------------
  console.log('>>> TC-29 Service Billing Flow (Owner & Tenant)...');
  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tab = btns.find(b => b.innerText.includes('ค่าซ่อม') || b.innerText.includes('ทำความสะอาด'));
    if (tab) tab.click();
    const tbl = document.querySelector('table, div.overflow-x-auto');
    if (tbl) tbl.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 1500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-29_owner_service_billing.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-29_1_owner_service_bill.png') });

  // Tenant side for TC-29
  await loginFast(page, 'tenant');
  await page.goto('http://localhost:3001/tenant/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tab = btns.find(b => b.innerText.includes('ค่าบริการ') || b.innerText.includes('บริการ'));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-29_2_tenant_service_bill.png') });
  console.log('✓ TC-29 (2 images) captured!');

  // ----------------------------------------------------
  // TC-24: Official Receipt of Paid Booking Deposit (Exact matching numbers)
  // ----------------------------------------------------
  console.log('>>> TC-24 Export Receipt Modal...');
  await loginFast(page, 'owner');
  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const paidRow = rows.find(r => r.innerText.includes('123') || (r.innerText.includes('1,000') && r.innerText.includes('ชำระแล้ว')));
    if (paidRow) {
      const btn = Array.from(paidRow.querySelectorAll('button')).find(b => b.title?.includes('ใบเสร็จ') || b.title?.includes('ใบแจ้งหนี้') || b.innerHTML.includes('M9 12h6'));
      if (btn) btn.click();
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-24_export_receipt_modal.png') });
  console.log('✓ TC-24 captured!');

  // Close receipt
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button.p-2.text-muted-foreground, button[aria-label="Close"]');
    if (closeBtn) closeBtn.click();
  });

  // ----------------------------------------------------
  // TC-16, 19, 20: Guest Booking Complete Flow
  // ----------------------------------------------------
  console.log('>>> TC-16, 19, 20 Guest Booking Flow...');
  await loginFast(page, 'guest');
  await page.goto('http://localhost:3001/explore/room/4', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Step 1: Click Book
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('จองห้องพักนี้'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Step 2: Info
  await page.evaluate(() => {
    const nameInp = document.querySelector('input[name="name"], input[placeholder*="ชื่อ"]');
    const phoneInp = document.querySelector('input[name="phone"], input[placeholder*="เบอร์โทร"]');
    const parentInp = document.querySelector('input[name="parent_phone"], input[placeholder*="ผู้ปกครอง"]');
    if (nameInp) { nameInp.value = 'นาย กฤษกร บัวอินทร์ (แขกทดสอบ)'; nameInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (phoneInp) { phoneInp.value = '0636040550'; phoneInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (parentInp) { parentInp.value = '0812345678'; parentInp.dispatchEvent(new Event('input', { bubbles: true })); }

    const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ขั้นตอนถัดไป'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Step 3: ID OCR Step
  await page.evaluate(() => {
    const idInp = document.querySelector('input[placeholder*="เลขประจำตัว"]');
    const addrInp = document.querySelector('textarea, input[placeholder*="ที่อยู่"]');
    if (idInp) { idInp.value = '1-1002-01384-95-2'; idInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (addrInp) { addrInp.value = '99/50 หมู่ 3 ต.แม่กา อ.เมือง จ.พะเยา 56000'; addrInp.dispatchEvent(new Event('input', { bubbles: true })); }

    const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ขั้นตอนถัดไป') || b.innerText.includes('ไปหน้าชำระเงิน'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Step 4: TC-19 PromptPay QR 1,000 THB
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-19_promptpay_booking_qr.png') });
  console.log('✓ TC-19 captured!');

  // Upload slip for Step 4
  const bookingSlipInput = await page.$('input[type="file"]');
  if (bookingSlipInput) {
    await bookingSlipInput.uploadFile(realSlipPath);
    await new Promise(r => setTimeout(r, 1500));
  }

  // Submit Booking -> TC-16 & TC-20
  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ยืนยันการโอนเงิน') || b.innerText.includes('ส่งคำขอจอง'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 3500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-16_explore_dorm_rooms.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-20_booking_slip_pending.png') });
  console.log('✓ TC-16 & TC-20 captured!');

  // ----------------------------------------------------
  // TC-17 & TC-21: Owner Approve Booking Modal & Status Updated
  // ----------------------------------------------------
  console.log('>>> TC-17 & TC-21 Owner Approve Booking...');
  await loginFast(page, 'owner');
  await page.goto('http://localhost:3001/owner/bookings', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // Open Pending Tab and show Approve modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, div'));
    const tab = btns.find(b => b.innerText.includes('รอดำเนินการ') || b.innerText.includes('รอตรวจ'));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    const approveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ตรวจสอบ & อนุมัติ') || b.innerText.includes('อนุมัติ'));
    if (approveBtn) approveBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-21_1_owner_approve_modal.png') });

  // Click Submit Approve
  await page.evaluate(() => {
    const modal = document.querySelector('div.fixed.inset-0');
    if (modal) {
      const confirmBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('ยืนยันการอนุมัติ') || b.innerText.includes('อนุมัติสัญญา'));
      if (confirmBtn) confirmBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 2500));

  // Check Active Tab to show Approved Status
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button, div')).find(b => b.innerText.includes('อนุมัติแล้ว'));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-17_TC-21_owner_bookings_management.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-21_owner_booking_approval.png') });
  console.log('✓ TC-17 & TC-21 captured!');

  // ----------------------------------------------------
  // TC-22: Reject Booking with Reason
  // ----------------------------------------------------
  console.log('>>> TC-22 Reject Booking with Reason...');
  // Ensure a pending booking exists for room 6
  const conn = await mysql.createConnection({ host: 'localhost', user: 'smartdom', password: 'smartdom', database: 'kesorn_db' });
  await conn.query(`
    INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status, slip_url, id_card_number, tenant_address, created_at)
    VALUES (13, 6, '2026-10-01', '2027-09-30', 1000.00, 'PendingOwnerSignature', '/uploads/slips/slip_13_2_1790568821536_yv66w6.png', '1-1002-01384-95-2', '99/50 หมู่ 3 ต.แม่กา อ.เมือง จ.พะเยา 56000', NOW())
  `);
  await conn.end();

  await page.goto('http://localhost:3001/owner/bookings', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => {
    const rejectBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ปฏิเสธ'));
    if (rejectBtn) rejectBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-22_owner_booking_reject.png') });
  console.log('✓ TC-22 captured!');

  // ----------------------------------------------------
  // TC-25: Cancel Booking Flow (Guest Cancelling Booking)
  // ----------------------------------------------------
  console.log('>>> TC-25 Guest Cancel Booking...');
  await loginFast(page, 'guest');
  await page.goto('http://localhost:3001/explore/room/6', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-25_guest_cancel_booking.png') });
  console.log('✓ TC-25 captured!');

  // ----------------------------------------------------
  // TC-11 & TC-12: Tenant Slip Upload & Owner Slip Verification Modal
  // ----------------------------------------------------
  console.log('>>> TC-11 & TC-12 Real Flow...');
  await loginFast(page, 'tenant');
  await page.goto('http://localhost:3001/tenant/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    const uploadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('แนบสลิป') || b.innerText.includes('แจ้งชำระ'));
    if (uploadBtn) uploadBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-11_tenant_slip_upload_modal.png') });
  console.log('✓ TC-11 captured!');

  // Owner inspect slip modal
  await loginFast(page, 'owner');
  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    const inspectBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ตรวจสลิป') || b.innerText.includes('ดูสลิป'));
    if (inspectBtn) inspectBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-12_owner_verify_slip_modal.png') });
  console.log('✓ TC-12 captured!');

  // ----------------------------------------------------
  // TC-32 & TC-33: Real Tenant Billing Slip Upload & Error Toast
  // ----------------------------------------------------
  console.log('>>> TC-32 & TC-33 Tenant Real Billing Verification...');
  await loginFast(page, 'tenant');
  await page.goto('http://localhost:3001/tenant/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // TC-32: Upload Real Slip to bill
  await page.evaluate(() => {
    const uploadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('แนบสลิป') || b.innerText.includes('แจ้งชำระ'));
    if (uploadBtn) uploadBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  const tenantSlipInput = await page.$('input[type="file"]');
  if (tenantSlipInput) {
    await tenantSlipInput.uploadFile(realSlipPath);
    await new Promise(r => setTimeout(r, 3500));
  }
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-32_slip_verification_success.png') });
  console.log('✓ TC-32 captured!');

  // TC-33: Upload Invalid Slip / Error Toast
  await page.evaluate(() => {
    const uploadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('แนบสลิป') || b.innerText.includes('แจ้งชำระ'));
    if (uploadBtn) uploadBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  const fakeInput = await page.$('input[type="file"]');
  if (fakeInput) {
    await fakeInput.uploadFile(fakeSlipPath);
    await new Promise(r => setTimeout(r, 3000));
  }
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'TC-33_invalid_slip_verification.png') });
  console.log('✓ TC-33 captured!');

  // ----------------------------------------------------
  // SEC-01: Real Browser URL Redirect (No injected overlay)
  // ----------------------------------------------------
  console.log('>>> SEC-01 Real Browser Redirect URL...');
  await page.goto('http://localhost:3001/api/auth/signout', { waitUntil: 'domcontentloaded' });
  await page.goto('http://localhost:3001/owner', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await maskSensitiveData(page);
  await page.screenshot({ path: path.join(outDir, 'SEC-01_unauthenticated_route_redirect.png') });
  console.log('✓ SEC-01 captured!');

  await browser.close();
  console.log('\n🌟 ALL TEST CASES FULLY CAPTURED & SAVED TO DOCS/TC-28-9!');
})();
