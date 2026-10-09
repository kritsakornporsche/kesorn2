const fs = require('fs');

const artifactPath = 'C:\\Users\\krits\\.gemini\\antigravity-ide\\brain\\fde2bae5-f1ca-4d0e-8fa3-e494b2305e6c\\.user_uploaded\\media_1790925357877.png';
const buf = fs.readFileSync(artifactPath);
const base64Data = 'data:image/png;base64,' + buf.toString('base64');

async function testApi() {
  try {
    console.log('Testing /api/owner/meters/ocr with user image...');
    const res = await fetch('http://localhost:3001/api/owner/meters/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Data,
        previous_reading: 68,
        type: 'Electricity'
      })
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response JSON:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Fetch error:', e);
  }
}
testApi();
