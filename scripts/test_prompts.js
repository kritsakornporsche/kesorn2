const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const imgBuf = fs.readFileSync('public/uploads/meters/meter_1_21_electricity_2026-10_1790922195920.webp');
const base64Data = imgBuf.toString('base64');
const geminiKey = process.env.GEMINI_API_KEY;

const prompts = [
  `You are reading the meter reading of an electric / water meter.
Examine the image carefully. Identify the mechanical counter / odometer window with digits.
What are the numbers shown inside the reading counter?
Please describe what you see, and give the final reading number.`,

  `Task: Read the numbers shown in the odometer window of this Mitsubishi electric meter.
Notice the 4 or 5 mechanical digit wheels inside the rectangular viewing box at the upper part of the dial (e.g., digits 6, 1, 2, 6).
Output strictly JSON: {"reading": 6126, "digits": "6126"}`
];

async function test() {
  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n=== Prompt ${i + 1} ===`);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompts[i] },
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
    const data = await res.json();
    console.log('Result:', data.candidates?.[0]?.content?.parts?.[0]?.text);
  }
}
test();
