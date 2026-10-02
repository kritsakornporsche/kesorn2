const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const roles = [
    { name: 'owner', label: 'เจ้าของหอ', dest: '/owner' },
    { name: 'tenant', label: 'ลูกหอ', dest: '/tenant' },
    { name: 'researcher', label: 'นักวิจัย', dest: '/researcher' },
    { name: 'maid', label: 'แม่บ้าน', dest: '/keeper/maid' },
    { name: 'technician', label: 'ช่างซ่อม', dest: '/keeper/technician' },
    { name: 'admin', label: 'แอดมิน', dest: '/platform' },
    { name: 'guest', label: 'แขก', dest: '/explore' }
  ];

  for (const role of roles) {
    const page = await browser.newPage();
    try {
      await page.goto('http://localhost:3001/signin', { waitUntil: 'networkidle2' });
      
      const buttons = await page.$$('button');
      let targetBtn = null;
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes(role.label)) {
          targetBtn = btn;
          break;
        }
      }

      if (!targetBtn) {
        console.log(`❌ [${role.name}] Button with label "${role.label}" not found`);
        continue;
      }

      await Promise.all([
        targetBtn.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
      ]);

      const currentUrl = page.url();
      const isMatch = currentUrl.includes(role.dest);
      console.log(`${isMatch ? '✅' : '❌'} [${role.name}] Expected: ${role.dest} | Actual: ${currentUrl}`);
    } catch (err) {
      console.log(`❌ [${role.name}] Error: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
})();
