const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const outDir = path.resolve('d:\\Works\\thesiss\\kesorn\\docs\\tc-28-9');
const sampleSignedPdf = path.resolve('d:\\Works\\thesiss\\kesorn\\scratch\\sample_contract_signed.png');

// Create a dummy image for contract signed file if not exists
if (!fs.existsSync(sampleSignedPdf)) {
  fs.copyFileSync('d:\\Works\\thesiss\\kesorn\\scratch\\real_slip_1000.png', sampleSignedPdf);
}

async function loginFast(page, username) {
  console.log(`[AUTH] Fast logging in as ${username}...`);
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
    if (roleBtn) {
      roleBtn.click();
      return;
    }
  }, username);

  await new Promise(r => setTimeout(r, 2500));
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

  // =========================================================================
  // 1. TC-04: Owner Add Room (Submit and show room 101 in rooms list)
  // =========================================================================
  console.log('--- Step: TC-04 Add Room ---');
  await loginFast(page, 'owner');
  await page.goto('http://localhost:3001/owner/rooms', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Open Add Room Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addBtn = btns.find(b => b.innerText.includes('เพิ่มห้องพัก') || b.innerText.includes('เพิ่มยูนิต'));
    if (addBtn) addBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Fill in room 101, 4500 THB and submit
  await page.evaluate(() => {
    const roomInp = document.querySelector('input[placeholder*="101"], input[name="room_number"]');
    const priceInp = document.querySelector('input[placeholder*="4500"], input[name="price"]');
    if (roomInp) { roomInp.value = '101'; roomInp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (priceInp) { priceInp.value = '4500'; priceInp.dispatchEvent(new Event('input', { bubbles: true })); }

    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('บันทึกข้อมูล') || b.innerText.includes('บันทึกห้อง'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Screenshot of rooms list showing room 101 created!
  await page.screenshot({ path: path.join(outDir, 'TC-04_owner_rooms_list.png'), fullPage: false });
  console.log('✓ TC-04 saved!');

  // =========================================================================
  // 2. TC-05: Owner Edit Room (Change room 101 price to 4,600 THB and save)
  // =========================================================================
  console.log('--- Step: TC-05 Edit Room ---');
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.rounded-\\[2\\.5rem\\], tr, div.border'));
    const room101 = cards.find(c => c.innerText.includes('101'));
    if (room101) {
      const editBtn = Array.from(room101.querySelectorAll('button')).find(b => b.innerText.includes('แก้ไข') || b.title?.includes('แก้ไข'));
      if (editBtn) editBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const priceInp = document.querySelector('input[placeholder*="4500"], input[name="price"]');
    if (priceInp) { priceInp.value = '4600'; priceInp.dispatchEvent(new Event('input', { bubbles: true })); }
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('บันทึกการแก้ไข') || b.innerText.includes('บันทึก'));
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Screenshot of rooms list showing updated price ฿4,600
  await page.screenshot({ path: path.join(outDir, 'TC-05_owner_room_management.png'), fullPage: false });
  console.log('✓ TC-05 saved!');

  // =========================================================================
  // 3. TC-07: Owner Contracts Active with Attached Signed Contract
  // =========================================================================
  console.log('--- Step: TC-07 Owner Contracts Active ---');
  await page.goto('http://localhost:3001/owner/contracts', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Check if there is "แนบไฟล์สัญญา" or "ดูไฟล์สัญญา"
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.rounded-\\[2\\.5rem\\], tr, div.border'));
    const target = cards[0];
    if (target) {
      const uploadBtn = Array.from(target.querySelectorAll('button')).find(b => b.innerText.includes('แนบไฟล์') || b.innerText.includes('ดูสัญญา'));
      if (uploadBtn) uploadBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  const uploadInput = await page.$('input[type="file"]');
  if (uploadInput) {
    await uploadInput.uploadFile(sampleSignedPdf);
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('บันทึกไฟล์') || b.innerText.includes('อัปโหลด'));
      if (saveBtn) saveBtn.click();
    });
    await new Promise(r => setTimeout(r, 2500));
  }

  // Screenshot contracts list showing "ดูสัญญาที่เซ็นแล้ว"
  await page.screenshot({ path: path.join(outDir, 'TC-07_owner_contracts_active.png'), fullPage: false });
  console.log('✓ TC-07 saved!');

  // =========================================================================
  // 4. TC-24: Export Receipt Modal (Paid booking/monthly bill with matching numbers)
  // =========================================================================
  console.log('--- Step: TC-24 Export Receipt Modal ---');
  await page.goto('http://localhost:3001/owner/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Open receipt for Paid bill #123 (Room 2 - ฿1,000 paid)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const targetRow = rows.find(r => r.innerText.includes('123') || (r.innerText.includes('1,000') && r.innerText.includes('ชำระแล้ว')));
    if (targetRow) {
      const receiptBtn = Array.from(targetRow.querySelectorAll('button')).find(b => b.title?.includes('ใบเสร็จ') || b.title?.includes('ใบแจ้งหนี้') || b.innerHTML.includes('M9 12h6'));
      if (receiptBtn) receiptBtn.click();
    } else {
      // Click any receipt icon
      const anyReceiptBtn = document.querySelector('button[title*="ใบแจ้งหนี้"], button[title*="ใบเสร็จ"]');
      if (anyReceiptBtn) anyReceiptBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-24_export_receipt_modal.png'), fullPage: false });
  console.log('✓ TC-24 saved!');

  // Close receipt modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button.p-2.text-muted-foreground, button[aria-label="Close"]');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // =========================================================================
  // 5. TC-12: Owner Verify Slip Modal (Open inspect on bill 122)
  // =========================================================================
  console.log('--- Step: TC-12 Owner Verify Slip Modal ---');
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const targetRow = rows.find(r => r.innerText.includes('รอตรวจ') || r.innerText.includes('122'));
    if (targetRow) {
      const inspectBtn = Array.from(targetRow.querySelectorAll('button')).find(b => b.innerText.includes('ตรวจสลิป') || b.innerText.includes('ดูสลิป'));
      if (inspectBtn) inspectBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-12_owner_verify_slip_modal.png'), fullPage: false });
  console.log('✓ TC-12 saved!');

  // Close modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button.p-2.text-muted-foreground, button[aria-label="Close"]');
    if (closeBtn) closeBtn.click();
  });

  // =========================================================================
  // 6. TC-29: Owner Service Billing (Filter "ค่าซ่อม/ทำความสะอาด" and scroll to bill)
  // =========================================================================
  console.log('--- Step: TC-29 Owner Service Billing ---');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const serviceTab = btns.find(b => b.innerText.includes('ค่าซ่อม') || b.innerText.includes('ทำความสะอาด'));
    if (serviceTab) serviceTab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Scroll to table
  await page.evaluate(() => {
    const tbl = document.querySelector('table, div.overflow-x-auto');
    if (tbl) tbl.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'TC-29_owner_service_billing.png'), fullPage: false });
  console.log('✓ TC-29 saved!');

  // =========================================================================
  // 7. SEC-01: Real Browser URL Redirect (Showing URL bar with /signin?callbackUrl=%2Fowner)
  // =========================================================================
  console.log('--- Step: SEC-01 Real Browser Redirect ---');
  // Log out and hit /owner
  await page.goto('http://localhost:3001/api/auth/signout', { waitUntil: 'domcontentloaded' });
  await page.goto('http://localhost:3001/owner', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(outDir, 'SEC-01_unauthenticated_route_redirect.png'), fullPage: false });
  console.log('✓ SEC-01 saved!');

  await browser.close();
  console.log('\n🎉 ALL REFINED SCREENSHOTS COMPLETED!');
})();
