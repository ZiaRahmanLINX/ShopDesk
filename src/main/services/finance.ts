// Finance services: expenses, cashbook, transfers, customer/supplier payments.
import { getPrisma, audit, nextReceiptNo } from '../db';
import { expenseSchema, paymentSchema } from '../../shared/schemas';
import { lockedMonths, monthIsLockedCheck } from './catalog';

// ---------- Cash accounts ----------
export async function listCashAccounts() {
  const db = getPrisma();
  return db.cashAccount.findMany({ orderBy: { kind: 'asc' } });
}

export async function createCashAccount(
  input: { kind: string; name: string; openingBalance?: number },
  userId: string | null,
) {
  const db = getPrisma();
  const acc = await db.cashAccount.create({
    data: {
      kind: input.kind,
      name: input.name.trim(),
      openingBalance: input.openingBalance || 0,
      currentBalance: input.openingBalance || 0,
    },
  });
  await audit(userId, 'CASH_ACCOUNT_CREATED', 'CashAccount', acc.id, { name: input.name, kind: input.kind });
  return acc;
}

export async function transferBetweenAccounts(
  fromId: string,
  toId: string,
  amount: number,
  note: string | undefined,
  userId: string | null,
) {
  if (fromId === toId) throw new Error('Source and destination must be different');
  if (amount <= 0) throw new Error('Amount must be greater than 0');
  const db = getPrisma();
  const from = await db.cashAccount.findUnique({ where: { id: fromId } });
  if (!from) throw new Error('Source account not found');
  if (from.currentBalance < amount) throw new Error(`Insufficient balance in ${from.name}`);
  await db.$transaction(async (tx) => {
    await tx.cashAccount.update({ where: { id: fromId }, data: { currentBalance: { decrement: amount } } });
    await tx.cashAccount.update({ where: { id: toId }, data: { currentBalance: { increment: amount } } });
    await tx.cashTransaction.create({
      data: { accountId: fromId, type: 'TRANSFER_OUT', amount, category: 'TRANSFER', note: note || 'Transfer', createdById: userId },
    });
    await tx.cashTransaction.create({
      data: { accountId: toId, type: 'TRANSFER_IN', amount, category: 'TRANSFER', note: note || 'Transfer', createdById: userId },
    });
  });
  await audit(userId, 'CASH_TRANSFER', 'CashAccount', fromId, { toId, amount });
  return { ok: true };
}

export async function cashTransactions(accountId?: string, limit = 200) {
  const db = getPrisma();
  return db.cashTransaction.findMany({
    where: accountId ? { accountId } : undefined,
    orderBy: { date: 'desc' },
    take: limit,
  });
}

// ---------- Expenses ----------
export async function listExpenseCategories() {
  const db = getPrisma();
  return db.expenseCategory.findMany({ orderBy: { name: 'asc' } });
}

export async function createExpenseCategory(name: string, userId: string | null) {
  const db = getPrisma();
  const c = await db.expenseCategory.create({ data: { name: name.trim() } });
  await audit(userId, 'EXPENSE_CATEGORY_CREATED', 'ExpenseCategory', c.id, { name });
  return c;
}

export async function createExpense(input: unknown, userId: string | null) {
  const data = expenseSchema.parse(input);
  const db = getPrisma();
  const locked = await lockedMonths();
  const date = data.date ? new Date(data.date) : new Date();
  monthIsLockedCheck(locked, date);
  const accounts = await db.cashAccount.findMany({ where: { isActive: true } });
  const accountId =
    data.cashAccountId ||
    accounts.find((a) => a.kind === data.paymentMethod)?.id;
  if (!accountId) throw new Error(`No active ${data.paymentMethod} account — add one in Cashbook first`);
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc || acc.currentBalance < data.amount) {
    throw new Error(`Insufficient balance in ${acc?.name || 'account'}`);
  }
  const expense = await db.$transaction(async (tx) => {
    const e = await tx.expense.create({
      data: {
        title: data.title.trim(),
        categoryId: data.categoryId,
        amount: data.amount,
        date,
        paymentMethod: data.paymentMethod,
        cashAccountId: accountId,
        description: data.description || null,
        recordedById: userId,
      },
    });
    await tx.cashAccount.update({ where: { id: accountId }, data: { currentBalance: { decrement: data.amount } } });
    await tx.cashTransaction.create({
      data: {
        accountId,
        type: 'OUT',
        amount: data.amount,
        category: 'EXPENSE',
        refType: 'EXPENSE',
        refId: e.id,
        note: data.title,
        date,
        createdById: userId,
      },
    });
    return e;
  });
  await audit(userId, 'EXPENSE_CREATED', 'Expense', expense.id, { title: data.title, amount: data.amount });
  return expense;
}

export async function listExpenses(filter?: { from?: string; to?: string; categoryId?: string; limit?: number }) {
  const db = getPrisma();
  const where: Record<string, unknown> = {};
  if (filter?.categoryId) where.categoryId = filter.categoryId;
  if (filter?.from || filter?.to) {
    where.date = {};
    if (filter.from) (where.date as Record<string, unknown>).gte = new Date(filter.from);
    if (filter.to) (where.date as Record<string, unknown>).lte = new Date(filter.to);
  }
  return db.expense.findMany({
    where,
    include: { category: true },
    orderBy: { date: 'desc' },
    take: filter?.limit || 200,
  });
}

// ---------- Customer / supplier payments ----------
export async function recordPayment(input: unknown, userId: string | null) {
  const data = paymentSchema.parse(input);
  const db = getPrisma();
  const locked = await lockedMonths();
  monthIsLockedCheck(locked, new Date());
  const accounts = await db.cashAccount.findMany({ where: { isActive: true } });
  const accountId =
    data.cashAccountId || accounts.find((a) => a.kind === data.method)?.id;
  if (!accountId) throw new Error(`No active ${data.method} account — add one in Cashbook first`);

  const receiptNo = await nextReceiptNo(data.partyType === 'CUSTOMER' ? 'CR' : 'SP');
  const payment = await db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        partyType: data.partyType,
        customerId: data.partyType === 'CUSTOMER' ? data.partyId : null,
        supplierId: data.partyType === 'SUPPLIER' ? data.partyId : null,
        receiptNo,
        amount: data.amount,
        method: data.method,
        cashAccountId: accountId,
        note: data.note || null,
        createdById: userId,
      },
    });
    if (data.partyType === 'CUSTOMER') {
      const cust = await tx.customer.findUnique({ where: { id: data.partyId } });
      if (!cust) throw new Error('Customer not found');
      if (cust.currentBalance < data.amount) throw new Error(`Customer only owes ${cust.currentBalance / 100}`);
      await tx.customerLedger.create({
        data: { customerId: data.partyId, type: 'PAYMENT', amount: -data.amount, refType: 'PAYMENT', refId: p.id, note: data.note || `Payment ${receiptNo}` },
      });
      await tx.customer.update({ where: { id: data.partyId }, data: { currentBalance: { decrement: data.amount } } });
      await tx.cashAccount.update({ where: { id: accountId }, data: { currentBalance: { increment: data.amount } } });
      await tx.cashTransaction.create({
        data: { accountId, type: 'IN', amount: data.amount, category: 'CUSTOMER_PAYMENT', refType: 'PAYMENT', refId: p.id, note: `Customer payment ${receiptNo}`, createdById: userId },
      });
    } else {
      const sup = await tx.supplier.findUnique({ where: { id: data.partyId } });
      if (!sup) throw new Error('Supplier not found');
      if (sup.currentPayable < data.amount) throw new Error(`Only ${sup.currentPayable / 100} is payable to this supplier`);
      await tx.supplierLedger.create({
        data: { supplierId: data.partyId, type: 'PAYMENT', amount: -data.amount, refType: 'PAYMENT', refId: p.id, note: data.note || `Payment ${receiptNo}` },
      });
      await tx.supplier.update({ where: { id: data.partyId }, data: { currentPayable: { decrement: data.amount } } });
      const acc = await tx.cashAccount.findUnique({ where: { id: accountId } });
      if (!acc || acc.currentBalance < data.amount) throw new Error('Insufficient cash balance for this payment');
      await tx.cashAccount.update({ where: { id: accountId }, data: { currentBalance: { decrement: data.amount } } });
      await tx.cashTransaction.create({
        data: { accountId, type: 'OUT', amount: data.amount, category: 'SUPPLIER_PAYMENT', refType: 'PAYMENT', refId: p.id, note: `Supplier payment ${receiptNo}`, createdById: userId },
      });
    }
    return p;
  });
  await audit(userId, 'PAYMENT_RECORDED', 'Payment', payment.id, { partyType: data.partyType, amount: data.amount, receiptNo });
  return payment;
}

/** Daily cash count: compare expected vs actual, record shortage/overage. */
export async function dailyCashCount(
  accountId: string,
  actualPaisa: number,
  note: string | undefined,
  userId: string | null,
) {
  const db = getPrisma();
  const acc = await db.cashAccount.findUnique({ where: { id: accountId } });
  if (!acc) throw new Error('Account not found');
  const expected = acc.currentBalance;
  const diff = actualPaisa - expected;
  if (diff !== 0) {
    await db.$transaction(async (tx) => {
      await tx.cashAccount.update({ where: { id: accountId }, data: { currentBalance: actualPaisa } });
      await tx.cashTransaction.create({
        data: {
          accountId,
          type: diff > 0 ? 'IN' : 'OUT',
          amount: Math.abs(diff),
          category: 'ADJUSTMENT',
          note: `Cash count ${diff > 0 ? 'overage' : 'shortage'}: ${note || ''}`.trim(),
          createdById: userId,
        },
      });
    });
    await audit(userId, 'CASH_COUNT_ADJUSTMENT', 'CashAccount', accountId, { expected, actual: actualPaisa, diff });
  }
  return { expected, actual: actualPaisa, diff };
}
