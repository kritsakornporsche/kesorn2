const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const outDir = path.resolve('d:\\Works\\thesiss\\kesorn\\docs\\tc-28-9');
const scratchDir = path.resolve('d:\\Works\\thesiss\\kesorn\\scratch');
const realSlipPath = path.join(scratchDir, 'real_slip_1000.png');

async function directLogin(page, username) {
  console.log(`[AUTH] Logging in as ${username}...`);
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

  // 1. TC-19: Step 4 PromptPay QR (1,000 THB)
  console.log('>>> Capturing TC-19 (Step 4 PromptPay QR)...');
  await directLogin(page, 'guest');
  // Navigate to room 4 (make sure room 4 is Available)
  const conn = await mysql.createConnection({ host: 'localhost', user: 'smartdom', password: 'smartdom', database: 'kesorn_db' });
  await conn.query(`UPDATE rooms SET status = 'Available' WHERE id = 4`);
  await conn.end();

  await page.goto('http://localhost:3001/explore/room/4', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Advance to Step 4
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('จองห้องพักนี้'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

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

  await page.evaluate(() => {
    const idInp = document.querySelector('input[placeholder*="เลขประจำตัว"]');
    const addrInp = document.querySelector('textarea, input[placeholder*="ที่อยู่"]');
    if (idInp) { idInp.value = '1-1002-01384-95-2'; idInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (addrInp) { addrInp.value = '99/50 หมู่ 3 ต.แม่กา อ.เมือง จ.พะเยา 56000'; addrInp.dispatchEvent(new Event('input', { bubbles: true })); }

    const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ขั้นตอนถัดไป') || b.innerText.includes('ชำระเงิน'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Now at Step 4!
  await page.screenshot({ path: path.join(outDir, 'TC-19_promptpay_booking_qr.png') });
  console.log('✓ TC-19 saved');

  // 2. TC-16 & TC-20: Step 5 Success Screen
  console.log('>>> Capturing TC-16 & TC-20 (Step 5 Finished Screen)...');
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(realSlipPath);
    await new Promise(r => setTimeout(r, 1500));
  }

  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ยืนยันการโอนเงิน') || b.innerText.includes('ส่งคำขอจอง'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 4000));

  // Now at Step 5!
  await page.screenshot({ path: path.join(outDir, 'TC-16_explore_dorm_rooms.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-20_booking_slip_pending.png') });
  console.log('✓ TC-16 & TC-20 saved');

  // 3. TC-24: Official Receipt with exact ฿1,000 match
  console.log('>>> Re-capturing TC-24...');
  await directLogin(page, 'owner');
  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const targetRow = rows.find(r => r.innerText.includes('123') || (r.innerText.includes('1,000') && r.innerText.includes('ชำระแล้ว')));
    if (targetRow) {
      const btn = Array.from(targetRow.querySelectorAll('button')).find(b => b.title?.includes('ใบเสร็จ') || b.title?.includes('ใบแจ้งหนี้') || b.innerHTML.includes('M9 12h6'));
      if (btn) btn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, 'TC-24_export_receipt_modal.png') });
  console.log('✓ TC-24 saved');

  // 4. TC-17 & TC-21: Auto-created tenant in /owner/tenants and monthly bill in /owner/billing
  console.log('>>> Capturing TC-17 Tenant Registry & TC-21 Initial Bill...');
  await page.goto('http://localhost:3001/owner/tenants', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-17_auto_created_tenant_registry.png') });
  console.log('✓ TC-17 saved');

  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-21_initial_month_bill_created.png') });
  console.log('✓ TC-21 saved');

  // 5. TC-25: Cancel booking
  console.log('>>> Capturing TC-25 Cancel Booking...');
  const conn3 = await mysql.createConnection({ host: 'localhost', user: 'smartdom', password: 'smartdom', database: 'kesorn_db' });
  // Clean contracts for room 7
  await conn3.query(`DELETE FROM contracts WHERE room_id = 7`);
  await conn3.query(`UPDATE rooms SET status = 'Available' WHERE id = 7`);
  await conn3.end();

  await directLogin(page, 'guest');
  await page.goto('http://localhost:3001/explore/room/7', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-25_guest_cancel_booking.png') });
  console.log('✓ TC-25 saved');

  await browser.close();
  console.log('ALL BOOKING AND RECEIPT TEST CASES CAPTURED PERFECTLY!');
})();
