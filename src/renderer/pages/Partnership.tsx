import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, monthKey } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input, Modal, Select, useToast, Empty, Confirm } from '../components/ui';
import type { MonthlyClosePreview } from '@shared/types';

export default function Partnership({ isAdmin }: { isAdmin: boolean }) {
  const [partners, setPartners] = useState<Record<string, unknown>[]>([]);
  const [reserve, setReserve] = useState(0);
  const [closings, setClosings] = useState<Record<string, unknown>[]>([]);
  const [month, setMonth] = useState(monthKey());
  const [preview, setPreview] = useState<MonthlyClosePreview | null>(null);
  const [modal, setModal] = useState<'capital' | 'loan' | 'withdrawal' | 'reserve' | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<string>('');
  const [confirmClose, setConfirmClose] = useState(false);
  const toast = useToast();

  const load = () => {
    api.partners().then(setPartners).catch(() => undefined);
    api.reserveBalance().then(setReserve).catch(() => undefined);
    api.closings().then(setClosings).catch(() => undefined);
  };
  useEffect(load, []);
  useEffect(() => {
    api.closePreview(month).then(setPreview).catch(() => setPreview(null));
  }, [month]);

  const openModal = (m: 'capital' | 'loan' | 'withdrawal', partnerId: string) => {
    setSelectedPartner(partnerId);
    setModal(m);
  };

  const closeMonth = async () => {
    try {
      await api.closeMonth(month, undefined);
      setConfirmClose(false);
      load();
      api.closePreview(month).then(setPreview).catch(() => undefined);
      toast.show(`Month ${month} closed and locked`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Close failed', 'err');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Partnership</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        {partners.map((p) => (
          <Card key={String(p.id)}>
            <CardHeader
              title={`${String(p.name)} — ${String(p.type) === 'CAPITAL' ? 'Capital Partner' : 'Working Partner'}`}
              sub={`Profit share ${Number(p.profitSharePct)}%`}
            />
            <div className="space-y-1 p-4 text-sm">
              <div className="flex justify-between"><span>Capital balance</span><strong>{formatPKR(Number(p.capitalBalance))}</strong></div>
              <div className="flex justify-between"><span>Loan balance (business owes partner)</span><strong className={Number(p.loanBalance) > 0 ? 'text-amber-600' : ''}>{formatPKR(Number(p.loanBalance))}</strong></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => openModal('capital', String(p.id))}>+ Add capital</Btn>
                <Btn variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => openModal('loan', String(p.id))}>+ Partner loan</Btn>
                <Btn variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => openModal('withdrawal', String(p.id))}>Withdrawal</Btn>
                <Btn variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setSelectedPartner(String(p.id))}>Statement ↓</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Business reserve" sub="Reserve stays business money — available for stock, rent, bills and emergencies" />
        <div className="flex items-center gap-4 p-4">
          <span className="text-sm">Current reserve balance: <strong className="text-lg">{formatPKR(reserve)}</strong></span>
          <Btn variant="secondary" onClick={() => setModal('reserve')}>Use reserve</Btn>
        </div>
      </Card>

      <Card>
        <CardHeader title="Monthly closing & profit distribution" sub="Closing locks the month — corrections afterwards need traceable adjustment entries" />
        <div className="space-y-3 p-4">
          <div className="flex items-end gap-2">
            <Field label="Month">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="!w-48" />
            </Field>
            <Btn variant="secondary" onClick={() => api.closePreview(month).then(setPreview).catch(() => undefined)}>Refresh preview</Btn>
          </div>
          {preview && (
            <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Net sales</p><p className="font-bold">{formatPKR(preview.netSales)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">COGS</p><p className="font-bold">{formatPKR(preview.cogs)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Gross profit</p><p className="font-bold text-emerald-600">{formatPKR(preview.grossProfit)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Expenses</p><p className="font-bold text-red-600">{formatPKR(preview.expenses)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Net profit</p><p className={`font-bold ${preview.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatPKR(preview.netProfit)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Reserve ({preview.reservePct}%)</p><p className="font-bold">{formatPKR(preview.reserveAmount)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Distributable</p><p className="font-bold">{formatPKR(preview.distributable)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700"><p className="text-xs text-slate-500">Each partner (50/50)</p><p className="font-bold">{formatPKR(preview.partner1Share)}</p></div>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span>Closing inventory: <strong>{preview ? formatPKR(preview.closingInventoryValue) : '—'}</strong></span>
            <span>Customer credit: <strong>{preview ? formatPKR(preview.customerOutstanding) : '—'}</strong></span>
            <span>Supplier payables: <strong>{preview ? formatPKR(preview.supplierOutstanding) : '—'}</strong></span>
          </div>
          <div className="flex gap-2">
            <Btn variant="danger" disabled={!isAdmin} onClick={() => setConfirmClose(true)}>
              Close month {month} {isAdmin ? '' : '(admin only)'}
            </Btn>
            {!isAdmin && <span className="text-xs text-slate-400 self-center">Only the Admin/Owner can close a month and approve distributions.</span>}
          </div>
          <p className="text-xs text-slate-400">Before closing, verify sales, purchases, expenses, cash balances, customer credit, supplier payables and do a physical stock count (Inventory → Adjust stock for damaged/expired items).</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Closed months & distributions" sub="Distributions are PENDING until approved and paid" />
        {closings.length === 0 ? <Empty text="No months closed yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Net profit</th><th className="px-4 py-2 text-right">Reserve</th><th className="px-4 py-2 text-right">Distributable</th><th className="px-4 py-2">Distributions</th></tr></thead>
            <tbody>
              {closings.map((c) => (
                <tr key={String(c.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(c.month)}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(c.netProfit))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(c.reserveAmount))}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(Number(c.distributable))}</td>
                  <td className="px-4 py-2">
                    {((c.distributions as { partner: { name: string }; amount: number; status: string; id: string }[]) || []).map((d) => (
                      <span key={d.id} className="mr-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">
                        {d.partner.name}: {formatPKR(d.amount)} · {d.status}
                        {d.status !== 'PAID' && isAdmin && (
                          <button className="ml-2 text-blue-600" onClick={async () => {
                            try { await api.payDistribution({ distributionId: d.id, method: 'CASH' }); load(); toast.show('Distribution paid'); }
                            catch (e) { toast.show(e instanceof Error ? e.message : 'Payment failed', 'err'); }
                          }}>Pay</button>
                        )}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {selectedPartner && (
        <PartnerStatement partnerId={selectedPartner} onClose={() => setSelectedPartner('')} />
      )}

      {modal && modal !== 'reserve' && selectedPartner && (
        <PartnerTxnModal
          kind={modal}
          partnerId={selectedPartner}
          partners={partners}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); toast.show('Recorded'); }}
        />
      )}
      {modal === 'reserve' && (
        <ReserveModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); toast.show('Reserve used'); }} />
      )}

      {confirmClose && (
        <Confirm
          title={`Close month ${month}?`}
          message="This locks all transactions in this month against silent changes, records the reserve, and creates the two partner distribution rows. This cannot be undone — corrections afterwards must be adjustment entries."
          confirmLabel="Close month"
          onConfirm={closeMonth}
          onCancel={() => setConfirmClose(false)}
        />
      )}
      {toast.el}
    </div>
  );
}

function PartnerStatement({ partnerId, onClose }: { partnerId: string; onClose: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api.partnerStatement(partnerId).then(setData).catch(() => undefined); }, [partnerId]);
  const partner = data?.partner as { name: string; type: string } | undefined;
  const rows = (key: string) => (data?.[key] as { amount: number; date: string; note?: string; kind?: string; status?: string }[]) || [];
  return (
    <Modal title={`Partner statement — ${partner?.name || ''}`} onClose={onClose} wide>
      {['capitals', 'loans', 'withdrawals', 'distributions'].map((key) => (
        <div key={key} className="mb-4">
          <h4 className="mb-1 text-sm font-semibold capitalize">{key}</h4>
          {rows(key).length === 0 ? <p className="text-xs text-slate-400">None.</p> : (
            <table className="w-full text-sm">
              <tbody>
                {rows(key).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-1">{new Date(r.date || (r as unknown as { createdAt?: string }).createdAt || '').toLocaleDateString('en-GB')}</td>
                    <td className="py-1 text-slate-500">{String(r.note || r.kind || r.status || '')}</td>
                    <td className="py-1 text-right font-medium">{formatPKR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </Modal>
  );
}

function PartnerTxnModal({ kind, partnerId, partners, onClose, onSaved }: {
  kind: 'capital' | 'loan' | 'withdrawal';
  partnerId: string;
  partners: Record<string, unknown>[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('CASH');
  const [err, setErr] = useState('');
  const partner = partners.find((p) => String(p.id) === partnerId);
  const title = kind === 'capital' ? 'Add capital' : kind === 'loan' ? 'Partner loan' : 'Partner withdrawal';
  const hint = kind === 'capital'
    ? 'Money in from the partner — increases their capital balance and business cash.'
    : kind === 'loan'
      ? 'Temporary loan — the business owes the partner. Kept in a separate ledger from capital.'
      : 'Personal money out — NEVER a business expense. Reduces cash only.';
  const save = async () => {
    const amt = Math.round(Number(amount || 0) * 100);
    if (!amt || amt <= 0) { setErr('Enter an amount above zero.'); return; }
    try {
      if (kind === 'capital') await api.addCapital({ partnerId, amount: amt, kind: 'ADDITIONAL', note: note || null, method });
      if (kind === 'loan') await api.addLoan({ partnerId, amount: amt, note: note || null, method });
      if (kind === 'withdrawal') await api.addWithdrawal({ partnerId, amount: amt, note: note || null, method });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };
  return (
    <Modal title={`${title} — ${String(partner?.name || '')}`} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">{hint}</p>
      <div className="space-y-3">
        <Field label="Amount (Rs)"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash</option><option value="BANK">Bank</option>
            <option value="EASYPAISA">Easypaisa</option><option value="JAZZCASH">JazzCash</option>
          </Select>
        </Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Save</Btn></div>
      </div>
    </Modal>
  );
}

function ReserveModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const amt = Math.round(Number(amount || 0) * 100);
    if (!amt || amt <= 0 || !note.trim()) { setErr('Amount and a note are required.'); return; }
    try {
      await api.useReserve({ amount: amt, note: note.trim() });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };
  return (
    <Modal title="Use business reserve" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Amount (Rs)"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Purpose"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Emergency stock purchase" /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Use reserve</Btn></div>
      </div>
    </Modal>
  );
}
