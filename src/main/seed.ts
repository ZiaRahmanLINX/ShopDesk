// Shared base data for a fresh shop: the category lists every shop starts
// with, plus a wipe helper used when a setup attempt stops midway.
// (The demo seed data was removed in v1.1.2: first-run setup is clean setup
// only — every user creates their own account. No demo data ships anymore.)
import { getPrisma } from './db';

const P = (rs: number) => Math.round(rs * 100);

// Base lists every shop starts with (also used by clean setup).
export const BASE_EXPENSE_CATEGORIES = ['Shop rent', 'Electricity', 'Water', 'Internet', 'Transport', 'Packaging bags', 'Repairs', 'Cleaning', 'Tea and refreshments', 'Employee wages', 'Other expenses'];
export const BASE_PRODUCT_CATEGORIES = ['Grocery', 'Beverages', 'Snacks', 'Household', 'Personal Care', 'Dairy', 'Spices'];


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

