const WebSocket = require('ws');
const { Client } = require('ssh2');
const bcrypt = require('bcryptjs');

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
      
      const roleAccounts = [
        { name: 'admin', email: 'admin@smartdom.com', role: 'owner', sub_role: null },
        { name: 'owner', email: 'owner@kesorn.com', role: 'owner', sub_role: null },
        { name: 'tenant', email: 'tenant@kesorn.com', role: 'tenant', sub_role: null },
        { name: 'maid', email: 'maid@kesorn.com', role: 'keeper', sub_role: 'maid' },
        { name: 'technician', email: 'technician@kesorn.com', role: 'keeper', sub_role: 'technician' },
        { name: 'keeper', email: 'keeper@kesorn.com', role: 'keeper', sub_role: 'technician' },
        { name: 'researcher', email: 'researcher@kesorn.com', role: 'researcher', sub_role: null },
        { name: 'guest', email: 'guest@kesorn.com', role: 'guest', sub_role: null }
      ];

      async function main() {
        const db = await mysql.createConnection('mysql://smartdom:smartdom@localhost:3306/smartdomdb');
        console.log('Connected to remote smartdomdb for seeding...');

        for (const acc of roleAccounts) {
          const hash = await bcrypt.hash(acc.name, 10);
          const [existing] = await db.query('SELECT id FROM users WHERE name = ? OR email = ?', [acc.name, acc.email]);
          
          if (existing.length > 0) {
            await db.query(
              'UPDATE users SET name = ?, email = ?, password = ?, role = ?, sub_role = ?, is_active = 1 WHERE id = ?',
              [acc.name, acc.email, hash, acc.role, acc.sub_role, existing[0].id]
            );
            console.log('Updated user:', acc.name);
          } else {
            await db.query(
              'INSERT INTO users (name, email, password, role, sub_role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
              [acc.name, acc.email, hash, acc.role, acc.sub_role]
            );
            console.log('Inserted user:', acc.name);
          }
        }

        try {
          const adminHash = await bcrypt.hash('admin', 10);
          const [existingAdmin] = await db.query('SELECT id FROM platform_admins WHERE name = "admin" OR email = "admin@smartdom.com"');
          if (existingAdmin.length > 0) {
            await db.query('UPDATE platform_admins SET name = "admin", email = "admin@smartdom.com", password = ?, role = "platform_admin", is_active = 1 WHERE id = ?', [adminHash, existingAdmin[0].id]);
          } else {
            await db.query('INSERT INTO platform_admins (name, email, password, role, is_active) VALUES ("admin", "admin@smartdom.com", ?, "platform_admin", 1)', [adminHash]);
          }
          console.log('Platform admin updated.');
        } catch (e) { console.log('Admin update note:', e.message); }

        await db.end();
        console.log('Seeding completed successfully!');
      }
      main().catch(console.error);
    `;

    const b64 = Buffer.from(nodeCode, 'utf8').toString('base64');
    const runCmd = (cmd) => new Promise((res, rej) => {
      const enc = Buffer.from(cmd, 'utf16le').toString('base64');
      conn.exec(`powershell.exe -NoProfile -EncodedCommand ${enc}`, (e, s) => {
        if (e) return rej(e);
        let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => process.stderr.write(d)); s.on('close', () => res(o));
      });
    });

    (async () => {
      await runCmd(`[IO.File]::WriteAllText("C:\\\\kritsakorn\\\\smartdom\\\\seed.b64","")`);
      for (let i = 0; i < b64.length; i += 800) {
        await runCmd(`[IO.File]::AppendAllText("C:\\\\kritsakorn\\\\smartdom\\\\seed.b64","${b64.slice(i, i+800)}")`);
      }
      const out = await runCmd(`Set-Location C:\\\\kritsakorn\\\\smartdom; $j=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([IO.File]::ReadAllText("C:\\\\kritsakorn\\\\smartdom\\\\seed.b64"))); [IO.File]::WriteAllText("C:\\\\kritsakorn\\\\smartdom\\\\seed.js",$j,[Text.Encoding]::UTF8); node seed.js; Remove-Item seed.b64,seed.js -Force -EA SilentlyContinue`);
      console.log(out);
      conn.end();
      ws.close();
    })().catch(err => {
      console.error(err);
      conn.end();
      ws.close();
    });
  }).connect({
    sock: duplex,
    username: 'buain',
    password: 'Zn@27124700',
    readyTimeout: 20000
  });
});
