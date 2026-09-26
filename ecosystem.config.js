module.exports = {
  apps: [
    {
      name: 'kesorn-3001',
      script: './server.js',
      exec_mode: 'fork',
      cwd: 'd:/Works/thesiss/kesorn',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOSTNAME: '0.0.0.0'
      }
    }
  ]
};


