// Owner — the single owner's money in and out of the business.
// Capital in (initial or additional) and drawings out (personal money —
// never a business expense). All profit stays in the business as retained
// earnings.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, fmtDate } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, Select, Stat, useToast, Empty } from '../components/ui';

export default function Owner() {
  const [summary, setSummary] = useState<{ totalCapital: number; totalDrawings: number }>({ totalCapital: 0, totalDrawings: 0 });
  const [capital, setCapital] = useState<Record<string, unknown>[]>([]);
  const [drawings, setDrawings] = useState<Record<string, unknown>[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [modal, setModal] = useState<'capital' | 'drawing' | null>(null);
  const toast = useToast();

  const load = () => {
    api.summary().then(setSummary).catch(() => undefined);
    api.listCapital().then(setCapital).catch(() => undefined);
    api.listDrawings().then(setDrawings).catch(() => undefined);
    api.cashAccounts().then((a) => setAccounts(a as unknown as { id: string; name: string; kind: string }[])).catch(() => undefined);
  };
  useEffect(load, []);

  const rowDate = (r: Record<string, unknown>) =>
    fmtDate(String(r.date || r.createdAt || ''));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Owner</h1>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={() => setModal('capital')}>+ Add capital</Btn>
          <Btn onClick={() => setModal('drawing')}>Record drawing</Btn>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total capital in" value={formatPKR(summary.totalCapital)} sub="Money you put into the business" tone="good" />
        <Stat label="Total drawings out" value={formatPKR(summary.totalDrawings)} sub="Personal money taken out" tone="bad" />
        <Stat label="Net owner balance" value={formatPKR(summary.totalCapital - summary.totalDrawings)} sub="Capital in minus drawings out" />
      </div>

      <Card>
        <CardHeader title="Capital in" sub="Money you invested — initial capital when you started, additional capital any time after" />
        {capital.length === 0 ? <Empty text="No capital recorded yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Kind</th><th className="px-4 py-2">Note</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {capital.map((r) => (
                <tr key={String(r.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2">{rowDate(r)}</td>
                  <td className="px-4 py-2">{String(r.kind || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-slate-500">{String(r.note || '')}</td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-600">{formatPKR(Number(r.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="Drawings out" sub="Personal money taken out of the business — never a business expense, never reduces profit" />
        {drawings.length === 0 ? <Empty text="No drawings recorded yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Note</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {drawings.map((r) => (
                <tr key={String(r.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2">{rowDate(r)}</td>
                  <td className="px-4 py-2 text-slate-500">{String(r.note || '')}</td>
                  <td className="px-4 py-2 text-right font-medium text-red-600">{formatPKR(Number(r.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modal === 'capital' && (
        <OwnerTxnModal
          kind="capital"
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); toast.show('Capital recorded'); }}
        />
      )}
      {modal === 'drawing' && (
        <OwnerTxnModal
          kind="drawing"
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); toast.show('Drawing recorded'); }}
        />
      )}
      {toast.el}
    </div>
  );
}

function OwnerTxnModal({ kind, accounts, onClose, onSaved }: {
  kind: 'capital' | 'drawing';
  accounts: { id: string; name: string; kind: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [capitalKind, setCapitalKind] = useState<'INITIAL' | 'ADDITIONAL'>('ADDITIONAL');
  const [method, setMethod] = useState('CASH');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const title = kind === 'capital' ? 'Add capital' : 'Record drawing';
  const hint = kind === 'capital'
    ? 'Money in from you — increases your capital balance and business cash.'
    : 'Personal money out — NEVER a business expense. Reduces cash only.';

  const save = async () => {
    const amt = Math.round(Number(amount || 0) * 100);
    if (!amt || amt <= 0) { setErr('Enter an amount above zero.'); return; }
    try {
      if (kind === 'capital') {
        await api.addCapital({ amount: amt, kind: capitalKind, note: note || null, cashAccountId: accountId || null, method });
      } else {
        await api.addDrawing({ amount: amt, note: note || null, cashAccountId: accountId || null, method });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">{hint}</p>
      <div className="space-y-3">
        <Field label="Amount (Rs)"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        {kind === 'capital' && (
          <Field label="Kind">
            <Select value={capitalKind} onChange={(e) => setCapitalKind(e.target.value as 'INITIAL' | 'ADDITIONAL')}>
              <option value="INITIAL">Initial capital (starting the shop)</option>
              <option value="ADDITIONAL">Additional capital (top-up)</option>
            </Select>
          </Field>
        )}
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash</option><option value="BANK">Bank</option>
            <option value="EASYPAISA">Easypaisa</option><option value="JAZZCASH">JazzCash</option>
          </Select>
        </Field>
        <Field label="Cash account">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Auto (by method)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
          </Select>
        </Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Save</Btn></div>
      </div>
    </Modal>
  );
}
