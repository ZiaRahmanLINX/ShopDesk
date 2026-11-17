// Single-owner capital & drawings: the owner's money in / out of the business.
// Capital is money IN from the owner. A drawing is personal money OUT —
// NEVER an expense.
import { getPrisma, audit } from '../db';

async function cashAccountFor(method: string, preferredId?: string | null) {
  const db = getPrisma();
  if (preferredId) {
    const acc = await db.cashAccount.findUnique({ where: { id: preferredId } });
    if (acc) return acc;
  }
  return db.cashAccount.findFirst({ where: { kind: method, isActive: true } });
}

export async function listCapital() {
  const db = getPrisma();
  return db.ownerCapital.findMany({ orderBy: { date: 'desc' } });
}

/** Owner puts money into the business — cash IN. */
export async function addCapital(
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
    const c = await tx.ownerCapital.create({
      data: { kind, amount, note: note || null, cashAccountId: acc.id },
    });
    await tx.cashAccount.update({ where: { id: acc.id }, data: { currentBalance: { increment: amount } } });
    await tx.cashTransaction.create({
      data: { accountId: acc.id, type: 'IN', amount, category: 'OWNER_CAPITAL', refType: 'OWNER_CAPITAL', refId: c.id, note: `Owner capital (${kind})`, createdById: userId },
    });
    return c;
  });
  await audit(userId, 'OWNER_CAPITAL_ADDED', 'OwnerCapital', rec.id, { amount, kind });
  return rec;
}

export async function listDrawings() {
  const db = getPrisma();
  return db.ownerDrawing.findMany({ orderBy: { date: 'desc' } });
}

/** Owner takes personal money out of the business — cash OUT, NEVER an expense. */
export async function addDrawing(
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
  if (acc.currentBalance < amount) throw new Error(`Insufficient balance in ${acc.name}`);
  const rec = await db.$transaction(async (tx) => {
    const d = await tx.ownerDrawing.create({
      data: { amount, note: note || null, cashAccountId: acc.id },
    });
    await tx.cashAccount.update({ where: { id: acc.id }, data: { currentBalance: { decrement: amount } } });
    await tx.cashTransaction.create({
      data: { accountId: acc.id, type: 'OUT', amount, category: 'OWNER_DRAWING', refType: 'OWNER_DRAWING', refId: d.id, note: `Owner drawing${note ? `: ${note}` : ''}`, createdById: userId },
    });
    return d;
  });
  await audit(userId, 'OWNER_DRAWING', 'OwnerDrawing', rec.id, { amount });
  return rec;
}

export async function ownerSummary() {
  const db = getPrisma();
  const [capital, drawings] = await Promise.all([
    db.ownerCapital.aggregate({ _sum: { amount: true } }),
    db.ownerDrawing.aggregate({ _sum: { amount: true } }),
  ]);
  return {
    totalCapital: capital._sum.amount || 0,
    totalDrawings: drawings._sum.amount || 0,
  };
}
