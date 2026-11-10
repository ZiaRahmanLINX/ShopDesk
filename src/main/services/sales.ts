// Sales / POS services.
// Every completed sale updates: inventory (FIFO), cash accounts, customer
// credit, COGS and gross profit — atomically. Unpaid credit is NEVER cash.
import { getPrisma, audit, nextInvoiceNo } from '../db';
import { createSaleSchema } from '../../shared/schemas';
import { lockedMonths, monthIsLockedCheck } from './catalog';

function methodToAccountKind(method: string): string | null {
  if (method === 'CASH') return 'CASH';
  if (method === 'BANK') return 'BANK';
  if (method === 'EASYPAISA') return 'EASYPAISA';
  if (method === 'JAZZCASH') return 'JAZZCASH';
  return null; // CREDIT
}

export async function createSale(input: unknown, userId: string | null) {
  const data = createSaleSchema.parse(input);
  const db = getPrisma();
  const locked = await lockedMonths();
  const now = new Date();
  monthIsLockedCheck(locked, now);

  // Validate stock and compute totals up front.
  const products = await db.product.findMany({
    where: { id: { in: data.items.map((i) => i.productId) } },
  });
  for (const item of data.items) {
    const p = products.find((x) => x.id === item.productId);
    if (!p) throw new Error('Product not found');
    if (!p.isActive) throw new Error(`${p.name} is deactivated`);
    if (p.qty < item.qty) throw new Error(`Not enough stock for ${p.name} (have ${p.qty}, need ${item.qty})`);
  }
  const subtotal = data.items.reduce((s, it) => s + Math.round(it.qty * it.unitPrice) - it.discount, 0);
  const total = subtotal - data.discount;
  if (total <= 0) throw new Error('Sale total must be greater than 0');
  const paidSum = data.payments.reduce((s, p) => s + p.amount, 0);
  const creditPart = data.payments.filter((p) => p.method === 'CREDIT').reduce((s, p) => s + p.amount, 0);
  const cashPart = paidSum - creditPart;
  if (paidSum !== total) {
    throw new Error(`Payments (${paidSum / 100}) do not add up to the total (${total / 100})`);
  }
  if (creditPart > 0 && !data.customerId) {
    throw new Error('Credit sale needs a customer');
  }

  // Resolve cash accounts for each non-credit payment.
  const accounts = await db.cashAccount.findMany({ where: { isActive: true } });
  for (const pay of data.payments) {
    if (pay.method === 'CREDIT') continue;
    const kind = methodToAccountKind(pay.method);
    const accId = pay.cashAccountId || accounts.find((a) => a.kind === kind)?.id;
    if (!accId) throw new Error(`No active ${pay.method} account — add one in Cashbook first`);
    pay.cashAccountId = accId;
  }

  const invoiceNo = await nextInvoiceNo();

  const sale = await db.$transaction(async (tx) => {
    let totalCogs = 0;
    const saleItems: { productId: string; qty: number; unitPrice: number; unitCost: number; lineTotal: number; discount: number }[] = [];

    for (const item of data.items) {
      // FIFO: consume oldest lots first.
      let remaining = item.qty;
      let cogsForLine = 0;
      const lots = await tx.purchaseLot.findMany({
        where: { productId: item.productId, qtyRemaining: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.qtyRemaining, remaining);
        cogsForLine += Math.round(take * lot.unitCost);
        await tx.purchaseLot.update({
          where: { id: lot.id },
          data: { qtyRemaining: lot.qtyRemaining - take },
        });
        remaining -= take;
      }
      if (remaining > 0) {
        // Stock exists but no lots (e.g. legacy data) — fall back to current purchase price.
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        cogsForLine += Math.round(remaining * (prod?.purchasePrice ?? 0));
      }
      const unitCost = Math.round(cogsForLine / item.qty);
      totalCogs += cogsForLine;

      const prod = await tx.product.findUnique({ where: { id: item.productId } });
      await tx.product.update({
        where: { id: item.productId },
        data: { qty: (prod?.qty ?? 0) - item.qty },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'SALE',
          qtyChange: -item.qty,
          unitCost,
          refType: 'SALE',
          note: `Sale ${invoiceNo}`,
          createdById: userId,
        },
      });
      saleItems.push({
        productId: item.productId,
        qty: item.qty,
        unitPrice: item.unitPrice,
        unitCost,
        lineTotal: Math.round(item.qty * item.unitPrice) - item.discount,
        discount: item.discount,
      });
    }

    const grossProfit = total - totalCogs;
    const s = await tx.sale.create({
      data: {
        invoiceNo,
        customerId: data.customerId || null,
        subtotal,
        discount: data.discount,
        total,
        paidAmount: cashPart,
        changeGiven: 0,
        paymentMethod: data.payments.length > 1 ? 'SPLIT' : data.payments[0].method,
        cogs: totalCogs,
        grossProfit,
        status: 'COMPLETED',
        createdById: userId,
        note: data.note || null,
        items: { create: saleItems },
        payments: {
          create: data.payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            cashAccountId: p.cashAccountId || null,
          })),
        },
      },
    });

    await tx.invoice.create({
      data: { saleId: s.id, invoiceNo, total, paidAmount: cashPart, balance: creditPart },
    });

    // Cash legs — one per non-credit payment.
    for (const pay of data.payments) {
      if (pay.method === 'CREDIT' || !pay.cashAccountId) continue;
      await tx.cashAccount.update({
        where: { id: pay.cashAccountId },
        data: { currentBalance: { increment: pay.amount } },
      });
      await tx.cashTransaction.create({
        data: {
          accountId: pay.cashAccountId,
          type: 'IN',
          amount: pay.amount,
          category: 'SALE',
          refType: 'SALE',
          refId: s.id,
          note: `Sale ${invoiceNo} (${pay.method})`,
          createdById: userId,
        },
      });
    }

    // Credit leg — customer owes the business; never counted as cash.
    if (creditPart > 0 && data.customerId) {
      await tx.customerLedger.create({
        data: {
          customerId: data.customerId,
          type: 'CREDIT_SALE',
          amount: creditPart,
          refType: 'SALE',
          refId: s.id,
          note: `Credit sale ${invoiceNo}`,
        },
      });
      await tx.customer.update({
        where: { id: data.customerId },
        data: { currentBalance: { increment: creditPart } },
      });
    }
    return s;
  });

  await audit(userId, 'SALE_CREATED', 'Sale', sale.id, { invoiceNo, total, cogs: sale.cogs });
  return sale;
}

export async function listSales(filter?: { from?: string; to?: string; customerId?: string; limit?: number; status?: string }) {
  const db = getPrisma();
  const where: Record<string, unknown> = {};
  if (filter?.customerId) where.customerId = filter.customerId;
  if (filter?.status) where.status = filter.status;
  if (filter?.from || filter?.to) {
    where.date = {};
    if (filter.from) (where.date as Record<string, unknown>).gte = new Date(filter.from);
    if (filter.to) (where.date as Record<string, unknown>).lte = new Date(filter.to);
  }
  return db.sale.findMany({
    where,
    include: { customer: true, items: { include: { product: true } }, payments: true },
    orderBy: { date: 'desc' },
    take: filter?.limit || 100,
  });
}

export async function getSale(id: string) {
  const db = getPrisma();
  return db.sale.findUnique({
    where: { id },
    include: { customer: true, items: { include: { product: true } }, payments: true, invoice: true },
  });
}

export async function getSaleByInvoice(invoiceNo: string) {
  const db = getPrisma();
  return db.sale.findUnique({
    where: { invoiceNo },
    include: { customer: true, items: { include: { product: true } }, payments: true, invoice: true },
  });
}

/** Refund / cancel a sale: fully reverses stock, cash and credit with audit trail.
 *  The sale row stays in history with status REFUNDED/CANCELLED. */
export async function refundSale(
  saleId: string,
  reason: string,
  userId: string | null,
) {
  const db = getPrisma();
  const locked = await lockedMonths();
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: { items: true, payments: true },
  });
  if (!sale) throw new Error('Sale not found');
  if (sale.status !== 'COMPLETED') throw new Error(`Sale is already ${sale.status}`);
  monthIsLockedCheck(locked, sale.date);

  await db.$transaction(async (tx) => {
    // Stock back — re-enter as lots at the original FIFO cost.
    for (const item of sale.items) {
      await tx.purchaseLot.create({
        data: { productId: item.productId, purchaseId: 'REFUND', qtyRemaining: item.qty, unitCost: item.unitCost },
      });
      const prod = await tx.product.findUnique({ where: { id: item.productId } });
      await tx.product.update({ where: { id: item.productId }, data: { qty: (prod?.qty ?? 0) + item.qty } });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'RETURN_CUSTOMER',
          qtyChange: item.qty,
          unitCost: item.unitCost,
          refType: 'SALE',
          refId: saleId,
          note: reason,
          createdById: userId,
        },
      });
    }
    // Cash back out.
    for (const pay of sale.payments) {
      if (pay.method === 'CREDIT' || !pay.cashAccountId) continue;
      await tx.cashAccount.update({
        where: { id: pay.cashAccountId },
        data: { currentBalance: { decrement: pay.amount } },
      });
      await tx.cashTransaction.create({
        data: {
          accountId: pay.cashAccountId,
          type: 'OUT',
          amount: pay.amount,
          category: 'SALE',
          refType: 'SALE',
          refId: saleId,
          note: `Refund of ${sale.invoiceNo} (${pay.method})`,
          createdById: userId,
        },
      });
    }
    // Credit back off the customer.
    const credit = sale.payments.filter((p) => p.method === 'CREDIT').reduce((s, p) => s + p.amount, 0);
    if (credit > 0 && sale.customerId) {
      await tx.customerLedger.create({
        data: { customerId: sale.customerId, type: 'ADJUSTMENT', amount: -credit, refType: 'SALE', refId: saleId, note: `Refund of ${sale.invoiceNo}` },
      });
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { currentBalance: { decrement: credit } },
      });
    }
    await tx.sale.update({ where: { id: saleId }, data: { status: 'REFUNDED', note: reason } });
    await tx.invoice.updateMany({ where: { saleId }, data: { balance: 0 } });
  });
  await audit(userId, 'SALE_REFUNDED', 'Sale', saleId, { invoiceNo: sale.invoiceNo, reason, total: sale.total });
  return { ok: true };
}
