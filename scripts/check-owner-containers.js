const fs = require('fs');

const ownerPages = [
  'app/owner/page.tsx',
  'app/owner/rooms/page.tsx',
  'app/owner/contracts/page.tsx',
  'app/owner/contracts/[id]/page.tsx',
  'app/owner/billing/page.tsx',
  'app/owner/meter/page.tsx',
  'app/owner/maintenance/page.tsx',
  'app/owner/move-out/page.tsx',
  'app/owner/accounting/page.tsx',
  'app/owner/settings/page.tsx',
  'app/owner/chat/page.tsx',
  'app/owner/bookings/page.tsx',
  'app/owner/onboarding/page.tsx',
  'app/owner/tenants/page.tsx',
  'app/owner/evaluations/page.tsx'
];

console.log('=== CHECKING OWNER PAGES CONTAINER CLASSES ===');
ownerPages.forEach(p => {
  if (fs.existsSync(p)) {
    const c = fs.readFileSync(p, 'utf8');
    const lines = c.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('return (') || lines[i].includes('return(')) {
        const nextLines = lines.slice(i, i + 5).join(' ');
        const match = nextLines.match(/className=["']([^"']*)["']/);
        if (match) {
          const cls = match[1];
          const hasScroll = cls.includes('overflow-y-auto') || cls.includes('overflow-auto');
          console.log(`${p}: ${hasScroll ? '✅ HAS SCROLL' : '❌ NO OVERFLOW-Y-AUTO'} -> class: "${cls.slice(0, 70)}"`);
        }
        break;
      }
    }
  }
});
