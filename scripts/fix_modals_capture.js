const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const outDir = path.resolve('d:\\Works\\thesiss\\kesorn\\docs\\tc-28-9');

async function directLoginOwner(page) {
  console.log('[AUTH] Direct logging in as owner...');
  await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#signin-email-input', { timeout: 10000 });
  
  // Type username & password
  await page.type('#signin-email-input', 'owner');
  await page.type('#signin-password-input', 'owner');
  
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  console.log('[AUTH] Logged in successfully, URL:', page.url());
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

  await directLoginOwner(page);

  // 1. TC-12: Owner Billing Slip Inspect Modal
  console.log('Navigating to /owner/billing...');
  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Find inspect button on bill with slip or bill #122 / 123
  const clickedInspect = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    // Look for button that says "ตรวจสลิป" or "ตรวจสอบ" or "🔍"
    const inspectBtn = btns.find(b => b.innerText.includes('ตรวจสลิป') || b.innerText.includes('ตรวจสอบ') || b.innerText.includes('🔍 ตรวจสลิป') || b.title?.includes('ตรวจสลิป'));
    if (inspectBtn) {
      inspectBtn.click();
      return true;
    }
    // Try table rows
    const rows = Array.from(document.querySelectorAll('tr'));
    for (const row of rows) {
      if (row.innerText.includes('รอตรวจ') || row.innerText.includes('1,000') || row.innerText.includes('ชำระแล้ว')) {
        const rowBtn = Array.from(row.querySelectorAll('button')).find(b => b.innerText.includes('ตรวจ') || b.innerText.includes('🔍') || b.innerText.includes('ดู'));
        if (rowBtn) {
          rowBtn.click();
          return true;
        }
      }
    }
    return false;
  });

  console.log('Clicked inspect button:', clickedInspect);
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-12_owner_verify_slip_modal.png'), fullPage: false });
  console.log('✓ TC-12 saved: TC-12_owner_verify_slip_modal.png');

  // 2. TC-21: Owner Bookings Approval Modal
  console.log('Navigating to /owner/bookings...');
  await page.goto('http://localhost:3001/owner/bookings', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const clickedApprove = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const approveBtn = btns.find(b => b.innerText.includes('ตรวจสอบ & อนุมัติ') || b.innerText.includes('อนุมัติ'));
    if (approveBtn) {
      approveBtn.click();
      return true;
    }
    return false;
  });

  console.log('Clicked approve button:', clickedApprove);
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-21_owner_booking_approval.png'), fullPage: false });
  console.log('✓ TC-21 saved: TC-21_owner_booking_approval.png');

  // 3. TC-22: Owner Bookings Reject Modal
  // Close approve modal first if open
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.absolute.top-6.right-6, button.text-gray-400');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const clickedReject = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const rejectBtn = btns.find(b => b.innerText.includes('ปฏิเสธ'));
    if (rejectBtn) {
      rejectBtn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked reject button:', clickedReject);
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-22_owner_booking_reject.png'), fullPage: false });
  console.log('✓ TC-22 saved: TC-22_owner_booking_reject.png');

  await browser.close();
  console.log('All 3 modals captured perfectly!');
})();
