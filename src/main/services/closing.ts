// Monthly closing: preview, close (with lock), and P&L / Balance Sheet / Cash Flow.
import { getPrisma, audit } from '../db';
import { monthBounds } from '../utils/money';
import type { MonthlyClosePreview } from '../../shared/types';

export async function closePreview(month: string): Promise<MonthlyClosePreview> {
  const db = getPrisma();
  const { start, end } = monthBounds(month);

  const sales = await db.sale.findMany({
    where: { date: { gte: start, lte: end }, status: 'COMPLETED' },
  });
  const netSales = sales.reduce((s, x) => s + x.total, 0);
  const cogs = sales.reduce((s, x) => s + x.cogs, 0);
  const grossProfit = netSales - cogs;
  const expenses = await db.expense.aggregate({
    where: { date: { gte: start, lte: end } },
    _sum: { amount: true },
  });
  const expenseTotal = expenses._sum.amount || 0;
  const netProfit = grossProfit - expenseTotal;

  // Closing inventory value at FIFO cost.
  const lots = await db.purchaseLot.findMany({ where: { qtyRemaining: { gt: 0 } } });
  const closingInventoryValue = lots.reduce((s, l) => s + Math.round(l.qtyRemaining * l.unitCost), 0);

  const customerOutstanding = await db.customer.aggregate({ _sum: { currentBalance: true } });
  const supplierOutstanding = await db.supplier.aggregate({ _sum: { currentPayable: true } });
  const cash = await db.cashAccount.aggregate({ _sum: { currentBalance: true } });

  return {
    month,
    netSales,
    cogs,
    grossProfit,
    expenses: expenseTotal,
    netProfit,
    closingInventoryValue,
    customerOutstanding: customerOutstanding._sum.currentBalance || 0,
    supplierOutstanding: supplierOutstanding._sum.currentPayable || 0,
    cashBalance: cash._sum.currentBalance || 0,
  };
}

export async function closeMonth(month: string, notes: string | undefined, userId: string | null) {
  const db = getPrisma();
  const existing = await db.monthlyClosing.findUnique({ where: { month } });
  if (existing?.locked) throw new Error(`Month ${month} is already closed and locked`);
  const preview = await closePreview(month);

  const closing = await db.$transaction(async (tx) => {
    const c = await tx.monthlyClosing.upsert({
      where: { month },
      update: {
        status: 'CLOSED',
        locked: true,
        netSales: preview.netSales,
        cogs: preview.cogs,
        grossProfit: preview.grossProfit,
        expenses: preview.expenses,
        netProfit: preview.netProfit,
        closingInventoryValue: preview.closingInventoryValue,
        customerOutstanding: preview.customerOutstanding,
        supplierOutstanding: preview.supplierOutstanding,
        cashBalance: preview.cashBalance,
        notes: notes || null,
        closedAt: new Date(),
        closedById: userId,
      },
      create: {
        month,
        status: 'CLOSED',
        locked: true,
        netSales: preview.netSales,
        cogs: preview.cogs,
        grossProfit: preview.grossProfit,
        expenses: preview.expenses,
        netProfit: preview.netProfit,
        closingInventoryValue: preview.closingInventoryValue,
        customerOutstanding: preview.customerOutstanding,
        supplierOutstanding: preview.supplierOutstanding,
        cashBalance: preview.cashBalance,
        notes: notes || null,
        closedAt: new Date(),
        closedById: userId,
      },
    });
    return c;
  });
  await audit(userId, 'MONTH_CLOSED', 'MonthlyClosing', closing.id, {
    month,
    netProfit: preview.netProfit,
  });
  return closing;
}

export async function listClosings() {
  const db = getPrisma();
  return db.monthlyClosing.findMany({
    orderBy: { month: 'desc' },
  });
}

export async function getClosing(month: string) {
  const db = getPrisma();
  return db.monthlyClosing.findUnique({
    where: { month },
  });
}

// ---------- Reports ----------
export async function profitAndLoss(month: string) {
  const preview = await closePreview(month);
  const db = getPrisma();
  const { start, end } = monthBounds(month);
  const byCategory = await db.expense.groupBy({
    by: ['categoryId'],
    where: { date: { gte: start, lte: end } },
    _sum: { amount: true },
  });
  const cats = await db.expenseCategory.findMany();
  return {
    ...preview,
    expenseBreakdown: byCategory.map((b) => ({
      category: cats.find((c) => c.id === b.categoryId)?.name || 'Unknown',
      amount: b._sum.amount || 0,
    })),
  };
}

export async function balanceSheet() {
  const db = getPrisma();
  const [cash, lots, customers, suppliers, ownerCapital] = await Promise.all([
    db.cashAccount.aggregate({ _sum: { currentBalance: true } }),
    db.purchaseLot.findMany({ where: { qtyRemaining: { gt: 0 } } }),
    db.customer.aggregate({ _sum: { currentBalance: true } }),
    db.supplier.aggregate({ _sum: { currentPayable: true } }),
    db.ownerCapital.aggregate({ _sum: { amount: true } }),
  ]);
  const inventoryValue = lots.reduce((s, l) => s + Math.round(l.qtyRemaining * l.unitCost), 0);
  const cashTotal = cash._sum.currentBalance || 0;
  const receivables = customers._sum.currentBalance || 0;
  const payables = suppliers._sum.currentPayable || 0;
  const totalCapital = ownerCapital._sum.amount || 0;
  const assets = cashTotal + inventoryValue + receivables;
  const liabilities = payables;
  const equity = totalCapital;
  return {
    assets: { cash: cashTotal, inventory: inventoryValue, receivables, total: assets },
    liabilities: { supplierPayables: payables, total: liabilities },
    equity: { ownerCapital: totalCapital, total: equity },
    // Retained earnings (profit kept in the business) is the balancing figure.
    retainedEarnings: assets - liabilities - equity,
    balanced: assets - liabilities - equity,
  };
}

export async function cashFlow(from: string, to: string) {
  const db = getPrisma();
  const txns = await db.cashTransaction.findMany({
    where: { date: { gte: new Date(from), lte: new Date(to) } },
    orderBy: { date: 'asc' },
  });
  const byCategory: Record<string, { in: number; out: number }> = {};
  for (const t of txns) {
    const c = (byCategory[t.category] ||= { in: 0, out: 0 });
    if (t.type === 'IN' || t.type === 'TRANSFER_IN') c.in += t.amount;
    else c.out += t.amount;
  }
  const totalIn = txns.filter((t) => t.type === 'IN' || t.type === 'TRANSFER_IN').reduce((s, t) => s + t.amount, 0);
  const totalOut = txns.filter((t) => t.type === 'OUT' || t.type === 'TRANSFER_OUT').reduce((s, t) => s + t.amount, 0);
  return { byCategory, totalIn, totalOut, net: totalIn - totalOut, txns };
}
