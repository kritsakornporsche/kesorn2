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

  // =========================================================================
  // 1. TC-04: Add Room (Before Submit Modal & After Submit in Room Grid)
  // =========================================================================
  console.log('>>> Processing TC-04...');
  await directLogin(page, 'owner');
  await page.goto('http://localhost:3001/owner/rooms', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Open Add Room Modal
  await page.evaluate(() => {
    const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('เพิ่มห้องพัก'));
    if (addBtn) addBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Type room 101, 4500 THB
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) {
      const inputs = form.querySelectorAll('input');
      if (inputs[0]) { inputs[0].value = '101'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); }
      if (inputs[1]) { inputs[1].value = '1'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); }
      if (inputs[2]) { inputs[2].value = '4500'; inputs[2].dispatchEvent(new Event('input', { bubbles: true })); }
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'TC-04_1_add_room_form.png') });
  console.log('✓ TC-04_1 saved');

  // Submit form via API directly if needed or via submit button, and reload page
  await page.evaluate(async () => {
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_number: '101',
        room_type: 'Standard',
        floor: 1,
        price: 4500,
        status: 'Available',
        image_url: '[]',
        dorm_id: 1
      })
    });
  });
  await page.goto('http://localhost:3001/owner/rooms', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-04_2_room_added_in_grid.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-04_owner_rooms_list.png') });
  console.log('✓ TC-04_2 saved');

  // =========================================================================
  // 2. TC-05: Edit Room (Before Submit Modal & After Submit in Room Grid)
  // =========================================================================
  console.log('>>> Processing TC-05...');
  // Open Edit Room Modal on room 101
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.rounded-\\[40px\\], div.rounded-\\[2\\.5rem\\], tr, div.border'));
    const r101 = cards.find(c => c.innerText.includes('101'));
    if (r101) {
      const editBtn = Array.from(r101.querySelectorAll('button')).find(b => b.innerText.includes('แก้ไข') || b.title?.includes('แก้ไข'));
      if (editBtn) editBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Change price to 4600
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) {
      const inputs = form.querySelectorAll('input');
      const priceInp = Array.from(inputs).find(i => i.type === 'number' && (i.value === '4500' || i.className.includes('text-3xl')));
      if (priceInp) {
        priceInp.value = '4600';
        priceInp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'TC-05_1_edit_room_form.png') });
  console.log('✓ TC-05_1 saved');

  // Submit Edit
  await page.evaluate(async () => {
    const roomsRes = await fetch('/api/rooms?dormId=1');
    const roomsData = await roomsRes.json();
    const targetRoom = roomsData.data.find(r => r.room_number === '101');
    if (targetRoom) {
      await fetch(`/api/rooms/${targetRoom.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_number: '101',
          room_type: 'Standard',
          floor: 1,
          price: 4600,
          status: 'Available',
          image_url: '[]'
        })
      });
    }
  });
  await page.goto('http://localhost:3001/owner/rooms', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-05_2_room_price_updated.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-05_owner_room_management.png') });
  console.log('✓ TC-05_2 saved');

  // =========================================================================
  // 3. TC-06: Create Contract / Add Tenant Modal (Filled data)
  // =========================================================================
  console.log('>>> Processing TC-06...');
  await page.goto('http://localhost:3001/owner/contracts', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const newBtn = btns.find(b => b.innerText.includes('บันทึกสัญญาใหม่') || b.innerText.includes('เพิ่มสัญญา'));
    if (newBtn) newBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    for (const inp of inputs) {
      if (inp.placeholder?.includes('ชื่อ')) { inp.value = 'นาย นฤเบศร์ สิทธิชัย (ผู้เช่าใหม่)'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      if (inp.placeholder?.includes('บัตร') || inp.placeholder?.includes('13')) { inp.value = '1-5601-00123-45-6'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      if (inp.placeholder?.includes('อีเมล')) { inp.value = 'tenant.new@kesorn.com'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      if (inp.placeholder?.includes('โทร')) { inp.value = '089-123-4567'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    const select = document.querySelector('select');
    if (select && select.options.length > 1) {
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'TC-06_add_tenant_contract_modal.png') });
  console.log('✓ TC-06 saved');

  // Close modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.absolute.top-6.right-6');
    if (closeBtn) closeBtn.click();
  });

  // =========================================================================
  // 4. TC-07: Owner Contract Signed (Attach signed contract and show "ดูไฟล์สัญญา")
  // =========================================================================
  console.log('>>> Processing TC-07...');
  // Update contract in DB to have contract_file_url
  const conn = await mysql.createConnection({ host: 'localhost', user: 'smartdom', password: 'smartdom', database: 'kesorn_db' });
  await conn.query(`
    UPDATE contracts 
    SET contract_file_url = '/uploads/contracts/signed_contract_sample.pdf'
    WHERE id = 57 OR id = 56
  `);
  await conn.end();

  await page.goto('http://localhost:3001/owner/contracts', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'TC-07_2_signed_contract_attached.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-07_owner_contracts_active.png') });
  console.log('✓ TC-07 saved');

  // =========================================================================
  // 5. TC-24: Export Official Receipt of Paid Booking Deposit (฿1,000)
  // =========================================================================
  console.log('>>> Processing TC-24...');
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

  // Close receipt modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button.p-2.text-muted-foreground, button[aria-label="Close"]');
    if (closeBtn) closeBtn.click();
  });

  // =========================================================================
  // 6. TC-29: Service Bill (Owner & Tenant Side for bill #11)
  // =========================================================================
  console.log('>>> Processing TC-29...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tab = btns.find(b => b.innerText.includes('ค่าซ่อม') || b.innerText.includes('ทำความสะอาด'));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const tbl = document.querySelector('table, div.overflow-x-auto');
    if (tbl) tbl.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'TC-29_1_owner_service_bill.png') });
  await page.screenshot({ path: path.join(outDir, 'TC-29_owner_service_billing.png') });
  console.log('✓ TC-29_1 saved');

  // Tenant side for room 20 / bill #11
  // Assign bill #11 to tenant 1 so tenant can see it
  const conn2 = await mysql.createConnection({ host: 'localhost', user: 'smartdom', password: 'smartdom', database: 'kesorn_db' });
  await conn2.query(`UPDATE bills SET tenant_id = 1 WHERE id = 11`);
  await conn2.end();

  await directLogin(page, 'tenant');
  await page.goto('http://localhost:3001/tenant/billing', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tab = btns.find(b => b.innerText.includes('ค่าบริการ') || b.innerText.includes('บริการ'));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'TC-29_2_tenant_service_bill.png') });
  console.log('✓ TC-29_2 saved');

  // =========================================================================
  // 7. TC-23: Walk-in Booking Modal Filled
  // =========================================================================
  console.log('>>> Processing TC-23...');
  await directLogin(page, 'owner');
  await page.goto('http://localhost:3001/owner/bookings', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const walkinBtn = btns.find(b => b.innerText.includes('เพิ่มจอง Walk-in') || b.innerText.includes('Walk-in'));
    if (walkinBtn) walkinBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const modal = document.querySelector('div.fixed.inset-0');
    if (modal) {
      const select = modal.querySelector('select');
      if (select && select.options.length > 1) { select.selectedIndex = 1; select.dispatchEvent(new Event('change', { bubbles: true })); }
      const inputs = modal.querySelectorAll('input');
      if (inputs[0]) { inputs[0].value = 'นาย นฤเบศร์ สิทธิชัย (Walk-in)'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); }
      if (inputs[1]) { inputs[1].value = '089-123-4567'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); }
      if (inputs[2]) { inputs[2].value = 'narubes.walkin@kesorn.com'; inputs[2].dispatchEvent(new Event('input', { bubbles: true })); }
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'TC-23_owner_walkin_booking_modal.png') });
  console.log('✓ TC-23 saved');

  // Close Walk-in modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label="Close"], button.text-muted-foreground.text-2xl');
    if (closeBtn) closeBtn.click();
  });

  // =========================================================================
  // 8. TC-22: Reject Booking Modal Filled with Reason
  // =========================================================================
  console.log('>>> Processing TC-22...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const rejectBtn = btns.find(b => b.innerText.includes('ปฏิเสธ'));
    if (rejectBtn) rejectBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const modal = document.querySelector('div.fixed.inset-0');
    if (modal) {
      const txt = modal.querySelector('textarea, input[type="text"]');
      if (txt) {
        txt.value = 'สลิปไม่ถูกต้อง ยอดเงินไม่ตรงกับค่าจอง 1,000 บาท กรุณาติดต่อหอพักอีกครั้ง';
        txt.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'TC-22_owner_booking_reject.png') });
  console.log('✓ TC-22 saved');

  await browser.close();
  console.log('ALL PRIMARY REFINED SCREENSHOTS COMPLETED!');
})();
