const fs = require('fs');
const path = require('path');

function getAllFiles(dir, exts = ['.tsx', '.jsx']) {
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

// 1. Collect all valid page routes in app/
const allPageFiles = getAllFiles('app');
const validRoutes = new Set();

for (const f of allPageFiles) {
  if (path.basename(f).startsWith('page.')) {
    let rel = path.relative(path.join(process.cwd(), 'app'), path.dirname(f)).replace(/\\/g, '/');
    validRoutes.add(rel === '' ? '/' : '/' + rel);
  }
}

console.log(`Discovered ${validRoutes.size} page routes in app/ directory:`);
for (const r of Array.from(validRoutes).sort()) {
  console.log(' - ' + r);
}

// 2. Scan all href="..." in components and pages
const brokenLinks = [];
for (const f of allPageFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const relPath = path.relative(process.cwd(), f).replace(/\\/g, '/');

  // Regex for Link href="..." or <a href="..."
  const hrefMatches = content.match(/href\s*=\s*["'`]([^"'`#?]+)["'`?#]/g);
  if (hrefMatches) {
    for (const hm of hrefMatches) {
      const match = hm.match(/href\s*=\s*["'`]([^"'`#?]+)/);
      if (match) {
        let target = match[1];
        if (target.startsWith('/') && !target.startsWith('/api') && !target.startsWith('/images') && !target.startsWith('/favicon')) {
          // Check dynamic match
          let normalized = target.replace(/\/(\d+)(\/|$)/g, '/[id]$2');
          let exists = false;
          for (const vr of validRoutes) {
            const regexStr = '^' + vr.replace(/\[\w+\]/g, '[^/]+') + '$';
            if (new RegExp(regexStr).test(target) || vr === target || vr === normalized) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            brokenLinks.push({ file: relPath, target, raw: hm });
          }
        }
      }
    }
  }
}

console.log(`\nFound ${brokenLinks.length} potentially broken client-side links:`);
for (const bl of brokenLinks) {
  console.log(`  ${bl.file} -> ${bl.target}`);
}
