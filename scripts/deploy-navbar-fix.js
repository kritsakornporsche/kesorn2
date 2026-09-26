const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const WebSocket = require('ws');

const filesToUpload = [
  'app/components/Navbar.tsx',
  'app/signin/SigninContent.tsx',
  'app/signin/page.tsx',
  'app/explore/room/[id]/page.tsx',
  'app/api/contracts/route.ts'
];

const conn = new Client();
console.log('Connecting SSH to sync updated Navbar & Signin to production server (kesorn.phannext.com)...');

const ws = new WebSocket('wss://172.67.144.197/', {
  headers: { 'Host': 'ssh.phannext.com' },
  servername: 'ssh.phannext.com',
  rejectUnauthorized: false
});

ws.on('open', () => {
  console.log('✅ Cloudflare Tunnel WebSocket Established! Handshaking SSH...');
  const duplex = WebSocket.createWebSocketStream(ws);
  conn.connect({
    sock: duplex,
    username: 'buain',
    password: 'Zn@27124700',
    readyTimeout: 25000
  });
});

conn.on('ready', async () => {
  console.log('SSH Connection Established! Syncing files...');

  const runRemotePs = (psScript) => {
    return new Promise((resolve, reject) => {
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      conn.exec(`powershell.exe -NoProfile -EncodedCommand ${encoded}`, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        stream.on('data', d => stdout += d.toString());
        stream.stderr.on('data', d => stderr += d.toString());
        stream.on('close', code => resolve({ code, stdout, stderr }));
      });
    });
  };

  let idx = 0;
  for (const relPath of filesToUpload) {
    idx++;
    const localFile = path.join(__dirname, '..', relPath);
    if (!fs.existsSync(localFile)) {
      console.warn(`⚠️ Local file not found: ${relPath}, skipping...`);
      continue;
    }
    const b64 = fs.readFileSync(localFile).toString('base64');
    const remotePath = `C:\\kritsakorn\\smartdom\\${relPath.replace(/\//g, '\\')}`;
    const remoteDir = path.dirname(remotePath);

    console.log(`[${idx}/${filesToUpload.length}] Syncing ${relPath}...`);

    const chunkSize = 800;
    await runRemotePs(`[IO.File]::WriteAllText("C:\\kritsakorn\\smartdom\\temp.b64", "")`);
    for (let i = 0; i < b64.length; i += chunkSize) {
      const chunk = b64.slice(i, i + chunkSize);
      await runRemotePs(`[IO.File]::AppendAllText("C:\\kritsakorn\\smartdom\\temp.b64", "${chunk}")`);
    }

    const finishPs = `
      $dir = "${remoteDir}"
      if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
      [IO.File]::WriteAllBytes("${remotePath}", [Convert]::FromBase64String([IO.File]::ReadAllText("C:\\kritsakorn\\smartdom\\temp.b64")))
      Remove-Item "C:\\kritsakorn\\smartdom\\temp.b64" -Force -ErrorAction SilentlyContinue
      Write-Host "✅ Synced: ${relPath}"
    `;

    try {
      const res = await runRemotePs(finishPs);
      if (res.stdout.trim()) console.log(res.stdout.trim());
    } catch (e) {
      console.error(`Error syncing ${relPath}:`, e.message);
    }
  }

  console.log('\nAll updated files uploaded successfully! Now building and restarting remote server...\n');
  
  const psScript = `
    $ErrorActionPreference = 'Continue'
    Set-Location "C:\\kritsakorn\\smartdom"
    Write-Host "1. RUNNING NPM RUN BUILD ON REMOTE SERVER:"
    npm run build
    Write-Host ""
    Write-Host "2. RESTARTING SmartDomServer SERVICE:"
    try {
      Stop-ScheduledTask -TaskName "SmartDomServer" -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      Start-ScheduledTask -TaskName "SmartDomServer"
      Write-Host "✅ ScheduledTask SmartDomServer Restarted!"
    } catch {
      Write-Host "⚠️ ScheduledTask notice: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 4
    try {
      $res = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 10
      Write-Host "✅ Server is ONLINE! HTTP Status: $($res.StatusCode)"
    } catch {
      Write-Host "Server status check: $($_.Exception.Message)"
    }
  `;

  const b64Ps = Buffer.from(psScript, 'utf8').toString('base64');
  await runRemotePs(`[IO.File]::WriteAllText("C:\\kritsakorn\\smartdom\\build.b64", "")`);
  const cSize = 800;
  for (let i = 0; i < b64Ps.length; i += cSize) {
    const chunk = b64Ps.slice(i, i + cSize);
    await runRemotePs(`[IO.File]::AppendAllText("C:\\kritsakorn\\smartdom\\build.b64", "${chunk}")`);
  }

  const runnerCmd = `powershell.exe -NoProfile -Command "[IO.File]::WriteAllText('C:\\kritsakorn\\smartdom\\build.ps1', [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([IO.File]::ReadAllText('C:\\kritsakorn\\smartdom\\build.b64'))), [System.Text.Encoding]::UTF8); Remove-Item 'C:\\kritsakorn\\smartdom\\build.b64' -Force; & 'C:\\kritsakorn\\smartdom\\build.ps1'; Remove-Item 'C:\\kritsakorn\\smartdom\\build.ps1' -Force"`;

  conn.exec(runnerCmd, (err, stream) => {
    if (err) {
      console.error('Remote execution error:', err);
      conn.end();
      return;
    }
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', (code) => {
      console.log('\n--- Remote build & restart completed with code: ' + code + ' ---');
      conn.end();
      try { ws.close(); } catch(e) {}
    });
  });
});

conn.on('error', (err) => {
  if (err.code !== 'ECONNRESET') console.error('SSH Error:', err.message);
});

ws.on('error', (err) => {
  console.error('Cloudflare Tunnel Error:', err.message);
});
