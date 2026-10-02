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
const hiddenActions = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  // Match elements that have hidden md: or hidden sm:
  const regex = /<(button|Link|a)\s+[^>]*className=["'][^"']*hidden\s+(md|sm|lg):[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const tag = match[1];
    const inner = match[3].trim().replace(/\s+/g, ' ');
    const full = match[0];
    hiddenActions.push({
      file: f,
      tag,
      inner: inner.slice(0, 80),
      full: full.slice(0, 150)
    });
  }
});

console.log('=== HIDDEN BUTTONS / ACTIONS ON MOBILE AUDIT ===');
console.log(`Found ${hiddenActions.length} hidden button elements.`);
hiddenActions.forEach(h => {
  console.log(`🔍 [${h.file}] <${h.tag}>: ${h.inner}`);
  console.log(`   ${h.full}\n`);
});
