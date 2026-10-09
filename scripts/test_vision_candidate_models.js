const fs = require('fs');
require('dotenv').config({ path: '.env' });
const geminiKey = process.env.GEMINI_API_KEY;

// Look at the user's uploaded artifact image: media_1790925357877.png
const artifactPath = 'C:\\Users\\krits\\.gemini\\antigravity-ide\\brain\\fde2bae5-f1ca-4d0e-8fa3-e494b2305e6c\\.user_uploaded\\media_1790925357877.png';
const buf = fs.readFileSync(artifactPath);

async function testList() {
  const candidateModels = [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-pro-latest',
    'gemini-3.8-flash'
  ];

  for (const m of candidateModels) {
    try {
      console.log(`\n=== Testing model: ${m} ===`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `You are an OCR meter reader. Look at the meter photo shown in this image (e.g. Mitsubishi / Sanwa utility meter).
Look closely at the rotating number wheels / odometer display at the upper center.
Disregard 220V, 50Hz, 1200r/kWh. Extract only the digits shown inside the counter box (e.g. 6126).
Return strictly JSON in format:
{ "reading": 6126, "digits": "6126" }`
              },
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: buf.toString('base64')
                }
              }
            ]
          }]
        })
      });
      console.log('Status:', res.status, res.statusText);
      const text = await res.text();
      console.log('Body:', text.substring(0, 400));
      if (res.ok) {
        console.log('>>> SUCCESS with model:', m);
        break;
      }
    } catch (e) {
      console.error('Error with model:', m, e.message);
    }
  }
}
testList();
