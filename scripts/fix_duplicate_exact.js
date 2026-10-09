const fs = require('fs');
let content = fs.readFileSync('app/tenant/billing/page.tsx', 'utf8');

const target = `                        <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
                         <div className="flex flex-wrap justify-between items-start gap-3 mb-6">`;

const replacement = `                        <div className="flex flex-wrap justify-between items-start gap-3 mb-6">`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('app/tenant/billing/page.tsx', content, 'utf8');
  console.log('Successfully replaced duplicate line!');
} else {
  console.log('Target string not found, searching with regex');
  content = content.replace(/<div className="flex flex-wrap justify-between items-start gap-3 mb-6">\s*<div className="flex flex-wrap justify-between items-start gap-3 mb-6">/, '<div className="flex flex-wrap justify-between items-start gap-3 mb-6">');
  fs.writeFileSync('app/tenant/billing/page.tsx', content, 'utf8');
  console.log('Successfully replaced with regex!');
}
