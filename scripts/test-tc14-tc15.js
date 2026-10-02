const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // 1. Sign in as technician
  console.log('Navigating to signin...');
  await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });
  await page.type('#signin-email-input', 'technician');
  await page.type('#signin-password-input', 'technician');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  if (!page.url().includes('/keeper/technician')) {
    await page.goto('http://localhost:3001/keeper/technician', { waitUntil: 'networkidle2' });
  }

  await new Promise(r => setTimeout(r, 2000));
  console.log('On technician page:', page.url());

  // Look for job #56 or Room 5
  // Find "รับงานซ่อม" button corresponding to Room 5 "ก๊อกน้ำรั่ว"
  const buttons = await page.$$('button');
  console.log('Total buttons found:', buttons.length);

  // Let's click "รับงานซ่อม" for job #56 (Room 5)
  const clicked = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.divide-y > div'));
    for (const card of cards) {
      if (card.innerText.includes('ก๊อกน้ำรั่ว') || card.innerText.includes('TC-13')) {
        const btn = card.querySelector('button');
        if (btn) {
          btn.click();
          return 'Clicked accept button';
        }
      }
    }
    return 'Not found';
  });
  console.log('Accept button result:', clicked);

  await new Promise(r => setTimeout(r, 2000));

  // Now card should say "ซ่อมเสร็จแล้ว"
  const clickedFinish = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.divide-y > div'));
    for (const card of cards) {
      if (card.innerText.includes('ก๊อกน้ำรั่ว') || card.innerText.includes('TC-13')) {
        const btn = card.querySelector('button');
        if (btn && btn.innerText.includes('ซ่อมเสร็จแล้ว')) {
          btn.click();
          return 'Clicked finish button';
        }
      }
    }
    return 'Finish button not found';
  });
  console.log('Finish button result:', clickedFinish);

  await new Promise(r => setTimeout(r, 1500));

  // In modal, fill notes and submit
  const modalHandled = await page.evaluate(() => {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.value = 'เปลี่ยนลูกยางและเทปพันเกลียวก๊อกน้ำเรียบร้อยแล้ว ทดสอบการไหลของน้ำไม่พบการรั่วซึม (เสร็จสิ้น TC-14)';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const modalButtons = Array.from(document.querySelectorAll('.fixed button'));
    for (const b of modalButtons) {
      if (b.innerText.includes('ยืนยัน') || b.innerText.includes('ส่งมอบ')) {
        b.click();
        return 'Modal confirm clicked';
      }
    }
    return 'Modal button not found';
  });
  console.log('Modal action result:', modalHandled);

  await new Promise(r => setTimeout(r, 3000));

  // Capture TC-14 screenshot on technician page
  await page.screenshot({ path: 'd:\\Works\\thesiss\\kesorn\\docs\\tc-28-9\\TC-14_technician_job.png', fullPage: false });
  console.log('TC-14 screenshot saved!');

  // Now 2. Verify in Owner Maintenance page (TC-15)
  console.log('Navigating to signin as owner...');
  await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });
  await page.type('#signin-email-input', 'owner');
  await page.type('#signin-password-input', 'owner');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await page.goto('http://localhost:3001/owner/maintenance', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));

  await page.screenshot({ path: 'd:\\Works\\thesiss\\kesorn\\docs\\tc-28-9\\TC-15_maintenance_completed.png', fullPage: false });
  console.log('TC-15 screenshot saved!');

  await browser.close();
})();
