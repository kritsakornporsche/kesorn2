const fs = require('fs');
require('dotenv').config({ path: '.env' });

async function test() {
  const buf = fs.readFileSync('public/uploads/slips/slip_16_21_1790927300216_b3fpbl.jpg');
  const base64 = buf.toString('base64');
  const endpoint = process.env.SLIPOK_ENDPOINT || 'https://api.slipok.com/api/line/apikey/77132';
  const apiKey = process.env.SLIPOK_API_KEY || 'SLIPOK7R7FAWL';

  const formData = new FormData();
  const blob = new Blob([buf], { type: 'image/jpeg' });
  formData.append('files', blob, 'slip.jpg');

  console.log('Sending to SlipOK:', endpoint);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-authorization': apiKey,
    },
    body: formData,
  });

  const data = await res.json();
  console.log('SlipOK Response:', JSON.stringify(data, null, 2));
}
test();
