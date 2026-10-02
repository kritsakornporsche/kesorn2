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

const files = walk('./app').concat(walk('./components'));
console.log('Total files to check:', files.length);

const modalFindings = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    if (line.includes('fixed inset-0') && (line.includes('z-50') || line.includes('z-[') || line.includes('backdrop-blur') || line.includes('bg-black'))) {
      // Find the next 15 lines (the modal dialog card)
      const next15 = lines.slice(idx, idx + 15).join('\n');
      
      const hasOverflowAuto = next15.includes('overflow-y-auto') || next15.includes('overflow-auto');
      const hasMaxH = next15.includes('max-h-');
      
      modalFindings.push({
        file: f,
        line: idx + 1,
        snippet: line.trim(),
        hasOverflowAuto,
        hasMaxH,
        risk: (!hasOverflowAuto || !hasMaxH) ? 'HIGH' : 'LOW'
      });
    }
  });
});

console.log('=== MODAL AUDIT RESULTS ===');
const highRiskModals = modalFindings.filter(m => m.risk === 'HIGH');
console.log(`Found ${modalFindings.length} modals total. High risk modals: ${highRiskModals.length}`);
highRiskModals.forEach(m => {
  console.log(`[${m.risk}] ${m.file}:${m.line}`);
  console.log(`   Snippet: ${m.snippet.slice(0, 90)}`);
  console.log(`   hasOverflowAuto: ${m.hasOverflowAuto}, hasMaxH: ${m.hasMaxH}\n`);
});
