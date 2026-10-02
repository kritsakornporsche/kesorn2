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

const findings = {
  modalNoScroll: [],
  pageContainerScrollTrap: [],
  bottomNavCollision: [],
  hiddenMobileButtons: [],
  tableNoOverflowX: [],
  rigidGridMobileCollapse: [],
  flexCenterNegativeScrollTrap: []
};

files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // 1. Modals without scroll
  // Find fixed overlay
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('fixed inset-0') || line.includes('fixed z-50 inset-0') || line.includes('fixed z-[60] inset-0') || line.includes('fixed z-40 inset-0')) {
      // Look ahead up to 25 lines for modal card
      const modalBlock = lines.slice(i, i + 35).join('\n');
      const hasOverflowY = modalBlock.includes('overflow-y-auto') || modalBlock.includes('overflow-auto');
      const hasMaxH = modalBlock.includes('max-h-') || modalBlock.includes('h-full') || modalBlock.includes('h-screen');
      const hasFlexCenter = line.includes('items-center') || modalBlock.includes('items-center');
      
      // If it doesn't have overflow-y-auto, flag it
      if (!hasOverflowY) {
        // Check if there are form inputs or buttons inside
        const hasInputs = modalBlock.includes('<input') || modalBlock.includes('<textarea') || modalBlock.includes('<select') || modalBlock.includes('<button');
        findings.modalNoScroll.push({
          file: filePath,
          line: i + 1,
          hasInputs,
          snippet: line.trim()
        });
      }

      // Check flex center trap (when overflow-y-auto is on the items-center container)
      if (hasOverflowY && hasFlexCenter && (line.includes('items-center') || lines[i+1]?.includes('items-center'))) {
        findings.flexCenterNegativeScrollTrap.push({
          file: filePath,
          line: i + 1,
          snippet: line.trim()
        });
      }
    }
  }

  // 2. Page Container Scroll Traps (overflow-hidden or h-screen on root/main containers)
  lines.forEach((line, idx) => {
    if (line.includes('h-screen') && line.includes('overflow-hidden') && !filePath.includes('layout.tsx')) {
      findings.pageContainerScrollTrap.push({
        file: filePath,
        line: idx + 1,
        snippet: line.trim()
      });
    }
  });

  // 3. Fixed Bottom Overlays (TenantBottomNav is z-40 fixed bottom-0)
  lines.forEach((line, idx) => {
    if ((line.includes('fixed bottom-0') || line.includes('fixed bottom-2') || line.includes('fixed bottom-4')) && !filePath.includes('BottomNav')) {
      findings.bottomNavCollision.push({
        file: filePath,
        line: idx + 1,
        snippet: line.trim()
      });
    }
  });

  // 4. Hidden Buttons on Mobile
  lines.forEach((line, idx) => {
    if ((line.includes('<button') || line.includes('<Link') || line.includes('type="submit"')) && 
        /className=["'][^"']*\bhidden\s+(sm|md|lg):(inline|block|flex|inline-flex)\b[^"']*["']/.test(line)) {
      findings.hiddenMobileButtons.push({
        file: filePath,
        line: idx + 1,
        snippet: line.trim()
      });
    }
  });

  // 5. Tables without overflow-x-auto
  lines.forEach((line, idx) => {
    if (line.includes('<table')) {
      // Look back 5 lines for overflow-x-auto
      const contextBefore = lines.slice(Math.max(0, idx - 6), idx).join('\n');
      if (!contextBefore.includes('overflow-x-auto') && !contextBefore.includes('overflow-x-scroll')) {
        findings.tableNoOverflowX.push({
          file: filePath,
          line: idx + 1,
          snippet: line.trim()
        });
      }
    }
  });

  // 6. Rigid multi-column grids that don't stack on mobile
  lines.forEach((line, idx) => {
    if (/className=["'][^"']*\bgrid-cols-(2|3|4|5|6)\b[^"']*["']/.test(line)) {
      // Check if it has mobile single col like 'grid-cols-1 md:grid-cols-...'
      const cls = line.match(/className=["']([^"']*)["']/);
      if (cls && !cls[1].includes('grid-cols-1') && !cls[1].includes('sm:grid-cols') && !cls[1].includes('md:grid-cols')) {
        findings.rigidGridMobileCollapse.push({
          file: filePath,
          line: idx + 1,
          snippet: line.trim()
        });
      }
    }
  });
});

console.log('=== AUDIT COMPLETE ===');
console.log('Modals without scroll:', findings.modalNoScroll.length);
console.log('Flex center negative scroll traps:', findings.flexCenterNegativeScrollTrap.length);
console.log('Page container scroll traps:', findings.pageContainerScrollTrap.length);
console.log('Fixed bottom elements (risk of bottom nav collision):', findings.bottomNavCollision.length);
console.log('Hidden buttons on mobile:', findings.hiddenMobileButtons.length);
console.log('Tables without overflow-x:', findings.tableNoOverflowX.length);
console.log('Rigid multi-column grids (unstacked on mobile):', findings.rigidGridMobileCollapse.length);

fs.writeFileSync('scripts/deep-audit-results.json', JSON.stringify(findings, null, 2));
