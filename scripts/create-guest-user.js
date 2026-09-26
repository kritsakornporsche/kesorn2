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
      const bcrypt = require('bcryptjs');

      async function main() {
        const db = await mysql.createConnection('mysql://smartdom:smartdom@localhost:3306/smartdomdb');
        const hash = await bcrypt.hash('smartdom', 10);
        
        const [existing] = await db.query('SELECT id, email, name FROM users WHERE email = ? OR name = ?', ['guest@smartdom.local', 'guest']);
        if (existing.length > 0) {
          await db.query('UPDATE users SET password = ?, role = "guest", primary_role = "guest", is_active = 1 WHERE id = ?', [hash, existing[0].id]);
          console.log('UPDATED_GUEST_USER: id=' + existing[0].id);
        } else {
          const [res] = await db.query(
            'INSERT INTO users (name, email, password, role, primary_role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            ['guest', 'guest@smartdom.local', hash, 'guest', 'guest', 1]
          );
          console.log('CREATED_GUEST_USER: id=' + res.insertId);
        }
        await db.end();
      }
      main().catch(console.error);
    `;
    const b64 = Buffer.from(nodeCode, 'utf8').toString('base64');
    const psScript = `
      Set-Location "C:\\kritsakorn\\smartdom"
      [IO.File]::WriteAllBytes("C:\\kritsakorn\\smartdom\\create_guest.js", [Convert]::FromBase64String("${b64}"))
      node create_guest.js
      Remove-Item "C:\\kritsakorn\\smartdom\\create_guest.js" -Force -ErrorAction SilentlyContinue
    `;
    const psEncoded = Buffer.from(psScript, 'utf16le').toString('base64');
    conn.exec('powershell.exe -NoProfile -EncodedCommand ' + psEncoded, (err, stream) => {
      if (err) throw err;
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.on('close', () => { conn.end(); ws.close(); });
    });
  }).connect({ sock: duplex, username: 'buain', password: 'Zn@27124700' });
});
ws.on('error', (e) => console.error(e));
