import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { api } from '../lib/api';
import { formatPKR, formatPKRCompact } from '@shared/format';
import { Card, CardHeader, Stat, Empty } from '../components/ui';
import type { DashboardStats } from '@shared/types';
import type { Page } from '../App';

const COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

export default function Dashboard({ go }: { go: (p: Page) => void }) {
  const [d, setD] = useState<DashboardStats | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.dashboard().then(setD).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!d) return <p className="text-sm text-slate-400">Loading dashboard…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <span className="text-xs text-slate-400">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today's sales" value={formatPKR(d.todaySales)} sub={`Cash ${formatPKR(d.todayCash)} · Online ${formatPKR(d.todayOnline)} · Credit ${formatPKR(d.todayCredit)}`} />
        <Stat label="Monthly sales" value={formatPKR(d.monthSales)} />
        <Stat label="Monthly gross profit" value={formatPKR(d.monthGrossProfit)} tone="good" />
        <Stat label="Monthly net profit" value={formatPKR(d.monthNetProfit)} tone={d.monthNetProfit >= 0 ? 'good' : 'bad'} />
        <Stat label="Monthly expenses" value={formatPKR(d.monthExpenses)} tone="bad" />
        <Stat label="Stock purchases (month)" value={formatPKR(d.monthPurchases)} />
        <Stat label="Inventory value" value={formatPKR(d.inventoryValue)} sub="at purchase cost" />
        <Stat label="Cash balance" value={formatPKR(d.cashBalance)} sub={`Bank ${formatPKR(d.bankBalance)} · Wallets ${formatPKR(d.walletBalance)}`} />
        <Stat label="Customer credit (Udhaar)" value={formatPKR(d.customerOutstanding)} tone={d.customerOutstanding > 0 ? 'warn' : 'default'} />
        <Stat label="Supplier payables" value={formatPKR(d.supplierOutstanding)} tone={d.supplierOutstanding > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Monthly sales vs gross profit" sub="Last 6 months" />
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.monthlyProfit.map((m) => ({ ...m, sales: m.sales / 100, profit: m.profit / 100 }))}>
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v: number) => `Rs ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip formatter={(v: number | string) => formatPKR(Number(v) * 100)} />
                <Bar dataKey="sales" fill="#2563eb" name="Sales" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="#059669" name="Gross profit" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Expenses by category" sub="This month" />
          <div className="h-64 p-3">
            {d.expenseByCategory.length === 0 ? (
              <Empty text="No expenses this month yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={d.expenseByCategory.map((e) => ({ ...e, amount: e.amount / 100 }))} dataKey="amount" nameKey="category" outerRadius={90} label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                    {d.expenseByCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number | string) => formatPKR(Number(v) * 100)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Low-stock alerts" sub={`${d.lowStock.length} product(s) at or below minimum`} right={<button className="text-xs font-medium text-blue-600" onClick={() => go('inventory')}>View inventory →</button>} />
          {d.lowStock.length === 0 ? (
            <Empty text="No low-stock products. Good." />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Product</th><th className="px-4 py-2">SKU</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Min</th></tr></thead>
              <tbody>
                {d.lowStock.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 text-slate-500">{p.sku}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-600">{p.qty}</td>
                    <td className="px-4 py-2 text-right">{p.minQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent transactions" />
          {d.recentTxns.length === 0 ? (
            <Empty text="No transactions yet." />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.recentTxns.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-2">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-700">{t.kind}</span>
                      {t.label}
                      <span className="ml-2 text-xs text-slate-400">{t.ref}</span>
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${t.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.amount >= 0 ? '+' : ''}{formatPKRCompact(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
