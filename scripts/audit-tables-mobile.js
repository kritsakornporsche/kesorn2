const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(file)) {
        results = results.concat(walk(full));
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('./app');
const tableFindings = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    if (line.includes('<table')) {
      // Look back 5 lines for wrapper div
      const prev5 = lines.slice(Math.max(0, idx - 5), idx).join('\n');
      const hasOverflowX = prev5.includes('overflow-x-auto') || prev5.includes('overflow-x-scroll') || prev5.includes('overflow-auto');
      
      tableFindings.push({
        file: f,
        line: idx + 1,
        hasOverflowX,
        snippet: line.trim(),
        wrapper: prev5.trim()
      });
    }
  });
});

console.log('=== TABLE RESPONSIVENESS AUDIT ===');
console.log(`Found ${tableFindings.length} tables total.`);
const brokenTables = tableFindings.filter(t => !t.hasOverflowX);
console.log(`Tables WITHOUT overflow-x wrapper: ${brokenTables.length}`);
brokenTables.forEach(t => {
  console.log(`❌ [NO_OVERFLOW_X] ${t.file}:${t.line}`);
  console.log(`   Table line: ${t.snippet}`);
  console.log(`   Prev lines:\n${t.wrapper}\n`);
});
