const http = require('http');

const BASE_URL = 'http://localhost:3001';

async function login(email, password) {
  // 1. Get CSRF Token
  const csrfRes = await fetchUrl('/api/auth/csrf');
  const csrfToken = csrfRes.json?.csrfToken;
  if (!csrfToken) {
    console.error('Failed to get csrf token');
    return null;
  }
  const cookies = (csrfRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

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

function fetchUrl(pathname, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(pathname, BASE_URL);
    const reqHeaders = { ...headers };
    if (body && typeof body === 'object') {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const req = http.request(url, { method, headers: reqHeaders, timeout: 10000 }, (res) => {
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

async function testProtected() {
  console.log('Testing Owner login...');
  const ownerCookie = await login('owner@kesorn.com', 'owner');
  console.log('Owner cookie obtained:', Boolean(ownerCookie));

  if (ownerCookie) {
    const statsRes = await fetchUrl('/api/owner/stats', 'GET', null, { Cookie: ownerCookie });
    console.log('GET /api/owner/stats:', statsRes.status, statsRes.json);

    const settingsRes = await fetchUrl('/api/owner/settings', 'GET', null, { Cookie: ownerCookie });
    console.log('GET /api/owner/settings:', settingsRes.status, settingsRes.json?.name);

    const metersRes = await fetchUrl('/api/owner/meters', 'GET', null, { Cookie: ownerCookie });
    console.log('GET /api/owner/meters:', metersRes.status, 'Meters count:', metersRes.json?.readings?.length || metersRes.json?.data?.length);

    const billingRes = await fetchUrl('/api/owner/billing', 'GET', null, { Cookie: ownerCookie });
    console.log('GET /api/owner/billing:', billingRes.status, 'Bills count:', billingRes.json?.bills?.length || billingRes.json?.data?.length);

    const maintRes = await fetchUrl('/api/owner/maintenance', 'GET', null, { Cookie: ownerCookie });
    console.log('GET /api/owner/maintenance:', maintRes.status, 'Maint count:', maintRes.json?.requests?.length || maintRes.json?.data?.length);

    const keepersRes = await fetchUrl('/api/keepers', 'GET', null, { Cookie: ownerCookie });
    console.log('GET /api/keepers:', keepersRes.status, 'Keepers count:', keepersRes.json?.data?.length);
  }

  console.log('\nTesting Tenant login...');
  const tenantCookie = await login('tenant@kesorn.com', 'tenant');
  console.log('Tenant cookie obtained:', Boolean(tenantCookie));

  if (tenantCookie) {
    const tenantMe = await fetchUrl('/api/tenant/me', 'GET', null, { Cookie: tenantCookie });
    console.log('GET /api/tenant/me:', tenantMe.status, tenantMe.json?.data?.name);

    const tenantRoom = await fetchUrl('/api/tenant/room', 'GET', null, { Cookie: tenantCookie });
    console.log('GET /api/tenant/room:', tenantRoom.status, tenantRoom.json?.data?.room_number);

    const evalRes = await fetchUrl('/api/tenant/evaluation', 'GET', null, { Cookie: tenantCookie });
    console.log('GET /api/tenant/evaluation:', evalRes.status, evalRes.json);
  }
}

testProtected().catch(console.error);
