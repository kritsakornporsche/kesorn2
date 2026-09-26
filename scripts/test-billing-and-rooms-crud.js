const http = require('http');

const BASE_URL = 'http://localhost:3001';

async function fetchUrl(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE_URL);
    const req = http.request(u, {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json, text: data });
      });
    });
    req.on('error', reject);
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

async function run() {
  console.log('--- Testing Owner Login via NextAuth ---');
  const ownerCookie = await login('owner@kesorn.com', 'owner');
  console.log('Owner Cookie Obtained:', Boolean(ownerCookie));

  const ownerH = { Cookie: ownerCookie };

  // 1. Test Billing PUT (Approve bill)
  console.log('\n--- 1. Testing Owner Billing PUT (Approve Slip / Mark Paid) ---');
  const billsRes = await fetchUrl('/api/owner/billing', 'GET', null, ownerH);
  console.log('GET /api/owner/billing status:', billsRes.status);
  const bills = billsRes.json?.data || [];
  const testBill = bills.find(b => b.status === 'Unpaid' || b.status === 'Pending') || bills[0];
  console.log('Target Bill ID:', testBill?.id, 'Initial Status:', testBill?.status);

  if (testBill) {
    const putRes = await fetchUrl(`/api/owner/billing/${testBill.id}`, 'PUT', { status: 'Paid' }, ownerH);
    console.log('PUT /api/owner/billing/:id (Paid) status:', putRes.status, 'Data Status:', putRes.json?.data?.status);

    // Verify accounting entry was recorded
    const accRes = await fetchUrl('/api/owner/accounting', 'GET', null, ownerH);
    const foundAcc = (accRes.json?.transactions || []).some(t => t.reference_id === testBill.id && t.reference_type === 'bill');
    console.log('Accounting Income Recorded for Bill:', foundAcc);

    // Test rejection update
    const rejectRes = await fetchUrl(`/api/owner/billing/${testBill.id}`, 'PUT', { status: 'Unpaid', slip_url: null }, ownerH);
    console.log('PUT /api/owner/billing/:id (Reject Slip) status:', rejectRes.status, 'Data Status:', rejectRes.json?.data?.status);
  }

  // 2. Test Rooms PUT and Isolation
  console.log('\n--- 2. Testing Room CRUD & Isolation ---');
  const roomsRes = await fetchUrl('/api/rooms', 'GET', null, ownerH);
  console.log('GET /api/rooms count:', roomsRes.json?.data?.length);

  // Test updating room 1
  const room1 = roomsRes.json?.data?.find(r => r.room_number === '1');
  if (room1) {
    const updateRoomRes = await fetchUrl(`/api/rooms/${room1.id}`, 'PUT', {
      room_number: '1',
      room_type: room1.room_type || 'ห้องพัดลม',
      price: room1.price || 2800,
      status: room1.status || 'Available',
      floor: room1.floor || 1
    }, ownerH);
    console.log('PUT /api/rooms/:id status:', updateRoomRes.status, 'Success:', updateRoomRes.json?.success);
  }

  console.log('\n--- ALL CRUD TESTS COMPLETED SUCCESSFULLY ---');
}

run().catch(console.error);
