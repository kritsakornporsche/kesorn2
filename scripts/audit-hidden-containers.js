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
const hiddenContainersWithButtons = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  // Match div or nav or section with hidden md: or hidden sm:
  const regex = /<(\w+)[^>]*className=["'][^"']*hidden\s+(md|sm|lg):[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const inner = match[3];
    if (inner.includes('<button') || inner.includes('<Link') || inner.includes('onClick=')) {
      // Find what buttons are inside
      const btnMatches = inner.match(/<(button|Link)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
      const btnSummaries = btnMatches.map(b => b.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ')).filter(Boolean);
      
      hiddenContainersWithButtons.push({
        file: f,
        tag: match[1],
        buttons: btnSummaries.slice(0, 5)
      });
    }
  }
});

console.log('=== CONTAINERS HIDDEN ON MOBILE CONTAINING BUTTONS ===');
console.log(`Found ${hiddenContainersWithButtons.length} hidden containers.`);
hiddenContainersWithButtons.forEach(h => {
  console.log(`🔍 [${h.file}] <${h.tag}> buttons: ${h.buttons.join(' | ')}`);
});
