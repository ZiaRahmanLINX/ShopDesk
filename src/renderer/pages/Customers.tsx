import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, fmtDateTime } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, useToast, Empty } from '../components/ui';

export default function Customers() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const toast = useToast();

  const load = () => api.customers().then(setList).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Customers</h1>
        <Btn onClick={() => setShowForm(true)}>+ Add customer</Btn>
      </div>
      <Card>
        <CardHeader title="Customer ledger" sub="Outstanding = what the customer still owes you" />
        {list.length === 0 ? <Empty text="No customers yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Name</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2">Address</th><th className="px-4 py-2 text-right">Outstanding</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={String(c.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(c.name)}</td>
                  <td className="px-4 py-2">{String(c.phone || '—')}</td>
                  <td className="px-4 py-2 text-slate-500">{String(c.address || '—')}</td>
                  <td className={`px-4 py-2 text-right font-medium ${Number(c.currentBalance) > 0 ? 'text-red-600' : ''}`}>{formatPKR(Number(c.currentBalance))}</td>
                  <td className="px-4 py-2 text-right"><button className="text-blue-600" onClick={() => setDetail(c)}>Statement</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {showForm && <CustomerForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); toast.show('Customer added'); }} />}
      {detail && <CustomerStatement customer={detail} onClose={() => setDetail(null)} onChanged={load} />}
      {toast.el}
    </div>
  );
}

function CustomerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [opening, setOpening] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    if (!name.trim()) { setErr('Name is required.'); return; }
    try {
      await api.createCustomer({ name: name.trim(), phone: phone || undefined, address: address || undefined, openingBalance: opening ? Math.round(Number(opening) * 100) : 0 });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };
  return (
    <Modal title="Add customer" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Address (optional)"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Opening balance owed (Rs, optional)"><Input type="number" min={0} value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save customer</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function CustomerStatement({ customer, onClose, onChanged }: { customer: Record<string, unknown>; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const toast = useToast();
  const load = () => api.customerStatement(String(customer.id)).then(setData).catch(() => undefined);
  useEffect(() => { void load(); }, [customer.id]);
  const ledger = (data?.ledger as { type: string; amount: number; date: string; note?: string }[]) || [];
  return (
    <Modal title={`Statement — ${String(customer.name)}`} onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span>Outstanding balance: <strong className={Number(customer.currentBalance) > 0 ? 'text-red-600' : ''}>{formatPKR(Number(customer.currentBalance))}</strong></span>
        <Btn onClick={() => setPayOpen(true)} disabled={Number(customer.currentBalance) <= 0}>Record payment</Btn>
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
      {payOpen && <PaymentForm partyType="CUSTOMER" partyId={String(customer.id)} partyName={String(customer.name)} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); load(); onChanged(); toast.show('Payment recorded'); }} />}
      {toast.el}
    </Modal>
  );
}

export function PaymentForm({ partyType, partyId, partyName, onClose, onSaved }: {
  partyType: 'CUSTOMER' | 'SUPPLIER';
  partyId: string;
  partyName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK' | 'EASYPAISA' | 'JAZZCASH'>('CASH');
  const [accounts, setAccounts] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api.cashAccounts().then((a) => setAccounts(a as unknown as { id: string; name: string; kind: string }[])).catch(() => undefined); }, []);
  const save = async () => {
    const amt = Math.round(Number(amount || 0) * 100);
    if (!amt || amt <= 0) { setErr('Enter an amount above zero.'); return; }
    try {
      await api.recordPayment({ partyType, partyId, amount: amt, method, cashAccountId: accountId || null, note: note || null });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };
  return (
    <Modal title={`Record payment — ${partyName}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Amount (Rs)"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Method">
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={method} onChange={(e) => setMethod(e.target.value as never)}>
            <option value="CASH">Cash</option><option value="BANK">Bank</option>
            <option value="EASYPAISA">Easypaisa</option><option value="JAZZCASH">JazzCash</option>
          </select>
        </Field>
        <Field label="Account">
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Auto (by method)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
          </select>
        </Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Record payment</Btn>
        </div>
      </div>
    </Modal>
  );
}
