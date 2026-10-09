const fs = require('fs');
let content = fs.readFileSync('app/tenant/billing/page.tsx', 'utf8');

content = content.replace(
  `                      <div>
                        <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
                        <div className="flex flex-wrap justify-between items-start gap-3 mb-6">`,
  `                      <div>
                        <div className="flex flex-wrap justify-between items-start gap-3 mb-6">`
);

// If CRLF was used:
content = content.replace(
  "                        <div className=\"flex flex-wrap justify-between items-start gap-3 mb-6\">\n                        <div className=\"flex flex-wrap justify-between items-start gap-3 mb-6\">",
  "                        <div className=\"flex flex-wrap justify-between items-start gap-3 mb-6\">"
);

fs.writeFileSync('app/tenant/billing/page.tsx', content, 'utf8');
console.log('Fixed duplicate div');
