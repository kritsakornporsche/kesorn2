module.exports = {
  apps: [
    {
      name: 'kesorn-3000',
      script: './server.js',
      exec_mode: 'fork',
      cwd: 'd:/Works/thesiss/kesorn',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0'
      }
    }
  ]
};


