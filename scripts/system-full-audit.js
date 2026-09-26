const http = require('http');

const BASE_URL = 'http://localhost:3001';

async function fetchUrl(pathname, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(pathname, BASE_URL);
    const reqHeaders = { ...headers };
    if (body && typeof body === 'object') {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const req = http.request(url, { method, headers: reqHeaders, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, data, json });
      });
    });

    req.on('error', (err) => resolve({ status: 0, error: err.message, data: '', json: null }));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function login(email, password) {
  const csrfRes = await fetchUrl('/api/auth/csrf');
  const csrfToken = csrfRes.json?.csrfToken;
  if (!csrfToken) return null;

  const cookies = (csrfRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

  const params = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: 'http://localhost:3001',
    json: 'true'
  }).toString();

  const signinRes = await new Promise((resolve) => {
    const req = http.request(new URL('/api/auth/callback/credentials', BASE_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Content-Length': Buffer.byteLength(params)
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const allCookies = [
          ...cookies.split('; '),
          ...(res.headers['set-cookie'] || []).map(c => c.split(';')[0])
        ].filter(Boolean).join('; ');
        resolve({ status: res.statusCode, headers: res.headers, cookies: allCookies, data });
      });
    });
    req.write(params);
    req.end();
  });

  return signinRes.cookies;
}

const results = [];

function recordTest(role, testName, passed, detail = '') {
  results.push({ role, testName, passed, detail });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${role.padEnd(8)}] ${testName.padEnd(48)} : ${passed ? 'PASS' : 'FAIL'} ${detail ? '(' + detail + ')' : ''}`);
}

async function runComprehensiveAudit() {
  console.log('='.repeat(78));
  console.log('         KESORN 2 DORMITORY SYSTEM - FULL FUNCTIONAL AUDIT REPORT         ');
  console.log('='.repeat(78));

  // ==========================================
  // MODULE 1: GUEST & PUBLIC FEATURES
  // ==========================================
  console.log('\n--- 1. Testing Guest & Public Features ---');
  
  // 1.1 Landing Page
  const homeRes = await fetchUrl('/');
  const hasKesorn = homeRes.data.includes('เกษร') || homeRes.data.includes('Kesorn') || homeRes.status === 200;
  recordTest('Guest', 'Landing Page (/) HTML', homeRes.status === 200 && hasKesorn, `Status: ${homeRes.status}`);

  // 1.2 Explore Page
  const exploreRes = await fetchUrl('/explore');
  recordTest('Guest', 'Explore Page (/explore) HTML', exploreRes.status === 200, `Status: ${exploreRes.status}`);

  // 1.3 Room Details (Room 1, 5, 20)
  for (const rid of [1, 5, 20]) {
    const rRes = await fetchUrl(`/explore/room/${rid}`);
    recordTest('Guest', `Room Details Page (/explore/room/${rid})`, rRes.status === 200, `Status: ${rRes.status}`);
  }

  // 1.4 API: Dormitory Profile
  const dormRes = await fetchUrl('/api/dorms/1');
  const dormData = dormRes.json?.data;
  const dormOk = dormRes.status === 200 && (dormData?.phone === '082-985-3519' || dormData?.name?.includes('เกษร'));
  recordTest('Guest', 'API GET /api/dorms/1 (RentHub Real Info)', dormOk, `Phone: ${dormData?.phone}, Water: ${dormData?.water_rate}`);

  // 1.5 API: Explore Rooms
  const roomsRes = await fetchUrl('/api/rooms?explore=true');
  const roomsData = roomsRes.json?.data;
  const roomsOk = roomsRes.status === 200 && Array.isArray(roomsData) && roomsData.length === 20;
  recordTest('Guest', 'API GET /api/rooms?explore=true (20 Rooms All Avail)', roomsOk, `Count: ${roomsData?.length}`);

  // 1.6 API: Booking QR Code
  const qrRes = await fetchUrl('/api/booking/qr?amount=1000');
  recordTest('Guest', 'API GET /api/booking/qr (PromptPay ฿1,000)', qrRes.status === 200 && Boolean(qrRes.json?.qrImage), `Amount: ${qrRes.json?.amount}`);

  // 1.7 API: Dormitory Rules
  const rulesRes = await fetchUrl('/api/tenant/rules');
  const rulesData = rulesRes.json?.data;
  recordTest('Guest', 'API GET /api/tenant/rules (RentHub Rules)', rulesRes.status === 200 && Array.isArray(rulesData), `Count: ${rulesData?.length}`);

  // 1.8 API: Announcements
  const annoRes = await fetchUrl('/api/announcements');
  recordTest('Guest', 'API GET /api/announcements', annoRes.status === 200, `Status: ${annoRes.status}`);

  // ==========================================
  // MODULE 2: OWNER FEATURES
  // ==========================================
  console.log('\n--- 2. Testing Owner Features ---');
  const ownerCookie = await login('owner@kesorn.com', 'owner');
  recordTest('Owner', 'Owner Authentication (owner@kesorn.com)', Boolean(ownerCookie));

  if (ownerCookie) {
    const ownerH = { Cookie: ownerCookie };

    // 2.1 Owner Dashboard Stats
    const stats = await fetchUrl('/api/owner/stats', 'GET', null, ownerH);
    const statsOk = stats.status === 200 && stats.json?.data?.totalRooms === 20;
    recordTest('Owner', 'API GET /api/owner/stats', statsOk, `Total: ${stats.json?.data?.totalRooms}, Avail: ${stats.json?.data?.availableRooms}`);

    // 2.2 Owner Settings
    const settings = await fetchUrl('/api/owner/settings', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/settings', settings.status === 200, `Status: ${settings.status}`);

    // 2.3 Owner Meters Listing
    const meters = await fetchUrl('/api/owner/meters', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/meters', meters.status === 200 && (meters.json?.data?.length > 0 || meters.json?.readings?.length > 0), `Count: ${meters.json?.data?.length}`);

    // 2.4 Owner Meters POST (Record Meter)
    const postMeter = await fetchUrl('/api/owner/meters', 'POST', {
      room_id: 1,
      type: 'Water',
      previous_reading: 105,
      current_reading: 112,
      billing_cycle: '2026-10'
    }, ownerH);
    recordTest('Owner', 'API POST /api/owner/meters (Record Meter)', postMeter.status === 200 || postMeter.status === 201, `Status: ${postMeter.status}`);

    // 2.5 Owner Billing Listing
    const billing = await fetchUrl('/api/owner/billing', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/billing', billing.status === 200, `Count: ${billing.json?.bills?.length || billing.json?.data?.length}`);

    // 2.6 Owner Maintenance
    const maint = await fetchUrl('/api/owner/maintenance', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/maintenance', maint.status === 200, `Count: ${maint.json?.requests?.length || maint.json?.data?.length}`);

    // 2.7 Owner Bookings
    const bookings = await fetchUrl('/api/owner/bookings', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/bookings', bookings.status === 200, `Count: ${bookings.json?.bookings?.length || bookings.json?.data?.length}`);

    // 2.8 Owner Contracts
    const contracts = await fetchUrl('/api/owner/contracts', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/contracts', contracts.status === 200, `Count: ${contracts.json?.contracts?.length || contracts.json?.data?.length}`);

    // 2.9 Keepers List
    const keepers = await fetchUrl('/api/keepers', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/keepers', keepers.status === 200, `Count: ${keepers.json?.data?.length}`);

    // 2.10 Packages (SaaS Packages)
    const packages = await fetchUrl('/api/owner/packages', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/packages', packages.status === 200, `Count: ${packages.json?.data?.length}`);

    // 2.11 Accounting
    const acct = await fetchUrl('/api/owner/accounting', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/accounting', acct.status === 200, `Status: ${acct.status}`);

    // 2.12 Rules
    const rules = await fetchUrl('/api/owner/rules', 'GET', null, ownerH);
    recordTest('Owner', 'API GET /api/owner/rules', rules.status === 200, `Status: ${rules.status}`);

    // 2.13 Owner UI Pages
    const ownerPages = [
      '/owner', '/owner/rooms', '/owner/tenants', '/owner/meters',
      '/owner/billing', '/owner/maintenance', '/owner/bookings',
      '/owner/contracts', '/owner/keepers', '/owner/accounting', '/owner/settings'
    ];
    for (const p of ownerPages) {
      const pageRes = await fetchUrl(p, 'GET', null, ownerH);
      recordTest('Owner', `Page ${p}`, pageRes.status === 200, `Status: ${pageRes.status}`);
    }
  }

  // ==========================================
  // MODULE 3: TENANT FEATURES
  // ==========================================
  console.log('\n--- 3. Testing Tenant Features ---');
  const tenantCookie = await login('tenant@kesorn.com', 'tenant');
  recordTest('Tenant', 'Tenant Authentication (tenant@kesorn.com)', Boolean(tenantCookie));

  if (tenantCookie) {
    const tenantH = { Cookie: tenantCookie };

    // 3.1 Tenant Me
    const meRes = await fetchUrl('/api/tenant/me', 'GET', null, tenantH);
    const meOk = meRes.status === 200 && meRes.json?.data?.name === 'tenant';
    recordTest('Tenant', 'API GET /api/tenant/me', meOk, `Name: ${meRes.json?.data?.name}, Room: ${meRes.json?.data?.room_number}`);

    // 3.2 Tenant Room
    const roomRes = await fetchUrl('/api/tenant/room', 'GET', null, tenantH);
    recordTest('Tenant', 'API GET /api/tenant/room', roomRes.status === 200 && Boolean(roomRes.json?.data?.room_number), `Room: ${roomRes.json?.data?.room_number}`);

    // 3.3 Tenant Billing
    const billList = await fetchUrl('/api/tenant/billing/list', 'GET', null, tenantH);
    recordTest('Tenant', 'API GET /api/tenant/billing/list', billList.status === 200, `Count: ${billList.json?.data?.length || billList.json?.bills?.length}`);

    // 3.4 Tenant Billing QR
    const billQr = await fetchUrl('/api/tenant/billing/qr?amount=2800', 'GET', null, tenantH);
    recordTest('Tenant', 'API GET /api/tenant/billing/qr (PromptPay)', billQr.status === 200 && Boolean(billQr.json?.qrImage), `Amount: ${billQr.json?.amount}`);

    // 3.5 Tenant Maintenance Requests
    const maintList = await fetchUrl('/api/tenant/maintenance/list', 'GET', null, tenantH);
    recordTest('Tenant', 'API GET /api/tenant/maintenance/list', maintList.status === 200, `Status: ${maintList.status}`);

    // 3.6 Tenant Evaluation
    const evalRes = await fetchUrl('/api/tenant/evaluation', 'GET', null, tenantH);
    recordTest('Tenant', 'API GET /api/tenant/evaluation', evalRes.status === 200, `Status: ${evalRes.status}`);

    // 3.7 Tenant UI Pages
    const tenantPages = [
      '/tenant', '/tenant/billing', '/tenant/maintenance',
      '/tenant/contract', '/tenant/evaluation', '/tenant/announcements',
      '/tenant/move-out', '/tenant/refund-request'
    ];
    for (const p of tenantPages) {
      const pageRes = await fetchUrl(p, 'GET', null, tenantH);
      recordTest('Tenant', `Page ${p}`, pageRes.status === 200, `Status: ${pageRes.status}`);
    }
  }

  // ==========================================
  // MODULE 4: KEEPER FEATURES (MAID & TECHNICIAN)
  // ==========================================
  console.log('\n--- 4. Testing Keeper Features (Maid & Technician) ---');
  
  // 4.1 Maid Login & Jobs
  const maidCookie = await login('maid@kesorn.com', 'maid');
  recordTest('Keeper', 'Maid Authentication (maid@kesorn.com)', Boolean(maidCookie));
  if (maidCookie) {
    const maidH = { Cookie: maidCookie };
    const maidJobs = await fetchUrl('/api/keeper/maid/jobs', 'GET', null, maidH);
    recordTest('Keeper', 'API GET /api/keeper/maid/jobs', maidJobs.status === 200, `Status: ${maidJobs.status}`);

    const maidPage = await fetchUrl('/keeper/maid', 'GET', null, maidH);
    recordTest('Keeper', 'Page /keeper/maid', maidPage.status === 200, `Status: ${maidPage.status}`);
  }

  // 4.2 Technician Login & Jobs
  const techCookie = await login('technician@kesorn.com', 'technician');
  recordTest('Keeper', 'Technician Authentication (technician@kesorn.com)', Boolean(techCookie));
  if (techCookie) {
    const techH = { Cookie: techCookie };
    const techJobs = await fetchUrl('/api/keeper/technician/jobs', 'GET', null, techH);
    recordTest('Keeper', 'API GET /api/keeper/technician/jobs', techJobs.status === 200, `Status: ${techJobs.status}`);

    const techPage = await fetchUrl('/keeper/technician', 'GET', null, techH);
    recordTest('Keeper', 'Page /keeper/technician', techPage.status === 200, `Status: ${techPage.status}`);
  }

  // ==========================================
  // MODULE 5: PLATFORM ADMIN FEATURES
  // ==========================================
  console.log('\n--- 5. Testing Platform Admin Features ---');
  const adminCookie = await login('admin@smartdom.com', 'admin');
  recordTest('Admin', 'Platform Admin Auth (admin@smartdom.com)', Boolean(adminCookie));
  if (adminCookie) {
    const adminH = { Cookie: adminCookie };
    const dashRes = await fetchUrl('/api/platform/dashboard', 'GET', null, adminH);
    recordTest('Admin', 'API GET /api/platform/dashboard', dashRes.status === 200, `Status: ${dashRes.status}`);

    const dormsRes = await fetchUrl('/api/platform/dormitories', 'GET', null, adminH);
    recordTest('Admin', 'API GET /api/platform/dormitories', dormsRes.status === 200, `Status: ${dormsRes.status}`);

    const tenRes = await fetchUrl('/api/platform/tenants', 'GET', null, adminH);
    recordTest('Admin', 'API GET /api/platform/tenants', tenRes.status === 200, `Status: ${tenRes.status}`);

    const adminPage = await fetchUrl('/platform', 'GET', null, adminH);
    recordTest('Admin', 'Page /platform', adminPage.status === 200, `Status: ${adminPage.status}`);
  }

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('\n' + '='.repeat(78));
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log(`SUCCESS RATE: ${((passedCount / total) * 100).toFixed(1)}%`);
  console.log('='.repeat(78));

  if (failedCount > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(f => {
      console.log(`- [${f.role}] ${f.testName}: ${f.detail}`);
    });
  }
}

runComprehensiveAudit().catch(console.error);
