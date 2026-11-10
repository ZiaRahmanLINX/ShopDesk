import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, fmtDateTime } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, Select, useToast, Empty } from '../components/ui';

export default function Cashbook() {
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [txns, setTxns] = useState<Record<string, unknown>[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const toast = useToast();

  const load = () => {
    api.cashAccounts().then((a) => {
      setAccounts(a);
      if (!selected && a.length > 0) setSelected(String(a[0].id));
    }).catch(() => undefined);
  };
  useEffect(load, []);
  useEffect(() => {
    if (selected) api.cashTransactions(selected, 100).then(setTxns).catch(() => undefined);
  }, [selected]);

  const total = accounts.reduce((s, a) => s + Number(a.currentBalance), 0);
  const current = accounts.find((a) => String(a.id) === selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cashbook</h1>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={() => setShowAccount(true)}>+ Add account</Btn>
          <Btn variant="secondary" onClick={() => setShowTransfer(true)}>Transfer between accounts</Btn>
          <Btn onClick={() => setShowCount(true)}>Daily cash count</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {accounts.map((a) => (
          <button key={String(a.id)} onClick={() => setSelected(String(a.id))}
            className={`rounded-xl border p-4 text-left ${selected === String(a.id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{String(a.kind)}</p>
            <p className="font-semibold">{String(a.name)}</p>
            <p className="mt-1 text-lg font-bold">{formatPKR(Number(a.currentBalance))}</p>
          </button>
        ))}
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total across accounts</p>
          <p className="mt-1 text-lg font-bold text-blue-700 dark:text-blue-400">{formatPKR(total)}</p>
        </Card>
      </div>

      <Card>
        <CardHeader title={`Transactions — ${String(current?.name || '')}`} sub="Transfers between business accounts are never revenue or expense" />
        {txns.length === 0 ? <Empty text="No transactions for this account yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Note</th><th className="px-4 py-2 text-right">In</th><th className="px-4 py-2 text-right">Out</th></tr></thead>
            <tbody>
              {txns.map((t) => (
                <tr key={String(t.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2">{fmtDateTime(String(t.date))}</td>
                  <td className="px-4 py-2">{String(t.category).replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-slate-500">{String(t.note || '')}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">{(String(t.type) === 'IN' || String(t.type) === 'TRANSFER_IN') ? formatPKR(Number(t.amount)) : ''}</td>
                  <td className="px-4 py-2 text-right text-red-600">{(String(t.type) === 'OUT' || String(t.type) === 'TRANSFER_OUT') ? formatPKR(Number(t.amount)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showTransfer && <TransferModal accounts={accounts} onClose={() => setShowTransfer(false)} onSaved={() => { setShowTransfer(false); load(); toast.show('Transfer recorded'); }} />}
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} onSaved={() => { setShowAccount(false); load(); toast.show('Account added'); }} />}
      {showCount && current && <CountModal account={current} onClose={() => setShowCount(false)} onSaved={() => { setShowCount(false); load(); toast.show('Cash count saved'); }} />}
      {toast.el}
    </div>
  );
}

function TransferModal({ accounts, onClose, onSaved }: { accounts: Record<string, unknown>[]; onClose: () => void; onSaved: () => void }) {
  const [from, setFrom] = useState(String(accounts[0]?.id || ''));
  const [to, setTo] = useState(String(accounts[1]?.id || ''));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const amt = Math.round(Number(amount || 0) * 100);
    if (!amt || amt <= 0 || from === to) { setErr('Enter an amount above zero and two different accounts.'); return; }
    try {
      await api.transfer({ fromId: from, toId: to, amount: amt, note: note || null });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Transfer failed');
    }
  };
  return (
    <Modal title="Transfer between accounts" onClose={onClose}>
      <div className="space-y-3">
        <Field label="From"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{accounts.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)} — {formatPKR(Number(a.currentBalance))}</option>)}</Select></Field>
        <Field label="To"><Select value={to} onChange={(e) => setTo(e.target.value)}>{accounts.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)} — {formatPKR(Number(a.currentBalance))}</option>)}</Select></Field>
        <Field label="Amount (Rs)"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Transfer</Btn></div>
      </div>
    </Modal>
  );
}

function AccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState('BANK');
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    if (!name.trim()) { setErr('Name is required.'); return; }
    try {
      await api.createCashAccount({ kind, name: name.trim(), openingBalance: opening ? Math.round(Number(opening) * 100) : 0 });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };
  return (
    <Modal title="Add cash account" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="CASH">Physical cash</option><option value="BANK">Bank account</option>
            <option value="EASYPAISA">Easypaisa</option><option value="JAZZCASH">JazzCash</option><option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Account name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HBL Current Account" autoFocus /></Field>
        <Field label="Opening balance (Rs)"><Input type="number" min={0} value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Add account</Btn></div>
      </div>
    </Modal>
  );
}

function CountModal({ account, onClose, onSaved }: { account: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const [actual, setActual] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const expected = Number(account.currentBalance);
  const actualPaisa = actual ? Math.round(Number(actual) * 100) : NaN;
  const diff = Number.isFinite(actualPaisa) ? actualPaisa - expected : 0;
  const save = async () => {
    if (!Number.isFinite(actualPaisa) || actualPaisa < 0) { setErr('Enter the counted cash amount.'); return; }
    try {
      await api.dailyCashCount({ accountId: String(account.id), actualPaisa, note: note || null });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };
  return (
    <Modal title={`Daily cash count — ${String(account.name)}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm">Expected (system): <strong>{formatPKR(expected)}</strong></p>
        <Field label="Actual counted cash (Rs)"><Input type="number" min={0} value={actual} onChange={(e) => setActual(e.target.value)} autoFocus /></Field>
        {Number.isFinite(actualPaisa) && diff !== 0 && (
          <p className={`text-sm font-medium ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {diff > 0 ? 'Overage' : 'Shortage'}: {formatPKR(Math.abs(diff))} — this will be recorded as an adjustment.
          </p>
        )}
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Save count</Btn></div>
      </div>
    </Modal>
  );
}
