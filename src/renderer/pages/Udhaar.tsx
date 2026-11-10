import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPKR } from '@shared/format';
import { Btn, Card, CardHeader, useToast, Empty } from '../components/ui';
import { CustomerStatement } from './Customers';

export default function Udhaar() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const toast = useToast();
  const load = () => api.customers().then(setList).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const owing = list.filter((c) => Number(c.currentBalance) > 0);
  const total = owing.reduce((s, c) => s + Number(c.currentBalance), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Udhaar (Customer Credit)</h1>
        <span className="text-sm text-slate-500">Total outstanding: <strong className="text-red-600">{formatPKR(total)}</strong></span>
      </div>
      <Card>
        <CardHeader title="Who owes the shop" sub="Credit sales are recorded here — never counted as cash until paid" />
        {owing.length === 0 ? <Empty text="No outstanding customer credit. Good." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2 text-right">Outstanding</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {owing.map((c) => (
                <tr key={String(c.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(c.name)}</td>
                  <td className="px-4 py-2">{String(c.phone || '—')}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-600">{formatPKR(Number(c.currentBalance))}</td>
                  <td className="px-4 py-2 text-right">
                    <Btn variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => setDetail(c)}>Collect / Statement</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {detail && <CustomerStatement customer={detail} onClose={() => setDetail(null)} onChanged={load} />}
      {toast.el}
    </div>
  );
}
