const fs = require('fs');
const path = require('path');

function getAllFiles(dir, exts = ['.ts', '.js']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', '.next', '.git'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) results = results.concat(getAllFiles(fullPath, exts));
    else if (exts.includes(path.extname(fullPath))) results.push(fullPath);
  }
  return results;
}

async function testAllGetEndpoints() {
  const apiFiles = getAllFiles('app/api');
  console.log(`Found ${apiFiles.length} API files. Testing all GET handlers...`);

  const results = [];

  for (const file of apiFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.includes('export async function GET') && !content.includes('export function GET')) {
      continue;
    }

    // Determine route URL
    let routePath = path.relative(path.join(process.cwd(), 'app', 'api'), path.dirname(file)).replace(/\\/g, '/');
    let url = 'http://localhost:3001/api' + (routePath ? '/' + routePath : '');

    // Replace dynamic params with dummy valid values
    url = url.replace(/\[id\]/g, '1')
             .replace(/\[dormId\]/g, '1')
             .replace(/\[\.\.\.nextauth\]/g, 'session');

    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      let json = null;
      let text = '';
      try {
        text = await res.text();
        json = JSON.parse(text);
      } catch (e) {}

      results.push({
        url,
        status: res.status,
        success: json?.success,
        error: json?.error || json?.message || (res.status === 500 ? text.slice(0, 150) : null)
      });
    } catch (err) {
      results.push({
        url,
        status: 'FETCH_ERROR',
        error: err.message
      });
    }
  }

  console.log('\n=== TEST RESULTS SUMMARY ===');
  const errors500 = results.filter(r => r.status === 500);
  const unauth401 = results.filter(r => [401, 403].includes(r.status));
  const badReq400 = results.filter(r => r.status === 400);
  const success200 = results.filter(r => r.status === 200);

  console.log(`200 OK: ${success200.length}`);
  console.log(`401/403 Protected: ${unauth401.length}`);
  console.log(`400 Bad Request: ${badReq400.length}`);
  console.log(`500 SERVER ERRORS: ${errors500.length}`);

  if (errors500.length > 0) {
    console.log('\n❌ DETECTED 500 INTERNAL SERVER ERRORS:');
    for (const err of errors500) {
      console.log(`- ${err.url} -> ${err.error}`);
    }
  }

  fs.writeFileSync('scripts/get-endpoints-audit.json', JSON.stringify(results, null, 2));
}

testAllGetEndpoints().catch(console.error);
