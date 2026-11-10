import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, parseRupees, fmtDate } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, Select, useToast, Empty } from '../components/ui';

export default function Expenses() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [catFilter, setCatFilter] = useState('');
  const [newCat, setNewCat] = useState('');
  const toast = useToast();

  const load = () => {
    api.expenses({ categoryId: catFilter || undefined, limit: 200 }).then(setList).catch(() => undefined);
    api.expenseCategories().then(setCats).catch(() => undefined);
    api.cashAccounts().then((a) => setAccounts(a as unknown as { id: string; name: string; kind: string }[])).catch(() => undefined);
  };
  useEffect(load, [catFilter]);

  const total = list.reduce((s, e) => s + Number(e.amount), 0);

  const addCategory = async () => {
    if (!newCat.trim()) return;
    try {
      await api.createExpenseCategory(newCat.trim());
      setNewCat('');
      load();
      toast.show('Category added');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Failed', 'err');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Expenses <span className="text-sm font-normal text-slate-400">· Total shown: {formatPKR(total)}</span></h1>
        <Btn onClick={() => setShowForm(true)}>+ Add expense</Btn>
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 p-3">
          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="!w-56">
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input placeholder="New category name…" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="!w-56" />
          <Btn variant="secondary" onClick={addCategory}>Add category</Btn>
        </div>
        {list.length === 0 ? <Empty text="No expenses recorded yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Title</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Method</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Description</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={String(e.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2">{fmtDate(String(e.date))}</td>
                  <td className="px-4 py-2 font-medium">{String(e.title)}</td>
                  <td className="px-4 py-2">{String((e.category as { name: string })?.name)}</td>
                  <td className="px-4 py-2">{String(e.paymentMethod)}</td>
                  <td className="px-4 py-2 text-right font-medium text-red-600">{formatPKR(Number(e.amount))}</td>
                  <td className="px-4 py-2 text-slate-500">{String(e.description || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-xs text-slate-400">Partner withdrawals are never expenses — record them under Partnership → Withdrawals.</p>
      {showForm && (
        <ExpenseForm cats={cats} accounts={accounts} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); toast.show('Expense recorded'); }} />
      )}
      {toast.el}
    </div>
  );
}

function ExpenseForm({ cats, accounts, onClose, onSaved }: {
  cats: { id: string; name: string }[];
  accounts: { id: string; name: string; kind: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(cats[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK' | 'EASYPAISA' | 'JAZZCASH'>('CASH');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const amt = parseRupees(amount);
    if (!title.trim() || !categoryId || amt === null || amt <= 0) { setErr('Title, category and an amount above zero are required.'); return; }
    try {
      await api.createExpense({ title: title.trim(), categoryId, amount: amt, paymentMethod: method, cashAccountId: accountId || null, description: description || null });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };
  return (
    <Modal title="Add expense" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Shop rent — November" autoFocus /></Field>
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Amount (Rs)"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as never)}>
              <option value="CASH">Cash</option><option value="BANK">Bank</option>
              <option value="EASYPAISA">Easypaisa</option><option value="JAZZCASH">JazzCash</option>
            </Select>
          </Field>
          <Field label="Pay from account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Auto (by method)</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Description (optional)"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save expense</Btn>
        </div>
      </div>
    </Modal>
  );
}
