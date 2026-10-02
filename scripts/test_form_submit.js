const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });
  
  await page.type('#signin-email-input', 'owner');
  await page.type('#signin-password-input', 'owner');
  await page.click('form button[type="submit"]');

  await new Promise(r => setTimeout(r, 6000));
  console.log('Final Page URL after form submit:', page.url());

  await browser.close();
})();
