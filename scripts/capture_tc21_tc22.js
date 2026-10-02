const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const outDir = path.resolve('d:\\Works\\thesiss\\kesorn\\docs\\tc-28-9');

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
  // 1. Insert a pending contract in DB for room 3
  const conn = await mysql.createConnection({ host: 'localhost', user: 'smartdom', password: 'smartdom', database: 'kesorn_db' });
  
  // Make sure room 3 is available
  await conn.query(`UPDATE rooms SET status = 'Available' WHERE id = 3`);
  
  // Check if there is an existing pending contract or insert one
  const [existing] = await conn.query(`SELECT id FROM contracts WHERE status = 'PendingOwnerSignature' LIMIT 1`);
  let contractId;
  if (existing.length > 0) {
    contractId = existing[0].id;
  } else {
    const [res] = await conn.query(`
      INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status, slip_url, id_card_number, tenant_address, created_at)
      VALUES (13, 3, '2026-10-01', '2027-09-30', 1000.00, 'PendingOwnerSignature', '/uploads/slips/slip_13_2_1790568821536_yv66w6.png', '1-1002-01384-95-2', '99/50 หมู่ 3 ต.แม่กา อ.เมือง จ.พะเยา 56000', NOW())
    `);
    contractId = res.insertId;
  }
  await conn.end();
  console.log('DB updated: pending contract #', contractId);

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

  await loginAs(page, 'owner');
  await page.goto('http://localhost:3001/owner/bookings', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // Select "Pending" tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, div'));
    const pendingTab = btns.find(b => b.innerText.includes('รอดำเนินการ') || b.innerText.includes('รอตรวจสลิป'));
    if (pendingTab) pendingTab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Open Approval Modal (TC-21)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const approveBtn = btns.find(b => b.innerText.includes('ตรวจสอบ & อนุมัติ') || b.innerText.includes('อนุมัติ'));
    if (approveBtn) approveBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-21_owner_booking_approval.png'), fullPage: false });
  console.log('✓ TC-21 saved: TC-21_owner_booking_approval.png');

  // Close Approval modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.absolute.top-6.right-6, button.text-gray-400');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. Open Reject Modal (TC-22)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const rejectBtn = btns.find(b => b.innerText.includes('ปฏิเสธ'));
    if (rejectBtn) rejectBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-22_owner_booking_reject.png'), fullPage: false });
  console.log('✓ TC-22 saved: TC-22_owner_booking_reject.png');

  // Close Reject modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.absolute.top-6.right-6, button.text-gray-400');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 3. TC-25 Guest Cancel Booking interface / status
  await loginAs(page, 'guest');
  await page.goto('http://localhost:3001/explore/room/3', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(outDir, 'TC-25_guest_cancel_booking.png'), fullPage: false });
  console.log('✓ TC-25 saved: TC-25_guest_cancel_booking.png');

  await browser.close();
  console.log('\n🌟 TC-21, TC-22, TC-25 re-captured perfectly!');
})();
