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

const apiFiles = getAllFiles('app/api');
console.log('=== MUTATION ENDPOINTS WITHOUT AUTH() CHECK ===\n');

for (const file of apiFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const mutations = content.match(/export\s+async\s+function\s+(POST|PUT|DELETE|PATCH)/g);
  if (mutations) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    if (rel.startsWith('app/api/auth/login') || rel.startsWith('app/api/auth/signup') || rel.startsWith('app/api/auth/verify-email') || rel.startsWith('app/api/auth/[...nextauth]')) {
      continue;
    }
    const hasAuth = content.includes('auth()');
    if (!hasAuth) {
      console.log(`[NO AUTH] ${rel} -> [${mutations.map(m => m.split(' ').pop()).join(', ')}]`);
    } else {
      const hasCheck = content.includes('if (!session') || content.includes('if (!session?.user') || content.includes('if (!session.user');
      if (!hasCheck) {
        console.log(`[AUTH CALLED BUT UNCHECKED] ${rel}`);
      }
    }
  }
}
