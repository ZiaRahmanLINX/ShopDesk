// Headless UI smoke test: launch the built Electron app under Xvfb, log in
// via CDP, and screenshot the dashboard. Node 24 stdlib only (fetch + WebSocket).
// Run: node scripts/e2e-login.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const electron = spawn('npx', ['electron', '.', '--no-sandbox', '--remote-debugging-port=9222'], {
  cwd: '/home/hatch/workspace/shopdesk',
  env: { ...process.env, DISPLAY: ':98' },
  stdio: 'ignore',
});

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('no page target after 20s');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const evalJs = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable');
await send('Page.enable');
await sleep(3000);

const inputCount = await evalJs(`document.querySelectorAll('input').length`);
console.log('login inputs:', inputCount);
await evalJs(`document.querySelectorAll('input')[1].focus()`);
await send('Input.insertText', { text: 'admin123' });
const clicked = await evalJs(
  `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Sign in'); if (b) { b.click(); return true; } return false; })()`,
);
console.log('sign-in clicked:', clicked);
await sleep(4000);

const text = await evalJs(`document.body.innerText.slice(0, 1000)`);
console.log('--- after login ---');
console.log(text);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/tmp/shopdesk-dashboard.png', Buffer.from(shot.result.data, 'base64'));
console.log('screenshot saved: /tmp/shopdesk-dashboard.png');

electron.kill();
process.exit(0);
