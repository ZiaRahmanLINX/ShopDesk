import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, parseRupees } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, Select, useToast } from '../components/ui';

interface Product {
  id: string; name: string; sku: string; sellingPrice: number; qty: number; unit: string;
}
interface CartLine { product: Product; qty: number; discount: number }
type Method = 'CASH' | 'BANK' | 'EASYPAISA' | 'JAZZCASH' | 'CREDIT';

export default function POS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [payments, setPayments] = useState<{ method: Method; amount: number }[]>([{ method: 'CASH', amount: 0 }]);
  const [tendered, setTendered] = useState('');
  const [done, setDone] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = () => {
    api.products({ search: '' }).then((p) => setProducts(p as unknown as Product[])).catch(() => undefined);
    api.customers().then((c) => setCustomers(c as unknown as { id: string; name: string }[])).catch(() => undefined);
  };
  useEffect(load, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F9') { e.preventDefault(); complete(); }
      if (e.key === 'Escape') { setCart([]); setDiscount(0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, discount, payments, customerId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return products.slice(0, 12);
    return products.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)).slice(0, 12);
  }, [products, search]);

  const subtotal = cart.reduce((s, l) => s + Math.round(l.qty * l.product.sellingPrice) - l.discount, 0);
  const total = Math.max(0, subtotal - discount);
  const paidSum = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = total - paidSum;
  const cashPay = payments.find((p) => p.method === 'CASH');
  const tenderedPaisa = parseRupees(tendered) ?? 0;
  const change = cashPay ? Math.max(0, tenderedPaisa - cashPay.amount) : 0;

  const addToCart = (p: Product) => {
    if (p.qty <= 0) { toast.show(`${p.name} is out of stock`, 'err'); return; }
    setCart((c) => {
      const line = c.find((l) => l.product.id === p.id);
      if (line) {
        if (line.qty + 1 > p.qty) { toast.show(`Only ${p.qty} in stock`, 'err'); return c; }
        return c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...c, { product: p, qty: 1, discount: 0 }];
    });
    setSearch('');
    searchRef.current?.focus();
  };

  const setQty = (id: string, qty: number) => {
    setCart((c) => c.map((l) => {
      if (l.product.id !== id) return l;
      const q = Math.max(0, Math.min(qty, l.product.qty));
      return { ...l, qty: q };
    }).filter((l) => l.qty > 0));
  };

  const setPaymentAmount = (i: number, amount: number) => {
    setPayments((ps) => ps.map((p, j) => (j === i ? { ...p, amount } : p)));
  };
  const setPaymentMethod = (i: number, method: Method) => {
    setPayments((ps) => ps.map((p, j) => (j === i ? { ...p, method } : p)));
  };

  const complete = async () => {
    if (cart.length === 0) { toast.show('Cart is empty', 'err'); return; }
    if (remaining !== 0) { toast.show(`Payments must equal the total (remaining ${formatPKR(remaining)})`, 'err'); return; }
    if (payments.some((p) => p.method === 'CREDIT') && !customerId) {
      toast.show('Credit sale needs a customer — select one first', 'err');
      return;
    }
    setBusy(true);
    try {
      const sale = await api.createSale({
        customerId: customerId || null,
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: l.product.sellingPrice, discount: l.discount })),
        discount,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        note: null,
      });
      setDone(sale);
      setCart([]);
      setDiscount(0);
      setPayments([{ method: 'CASH', amount: 0 }]);
      setTendered('');
      setCustomerId('');
      load();
      toast.show(`Sale ${String((sale as Record<string, unknown>).invoiceNo)} completed`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Sale failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Point of Sale <span className="text-xs font-normal text-slate-400">F2 search · F9 complete · Esc clear</span></h1>
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Product search */}
        <Card className="lg:col-span-2">
          <CardHeader title="Products" sub="Type name, SKU or scan a barcode" />
          <div className="space-y-2 p-3">
            <Input ref={searchRef} placeholder="Search products… (F2)" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && filtered.length > 0) addToCart(filtered[0]); }} />
            <div className="max-h-[480px] space-y-1 overflow-y-auto">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => addToCart(p)} disabled={p.qty <= 0}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-700">
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.sku} · {p.unit} · Stock {p.qty}</span>
                  </span>
                  <span className="font-semibold">{formatPKR(p.sellingPrice)}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No products found.</p>}
            </div>
          </div>
        </Card>

        {/* Cart */}
        <Card className="lg:col-span-3">
          <CardHeader title="Current sale" sub={`${cart.length} item(s)`} />
          <div className="p-3">
            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Cart is empty — search and add products.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Item</th><th className="py-1 text-right">Price</th><th className="py-1 text-center">Qty</th><th className="py-1 text-right">Total</th><th /></tr></thead>
                <tbody>
                  {cart.map((l) => (
                    <tr key={l.product.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-2">{l.product.name}</td>
                      <td className="py-2 text-right">{formatPKR(l.product.sellingPrice)}</td>
                      <td className="py-2 text-center">
                        <button className="rounded bg-slate-100 px-2 dark:bg-slate-700" onClick={() => setQty(l.product.id, l.qty - 1)}>−</button>
                        <span className="mx-2 font-medium">{l.qty}</span>
                        <button className="rounded bg-slate-100 px-2 dark:bg-slate-700" onClick={() => setQty(l.product.id, l.qty + 1)}>+</button>
                      </td>
                      <td className="py-2 text-right font-medium">{formatPKR(Math.round(l.qty * l.product.sellingPrice) - l.discount)}</td>
                      <td className="py-2 text-right"><button className="text-red-500" onClick={() => setCart((c) => c.filter((x) => x.product.id !== l.product.id))}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
              <div className="flex items-center justify-between text-sm"><span>Subtotal</span><span>{formatPKR(subtotal)}</span></div>
              <div className="flex items-center justify-between text-sm">
                <span>Discount (Rs)</span>
                <input className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-900" type="number" min={0} value={discount / 100}
                  onChange={(e) => setDiscount(Math.max(0, Math.round(Number(e.target.value || 0) * 100)))} />
              </div>
              <div className="flex items-center justify-between text-lg font-bold"><span>Total</span><span>{formatPKR(total)}</span></div>

              <Field label="Customer (required for credit / Udhar)">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Walk-in customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">Payments {payments.length > 1 && '(split)'}</p>
                {payments.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <Select value={p.method} onChange={(e) => setPaymentMethod(i, e.target.value as Method)}>
                      <option value="CASH">Cash</option>
                      <option value="BANK">Bank transfer</option>
                      <option value="EASYPAISA">Easypaisa</option>
                      <option value="JAZZCASH">JazzCash</option>
                      <option value="CREDIT">Credit (Udhar)</option>
                    </Select>
                    <Input type="number" min={0} placeholder="Amount (Rs)" value={p.amount ? p.amount / 100 : ''}
                      onChange={(e) => setPaymentAmount(i, Math.round(Number(e.target.value || 0) * 100))} />
                    {payments.length > 1 && <Btn variant="ghost" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))}>✕</Btn>}
                  </div>
                ))}
                <div className="flex gap-2">
                  <Btn variant="secondary" onClick={() => setPayments((ps) => [...ps, { method: 'CASH', amount: Math.max(0, remaining) }])}>+ Split payment</Btn>
                  <Btn variant="secondary" onClick={() => setPayments([{ method: 'CASH', amount: total }])}>Pay full in cash</Btn>
                </div>
                {cashPay && (
                  <Field label="Cash tendered (Rs) — change is calculated">
                    <Input type="number" min={0} value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="e.g. 5000" />
                  </Field>
                )}
                {change > 0 && <p className="text-sm font-semibold text-emerald-600">Change to return: {formatPKR(change)}</p>}
                {remaining !== 0 && <p className="text-sm font-medium text-red-600">Remaining to allocate: {formatPKR(remaining)}</p>}
              </div>

              <Btn className="w-full !py-3 text-base" onClick={complete} disabled={busy || cart.length === 0}>
                {busy ? 'Saving…' : `Complete sale — ${formatPKR(total)} (F9)`}
              </Btn>
            </div>
          </div>
        </Card>
      </div>

      {done && (
        <SaleDoneModal sale={done} onClose={() => setDone(null)} />
      )}
      {toast.el}
    </div>
  );
}

function SaleDoneModal({ sale, onClose }: { sale: Record<string, unknown>; onClose: () => void }) {
  const [width, setWidth] = useState<'58' | '80' | 'A4'>('80');
  const toast = useToast();
  const print = async () => {
    try {
      await api.printInvoice(String(sale.id), width);
      toast.show('Sent to printer');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Print failed', 'err');
    }
  };
  return (
    <Modal title={`Sale completed — ${String(sale.invoiceNo)}`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span>Total</span><strong>{formatPKR(Number(sale.total))}</strong></div>
        <div className="flex justify-between"><span>Paid</span><span>{formatPKR(Number(sale.paidAmount))}</span></div>
        <div className="flex justify-between"><span>Gross profit on this sale</span><span className="text-emerald-600">{formatPKR(Number(sale.grossProfit))}</span></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select value={width} onChange={(e) => setWidth(e.target.value as '58' | '80' | 'A4')} className="!w-auto">
          <option value="58">Thermal 58mm</option>
          <option value="80">Thermal 80mm</option>
          <option value="A4">A4</option>
        </Select>
        <Btn onClick={print}>Print invoice</Btn>
        <Btn variant="secondary" onClick={async () => { await api.exportInvoicePdf(String(sale.id)); }}>Export PDF</Btn>
        <Btn variant="ghost" onClick={onClose}>New sale</Btn>
      </div>
      {toast.el}
    </Modal>
  );
}
