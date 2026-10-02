const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function getDbSchema() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  const [tables] = await conn.query("SHOW TABLES");
  const tableNames = tables.map(r => Object.values(r)[0]);

  const schema = {};
  for (const t of tableNames) {
    const [cols] = await conn.query(`DESCRIBE \`${t}\``);
    schema[t] = cols.map(c => ({
      field: c.Field,
      type: c.Type,
      null: c.Null,
      key: c.Key,
      default: c.Default,
      extra: c.Extra
    }));
  }

  await conn.end();
  return { tableNames, schema };
}

function getAllFiles(dir, exts = ['.ts', '.tsx', '.js', '.jsx']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', '.next', '.git', 'dist', 'out'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, exts));
    } else {
      if (exts.includes(path.extname(fullPath))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

async function runAudit() {
  console.log('=== STARTING DEEP SYSTEM AUDIT SCANNER ===\n');
  const { tableNames, schema } = await getDbSchema();
  console.log(`Discovered ${tableNames.length} tables in kesorn_db.`);

  const apiFiles = getAllFiles(path.join(process.cwd(), 'app', 'api'));
  const allAppFiles = getAllFiles(path.join(process.cwd(), 'app'));
  const libFiles = getAllFiles(path.join(process.cwd(), 'lib'));
  const componentFiles = getAllFiles(path.join(process.cwd(), 'components'));

  console.log(`Scanned ${apiFiles.length} API route files.`);
  console.log(`Scanned ${allAppFiles.length} total App files.`);

  const findings = {
    unknownTablesInQueries: [],
    suspiciousColumns: [],
    multiQueryWithoutTransaction: [],
    missingTryCatchRoutes: [],
    hardcodedDormId: [],
    frontendBrokenApiRoutes: [],
    missingRoleFallback: [],
    unhandledNumberParsing: []
  };

  // 1. Check API Route Files for:
  // - Missing try-catch
  // - Multiple mutation queries without transaction
  // - Hardcoded dorm_id
  for (const file of apiFiles) {
    const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');

    // Check HTTP handlers
    const handlers = content.match(/export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(/g);
    if (handlers) {
      for (const h of handlers) {
        const method = h.match(/(GET|POST|PUT|DELETE|PATCH)/)[0];
        // simple heuristic: does handler body have try { ... } catch
        // Find handler index
        const idx = content.indexOf(h);
        const nextIdx = content.indexOf('export async function', idx + h.length);
        const handlerBlock = nextIdx !== -1 ? content.slice(idx, nextIdx) : content.slice(idx);
        if (!handlerBlock.includes('try {') && !handlerBlock.includes('try{')) {
          findings.missingTryCatchRoutes.push({ file: relPath, method });
        }
      }
    }

    // Check multiple mutation queries without transaction
    const mutationMatches = content.match(/(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\s+[`a-zA-Z0-9_]+/gi);
    if (mutationMatches && mutationMatches.length > 1) {
      if (!content.includes('beginTransaction') && !content.includes('START TRANSACTION')) {
        findings.multiQueryWithoutTransaction.push({
          file: relPath,
          mutations: mutationMatches.length,
          snippet: mutationMatches.slice(0, 3).join(', ')
        });
      }
    }

    // Check hardcoded dorm_id = 1
    const hardcodedMatch = content.match(/(dorm_id\s*=\s*1\b|dorm_id:\s*1\b|dormId\s*=\s*1\b|dormId:\s*1\b)/g);
    if (hardcodedMatch) {
      findings.hardcodedDormId.push({
        file: relPath,
        occurrences: hardcodedMatch.length
      });
    }

    // Check unhandled parseInt / parseFloat without fallback or NaN check
    const parseMatches = content.match(/(parseInt|parseFloat|Number)\([^)]+\)(?!\s*\|\|\s*\d+)/g);
    // Specifically check for things like parseInt(id) without NaN check
    if (content.includes('parseInt(') && !content.includes('isNaN') && !content.includes('|| 0')) {
      // check if it's in a where clause or params
      const suspiciousParse = content.match(/const\s+\w+\s*=\s*(parseInt|parseFloat|Number)\([^)]+\);/g);
      if (suspiciousParse) {
        findings.unhandledNumberParsing.push({
          file: relPath,
          snippets: suspiciousParse.slice(0, 2)
        });
      }
    }
  }

  // 2. Scan SQL queries for table and column existence
  const sqlFiles = [...apiFiles, ...libFiles];
  for (const file of sqlFiles) {
    const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');

    // Extract table names from FROM `tbl`, JOIN `tbl`, INTO `tbl`, UPDATE `tbl`
    const tableRegex = /(?:FROM|JOIN|INTO|UPDATE)\s+[`]?([a-zA-Z0-9_]+)[`]?/gi;
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      const tbl = match[1].toLowerCase();
      // Skip SQL keywords or alias words
      if (['select', 'where', 'set', 'values', 'left', 'inner', 'right', 'outer', 'join', 'as', 'table', 'dual'].includes(tbl)) continue;
      if (!tableNames.includes(tbl)) {
        findings.unknownTablesInQueries.push({
          file: relPath,
          table: tbl
        });
      }
    }
  }

  // 3. Scan Frontend Files for fetch routes
  const existingApiRoutes = new Set();
  for (const file of apiFiles) {
    let route = path.relative(path.join(process.cwd(), 'app', 'api'), path.dirname(file)).replace(/\\/g, '/');
    if (path.basename(file).startsWith('route.')) {
      existingApiRoutes.add('/api' + (route ? '/' + route : ''));
    }
  }

  console.log(`Indexed ${existingApiRoutes.size} API endpoints in Next.js router.`);

  // Check frontend fetch calls
  const clientFiles = [...allAppFiles.filter(f => !f.includes('app\\api')), ...componentFiles];
  for (const file of clientFiles) {
    const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');

    // match fetch('/api/...') or axios.get('/api/...')
    const fetchMatches = content.match(/fetch\(\s*[`'"](\/api\/[^`'"]+)[`'"]/g);
    if (fetchMatches) {
      for (const fm of fetchMatches) {
        const urlMatch = fm.match(/[`'"](\/api\/[^`'"?#]+)[`'"?#]/);
        if (urlMatch) {
          let url = urlMatch[1];
          // Handle dynamic routes like /api/rooms/${id} or /api/dorms/[id]
          // Normalize dynamic segments
          let normalized = url.replace(/\$\{[^}]+\}/g, '[id]').replace(/\/(\d+)(\/|$)/g, '/[id]$2');
          
          // Check if normalized url or url exists in existingApiRoutes or matches a dynamic route
          let found = false;
          for (const er of existingApiRoutes) {
            // regex match er with dynamic parts
            const regexStr = '^' + er.replace(/\[\w+\]/g, '[^/]+') + '$';
            if (new RegExp(regexStr).test(url) || er === normalized || er === url) {
              found = true;
              break;
            }
          }
          if (!found) {
            findings.frontendBrokenApiRoutes.push({
              file: relPath,
              targetUrl: url,
              raw: fm
            });
          }
        }
      }
    }
  }

  // Output summary
  console.log('\n========================================');
  console.log('AUDIT SCAN RESULTS SUMMARY:');
  console.log('========================================');
  console.log(`Unknown Tables referenced in SQL: ${findings.unknownTablesInQueries.length}`);
  console.log(`Multi-query mutations without explicit transaction: ${findings.multiQueryWithoutTransaction.length}`);
  console.log(`API Handlers missing try-catch block: ${findings.missingTryCatchRoutes.length}`);
  console.log(`Hardcoded dorm_id references: ${findings.hardcodedDormId.length}`);
  console.log(`Suspicious/Broken Frontend API calls: ${findings.frontendBrokenApiRoutes.length}`);
  console.log(`Unhandled number parsing: ${findings.unhandledNumberParsing.length}`);

  fs.writeFileSync('scripts/audit-scan-results.json', JSON.stringify(findings, null, 2));
  console.log('\nResults written to scripts/audit-scan-results.json');
}

runAudit().catch(console.error);
