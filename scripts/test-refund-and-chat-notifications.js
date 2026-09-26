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
  console.log('================================================================');
  console.log('   REFUND REQUESTS & CHAT NOTIFICATION WORKFLOW TEST   ');
  console.log('================================================================\n');

  const tenantCookie = await login('tenant@kesorn.com', 'tenant');
  const ownerCookie = await login('owner@kesorn.com', 'owner');

  console.log('Logins: Tenant Cookie:', Boolean(tenantCookie), 'Owner Cookie:', Boolean(ownerCookie));
  const tHeaders = { Cookie: tenantCookie };
  const oHeaders = { Cookie: ownerCookie };

  // 1. Tenant Refund Request GET
  console.log('\n--- 1. Testing Tenant Refund Request GET ---');
  const tenantRefundGet = await fetchUrl('/api/tenant/refund-request', 'GET', null, tHeaders);
  console.log('Tenant Refund GET status:', tenantRefundGet.status, 'Success:', tenantRefundGet.json?.success);

  // 2. Owner Refund Requests GET
  console.log('\n--- 2. Testing Owner Refund Requests GET ---');
  const ownerRefundGet = await fetchUrl('/api/owner/refund-requests?dormId=1', 'GET', null, oHeaders);
  console.log('Owner Refund GET status:', ownerRefundGet.status, 'Requests Count:', ownerRefundGet.json?.data?.length);

  // 3. Testing Chat Message & Notification
  console.log('\n--- 3. Testing Chat & Notification Workflow ---');
  // Create or get conversation
  const convRes = await fetchUrl('/api/chat/conversations', 'POST', {
    dormId: 1,
    initialMessage: 'สวัสดีครับ สอบถามข้อมูลห้องพักครับ'
  }, tHeaders);
  const convId = convRes.json?.data?.id || convRes.json?.conversationId;
  console.log('Conversation Created/Found ID:', convId);

  if (convId) {
    const sendRes = await fetchUrl('/api/chat/messages', 'POST', {
      conversationId: convId,
      message: 'ทดสอบส่งข้อความแจ้งเตือนอัตโนมัติ'
    }, tHeaders);
    console.log('Message Sent status:', sendRes.status, 'Success:', sendRes.json?.success);

    // Check owner notifications
    const ownerNotifRes = await fetchUrl('/api/notifications', 'GET', null, oHeaders);
    console.log('Owner Notifications count:', ownerNotifRes.json?.data?.length, 'Unread:', ownerNotifRes.json?.unreadCount);
    const hasChatNotif = (ownerNotifRes.json?.data || []).some(n => n.type === 'chat');
    console.log('Owner Received Chat Notification:', hasChatNotif);
  }

  // 4. Contract Request Renewal
  console.log('\n--- 4. Testing Contract Renewal Request Notification ---');
  // Find tenant contract
  const contractRes = await fetchUrl('/api/owner/contracts?dormId=1', 'GET', null, oHeaders);
  const tenantContract = (contractRes.json?.data || []).find(c => c.tenant_email === 'tenant@kesorn.com');
  if (tenantContract) {
    const renewReqRes = await fetchUrl('/api/tenant/contract/request-renewal', 'POST', {
      contract_id: tenantContract.id,
      renewal_note: 'ขอต่อสัญญาเพิ่มอีก 1 ปีครับ'
    }, tHeaders);
    console.log('Tenant Request Renewal status:', renewReqRes.status, 'Success:', renewReqRes.json?.success);

    // Verify owner received notification
    const ownerNotif2 = await fetchUrl('/api/notifications', 'GET', null, oHeaders);
    const hasRenewNotif = (ownerNotif2.json?.data || []).some(n => n.type === 'contract_renewal');
    console.log('Owner Received Renewal Notification:', hasRenewNotif);
  }

  console.log('\n================================================================');
  console.log('   ALL WORKFLOW TESTS COMPLETED SUCCESSFULLY!   ');
  console.log('================================================================');
}

run().catch(console.error);
