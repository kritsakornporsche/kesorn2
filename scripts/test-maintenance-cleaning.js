const http = require('http');

const BASE_URL = 'http://localhost:3001';

async function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlPath, BASE_URL);
    const headers = options.headers || {};
    let bodyData = null;

    if (options.body) {
      bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = http.request(parsed, {
      method: options.method || 'GET',
      headers: headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function login(email, password) {
  // 1. Get csrf token
  const csrfRes = await request('/api/auth/csrf');
  const csrfToken = csrfRes.json?.csrfToken;
  const setCookie = csrfRes.headers['set-cookie'] || [];
  const cookieStr = setCookie.map(c => c.split(';')[0]).join('; ');

  // 2. Post credentials
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
        'Cookie': cookieStr,
        'Content-Length': Buffer.byteLength(params)
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const allCookies = [
          ...cookieStr.split('; '),
          ...(res.headers['set-cookie'] || []).map(c => c.split(';')[0])
        ].filter(Boolean).join('; ');
        resolve(allCookies);
      });
    });
    req.write(params);
    req.end();
  });

  return signinRes;
}

async function run() {
  console.log('==============================================================================');
  console.log('   KESORN 2 - MAINTENANCE & CLEANING WORKFLOW VERIFICATION   ');
  console.log('==============================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`✅ PASS: ${title} ${extra ? `(${extra})` : ''}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title} ${extra ? `(${extra})` : ''}`);
      failed++;
    }
  }

  // --- 1. Tenant Repair Workflow ---
  console.log('--- 1. Testing Tenant Repair Workflow ---');
  const tenantCookie = await login('tenant@kesorn.com', 'tenant');
  assert('Tenant Login (tenant@kesorn.com)', Boolean(tenantCookie));

  // Tenant submits maintenance
  const repairRes = await request('/api/tenant/maintenance', {
    method: 'POST',
    headers: { Cookie: tenantCookie },
    body: {
      issue_type: 'ระบบไฟฟ้า',
      description: 'ไฟเพดานระเบียงกะพริบและมีเสียงดัง ต้องการให้ช่างเข้าตรวจสอบ'
    }
  });
  const repairId = repairRes.json?.data?.id;
  assert('Tenant POST /api/tenant/maintenance', repairRes.status === 200 && Boolean(repairId), `ID: ${repairId}`);

  // Tenant views maintenance history
  const tenantHist = await request('/api/tenant/maintenance/list', {
    headers: { Cookie: tenantCookie }
  });
  const hasRepairInHist = Array.isArray(tenantHist.json?.data) && tenantHist.json.data.some(r => r.id === repairId);
  assert('Tenant GET /api/tenant/maintenance/list', tenantHist.status === 200 && hasRepairInHist, `Count: ${tenantHist.json?.data?.length}`);

  // Technician checks job
  console.log('\n--- 2. Testing Technician Job Workflow ---');
  const techCookie = await login('technician@kesorn.com', 'technician');
  assert('Technician Login (technician@kesorn.com)', Boolean(techCookie));

  const techJobsRes = await request('/api/keeper/technician/jobs?dormId=1', {
    headers: { Cookie: techCookie }
  });
  const techJobs = techJobsRes.json?.data?.jobs || [];
  const foundTechJob = techJobs.find(j => j.id === repairId);
  assert('Technician GET /api/keeper/technician/jobs', techJobsRes.status === 200 && Boolean(foundTechJob), `Job Found: Room ${foundTechJob?.room_number}`);

  // Technician starts job
  const startJobRes = await request('/api/keeper/technician/jobs', {
    method: 'PATCH',
    headers: { Cookie: techCookie },
    body: { id: repairId, status: 'InProgress' }
  });
  assert('Technician PATCH /api/keeper/technician/jobs (InProgress)', startJobRes.status === 200 && startJobRes.json?.success);

  // Technician completes job
  const completeJobRes = await request('/api/keeper/technician/jobs', {
    method: 'PATCH',
    headers: { Cookie: techCookie },
    body: { 
      id: repairId, 
      status: 'Completed',
      cost: 250,
      notes: 'เปลี่ยนบัลลาสต์และหลอดไฟ LED เรียบร้อย ใช้งานได้ปกติ (ค่าซ่อม/อะไหล่ 250 บาท)'
    }
  });
  assert('Technician PATCH /api/keeper/technician/jobs (Completed with Cost 250)', completeJobRes.status === 200 && completeJobRes.json?.success);
  const repairBillId = completeJobRes.json?.bill_id;
  assert('Technician Repair Generates Bill ID', Boolean(repairBillId), `Bill ID: ${repairBillId}`);

  // Owner verifies maintenance
  console.log('\n--- 3. Testing Owner Maintenance Verification ---');
  const ownerCookie = await login('owner@kesorn.com', 'owner');
  assert('Owner Login (owner@kesorn.com)', Boolean(ownerCookie));

  const ownerMaintRes = await request('/api/owner/maintenance?dormId=1', {
    headers: { Cookie: ownerCookie }
  });
  const ownerMaintList = ownerMaintRes.json?.data || [];
  const completedJob = ownerMaintList.find(j => j.id === repairId);
  assert('Owner GET /api/owner/maintenance', ownerMaintRes.status === 200 && completedJob?.status === 'Completed', `Status: ${completedJob?.status}`);
  assert('Owner Sees Maintenance Cost and Bill ID', Number(completedJob?.cost) === 250 && Number(completedJob?.bill_id) === Number(repairBillId), `Cost: ${completedJob?.cost}, Bill: ${completedJob?.bill_id}`);

  // --- 4. Cleaning Workflow (Tenant Request) ---
  console.log('\n--- 4. Testing Tenant Cleaning Request Workflow ---');
  const cleanReqRes = await request('/api/tenant/maintenance', {
    method: 'POST',
    headers: { Cookie: tenantCookie },
    body: {
      issue_type: 'บริการทำความสะอาด (แม่บ้าน)',
      description: 'ขอให้แม่บ้านช่วยทำความสะอาดห้องน้ำและถูพื้นห้องพัก'
    }
  });
  assert('Tenant Request Cleaning Service', cleanReqRes.status === 200 && cleanReqRes.json?.success);

  // Maid views jobs
  console.log('\n--- 5. Testing Maid Cleaning Workflow ---');
  const maidCookie = await login('maid@kesorn.com', 'maid');
  assert('Maid Login (maid@kesorn.com)', Boolean(maidCookie));

  const maidJobsRes = await request('/api/keeper/maid/jobs?dormId=1', {
    headers: { Cookie: maidCookie }
  });
  const maidJobs = maidJobsRes.json?.data?.jobs || [];
  const foundCleanJob = maidJobs.find(j => j.room_number === '5' && j.status === 'pending');
  assert('Maid GET /api/keeper/maid/jobs', maidJobsRes.status === 200 && Boolean(foundCleanJob), `Found Pending Job ID: ${foundCleanJob?.id}`);

  if (foundCleanJob) {
    // Maid starts cleaning job
    const maidStartRes = await request('/api/keeper/maid/jobs', {
      method: 'PATCH',
      headers: { Cookie: maidCookie },
      body: { id: foundCleanJob.id, status: 'in_progress' }
    });
    assert('Maid PATCH /api/keeper/maid/jobs (in_progress)', maidStartRes.status === 200 && maidStartRes.json?.success);

    // Maid completes cleaning job with cost = 0 (Free, no bill generated)
    const maidFinishRes = await request('/api/keeper/maid/jobs', {
      method: 'PATCH',
      headers: { Cookie: maidCookie },
      body: {
        id: foundCleanJob.id,
        status: 'completed',
        cost: 0,
        notes: 'ทำความสะอาดห้องน้ำและถูพื้นเรียบร้อยแล้ว (บริการฟรี ไม่มีค่าใช้จ่าย)'
      }
    });
    assert('Maid PATCH /api/keeper/maid/jobs (completed with Cost 0)', maidFinishRes.status === 200 && maidFinishRes.json?.success);
    assert('Maid Free Job Generates No Bill (bill_id is null)', !maidFinishRes.json?.bill_id);
  }

  // --- 6. Owner Assigns Cleaning Task to Maid ---
  console.log('\n--- 6. Testing Owner Assigning Cleaning Task ---');
  const ownerAssignRes = await request('/api/keeper/maid/jobs', {
    method: 'POST',
    headers: { Cookie: ownerCookie },
    body: {
      room_number: '9',
      job_type: 'move_out',
      notes: 'ทำความสะอาดเตรียมห้อง 9 ก่อนผู้เช่าย้ายเข้าสัปดาห์หน้า',
      dorm_id: 1
    }
  });
  const assignedJobId = ownerAssignRes.json?.data?.id;
  assert('Owner POST /api/keeper/maid/jobs (Room 9)', ownerAssignRes.status === 200 && Boolean(assignedJobId), `Created Job ID: ${assignedJobId}`);

  // Maid sees the newly assigned job
  const maidJobsAfterAssign = await request('/api/keeper/maid/jobs?dormId=1', {
    headers: { Cookie: maidCookie }
  });
  const foundRoom9Job = (maidJobsAfterAssign.json?.data?.jobs || []).find(j => j.id === assignedJobId);
  assert('Maid Sees Assigned Job for Room 9', Boolean(foundRoom9Job && foundRoom9Job.room_number === '9'));

  // --- 7. Maid Directly Creates Cleaning Task ---
  console.log('\n--- 7. Testing Maid Directly Creating Cleaning Task ---');
  const maidCreateRes = await request('/api/keeper/maid/jobs', {
    method: 'POST',
    headers: { Cookie: maidCookie },
    body: {
      room_number: '20',
      job_type: 'weekly',
      notes: 'เช็ดกระจกและล้างระเบียงห้อง 20',
      dorm_id: 1
    }
  });
  const maidDirectJobId = maidCreateRes.json?.data?.id;
  assert('Maid POST /api/keeper/maid/jobs (Room 20)', maidCreateRes.status === 200 && Boolean(maidDirectJobId), `Job ID: ${maidDirectJobId}`);

  // Maid completes Room 20 job with cost = 150
  const maidCompleteDirectRes = await request('/api/keeper/maid/jobs', {
    method: 'PATCH',
    headers: { Cookie: maidCookie },
    body: {
      id: maidDirectJobId,
      status: 'completed',
      cost: 150,
      notes: 'เช็ดกระจกและล้างระเบียงเรียบร้อยแล้ว สะอาดเอี่ยม (คิดค่าบริการพิเศษ 150 บาท)',
      photo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    }
  });
  assert('Maid Completes Room 20 with Photo, Notes & Cost 150', maidCompleteDirectRes.status === 200 && maidCompleteDirectRes.json?.success);
  const cleanBillId = maidCompleteDirectRes.json?.bill_id;
  assert('Maid Paid Cleaning Generates Bill ID', Boolean(cleanBillId), `Bill ID: ${cleanBillId}`);

  // --- 8. Testing Tenant Billing & Maintenance Cost Visibility ---
  console.log('\n--- 8. Testing Tenant Billing & Cost Visibility ---');
  const tenantBillsRes = await request('/api/tenant/billing/list', {
    headers: { Cookie: tenantCookie }
  });
  const tenantBills = tenantBillsRes.json?.data || [];
  const foundRepairBill = tenantBills.find(b => b.id === repairBillId || (b.title && b.title.includes('ค่าซ่อมแซม') && Number(b.amount) === 250));
  assert('Tenant Billing List Contains Repair Bill', tenantBillsRes.status === 200 && Boolean(foundRepairBill), `Bill Found: ${foundRepairBill?.title} - ฿${foundRepairBill?.amount}`);

  const tenantHistAfter = await request('/api/tenant/maintenance/list', {
    headers: { Cookie: tenantCookie }
  });
  const updatedMaintInHist = (tenantHistAfter.json?.data || []).find(r => r.id === repairId);
  assert('Tenant Maintenance History Shows Cost and Bill ID', updatedMaintInHist?.cost == 250 && Boolean(updatedMaintInHist?.bill_id), `Cost: ${updatedMaintInHist?.cost}, Bill: ${updatedMaintInHist?.bill_id}`);

  // --- 9. Testing Owner Updating Maintenance Status via API ---
  console.log('\n--- 9. Testing Owner Updating Maintenance Status via API ---');
  const ownerUpdateMaintRes = await request(`/api/owner/maintenance/${repairId}`, {
    method: 'PUT',
    headers: { Cookie: ownerCookie },
    body: { status: 'InProgress' }
  });
  assert('Owner PUT /api/owner/maintenance/[id] (InProgress)', ownerUpdateMaintRes.status === 200 && ownerUpdateMaintRes.json?.success);

  // Reset back to Completed
  const ownerResetMaintRes = await request(`/api/owner/maintenance/${repairId}`, {
    method: 'PUT',
    headers: { Cookie: ownerCookie },
    body: { status: 'Completed' }
  });
  assert('Owner PUT /api/owner/maintenance/[id] (Completed)', ownerResetMaintRes.status === 200 && ownerResetMaintRes.json?.success);

  // --- 10. Testing Maid & Tech Dashboard Stats ---
  console.log('\n--- 10. Testing Dashboard Stats Accuracy ---');
  const finalMaidStats = await request('/api/keeper/maid/jobs?dormId=1', {
    headers: { Cookie: maidCookie }
  });
  const maidStats = finalMaidStats.json?.data?.stats;
  assert('Maid Stats Loaded and Accurate', Boolean(maidStats && maidStats.total >= 3 && maidStats.completed >= 1), `Total: ${maidStats?.total}, Completed: ${maidStats?.completed}`);

  const finalTechStats = await request('/api/keeper/technician/jobs?dormId=1', {
    headers: { Cookie: techCookie }
  });
  const techStats = finalTechStats.json?.data?.stats;
  assert('Technician Stats Loaded and Accurate', Boolean(techStats && techStats.total >= 1 && techStats.completed >= 1), `Total: ${techStats?.total}, Completed: ${techStats?.completed}`);

  // --- 11. Security & RBAC Checks ---
  console.log('\n--- 11. Security & RBAC Checks ---');
  const unauthRes = await request('/api/keeper/maid/jobs', {
    method: 'POST',
    body: { room_number: '1', job_type: 'test' }
  });
  assert('Unauthenticated User Blocked from Maid POST', unauthRes.status === 401 || unauthRes.status === 403, `Status: ${unauthRes.status}`);

  const tenantMaidPost = await request('/api/keeper/maid/jobs', {
    method: 'POST',
    headers: { Cookie: tenantCookie },
    body: { room_number: '1', job_type: 'test' }
  });
  assert('Tenant Blocked from Direct Keeper Job Creation', tenantMaidPost.status === 401 || tenantMaidPost.status === 403, `Status: ${tenantMaidPost.status}`);

  console.log('\n==============================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`SUCCESS RATE: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('==============================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});
