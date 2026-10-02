const puppeteer = require('puppeteer');

async function getTenantCookie() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('https://kesorn.phannext.com/signin', { waitUntil: 'networkidle2' });
  await page.type('#email', 'tenant@kesorn.com');
  await page.type('#password', 'password123');
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
  ]);
  const cookies = await page.cookies();
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log('COOKIE_STR:', cookieStr);
  await browser.close();
}

getTenantCookie().catch(console.error);
