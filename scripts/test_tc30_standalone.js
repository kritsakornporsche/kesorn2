const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  page.on('dialog', async d => {
    console.log('ALERT DIALOG:', d.message());
    await d.accept();
  });

  await page.goto('http://localhost:3001/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email-input');
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ลูกหอ')).click();
  });
  await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  await page.goto('http://localhost:3001/tenant/move-out', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="date"]');

  // Set date value using evaluate so format is strict YYYY-MM-DD
  await page.evaluate(() => {
    const d = document.querySelector('input[name="date"]');
    d.value = '2026-10-10';
    d.dispatchEvent(new Event('input', { bubbles: true }));
    d.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.type('input[name="phone"]', '081-987-6543');
  await page.type('input[name="promptpayTarget"]', '081-987-6543');
  await page.type('input[name="promptpayName"]', 'สมชาย ใจดี');
  await page.type('input[name="bankName"]', 'ธนาคารกสิกรไทย');
  await page.type('textarea[name="reason"]', 'จบการศึกษา/หมดสัญญาเช่า');

  console.log('Submitting form...');
  await page.click('button[type="submit"]');

  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'd:\\Works\\thesiss\\kesorn\\docs\\tc-28-9\\TC-30_move_out_30days_validation.png' });
  console.log('TC-30 saved!');

  await browser.close();
})();
