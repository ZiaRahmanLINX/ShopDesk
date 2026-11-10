import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, parseRupees, fmtDate } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, Select, useToast, Empty } from '../components/ui';

interface Product { id: string; name: string; sku: string; purchasePrice: number; qty: number; unit: string }
interface Line { product: Product; qty: number; unitCost: number }

export default function Purchases() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const toast = useToast();

  const load = () => {
    api.purchases({ limit: 100 }).then(setList).catch(() => undefined);
    api.suppliers().then((s) => setSuppliers(s as unknown as { id: string; name: string }[])).catch(() => undefined);
    api.products({}).then((p) => setProducts(p as unknown as Product[])).catch(() => undefined);
    api.partners().then((p) => setPartners(p as unknown as { id: string; name: string }[])).catch(() => undefined);
    api.cashAccounts().then((a) => setAccounts(a as unknown as { id: string; name: string; kind: string }[])).catch(() => undefined);
  };
  useEffect(load, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Purchases</h1>
        <Btn onClick={() => setShowForm(true)}>+ New purchase</Btn>
      </div>
      <Card>
        <CardHeader title="Purchase history" sub="Buying stock increases inventory — it is not an expense until sold" />
        {list.length === 0 ? <Empty text="No purchases recorded yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Paid</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Funding</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={String(p.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(p.invoiceNo)}</td>
                  <td className="px-4 py-2">{fmtDate(String(p.date))}</td>
                  <td className="px-4 py-2">{String((p.supplier as { name: string })?.name)}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(p.total))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(p.paidAmount))}</td>
                  <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] ${p.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : p.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{String(p.status)}</span></td>
                  <td className="px-4 py-2 text-xs text-slate-500">{String(p.fundingSource).replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-right"><button className="text-blue-600" onClick={() => setDetail(p)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {showForm && (
        <PurchaseForm
          suppliers={suppliers} products={products} partners={partners} accounts={accounts}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); toast.show('Purchase recorded — stock updated'); }}
        />
      )}
      {detail && <PurchaseDetail purchase={detail} onClose={() => setDetail(null)} />}
      {toast.el}
    </div>
  );
}

function PurchaseForm({ suppliers, products, partners, accounts, onClose, onSaved }: {
  suppliers: { id: string; name: string }[];
  products: Product[];
  partners: { id: string; name: string }[];
  accounts: { id: string; name: string; kind: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState('');
  const [discount, setDiscount] = useState('');
  const [transport, setTransport] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK' | 'EASYPAISA' | 'JAZZCASH' | 'CREDIT'>('CASH');
  const [funding, setFunding] = useState<'BUSINESS_CASH' | 'PARTNER_CAPITAL' | 'PARTNER_LOAN' | 'SUPPLIER_CREDIT'>('BUSINESS_CASH');
  const [partnerId, setPartnerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [err, setErr] = useState('');
  const toast = useToast();

  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.unitCost), 0);
  const total = subtotal - (parseRupees(discount) || 0) + (parseRupees(transport) || 0);

  const addLine = (pid: string) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    if (lines.some((l) => l.product.id === pid)) return;
    setLines((ls) => [...ls, { product: p, qty: 1, unitCost: p.purchasePrice }]);
    setPick('');
  };

  const save = async () => {
    if (!supplierId || lines.length === 0) { setErr('Choose a supplier and add at least one product.'); return; }
    try {
      await api.createPurchase({
        supplierId,
        invoiceNo: invoiceNo.trim() || undefined,
        items: lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitCost: l.unitCost })),
        discount: parseRupees(discount) || 0,
        transport: parseRupees(transport) || 0,
        paidAmount: parseRupees(paid) || 0,
        paymentMethod: method,
        fundingSource: funding,
        partnerId: (funding === 'PARTNER_CAPITAL' || funding === 'PARTNER_LOAN') ? partnerId : null,
        cashAccountId: accountId || null,
        note: null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <Modal title="New purchase" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Supplier invoice no. (optional — auto if blank)"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="e.g. SUP-1042" /></Field>
        </div>

        <Field label="Add product">
          <Select value={pick} onChange={(e) => addLine(e.target.value)}>
            <option value="">— Select product —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {formatPKR(p.purchasePrice)}</option>)}
          </Select>
        </Field>

        {lines.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Product</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit cost (Rs)</th><th className="py-1 text-right">Line total</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.product.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2">{l.product.name}</td>
                  <td className="py-2 text-right"><Input type="number" min={0.01} step="any" className="!w-20 !py-1 text-right" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) || 0 } : x)))} /></td>
                  <td className="py-2 text-right"><Input type="number" min={0} className="!w-24 !py-1 text-right" value={l.unitCost / 100} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitCost: Math.round(Number(e.target.value || 0) * 100) } : x)))} /></td>
                  <td className="py-2 text-right font-medium">{formatPKR(Math.round(l.qty * l.unitCost))}</td>
                  <td className="py-2 text-right"><button className="text-red-500" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Discount (Rs)"><Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <Field label="Transport (Rs)"><Input type="number" min={0} value={transport} onChange={(e) => setTransport(e.target.value)} /></Field>
          <Field label="Paid now (Rs)"><Input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as never)}>
              <option value="CASH">Cash</option><option value="BANK">Bank</option>
              <option value="EASYPAISA">Easypaisa</option><option value="JAZZCASH">JazzCash</option>
              <option value="CREDIT">Credit (pay later)</option>
            </Select>
          </Field>
          <Field label="Pay from account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Auto (by method)</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Funding source" hint="Mid-month stock: pay from business cash, partner capital, a partner loan, or supplier credit.">
          <Select value={funding} onChange={(e) => setFunding(e.target.value as never)}>
            <option value="BUSINESS_CASH">Existing business cash</option>
            <option value="PARTNER_CAPITAL">Additional capital from a partner</option>
            <option value="PARTNER_LOAN">Temporary loan from a partner</option>
            <option value="SUPPLIER_CREDIT">Supplier credit (pay later)</option>
          </Select>
        </Field>
        {(funding === 'PARTNER_CAPITAL' || funding === 'PARTNER_LOAN') && (
          <Field label="Partner">
            <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">— Select partner —</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}

        <div className="flex justify-between border-t border-slate-100 pt-3 text-sm dark:border-slate-700">
          <span>Subtotal {formatPKR(subtotal)}</span>
          <strong>Total {formatPKR(total)}</strong>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save purchase</Btn>
        </div>
      </div>
      {toast.el}
    </Modal>
  );
}

function PurchaseDetail({ purchase, onClose }: { purchase: Record<string, unknown>; onClose: () => void }) {
  const [full, setFull] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api.purchase(String(purchase.id)).then(setFull).catch(() => undefined); }, [purchase.id]);
  const items = (full?.items as { product: { name: string }; qty: number; unitCost: number; lineTotal: number }[]) || [];
  return (
    <Modal title={`Purchase ${String(purchase.invoiceNo)}`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span>Supplier</span><span>{String((purchase.supplier as { name: string })?.name)}</span></div>
        <div className="flex justify-between"><span>Date</span><span>{fmtDate(String(purchase.date))}</span></div>
        <div className="flex justify-between"><span>Funding</span><span>{String(purchase.fundingSource).replace(/_/g, ' ')}</span></div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Product</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit cost</th><th className="py-1 text-right">Total</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                <td className="py-1">{it.product.name}</td>
                <td className="py-1 text-right">{it.qty}</td>
                <td className="py-1 text-right">{formatPKR(it.unitCost)}</td>
                <td className="py-1 text-right">{formatPKR(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between border-t pt-2"><span>Subtotal</span><span>{formatPKR(Number(purchase.subtotal))}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>-{formatPKR(Number(purchase.discount))}</span></div>
        <div className="flex justify-between"><span>Transport</span><span>{formatPKR(Number(purchase.transport))}</span></div>
        <div className="flex justify-between font-bold"><span>Total</span><span>{formatPKR(Number(purchase.total))}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>{formatPKR(Number(purchase.paidAmount))}</span></div>
        <div className="flex justify-between"><span>Remaining payable</span><span className="text-red-600">{formatPKR(Number(purchase.total) - Number(purchase.paidAmount))}</span></div>
      </div>
    </Modal>
  );
}
