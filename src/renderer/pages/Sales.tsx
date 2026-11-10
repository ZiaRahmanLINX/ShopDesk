import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, fmtDateTime } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, useToast, Empty } from '../components/ui';

export default function Sales() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [refund, setRefund] = useState<Record<string, unknown> | null>(null);
  const toast = useToast();

  const load = () => api.sales({ limit: 100 }).then(setList).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Sales</h1>
      <Card>
        <CardHeader title="Sales history" sub="Refunds reverse stock, cash and credit with a full audit trail" />
        {list.length === 0 ? <Empty text="No sales yet — use Point of Sale." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Paid</th><th className="px-4 py-2 text-right">Profit</th><th className="px-4 py-2">Method</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={String(s.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(s.invoiceNo)}</td>
                  <td className="px-4 py-2">{fmtDateTime(String(s.date))}</td>
                  <td className="px-4 py-2">{String((s.customer as { name: string })?.name || 'Walk-in')}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(s.total))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(s.paidAmount))}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">{formatPKR(Number(s.grossProfit))}</td>
                  <td className="px-4 py-2">{String(s.paymentMethod)}</td>
                  <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] ${s.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{String(s.status)}</span></td>
                  <td className="px-4 py-2 text-right">
                    <button className="mr-2 text-blue-600" onClick={() => setDetail(s)}>View</button>
                    {s.status === 'COMPLETED' && <button className="text-red-500" onClick={() => setRefund(s)}>Refund</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {detail && <SaleDetail sale={detail} onClose={() => setDetail(null)} />}
      {refund && (
        <RefundModal sale={refund} onClose={() => setRefund(null)} onDone={() => { setRefund(null); load(); toast.show('Sale refunded — stock, cash and credit reversed'); }} />
      )}
      {toast.el}
    </div>
  );
}

function SaleDetail({ sale, onClose }: { sale: Record<string, unknown>; onClose: () => void }) {
  const [full, setFull] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api.sale(String(sale.id)).then(setFull).catch(() => undefined); }, [sale.id]);
  const items = (full?.items as { product: { name: string }; qty: number; unitPrice: number; lineTotal: number }[]) || [];
  const payments = (full?.payments as { method: string; amount: number }[]) || [];
  return (
    <Modal title={`Sale ${String(sale.invoiceNo)}`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span>Date</span><span>{fmtDateTime(String(sale.date))}</span></div>
        <div className="flex justify-between"><span>Customer</span><span>{String((sale.customer as { name: string })?.name || 'Walk-in')}</span></div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Price</th><th className="py-1 text-right">Total</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                <td className="py-1">{it.product.name}</td>
                <td className="py-1 text-right">{it.qty}</td>
                <td className="py-1 text-right">{formatPKR(it.unitPrice)}</td>
                <td className="py-1 text-right">{formatPKR(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between"><span>Subtotal</span><span>{formatPKR(Number(sale.subtotal))}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>-{formatPKR(Number(sale.discount))}</span></div>
        <div className="flex justify-between font-bold"><span>Total</span><span>{formatPKR(Number(sale.total))}</span></div>
        <div className="flex justify-between"><span>COGS (FIFO)</span><span>{formatPKR(Number(sale.cogs))}</span></div>
        <div className="flex justify-between"><span>Gross profit</span><span className="text-emerald-600">{formatPKR(Number(sale.grossProfit))}</span></div>
        <div className="border-t pt-2">
          {payments.map((p, i) => (
            <div key={i} className="flex justify-between"><span>{p.method}</span><span>{formatPKR(p.amount)}</span></div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Btn onClick={async () => { await api.printInvoice(String(sale.id), '80'); }}>Print (80mm)</Btn>
          <Btn variant="secondary" onClick={async () => { await api.exportInvoicePdf(String(sale.id)); }}>Export PDF</Btn>
        </div>
      </div>
    </Modal>
  );
}

function RefundModal({ sale, onClose, onDone }: { sale: Record<string, unknown>; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!reason.trim()) { setErr('A reason is required for the audit log.'); return; }
    try {
      await api.refundSale(String(sale.id), reason.trim());
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refund failed');
    }
  };
  return (
    <Modal title={`Refund sale ${String(sale.invoiceNo)}`} onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        This fully reverses the sale: stock returns to inventory, cash is paid back out, and any customer credit is removed. The sale stays in history as REFUNDED.
      </p>
      <div className="mt-3 space-y-3">
        <Field label="Reason (required)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned damaged item" autoFocus /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" onClick={submit}>Refund {formatPKR(Number(sale.total))}</Btn>
        </div>
      </div>
    </Modal>
  );
}
