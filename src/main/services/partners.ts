// Partnership services: capital, loans, withdrawals, reserve, distributions.
// Capital and loans live in SEPARATE ledgers — never mixed.
import { getPrisma, audit, getShopSettings } from '../db';
import { lockedMonths, monthIsLockedCheck } from './catalog';

export async function listPartners() {
  const db = getPrisma();
  return db.partner.findMany({
    orderBy: { type: 'asc' },
    include: {
      _count: { select: { capitals: true, loans: true, withdrawals: true } },
    },
  });
}

export async function createPartner(
  input: { name: string; type: 'CAPITAL' | 'WORKING'; phone?: string; profitSharePct?: number },
  userId: string | null,
) {
  const db = getPrisma();
  const p = await db.partner.create({
    data: {
      name: input.name.trim(),
      type: input.type,
      phone: input.phone || null,
      profitSharePct: input.profitSharePct ?? 50,
    },
  });
  await audit(userId, 'PARTNER_CREATED', 'Partner', p.id, { name: input.name, type: input.type });
  return p;
}

export async function updatePartnerShare(partnerId: string, pct: number, userId: string | null) {
  const db = getPrisma();
  if (pct < 0 || pct > 100) throw new Error('Share must be 0–100');
  const p = await db.partner.update({ where: { id: partnerId }, data: { profitSharePct: pct } });
  await audit(userId, 'PARTNER_SHARE_CHANGED', 'Partner', partnerId, { pct });
  return p;
}

async function cashAccountFor(method: string, preferredId?: string | null) {
  const db = getPrisma();
  if (preferredId) {
    const acc = await db.cashAccount.findUnique({ where: { id: preferredId } });
    if (acc) return acc;
  }
  return db.cashAccount.findFirst({ where: { kind: method, isActive: true } });
}

/** Additional (or initial) capital from a partner — money IN to the business. */
export async function addCapital(
  partnerId: string,
  amount: number,
  kind: 'INITIAL' | 'ADDITIONAL',
  note: string | undefined,
  cashAccountId: string | undefined,
  method: string,
  userId: string | null,
) {
  if (amount <= 0) throw new Error('Amount must be greater than 0');
  const db = getPrisma();
  const acc = await cashAccountFor(method, cashAccountId);
  if (!acc) throw new Error(`No active ${method} account — add one in Cashbook first`);
  const rec = await db.$transaction(async (tx) => {
    const c = await tx.partnerCapital.create({
      data: { partnerId, kind, amount, note: note || null, cashAccountId: acc.id },
    });
    await tx.partner.update({ where: { id: partnerId }, data: { capitalBalance: { increment: amount } } });
    await tx.cashAccount.update({ where: { id: acc.id }, data: { currentBalance: { increment: amount } } });
    await tx.cashTransaction.create({
      data: { accountId: acc.id, type: 'IN', amount, category: 'CAPITAL', refType: 'CAPITAL', refId: c.id, note: `Capital from partner (${kind})`, createdById: userId },
    });
    return c;
  });
  await audit(userId, 'CAPITAL_ADDED', 'PartnerCapital', rec.id, { partnerId, amount, kind });
  return rec;
}

/** Temporary loan from a partner — business owes the partner; separate ledger. */
export async function addLoan(
  partnerId: string,
  amount: number,
  note: string | undefined,
  cashAccountId: string | undefined,
  method: string,
  userId: string | null,
) {
  if (amount <= 0) throw new Error('Amount must be greater than 0');
  const db = getPrisma();
  const acc = await cashAccountFor(method, cashAccountId);
  if (!acc) throw new Error(`No active ${method} account — add one in Cashbook first`);
  const loan = await db.$transaction(async (tx) => {
    const l = await tx.partnerLoan.create({
      data: { partnerId, amount, note: note || null, cashAccountId: acc.id },
    });
    await tx.partner.update({ where: { id: partnerId }, data: { loanBalance: { increment: amount } } });
    await tx.cashAccount.update({ where: { id: acc.id }, data: { currentBalance: { increment: amount } } });
    await tx.cashTransaction.create({
      data: { accountId: acc.id, type: 'IN', amount, category: 'LOAN', refType: 'LOAN', refId: l.id, note: 'Temporary loan from partner', createdById: userId },
    });
    return l;
  });
  await audit(userId, 'LOAN_ADDED', 'PartnerLoan', loan.id, { partnerId, amount });
  return loan;
}

/** Repay a partner loan (partial or full). */
export async function repayLoan(
  loanId: string,
  amount: number,
  cashAccountId: string | undefined,
  method: string,
  userId: string | null,
) {
  if (amount <= 0) throw new Error('Amount must be greater than 0');
  const db = getPrisma();
  const loan = await db.partnerLoan.findUnique({ where: { id: loanId } });
  if (!loan) throw new Error('Loan not found');
  const outstanding = loan.amount - loan.repaidAmount;
  if (amount > outstanding) throw new Error(`Only ${outstanding / 100} is outstanding on this loan`);
  const acc = await cashAccountFor(method, cashAccountId);
  if (!acc) throw new Error(`No active ${method} account`);
  if (acc.currentBalance < amount) throw new Error(`Insufficient balance in ${acc.name}`);
  await db.$transaction(async (tx) => {
    const newRepaid = loan.repaidAmount + amount;
    await tx.partnerLoan.update({
      where: { id: loanId },
      data: { repaidAmount: newRepaid, status: newRepaid >= loan.amount ? 'REPAID' : 'PARTIAL' },
    });
    await tx.partner.update({ where: { id: loan.partnerId }, data: { loanBalance: { decrement: amount } } });
    await tx.cashAccount.update({ where: { id: acc.id }, data: { currentBalance: { decrement: amount } } });
    await tx.cashTransaction.create({
      data: { accountId: acc.id, type: 'OUT', amount, category: 'LOAN_REPAY', refType: 'LOAN', refId: loanId, note: 'Partner loan repayment', createdById: userId },
    });
  });
  await audit(userId, 'LOAN_REPAID', 'PartnerLoan', loanId, { amount });
  return { ok: true };
}

/** Partner withdrawal — personal money out. NEVER an expense. */
export async function addWithdrawal(
  partnerId: string,
  amount: number,
  note: string | undefined,
  cashAccountId: string | undefined,
  method: string,
  approvedById: string | null,
  userId: string | null,
) {
  if (amount <= 0) throw new Error('Amount must be greater than 0');
  const db = getPrisma();
  const acc = await cashAccountFor(method, cashAccountId);
  if (!acc) throw new Error(`No active ${method} account`);
  if (acc.currentBalance < amount) throw new Error(`Insufficient balance in ${acc.name}`);
  const w = await db.$transaction(async (tx) => {
    const rec = await tx.partnerWithdrawal.create({
      data: { partnerId, amount, note: note || null, cashAccountId: acc.id, approvedById },
    });
    await tx.cashAccount.update({ where: { id: acc.id }, data: { currentBalance: { decrement: amount } } });
    await tx.cashTransaction.create({
      data: { accountId: acc.id, type: 'OUT', amount, category: 'WITHDRAWAL', refType: 'WITHDRAWAL', refId: rec.id, note: `Partner withdrawal: ${note || ''}`.trim(), createdById: userId },
    });
    return rec;
  });
  await audit(userId, 'PARTNER_WITHDRAWAL', 'PartnerWithdrawal', w.id, { partnerId, amount });
  return w;
}

export async function partnerStatement(partnerId: string) {
  const db = getPrisma();
  const [partner, capitals, loans, withdrawals, distributions] = await Promise.all([
    db.partner.findUnique({ where: { id: partnerId } }),
    db.partnerCapital.findMany({ where: { partnerId }, orderBy: { date: 'desc' } }),
    db.partnerLoan.findMany({ where: { partnerId }, orderBy: { date: 'desc' } }),
    db.partnerWithdrawal.findMany({ where: { partnerId }, orderBy: { date: 'desc' } }),
    db.profitDistribution.findMany({ where: { partnerId }, orderBy: { createdAt: 'desc' }, include: { closing: true } }),
  ]);
  return { partner, capitals, loans, withdrawals, distributions };
}

/** Current business reserve balance = ADDs minus USEs. */
export async function reserveBalance(): Promise<number> {
  const db = getPrisma();
  const rows = await db.businessReserve.findMany();
  return rows.reduce((s, r) => s + (r.kind === 'ADD' ? r.amount : -r.amount), 0);
}

export async function useReserve(
  amount: number,
  note: string,
  userId: string | null,
) {
  if (amount <= 0) throw new Error('Amount must be greater than 0');
  const db = getPrisma();
  const balance = await reserveBalance();
  if (amount > balance) throw new Error(`Reserve balance is only ${balance / 100}`);
  const rec = await db.businessReserve.create({
    data: { kind: 'USE', amount, note },
  });
  await audit(userId, 'RESERVE_USED', 'BusinessReserve', rec.id, { amount, note });
  return rec;
}

/** Approve + pay a profit distribution (needs admin approval). */
export async function payDistribution(
  distributionId: string,
  cashAccountId: string | undefined,
  method: string,
  userId: string | null,
) {
  const db = getPrisma();
  const d = await db.profitDistribution.findUnique({
    where: { id: distributionId },
    include: { closing: true },
  });
  if (!d) throw new Error('Distribution not found');
  if (d.status === 'PAID') throw new Error('Already paid');
  if (!d.closing.locked) throw new Error('Month must be closed before paying distributions');
  const acc = await cashAccountFor(method, cashAccountId);
  if (!acc) throw new Error(`No active ${method} account`);
  if (acc.currentBalance < d.amount) throw new Error(`Insufficient balance in ${acc.name}`);
  await db.$transaction(async (tx) => {
    await tx.profitDistribution.update({
      where: { id: distributionId },
      data: { status: 'PAID', paidDate: new Date(), cashAccountId: acc.id },
    });
    await tx.cashAccount.update({ where: { id: acc.id }, data: { currentBalance: { decrement: d.amount } } });
    await tx.cashTransaction.create({
      data: { accountId: acc.id, type: 'OUT', amount: d.amount, category: 'DISTRIBUTION', refType: 'DISTRIBUTION', refId: distributionId, note: `Profit distribution ${d.closing.month}`, createdById: userId },
    });
  });
  await audit(userId, 'DISTRIBUTION_PAID', 'ProfitDistribution', distributionId, { amount: d.amount });
  return { ok: true };
}
