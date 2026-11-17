// ShopDesk — migration runner regression tests (single-owner edition).
// Covers the v1.1.0/v1.1.1 Windows bug: the packaged app shipped the
// migration file nested one level too deep (resources/migrations/migrations/),
// so runMigrations() found no .sql files, applied nothing, and the app
// opened on an empty database — login failed with
// "table main.User does not exist". Also covers 0002_drop_partnership:
// a populated v1.1.2 database must migrate through it with its business
// data intact and every partner table gone. Run: npm run test:migrations
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../src/main/generated-prisma';

const TEST_DB = path.join(process.cwd(), 'shopdesk-migrations-test.db');
process.env.SHOPDESK_DB_PATH = TEST_DB;

const PARTNER_TABLES = ['Partner', 'PartnerCapital', 'PartnerLoan', 'PartnerWithdrawal', 'ProfitDistribution', 'BusinessReserve'];

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

async function tableCount(db: PrismaClient, names: string[]) {
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS "n" FROM "sqlite_master" WHERE "type" = 'table' AND "name" IN (${names.map((n) => `'${n}'`).join(',')})`,
  );
  return Number(rows[0].n);
}

async function columnNames(db: PrismaClient, table: string) {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`);
  return rows.map((r) => r.name);
}

async function disconnectCached() {
  try {
    const { getPrisma } = await import('../src/main/db');
    await getPrisma().$disconnect();
  } catch {
    /* no cached client yet */
  }
}

async function main() {
  const { getPrisma, runMigrations } = await import('../src/main/db');
  const { getSetupStatus, completeSetup } = await import('../src/main/setup');
  const { login } = await import('../src/main/services/auth');

  // Fresh DB, no tables at all.
  await disconnectCached();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  // 1. runMigrations creates the tables from the project resources dir.
  await runMigrations();
  const db = getPrisma();
  check(
    'runMigrations creates core tables',
    await tableCount(db, ['User', 'Sale', 'AppSettings', 'OwnerCapital', 'OwnerDrawing']),
    5,
  );
  check('partner tables absent after 0002', await tableCount(db, PARTNER_TABLES), 0);
  const applied = await getPrisma().$queryRawUnsafe<{ name: string }[]>(
    `SELECT "name" FROM "_migrations" ORDER BY "id"`,
  );
  check('migrations recorded in order', applied.map((r) => r.name).join(','), '0001_init.sql,0002_drop_partnership.sql,0003_nullable_purchase_lot.sql');

  // 2. Re-running is a no-op (idempotent).
  await runMigrations();
  const applied2 = await getPrisma().$queryRawUnsafe<{ name: string }[]>(
    `SELECT "name" FROM "_migrations"`,
  );
  check('second runMigrations is idempotent', applied2.length, 3);

  // 2b. A lot with no purchase behind it (opening stock) can be created now.
  const prod = await db.product.create({ data: { name: 'Lot Test Tea', sku: 'LOT-001', purchasePrice: 10000, sellingPrice: 15000 } });
  const lot = await db.purchaseLot.create({ data: { productId: prod.id, purchaseId: null, qtyRemaining: 5, unitCost: 10000 } });
  const lotBack = await db.purchaseLot.findUnique({ where: { id: lot.id } });
  check('opening lot stores null purchaseId', lotBack?.purchaseId, null);

  // 3. Fresh DB reports needsSetup (Setup wizard), not a broken login.
  const status = await getSetupStatus();
  check('fresh DB needsSetup', status.needsSetup, true);

  // 4. Clean setup + login with the account created during setup works end to end.
  await completeSetup({
    shopName: 'Migration Test Shop',
    shopAddress: '',
    shopPhone: '',
    owner: { name: 'Owner', username: 'owner1', password: 'secret123' },
  });
  const session = await login('owner1', 'secret123');
  check('clean-setup login works', session.username, 'owner1');
  check('clean-setup session has no role', 'role' in session, false);
  check('exactly one user after setup', await db.user.count(), 1);

  // 5. A populated v1.1.2 database migrates through 0002 with data intact.
  await disconnectCached();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  const legacy = new PrismaClient({ datasourceUrl: `file:${TEST_DB}` });
  // Apply ONLY 0001 (the v1.1.2 schema) and mark it applied, as v1.1.2 had.
  const sql0001 = fs.readFileSync(path.join(process.cwd(), 'resources', 'migrations', '0001_init.sql'), 'utf8');
  for (const stmt of sql0001.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await legacy.$executeRawUnsafe(stmt);
  }
  await legacy.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "_migrations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL UNIQUE, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  await legacy.$executeRawUnsafe(`INSERT INTO "_migrations" ("name") VALUES ('0001_init.sql')`);
  // v1.1.2 rows: a partner with capital, a loan, a withdrawal, a closed
  // month with reserve/distribution rows, and a partner-funded purchase.
  await legacy.$executeRawUnsafe(
    `INSERT INTO "Supplier" ("id", "name") VALUES ('sup-1', 'Test Wholesaler')`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "Partner" ("id", "name", "type", "profitSharePct", "capitalBalance", "loanBalance") VALUES ('p-1', 'Capital Partner', 'CAPITAL', 60, 30000000, 1000000), ('p-2', 'Working Partner', 'WORKING', 40, 0, 0)`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "PartnerCapital" ("id", "partnerId", "kind", "amount") VALUES ('pc-1', 'p-1', 'INITIAL', 30000000)`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "PartnerLoan" ("id", "partnerId", "amount") VALUES ('pl-1', 'p-1', 1000000)`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "PartnerWithdrawal" ("id", "partnerId", "amount") VALUES ('pw-1', 'p-1', 500000)`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "MonthlyClosing" ("id", "month", "status", "locked", "netSales", "cogs", "grossProfit", "expenses", "netProfit", "reservePct", "reserveAmount", "distributable", "partner1Share", "partner2Share") VALUES ('mc-1', '2026-10', 'CLOSED', true, 3500000, 1900000, 1600000, 1000000, 600000, 50, 300000, 300000, 180000, 120000)`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "ProfitDistribution" ("id", "closingId", "partnerId", "amount") VALUES ('pd-1', 'mc-1', 'p-1', 180000), ('pd-2', 'mc-1', 'p-2', 120000)`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "BusinessReserve" ("id", "closingId", "kind", "amount") VALUES ('br-1', 'mc-1', 'MONTHLY', 300000)`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "Purchase" ("id", "supplierId", "invoiceNo", "subtotal", "total", "paidAmount", "fundingSource", "partnerId", "loanId") VALUES ('pur-1', 'sup-1', 'PUR-TEST-01', 1000000, 1000000, 1000000, 'PARTNER_LOAN', 'p-1', 'pl-1')`,
  );
  // A legacy lot tied to the real purchase (must survive the 0003 recreate
  // with its purchaseId intact). (A fake 'OPENING' id could never have been
  // written while FKs are enforced, so 0003's CASE cleanup for such rows is
  // belt-and-braces only and is not exercised here.)
  await legacy.$executeRawUnsafe(
    `INSERT INTO "Product" ("id", "name", "sku", "purchasePrice", "sellingPrice", "createdAt", "updatedAt") VALUES ('prod-1', 'Legacy Tea', 'LEG-001', 10000, 15000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  );
  await legacy.$executeRawUnsafe(
    `INSERT INTO "PurchaseLot" ("id", "productId", "purchaseId", "qtyRemaining", "unitCost") VALUES ('lot-1', 'prod-1', 'pur-1', 5, 10000)`,
  );
  check('legacy DB has partner tables before 0002', await tableCount(legacy, PARTNER_TABLES), 6);
  await legacy.$disconnect();

  // runMigrations must now apply 0002 + 0003 on top of the v1.1.2 database.
  await runMigrations();
  const migrated = getPrisma();
  check('partner tables gone after 0002', await tableCount(migrated, PARTNER_TABLES), 0);
  check(
    'OwnerCapital/OwnerDrawing tables exist after 0002',
    await tableCount(migrated, ['OwnerCapital', 'OwnerDrawing']),
    2,
  );
  const closing = await migrated.$queryRawUnsafe<{ netProfit: number }[]>(
    `SELECT "netProfit" FROM "MonthlyClosing" WHERE "month" = '2026-10'`,
  );
  check('closing row kept with netProfit intact', closing[0]?.netProfit, 600000);
  const purchase = await migrated.$queryRawUnsafe<{ fundingSource: string }[]>(
    `SELECT "fundingSource" FROM "Purchase" WHERE "id" = 'pur-1'`,
  );
  check('partner-funded purchase kept, re-pointed to business cash', purchase[0]?.fundingSource, 'BUSINESS_CASH');
  const closingCols = await columnNames(migrated, 'MonthlyClosing');
  check(
    'MonthlyClosing partnership columns dropped',
    ['reservePct', 'reserveAmount', 'distributable', 'partner1Share', 'partner2Share'].some((c) => closingCols.includes(c)),
    false,
  );
  const purchaseCols = await columnNames(migrated, 'Purchase');
  check(
    'Purchase partner columns dropped',
    ['partnerId', 'loanId'].some((c) => purchaseCols.includes(c)),
    false,
  );
  const userCols = await columnNames(migrated, 'User');
  check('User role column dropped', userCols.includes('role'), false);
  const legacyLot = await migrated.$queryRawUnsafe<{ purchaseId: string | null; qtyRemaining: number }[]>(
    `SELECT "purchaseId", "qtyRemaining" FROM "PurchaseLot" WHERE "id" = 'lot-1'`,
  );
  check('legacy lot survives 0003 with purchaseId intact', legacyLot[0]?.purchaseId, 'pur-1');
  check('legacy lot qty intact', legacyLot[0]?.qtyRemaining, 5);
  const lotCols = await columnNames(migrated, 'PurchaseLot');
  check('PurchaseLot still has purchaseId column', lotCols.includes('purchaseId'), true);
  await runMigrations();
  const applied3 = await getPrisma().$queryRawUnsafe<{ name: string }[]>(
    `SELECT "name" FROM "_migrations"`,
  );
  check('re-run after legacy migration stays idempotent', applied3.length, 3);

  await getPrisma().$disconnect();
  if (failures > 0) {
    console.log(`\n${failures} MIGRATION CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log('\nALL MIGRATION CHECKS PASSED');
}

main().catch((e) => {
  console.error('test failed', e);
  process.exit(1);
});
