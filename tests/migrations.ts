// ShopDesk — migration runner regression tests.
// Covers the v1.1.0/v1.1.1 Windows bug: the packaged app shipped the
// migration file nested one level too deep (resources/migrations/migrations/),
// so runMigrations() found no .sql files, applied nothing, and the app
// opened on an empty database — login failed with
// "table main.User does not exist". Run: npm run test:migrations
import fs from 'node:fs';
import path from 'node:path';

const TEST_DB = path.join(process.cwd(), 'shopdesk-migrations-test.db');
process.env.SHOPDESK_DB_PATH = TEST_DB;

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

async function main() {
  const { getPrisma, runMigrations } = await import('../src/main/db');
  const { getSetupStatus, completeSetup } = await import('../src/main/setup');
  const { login } = await import('../src/main/services/auth');

  // Fresh DB, no tables at all.
  try {
    await getPrisma().$disconnect();
  } catch {
    /* no cached client yet */
  }
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  // 1. runMigrations creates the tables from the project resources dir.
  await runMigrations();
  const tables = await getPrisma().$queryRawUnsafe<{ name: string }[]>(
    `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" IN ('User', 'Partner', 'Sale', 'AppSettings')`,
  );
  check('runMigrations creates core tables', tables.length, 4);
  const applied = await getPrisma().$queryRawUnsafe<{ name: string }[]>(
    `SELECT "name" FROM "_migrations"`,
  );
  check('migration recorded once', applied.map((r) => r.name).join(','), '0001_init.sql');

  // 2. Re-running is a no-op (idempotent).
  await runMigrations();
  const applied2 = await getPrisma().$queryRawUnsafe<{ name: string }[]>(
    `SELECT "name" FROM "_migrations"`,
  );
  check('second runMigrations is idempotent', applied2.length, 1);

  // 3. Fresh DB reports needsSetup (Setup wizard), not a broken login.
  const status = await getSetupStatus();
  check('fresh DB needsSetup', status.needsSetup, true);

  // 4. Clean setup + login with the account created during setup works end to end.
  await completeSetup({
    shopName: 'Migration Test Shop',
    shopAddress: '',
    shopPhone: '',
    reservePct: 0,
    partners: [{ name: 'Owner', type: 'CAPITAL', profitSharePct: 100 }],
    admin: { name: 'Owner', username: 'owner1', password: 'secret123' },
    partnerUser: null,
  });
  const session = await login('owner1', 'secret123');
  check('clean-setup login works', session.username, 'owner1');
  check('clean-setup login role is ADMIN', session.role, 'ADMIN');

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
