const fs = require('fs');
const path = require('path');

// Test accounts
const ACCOUNTS = {
  owner: { email: 'owner@kesorn.com', password: 'owner', role: 'owner' },
  tenant: { email: 'tenant@kesorn.com', password: 'tenant', role: 'tenant' },
  maid: { email: 'maid@kesorn.com', password: 'maid', role: 'keeper' },
  tech: { email: 'technician@kesorn.com', password: 'technician', role: 'keeper' },
  admin: { email: 'admin@smartdom.com', password: 'admin', role: 'platform_admin' },
};

async function getNextAuthCookie(email, password) {
  // 1. Get CSRF token
  const csrfRes = await fetch('http://localhost:3001/api/auth/csrf');
  const csrfCookie = csrfRes.headers.get('set-cookie') || '';
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;

  // Extract cookies
  const cookies = [];
  for (const c of csrfRes.headers.getSetCookie()) {
    cookies.push(c.split(';')[0]);
  }

  // 2. Sign in via Credentials callback
  const body = new URLSearchParams();
  body.append('csrfToken', csrfToken);
  body.append('email', email);
  body.append('password', password);
  body.append('redirect', 'false');
  body.append('json', 'true');

  const signinRes = await fetch('http://localhost:3001/api/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies.join('; '),
    },
    body: body.toString(),
    redirect: 'manual'
  });

  for (const c of signinRes.headers.getSetCookie()) {
    cookies.push(c.split(';')[0]);
  }

  return cookies.join('; ');
}

async function runAuthenticatedAudit() {
  console.log('=== STARTING AUTHENTICATED ROLE AUDIT ===\n');

  const endpointsToTest = [
    // Owner endpoints
    { role: 'owner', url: 'http://localhost:3001/api/owner/stats' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/bookings' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/contracts' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/contracts/1' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/billing' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/accounting' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/meters' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/maintenance' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/move-out' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/refund-requests' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/rules' },
    { role: 'owner', url: 'http://localhost:3001/api/owner/settings' },
    { role: 'owner', url: 'http://localhost:3001/api/chat/conversations' },
    { role: 'owner', url: 'http://localhost:3001/api/notifications' },

    // Tenant endpoints
    { role: 'tenant', url: 'http://localhost:3001/api/tenant/me' },
    { role: 'tenant', url: 'http://localhost:3001/api/tenant/room' },
    { role: 'tenant', url: 'http://localhost:3001/api/tenant/billing/list' },
    { role: 'tenant', url: 'http://localhost:3001/api/tenant/maintenance' },
    { role: 'tenant', url: 'http://localhost:3001/api/tenant/move-out' },
    { role: 'tenant', url: 'http://localhost:3001/api/tenant/rules' },
    { role: 'tenant', url: 'http://localhost:3001/api/tenant/evaluation' },
    { role: 'tenant', url: 'http://localhost:3001/api/chat/conversations' },
    { role: 'tenant', url: 'http://localhost:3001/api/notifications' },

    // Keeper endpoints
    { role: 'maid', url: 'http://localhost:3001/api/keeper/maid/jobs' },
    { role: 'maid', url: 'http://localhost:3001/api/keeper/dorms' },
    { role: 'tech', url: 'http://localhost:3001/api/keeper/technician/jobs' },
    { role: 'tech', url: 'http://localhost:3001/api/keeper/dorms' },

    // Platform endpoints
    { role: 'admin', url: 'http://localhost:3001/api/platform/dashboard' },
    { role: 'admin', url: 'http://localhost:3001/api/platform/accounting' },
    { role: 'admin', url: 'http://localhost:3001/api/platform/dormitories' },
    { role: 'admin', url: 'http://localhost:3001/api/platform/tenants' },
  ];

  const sessionCookies = {};
  for (const [key, acc] of Object.entries(ACCOUNTS)) {
    try {
      const cookie = await getNextAuthCookie(acc.email, acc.password);
      sessionCookies[key] = cookie;
      console.log(`✅ Authenticated session obtained for: ${key} (${acc.email})`);
    } catch (e) {
      console.error(`❌ Failed to obtain session for ${key}:`, e.message);
    }
  }

  console.log('\nTesting role-protected endpoints...');
  const auditFindings = [];

  for (const item of endpointsToTest) {
    const cookie = sessionCookies[item.role];
    try {
      const res = await fetch(item.url, {
        headers: {
          'Cookie': cookie || '',
          'Accept': 'application/json'
        }
      });
      let data = null;
      let text = '';
      try {
        text = await res.text();
        data = JSON.parse(text);
      } catch (e) {}

      const isError = res.status >= 400;
      console.log(`[${item.role.toUpperCase()}] ${item.url.replace('http://localhost:3001', '')} -> Status ${res.status} ${isError ? '❌' : '✅'}`);
      
      if (isError) {
        auditFindings.push({
          role: item.role,
          url: item.url,
          status: res.status,
          error: data?.error || data?.message || text.slice(0, 200)
        });
      }
    } catch (err) {
      console.error(`Error requesting ${item.url}:`, err.message);
      auditFindings.push({
        role: item.role,
        url: item.url,
        status: 'FETCH_ERROR',
        error: err.message
      });
    }
  }

  console.log(`\nAudit finished with ${auditFindings.length} failing authenticated endpoints:`);
  for (const f of auditFindings) {
    console.log(`- [${f.role}] ${f.url} (${f.status}): ${f.error}`);
  }

  fs.writeFileSync('scripts/authenticated-audit-results.json', JSON.stringify(auditFindings, null, 2));
}

runAuthenticatedAudit().catch(console.error);
