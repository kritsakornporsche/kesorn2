const fs = require('fs');
require('dotenv').config({ path: '.env' });
const geminiKey = process.env.GEMINI_API_KEY;
const artifactPath = 'C:\\Users\\krits\\.gemini\\antigravity-ide\\brain\\fde2bae5-f1ca-4d0e-8fa3-e494b2305e6c\\.user_uploaded\\media_1790925357877.png';
const buf = fs.readFileSync(artifactPath);

async function run() {
  const models = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.0-flash-exp'];
  for (const m of models) {
    try {
      console.log('Testing:', m);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Look at the electricity meter picture in this image. Read the number in the counter wheels. Return JSON: { "reading": 6126 }' },
              { inline_data: { mime_type: 'image/png', data: buf.toString('base64') } }
            ]
          }]
        })
      });
      const data = await res.json();
      console.log('Model:', m, 'Status:', res.status, 'Response:', JSON.stringify(data.candidates?.[0]?.content?.parts?.[0]?.text || data.error));
    } catch (e) {
      console.log('Model:', m, 'Err:', e.message);
    }
  }
}
run();
