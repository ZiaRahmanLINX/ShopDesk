import { useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, fmtDateTime } from '@shared/format';
import { Btn, Card, CardHeader, Input, Modal, Select, useToast } from '../components/ui';

export default function Invoices() {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [sale, setSale] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const [width, setWidth] = useState<'58' | '80' | 'A4'>('80');
  const toast = useToast();

  const find = async () => {
    setErr('');
    setSale(null);
    try {
      const s = await api.saleByInvoice(invoiceNo.trim());
      setSale(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invoice not found');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Invoices</h1>
      <Card>
        <CardHeader title="Find & reprint an invoice" sub="Enter the invoice number from any sale" />
        <div className="flex gap-2 p-4">
          <Input placeholder="e.g. INV-20261110-0001" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') find(); }} className="max-w-sm" />
          <Btn onClick={find}>Find invoice</Btn>
        </div>
        {err && <p className="px-4 pb-3 text-sm text-red-600">{err}</p>}
      </Card>

      {sale && (
        <Card>
          <CardHeader title={`Invoice ${String(sale.invoiceNo)}`} sub={fmtDateTime(String(sale.date))} />
          <div className="space-y-2 p-4 text-sm">
            <div className="flex justify-between"><span>Customer</span><span>{String((sale.customer as { name: string })?.name || 'Walk-in')}</span></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Price</th><th className="py-1 text-right">Total</th></tr></thead>
              <tbody>
                {((sale.items as { product: { name: string }; qty: number; unitPrice: number; lineTotal: number }[]) || []).map((it, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-1">{it.product.name}</td>
                    <td className="py-1 text-right">{it.qty}</td>
                    <td className="py-1 text-right">{formatPKR(it.unitPrice)}</td>
                    <td className="py-1 text-right">{formatPKR(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between font-bold"><span>Total</span><span>{formatPKR(Number(sale.total))}</span></div>
            <div className="flex justify-between"><span>Paid</span><span>{formatPKR(Number(sale.paidAmount))}</span></div>
            <div className="flex justify-between"><span>Remaining</span><span>{formatPKR(Number(sale.total) - Number(sale.paidAmount))}</span></div>
            <div className="flex gap-2 pt-2">
              <Select value={width} onChange={(e) => setWidth(e.target.value as '58' | '80' | 'A4')} className="!w-auto">
                <option value="58">Thermal 58mm</option>
                <option value="80">Thermal 80mm</option>
                <option value="A4">A4</option>
              </Select>
              <Btn onClick={async () => { await api.printInvoice(String(sale.id), width); toast.show('Sent to printer'); }}>Reprint</Btn>
              <Btn variant="secondary" onClick={async () => { await api.exportInvoicePdf(String(sale.id)); toast.show('PDF saved'); }}>Export PDF</Btn>
            </div>
          </div>
        </Card>
      )}
      {toast.el}
    </div>
  );
}
