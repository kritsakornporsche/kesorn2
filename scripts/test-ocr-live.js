require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { performIdCardOcr } = require('../lib/id-card-ocr');

async function testOcr() {
  console.log('Testing performIdCardOcr with sample image...');
  
  // Create a minimal 1x1 png in base64
  const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const result = await performIdCardOcr({
    imageBase64: sampleBase64,
  });

  console.log('Result:', result);
}

testOcr();
