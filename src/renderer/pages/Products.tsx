import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, parseRupees } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, Select, useToast, Empty } from '../components/ui';

interface Product {
  id: string; name: string; sku: string; barcode?: string | null; categoryId?: string | null;
  category?: { name: string } | null; brand?: string | null; purchasePrice: number; sellingPrice: number;
  qty: number; minQty: number; unit: string; supplierId?: string | null; description?: string | null;
}

const UNITS = ['piece', 'packet', 'kg', 'litre', 'box', 'dozen'];

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const toast = useToast();

  const load = () => {
    api.products({ search, categoryId: catFilter || undefined }).then((p) => setProducts(p as unknown as Product[])).catch(() => undefined);
    api.categories().then(setCats).catch(() => undefined);
    api.suppliers().then((s) => setSuppliers(s as unknown as { id: string; name: string }[])).catch(() => undefined);
  };
  useEffect(load, [search, catFilter]);

  const remove = async (p: Product) => {
    if (!window.confirm(`Delete ${p.name}? Products with sales/purchase history are deactivated instead, keeping history intact.`)) return;
    try {
      const r = await api.deleteProduct(p.id) as { deactivated: boolean };
      toast.show(r.deactivated ? 'Product deactivated (has transaction history)' : 'Product deleted');
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Delete failed', 'err');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Products</h1>
        <Btn onClick={() => setEditing('new')}>+ Add product</Btn>
      </div>
      <Card>
        <div className="flex gap-2 p-3">
          <Input placeholder="Search name, SKU or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="!w-48">
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        {products.length === 0 ? <Empty text="No products found. Add your first product." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Product</th><th className="px-4 py-2">SKU</th><th className="px-4 py-2">Category</th><th className="px-4 py-2 text-right">Buy</th><th className="px-4 py-2 text-right">Sell</th><th className="px-4 py-2 text-right">Stock</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{p.name}{p.qty <= p.minQty && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">LOW</span>}</td>
                  <td className="px-4 py-2 text-slate-500">{p.sku}</td>
                  <td className="px-4 py-2">{p.category?.name || '—'}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(p.purchasePrice)}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(p.sellingPrice)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${p.qty <= p.minQty ? 'text-red-600' : ''}`}>{p.qty} {p.unit}</td>
                  <td className="px-4 py-2 text-right">
                    <button className="mr-2 text-blue-600" onClick={() => setEditing(p)}>Edit</button>
                    <button className="text-red-500" onClick={() => remove(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          cats={cats}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.show('Product saved'); }}
        />
      )}
      {toast.el}
    </div>
  );
}

function ProductForm({ product, cats, suppliers, onClose, onSaved }: {
  product: Product | null;
  cats: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    categoryId: product?.categoryId || '',
    brand: product?.brand || '',
    purchasePrice: product ? String(product.purchasePrice / 100) : '',
    sellingPrice: product ? String(product.sellingPrice / 100) : '',
    qty: product ? String(product.qty) : '0',
    minQty: product ? String(product.minQty) : '0',
    unit: product?.unit || 'piece',
    supplierId: product?.supplierId || '',
    description: product?.description || '',
  });
  const [err, setErr] = useState('');
  const toast = useToast();
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const buy = parseRupees(f.purchasePrice);
    const sell = parseRupees(f.sellingPrice);
    if (!f.name.trim() || !f.sku.trim() || buy === null || sell === null) { setErr('Name, SKU, purchase price and selling price are required.'); return; }
    try {
      const data = {
        name: f.name.trim(), sku: f.sku.trim(), barcode: f.barcode || null,
        categoryId: f.categoryId || null, brand: f.brand || null,
        purchasePrice: buy, sellingPrice: sell,
        qty: Number(f.qty) || 0, minQty: Number(f.minQty) || 0,
        unit: f.unit, supplierId: f.supplierId || null, description: f.description || null,
      };
      if (product) await api.updateProduct(product.id, data);
      else await api.createProduct(data);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <Modal title={product ? `Edit ${product.name}` : 'Add product'} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product name"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="SKU / Barcode code"><Input value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Barcode (optional)"><Input value={f.barcode} onChange={(e) => set('barcode', e.target.value)} /></Field>
        <Field label="Brand (optional)"><Input value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
        <Field label="Category">
          <Select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">— None —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Supplier">
          <Select value={f.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">— None —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Purchase price (Rs)"><Input type="number" min={0} value={f.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} /></Field>
        <Field label="Selling price (Rs)"><Input type="number" min={0} value={f.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} /></Field>
        <Field label="Opening quantity"><Input type="number" min={0} value={f.qty} onChange={(e) => set('qty', e.target.value)} disabled={!!product} hint={product ? 'Use Inventory → Adjust stock to change quantity.' : undefined} /></Field>
        <Field label="Minimum stock alert"><Input type="number" min={0} value={f.minQty} onChange={(e) => set('minQty', e.target.value)} /></Field>
        <Field label="Unit">
          <Select value={f.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Description"><Input value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save product</Btn>
      </div>
      {toast.el}
    </Modal>
  );
}
