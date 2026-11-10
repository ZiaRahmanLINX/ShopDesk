// Catalogue services: categories, products, suppliers, customers, stock adjustments.
import { getPrisma, audit } from '../db';
import { productSchema } from '../../shared/schemas';

export function monthIsLockedCheck(lockedMonths: string[], date: Date): void {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  if (lockedMonths.includes(key)) {
    throw new Error(
      `Month ${key} is closed and locked. Post a traceable adjustment entry instead of editing history.`,
    );
  }
}

export async function lockedMonths(): Promise<string[]> {
  const db = getPrisma();
  const rows = await db.monthlyClosing.findMany({
    where: { locked: true },
    select: { month: true },
  });
  return rows.map((r) => r.month);
}

// ---------- Categories ----------
export async function listCategories() {
  const db = getPrisma();
  return db.category.findMany({ orderBy: { name: 'asc' } });
}

export async function createCategory(name: string, userId: string | null) {
  const db = getPrisma();
  const cat = await db.category.create({ data: { name: name.trim() } });
  await audit(userId, 'CATEGORY_CREATED', 'Category', cat.id, { name });
  return cat;
}

// ---------- Products ----------
export async function listProducts(filter?: { search?: string; categoryId?: string; lowStockOnly?: boolean }) {
  const db = getPrisma();
  const where: Record<string, unknown> = { isActive: true };
  if (filter?.search) {
    const s = filter.search.trim();
    where.OR = [
      { name: { contains: s } },
      { sku: { contains: s } },
      { barcode: { contains: s } },
    ];
  }
  if (filter?.categoryId) where.categoryId = filter.categoryId;
  const products = await db.product.findMany({
    where,
    include: { category: true, lots: { where: { qtyRemaining: { gt: 0 } } } },
    orderBy: { name: 'asc' },
  });
  let list = products;
  if (filter?.lowStockOnly) list = products.filter((p) => p.qty <= p.minQty);
  return list.map((p) => ({
    ...p,
    stockValue: Math.round(
      p.lots.reduce((sum, lot) => sum + lot.qtyRemaining * lot.unitCost, 0),
    ),
  }));
}

export async function getProduct(id: string) {
  const db = getPrisma();
  return db.product.findUnique({
    where: { id },
    include: { category: true, lots: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function createProduct(input: unknown, userId: string | null) {
  const data = productSchema.parse(input);
  const db = getPrisma();
  const existing = await db.product.findUnique({ where: { sku: data.sku } });
  if (existing) throw new Error(`SKU ${data.sku} already exists`);
  const p = await db.product.create({ data: { ...data, qty: data.qty } });
  if (data.qty > 0) {
    // Opening stock becomes a lot at the purchase price so COGS is correct.
    await db.purchaseLot.create({
      data: {
        productId: p.id,
        purchaseId: 'OPENING',
        qtyRemaining: data.qty,
        unitCost: data.purchasePrice,
      },
    });
    await db.stockMovement.create({
      data: {
        productId: p.id,
        type: 'ADJUSTMENT',
        qtyChange: data.qty,
        unitCost: data.purchasePrice,
        refType: 'OPENING',
        note: 'Opening stock',
        createdById: userId,
      },
    });
  }
  await audit(userId, 'PRODUCT_CREATED', 'Product', p.id, { name: data.name, sku: data.sku });
  return p;
}

export async function updateProduct(id: string, input: unknown, userId: string | null) {
  const data = productSchema.parse(input);
  const db = getPrisma();
  const before = await db.product.findUnique({ where: { id } });
  if (!before) throw new Error('Product not found');
  const p = await db.product.update({ where: { id }, data });
  const changes: Record<string, unknown> = {};
  if (before.sellingPrice !== data.sellingPrice)
    changes.sellingPrice = { from: before.sellingPrice, to: data.sellingPrice };
  if (before.purchasePrice !== data.purchasePrice)
    changes.purchasePrice = { from: before.purchasePrice, to: data.purchasePrice };
  if (before.name !== data.name) changes.name = { from: before.name, to: data.name };
  await audit(userId, 'PRODUCT_UPDATED', 'Product', id, changes);
  return p;
}

export async function deleteProduct(id: string, userId: string | null) {
  const db = getPrisma();
  const p = await db.product.findUnique({ where: { id }, include: { _count: { select: { saleItems: true, purchaseItems: true } } } });
  if (!p) throw new Error('Product not found');
  if (p._count.saleItems > 0 || p._count.purchaseItems > 0) {
    // Soft-delete: keep history intact, hide from POS/catalogue.
    await db.product.update({ where: { id }, data: { isActive: false } });
    await audit(userId, 'PRODUCT_DEACTIVATED', 'Product', id, {
      reason: 'Has transaction history — deactivated instead of deleted',
    });
    return { deactivated: true };
  }
  await db.$transaction(async (tx) => {
    await tx.purchaseLot.deleteMany({ where: { productId: id } });
    await tx.stockMovement.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });
  await audit(userId, 'PRODUCT_DELETED', 'Product', id, { name: p.name });
  return { deactivated: false };
}

export async function adjustStock(
  productId: string,
  qtyChange: number,
  reason: 'ADJUSTMENT' | 'DAMAGE' | 'EXPIRED',
  note: string | undefined,
  userId: string | null,
) {
  if (qtyChange === 0) throw new Error('Quantity change cannot be zero');
  const db = getPrisma();
  const locked = await lockedMonths();
  monthIsLockedCheck(locked, new Date());
  return db.$transaction(async (tx) => {
    const p = await tx.product.findUnique({ where: { id: productId } });
    if (!p) throw new Error('Product not found');
    const newQty = p.qty + qtyChange;
    if (newQty < 0) throw new Error(`Stock would go negative (${p.qty} on hand)`);
    await tx.product.update({ where: { id: productId }, data: { qty: newQty } });
    if (qtyChange > 0) {
      await tx.purchaseLot.create({
        data: {
          productId,
          purchaseId: 'ADJUSTMENT',
          qtyRemaining: qtyChange,
          unitCost: p.purchasePrice,
        },
      });
    } else {
      // Remove from newest lots first for damage/expired (keeps FIFO sale cost intact).
      let remaining = -qtyChange;
      const lots = await tx.purchaseLot.findMany({
        where: { productId, qtyRemaining: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
      });
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.qtyRemaining, remaining);
        await tx.purchaseLot.update({
          where: { id: lot.id },
          data: { qtyRemaining: lot.qtyRemaining - take },
        });
        remaining -= take;
      }
    }
    await tx.stockMovement.create({
      data: {
        productId,
        type: reason,
        qtyChange,
        unitCost: p.purchasePrice,
        note: note || reason,
        createdById: userId,
      },
    });
    await audit(userId, 'STOCK_ADJUSTED', 'Product', productId, { qtyChange, reason, note });
    return { qty: newQty };
  });
}

export async function stockMovements(productId?: string, limit = 100) {
  const db = getPrisma();
  return db.stockMovement.findMany({
    where: productId ? { productId } : undefined,
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ---------- Suppliers ----------
export async function listSuppliers() {
  const db = getPrisma();
  return db.supplier.findMany({ orderBy: { name: 'asc' } });
}

export async function createSupplier(
  input: { name: string; phone?: string; address?: string; openingPayable?: number },
  userId: string | null,
) {
  const db = getPrisma();
  const s = await db.$transaction(async (tx) => {
    const sup = await tx.supplier.create({
      data: {
        name: input.name.trim(),
        phone: input.phone || null,
        address: input.address || null,
        openingPayable: input.openingPayable || 0,
        currentPayable: input.openingPayable || 0,
      },
    });
    if (input.openingPayable && input.openingPayable > 0) {
      await tx.supplierLedger.create({
        data: {
          supplierId: sup.id,
          type: 'OPENING',
          amount: input.openingPayable,
          note: 'Opening payable balance',
        },
      });
    }
    return sup;
  });
  await audit(userId, 'SUPPLIER_CREATED', 'Supplier', s.id, { name: input.name });
  return s;
}

export async function supplierStatement(supplierId: string) {
  const db = getPrisma();
  const [supplier, ledger, purchases, payments] = await Promise.all([
    db.supplier.findUnique({ where: { id: supplierId } }),
    db.supplierLedger.findMany({ where: { supplierId }, orderBy: { date: 'asc' } }),
    db.purchase.findMany({ where: { supplierId }, orderBy: { date: 'desc' }, take: 50, include: { items: true } }),
    db.payment.findMany({ where: { supplierId }, orderBy: { date: 'desc' }, take: 50 }),
  ]);
  return { supplier, ledger, purchases, payments };
}

// ---------- Customers ----------
export async function listCustomers() {
  const db = getPrisma();
  return db.customer.findMany({ orderBy: { name: 'asc' } });
}

export async function createCustomer(
  input: { name: string; phone?: string; address?: string; openingBalance?: number },
  userId: string | null,
) {
  const db = getPrisma();
  const c = await db.$transaction(async (tx) => {
    const cust = await tx.customer.create({
      data: {
        name: input.name.trim(),
        phone: input.phone || null,
        address: input.address || null,
        openingBalance: input.openingBalance || 0,
        currentBalance: input.openingBalance || 0,
      },
    });
    if (input.openingBalance && input.openingBalance > 0) {
      await tx.customerLedger.create({
        data: {
          customerId: cust.id,
          type: 'OPENING',
          amount: input.openingBalance,
          note: 'Opening credit balance',
        },
      });
    }
    return cust;
  });
  await audit(userId, 'CUSTOMER_CREATED', 'Customer', c.id, { name: input.name });
  return c;
}

export async function customerStatement(customerId: string) {
  const db = getPrisma();
  const [customer, ledger, sales, payments] = await Promise.all([
    db.customer.findUnique({ where: { id: customerId } }),
    db.customerLedger.findMany({ where: { customerId }, orderBy: { date: 'asc' } }),
    db.sale.findMany({ where: { customerId }, orderBy: { date: 'desc' }, take: 50, include: { items: true } }),
    db.payment.findMany({ where: { customerId }, orderBy: { date: 'desc' }, take: 50 }),
  ]);
  return { customer, ledger, sales, payments };
}
