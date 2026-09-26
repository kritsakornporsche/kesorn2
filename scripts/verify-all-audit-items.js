const http = require('http');

const BASE = 'http://localhost:3001';

async function fetchNoRedirect(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: 'manual' });
  return {
    status: res.status,
    headers: res.headers,
    location: res.headers.get('location'),
    text: async () => res.text(),
    json: async () => res.json(),
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 VERIFYING ALL KESORN 2 AUDIT ITEMS (2026-09-26)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: SEC-01 Unauthenticated Redirects
  // ----------------------------------------------------
  console.log('📋 1. Testing SEC-01 (Unauthenticated access redirects to /signin)');
  for (const path of ['/owner', '/tenant', '/keeper', '/platform']) {
    const res = await fetchNoRedirect(BASE + path);
    const isRedirect = [302, 307, 308].includes(res.status);
    const location = res.location || '';
    assert(isRedirect && location.includes('/signin'), `${path} returns ${res.status} redirecting to ${location}`);
  }

  // ----------------------------------------------------
  // TEST 2: SEC-02 Owner APIs return 401/403 for unauthorized
  // ----------------------------------------------------
  console.log('\n📋 2. Testing SEC-02 (Owner APIs 401 when unauthenticated)');
  for (const apiPath of ['/api/owner/stats', '/api/tenants', '/api/owner/meters', '/api/owner/accounting']) {
    const res = await fetch(BASE + apiPath);
    assert(res.status === 401 || res.status === 403, `${apiPath} returns HTTP ${res.status}`);
  }

  // ----------------------------------------------------
  // TEST 3: Dev reset button removed from /tenant
  // ----------------------------------------------------
  console.log('\n📋 3. Testing Dev Reset Button removed from /tenant');
  const fs = require('fs');
  const tenantPage = fs.readFileSync('app/tenant/page.tsx', 'utf8');
  assert(!tenantPage.includes('ResetAllTestButton'), 'ResetAllTestButton is NOT imported or used in app/tenant/page.tsx');
  assert(!tenantPage.includes('DEV TESTING'), 'No DEV TESTING text in app/tenant/page.tsx');

  // ----------------------------------------------------
  // TEST 4: Quick Logins and Role Mapping
  // ----------------------------------------------------
  console.log('\n📋 4. Testing Quick Logins & Role Mapping');
  const rolesToTest = [
    { role: 'admin', expectedRole: 'platform_admin', expectedRedirect: '/platform' },
    { role: 'owner', expectedRole: 'owner', expectedRedirect: '/owner' },
    { role: 'tenant', expectedRole: 'tenant', expectedRedirect: '/tenant' },
    { role: 'maid', expectedRole: 'keeper', expectedRedirect: '/keeper/maid' },
    { role: 'technician', expectedRole: 'keeper', expectedRedirect: '/keeper/technician' },
    { role: 'guest', expectedRole: 'guest', expectedRedirect: '/explore' },
  ];

  for (const item of rolesToTest) {
    const res = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: item.role, password: item.role }),
    });
    const data = await res.json();
    assert(
      data.success && data.user?.role === item.expectedRole && data.redirectUrl === item.expectedRedirect,
      `User '${item.role}' logs in as '${data.user?.role}' redirecting to '${data.redirectUrl}'`
    );
  }

  // ----------------------------------------------------
  // TEST 5: Real Kesorn 2 Data (Rates 100/7)
  // ----------------------------------------------------
  console.log('\n📋 5. Testing Kesorn 2 Real Data (Rates 100/7 THB)');
  const dormRes = await fetch(BASE + '/api/dorms/1');
  const dormData = await dormRes.json();
  assert(dormData.success, 'Fetched /api/dorms/1 successfully');
  assert(Number(dormData.data.water_rate) === 100, `Water rate is 100 THB/month (actual: ${dormData.data.water_rate})`);
  assert(Number(dormData.data.electricity_rate) === 7, `Electricity rate is 7 THB/unit (actual: ${dormData.data.electricity_rate})`);
  assert(dormData.data.pet_friendly === true, 'pet_friendly is true');
  assert(dormData.data.phone === '081-234-5678', `Phone is 081-234-5678 (actual: ${dormData.data.phone})`);

  // ----------------------------------------------------
  // TEST 6: Room numbers 1 to 20
  // ----------------------------------------------------
  console.log('\n📋 6. Testing Room Numbers (1-20 with case studies 5, 9, 11, 20)');
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({ host: 'localhost', user: 'root', database: 'kesorn_db' });
  const [rooms] = await conn.query('SELECT room_number FROM rooms ORDER BY id ASC');
  const roomNums = rooms.map(r => r.room_number);
  assert(roomNums.length === 20, `Total 20 rooms (count: ${roomNums.length})`);
  assert(roomNums.includes('5') && roomNums.includes('9') && roomNums.includes('11') && roomNums.includes('20'), 'Includes case study rooms 5, 9, 11, 20');
  assert(roomNums[0] === '1' && roomNums[19] === '20', `First room is '1' and 20th room is '20' (actual: '${roomNums[0]}' ... '${roomNums[19]}')`);

  // ----------------------------------------------------
  // TEST 7: Keepers linked to dorm
  // ----------------------------------------------------
  console.log('\n📋 7. Testing Keepers and Keeper Dormitories');
  const [keepers] = await conn.query('SELECT * FROM keepers WHERE dorm_id = 1');
  const [kd] = await conn.query('SELECT * FROM keeper_dormitories WHERE dorm_id = 1');
  assert(keepers.length >= 2, `Keepers table has ${keepers.length} keepers for dorm 1`);
  assert(kd.length >= 2, `keeper_dormitories has ${kd.length} links for dorm 1`);

  // ----------------------------------------------------
  // TEST 8: Tenant linked to room
  // ----------------------------------------------------
  console.log('\n📋 8. Testing Test Tenant Linked to Room');
  const [tenants] = await conn.query('SELECT t.*, r.room_number FROM tenants t LEFT JOIN rooms r ON t.room_id = r.id WHERE t.email = "tenant@kesorn.com"');
  assert(tenants.length > 0 && tenants[0].room_number === '5', `tenant@kesorn.com linked to room ${tenants[0]?.room_number}`);

  // ----------------------------------------------------
  // TEST 9: Rules from DB & Pet Friendly
  // ----------------------------------------------------
  console.log('\n📋 9. Testing Rules from DB');
  const rulesRes = await fetch(BASE + '/api/tenant/rules');
  const rulesData = await rulesRes.json();
  assert(rulesData.success && rulesData.data.length >= 5, `Rules fetched from DB (count: ${rulesData.data?.length})`);
  const petRule = rulesData.data.find(r => r.category === 'สัตว์เลี้ยง' || r.title.includes('สัตว์เลี้ยง'));
  assert(petRule && petRule.description.includes('อนุญาตให้เลี้ยงสัตว์'), `Pet rule allows small pets: "${petRule?.title}"`);

  // ----------------------------------------------------
  // TEST 10: Signout endpoint
  // ----------------------------------------------------
  console.log('\n📋 10. Testing /api/auth/signout');
  const signoutRes = await fetchNoRedirect(BASE + '/api/auth/signout');
  assert([302, 307].includes(signoutRes.status) && (signoutRes.location || '').includes('/signin'), `/api/auth/signout redirects to /signin (${signoutRes.status})`);

  await conn.end();

  console.log('\n====================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
