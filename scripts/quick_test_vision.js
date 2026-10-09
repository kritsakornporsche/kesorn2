const fs = require('fs');
require('dotenv').config({ path: '.env' });
const geminiKey = process.env.GEMINI_API_KEY;

const artifactPath = 'C:\\Users\\krits\\.gemini\\antigravity-ide\\brain\\fde2bae5-f1ca-4d0e-8fa3-e494b2305e6c\\.user_uploaded\\media_1790925357877.png';
const buf = fs.readFileSync(artifactPath);

async function testSingleModel(model) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Look at the meter in this image. Read the number in the counter wheels. Return JSON: { "reading": 6126 }' },
            { inline_data: { mime_type: 'image/png', data: buf.toString('base64') } }
          ]
        }]
      })
    });
    clearTimeout(t);
    const text = await res.text();
    console.log(model, '-> Status:', res.status, text.substring(0, 150));
  } catch (e) {
    console.log(model, '-> Timeout/Err:', e.message);
  }
}

async function run() {
  const list = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-pro-latest'
  ];
  for (const m of list) {
    await testSingleModel(m);
  }
}
run();
