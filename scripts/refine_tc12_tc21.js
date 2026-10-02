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
      if (u === 'owner' && t.includes('เจ้าของ')) return true;
      if (u === 'tenant' && t.includes('ลูกหอ')) return true;
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
  // 1. Update bill 122 to have status Pending and slip_url
  const conn = await mysql.createConnection({ host: 'localhost', user: 'smartdom', password: 'smartdom', database: 'kesorn_db' });
  await conn.query(`
    UPDATE bills 
    SET status = 'Pending', 
        slip_url = '/uploads/slips/slip_13_2_1790568821536_yv66w6.png',
        room_number = '5',
        tenant_id = 1
    WHERE id = 122
  `);
  await conn.end();
  console.log('DB synced: bill 122 set to Pending with slip!');

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

  // 1. Capture TC-12: Owner Slip Verification Modal
  console.log('Capturing TC-12: Owner Slip Verification Modal...');
  await loginAs(page, 'owner');
  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // Find and click the inspect button on the pending bill row
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const targetRow = rows.find(r => r.innerText.includes('1,000') || r.innerText.includes('2026-10-SRV') || r.innerText.includes('รอตรวจ'));
    if (targetRow) {
      const btn = Array.from(targetRow.querySelectorAll('button')).find(b => b.innerText.includes('ตรวจสลิป') || b.innerText.includes('ตรวจสอบ') || b.innerText.includes('🔍'));
      if (btn) btn.click();
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-12_owner_verify_slip_modal.png'), fullPage: false });
  console.log('✓ TC-12 saved!');

  // 2. Capture TC-21: Owner Booking Approval Modal
  console.log('Capturing TC-21: Owner Booking Approval Modal...');
  await page.goto('http://localhost:3001/owner/bookings', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));

  // Filter tab "ทั้งหมด" or find pending card
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, div'));
    const tab = btns.find(b => b.innerText.trim() === 'ทั้งหมด' || b.innerText.includes('ทั้งหมด ('));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Click on "จัดการ" or "ตรวจสอบ & อนุมัติ" or open approve modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const approveBtn = btns.find(b => b.innerText.includes('ตรวจสอบ & อนุมัติ') || b.innerText.includes('อนุมัติ'));
    if (approveBtn) {
      approveBtn.click();
    } else {
      const manageBtn = btns.find(b => b.innerText.includes('จัดการ') || b.innerText.includes('แก้ไข'));
      if (manageBtn) manageBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-21_owner_booking_approval.png'), fullPage: false });
  console.log('✓ TC-21 saved!');

  await browser.close();
  console.log('Done!');
})();
