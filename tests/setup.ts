// ShopDesk — first-run setup tests.
// Verifies the Setup wizard's backend: clean setup creates the shop,
// partners, logins and base structure; a second setup is refused; bad
// shares are rejected. There is no demo mode anymore. Run: npm run test:setup
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../src/main/generated-prisma';

const TEST_DB = path.join(process.cwd(), 'shopdesk-setup-test.db');
process.env.SHOPDESK_DB_PATH = TEST_DB;

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

async function freshDb() {
  // The service layer caches one PrismaClient per process. Disconnect it
  // first, or it keeps the deleted file alive and still sees the old rows.
  try {
    const { getPrisma } = await import('../src/main/db');
    await getPrisma().$disconnect();
  } catch {
    /* no cached client yet */
  }
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  const db = new PrismaClient({ datasourceUrl: `file:${TEST_DB}` });
  const sql = fs.readFileSync(path.join(process.cwd(), 'resources', 'migrations', '0001_init.sql'), 'utf8');
  const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) await db.$executeRawUnsafe(stmt);
  return db;
}

async function main() {
  let db = await freshDb();
  const setup = await import('../src/main/setup');
  const { getSetting } = await import('../src/main/db');

  // ---- 1. Fresh database needs setup ----
  check('fresh DB needs setup', (await setup.getSetupStatus()).needsSetup, true);
  check('fresh DB is not demo', (await setup.getSetupStatus()).demoMode, false);

  // ---- 2. Clean setup ----
  await setup.completeSetup({
    shopName: 'Test Kiryana',
    shopAddress: 'Main Bazaar',
    shopPhone: '0300-1111111',
    reservePct: 10,
    partners: [
      { name: 'Owner One', type: 'CAPITAL', profitSharePct: 60 },
      { name: 'Worker Two', type: 'WORKING', profitSharePct: 40 },
    ],
    admin: { name: 'Owner One', username: 'owner', password: 'secret123' },
    partnerUser: { name: 'Worker Two', username: 'worker', password: 'secret456' },
  });
  check('setup done, no longer needs setup', (await setup.getSetupStatus()).needsSetup, false);
  check('users created', await db.user.count(), 2);
  check('partners created', await db.partner.count(), 2);
  const shares = (await db.partner.findMany({ orderBy: { name: 'asc' } })).map((p) => p.profitSharePct);
  check('shares add to 100', shares.reduce((a, b) => a + b, 0), 100);
  check('shop name saved', (await getSetting<{ shopName: string }>('shop', { shopName: '' })).shopName, 'Test Kiryana');
  check('cash accounts created', await db.cashAccount.count(), 4);
  check('expense categories created', await db.expenseCategory.count(), 11);
  check('product categories created', await db.category.count(), 7);
  check('no products yet', await db.product.count(), 0);
  check('no sales yet', await db.sale.count(), 0);
  const meta = await getSetting<{ setupCompleted?: boolean; demo?: boolean }>('meta', {});
  check('meta setupCompleted', meta.setupCompleted, true);
  check('meta demo false', meta.demo, false);

  // ---- 3. Second setup is refused ----
  let refused = false;
  try {
    await setup.completeSetup({
      shopName: 'Again', shopAddress: '', shopPhone: '', reservePct: 0,
      partners: [{ name: 'X', type: 'CAPITAL', profitSharePct: 100 }],
      admin: { name: 'X', username: 'x', password: 'secret123' },
    });
  } catch {
    refused = true;
  }
  check('second setup refused', refused, true);
  await db.$disconnect();

  // ---- 4. Bad shares are rejected ----
  db = await freshDb();
  let badShares = false;
  try {
    await setup.completeSetup({
      shopName: 'Bad Shares', shopAddress: '', shopPhone: '', reservePct: 0,
      partners: [
        { name: 'A', type: 'CAPITAL', profitSharePct: 60 },
        { name: 'B', type: 'WORKING', profitSharePct: 30 },
      ],
      admin: { name: 'A', username: 'a', password: 'secret123' },
    });
  } catch {
    badShares = true;
  }
  check('shares not totalling 100 rejected', badShares, true);
  await db.$disconnect();

  console.log(failures === 0 ? 'ALL SETUP CHECKS PASSED' : `${failures} SETUP CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Setup test crashed:', e);
  process.exit(1);
});
