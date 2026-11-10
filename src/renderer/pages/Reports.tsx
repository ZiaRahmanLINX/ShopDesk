import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, fmtDate, todayKey } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Select, useToast, Empty } from '../components/ui';
import * as XLSX from 'xlsx';

type ReportKind = 'sales' | 'products' | 'purchases' | 'expenses' | 'cashflow' | 'audit';

export default function Reports() {
  const [kind, setKind] = useState<ReportKind>('sales');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(todayKey());
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const run = async () => {
    setLoading(true);
    try {
      if (kind === 'sales') setRows(await api.sales({ from, to, limit: 200 }));
      else if (kind === 'products') setRows(await api.productSales(from, to));
      else if (kind === 'purchases') setRows(await api.purchases({ from, to, limit: 200 }));
      else if (kind === 'expenses') setRows(await api.expenses({ from, to, limit: 200 }));
      else if (kind === 'cashflow') {
        const cf = await api.cashFlow(from, to);
        setRows(cf.txns as Record<string, unknown>[]);
      } else setRows(await api.auditLogs(200));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Report failed', 'err');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { run(); }, [kind]);

  const exportCsv = () => {
    if (rows.length === 0) { toast.show('Nothing to export', 'err'); return; }
    const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object');
    const lines = [keys.join(',')].concat(rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shopdesk-${kind}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportXlsx = () => {
    if (rows.length === 0) { toast.show('Nothing to export', 'err'); return; }
    const flat = rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) if (typeof v !== 'object' || v === null) o[k] = v;
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(flat);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind);
    XLSX.writeFile(wb, `shopdesk-${kind}-${from}-to-${to}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>
      <Card>
        <div className="flex flex-wrap items-end gap-2 p-4">
          <Field label="Report">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
              <option value="sales">Sales</option>
              <option value="products">Product-wise sales & profit</option>
              <option value="purchases">Purchase history</option>
              <option value="expenses">Expense history</option>
              <option value="cashflow">Cash flow</option>
              <option value="audit">Audit log</option>
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Btn onClick={run} disabled={loading}>{loading ? 'Loading…' : 'Run report'}</Btn>
          <Btn variant="secondary" onClick={exportCsv}>Export CSV</Btn>
          <Btn variant="secondary" onClick={exportXlsx}>Export Excel</Btn>
        </div>
      </Card>

      <Card>
        <CardHeader title={`${kind} — ${rows.length} row(s)`} sub={`${fmtDate(from)} to ${fmtDate(to)}`} />
        {rows.length === 0 ? <Empty text="No rows for this period." /> : kind === 'products' ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Product</th><th className="px-4 py-2">SKU</th><th className="px-4 py-2 text-right">Qty sold</th><th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">COGS</th><th className="px-4 py-2 text-right">Profit</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(r.name)}</td>
                  <td className="px-4 py-2 text-slate-500">{String(r.sku)}</td>
                  <td className="px-4 py-2 text-right">{Number(r.qty)}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(r.revenue))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(r.cogs))}</td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-600">{formatPKR(Number(r.profit))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : kind === 'audit' ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Date</th><th className="px-4 py-2">User</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Entity</th><th className="px-4 py-2">Details</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2">{fmtDate(String(r.createdAt))}</td>
                  <td className="px-4 py-2">{String((r.user as { name: string })?.name || '—')}</td>
                  <td className="px-4 py-2 font-medium">{String(r.action)}</td>
                  <td className="px-4 py-2">{String(r.entityType || '')}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{String(r.details || '').slice(0, 120)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Reference</th><th className="px-4 py-2">Category / Type</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2">{fmtDate(String(r.date || r.createdAt))}</td>
                  <td className="px-4 py-2 font-medium">{String(r.invoiceNo || r.title || r.category || r.type || '')}</td>
                  <td className="px-4 py-2 text-slate-500">{String((r.category as { name: string })?.name || r.paymentMethod || r.status || '')}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatPKR(Number(r.total ?? r.amount ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {toast.el}
    </div>
  );
}
