const path = require('path');

process.env.NODE_ENV = 'production';
process.env.PORT = '3001';

const dir = __dirname;
const options = {
  port: 3001,
  hostname: '0.0.0.0'
};

import('next/dist/cli/next-start.js')
  .then((mod) => mod.nextStart(options, dir))
  .catch((err) => {
    console.error('Failed to start Next.js:', err);
    process.exit(1);
  });
