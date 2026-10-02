require('dotenv').config();
const key = process.env.GEMINI_API_KEY;
console.log('Testing models with key:', key ? key.substring(0, 10) : 'NO KEY');

const models = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-3.5-flash',
  'gemini-flash-latest'
];

async function testModels() {
  for (const m of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello, reply with 1 word' }] }]
        })
      });
      const data = await res.json();
      if (res.ok) {
        console.log('✅ Model', m, 'SUCCESS:', data.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
      } else {
        console.log('❌ Model', m, 'FAILED:', data?.error?.message || res.status);
      }
    } catch (e) {
      console.log('❌ Model', m, 'ERROR:', e.message);
    }
  }
}

testModels();
