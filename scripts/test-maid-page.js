const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  console.log('Navigating to /signin...');
  await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });

  console.log('Logging in as maid...');
  await page.type('#signin-email-input', 'maid');
  await page.type('#signin-password-input', 'maid');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(e => console.log('Nav wait:', e.message));

  console.log('Current URL after login:', page.url());

  if (!page.url().includes('/keeper/maid')) {
    console.log('Navigating to /keeper/maid directly...');
    await page.goto('http://localhost:3001/keeper/maid', { waitUntil: 'networkidle2', timeout: 15000 }).catch(e => console.log('Nav direct:', e.message));
  }

  await new Promise(r => setTimeout(r, 3000));
  console.log('Final URL:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log('Body text:\n', bodyText);

  await page.screenshot({ path: 'd:\\Works\\thesiss\\kesorn\\docs\\tc-28-9\\debug_maid.png' });
  console.log('Screenshot saved to debug_maid.png');

  await browser.close();
})();
