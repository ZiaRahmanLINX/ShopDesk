// ShopDesk — end-to-end accounting scenario tests (spec section 21,
// single-owner edition). Runs the REAL service layer against a throwaway
// SQLite file and asserts every balance the spec requires. All amounts
// are integer paisa. The partnership edition is gone: capital and
// drawings belong to the single owner, month close takes a P&L snapshot
// only — no reserve, no distribution. Run: npm run test:scenarios
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../src/main/generated-prisma';

const TEST_DB = path.join(process.cwd(), 'shopdesk-test.db');
process.env.SHOPDESK_DB_PATH = TEST_DB;

const P = (rs: number) => Math.round(rs * 100);

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  const fmt = (v: unknown) => (typeof v === 'number' ? String(v / 100) : JSON.stringify(v));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${fmt(actual)}, expected ${fmt(expected)}`);
}
function checkRaw(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function checkStr(name: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got "${actual}", expected "${expected}"`);
}

async function main() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  const db = new PrismaClient({ datasourceUrl: `file:${TEST_DB}` });

  // Apply the shipped migration SQL (same files the app runs at startup):
  // 0001 builds the v1.1.2 schema, 0002 drops the partnership.
  const migDir = path.join(process.cwd(), 'resources', 'migrations');
  let applied = 0;
  for (const file of fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
    const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) await db.$executeRawUnsafe(stmt);
    applied += statements.length;
  }
  console.log(`Applied ${applied} migration statements.`);

  // Import services AFTER the env var is set (they read dbPath lazily).
  const { setSetting, DEFAULT_SETTINGS } = await import('../src/main/db');
  const purchases = await import('../src/main/services/purchases');
  const sales = await import('../src/main/services/sales');
  const finance = await import('../src/main/services/finance');
  const owner = await import('../src/main/services/owner');
  const closing = await import('../src/main/services/closing');
  const reports = await import('../src/main/services/reports');

  // ---- Setup: shop, accounts, categories, products ----
  await setSetting('shop', { ...DEFAULT_SETTINGS, shopName: 'Test Shop' });
  const cash = await db.cashAccount.create({ data: { kind: 'CASH', name: 'Shop Cash', openingBalance: 0, currentBalance: 0 } });
  await db.cashAccount.create({ data: { kind: 'BANK', name: 'Bank', openingBalance: 0, currentBalance: 0 } });
  await db.cashAccount.create({ data: { kind: 'EASYPAISA', name: 'Easypaisa', openingBalance: 0, currentBalance: 0 } });
  await db.cashAccount.create({ data: { kind: 'JAZZCASH', name: 'JazzCash', openingBalance: 0, currentBalance: 0 } });
  const rentCat = await db.expenseCategory.create({ data: { name: 'Shop rent' } });
  const elecCat = await db.expenseCategory.create({ data: { name: 'Electricity' } });
  const cat = await db.category.create({ data: { name: 'Grocery' } });
  const supplier = await db.supplier.create({ data: { name: 'Test Wholesaler' } });
  const customer = await db.customer.create({ data: { name: 'Test Customer', phone: '0300-0000000' } });

  const mkProduct = async (name: string, sku: string, buy: number, sell: number) =>
    db.product.create({
      data: { name, sku, categoryId: cat.id, purchasePrice: P(buy), sellingPrice: P(sell), qty: 0, minQty: 0, unit: 'piece', supplierId: supplier.id },
    });
  const prodX = await mkProduct('Item X', 'X-001', 100, 200);
  const prodY = await mkProduct('Item Y', 'Y-001', 150, 250);
  const prodZ = await mkProduct('Item Z', 'Z-001', 250, 400);

  const cashBalance = async () => (await db.cashAccount.findUnique({ where: { id: cash.id } }))!.currentBalance;
  const inventoryValue = async () => {
    const lots = await db.purchaseLot.findMany({ where: { qtyRemaining: { gt: 0 } } });
    return lots.reduce((s, l) => s + Math.round(l.qtyRemaining * l.unitCost), 0);
  };

  // ---- Scenario A: owner invests Rs 300,000 (INITIAL capital) ----
  const capA = await owner.addCapital(P(300000), 'INITIAL', 'Initial investment', cash.id, 'CASH', null);
  check('A: cash after investment', await cashBalance(), P(300000));
  check('A: ownerSummary totalCapital', (await owner.ownerSummary()).totalCapital, P(300000));
  checkStr('A: capital row kind is INITIAL', capA.kind, 'INITIAL');

  // ---- Scenario B: purchase Rs 200,000 of inventory (cash, paid in full) ----
  await purchases.createPurchase(
    {
      supplierId: supplier.id,
      invoiceNo: 'PUR-TEST-01',
      items: [
        { productId: prodX.id, qty: 1000, unitCost: P(100) },
        { productId: prodY.id, qty: 500, unitCost: P(150) },
        { productId: prodZ.id, qty: 100, unitCost: P(250) },
      ],
      discount: 0,
      transport: 0,
      paidAmount: P(200000),
      paymentMethod: 'CASH',
      fundingSource: 'BUSINESS_CASH',
      cashAccountId: cash.id,
    },
    null,
  );
  check('B: cash after purchase', await cashBalance(), P(100000));
  check('B: inventory value', await inventoryValue(), P(200000));
  check('B: purchase is NOT an expense', (await db.expense.aggregate({ _sum: { amount: true } }))._sum.amount || 0, 0);

  // ---- Scenario C: Rs 30,000 cash sales + Rs 5,000 credit sale ----
  await sales.createSale(
    {
      customerId: null,
      items: [
        { productId: prodX.id, qty: 100, unitPrice: P(200), discount: 0 },
        { productId: prodY.id, qty: 40, unitPrice: P(250), discount: 0 },
      ],
      discount: 0,
      payments: [{ method: 'CASH', amount: P(30000), cashAccountId: cash.id }],
    },
    null,
  );
  await sales.createSale(
    {
      customerId: customer.id,
      items: [{ productId: prodY.id, qty: 20, unitPrice: P(250), discount: 0 }],
      discount: 0,
      payments: [{ method: 'CREDIT', amount: P(5000) }],
    },
    null,
  );
  check('C: cash after sales', await cashBalance(), P(130000));
  check('C: customer outstanding', (await db.customer.findUnique({ where: { id: customer.id } }))!.currentBalance, P(5000));
  const salesRows = await db.sale.findMany({ where: { status: 'COMPLETED' } });
  check('C: total gross profit', salesRows.reduce((s, x) => s + x.grossProfit, 0), P(16000));
  check('C: total COGS', salesRows.reduce((s, x) => s + x.cogs, 0), P(19000));

  // ---- Scenario D: urgent mid-month stock Rs 15,000 from business cash ----
  const profitBeforeD = (await closing.closePreview(new Date().toISOString().slice(0, 7))).netProfit;
  await purchases.createPurchase(
    {
      supplierId: supplier.id,
      invoiceNo: 'PUR-TEST-02',
      items: [{ productId: prodZ.id, qty: 60, unitCost: P(250) }],
      discount: 0,
      transport: 0,
      paidAmount: P(15000),
      paymentMethod: 'CASH',
      fundingSource: 'BUSINESS_CASH',
      cashAccountId: cash.id,
    },
    null,
  );
  check('D: cash after urgent purchase', await cashBalance(), P(115000));
  check('D: inventory after urgent purchase', await inventoryValue(), P(196000));
  const profitAfterD = (await closing.closePreview(new Date().toISOString().slice(0, 7))).netProfit;
  check('D: purchase did NOT reduce net profit', profitAfterD, profitBeforeD);

  // ---- Scenario E: additional owner capital Rs 20,000 ----
  await owner.addCapital(P(20000), 'ADDITIONAL', 'Top-up', cash.id, 'CASH', null);
  check('E: cash after top-up', await cashBalance(), P(135000));
  check('E: ownerSummary totalCapital', (await owner.ownerSummary()).totalCapital, P(320000));

  // ---- Scenario F: owner drawing Rs 10,000 — personal money out, NOT an expense ----
  await owner.addDrawing(P(10000), 'Personal use', cash.id, 'CASH', null);
  check('F: cash after drawing', await cashBalance(), P(125000));
  check('F: ownerSummary totalDrawings', (await owner.ownerSummary()).totalDrawings, P(10000));
  check('F: drawing is NOT an expense', (await db.expense.aggregate({ _sum: { amount: true } }))._sum.amount || 0, 0);
  check('F: drawing is NOT capital', (await owner.ownerSummary()).totalCapital, P(320000));
  // Drawing more than the cash balance is rejected and changes nothing.
  let overdrawn = false;
  try {
    await owner.addDrawing(P(200000), 'Too much', cash.id, 'CASH', null);
  } catch {
    overdrawn = true;
  }
  check('F: drawing over cash balance rejected', overdrawn, true);
  check('F: cash unchanged after rejected drawing', await cashBalance(), P(125000));

  // ---- Scenario G: rent Rs 8,000 + electricity Rs 2,000 ----
  await finance.createExpense({ title: 'Shop rent', categoryId: rentCat.id, amount: P(8000), paymentMethod: 'CASH', cashAccountId: cash.id }, null);
  await finance.createExpense({ title: 'Electricity bill', categoryId: elecCat.id, amount: P(2000), paymentMethod: 'CASH', cashAccountId: cash.id }, null);
  check('G: cash after expenses', await cashBalance(), P(115000));
  check('G: total expenses', (await db.expense.aggregate({ _sum: { amount: true } }))._sum.amount || 0, P(10000));

  // ---- Scenario H: customer pays Rs 2,000 against old credit ----
  await finance.recordPayment({ partyType: 'CUSTOMER', partyId: customer.id, amount: P(2000), method: 'CASH', cashAccountId: cash.id }, null);
  check('H: cash after collection', await cashBalance(), P(117000));
  check('H: customer outstanding now', (await db.customer.findUnique({ where: { id: customer.id } }))!.currentBalance, P(3000));

  // ---- Scenario I: monthly profit closes with a P&L snapshot only —
  // no reserve, no distribution, profit stays in the business ----
  const month = new Date().toISOString().slice(0, 7);
  const preview = await closing.closePreview(month);
  check('I: net profit', preview.netProfit, P(6000));
  check('I: preview has no reserveAmount', 'reserveAmount' in preview, false);
  check('I: preview has no distributable', 'distributable' in preview, false);
  check('I: preview has no partner shares', 'partner1Share' in preview || 'partner2Share' in preview, false);
  check('I: closing inventory', preview.closingInventoryValue, P(196000));

  const closed = await closing.closeMonth(month, 'Scenario test close', null);
  checkStr('I: month status', closed.status, 'CLOSED');
  // No distribution/reserve tables exist to hold rows in the first place.
  const partnerTables = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS "n" FROM "sqlite_master" WHERE "type" = 'table' AND "name" IN ('ProfitDistribution', 'BusinessReserve')`,
  );
  check('I: no distribution/reserve tables exist', Number(partnerTables[0].n), 0);
  // Balance sheet: retained earnings is the balancing figure — the month's
  // net profit kept in the business, less what the owner drew out.
  const sheet = await closing.balanceSheet();
  check('I: retained earnings = net profit - drawings', sheet.retainedEarnings, P(6000) - P(10000));
  check('I: balance sheet balances', sheet.balanced, sheet.retainedEarnings);
  check('I: equity is owner capital', sheet.equity.ownerCapital, P(320000));

  // Closing locks the month: a second close must fail.
  let relocked = false;
  try {
    await closing.closeMonth(month, 'again', null);
  } catch {
    relocked = true;
  }
  check('I: closed month rejects a second close', relocked, true);

  // Locked month rejects new transactions dated in it.
  let blockedSale = false;
  try {
    await sales.createSale(
      {
        customerId: null,
        items: [{ productId: prodX.id, qty: 1, unitPrice: P(200), discount: 0 }],
        discount: 0,
        payments: [{ method: 'CASH', amount: P(200), cashAccountId: cash.id }],
      },
      null,
    );
  } catch {
    blockedSale = true;
  }
  check('I: new sale in a locked month is rejected', blockedSale, true);

  // ---- Cross-checks: no double counting ----
  const purchaseTxns = await db.cashTransaction.findMany({ where: { category: 'PURCHASE', type: 'OUT' } });
  check('X: purchase cash-outs total', purchaseTxns.reduce((s, t) => s + t.amount, 0), P(215000));
  check('X: supplier payable is zero', (await db.supplier.findUnique({ where: { id: supplier.id } }))!.currentPayable, 0);
  const prodXNow = await db.product.findUnique({ where: { id: prodX.id } });
  const prodYNow = await db.product.findUnique({ where: { id: prodY.id } });
  const prodZNow = await db.product.findUnique({ where: { id: prodZ.id } });
  checkRaw('X: Item X qty', prodXNow!.qty, 900);
  checkRaw('X: Item Y qty', prodYNow!.qty, 440);
  checkRaw('X: Item Z qty', prodZNow!.qty, 160);
  const dash = await reports.dashboard();
  check('X: dashboard cash', dash.cashBalance, P(117000));
  check('X: dashboard customer outstanding', dash.customerOutstanding, P(3000));
  check('X: dashboard inventory value', dash.inventoryValue, P(196000));
  const capitalTxns = await db.cashTransaction.findMany({ where: { category: 'OWNER_CAPITAL', type: 'IN' } });
  check('X: owner capital cash-ins total', capitalTxns.reduce((s, t) => s + t.amount, 0), P(320000));
  const drawingTxns = await db.cashTransaction.findMany({ where: { category: 'OWNER_DRAWING', type: 'OUT' } });
  check('X: owner drawing cash-outs total', drawingTxns.reduce((s, t) => s + t.amount, 0), P(10000));

  await db.$disconnect();
  console.log(failures === 0 ? '\nALL SCENARIOS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Scenario run crashed:', e);
  process.exit(1);
});
