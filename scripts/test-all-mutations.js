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

const auditLog = [];

function check(testName, res, expectedStatus = 200) {
  const passed = res.status === expectedStatus || (Array.isArray(expectedStatus) && expectedStatus.includes(res.status));
  const err = passed ? '' : (res.json?.message || res.json?.error || res.data?.slice(0, 120));
  auditLog.push({ testName, passed, status: res.status, err });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName.padEnd(55)} : HTTP ${res.status} ${passed ? 'OK' : 'FAIL -> ' + err}`);
}

async function runMutationsAudit() {
  console.log('='.repeat(75));
  console.log('      DEEP AUDIT: MUTATIONS & WORKFLOW OPERATIONS TESTING      ');
  console.log('='.repeat(75));

  // --- 1. TENANT MUTATIONS ---
  console.log('\n--- 1. Testing Tenant Mutations ---');
  const tenantCookie = await login('tenant@kesorn.com', 'tenant');
  if (!tenantCookie) {
    console.error('Failed to login as tenant');
    return;
  }
  const th = { Cookie: tenantCookie };

  // 1.1 Maintenance submission
  const maintRes = await fetchUrl('/api/tenant/maintenance', 'POST', {
    issue_type: 'ไฟฟ้า',
    description: 'ทดสอบแจ้งซ่อม หลอดไฟระเบียงกะพริบ',
    photo_url: null
  }, th);
  check('POST /api/tenant/maintenance', maintRes, [200, 201]);

  // 1.2 Evaluation submission
  const evalRes = await fetchUrl('/api/tenant/evaluation', 'POST', {
    ratings: { cleanliness: 5, security: 5, wifi: 5, service: 5 },
    comment: 'หอพักดูแลดีมาก อินเทอร์เน็ตแรง'
  }, th);
  check('POST /api/tenant/evaluation', evalRes, [200, 201]);

  // 1.3 Contract Renewal Request
  const renewRes = await fetchUrl('/api/tenant/contract/request-renewal', 'POST', {
    contract_id: 1,
    note: 'ขอต่อสัญญาอีก 1 ปีครับ'
  }, th);
  check('POST /api/tenant/contract/request-renewal', renewRes, [200, 201]);

  // 1.4 Move-out Request
  const moveOutRes = await fetchUrl('/api/tenant/move-out', 'POST', {
    desiredDate: '2027-05-31',
    reason: 'เรียนจบการศึกษา'
  }, th);
  // May succeed (200) or return 400 if already pending request exists (which is also valid business logic)
  const moveOutPassed = moveOutRes.status === 200 || (moveOutRes.status === 400 && (moveOutRes.json?.message?.includes('already have an active') || moveOutRes.json?.message?.includes('กำลังดำเนินการ')));
  check('POST /api/tenant/move-out', { status: moveOutPassed ? 200 : moveOutRes.status, json: moveOutRes.json, data: moveOutRes.data }, 200);

  // 1.5 Billing Slip Upload (Payment)
  const billListRes = await fetchUrl('/api/tenant/billing/list', 'GET', null, th);
  const existingBillId = billListRes.json?.data?.[0]?.id || billListRes.json?.bills?.[0]?.id || 3;
  const slipRes = await fetchUrl('/api/tenant/billing/payment', 'POST', {
    bill_id: existingBillId,
    slip_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }, th);
  check('POST /api/tenant/billing/payment', slipRes, [200, 201]);

  // 1.6 Chat conversation create & message send
  const convRes = await fetchUrl('/api/chat/conversations', 'POST', { dormId: 1 }, th);
  check('POST /api/chat/conversations', convRes, [200, 201]);

  const convId = convRes.json?.data?.id;
  if (convId) {
    const chatPost = await fetchUrl('/api/chat/messages', 'POST', {
      conversationId: convId,
      message: 'สวัสดีครับ สอบถามเรื่องพัสดุครับ'
    }, th);
    check('POST /api/chat/messages (Tenant -> Owner)', chatPost, [200, 201]);
  }

  // --- 2. OWNER MUTATIONS ---
  console.log('\n--- 2. Testing Owner Mutations ---');
  const ownerCookie = await login('owner@kesorn.com', 'owner');
  if (!ownerCookie) {
    console.error('Failed to login as owner');
    return;
  }
  const oh = { Cookie: ownerCookie };

  // 2.1 Owner Announcement POST
  const annoPost = await fetchUrl('/api/announcements', 'POST', {
    title: 'แจ้งล้างแอร์ประจำปี หอเกษร 2',
    content: 'จะมีการเข้าล้างแอร์ในสัปดาห์หน้า ขอให้ผู้เช่าเก็บทรัพย์สินมีค่า',
    priority: 'Normal'
  }, oh);
  check('POST /api/announcements', annoPost, [200, 201]);

  // 2.2 Owner Single Bill POST with fresh cycle
  const randomCycle = `2028-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}`;
  const billPost = await fetchUrl('/api/owner/billing', 'POST', {
    tenant_id: 1,
    room_number: '5',
    title: `ค่าเช่าห้องพักรอบบิล ${randomCycle}`,
    amount: 2800,
    due_date: '2028-10-05',
    billing_cycle: randomCycle,
    room_amount: 2800,
    water_amount: 0,
    electric_amount: 0
  }, oh);
  check('POST /api/owner/billing', billPost, [200, 201]);

  // 2.3 Owner Batch Billing POST
  const batchBill = await fetchUrl('/api/owner/billing/batch', 'POST', {
    billing_cycle: '2026-11'
  }, oh);
  check('POST /api/owner/billing/batch', batchBill, [200, 201]);

  // 2.4 Owner Maintenance Status Update (PUT)
  const maintUpdate = await fetchUrl('/api/owner/maintenance/1', 'PUT', {
    status: 'In Progress'
  }, oh);
  check('PUT /api/owner/maintenance/1', maintUpdate, [200, 201]);

  // 2.5 Owner Contract Create
  const contractPost = await fetchUrl('/api/owner/contracts', 'POST', {
    tenant_id: 1,
    room_id: 5,
    start_date: '2026-06-01',
    end_date: '2027-05-31',
    deposit_amount: 2000,
    contract_file_url: '/images/kesorn/building-front.jpg'
  }, oh);
  check('POST /api/owner/contracts', contractPost, [200, 201]);

  // 2.6 Owner Accounting Transaction
  const acctPost = await fetchUrl('/api/owner/accounting', 'POST', {
    type: 'Income',
    category: 'ค่าเช่า',
    amount: 2800,
    description: 'รับชำระค่าเช่าห้อง 5',
    date: '2026-09-26'
  }, oh);
  check('POST /api/owner/accounting', acctPost, [200, 201]);

  // --- 3. KEEPER MUTATIONS ---
  console.log('\n--- 3. Testing Keeper Mutations ---');
  const maidCookie = await login('maid@kesorn.com', 'maid');
  if (maidCookie) {
    const mh = { Cookie: maidCookie };
    const maidJobUpdate = await fetchUrl('/api/keeper/maid/jobs', 'PUT', {
      id: 1,
      status: 'completed',
      notes: 'ทำความสะอาดห้องเรียบร้อย'
    }, mh);
    check('PUT /api/keeper/maid/jobs', maidJobUpdate, [200, 201]);
  }

  const techCookie = await login('technician@kesorn.com', 'technician');
  if (techCookie) {
    const techh = { Cookie: techCookie };
    const techJobUpdate = await fetchUrl('/api/keeper/technician/jobs', 'PUT', {
      id: 1,
      status: 'Completed',
      notes: 'เข้าเปลี่ยนหลอดไฟเรียบร้อยแล้ว'
    }, techh);
    check('PUT /api/keeper/technician/jobs', techJobUpdate, [200, 201]);
  }

  // --- SUMMARY ---
  console.log('\n' + '='.repeat(75));
  const failed = auditLog.filter(t => !t.passed);
  console.log(`TOTAL MUTATIONS TESTED: ${auditLog.length}`);
  console.log(`PASSED: ${auditLog.length - failed.length} | FAILED: ${failed.length}`);
  if (failed.length > 0) {
    console.log('\n❌ FAILED MUTATIONS:');
    failed.forEach(f => console.log(`- ${f.testName} (HTTP ${f.status}): ${f.err}`));
  }
  console.log('='.repeat(75));
}

runMutationsAudit().catch(console.error);
