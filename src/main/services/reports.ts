// Dashboard + report queries. All values come from real DB records.
import { getPrisma } from '../db';
import { dayBounds, monthBounds, monthKey } from '../utils/money';
import type { DashboardStats } from '../../shared/types';

export async function dashboard(): Promise<DashboardStats> {
  const db = getPrisma();
  const now = new Date();
  const today = dayBounds(now);
  const key = monthKey(now);
  const month = monthBounds(key);

  const [todaySales, monthSales, monthExpenses, monthPurchases, lots, accounts, customers, suppliers, lowStock, recentSales, recentPurchases, recentExpenses] =
    await Promise.all([
      db.sale.findMany({ where: { date: { gte: today.start, lte: today.end }, status: 'COMPLETED' } }),
      db.sale.findMany({ where: { date: { gte: month.start, lte: month.end }, status: 'COMPLETED' } }),
      db.expense.aggregate({ where: { date: { gte: month.start, lte: month.end } }, _sum: { amount: true } }),
      db.purchase.aggregate({ where: { date: { gte: month.start, lte: month.end } }, _sum: { total: true } }),
      db.purchaseLot.findMany({ where: { qtyRemaining: { gt: 0 } } }),
      db.cashAccount.findMany({ where: { isActive: true } }),
      db.customer.aggregate({ _sum: { currentBalance: true } }),
      db.supplier.aggregate({ _sum: { currentPayable: true } }),
      db.product.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      db.sale.findMany({ where: { status: 'COMPLETED' }, orderBy: { date: 'desc' }, take: 5, include: { customer: true } }),
      db.purchase.findMany({ orderBy: { date: 'desc' }, take: 5, include: { supplier: true } }),
      db.expense.findMany({ orderBy: { date: 'desc' }, take: 5, include: { category: true } }),
    ]);

  const todayTotal = todaySales.reduce((s, x) => s + x.total, 0);
  // Cash legs for today, split by account kind (cash vs bank/wallets).
  const cashAccounts = await db.cashAccount.findMany();
  const kindOf = new Map(cashAccounts.map((a) => [a.id, a.kind]));
  const todayTxns = await db.cashTransaction.findMany({
    where: { date: { gte: today.start, lte: today.end }, category: 'SALE', type: 'IN' },
  });
  let cashSales = 0;
  let onlineSales = 0;
  for (const t of todayTxns) {
    const kind = kindOf.get(t.accountId);
    if (kind === 'CASH') cashSales += t.amount;
    else onlineSales += t.amount;
  }
  const todayCredit = todaySales.reduce((s, x) => s + (x.total - x.paidAmount), 0);

  const monthTotal = monthSales.reduce((s, x) => s + x.total, 0);
  const monthCogs = monthSales.reduce((s, x) => s + x.cogs, 0);
  const monthGross = monthTotal - monthCogs;
  const monthExp = monthExpenses._sum.amount || 0;
  const monthNet = monthGross - monthExp;
  const inventoryValue = lots.reduce((s, l) => s + Math.round(l.qtyRemaining * l.unitCost), 0);

  const balanceOf = (kind: string) =>
    accounts.filter((a) => a.kind === kind).reduce((s, a) => s + a.currentBalance, 0);
  const wallet = balanceOf('EASYPAISA') + balanceOf('JAZZCASH') + balanceOf('OTHER');

  const low = lowStock.filter((p) => p.qty <= p.minQty).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    qty: p.qty,
    minQty: p.minQty,
  }));

  const recentTxns: DashboardStats['recentTxns'] = [
    ...recentSales.map((s) => ({ id: s.id, kind: 'Sale', label: s.customer?.name || 'Walk-in', amount: s.total, date: s.date.toISOString(), ref: s.invoiceNo })),
    ...recentPurchases.map((p) => ({ id: p.id, kind: 'Purchase', label: p.supplier.name, amount: -p.total, date: p.date.toISOString(), ref: p.invoiceNo })),
    ...recentExpenses.map((e) => ({ id: e.id, kind: 'Expense', label: e.title, amount: -e.amount, date: e.date.toISOString(), ref: e.category.name })),
  ]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 8);

  // Last 6 months profit comparison.
  const monthlyProfit: DashboardStats['monthlyProfit'] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = monthKey(d);
    const b = monthBounds(k);
    const ms = await db.sale.findMany({ where: { date: { gte: b.start, lte: b.end }, status: 'COMPLETED' } });
    const sales = ms.reduce((s, x) => s + x.total, 0);
    const profit = ms.reduce((s, x) => s + x.grossProfit, 0);
    monthlyProfit.push({
      month: d.toLocaleDateString('en-GB', { month: 'short' }),
      sales,
      profit,
    });
  }

  const expByCat = await db.expense.groupBy({
    by: ['categoryId'],
    where: { date: { gte: month.start, lte: month.end } },
    _sum: { amount: true },
  });
  const cats = await db.expenseCategory.findMany();
  const expenseByCategory = expByCat.map((b) => ({
    category: cats.find((c) => c.id === b.categoryId)?.name || 'Other',
    amount: b._sum.amount || 0,
  }));

  return {
    todaySales: todayTotal,
    todayCash: cashSales,
    todayOnline: onlineSales,
    todayCredit,
    monthSales: monthTotal,
    monthGrossProfit: monthGross,
    monthNetProfit: monthNet,
    monthExpenses: monthExp,
    monthPurchases: monthPurchases._sum.total || 0,
    inventoryValue,
    cashBalance: balanceOf('CASH'),
    bankBalance: balanceOf('BANK'),
    walletBalance: wallet,
    customerOutstanding: customers._sum.currentBalance || 0,
    supplierOutstanding: suppliers._sum.currentPayable || 0,
    lowStock: low,
    recentTxns,
    monthlyProfit,
    expenseByCategory,
  };
}

export async function productSalesReport(from: string, to: string) {
  const db = getPrisma();
  const items = await db.saleItem.findMany({
    where: {
      sale: { date: { gte: new Date(from), lte: new Date(to) }, status: 'COMPLETED' },
    },
    include: { product: true, sale: true },
  });
  const byProduct = new Map<string, { name: string; sku: string; qty: number; revenue: number; cogs: number; profit: number }>();
  for (const it of items) {
    const row = byProduct.get(it.productId) || { name: it.product.name, sku: it.product.sku, qty: 0, revenue: 0, cogs: 0, profit: 0 };
    row.qty += it.qty;
    row.revenue += it.lineTotal;
    const cogs = Math.round(it.qty * it.unitCost);
    row.cogs += cogs;
    row.profit += it.lineTotal - cogs;
    byProduct.set(it.productId, row);
  }
  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
}

export async function stockValuation() {
  const db = getPrisma();
  const products = await db.product.findMany({ where: { isActive: true }, include: { lots: { where: { qtyRemaining: { gt: 0 } } }, category: true } });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category?.name || '',
    qty: p.qty,
    unit: p.unit,
    avgCost: p.qty > 0 ? Math.round(p.lots.reduce((s, l) => s + l.qtyRemaining * l.unitCost, 0) / Math.max(p.qty, 1)) : 0,
    value: p.lots.reduce((s, l) => s + Math.round(l.qtyRemaining * l.unitCost), 0),
    sellingPrice: p.sellingPrice,
  }));
}

export async function auditLogs(limit = 200) {
  const db = getPrisma();
  return db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true, username: true } } },
  });
}
