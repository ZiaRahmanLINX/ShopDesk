// Month close — P&L snapshot + lock only. Single owner: the month's net
// profit stays in the business as retained earnings.
import { useEffect, useState } from 'react';
import { api, type OwnerClosePreview } from '../lib/api';
import { formatPKR, monthKey } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, useToast, Empty, Confirm } from '../components/ui';

export default function MonthClose() {
  const [closings, setClosings] = useState<Record<string, unknown>[]>([]);
  const [month, setMonth] = useState(monthKey());
  const [preview, setPreview] = useState<OwnerClosePreview | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const toast = useToast();

  const load = () => {
    api.closings().then(setClosings).catch(() => undefined);
  };
  useEffect(load, []);
  useEffect(() => {
    api.closePreview(month).then(setPreview).catch(() => setPreview(null));
  }, [month]);

  const closeMonth = async () => {
    try {
      await api.closeMonth(month, undefined);
      setConfirmClose(false);
      load();
      api.closePreview(month).then(setPreview).catch(() => undefined);
      toast.show(`Month ${month} closed and locked`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Close failed', 'err');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Month Close</h1>

      <Card>
        <CardHeader title="Monthly closing & P&L snapshot" sub="Closing locks the month — corrections afterwards need traceable adjustment entries" />
        <div className="space-y-3 p-4">
          <div className="flex items-end gap-2">
            <Field label="Month">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="!w-48" />
            </Field>
            <Btn variant="secondary" onClick={() => api.closePreview(month).then(setPreview).catch(() => undefined)}>Refresh preview</Btn>
          </div>
          {preview && (
            <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Net sales</p><p className="font-bold">{formatPKR(preview.netSales)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">COGS</p><p className="font-bold">{formatPKR(preview.cogs)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Gross profit</p><p className="font-bold text-emerald-600">{formatPKR(preview.grossProfit)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Expenses</p><p className="font-bold text-red-600">{formatPKR(preview.expenses)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Net profit (retained in the business)</p><p className={`font-bold ${preview.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatPKR(preview.netProfit)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Cash balance</p><p className="font-bold">{formatPKR(preview.cashBalance)}</p></div>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span>Closing inventory: <strong>{preview ? formatPKR(preview.closingInventoryValue) : '—'}</strong></span>
            <span>Customer credit: <strong>{preview ? formatPKR(preview.customerOutstanding) : '—'}</strong></span>
            <span>Supplier payables: <strong>{preview ? formatPKR(preview.supplierOutstanding) : '—'}</strong></span>
          </div>
          <div className="flex gap-2">
            <Btn variant="danger" onClick={() => setConfirmClose(true)}>
              Close month {month}
            </Btn>
          </div>
          <p className="text-xs text-slate-400">Before closing, verify sales, purchases, expenses, cash balances, customer credit, supplier payables and do a physical stock count (Inventory → Adjust stock for damaged/expired items).</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Closed months" sub="A closed month is locked — no silent changes afterwards" />
        {closings.length === 0 ? <Empty text="No months closed yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Net sales</th><th className="px-4 py-2 text-right">COGS</th><th className="px-4 py-2 text-right">Expenses</th><th className="px-4 py-2 text-right">Net profit</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>
              {closings.map((c) => (
                <tr key={String(c.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(c.month)}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(c.netSales))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(c.cogs))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(c.expenses))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(c.netProfit))}</td>
                  <td className="px-4 py-2">{c.locked ? 'Locked' : String(c.status || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {confirmClose && (
        <Confirm
          title={`Close month ${month}?`}
          message="This locks all transactions in this month against silent changes. The month's net profit stays in the business as retained earnings. This cannot be undone — corrections afterwards must be adjustment entries."
          confirmLabel="Close month"
          onConfirm={closeMonth}
          onCancel={() => setConfirmClose(false)}
        />
      )}
      {toast.el}
    </div>
  );
}
