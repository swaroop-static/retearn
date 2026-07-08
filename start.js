const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const config    = require('./config');

(async () => {
  console.log('\n🌱 Retearn — starting tunnel...');

  let publicUrl = null;

  try {
    publicUrl = await startCloudflared(config.PORT);
    console.log(`🔗 Public URL : ${publicUrl}`);
  } catch (err) {
    console.error('❌ Cloudflare tunnel failed:', err.message);
    console.log('   Is cloudflared installed? Run: winget install --id Cloudflare.cloudflared');
    console.log('   Starting server on localhost only.\n');
  }

  launchServer(publicUrl);
})();

function startCloudflared(port) {
  return new Promise((resolve, reject) => {
    const bin = fs.existsSync(path.join(__dirname, 'cloudflared.exe'))
      ? path.join(__dirname, 'cloudflared.exe')
      : 'cloudflared';

    const proc = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let resolved = false;

    const tryParse = (data) => {
      const str = data.toString();
      const match = str.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        resolve(match[0]);
      }
    };

    proc.stdout.on('data', tryParse);
    proc.stderr.on('data', tryParse);

    proc.on('error', (err) => {
      if (!resolved) reject(err);
    });

    setTimeout(() => {
      if (!resolved) reject(new Error('Timed out waiting for tunnel URL'));
    }, 20000);
  });
}

function launchServer(publicUrl) {
  const proc = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env, PUBLIC_URL: publicUrl || '' }
  });

  proc.on('exit', (code) => process.exit(code ?? 0));

  process.on('SIGINT', () => {
    proc.kill('SIGINT');
    process.exit(0);
  });
}
