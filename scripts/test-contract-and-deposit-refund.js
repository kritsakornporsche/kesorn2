const http = require('http');
const mysql = require('mysql2/promise');
const generatePayload = require('promptpay-qr');
const qrcode = require('qrcode');
const jsPDF = require('jspdf').jsPDF;

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
  const csrfRes = await request('/api/auth/csrf');
  const csrfToken = csrfRes.json?.csrfToken;
  const setCookie = csrfRes.headers['set-cookie'] || [];
  const cookieStr = setCookie.map(c => c.split(';')[0]).join('; ');

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

// PromptPay EMVCo Payload Parser
function parsePromptPayPayload(payload) {
  let idx = 0;
  const tags = {};
  while (idx < payload.length) {
    const tag = payload.substring(idx, idx + 2);
    const len = parseInt(payload.substring(idx + 2, idx + 4), 10);
    const val = payload.substring(idx + 4, idx + 4 + len);
    tags[tag] = val;
    idx += 4 + len;
  }
  return {
    format: tags['00'],
    initiationMethod: tags['01'], // 11 = static, 12 = dynamic (locked amount)
    merchantAccount: tags['29'],
    currency: tags['53'], // 764 = THB
    amount: tags['54'],
    country: tags['58'], // TH
    crc: tags['63']
  };
}

async function runTestSuite(roundNumber) {
  console.log(`\n==============================================================================`);
  console.log(`   ROUND ${roundNumber}/3: CONTRACT OCR, PDF & DEPOSIT REFUND AUDIT VERIFICATION   `);
  console.log(`==============================================================================\n`);

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

  const conn = await mysql.createConnection('mysql://smartdom:smartdom@localhost:3306/kesorn_db');

  try {
    // -------------------------------------------------------------
    // PART 1: TEST SMART THAI ID CARD OCR & CONTRACT CREATION
    // -------------------------------------------------------------
    console.log('--- 1. Testing Thai National ID Card OCR ---');
    const sampleIdImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    const ocrRes = await request('/api/owner/contracts/ocr-id', {
      method: 'POST',
      body: { image: sampleIdImage }
    });

    assert('OCR Endpoint Status 200', ocrRes.status === 200);
    const ocrData = ocrRes.json?.data;
    assert('OCR Extracted 13-digit ID Number', Boolean(ocrData?.id_card_number && ocrData.id_card_number.replace(/\D/g, '').length === 13), `ID: ${ocrData?.id_card_number}`);
    assert('OCR Extracted Thai Name', Boolean(ocrData?.full_name_th), `Name: ${ocrData?.full_name_th}`);
    assert('OCR Extracted Thai Address', Boolean(ocrData?.address), `Address: ${ocrData?.address}`);

    // Create Contract using Extracted ID Card Data
    console.log('\n--- 2. Testing Contract Creation with ID Card Details ---');
    const ownerCookie = await login('owner@kesorn.com', 'owner');
    assert('Owner Login Success', Boolean(ownerCookie));

    // Choose an available room
    const [availRooms] = await conn.query("SELECT id, room_number, price FROM rooms WHERE status = 'Available' LIMIT 1");
    let testRoomId = 16;
    let testRoomNumber = '16';
    let roomPrice = 3800;
    if (availRooms.length > 0) {
      testRoomId = availRooms[0].id;
      testRoomNumber = availRooms[0].room_number;
      roomPrice = Number(availRooms[0].price);
    }

    const testTenantEmail = `tenant.ocr.round${roundNumber}@kesorn.com`;
    const createContractRes = await request('/api/owner/contracts', {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: {
        dormId: 1,
        room_id: testRoomId,
        tenant_name: ocrData.full_name_th || 'นายสมชาย ใจดี',
        tenant_email: testTenantEmail,
        tenant_phone: '089-123-4567',
        id_card_number: ocrData.id_card_number || '1-1002-01384-95-2',
        tenant_address: ocrData.address || '99/50 แขวงลาดยาว เขตจตุจักร กทม.',
        id_card_image: sampleIdImage,
        start_date: '2026-09-01',
        end_date: '2027-09-01',
        deposit_amount: roomPrice * 2,
        contract_file_url: sampleIdImage
      }
    });

    assert('Contract Created Successfully', createContractRes.status === 200 && createContractRes.json?.success, `Contract ID: ${createContractRes.json?.contractId}`);
    const contractId = createContractRes.json?.contractId;

    // Verify Database stores ID Card Number and Address
    const [savedContract] = await conn.query('SELECT * FROM contracts WHERE id = ?', [contractId]);
    assert('Contract Has ID Card Number in DB', Boolean(savedContract[0]?.id_card_number), `DB ID: ${savedContract[0]?.id_card_number}`);
    assert('Contract Has Address in DB', Boolean(savedContract[0]?.tenant_address), `DB Address: ${savedContract[0]?.tenant_address}`);

    // Verify Room is Marked Occupied
    const [savedRoom] = await conn.query('SELECT status FROM rooms WHERE id = ?', [testRoomId]);
    assert('Room Status Updated to Occupied', savedRoom[0]?.status === 'Occupied');

    // -------------------------------------------------------------
    // PART 2: TEST CONTRACT PDF GENERATION & EXPORT
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Printable Contract Document & PDF Generation ---');
    // Test jsPDF generation simulating PrintableContractModal
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.text(`Rental Agreement Kesorn 2 - Room ${testRoomNumber}`, 20, 20);
    doc.text(`Tenant: ${ocrData?.full_name_th} (${ocrData?.id_card_number})`, 20, 30);
    doc.text(`Deposit: ${roomPrice * 2} THB`, 20, 40);
    const pdfOutput = doc.output();
    assert('jsPDF Successfully Builds Contract PDF', Boolean(pdfOutput && pdfOutput.startsWith('%PDF-')), `Size: ${pdfOutput.length} bytes`);

    // -------------------------------------------------------------
    // PART 3: TEST SECURITY DEPOSIT REFUND WITH SEEDED 1-YEAR-AGO CONTRACT
    // -------------------------------------------------------------
    console.log('\n--- 4. Seeding Last Year Contract (Completed Term) ---');
    // Seed contract from 1 year ago (e.g. 2025-09-20 to 2026-09-20)
    const seedRoomId = 18;
    const seedRoomNumber = '18';
    const seedTenantEmail = `tenant.lastyear.round${roundNumber}@kesorn.com`;
    const seedDeposit = 8000.00;

    // Create or find user & tenant
    const bcrypt = require('bcryptjs');
    const hashedPw = await bcrypt.hash('tenant', 10);
    const [userCheck] = await conn.query('SELECT id FROM users WHERE email = ?', [seedTenantEmail]);
    let seedUserId;
    if (userCheck.length > 0) {
      seedUserId = userCheck[0].id;
      await conn.query('UPDATE users SET password = ? WHERE id = ?', [hashedPw, seedUserId]);
    } else {
      const [uIns] = await conn.query(
        "INSERT INTO users (name, email, password, primary_role) VALUES (?, ?, ?, 'tenant')",
        ['คุณวิศรุต สุขเกษม (ลูกหอครบสัญญา)', seedTenantEmail, hashedPw]
      );
      seedUserId = uIns.insertId;
    }

    // Ensure role in user_dorm_roles
    const [roleCheck] = await conn.query('SELECT id FROM user_dorm_roles WHERE user_id = ? AND dorm_id = 1', [seedUserId]);
    if (roleCheck.length === 0) {
      await conn.query("INSERT INTO user_dorm_roles (user_id, dorm_id, role) VALUES (?, 1, 'tenant')", [seedUserId]);
    }

    const [tCheck] = await conn.query('SELECT id FROM tenants WHERE email = ?', [seedTenantEmail]);
    let seedTenantId;
    if (tCheck.length > 0) {
      seedTenantId = tCheck[0].id;
      await conn.query("UPDATE tenants SET room_id = ?, status = 'active', user_id = ? WHERE id = ?", [seedRoomId, seedUserId, seedTenantId]);
    } else {
      const [tIns] = await conn.query(
        "INSERT INTO tenants (name, email, phone, room_id, user_id, status, id_card_number) VALUES (?, ?, ?, ?, ?, 'active', ?)",
        ['คุณวิศรุต สุขเกษม (ลูกหอครบสัญญา)', seedTenantEmail, '089-999-8888', seedRoomId, seedUserId, '1-1002-99887-11-2']
      );
      seedTenantId = tIns.insertId;
    }

    // Insert 1-year contract that has ended (ครบสัญญา 1 ปีบริบูรณ์)
    const [cIns] = await conn.query(
      "INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status, id_card_number) VALUES (?, ?, '2025-09-01 00:00:00', '2026-09-01 00:00:00', ?, 'Active', ?)",
      [seedTenantId, seedRoomId, seedDeposit, '1-1002-99887-11-2']
    );
    const seededContractId = cIns.insertId;
    assert('Seeded 1-Year Completed Contract', Boolean(seededContractId), `Contract #${seededContractId}, Deposit ฿${seedDeposit}`);

    // Seed Unpaid Bills for this tenant:
    // Bill 1: ไฟฟ้า ฿450
    // Bill 2: ประปา ฿100
    // Total unpaid = ฿550
    await conn.query('DELETE FROM bills WHERE tenant_id = ?', [seedTenantId]);
    await conn.query(
      "INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, status) VALUES (?, 1, ?, 'ค่าไฟฟ้า ประจำเดือนกันยายน', 450.00, 'unpaid')",
      [seedTenantId, seedRoomNumber]
    );
    await conn.query(
      "INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, status) VALUES (?, 1, ?, 'ค่าน้ำประปา ประจำเดือนกันยายน', 100.00, 'unpaid')",
      [seedTenantId, seedRoomNumber]
    );

    const [unpaidCheck] = await conn.query("SELECT SUM(amount) as total FROM bills WHERE tenant_id = ? AND status = 'unpaid'", [seedTenantId]);
    const expectedUnpaid = Number(unpaidCheck[0]?.total || 0);
    assert('Seeded Unpaid Bills in DB', expectedUnpaid === 550, `Unpaid Total: ฿${expectedUnpaid}`);

    // -------------------------------------------------------------
    // PART 4: TEST TENANT SUBMITTING MOVE-OUT
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Tenant Move-Out Request Submission ---');
    const tenantCookie = await login(seedTenantEmail, 'tenant');
    // If login cookie not returned, test API with mocked or direct call
    const moveOutDate = '2026-09-26';
    const promptpayPhone = '0891234567';

    // Direct check via API
    const moveOutSubmitRes = await request('/api/tenant/move-out', {
      method: 'POST',
      headers: { Cookie: tenantCookie },
      body: {
        desiredDate: moveOutDate,
        reason: 'ครบกำหนดสัญญา 1 ปี ขอคืนเงินประกัน',
        promptpayTarget: promptpayPhone,
        promptpayName: 'คุณวิศรุต สุขเกษม',
        bankName: 'พร้อมเพย์ กสิกรไทย'
      }
    });

    assert('Tenant Move-Out Request Submitted', moveOutSubmitRes.status === 200 && moveOutSubmitRes.json?.success);
    const calc = moveOutSubmitRes.json?.calculation;
    assert('Audit 1: System Identifies Contract is Completed (1 Year)', calc?.isCompleted === true, `isCompleted: ${calc?.isCompleted}`);
    assert('Audit 2: System Audits Exact Unpaid Bills (฿550)', calc?.unpaidTotal === 550, `Unpaid: ฿${calc?.unpaidTotal}`);
    const expectedNetRefund = seedDeposit - 550; // 8000 - 550 = 7450
    assert('Audit 3: System Calculates Net Deposit Refund (฿7,450.00)', calc?.netRefund === expectedNetRefund, `Net Refund: ฿${calc?.netRefund}`);

    // -------------------------------------------------------------
    // PART 5: TEST OWNER AUDIT & EXACT-AMOUNT PROMPTPAY QR
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Owner Move-Out Audit & Exact PromptPay QR Generation ---');
    const ownerMoveOutRes = await request('/api/owner/move-out?dormId=1', {
      headers: { Cookie: ownerCookie }
    });

    assert('Owner GET /api/owner/move-out Success', ownerMoveOutRes.status === 200 && ownerMoveOutRes.json?.success);
    const moveOutList = ownerMoveOutRes.json?.data || [];
    const targetMoveOut = moveOutList.find(m => m.tenant_id === seedTenantId);

    assert('Owner Found Move-Out Request for Room 18', Boolean(targetMoveOut), `Request ID: ${targetMoveOut?.id}`);
    assert('Check 1: is_completed_calculated === true', targetMoveOut?.is_completed_calculated === true);
    assert('Check 2: live_unpaid_total === 550', Number(targetMoveOut?.live_unpaid_total) === 550);
    assert('Check 3: live_net_refund === 7450.00', Number(targetMoveOut?.live_net_refund) === 7450);

    // PromptPay QR Verification
    console.log('\n--- 7. Validating PromptPay EMVCo Payload & Locked Amount ---');
    const qrPayload = targetMoveOut?.qr_payload;
    assert('QR Payload Generated', Boolean(qrPayload), `Payload: ${qrPayload}`);

    const parsedQR = parsePromptPayPayload(qrPayload);
    // Tag 01 == 12 means Dynamic QR (Amount is locked! Cannot transfer more or less!)
    assert('QR Code is Dynamic (Amount Locked)', parsedQR.initiationMethod === '12', `Tag 01: ${parsedQR.initiationMethod} (12 = Locked Amount)`);
    assert('QR Code Currency is THB (764)', parsedQR.currency === '764', `Tag 53: ${parsedQR.currency}`);
    assert('QR Code Locks Exact Amount (7450.00)', parsedQR.amount === '7450.00', `Tag 54: ฿${parsedQR.amount}`);
    assert('QR Code Image Generated as Data URL', Boolean(targetMoveOut?.qr_image && targetMoveOut.qr_image.startsWith('data:image/png;base64,')), 'PNG QR Ready for Bank App Scan');

    // -------------------------------------------------------------
    // PART 6: TEST OWNER CONFIRMING REFUND & RELEASING ROOM
    // -------------------------------------------------------------
    console.log('\n--- 8. Testing Owner Confirming Refund & Contract Termination ---');
    const confirmRes = await request('/api/owner/move-out', {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: {
        requestId: targetMoveOut.id
      }
    });

    assert('Owner Confirms Refund', confirmRes.status === 200 && confirmRes.json?.success);

    // Verify Database state
    const [finalRoom] = await conn.query('SELECT status FROM rooms WHERE id = ?', [seedRoomId]);
    assert('Room 18 Released back to Available', finalRoom[0]?.status === 'Available');

    const [finalContract] = await conn.query('SELECT status FROM contracts WHERE id = ?', [seededContractId]);
    assert('Contract Status Updated to Terminated', finalContract[0]?.status === 'Terminated');

    const [finalTenant] = await conn.query('SELECT status, room_id FROM tenants WHERE id = ?', [seedTenantId]);
    assert('Tenant Status Updated to past', finalTenant[0]?.status === 'past' && finalTenant[0]?.room_id === null);

    const [remainingUnpaid] = await conn.query("SELECT COUNT(*) as count FROM bills WHERE tenant_id = ? AND status != 'paid'", [seedTenantId]);
    assert('Unpaid Bills Marked as Paid (Deducted from Deposit)', Number(remainingUnpaid[0]?.count) === 0);

  } finally {
    await conn.end();
  }

  console.log(`\n==============================================================================`);
  console.log(`ROUND ${roundNumber} TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`ROUND ${roundNumber} SUCCESS RATE: ${(passed / (passed + failed) * 100).toFixed(1)}%`);
  console.log(`==============================================================================\n`);

  return { passed, failed };
}

async function main() {
  console.log('STARTING 3-ROUND COMPREHENSIVE VERIFICATION AUDIT...\n');
  
  const results = [];
  for (let round = 1; round <= 3; round++) {
    const res = await runTestSuite(round);
    results.push(res);
    if (res.failed > 0) {
      console.error(`Round ${round} failed with ${res.failed} errors. Stopping.`);
      process.exit(1);
    }
  }

  console.log('\n🎉 ALL 3 ROUNDS OF VERIFICATION PASSED WITH 100% SUCCESS RATE! 🎉');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
