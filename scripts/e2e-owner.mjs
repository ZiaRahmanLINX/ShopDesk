// Headless UI smoke test for the ShopDesk Owner edition (single-owner branch):
// setup wizard (1 owner) -> auto-login -> add product -> POS cash sale ->
// Owner page renders -> month close + lock. Node 24 stdlib only (fetch + WebSocket).
// Run: node scripts/e2e-owner.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER_DATA = '/tmp/shopdesk-owner-e2e';
fs.rmSync(USER_DATA, { recursive: true, force: true });

const electron = spawn(
  'npx',
  ['electron', '.', '--no-sandbox', '--remote-debugging-port=9223', `--user-data-dir=${USER_DATA}`],
  { cwd: '/home/hatch/workspace/shopdesk-owner', env: { ...process.env, DISPLAY: ':98' }, stdio: 'ignore', detached: true },
);

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9223/json');
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
const consoleErrors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 500));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 500));
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

const bodyText = async () => evalJs(`document.body.innerText.slice(0, 3000)`);
const clickNav = async (label) =>
  evalJs(`(() => { const nav = document.querySelector('aside nav'); if (!nav) return false; const b = [...nav.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(label)})); if (b) { b.click(); return true; } return false; })()`);
const clickButton = async (label) =>
  evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(label)})); if (b) { b.click(); return true; } return false; })()`);
const clickLastButton = async (label) =>
  evalJs(`(() => { const bs = [...document.querySelectorAll('button')].filter(x => x.textContent.includes(${JSON.stringify(label)})); if (!bs.length) return false; bs[bs.length - 1].click(); return true; })()`);
const setInput = async (index, value, scope = 'document') =>
  evalJs(`(() => { const els = [...${scope}.querySelectorAll('input')]; const el = els[${index}]; if (!el) return 'missing input ${index}'; const proto = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
const setInputByLabel = async (label, value, scopeSel = 'document') =>
  evalJs(`(() => { const scope = ${scopeSel === 'document' ? 'document' : `document.querySelector(${JSON.stringify(scopeSel)})`}; if (!scope) return 'missing scope'; const lab = [...scope.querySelectorAll('label')].find(l => l.textContent.includes(${JSON.stringify(label)})); if (!lab) return 'missing label ${label}'; const el = lab.querySelector('input'); if (!el) return 'no input in label'; const proto = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
const setSelectByLabel = async (label, scopeSel = 'document') =>
  evalJs(`(() => { const scope = ${scopeSel === 'document' ? 'document' : `document.querySelector(${JSON.stringify(scopeSel)})`}; if (!scope) return 'missing scope'; const lab = [...scope.querySelectorAll('label')].find(l => l.textContent.includes(${JSON.stringify(label)})); if (!lab) return 'missing label'; const s = lab.querySelector('select'); if (!s) return 'no select in label'; const opt = [...s.options].find(o => o.value); if (!opt) return 'no options'; const proto = HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(s, opt.value); s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok ' + opt.value; })()`);
const waitFor = async (needle, timeoutMs = 15000) => {
  for (let i = 0; i < timeoutMs / 500; i++) {
    const t = await bodyText();
    if (t.includes(needle)) return t;
    await sleep(500);
  }
  throw new Error(`timed out waiting for text: ${needle}`);
};

let failed = false;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed = true;
};
try {
  // 1. Setup wizard appears on first run.
  let text = await waitFor('Welcome to ShopDesk Owner', 20000);
  check('setup wizard appears', text.includes('Welcome to ShopDesk Owner'));
  check('no partner wording on setup', !/partner/i.test(text));

  // 2. Step 1: shop name.
  console.log('shop name:', await setInput(0, 'Smoke Kiryana'));
  console.log('continue:', await clickButton('Continue'));
  await sleep(800);

  // 3. Step 2: owner account (inputs: name, username, password, repeat).
  console.log('owner name:', await setInput(0, 'Smoke Owner'));
  console.log('username:', await setInput(1, 'owner'));
  console.log('password:', await setInput(2, 'owner123'));
  console.log('password2:', await setInput(3, 'owner123'));
  console.log('finish:', await clickButton('Finish setup'));

  // 4. Main UI loads after auto-login (Tutorial is the landing page).
  text = await waitFor('Products', 20000);
  check('main UI loads after setup', text.includes('Products'));
  check('branded ShopDesk Owner', text.includes('ShopDesk Owner'));

  // 5. Add a product.
  console.log('nav products:', await clickNav('Products'));
  await sleep(1200);
  console.log('add product:', await clickButton('+ Add product'));
  await sleep(800);
  // Modal inputs (scoped to the modal overlay — the page behind has its own search box).
  const MODAL = '.fixed.inset-0';
  await setInputByLabel('Product name', 'Smoke Tea', MODAL);
  await setInputByLabel('SKU / Barcode code', 'SMK-001', MODAL);
  await setInputByLabel('Purchase price (Rs)', '100', MODAL);
  await setInputByLabel('Selling price (Rs)', '150', MODAL);
  await setInputByLabel('Opening quantity', '10', MODAL);
  // Category select: pick the first real category.
  console.log('category:', await setSelectByLabel('Category', MODAL));
  console.log('save product:', await clickButton('Save product'));
  text = await waitFor('Smoke Tea', 10000);
  check('product saved and listed', text.includes('Smoke Tea'));

  // 6. POS cash sale of 1 x Smoke Tea @ 150.
  console.log('nav POS:', await clickNav('Point of Sale'));
  await sleep(1200);
  console.log('pick product:', await clickButton('Smoke Tea'));
  await sleep(500);
  console.log('pay full:', await clickButton('Pay full in cash'));
  await sleep(300);
  console.log('complete sale:', await clickButton('Complete sale'));
  text = await waitFor('Print invoice', 10000);
  check('sale completes, invoice shown', text.includes('Print invoice') && text.includes('Smoke Tea'));

  // 7. Owner page renders (new page).
  console.log('nav Owner:', await clickNav('Owner'));
  text = await waitFor('TOTAL CAPITAL IN', 10000);
  const lower = text.toLowerCase();
  check('Owner page renders', lower.includes('total capital in') && lower.includes('total drawings out'));
  check('no partner wording on Owner page', !/partner/i.test(text));

  // 8. Month close: preview then close + lock current month (2026-11).
  console.log('nav Month Close:', await clickNav('Month Close'));
  await sleep(1500);
  text = await bodyText();
  console.log('--- month close preview ---');
  console.log(text.slice(0, 1200));
  check('preview shows the sale', text.includes('150'));
  check('no reserve/distribution wording', !/reserve|distribution|partner/i.test(text));
  console.log('close month:', await clickButton('Close month 2026-11'));
  await sleep(800);
  console.log('confirm close:', await clickLastButton('Close month'));
  text = await waitFor('closed and locked', 10000);
  check('month closed + locked', text.includes('closed and locked'));
  // The Closed months table refreshes async after the toast; wait for the row.
  const rowLocked = await evalJs(`(async () => { for (let i = 0; i < 20; i++) { const row = [...document.querySelectorAll('table tbody tr')].find(tr => tr.textContent.includes('2026-11')); if (row && row.textContent.includes('Locked')) return true; await new Promise(r => setTimeout(r, 500)); } return false; })()`);
  check('closed month listed Locked', rowLocked === true);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/shopdesk-owner-monthclose.png', Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot saved: /tmp/shopdesk-owner-monthclose.png');

  check('no console errors/exceptions', consoleErrors.length === 0);
  if (consoleErrors.length) console.log('console errors:', consoleErrors);
} catch (e) {
  failed = true;
  console.error('SMOKE FAILED:', e);
  console.log('--- body at failure ---');
  try {
    console.log(await bodyText());
  } catch {
    /* ignore */
  }
  if (consoleErrors.length) console.log('console errors:', consoleErrors);
} finally {
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  // Kill the whole process group: electron.kill() alone only kills the npx
  // wrapper and leaves the real Electron process (and its port) behind.
  try {
    process.kill(-electron.pid, 'SIGKILL');
  } catch {
    electron.kill('SIGKILL');
  }
}
process.exit(failed ? 1 : 0);
