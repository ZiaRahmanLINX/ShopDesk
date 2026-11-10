// ShopDesk — shared Zod validation schemas (main + renderer).
import { z } from 'zod';

export const paisa = z.number().int().min(0, 'Amount must be 0 or more');
export const paisaSigned = z.number().int();
export const qty = z.number().positive('Quantity must be greater than 0');
export const phone = z.string().max(20).optional().nullable();

export const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z.string().min(1, 'SKU is required').max(60),
  barcode: z.string().max(60).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  purchasePrice: paisa,
  sellingPrice: paisa,
  qty: z.number().min(0),
  minQty: z.number().min(0),
  unit: z.enum(['piece', 'packet', 'kg', 'litre', 'box', 'dozen']),
  supplierId: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

export const saleItemSchema = z.object({
  productId: z.string().min(1),
  qty,
  unitPrice: paisa,
  discount: paisa.default(0),
});

export const createSaleSchema = z.object({
  customerId: z.string().optional().nullable(),
  items: z.array(saleItemSchema).min(1, 'Add at least one product'),
  discount: paisa.default(0),
  payments: z
    .array(
      z.object({
        method: z.enum(['CASH', 'BANK', 'EASYPAISA', 'JAZZCASH', 'CREDIT']),
        amount: paisa,
        cashAccountId: z.string().optional().nullable(),
      }),
    )
    .min(1, 'Add at least one payment'),
  note: z.string().max(500).optional().nullable(),
});

export const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  qty,
  unitCost: paisa,
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  invoiceNo: z.string().min(1, 'Invoice number is required').max(60),
  date: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one product'),
  discount: paisa.default(0),
  transport: paisa.default(0),
  paidAmount: paisa.default(0),
  paymentMethod: z.enum(['CASH', 'BANK', 'EASYPAISA', 'JAZZCASH', 'CREDIT', 'SPLIT']),
  fundingSource: z.enum(['BUSINESS_CASH', 'PARTNER_CAPITAL', 'PARTNER_LOAN', 'SUPPLIER_CREDIT']),
  partnerId: z.string().optional().nullable(),
  cashAccountId: z.string().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const expenseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  categoryId: z.string().min(1, 'Category is required'),
  amount: paisa.refine((v) => v > 0, 'Amount must be greater than 0'),
  date: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'BANK', 'EASYPAISA', 'JAZZCASH']),
  cashAccountId: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

export const paymentSchema = z.object({
  partyType: z.enum(['CUSTOMER', 'SUPPLIER']),
  partyId: z.string().min(1),
  amount: paisa.refine((v) => v > 0, 'Amount must be greater than 0'),
  method: z.enum(['CASH', 'BANK', 'EASYPAISA', 'JAZZCASH']),
  cashAccountId: z.string().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const partnerTxnSchema = z.object({
  partnerId: z.string().min(1),
  amount: paisa.refine((v) => v > 0, 'Amount must be greater than 0'),
  note: z.string().max(500).optional().nullable(),
  cashAccountId: z.string().optional().nullable(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const settingsSchema = z.object({
  shopName: z.string().min(1).max(200),
  shopAddress: z.string().max(500).default(''),
  shopPhone: z.string().max(30).default(''),
  shopEmail: z.string().max(100).default(''),
  thankYouNote: z.string().max(300).default('Thank you for shopping with us!'),
  reservePct: z.number().int().min(0).max(100).default(0),
  currency: z.string().default('PKR'),
  thermalWidth: z.enum(['58', '80']).default('80'),
});
