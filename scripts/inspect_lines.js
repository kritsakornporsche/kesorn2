const fs = require('fs');
let content = fs.readFileSync('app/tenant/billing/page.tsx', 'utf8');

const lines = content.split(/\r?\n/);
console.log('Total lines:', lines.length);

// Let's print lines 260 to 285
for (let i = 260; i < 285; i++) {
  console.log(i + 1, JSON.stringify(lines[i]));
}
