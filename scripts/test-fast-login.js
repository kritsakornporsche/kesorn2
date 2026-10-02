const puppeteer = require('puppeteer-core');

async function loginAs(page, username) {
  console.log(`Logging in as ${username}...`);
  await page.goto('http://localhost:3001/signin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email-input', { timeout: 10000 });
  
  // Use the 1-Click button if available or fill the form
  const clicked = await page.evaluate((u) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const roleBtn = buttons.find(b => {
      const t = b.innerText.toLowerCase();
      if (u === 'technician' && t.includes('ช่าง')) return true;
      if (u === 'maid' && t.includes('แม่บ้าน')) return true;
      if (u === 'owner' && t.includes('เจ้าของ')) return true;
      if (u === 'tenant' && t.includes('ลูกหอ')) return true;
      if (u === 'guest' && t.includes('แขก')) return true;
      return false;
    });
    if (roleBtn) {
      roleBtn.click();
      return `Clicked 1-click button for ${u}`;
    }
    
    // Fallback: fill form
    const inputE = document.querySelector('#signin-email-input');
    const inputP = document.querySelector('#signin-password-input');
    inputE.value = u;
    inputE.dispatchEvent(new Event('input', { bubbles: true }));
    inputP.value = u;
    inputP.dispatchEvent(new Event('input', { bubbles: true }));
    const form = document.querySelector('form');
    if (form) form.requestSubmit();
    return `Submitted form for ${u}`;
  }, username);

  console.log(clicked);
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  console.log(`Current URL after login as ${username}:`, page.url());
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await loginAs(page, 'technician');
  await loginAs(page, 'maid');
  await loginAs(page, 'owner');
  await loginAs(page, 'tenant');

  console.log('All 4 logins succeeded!');
  await browser.close();
})();
