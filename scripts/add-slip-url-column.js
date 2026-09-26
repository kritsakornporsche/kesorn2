const WebSocket = require('ws');
const { Client } = require('ssh2');

const ws = new WebSocket('wss://172.67.144.197/', {
  headers: { 'Host': 'ssh.phannext.com' },
  servername: 'ssh.phannext.com',
  rejectUnauthorized: false
});

ws.on('open', () => {
  const duplex = WebSocket.createWebSocketStream(ws);
  const conn = new Client();
  conn.on('ready', () => {
    const nodeCode = `
      const mysql = require('mysql2/promise');
      async function main() {
        const db = await mysql.createConnection('mysql://smartdom:smartdom@localhost:3306/smartdomdb');
        
        const [cols] = await db.query("SHOW COLUMNS FROM contracts LIKE 'slip_url'");
        if (cols.length === 0) {
          console.log('Adding slip_url column to contracts table in kesorn_db...');
          await db.query("ALTER TABLE contracts ADD COLUMN slip_url LONGTEXT NULL");
          console.log('Successfully added slip_url column!');
        } else {
          console.log('slip_url column already exists in contracts table.');
        }

        const [cols2] = await db.query("SHOW COLUMNS FROM contracts LIKE 'slip_url'");
        console.log('Column Verification:', cols2);

        await db.end();
      }
      main().catch(console.error);
    `;

    const b64 = Buffer.from(nodeCode, 'utf8').toString('base64');
    const psScript = `
      Set-Location "C:\\kritsakorn\\smartdom"
      [IO.File]::WriteAllBytes("C:\\kritsakorn\\smartdom\\add_slip_col.js", [Convert]::FromBase64String("${b64}"))
      node add_slip_col.js
      Remove-Item "C:\\kritsakorn\\smartdom\\add_slip_col.js" -Force -ErrorAction SilentlyContinue
    `;
    const psEncoded = Buffer.from(psScript, 'utf16le').toString('base64');

    conn.exec(`powershell.exe -NoProfile -EncodedCommand ${psEncoded}`, (err, stream) => {
      if (err) {
        console.error('Remote exec error:', err);
        conn.end();
        ws.close();
        return;
      }
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', () => {
        conn.end();
        ws.close();
      });
    });
  }).connect({
    sock: duplex,
    username: 'buain',
    password: 'Zn@27124700',
    readyTimeout: 20000
  });
});
