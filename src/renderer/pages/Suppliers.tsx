import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, fmtDateTime } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, useToast, Empty } from '../components/ui';
import { PaymentForm } from './Customers';

export default function Suppliers() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const toast = useToast();
  const load = () => api.suppliers().then(setList).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const total = list.reduce((s, x) => s + Number(x.currentPayable), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Suppliers</h1>
        <Btn onClick={() => setShowForm(true)}>+ Add supplier</Btn>
      </div>
      <Card>
        <CardHeader title="Supplier payables" sub={`Total outstanding: ${formatPKR(total)}`} />
        {list.length === 0 ? <Empty text="No suppliers yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Supplier</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2">Address</th><th className="px-4 py-2 text-right">Payable</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={String(s.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(s.name)}</td>
                  <td className="px-4 py-2">{String(s.phone || '—')}</td>
                  <td className="px-4 py-2 text-slate-500">{String(s.address || '—')}</td>
                  <td className={`px-4 py-2 text-right font-medium ${Number(s.currentPayable) > 0 ? 'text-red-600' : ''}`}>{formatPKR(Number(s.currentPayable))}</td>
                  <td className="px-4 py-2 text-right"><button className="text-blue-600" onClick={() => setDetail(s)}>Statement</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {showForm && <SupplierForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); toast.show('Supplier added'); }} />}
      {detail && <SupplierStatement supplier={detail} onClose={() => setDetail(null)} onChanged={load} />}
      {toast.el}
    </div>
  );
}

function SupplierForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [opening, setOpening] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    if (!name.trim()) { setErr('Name is required.'); return; }
    try {
      await api.createSupplier({ name: name.trim(), phone: phone || undefined, address: address || undefined, openingPayable: opening ? Math.round(Number(opening) * 100) : 0 });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };
  return (
    <Modal title="Add supplier" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Address (optional)"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Opening payable (Rs, optional)"><Input type="number" min={0} value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save supplier</Btn>
        </div>
      </div>
    </Modal>
  );
}

function SupplierStatement({ supplier, onClose, onChanged }: { supplier: Record<string, unknown>; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const toast = useToast();
  const load = () => api.supplierStatement(String(supplier.id)).then(setData).catch(() => undefined);
  useEffect(() => { void load(); }, [supplier.id]);
  const ledger = (data?.ledger as { type: string; amount: number; date: string; note?: string }[]) || [];
  return (
    <Modal title={`Statement — ${String(supplier.name)}`} onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span>Outstanding payable: <strong className={Number(supplier.currentPayable) > 0 ? 'text-red-600' : ''}>{formatPKR(Number(supplier.currentPayable))}</strong></span>
        <Btn onClick={() => setPayOpen(true)} disabled={Number(supplier.currentPayable) <= 0}>Pay supplier</Btn>
      </div>
      {ledger.length === 0 ? <Empty text="No ledger entries yet." /> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Date</th><th className="py-1">Type</th><th className="py-1">Note</th><th className="py-1 text-right">Amount</th></tr></thead>
          <tbody>
            {ledger.map((l, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                <td className="py-1">{fmtDateTime(String(l.date))}</td>
                <td className="py-1">{String(l.type).replace(/_/g, ' ')}</td>
                <td className="py-1 text-slate-500">{String(l.note || '')}</td>
                <td className={`py-1 text-right font-medium ${l.amount >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{l.amount >= 0 ? '+' : ''}{formatPKR(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {payOpen && <PaymentForm partyType="SUPPLIER" partyId={String(supplier.id)} partyName={String(supplier.name)} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); load(); onChanged(); toast.show('Payment recorded'); }} />}
      {toast.el}
    </Modal>
  );
}
