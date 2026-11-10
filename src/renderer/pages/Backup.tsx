import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Btn, Card, CardHeader, useToast, Empty, Confirm } from '../components/ui';

export default function Backup() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [restore, setRestore] = useState<Record<string, unknown> | null>(null);
  const [verifying, setVerifying] = useState<string>('');
  const toast = useToast();

  const load = () => api.backupList().then(setList).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const manual = async () => {
    try {
      const p = await api.backupCreate('manual');
      toast.show(`Backup saved: ${p}`);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Backup failed', 'err');
    }
  };

  const exportTo = async () => {
    try {
      const p = await api.backupExport();
      if (p) toast.show(`Backup exported to ${p}`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Export failed', 'err');
    }
  };

  const verify = async (b: Record<string, unknown>) => {
    setVerifying(String(b.path));
    try {
      const r = await api.backupVerify(String(b.path)) as { ok: boolean; detail: string };
      toast.show(r.ok ? `Verified: ${r.detail}` : `Verification FAILED: ${r.detail}`, r.ok ? 'ok' : 'err');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Verify failed', 'err');
    } finally {
      setVerifying('');
    }
  };

  const doRestore = async () => {
    if (!restore) return;
    try {
      await api.backupRestore(String(restore.path));
      toast.show('Backup restored — the app will now restart. Please reopen ShopDesk.');
      setRestore(null);
      window.setTimeout(() => window.close(), 1500);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Restore failed', 'err');
    }
  };

  const pickFile = async () => {
    try {
      const p = await api.backupPickFile();
      if (p) setRestore({ path: p, name: p.split(/[\\/]/).pop() });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Failed', 'err');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Backup & Restore</h1>
      <Card>
        <CardHeader title="Automatic daily backup" sub="One backup per day is created automatically when the app opens. The last 30 days are kept." />
        <div className="flex flex-wrap gap-2 p-4">
          <Btn onClick={manual}>Create backup now</Btn>
          <Btn variant="secondary" onClick={exportTo}>Export backup to USB / folder…</Btn>
          <Btn variant="secondary" onClick={pickFile}>Restore from a file…</Btn>
        </div>
      </Card>

      <Card>
        <CardHeader title="Saved backups" sub="Verify before restoring. Restoring replaces the current database (a pre-restore copy is kept)." />
        {list.length === 0 ? <Empty text="No backups yet — create one above." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="px-4 py-2">File</th><th className="px-4 py-2">Modified</th><th className="px-4 py-2 text-right">Size</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={String(b.path)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium">{String(b.name)}</td>
                  <td className="px-4 py-2">{new Date(String(b.modified)).toLocaleString('en-GB')}</td>
                  <td className="px-4 py-2 text-right">{(Number(b.size) / 1024).toFixed(0)} KB</td>
                  <td className="px-4 py-2 text-right">
                    <button className="mr-3 text-blue-600" disabled={verifying === String(b.path)} onClick={() => verify(b)}>
                      {verifying === String(b.path) ? 'Verifying…' : 'Verify'}
                    </button>
                    <button className="text-red-600" onClick={() => setRestore(b)}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {restore && (
        <Confirm
          title="Restore this backup?"
          message={`This replaces the current database with ${String(restore.name)}. A copy of the current database is kept first. The app will restart afterwards. Are you sure?`}
          confirmLabel="Restore backup"
          onConfirm={doRestore}
          onCancel={() => setRestore(null)}
        />
      )}
      {toast.el}
    </div>
  );
}
