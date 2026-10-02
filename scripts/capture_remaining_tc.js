const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const outDir = path.resolve('d:\\Works\\thesiss\\kesorn\\docs\\tc-28-9');
const slipPath = path.resolve('d:\\Works\\thesiss\\kesorn\\scratch\\real_slip_1000.png');

async function loginAs(page, username) {
  console.log(`[AUTH] Logging in as ${username}...`);
  await page.goto('http://localhost:3001/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email-input', { timeout: 10000 });
  
  await page.evaluate((u) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const roleBtn = buttons.find(b => {
      const t = b.innerText.toLowerCase();
      if (u === 'technician' && t.includes('ช่าง')) return true;
      if (u === 'maid' && t.includes('แม่บ้าน')) return true;
      if (u === 'owner' && t.includes('เจ้าของ')) return true;
      if (u === 'tenant' && t.includes('ลูกหอ')) return true;
      if (u === 'guest' && t.includes('แขก')) return true;
      return false;
    });
    if (roleBtn) {
      roleBtn.click();
      return;
    }
    const inputE = document.querySelector('#signin-email-input');
    const inputP = document.querySelector('#signin-password-input');
    inputE.value = u;
    inputE.dispatchEvent(new Event('input', { bubbles: true }));
    inputP.value = u;
    inputP.dispatchEvent(new Event('input', { bubbles: true }));
    const form = document.querySelector('form');
    if (form) form.requestSubmit();
  }, username);

  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
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

  // ==========================================
  // 1. TC-06: Add Tenant to Room / New Contract Modal
  // ==========================================
  console.log('--- Step: TC-06 ---');
  await loginAs(page, 'owner');
  await page.goto('http://localhost:3001/owner/contracts', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // Click "บันทึกสัญญาใหม่" to open create modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const newBtn = btns.find(b => b.innerText.includes('บันทึกสัญญาใหม่') || b.innerText.includes('เพิ่มสัญญา'));
    if (newBtn) newBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Fill in sample data for room T01
  await page.evaluate(() => {
    const nameInp = document.querySelector('input[placeholder*="ชื่อ"]');
    const phoneInp = document.querySelector('input[placeholder*="โทร"]');
    const emailInp = document.querySelector('input[placeholder*="อีเมล"]');
    if (nameInp) { nameInp.value = 'นาย นฤเบศร์ ทดสอบ (ผู้เช่าใหม่)'; nameInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (phoneInp) { phoneInp.value = '089-123-4567'; phoneInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (emailInp) { emailInp.value = 'tenant.new@kesorn.com'; emailInp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'TC-06_add_tenant_contract_modal.png'), fullPage: false });
  console.log('✓ TC-06 saved: TC-06_add_tenant_contract_modal.png');

  // Close modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.absolute.top-6.right-6');
    if (closeBtn) closeBtn.click();
  });

  // ==========================================
  // 2. TC-19 & TC-20 & TC-25: Guest Room Booking Flow
  // ==========================================
  console.log('--- Step: TC-19, TC-20, TC-25 (Booking Flow) ---');
  await loginAs(page, 'guest');
  // Navigate to explore room 2
  await page.goto('http://localhost:3001/explore/room/2', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // Click "จองห้องพักนี้" to go to Step 2
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const bookBtn = btns.find(b => b.innerText.includes('จองห้องพักนี้') || b.innerText.includes('ดำเนินการจอง'));
    if (bookBtn) bookBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Fill guest info Step 2
  await page.evaluate(() => {
    const nameInp = document.querySelector('input[name="name"], input[placeholder*="ชื่อ-นามสกุล"]');
    const phoneInp = document.querySelector('input[name="phone"], input[placeholder*="เบอร์โทร"]');
    const parentPhoneInp = document.querySelector('input[name="parent_phone"], input[placeholder*="ผู้ปกครอง"]');
    if (nameInp) { nameInp.value = 'นาย กฤษกร บัวอินทร์ (แขกทดสอบ)'; nameInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (phoneInp) { phoneInp.value = '0636040550'; phoneInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (parentPhoneInp) { parentPhoneInp.value = '0812345678'; parentPhoneInp.dispatchEvent(new Event('input', { bubbles: true })); }

    const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ขั้นตอนถัดไป') || b.innerText.includes('ถัดไป'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Step 3 (ID OCR): Fill dummy ID and click Next
  await page.evaluate(() => {
    const idInp = document.querySelector('input[placeholder*="เลขประจำตัว"], input[placeholder*="บัตรประชาชน"]');
    const addrInp = document.querySelector('textarea, input[placeholder*="ที่อยู่"]');
    if (idInp) { idInp.value = '1-1002-01384-95-2'; idInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (addrInp) { addrInp.value = '99/50 หมู่ 3 ต.แม่กา อ.เมือง จ.พะเยา 56000'; addrInp.dispatchEvent(new Event('input', { bubbles: true })); }

    const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ขั้นตอนถัดไป') || b.innerText.includes('ถัดไป') || b.innerText.includes('ไปหน้าชำระเงิน'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Now at Step 4: Showing PromptPay QR for 1,000 THB deposit!
  // TC-19 Screenshot
  await page.screenshot({ path: path.join(outDir, 'TC-19_promptpay_booking_qr.png'), fullPage: false });
  console.log('✓ TC-19 saved: TC-19_promptpay_booking_qr.png');

  // Upload the slip file in Step 4
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(slipPath);
    console.log('Uploaded slip file to booking form.');
  }
  await new Promise(r => setTimeout(r, 2000));

  // Click submit booking button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const submitBtn = btns.find(b => b.innerText.includes('ยืนยันการโอนเงิน') || b.innerText.includes('ส่งคำขอจอง') || b.innerText.includes('ยืนยันการจอง'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 3500));

  // TC-20: Booking submitted / Pending confirmation status
  await page.screenshot({ path: path.join(outDir, 'TC-20_booking_slip_pending.png'), fullPage: false });
  console.log('✓ TC-20 saved: TC-20_booking_slip_pending.png');

  // ==========================================
  // 3. TC-21, TC-22, TC-23: Owner Bookings Management
  // ==========================================
  console.log('--- Step: TC-21, TC-22, TC-23 (Owner Bookings) ---');
  await loginAs(page, 'owner');
  await page.goto('http://localhost:3001/owner/bookings', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // TC-23: Walk-in Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const walkinBtn = btns.find(b => b.innerText.includes('เพิ่มจอง Walk-in') || b.innerText.includes('Walk-in'));
    if (walkinBtn) walkinBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, 'TC-23_owner_walkin_booking_modal.png'), fullPage: false });
  console.log('✓ TC-23 saved: TC-23_owner_walkin_booking_modal.png');

  // Close Walk-in Modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.absolute.top-6.right-6, button.text-gray-400');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // TC-21: Open Approve Booking Modal on Pending booking
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.rounded-\\[2\\.5rem\\], tr, div.border'));
    const pendingCard = cards.find(c => c.innerText.includes('รอตรวจสอบ') || c.innerText.includes('Pending') || c.innerText.includes('นาย กฤษกร'));
    if (pendingCard) {
      const approveBtn = Array.from(pendingCard.querySelectorAll('button')).find(b => b.innerText.includes('อนุมัติ'));
      if (approveBtn) approveBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, 'TC-21_owner_booking_approval.png'), fullPage: false });
  console.log('✓ TC-21 saved: TC-21_owner_booking_approval.png');

  // Close Approve Modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.absolute.top-6.right-6, button.text-gray-400');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // TC-22: Open Reject Booking Modal
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.rounded-\\[2\\.5rem\\], tr, div.border'));
    const pendingCard = cards.find(c => c.innerText.includes('รอตรวจสอบ') || c.innerText.includes('Pending') || c.innerText.includes('นาย กฤษกร'));
    if (pendingCard) {
      const rejectBtn = Array.from(pendingCard.querySelectorAll('button')).find(b => b.innerText.includes('ปฏิเสธ'));
      if (rejectBtn) rejectBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, 'TC-22_owner_booking_reject.png'), fullPage: false });
  console.log('✓ TC-22 saved: TC-22_owner_booking_reject.png');

  // Close Reject Modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.absolute.top-6.right-6, button.text-gray-400');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // ==========================================
  // 4. TC-11 & TC-12: Tenant Slip Upload & Owner Slip Verification
  // ==========================================
  console.log('--- Step: TC-11 & TC-12 (Tenant Billing & Owner Slip Verification) ---');
  await loginAs(page, 'tenant');
  await page.goto('http://localhost:3001/tenant/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // Open Slip upload modal on the test bill
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.rounded-\\[3rem\\]'));
    const billCard = cards.find(c => c.innerText.includes('2026-10-SRV') || c.innerText.includes('1,000') || c.innerText.includes('ค้างชำระ'));
    if (billCard) {
      const uploadBtn = Array.from(billCard.querySelectorAll('button')).find(b => b.innerText.includes('แนบสลิป') || b.innerText.includes('แจ้งชำระ'));
      if (uploadBtn) uploadBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  // TC-11 Screenshot (Upload modal open)
  await page.screenshot({ path: path.join(outDir, 'TC-11_tenant_slip_upload_modal.png'), fullPage: false });
  console.log('✓ TC-11 saved: TC-11_tenant_slip_upload_modal.png');

  // Now inspect owner verification modal for TC-12
  await loginAs(page, 'owner');
  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // Click inspect on bill #122 or bill with slip
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr, div.rounded-3xl, div.rounded-2xl'));
    const billRow = rows.find(r => r.innerText.includes('1,000') || r.innerText.includes('2026-10-SRV') || r.innerText.includes('ตรวจสอบ'));
    if (billRow) {
      const inspectBtn = Array.from(billRow.querySelectorAll('button')).find(b => b.innerText.includes('ตรวจสลิป') || b.innerText.includes('ดูรายละเอียด') || b.innerText.includes('ตรวจสอบ'));
      if (inspectBtn) inspectBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-12_owner_verify_slip_modal.png'), fullPage: false });
  console.log('✓ TC-12 saved: TC-12_owner_verify_slip_modal.png');

  await browser.close();
  console.log('\n🎉 ALL MISSING TEST CASES CAPTURED SUCCESSFULLY!');
})();
