import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, Select, useToast, Empty } from '../components/ui';
import { fmtDateTime } from '@shared/format';

export default function Inventory() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [movements, setMovements] = useState<Record<string, unknown>[]>([]);
  const [lowOnly, setLowOnly] = useState(false);
  const [adjusting, setAdjusting] = useState<Record<string, unknown> | null>(null);
  const toast = useToast();

  const load = () => {
    api.stockValuation().then(setRows).catch(() => undefined);
    api.stockMovements(undefined, 80).then(setMovements).catch(() => undefined);
  };
  useEffect(load, []);

  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  useEffect(() => { api.products({}).then((p) => setProducts(p as unknown as Record<string, unknown>[])).catch(() => undefined); }, []);
  const minOf = (id: string) => Number(products.find((p) => p.id === id)?.minQty || 0);
  const visible = lowOnly ? rows.filter((r) => Number(r.qty) <= minOf(String(r.id))) : rows;

  const totalValue = rows.reduce((s, r) => s + Number(r.value), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Inventory</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">Total stock value: <strong>{formatPKR(totalValue)}</strong></span>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
        </div>
      </div>

      <Card>
        <CardHeader title="Stock levels" sub="Valued at FIFO purchase cost — never re-priced silently" />
        {visible.length === 0 ? <Empty text="No stock to show." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Product</th><th className="px-4 py-2">SKU</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Avg cost</th><th className="px-4 py-2 text-right">Value</th><th className="px-4 py-2 text-right">Sell price</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={String(r.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(r.name)}{Number(r.qty) <= minOf(String(r.id)) && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">LOW</span>}</td>
                  <td className="px-4 py-2 text-slate-500">{String(r.sku)}</td>
                  <td className="px-4 py-2 text-right">{Number(r.qty)} {String(r.unit)}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(r.avgCost))}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatPKR(Number(r.value))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(r.sellingPrice))}</td>
                  <td className="px-4 py-2 text-right"><button className="text-blue-600" onClick={() => setAdjusting(r)}>Adjust</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="Stock movement history" sub="Purchases, sales, returns, damage & adjustments" />
        {movements.length === 0 ? <Empty text="No movements recorded yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Product</th><th className="px-4 py-2">Type</th><th className="px-4 py-2 text-right">Change</th><th className="px-4 py-2">Note</th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={String(m.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 text-slate-500">{fmtDateTime(String(m.createdAt))}</td>
                  <td className="px-4 py-2">{String((m.product as { name: string })?.name)}</td>
                  <td className="px-4 py-2">{String(m.type).replace(/_/g, ' ')}</td>
                  <td className={`px-4 py-2 text-right font-medium ${Number(m.qtyChange) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Number(m.qtyChange) > 0 ? '+' : ''}{Number(m.qtyChange)}</td>
                  <td className="px-4 py-2 text-slate-500">{String(m.note || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {adjusting && (
        <AdjustModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => { setAdjusting(null); load(); toast.show('Stock adjusted'); }}
        />
      )}
      {toast.el}
    </div>
  );
}

function AdjustModal({ product, onClose, onSaved }: { product: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<'ADJUSTMENT' | 'DAMAGE' | 'EXPIRED'>('ADJUSTMENT');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const n = Number(qty);
    if (!n || Number.isNaN(n)) { setErr('Enter a quantity (use a minus sign to reduce stock).'); return; }
    try {
      await api.adjustStock({ productId: String(product.id), qtyChange: n, reason, note });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Adjustment failed');
    }
  };
  return (
    <Modal title={`Adjust stock — ${String(product.name)}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">Current stock: <strong>{Number(product.qty)} {String(product.unit)}</strong>. Positive adds stock, negative removes it. Every adjustment is written to the audit log.</p>
      <div className="space-y-3">
        <Field label="Quantity change (e.g. 10 or -5)"><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></Field>
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value as 'ADJUSTMENT' | 'DAMAGE' | 'EXPIRED')}>
            <option value="ADJUSTMENT">Stock count adjustment</option>
            <option value="DAMAGE">Damaged stock</option>
            <option value="EXPIRED">Expired stock</option>
          </Select>
        </Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Physical count on 10 Nov" /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save adjustment</Btn>
        </div>
      </div>
    </Modal>
  );
}
