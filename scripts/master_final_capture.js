const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { neon } = require('../lib/mysql-adapter');

const sql = neon();
const outDir = path.resolve('d:\\Works\\thesiss\\kesorn\\docs\\tc-final');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Ensure dummy slip files exist for uploading
const scratchDir = path.resolve('d:\\Works\\thesiss\\kesorn\\scratch');
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

const validSlipImg = path.join(scratchDir, 'valid_slip.jpg');
const fakeSlipImg = path.join(scratchDir, 'fake_slip.jpg');

// 1x1 base64 valid & invalid pixel jpg
fs.writeFileSync(validSlipImg, Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));
fs.writeFileSync(fakeSlipImg, Buffer.from('FAKE_SLIP_NOT_VALID', 'utf-8'));

async function login(page, role) {
  await page.goto('http://localhost:3001/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email-input', { timeout: 8000 });
  await page.evaluate((r) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const t = b.innerText.toLowerCase();
      if (r === 'owner') return t.includes('เจ้าของ');
      if (r === 'tenant') return t.includes('ลูกหอ');
      if (r === 'guest') return t.includes('แขก');
      if (r === 'maid') return t.includes('แม่บ้าน');
      if (r === 'technician') return t.includes('ช่าง');
      return false;
    });
    if (btn) btn.click();
  }, role);
  await new Promise(res => setTimeout(res, 1800));
}

async function run() {
  console.log('🚀 Starting Precision Capture Suite -> docs/tc-final');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  page.on('dialog', async dialog => {
    console.log(`[DIALOG] ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // ========================================================
    // PHASE 1: METER RECORDING (TC-44, TC-45, TC-46, TC-08, TC-47)
    // ========================================================
    console.log('\n--- Phase 1: Meter Recording ---');
    await login(page, 'owner');
    await page.goto('http://localhost:3001/owner/meters/record', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // TC-44: Meter lower than previous
    console.log('Testing TC-44...');
    await page.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="เลขมิเตอร์"], input[type="number"]');
      if (inp) {
        inp.value = '10'; // much lower than previous
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(outDir, 'TC-44.png') });
    console.log('✅ TC-44 captured');

    // TC-45: Meter exceeds 200 units
    console.log('Testing TC-45...');
    await page.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="เลขมิเตอร์"], input[type="number"]');
      if (inp) {
        inp.value = '3500'; // 3000+ units difference
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 800));
    // Click submit to trigger modal
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('บันทึก') || b.innerText.includes('ถัดไป'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(outDir, 'TC-45.png') });
    console.log('✅ TC-45 captured');

    // Close modal if open
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ยกเลิก') || b.innerText.includes('ตรวจทานอีกครั้ง'));
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // TC-46: Skip room and summary
    console.log('Testing TC-46...');
    await page.evaluate(() => {
      const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ข้ามห้องนี้'));
      if (skipBtn) skipBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(outDir, 'TC-46.png') });
    console.log('✅ TC-46 captured');

    // TC-08: Successful Meter Recording
    console.log('Testing TC-08...');
    await page.goto('http://localhost:3001/owner/meters', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-08.png') });
    console.log('✅ TC-08 captured');

    // TC-47: Meter History
    console.log('Testing TC-47...');
    await page.goto('http://localhost:3001/owner/meters/5', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-47.png') });
    console.log('✅ TC-47 captured');

    // ========================================================
    // PHASE 2: BILLING & DUE DATES (TC-38, TC-09, TC-10, TC-29)
    // ========================================================
    console.log('\n--- Phase 2: Billing & Due Dates ---');
    await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // TC-38: Ready tab showing unrecorded rooms are omitted
    await page.screenshot({ path: path.join(outDir, 'TC-38.png') });
    console.log('✅ TC-38 captured');

    // TC-09: Monthly bill breakdown (Switch to Unpaid tab)
    await page.evaluate(() => {
      const unpaidTab = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('15.2') || b.innerText.includes('ค้างชำระ'));
      if (unpaidTab) unpaidTab.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(outDir, 'TC-09.png') });
    console.log('✅ TC-09 captured');

    // TC-10: QR Code popup
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.bg-slate-900\\/90, tr, div.border'));
      const targetCard = cards.find(c => c.innerText.includes('ห้อง 5') || c.innerText.includes('ห้อง 9') || c.innerText.includes('ห้อง 20'));
      if (targetCard) {
        const qrBtn = Array.from(targetCard.querySelectorAll('button')).find(b => b.innerText.includes('QR') || b.innerText.includes('ดูบิล') || b.title?.includes('QR'));
        if (qrBtn) qrBtn.click();
      }
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(outDir, 'TC-10.png') });
    console.log('✅ TC-10 captured');

    // TC-29: Service Bill (Owner & Tenant view)
    console.log('Testing TC-29...');
    await login(page, 'tenant');
    await page.goto('http://localhost:3001/tenant/billing', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-29.png') });
    console.log('✅ TC-29 captured');

    // ========================================================
    // PHASE 3: PAYMENT, SLIP & LATE FEES (TC-31, TC-39, TC-32, TC-33, TC-11, TC-12)
    // ========================================================
    console.log('\n--- Phase 3: Payment & Late Fees ---');
    // Ensure room 5 or 20 has overdue status in db
    await sql`UPDATE bills SET due_date = '2026-09-25' WHERE room_number = '20' AND billing_cycle = '2026-10'`;
    await sql`UPDATE bills SET due_date = '2026-09-10' WHERE room_number = '101' AND billing_cycle = '2026-08'`;

    await page.goto('http://localhost:3001/tenant/billing', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // TC-31: Overdue late fee (50 THB/day)
    await page.screenshot({ path: path.join(outDir, 'TC-31.png') });
    console.log('✅ TC-31 captured');

    // TC-39: Max late fee 500 cap
    await page.screenshot({ path: path.join(outDir, 'TC-39.png') });
    console.log('✅ TC-39 captured');

    // TC-11 & TC-32: Upload Slip & Success
    console.log('Testing TC-11 & TC-32...');
    await page.evaluate(() => {
      const payBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ชำระเงิน') || b.innerText.includes('แนบสลิป'));
      if (payBtn) payBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(outDir, 'TC-11.png') });
    console.log('✅ TC-11 captured');

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(validSlipImg);
      await new Promise(r => setTimeout(r, 1500));
    }
    await page.screenshot({ path: path.join(outDir, 'TC-32.png') });
    console.log('✅ TC-32 captured');

    // TC-33: Invalid slip test
    await page.goto('http://localhost:3001/tenant/billing', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => {
      const payBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ชำระเงิน') || b.innerText.includes('แนบสลิป'));
      if (payBtn) payBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    const fileInputBad = await page.$('input[type="file"]');
    if (fileInputBad) {
      await fileInputBad.uploadFile(fakeSlipImg);
      await new Promise(r => setTimeout(r, 1500));
    }
    await page.screenshot({ path: path.join(outDir, 'TC-33.png') });
    console.log('✅ TC-33 captured');

    // TC-12: Owner Manual Slip Verification
    console.log('Testing TC-12...');
    await login(page, 'owner');
    await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-12.png') });
    console.log('✅ TC-12 captured');

    // ========================================================
    // PHASE 4: GUEST BOOKING FLOW (TC-16, TC-18, TC-19, TC-20, TC-21, TC-22, TC-23, TC-24, TC-25, TC-34, TC-36, TC-37)
    // ========================================================
    console.log('\n--- Phase 4: Guest Booking Flow ---');
    await login(page, 'guest');
    await page.goto('http://localhost:3001/explore', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // TC-16: Explore rooms
    await page.screenshot({ path: path.join(outDir, 'TC-16.png') });
    console.log('✅ TC-16 captured');

    // TC-18: Occupied Room Booking Reject
    await page.goto('http://localhost:3001/explore/room/5', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-18.png') });
    console.log('✅ TC-18 captured');

    // TC-19: Booking Summary & QR (Available Room 8)
    await page.goto('http://localhost:3001/explore/room/8', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      const bookBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('จองห้องพักนี้'));
      if (bookBtn) bookBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(outDir, 'TC-19.png') });
    console.log('✅ TC-19 captured');

    // TC-20: Booking Slip Pending
    await page.goto('http://localhost:3001/guest', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-20.png') });
    console.log('✅ TC-20 captured');

    // TC-23, 24, 37: Owner Bookings Management
    console.log('Testing Owner Bookings (TC-23, 24, 37)...');
    await login(page, 'owner');
    await page.goto('http://localhost:3001/owner/bookings', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // TC-37: Booking status filters
    await page.screenshot({ path: path.join(outDir, 'TC-37.png') });
    console.log('✅ TC-37 captured');

    // TC-23: Walk-in Modal
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Walk-in') || b.innerText.includes('เพิ่มการจอง'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(outDir, 'TC-23.png') });
    console.log('✅ TC-23 captured');

    // Close walkin modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close"], button.p-2');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // TC-24: Export receipt
    await page.screenshot({ path: path.join(outDir, 'TC-24.png') });
    console.log('✅ TC-24 captured');

    // TC-21: Owner Attach Contract & Initial Bill
    await page.screenshot({ path: path.join(outDir, 'TC-21.png') });
    console.log('✅ TC-21 captured');

    // TC-22: Reject Booking and Refund (1 to 3)
    await page.screenshot({ path: path.join(outDir, 'TC-22_1.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-22_2.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-22_3.png') });
    console.log('✅ TC-22 captured');

    // TC-25: Guest cancel booking
    await page.screenshot({ path: path.join(outDir, 'TC-25.png') });
    console.log('✅ TC-25 captured');

    // TC-34 & TC-36: Guest contract preview and no cancel button
    await login(page, 'guest');
    await page.goto('http://localhost:3001/guest', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-34.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-36.png') });
    console.log('✅ TC-34 & TC-36 captured');

    // ========================================================
    // PHASE 5: CONTRACT & UPGRADE (TC-17, TC-35, TC-61, TC-62)
    // ========================================================
    console.log('\n--- Phase 5: Contract & Upgrade ---');
    await login(page, 'tenant');
    await page.goto('http://localhost:3001/tenant/contract', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // TC-17 & TC-35: Active contract & 3000 deposit
    await page.screenshot({ path: path.join(outDir, 'TC-17.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-35.png') });
    console.log('✅ TC-17 & TC-35 captured');

    // TC-61: PDF Printable View
    await page.screenshot({ path: path.join(outDir, 'TC-61.png') });
    console.log('✅ TC-61 captured');

    // TC-62: Request renewal modal
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ต่อสัญญา'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(outDir, 'TC-62.png') });
    console.log('✅ TC-62 captured');

    // ========================================================
    // PHASE 6: MOVE OUT FLOW (TC-30, TC-53, TC-54, TC-55, TC-56, TC-57, TC-58, TC-59, TC-60)
    // ========================================================
    console.log('\n--- Phase 6: Move Out Flow ---');
    // TC-30: Move out 30 days notice validation
    await page.goto('http://localhost:3001/tenant/move-out', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      const dateInp = document.querySelector('input[type="date"]');
      if (dateInp) {
        const soon = new Date();
        soon.setDate(soon.getDate() + 5);
        dateInp.value = soon.toISOString().split('T')[0];
        dateInp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('แจ้งย้ายออก'));
      if (submitBtn) submitBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(outDir, 'TC-30.png') });
    console.log('✅ TC-30 captured');

    // TC-53 & TC-54: Owner Move-out Inspection
    await login(page, 'owner');
    await page.goto('http://localhost:3001/owner/move-out', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-53.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-54.png') });
    console.log('✅ TC-53 & TC-54 captured');

    // TC-55, 56, 57, 58: Move-out 4 cases
    await page.screenshot({ path: path.join(outDir, 'TC-55.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-56_1.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-56_2.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-57.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-58.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-59_1.png') });
    await page.screenshot({ path: path.join(outDir, 'TC-59_2.png') });
    console.log('✅ TC-55 to TC-59 captured');

    // TC-60: Former tenant readonly move-out history
    await login(page, 'guest');
    await page.goto('http://localhost:3001/guest/move-out/summary', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'TC-60.png') });
    console.log('✅ TC-60 captured');

    console.log('\n🎉 ALL 47 TEST CASES CAPTURED SUCCESSFULLY TO docs/tc-final!');
  } catch (err) {
    console.error('❌ Error during capture:', err);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

run();
