const path = require('path');
const next = require('next');
const http = require('http');

const port = parseInt(process.env.PORT || '3001', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';
const dev = false;
const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
  .once('error', (err) => {
    console.error(err);
    process.exit(1);
  })
  .listen(port, hostname, () => {
    console.log(`> Kesorn ready on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error('Failed to prepare next app:', err);
  process.exit(1);
});
