const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const imgBuf = fs.readFileSync('public/uploads/meters/meter_1_21_electricity_2026-10_1790922195920.webp');
const base64Data = imgBuf.toString('base64');
const geminiKey = process.env.GEMINI_API_KEY;
console.log('Gemini Key exists:', Boolean(geminiKey), 'length:', geminiKey ? geminiKey.length : 0);

async function test() {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-2.0-flash'];
  for (const model of models) {
    try {
      console.log('\n--- Testing model:', model);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: 'Read the electricity meter odometer counter digits (e.g. 4-5 rotating mechanical digit wheels at top center of dial). Return strictly JSON: { "reading": 6126, "digits": "6126" }'
              },
              {
                inline_data: {
                  mime_type: 'image/webp',
                  data: base64Data
                }
              }
            ]
          }]
        })
      });
      console.log('Status:', res.status, res.statusText);
      const text = await res.text();
      console.log('Response body:', text);
      if (res.ok) {
        console.log('SUCCESS with model:', model);
        break;
      }
    } catch (e) {
      console.error('Err:', e.message);
    }
  }
}
test();
