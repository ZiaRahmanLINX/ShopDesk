// Purchase services.
// ACCOUNTING RULE: buying stock increases inventory (an asset). It does NOT
// reduce net profit. Only the cost of goods actually sold becomes COGS.
import { getPrisma, audit, nextPurchaseInvoiceNo } from '../db';
import { createPurchaseSchema } from '../../shared/schemas';
import { lockedMonths, monthIsLockedCheck } from './catalog';

function cashAccountForMethod(
  accounts: { id: string; kind: string; isActive: boolean }[],
  method: string,
): string | null {
  if (method === 'CREDIT') return null;
  const kind = method === 'CASH' ? 'CASH' : method === 'BANK' ? 'BANK' : method;
  const acc = accounts.find((a) => a.kind === kind && a.isActive);
  return acc ? acc.id : null;
}

export async function createPurchase(input: unknown, userId: string | null) {
  const data = createPurchaseSchema.parse(input);
  const db = getPrisma();
  const locked = await lockedMonths();
  const date = data.date ? new Date(data.date) : new Date();
  monthIsLockedCheck(locked, date);

  const subtotal = data.items.reduce((s, it) => s + Math.round(it.qty * it.unitCost), 0);
  const total = subtotal - data.discount + data.transport;
  if (total <= 0) throw new Error('Purchase total must be greater than 0');
  if (data.paidAmount > total) throw new Error('Paid amount cannot exceed the total');
  if (data.fundingSource === 'PARTNER_CAPITAL' || data.fundingSource === 'PARTNER_LOAN') {
    if (!data.partnerId) throw new Error('Partner is required for partner-funded purchases');
    if (data.paidAmount <= 0) throw new Error('Partner-funded purchase must have a paid amount');
  }

  const accounts = await db.cashAccount.findMany();
  let cashAccountId = data.cashAccountId || null;
  if (!cashAccountId && data.paidAmount > 0 && data.paymentMethod !== 'CREDIT') {
    cashAccountId = cashAccountForMethod(accounts, data.paymentMethod);
    if (!cashAccountId) throw new Error(`No active ${data.paymentMethod} account found — add one in Cashbook first`);
  }
  if (cashAccountId && data.paidAmount > 0) {
    const acc = accounts.find((a) => a.id === cashAccountId);
    if (!acc) throw new Error('Cash account not found');
    if (data.fundingSource === 'BUSINESS_CASH' && acc.currentBalance < data.paidAmount) {
      throw new Error(
        `Insufficient balance in ${acc.name} (available ${acc.currentBalance / 100}). Use partner capital, a partner loan, or supplier credit instead.`,
      );
    }
  }

  const invoiceNo = data.invoiceNo.trim() || (await nextPurchaseInvoiceNo());
  const existing = await db.purchase.findUnique({ where: { invoiceNo } });
  if (existing) throw new Error(`Purchase invoice ${invoiceNo} already exists`);

  const status = data.paidAmount >= total ? 'PAID' : data.paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

  const purchase = await db.$transaction(async (tx) => {
    // Partner funding leg: money comes IN from the partner, then OUT to the supplier.
    if (data.fundingSource === 'PARTNER_CAPITAL' && data.partnerId) {
      await tx.partnerCapital.create({
        data: {
          partnerId: data.partnerId,
          kind: 'ADDITIONAL',
          amount: data.paidAmount,
          date,
          note: `Capital for purchase ${invoiceNo}`,
          cashAccountId,
        },
      });
      await tx.partner.update({
        where: { id: data.partnerId },
        data: { capitalBalance: { increment: data.paidAmount } },
      });
      if (cashAccountId) {
        await tx.cashAccount.update({
          where: { id: cashAccountId },
          data: { currentBalance: { increment: data.paidAmount } },
        });
        await tx.cashTransaction.create({
          data: {
            accountId: cashAccountId,
            type: 'IN',
            amount: data.paidAmount,
            category: 'CAPITAL',
            refType: 'PURCHASE',
            note: `Partner capital for purchase ${invoiceNo}`,
            date,
            createdById: userId,
          },
        });
      }
    }
    if (data.fundingSource === 'PARTNER_LOAN' && data.partnerId) {
      const loan = await tx.partnerLoan.create({
        data: {
          partnerId: data.partnerId,
          amount: data.paidAmount,
          date,
          note: `Temporary loan for purchase ${invoiceNo}`,
          cashAccountId,
        },
      });
      await tx.partner.update({
        where: { id: data.partnerId },
        data: { loanBalance: { increment: data.paidAmount } },
      });
      if (cashAccountId) {
        await tx.cashAccount.update({
          where: { id: cashAccountId },
          data: { currentBalance: { increment: data.paidAmount } },
        });
        await tx.cashTransaction.create({
          data: {
            accountId: cashAccountId,
            type: 'IN',
            amount: data.paidAmount,
            category: 'LOAN',
            refType: 'LOAN',
            refId: loan.id,
            note: `Partner loan for purchase ${invoiceNo}`,
            date,
            createdById: userId,
          },
        });
      }
    }

    const p = await tx.purchase.create({
      data: {
        supplierId: data.supplierId,
        invoiceNo,
        date,
        subtotal,
        discount: data.discount,
        transport: data.transport,
        total,
        paidAmount: data.paidAmount,
        paymentMethod: data.paymentMethod,
        fundingSource: data.fundingSource,
        partnerId: data.partnerId || null,
        cashAccountId,
        status,
        note: data.note || null,
        createdById: userId,
      },
    });

    for (const item of data.items) {
      const lineTotal = Math.round(item.qty * item.unitCost);
      await tx.purchaseItem.create({
        data: {
          purchaseId: p.id,
          productId: item.productId,
          qty: item.qty,
          unitCost: item.unitCost,
          lineTotal,
        },
      });
      // FIFO lot — cost frozen at purchase time, never rewritten.
      await tx.purchaseLot.create({
        data: { productId: item.productId, purchaseId: p.id, qtyRemaining: item.qty, unitCost: item.unitCost },
      });
      const prod = await tx.product.findUnique({ where: { id: item.productId } });
      if (!prod) throw new Error('Product not found in purchase');
      await tx.product.update({
        where: { id: item.productId },
        data: { qty: prod.qty + item.qty, purchasePrice: item.unitCost },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'PURCHASE',
          qtyChange: item.qty,
          unitCost: item.unitCost,
          refType: 'PURCHASE',
          refId: p.id,
          createdById: userId,
        },
      });
    }

    // Supplier ledger: payable increases by the full total; payment reduces it.
    await tx.supplierLedger.create({
      data: { supplierId: data.supplierId, type: 'PURCHASE', amount: total, refType: 'PURCHASE', refId: p.id, date, note: `Purchase ${invoiceNo}` },
    });
    await tx.supplier.update({
      where: { id: data.supplierId },
      data: { currentPayable: { increment: total } },
    });
    if (data.paidAmount > 0) {
      await tx.supplierLedger.create({
        data: { supplierId: data.supplierId, type: 'PAYMENT', amount: -data.paidAmount, refType: 'PURCHASE', refId: p.id, date, note: `Paid on purchase ${invoiceNo}` },
      });
      await tx.supplier.update({
        where: { id: data.supplierId },
        data: { currentPayable: { decrement: data.paidAmount } },
      });
      if (cashAccountId) {
        await tx.cashAccount.update({
          where: { id: cashAccountId },
          data: { currentBalance: { decrement: data.paidAmount } },
        });
        await tx.cashTransaction.create({
          data: {
            accountId: cashAccountId,
            type: 'OUT',
            amount: data.paidAmount,
            category: 'PURCHASE',
            refType: 'PURCHASE',
            refId: p.id,
            note: `Payment for purchase ${invoiceNo}`,
            date,
            createdById: userId,
          },
        });
      }
    }
    return p;
  });

  await audit(userId, 'PURCHASE_CREATED', 'Purchase', purchase.id, {
    invoiceNo,
    total,
    paidAmount: data.paidAmount,
    fundingSource: data.fundingSource,
  });
  return purchase;
}

export async function listPurchases(filter?: { supplierId?: string; from?: string; to?: string; limit?: number }) {
  const db = getPrisma();
  const where: Record<string, unknown> = {};
  if (filter?.supplierId) where.supplierId = filter.supplierId;
  if (filter?.from || filter?.to) {
    where.date = {};
    if (filter.from) (where.date as Record<string, unknown>).gte = new Date(filter.from);
    if (filter.to) (where.date as Record<string, unknown>).lte = new Date(filter.to);
  }
  return db.purchase.findMany({
    where,
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { date: 'desc' },
    take: filter?.limit || 100,
  });
}

export async function getPurchase(id: string) {
  const db = getPrisma();
  return db.purchase.findUnique({
    where: { id },
    include: { supplier: true, items: { include: { product: true } } },
  });
}

/** Record a supplier return: stock goes back, payable is reduced. */
export async function supplierReturn(
  purchaseId: string,
  items: { productId: string; qty: number }[],
  note: string | undefined,
  userId: string | null,
) {
  const db = getPrisma();
  const locked = await lockedMonths();
  monthIsLockedCheck(locked, new Date());
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!purchase) throw new Error('Purchase not found');

  return db.$transaction(async (tx) => {
    let refund = 0;
    for (const item of items) {
      const pi = purchase.items.find((i) => i.productId === item.productId);
      if (!pi) throw new Error('Product is not on this purchase');
      if (item.qty <= 0 || item.qty > pi.qty) throw new Error('Invalid return quantity');
      const prod = await tx.product.findUnique({ where: { id: item.productId } });
      if (!prod || prod.qty < item.qty) throw new Error('Not enough stock to return');
      refund += Math.round(item.qty * pi.unitCost);
      await tx.product.update({ where: { id: item.productId }, data: { qty: prod.qty - item.qty } });
      // Remove from the purchase's lots first (oldest of that purchase).
      let remaining = item.qty;
      const lots = await tx.purchaseLot.findMany({
        where: { productId: item.productId, purchaseId, qtyRemaining: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.qtyRemaining, remaining);
        await tx.purchaseLot.update({ where: { id: lot.id }, data: { qtyRemaining: lot.qtyRemaining - take } });
        remaining -= take;
      }
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'RETURN_SUPPLIER',
          qtyChange: -item.qty,
          unitCost: pi.unitCost,
          refType: 'PURCHASE',
          refId: purchaseId,
          note: note || 'Supplier return',
          createdById: userId,
        },
      });
    }
    await tx.supplierLedger.create({
      data: { supplierId: purchase.supplierId, type: 'RETURN', amount: -refund, refType: 'PURCHASE', refId: purchaseId, note: note || 'Supplier return' },
    });
    await tx.supplier.update({
      where: { id: purchase.supplierId },
      data: { currentPayable: { decrement: refund } },
    });
    await audit(userId, 'SUPPLIER_RETURN', 'Purchase', purchaseId, { refund, note });
    return { refund };
  });
}
