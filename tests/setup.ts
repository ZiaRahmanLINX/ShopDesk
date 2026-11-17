// ShopDesk — first-run setup tests (single-owner edition).
// Verifies the Setup wizard's backend: clean setup creates the shop,
// ONE owner login and base structure, and no partner anything; a second
// setup is refused; bad owner input is rejected. There is no demo mode.
// Run: npm run test:setup
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../src/main/generated-prisma';

const TEST_DB = path.join(process.cwd(), 'shopdesk-setup-test.db');
process.env.SHOPDESK_DB_PATH = TEST_DB;

const PARTNER_TABLES = ['Partner', 'PartnerCapital', 'PartnerLoan', 'PartnerWithdrawal', 'ProfitDistribution', 'BusinessReserve'];

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

async function applyMigrations(db: PrismaClient) {
  // Same files the app runs at startup, in order: 0001 builds the
  // v1.1.2 schema (partner tables included), 0002 drops the partnership.
  const dir = path.join(process.cwd(), 'resources', 'migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) await db.$executeRawUnsafe(stmt);
  }
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
  await applyMigrations(db);
  return db;
}

async function tableCount(db: PrismaClient, names: string[]) {
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS "n" FROM "sqlite_master" WHERE "type" = 'table' AND "name" IN (${names.map((n) => `'${n}'`).join(',')})`,
  );
  return Number(rows[0].n);
}

async function main() {
  let db = await freshDb();
  const setup = await import('../src/main/setup');
  const { getSetting } = await import('../src/main/db');
  const { login } = await import('../src/main/services/auth');

  // ---- 1. Fresh database needs setup ----
  check('fresh DB needs setup', (await setup.getSetupStatus()).needsSetup, true);
  check('fresh DB is not demo', (await setup.getSetupStatus()).demoMode, false);

  // ---- 2. Clean setup: one owner, no partners ----
  await setup.completeSetup({
    shopName: 'Test Kiryana',
    shopAddress: 'Main Bazaar',
    shopPhone: '0300-1111111',
    owner: { name: 'Owner One', username: 'owner', password: 'secret123' },
  });
  check('setup done, no longer needs setup', (await setup.getSetupStatus()).needsSetup, false);
  check('exactly one user created (the owner)', await db.user.count(), 1);
  check('no partner tables exist', await tableCount(db, PARTNER_TABLES), 0);
  const userCols = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("User")`);
  check('User has no role column', userCols.some((c) => c.name === 'role'), false);
  check('shop name saved', (await getSetting<{ shopName: string }>('shop', { shopName: '' })).shopName, 'Test Kiryana');
  check('cash accounts created', await db.cashAccount.count(), 4);
  check('expense categories created', await db.expenseCategory.count(), 11);
  check('product categories created', await db.category.count(), 7);
  check('no products yet', await db.product.count(), 0);
  check('no sales yet', await db.sale.count(), 0);
  const meta = await getSetting<{ setupCompleted?: boolean; demo?: boolean }>('meta', {});
  check('meta setupCompleted', meta.setupCompleted, true);
  check('meta demo false', meta.demo, false);
  const session = await login('owner', 'secret123');
  check('owner login works', session.username, 'owner');
  check('session carries no role', 'role' in session, false);
  await db.$disconnect();

  // ---- 3. Second setup is refused ----
  let refused = false;
  try {
    await setup.completeSetup({
      shopName: 'Again',
      shopAddress: '',
      shopPhone: '',
      owner: { name: 'X', username: 'x', password: 'secret123' },
    });
  } catch {
    refused = true;
  }
  check('second setup refused', refused, true);

  // ---- 4. Bad owner input is rejected ----
  db = await freshDb();
  let badInput = false;
  try {
    await setup.completeSetup({
      shopName: 'Bad Password',
      shopAddress: '',
      shopPhone: '',
      owner: { name: 'A', username: 'a', password: 'short' },
    });
  } catch {
    badInput = true;
  }
  check('password under 6 chars rejected', badInput, true);
  await db.$disconnect();

  console.log(failures === 0 ? 'ALL SETUP CHECKS PASSED' : `${failures} SETUP CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Setup test crashed:', e);
  process.exit(1);
});
