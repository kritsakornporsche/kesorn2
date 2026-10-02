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
console.log('Total TSX/JSX UI files in app/:', files.length);

const issues = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    
    // Check modals
    if ((line.includes('fixed inset-0') || line.includes('fixed z-50 inset-0') || line.includes('fixed z-[60] inset-0')) && 
        !content.includes('overflow-y-auto') && !content.includes('overflow-auto')) {
      issues.push({ file: f, line: lineNum, type: 'MODAL_NO_SCROLL', snippet: line.trim() });
    }
    
    // Check buttons with hidden on mobile (hidden md:block / hidden md:flex / hidden sm:block)
    if (line.includes('<button') || line.includes('<Link') || line.includes('type="submit"')) {
      if (/className=["'][^"']*hidden\s+(md|sm|lg):(inline|block|flex|inline-flex)[^"']*["']/.test(line)) {
        issues.push({ file: f, line: lineNum, type: 'BUTTON_HIDDEN_ON_MOBILE', snippet: line.trim() });
      }
    }
    
    // Check tables without overflow
    if (line.includes('<table') && !content.includes('overflow-x-auto') && !content.includes('overflow-x-scroll')) {
      issues.push({ file: f, line: lineNum, type: 'TABLE_NO_HORIZONTAL_SCROLL', snippet: line.trim() });
    }
    
    // Check h-screen overflow-hidden
    if (/className=["'][^"']*h-screen[^"']*overflow-hidden[^"']*["']/.test(line)) {
      issues.push({ file: f, line: lineNum, type: 'H_SCREEN_OVERFLOW_HIDDEN', snippet: line.trim() });
    }

    // Check fixed bottom buttons without bottom nav safe area
    if (line.includes('fixed bottom-0') || line.includes('fixed bottom-4')) {
      issues.push({ file: f, line: lineNum, type: 'FIXED_BOTTOM_ELEMENT', snippet: line.trim() });
    }
  });
});

console.log('Total detected UI points:', issues.length);
issues.forEach(i => console.log(`[${i.type}] ${i.file}:${i.line}\n  Snippet: ${i.snippet.slice(0, 100)}\n`));
