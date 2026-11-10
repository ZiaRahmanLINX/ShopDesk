// Headless UI smoke test for the first-run Setup Wizard: launch the built
// Electron app under Xvfb with a FRESH user data dir, complete the clean
// setup flow via CDP, and verify the Tutorial page appears.
// Run: node scripts/e2e-setup.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER_DATA = '/tmp/shopdesk-e2e-userdata';
fs.rmSync(USER_DATA, { recursive: true, force: true });

const electron = spawn(
  'npx',
  ['electron', '.', '--no-sandbox', '--remote-debugging-port=9222', `--user-data-dir=${USER_DATA}`],
  { cwd: '/home/hatch/workspace/shopdesk', env: { ...process.env, DISPLAY: ':98' }, stdio: 'ignore' },
);

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
await sleep(4000);

const bodyText = async () => evalJs(`document.body.innerText.slice(0, 1500)`);
const clickButton = async (label) =>
  evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(label)})); if (b) { b.click(); return true; } return false; })()`);
const setInput = async (index, value) =>
  evalJs(`(() => { const els = [...document.querySelectorAll('input')]; const el = els[${index}]; if (!el) return 'missing input ${index}'; const proto = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);

let failed = false;
try {
  let text = await bodyText();
  console.log('--- first screen ---');
  console.log(text);
  if (!text.includes('Welcome to ShopDesk')) throw new Error('Setup wizard did not appear on first run');

  // Step 0 -> 1: clean setup
  console.log('choose setup:', await clickButton('Set up my shop'));
  await sleep(800);
  // Step 1: shop name (input 0)
  console.log('shop name:', await setInput(0, 'CDP Test Store'));
  console.log('continue:', await clickButton('Continue'));
  await sleep(800);
  // Step 2: partner 1 name (input 0), partner 2 name (input 3)
  console.log('partner name:', await setInput(0, 'Test Owner'));
  console.log('partner 2 name:', await setInput(3, 'Test Partner'));
  console.log('continue:', await clickButton('Continue'));
  await sleep(800);
  // Step 3: admin name (0), admin pass (2), repeat (3), partner name (5),
  // partner pass (7), repeat (8). Index 4 is the partner-login checkbox.
  console.log('admin name:', await setInput(0, 'Test Owner'));
  console.log('admin pass:', await setInput(2, 'testpass1'));
  console.log('admin pass2:', await setInput(3, 'testpass1'));
  console.log('partner name:', await setInput(5, 'Test Partner'));
  console.log('partner pass:', await setInput(7, 'testpass2'));
  console.log('partner pass2:', await setInput(8, 'testpass2'));
  console.log('finish:', await clickButton('Finish setup'));

  // Wait for the Tutorial page after auto-login.
  let ok = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    text = await bodyText();
    if (text.includes('Tutorial — your first week')) {
      ok = true;
      break;
    }
  }
  console.log('--- after setup ---');
  console.log(text);
  if (!ok) throw new Error('Tutorial page did not appear after setup');

  // Open Settings and verify the About card: correct version, no demo logins.
  // (Sidebar button is icon + "Settings"; the Tutorial page also has an
  // "Open Settings" button, so exclude that one.)
  console.log(
    'open settings:',
    await evalJs(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Settings') && !x.textContent.includes('Open')); if (b) { b.click(); return true; } return false; })()`,
    ),
  );
  await sleep(1500);
  text = await bodyText();
  console.log('--- settings page ---');
  console.log(text.slice(0, 1000));
  if (!text.includes('Version 1.1.1')) throw new Error('About card does not show Version 1.1.1');
  if (text.includes('Demo logins')) throw new Error('About card still shows demo logins');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/shopdesk-settings.png', Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot saved: /tmp/shopdesk-settings.png');
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  electron.kill('SIGKILL');
}
process.exit(failed ? 1 : 0);
