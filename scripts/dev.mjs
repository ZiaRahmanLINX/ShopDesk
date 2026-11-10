// Dev runner: starts Vite, waits for it, then launches Electron.
import { spawn } from 'node:child_process';
import http from 'node:http';

const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });

function waitForVite(retries = 60) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get('http://localhost:5173/', (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (retries <= 0) return reject(new Error('Vite did not start'));
        retries -= 1;
        setTimeout(tick, 500);
      });
    };
    tick();
  });
}

await waitForVite();
console.log('[dev] Vite is up — launching Electron');
const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ELECTRON_START_URL: 'http://localhost:5173' },
});
electron.on('exit', () => {
  vite.kill();
  process.exit(0);
});
process.on('SIGINT', () => {
  vite.kill();
  electron.kill();
  process.exit(0);
});
