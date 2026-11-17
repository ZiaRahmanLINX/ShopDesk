// ShopDesk — shared types between main process and renderer.
// Money is ALWAYS integer paisa (PKR * 100). Never float money.

export type ID = string;

export type AccountKind = 'CASH' | 'BANK' | 'EASYPAISA' | 'JAZZCASH' | 'OTHER';

export type PaymentMethod = 'CASH' | 'BANK' | 'EASYPAISA' | 'JAZZCASH' | 'CREDIT' | 'SPLIT';

export type TxnStatus = 'COMPLETED' | 'REVERSED' | 'CANCELLED';

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface DashboardStats {
  todaySales: number; // paisa
  todayCash: number;
  todayOnline: number;
  todayCredit: number;
  monthSales: number;
  monthGrossProfit: number;
  monthNetProfit: number;
  monthExpenses: number;
  monthPurchases: number;
  inventoryValue: number; // at purchase cost
  cashBalance: number;
  bankBalance: number;
  walletBalance: number; // easypaisa + jazzcash + other
  customerOutstanding: number;
  supplierOutstanding: number;
  lowStock: Array<{ id: string; name: string; sku: string; qty: number; minQty: number }>;
  recentTxns: Array<{
    id: string; kind: string; label: string; amount: number; date: string; ref: string;
  }>;
  monthlyProfit: Array<{ month: string; sales: number; profit: number }>;
  expenseByCategory: Array<{ category: string; amount: number }>;
}

export interface MonthlyClosePreview {
  month: string; // YYYY-MM
  netSales: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  closingInventoryValue: number;
  customerOutstanding: number;
  supplierOutstanding: number;
  cashBalance: number;
}

export interface BalanceSheet {
  assets: { cash: number; inventory: number; receivables: number; total: number }; // paisa
  liabilities: { supplierPayables: number; total: number }; // paisa
  equity: { ownerCapital: number; total: number }; // paisa
  retainedEarnings: number; // paisa, balancing figure
  balanced: number; // paisa, assets - liabilities - equity (== retainedEarnings)
}
