// IPC layer: typed, Zod-validated handlers. Renderer never touches Node/SQL
// directly — every call goes through here with an explicit allow-list.
import { ipcMain, BrowserWindow, shell } from 'electron';
import { getPrisma, getShopSettings, setSetting, runMigrations } from './db';
import * as catalog from './services/catalog';
import * as purchases from './services/purchases';
import * as sales from './services/sales';
import * as finance from './services/finance';
import * as partners from './services/partners';
import * as closing from './services/closing';
import * as reports from './services/reports';
import * as backup from './services/backup';
import * as auth from './services/auth';
import { settingsSchema, loginSchema, setupSchema } from '../shared/schemas';
import { getSetupStatus, completeSetup, loadDemoSetup } from './setup';

type Handler = (payload: unknown, userId: string | null) => Promise<unknown>;

// Current session user id (set on login, cleared on logout). Single-user desktop
// app — one session at a time.
let currentUserId: string | null = null;

const handlers: Record<string, Handler> = {
  // auth
  'auth:login': async (p) => {
    const data = loginSchema.parse(p as object);
    const user = await auth.login(data.username, data.password);
    currentUserId = user.id;
    return user;
  },
  'auth:logout': async () => {
    currentUserId = null;
    return { ok: true };
  },
  'auth:userCount': async () => auth.userCount(),
  'auth:listUsers': async () => auth.listUsers(),
  'auth:createUser': async (p, uid) => auth.createUser(p as never, uid),
  'auth:changePassword': async (p) => {
    const d = p as { userId: string; oldPassword: string; newPassword: string };
    return auth.changePassword(d.userId, d.oldPassword, d.newPassword);
  },

  // first-run setup
  'setup:status': async () => getSetupStatus(),
  'setup:complete': async (p) => {
    const data = setupSchema.parse(p);
    return completeSetup(data);
  },
  'setup:loadDemo': async () => loadDemoSetup(),

  // settings
  'settings:get': async () => getShopSettings(),
  'settings:save': async (p, uid) => {
    const data = settingsSchema.parse(p);
    await setSetting('shop', data);
    const db = getPrisma();
    await db.auditLog.create({ data: { userId: uid, action: 'SETTINGS_CHANGED', entityType: 'Settings', details: JSON.stringify({ shopName: data.shopName }) } });
    return data;
  },

  // dashboard / reports
  'reports:dashboard': async () => reports.dashboard(),
  'reports:profitAndLoss': async (p) => closing.profitAndLoss((p as { month: string }).month),
  'reports:balanceSheet': async () => closing.balanceSheet(),
  'reports:cashFlow': async (p) => {
    const d = p as { from: string; to: string };
    return closing.cashFlow(d.from, d.to);
  },
  'reports:productSales': async (p) => {
    const d = p as { from: string; to: string };
    return reports.productSalesReport(d.from, d.to);
  },
  'reports:stockValuation': async () => reports.stockValuation(),
  'reports:auditLogs': async (p) => reports.auditLogs((p as { limit?: number })?.limit || 200),

  // catalogue
  'catalog:categories': async () => catalog.listCategories(),
  'catalog:createCategory': async (p, uid) => catalog.createCategory((p as { name: string }).name, uid),
  'catalog:products': async (p) => catalog.listProducts(p as never),
  'catalog:product': async (p) => catalog.getProduct((p as { id: string }).id),
  'catalog:createProduct': async (p, uid) => catalog.createProduct(p, uid),
  'catalog:updateProduct': async (p, uid) => {
    const d = p as { id: string; data: unknown };
    return catalog.updateProduct(d.id, d.data, uid);
  },
  'catalog:deleteProduct': async (p, uid) => catalog.deleteProduct((p as { id: string }).id, uid),
  'catalog:adjustStock': async (p, uid) => {
    const d = p as { productId: string; qtyChange: number; reason: 'ADJUSTMENT' | 'DAMAGE' | 'EXPIRED'; note?: string };
    return catalog.adjustStock(d.productId, d.qtyChange, d.reason, d.note, uid);
  },
  'catalog:stockMovements': async (p) => catalog.stockMovements((p as { productId?: string; limit?: number })?.productId, (p as { limit?: number })?.limit),
  'catalog:suppliers': async () => catalog.listSuppliers(),
  'catalog:createSupplier': async (p, uid) => catalog.createSupplier(p as never, uid),
  'catalog:supplierStatement': async (p) => catalog.supplierStatement((p as { id: string }).id),
  'catalog:customers': async () => catalog.listCustomers(),
  'catalog:createCustomer': async (p, uid) => catalog.createCustomer(p as never, uid),
  'catalog:customerStatement': async (p) => catalog.customerStatement((p as { id: string }).id),

  // purchases
  'purchases:create': async (p, uid) => purchases.createPurchase(p, uid),
  'purchases:list': async (p) => purchases.listPurchases(p as never),
  'purchases:get': async (p) => purchases.getPurchase((p as { id: string }).id),
  'purchases:supplierReturn': async (p, uid) => {
    const d = p as { purchaseId: string; items: { productId: string; qty: number }[]; note?: string };
    return purchases.supplierReturn(d.purchaseId, d.items, d.note, uid);
  },

  // sales / POS
  'sales:create': async (p, uid) => sales.createSale(p, uid),
  'sales:list': async (p) => sales.listSales(p as never),
  'sales:get': async (p) => sales.getSale((p as { id: string }).id),
  'sales:byInvoice': async (p) => sales.getSaleByInvoice((p as { invoiceNo: string }).invoiceNo),
  'sales:refund': async (p, uid) => {
    const d = p as { saleId: string; reason: string };
    return sales.refundSale(d.saleId, d.reason, uid);
  },

  // finance
  'finance:cashAccounts': async () => finance.listCashAccounts(),
  'finance:createCashAccount': async (p, uid) => finance.createCashAccount(p as never, uid),
  'finance:transfer': async (p, uid) => {
    const d = p as { fromId: string; toId: string; amount: number; note?: string };
    return finance.transferBetweenAccounts(d.fromId, d.toId, d.amount, d.note, uid);
  },
  'finance:cashTransactions': async (p) => finance.cashTransactions((p as { accountId?: string; limit?: number })?.accountId, (p as { limit?: number })?.limit),
  'finance:expenseCategories': async () => finance.listExpenseCategories(),
  'finance:createExpenseCategory': async (p, uid) => finance.createExpenseCategory((p as { name: string }).name, uid),
  'finance:createExpense': async (p, uid) => finance.createExpense(p, uid),
  'finance:expenses': async (p) => finance.listExpenses(p as never),
  'finance:recordPayment': async (p, uid) => finance.recordPayment(p, uid),
  'finance:dailyCashCount': async (p, uid) => {
    const d = p as { accountId: string; actualPaisa: number; note?: string };
    return finance.dailyCashCount(d.accountId, d.actualPaisa, d.note, uid);
  },

  // partners
  'partners:list': async () => partners.listPartners(),
  'partners:create': async (p, uid) => partners.createPartner(p as never, uid),
  'partners:updateShare': async (p, uid) => {
    const d = p as { partnerId: string; pct: number };
    return partners.updatePartnerShare(d.partnerId, d.pct, uid);
  },
  'partners:addCapital': async (p, uid) => {
    const d = p as { partnerId: string; amount: number; kind: 'INITIAL' | 'ADDITIONAL'; note?: string; cashAccountId?: string; method: string };
    return partners.addCapital(d.partnerId, d.amount, d.kind, d.note, d.cashAccountId, d.method, uid);
  },
  'partners:addLoan': async (p, uid) => {
    const d = p as { partnerId: string; amount: number; note?: string; cashAccountId?: string; method: string };
    return partners.addLoan(d.partnerId, d.amount, d.note, d.cashAccountId, d.method, uid);
  },
  'partners:repayLoan': async (p, uid) => {
    const d = p as { loanId: string; amount: number; cashAccountId?: string; method: string };
    return partners.repayLoan(d.loanId, d.amount, d.cashAccountId, d.method, uid);
  },
  'partners:addWithdrawal': async (p, uid) => {
    const d = p as { partnerId: string; amount: number; note?: string; cashAccountId?: string; method: string };
    return partners.addWithdrawal(d.partnerId, d.amount, d.note, d.cashAccountId, d.method, currentUserId, uid);
  },
  'partners:statement': async (p) => partners.partnerStatement((p as { id: string }).id),
  'partners:reserveBalance': async () => partners.reserveBalance(),
  'partners:useReserve': async (p, uid) => {
    const d = p as { amount: number; note: string };
    return partners.useReserve(d.amount, d.note, uid);
  },
  'partners:payDistribution': async (p, uid) => {
    const d = p as { distributionId: string; cashAccountId?: string; method: string };
    return partners.payDistribution(d.distributionId, d.cashAccountId, d.method, uid);
  },

  // closing
  'closing:preview': async (p) => closing.closePreview((p as { month: string }).month),
  'closing:close': async (p, uid) => {
    const d = p as { month: string; notes?: string };
    return closing.closeMonth(d.month, d.notes, uid);
  },
  'closing:list': async () => closing.listClosings(),
  'closing:get': async (p) => closing.getClosing((p as { month: string }).month),

  // backup
  'backup:create': async (p) => backup.createBackup((p as { label?: string })?.label),
  'backup:list': async () => backup.listBackups(),
  'backup:verify': async (p) => backup.verifyBackup((p as { path: string }).path),
  'backup:restore': async (p) => {
    await backup.restoreBackup((p as { path: string }).path);
    return { ok: true, restart: true };
  },
  'backup:export': async () => backup.exportBackupToFile(),
  'backup:pickFile': async () => backup.pickBackupFile(),

  // app
  'app:openPath': async (p) => {
    await shell.openPath((p as { path: string }).path);
    return { ok: true };
  },
  'app:version': async () => ({ version: '1.1.1' }),
};

export function registerIpc(mainWindow: BrowserWindow): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        const data = await handler(payload, currentUserId);
        return { ok: true, data };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    });
  }

  ipcMain.handle('print:invoice', async (_event, payload) => {
    const { printInvoice } = await import('./printing');
    return printInvoice(mainWindow, payload as { saleId: string; width: '58' | '80' | 'A4' });
  });
  ipcMain.handle('print:invoicePdf', async (_event, payload) => {
    const { exportInvoicePdf } = await import('./printing');
    return exportInvoicePdf(mainWindow, payload as { saleId: string });
  });
}

export async function bootstrapDatabase(): Promise<void> {
  // Migrations only. First-run setup is the user's choice now (clean shop
  // or demo data) via the Setup wizard — nothing is seeded automatically.
  await runMigrations();
}
