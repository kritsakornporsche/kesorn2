const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const outDir = path.resolve('d:\\Works\\thesiss\\kesorn\\docs\\tc-28-9');
const realSlipPath = path.resolve('d:\\Works\\thesiss\\kesorn\\scratch\\real_slip_1000.png');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  page.on('dialog', async dialog => {
    console.log('[DIALOG]', dialog.message());
    await dialog.accept();
  });

  // 1. Direct login as guest
  await page.goto('http://localhost:3001/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email-input');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.innerText.includes('แขก'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Reset booking progress for room 8 and clear any contracts
  const conn = await mysql.createConnection({ host: 'localhost', user: 'smartdom', password: 'smartdom', database: 'kesorn_db' });
  await conn.query('DELETE FROM booking_progress WHERE room_id = 8');
  await conn.query('DELETE FROM contracts WHERE room_id = 8');
  await conn.query(`UPDATE rooms SET status = 'Available' WHERE id = 8`);
  await conn.end();

  // Navigate to room 8
  await page.goto('http://localhost:3001/explore/room/8', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Click 'ตกลงเช่า และเริ่มจองห้อง →'
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('เริ่มจองห้อง'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Fill Step 2
  await page.evaluate(() => {
    const nameInp = document.querySelector('input[placeholder*="ชื่อ"]');
    const phoneInp = document.querySelector('input[placeholder*="เบอร์โทร"]');
    const parentInp = document.querySelector('input[placeholder*="ผู้ปกครอง"]');
    if (nameInp) { nameInp.value = 'นาย กฤษกร บัวอินทร์'; nameInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (phoneInp) { phoneInp.value = '0636040550'; phoneInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (parentInp) { parentInp.value = '0812345678'; parentInp.dispatchEvent(new Event('input', { bubbles: true })); }
    const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ขั้นตอนถัดไป'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Step 3: Click 'ทดสอบข้อมูลตัวอย่าง'
  await page.evaluate(() => {
    const testOcrBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ทดสอบข้อมูลตัวอย่าง'));
    if (testOcrBtn) testOcrBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Step 3: Click 'ถัดไป: ชำระเงินค่าจอง ฿1,000' -> Move to Step 4
  await page.evaluate(() => {
    const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ถัดไป') || b.innerText.includes('ชำระเงินค่าจอง'));
    if (nextBtn) nextBtn.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Screenshot TC-19 (Step 4 PromptPay QR Modal)
  await page.screenshot({ path: path.join(outDir, 'TC-19_promptpay_booking_qr.png') });
  console.log('✓ TC-19 QR captured successfully!');

  // Upload slip in Step 4
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(realSlipPath);
    await new Promise(r => setTimeout(r, 1500));
  }

  // Click submit in Step 4 -> Go to Step 5
  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ยืนยันการโอนเงิน') || b.innerText.includes('ส่งคำขอจอง'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 4500));

  // Screenshot TC-16 & TC-20 (Step 5 Finished / Success Screen)
  await page.screenshot({ path: path.join(outDir, 'TC-16_explore_dorm_rooms.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-20_booking_slip_pending.png') });
  console.log('✓ TC-16 & TC-20 captured successfully!');

  await browser.close();
})();
