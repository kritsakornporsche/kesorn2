const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const outDir = 'd:\\Works\\thesiss\\kesorn\\docs\\tc-28-9';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Sign in as technician
  console.log('--- Step 1: Sign in as technician ---');
  await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });
  await page.type('#signin-email-input', 'technician');
  await page.type('#signin-password-input', 'technician');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  if (!page.url().includes('/keeper/technician')) {
    await page.goto('http://localhost:3001/keeper/technician', { waitUntil: 'networkidle2' });
  }
  await new Promise(r => setTimeout(r, 2000));

  // Find job #56 or Room 5
  console.log('Looking for job on technician page...');
  const finishClicked = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.divide-y > div'));
    for (const card of cards) {
      if (card.innerText.includes('ก๊อกน้ำรั่ว') || card.innerText.includes('TC-13') || card.innerText.includes('ห้อง 5')) {
        const btn = card.querySelector('button');
        if (btn) {
          btn.click();
          return `Clicked: ${btn.innerText}`;
        }
      }
    }
    return 'Not found';
  });
  console.log('Finish click result:', finishClicked);

  await new Promise(r => setTimeout(r, 1500));

  // If modal opened (isFinishing), fill notes and click "บันทึกซ่อมเสร็จสิ้น"
  const modalSubmit = await page.evaluate(() => {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.value = 'เปลี่ยนลูกยางและเทปพันเกลียวก๊อกน้ำเรียบร้อยแล้ว ทดสอบการไหลของน้ำไม่พบการรั่วซึม (งานเสร็จสมบูรณ์)';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const b of buttons) {
      if (b.innerText.includes('บันทึกซ่อมเสร็จสิ้น')) {
        b.click();
        return 'Clicked บันทึกซ่อมเสร็จสิ้น';
      }
    }
    return 'Submit button not found';
  });
  console.log('Modal submit result:', modalSubmit);

  await new Promise(r => setTimeout(r, 2500));

  // Select "ซ่อมเสร็จแล้ว" tab or filter to show the completed job clearly
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const completedTab = buttons.find(b => b.innerText.trim() === 'ซ่อมเสร็จแล้ว' || b.innerText.trim() === 'ทั้งหมด');
    if (completedTab) completedTab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Capture TC-14
  await page.screenshot({
    path: path.join(outDir, 'TC-14_technician_job.png'),
    fullPage: false
  });
  console.log('Saved TC-14_technician_job.png');

  // 2. Sign in as owner to confirm and view maintenance page (TC-15)
  console.log('--- Step 2: Sign in as owner / view tenant maintenance (TC-15) ---');
  await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });
  await page.type('#signin-email-input', 'owner');
  await page.type('#signin-password-input', 'owner');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await page.goto('http://localhost:3001/owner/maintenance', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));

  await page.screenshot({
    path: path.join(outDir, 'TC-15_maintenance_owner.png'),
    fullPage: false
  });
  console.log('Saved TC-15_maintenance_owner.png');

  // Also capture tenant view of completed maintenance
  console.log('--- Step 3: Sign in as tenant to verify completed status (TC-15) ---');
  await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });
  await page.type('#signin-email-input', 'tenant');
  await page.type('#signin-password-input', 'tenant');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await page.goto('http://localhost:3001/tenant/maintenance', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));

  await page.screenshot({
    path: path.join(outDir, 'TC-15_maintenance_completed.png'),
    fullPage: false
  });
  console.log('Saved TC-15_maintenance_completed.png');

  await browser.close();
  console.log('TC-14 and TC-15 complete!');
})();
