import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR, monthKey } from '@shared/format';
import { Btn, Card, CardHeader, Field, Input } from '../components/ui';

export default function ProfitLoss() {
  const [month, setMonth] = useState(monthKey());
  const [pl, setPl] = useState<Record<string, unknown> | null>(null);
  const [bs, setBs] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<'pl' | 'bs'>('pl');

  const load = () => {
    api.profitAndLoss(month).then(setPl).catch(() => undefined);
    api.balanceSheet().then(setBs).catch(() => undefined);
  };
  useEffect(load, [month]);

  const Row = ({ label, value, bold, tone }: { label: string; value: number; bold?: boolean; tone?: 'good' | 'bad' }) => (
    <div className={`flex justify-between py-2 text-sm ${bold ? 'border-t border-slate-200 font-bold dark:border-slate-600' : 'border-b border-slate-50 dark:border-slate-700'}`}>
      <span>{label}</span>
      <span className={tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : ''}>{formatPKR(value)}</span>
    </div>
  );

  const assets = bs?.assets as { cash: number; inventory: number; receivables: number; total: number } | undefined;
  const liab = bs?.liabilities as { supplierPayables: number; partnerLoans: number; total: number } | undefined;
  const eq = bs?.equity as { partnerCapital: number; reserve: number; total: number } | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Profit & Loss / Balance Sheet</h1>
        <div className="flex gap-2">
          <Btn variant={tab === 'pl' ? 'primary' : 'secondary'} onClick={() => setTab('pl')}>Profit & Loss</Btn>
          <Btn variant={tab === 'bs' ? 'primary' : 'secondary'} onClick={() => setTab('bs')}>Balance Sheet</Btn>
        </div>
      </div>

      {tab === 'pl' && (
        <Card>
          <CardHeader title={`Profit & Loss — ${month}`} sub="Purchases are not expenses — only the cost of goods actually sold (COGS) is deducted" />
          <div className="space-y-3 p-4">
            <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="!w-48" /></Field>
            {pl && (
              <div>
                <Row label="Net sales" value={Number(pl.netSales)} />
                <Row label="Cost of goods sold (COGS)" value={Number(pl.cogs)} tone="bad" />
                <Row label="Gross profit" value={Number(pl.grossProfit)} bold tone="good" />
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Operating expenses</p>
                {((pl.expenseBreakdown as { category: string; amount: number }[]) || []).map((b) => (
                  <Row key={b.category} label={b.category} value={b.amount} tone="bad" />
                ))}
                <Row label="Total expenses" value={Number(pl.expenses)} bold tone="bad" />
                <Row label="Net profit" value={Number(pl.netProfit)} bold tone={Number(pl.netProfit) >= 0 ? 'good' : 'bad'} />
                <Row label={`Business reserve (${Number(pl.reservePct)}%)`} value={Number(pl.reserveAmount)} />
                <Row label="Distributable profit" value={Number(pl.distributable)} bold />
                <Row label="Capital Partner share (50%)" value={Number(pl.partner1Share)} />
                <Row label="Working Partner share (50%)" value={Number(pl.partner2Share)} />
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === 'bs' && bs && (
        <Card>
          <CardHeader title="Balance Sheet (today)" sub="Assets = Liabilities + Equity + Retained earnings" />
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Assets</p>
              <Row label="Cash, bank & wallets" value={assets?.cash || 0} />
              <Row label="Inventory (at cost)" value={assets?.inventory || 0} />
              <Row label="Customer receivables (Udhaar)" value={assets?.receivables || 0} />
              <Row label="Total assets" value={assets?.total || 0} bold />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Liabilities & Equity</p>
              <Row label="Supplier payables" value={liab?.supplierPayables || 0} />
              <Row label="Partner loans" value={liab?.partnerLoans || 0} />
              <Row label="Total liabilities" value={liab?.total || 0} bold />
              <Row label="Partner capital" value={eq?.partnerCapital || 0} />
              <Row label="Business reserve" value={eq?.reserve || 0} />
              <Row label="Total equity" value={eq?.total || 0} bold />
              <Row label="Retained earnings (balancing figure)" value={Number(bs.retainedEarnings)} bold />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
