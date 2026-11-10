// Demo seed: realistic kiryana (grocery) shop data.
// Runs once on first launch when the database is empty. All amounts in paisa.
import bcrypt from 'bcryptjs';
import { getPrisma, getSetting, setSetting, DEFAULT_SETTINGS } from './db';
import { addCapital } from './services/partners';
import { createPurchase } from './services/purchases';
import { createSale } from './services/sales';
import { createExpense } from './services/finance';

const P = (rs: number) => Math.round(rs * 100);

// Base lists every shop starts with (also used by clean setup).
export const BASE_EXPENSE_CATEGORIES = ['Shop rent', 'Electricity', 'Water', 'Internet', 'Transport', 'Packaging bags', 'Repairs', 'Cleaning', 'Tea and refreshments', 'Employee wages', 'Other expenses'];
export const BASE_PRODUCT_CATEGORIES = ['Grocery', 'Beverages', 'Snacks', 'Household', 'Personal Care', 'Dairy', 'Spices'];

export async function seedIfEmpty(): Promise<void> {
  const meta = await getSetting<{ seeded?: boolean } | null>('meta', null);
  if (meta?.seeded) return;
  const db = getPrisma();
  const users = await db.user.count();
  if (users > 0) {
    // A previous seed attempt failed midway (e.g. bad demo numbers) — wipe
    // the partial data and start over, so a first launch can never leave a
    // half-seeded database behind. This only ever runs before any real
    // business activity exists (no sales/purchases/expenses yet).
    await wipeAll();
  }
  await seedDemo();
  await setSetting('meta', { seeded: true });
}

/** Delete every business row (children first). _migrations is untouched. */
export async function wipeAll(): Promise<void> {
  const db = getPrisma();
  await db.auditLog.deleteMany();
  await db.profitDistribution.deleteMany();
  await db.monthlyClosing.deleteMany();
  await db.businessReserve.deleteMany();
  await db.partnerWithdrawal.deleteMany();
  await db.partnerLoan.deleteMany();
  await db.partnerCapital.deleteMany();
  await db.partner.deleteMany();
  await db.salePayment.deleteMany();
  await db.saleItem.deleteMany();
  await db.sale.deleteMany();
  await db.invoice.deleteMany();
  await db.purchaseItem.deleteMany();
  await db.purchaseLot.deleteMany();
  await db.stockMovement.deleteMany();
  await db.purchase.deleteMany();
  await db.expense.deleteMany();
  await db.expenseCategory.deleteMany();
  await db.customerLedger.deleteMany();
  await db.customer.deleteMany();
  await db.supplierLedger.deleteMany();
  await db.supplier.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.cashTransaction.deleteMany();
  await db.cashAccount.deleteMany();
  await db.payment.deleteMany();
  await db.user.deleteMany();
  await db.appSettings.deleteMany();
}

export async function seedDemo(): Promise<void> {
  const db = getPrisma();

  // Users
  const adminHash = await bcrypt.hash('admin123', 10);
  const partnerHash = await bcrypt.hash('partner123', 10);
  const admin = await db.user.create({
    data: { name: 'Shop Owner', username: 'admin', passwordHash: adminHash, role: 'ADMIN' },
  });
  await db.user.create({
    data: { name: 'Working Partner', username: 'partner', passwordHash: partnerHash, role: 'WORKING_PARTNER' },
  });

  // Settings
  await setSetting('shop', {
    ...DEFAULT_SETTINGS,
    shopName: 'Naimat Kiryana Store',
    shopAddress: 'Dargah Road, Pir Jo Goth, Sindh',
    shopPhone: '0300-0000000',
    thankYouNote: 'Thank you for shopping with us! Please visit again.',
    reservePct: 20,
  });

  // Cash accounts
  const cash = await db.cashAccount.create({ data: { kind: 'CASH', name: 'Shop Cash', openingBalance: 0, currentBalance: 0 } });
  const bank = await db.cashAccount.create({ data: { kind: 'BANK', name: 'Bank Account', openingBalance: 0, currentBalance: 0 } });
  const easy = await db.cashAccount.create({ data: { kind: 'EASYPAISA', name: 'Easypaisa', openingBalance: 0, currentBalance: 0 } });
  const jazz = await db.cashAccount.create({ data: { kind: 'JAZZCASH', name: 'JazzCash', openingBalance: 0, currentBalance: 0 } });

  // Expense categories
  const catNames = BASE_EXPENSE_CATEGORIES;
  const expCats: Record<string, string> = {};
  for (const name of catNames) {
    const c = await db.expenseCategory.create({ data: { name } });
    expCats[name] = c.id;
  }

  // Product categories
  const prodCats: Record<string, string> = {};
  for (const name of BASE_PRODUCT_CATEGORIES) {
    const c = await db.category.create({ data: { name } });
    prodCats[name] = c.id;
  }

  // Suppliers
  const sup1 = await db.supplier.create({ data: { name: 'City Wholesale Traders', phone: '0301-1111111', address: 'Wholesale Market, Khairpur' } });
  const sup2 = await db.supplier.create({ data: { name: 'Metro Distributors', phone: '0302-2222222', address: 'Main Bazaar, Sukkur' } });

  // Partners — Capital Partner invests Rs 300,000; Working Partner runs the shop.
  const capitalPartner = await db.partner.create({ data: { name: 'Capital Partner', type: 'CAPITAL', phone: '0303-3333333', profitSharePct: 50 } });
  const workingPartner = await db.partner.create({ data: { name: 'Working Partner', type: 'WORKING', phone: '0304-4444444', profitSharePct: 50 } });

  // Initial capital Rs 300,000 into Shop Cash.
  await addCapital(capitalPartner.id, P(300000), 'INITIAL', 'Initial investment', cash.id, 'CASH', admin.id);

  // Products (prices in Rs)
  const products: { id: string; buy: number; sell: number }[] = [];
  const defs: { name: string; sku: string; cat: string; buy: number; sell: number; qty: number; min: number; unit: string; sup: string }[] = [
    { name: 'Sugar 1kg', sku: 'SGR-001', cat: 'Grocery', buy: 165, sell: 180, qty: 120, min: 20, unit: 'kg', sup: sup1.id },
    { name: 'Cooking Oil 1L', sku: 'OIL-001', cat: 'Grocery', buy: 540, sell: 590, qty: 60, min: 10, unit: 'litre', sup: sup1.id },
    { name: 'Basmati Rice 1kg', sku: 'RCE-001', cat: 'Grocery', buy: 320, sell: 360, qty: 80, min: 15, unit: 'kg', sup: sup1.id },
    { name: 'Wheat Flour 10kg', sku: 'FLR-010', cat: 'Grocery', buy: 1150, sell: 1250, qty: 40, min: 8, unit: 'packet', sup: sup1.id },
    { name: 'Tea 250g', sku: 'TEA-250', cat: 'Grocery', buy: 420, sell: 470, qty: 50, min: 10, unit: 'packet', sup: sup2.id },
    { name: 'Milk 1L', sku: 'MLK-001', cat: 'Dairy', buy: 210, sell: 230, qty: 45, min: 10, unit: 'litre', sup: sup2.id },
    { name: 'Eggs (dozen)', sku: 'EGG-012', cat: 'Dairy', buy: 280, sell: 320, qty: 30, min: 5, unit: 'dozen', sup: sup2.id },
    { name: 'Soft Drink 1.5L', sku: 'DRK-15', cat: 'Beverages', buy: 150, sell: 180, qty: 70, min: 12, unit: 'piece', sup: sup2.id },
    { name: 'Biscuits Pack', sku: 'BIS-001', cat: 'Snacks', buy: 85, sell: 110, qty: 90, min: 15, unit: 'packet', sup: sup1.id },
    { name: 'Salt 1kg', sku: 'SLT-001', cat: 'Spices', buy: 60, sell: 75, qty: 100, min: 20, unit: 'kg', sup: sup1.id },
    { name: 'Red Chilli Powder 200g', sku: 'CHL-200', cat: 'Spices', buy: 180, sell: 210, qty: 40, min: 8, unit: 'packet', sup: sup1.id },
    { name: 'Washing Powder 1kg', sku: 'WSP-001', cat: 'Household', buy: 380, sell: 430, qty: 35, min: 8, unit: 'packet', sup: sup2.id },
    { name: 'Soap Bar', sku: 'SOP-001', cat: 'Personal Care', buy: 95, sell: 120, qty: 80, min: 15, unit: 'piece', sup: sup2.id },
    { name: 'Shampoo 200ml', sku: 'SHP-200', cat: 'Personal Care', buy: 320, sell: 370, qty: 25, min: 5, unit: 'piece', sup: sup2.id },
  ];
  for (const d of defs) {
    const p = await db.product.create({
      data: {
        name: d.name,
        sku: d.sku,
        categoryId: prodCats[d.cat],
        purchasePrice: P(d.buy),
        sellingPrice: P(d.sell),
        qty: 0,
        minQty: d.min,
        unit: d.unit,
        supplierId: d.sup,
      },
    });
    products.push({ id: p.id, buy: d.buy, sell: d.sell });
  }
  const bySku = new Map(defs.map((d, i) => [d.sku, products[i]]));

  // Opening purchase: first 8 products (cash, paid in full).
  const first8 = defs.slice(0, 8);
  const first8Total = first8.reduce((s, d) => s + d.qty * d.buy, 0) + 1500; // + transport
  await createPurchase(
    {
      supplierId: sup1.id,
      invoiceNo: 'PUR-00001',
      items: first8.map((d) => ({ productId: bySku.get(d.sku)!.id, qty: d.qty, unitCost: P(d.buy) })),
      discount: 0,
      transport: P(1500),
      paidAmount: P(first8Total),
      paymentMethod: 'CASH',
      fundingSource: 'BUSINESS_CASH',
      cashAccountId: cash.id,
      note: 'Opening stock purchase',
    },
    admin.id,
  );
  // Second purchase on supplier credit (partial).
  await createPurchase(
    {
      supplierId: sup2.id,
      invoiceNo: 'PUR-00002',
      items: defs.slice(8).map((d) => ({ productId: bySku.get(d.sku)!.id, qty: d.qty, unitCost: P(d.buy) })),
      discount: P(500),
      transport: 0,
      paidAmount: P(10000),
      paymentMethod: 'CREDIT',
      fundingSource: 'SUPPLIER_CREDIT',
      cashAccountId: cash.id,
      note: 'Second stock purchase — part credit',
    },
    admin.id,
  );

  // Customers (one with an old credit balance via a credit sale below).
  const cust1 = await db.customer.create({ data: { name: 'Ahmed Raza', phone: '0305-5555555', address: 'Mohalla Qasimabad' } });
  const cust2 = await db.customer.create({ data: { name: 'Bilal Ahmed', phone: '0306-6666666' } });

  // A few sales across the last days (cash + one credit).
  const sell = async (items: { sku: string; qty: number }[], customerId: string | null, method: 'CASH' | 'CREDIT' | 'EASYPAISA', daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const saleItems = items.map((it) => {
      const prod = defs.find((d) => d.sku === it.sku)!;
      return { productId: bySku.get(it.sku)!.id, qty: it.qty, unitPrice: P(prod.sell), discount: 0 };
    });
    const total = saleItems.reduce((s, it) => s + Math.round(it.qty * it.unitPrice), 0);
    // createSale uses "now" for the date; acceptable for demo data.
    void date;
    await createSale(
      {
        customerId,
        items: saleItems,
        discount: 0,
        payments: [{ method, amount: total, cashAccountId: method === 'EASYPAISA' ? easy.id : cash.id }],
        note: 'Demo sale',
      },
      admin.id,
    );
  };
  await sell([{ sku: 'SGR-001', qty: 5 }, { sku: 'OIL-001', qty: 2 }, { sku: 'BIS-001', qty: 4 }], null, 'CASH', 0);
  await sell([{ sku: 'RCE-001', qty: 3 }, { sku: 'TEA-250', qty: 2 }], null, 'CASH', 0);
  await sell([{ sku: 'MLK-001', qty: 4 }, { sku: 'EGG-012', qty: 2 }, { sku: 'DRK-15', qty: 6 }], cust1.id, 'CREDIT', 0);
  await sell([{ sku: 'FLR-010', qty: 1 }, { sku: 'SGR-001', qty: 2 }], null, 'EASYPAISA', 1);
  await sell([{ sku: 'WSP-001', qty: 2 }, { sku: 'SOP-001', qty: 5 }], cust2.id, 'CASH', 1);
  await sell([{ sku: 'OIL-001', qty: 1 }, { sku: 'CHL-200', qty: 3 }, { sku: 'SLT-001', qty: 2 }], null, 'CASH', 2);

  // Expenses this month.
  await createExpense({ title: 'Shop rent', categoryId: expCats['Shop rent'], amount: P(8000), paymentMethod: 'CASH', cashAccountId: cash.id, description: 'Monthly shop rent' }, admin.id);
  await createExpense({ title: 'Electricity bill', categoryId: expCats['Electricity'], amount: P(2000), paymentMethod: 'CASH', cashAccountId: cash.id, description: 'KElectric bill' }, admin.id);
  await createExpense({ title: 'Tea & refreshments', categoryId: expCats['Tea and refreshments'], amount: P(500), paymentMethod: 'CASH', cashAccountId: cash.id }, admin.id);

  void bank;
  void jazz;
  void workingPartner;
}
