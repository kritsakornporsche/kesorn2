const fs = require('fs');
const path = require('path');

function getAllFiles(dir, exts = ['.ts', '.tsx', '.js']) {
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
const libFiles = getAllFiles('lib');
const allFiles = [...apiFiles, ...libFiles];

console.log('=== SCANNING FOR RAW SQL CONCATENATIONS / POTENTIAL INJECTIONS ===');

const suspiciousQueries = [];

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');

  // Match pool.query(`... ${var} ...`) or conn.query(`... ${var} ...`) where string templates are interpolated directly without ?
  const rawQueryRegex = /(?:pool|conn|sql)\.query\(\s*`[^`]*\$\{[^}]+\}[^`]*`/g;
  let match;
  while ((match = rawQueryRegex.exec(content)) !== null) {
    suspiciousQueries.push({
      file: rel,
      snippet: match[0].slice(0, 120)
    });
  }

  // Also check if any query has manual string concat: 'SELECT ... ' + var
  const stringConcatSql = /(?:SELECT|INSERT|UPDATE|DELETE)[^;]+?\+\s*[a-zA-Z0-9_.]+/gi;
  let m2;
  while ((m2 = stringConcatSql.exec(content)) !== null) {
    suspiciousQueries.push({
      file: rel,
      snippet: m2[0].slice(0, 100)
    });
  }
}

console.log(`Found ${suspiciousQueries.length} suspicious query patterns:`);
for (const sq of suspiciousQueries) {
  console.log(`- [${sq.file}]: ${sq.snippet.replace(/\s+/g, ' ')}`);
}
