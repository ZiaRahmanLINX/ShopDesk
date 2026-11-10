import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Btn, Card, CardHeader, Field, Input, Select, useToast } from '../components/ui';

export default function Settings() {
  const [shop, setShop] = useState({ shopName: '', shopAddress: '', shopPhone: '', shopEmail: '', thankYouNote: '', reservePct: 0, thermalWidth: '80' as '58' | '80' });
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'WORKING_PARTNER' as 'ADMIN' | 'WORKING_PARTNER' });
  const [pw, setPw] = useState({ old: '', next: '', confirm: '' });
  const toast = useToast();

  const load = () => {
    api.settingsGet().then((s) => setShop({
      shopName: String(s.shopName || ''),
      shopAddress: String(s.shopAddress || ''),
      shopPhone: String(s.shopPhone || ''),
      shopEmail: String(s.shopEmail || ''),
      thankYouNote: String(s.thankYouNote || ''),
      reservePct: Number(s.reservePct || 0),
      thermalWidth: (s.thermalWidth as '58' | '80') || '80',
    })).catch(() => undefined);
    api.listUsers().then(setUsers).catch(() => undefined);
  };
  useEffect(load, []);

  const saveShop = async () => {
    try {
      await api.settingsSave({ ...shop, currency: 'PKR' });
      toast.show('Shop settings saved');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Save failed', 'err');
    }
  };

  const addUser = async () => {
    if (!newUser.name.trim() || !newUser.username.trim() || newUser.password.length < 6) {
      toast.show('Name, username and a password of 6+ characters are required', 'err');
      return;
    }
    try {
      await api.createUser(newUser);
      setNewUser({ name: '', username: '', password: '', role: 'WORKING_PARTNER' });
      load();
      toast.show('User created');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Failed', 'err');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <CardHeader title="Shop & branding" sub="Shown on every invoice and receipt" />
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Shop name"><Input value={shop.shopName} onChange={(e) => setShop({ ...shop, shopName: e.target.value })} /></Field>
          <Field label="Phone"><Input value={shop.shopPhone} onChange={(e) => setShop({ ...shop, shopPhone: e.target.value })} /></Field>
          <Field label="Address"><Input value={shop.shopAddress} onChange={(e) => setShop({ ...shop, shopAddress: e.target.value })} /></Field>
          <Field label="Email (optional)"><Input value={shop.shopEmail} onChange={(e) => setShop({ ...shop, shopEmail: e.target.value })} /></Field>
          <Field label="Thank-you message"><Input value={shop.thankYouNote} onChange={(e) => setShop({ ...shop, thankYouNote: e.target.value })} /></Field>
          <Field label="Default thermal receipt width">
            <Select value={shop.thermalWidth} onChange={(e) => setShop({ ...shop, thermalWidth: e.target.value as '58' | '80' })}>
              <option value="58">58mm</option>
              <option value="80">80mm</option>
            </Select>
          </Field>
          <Field label="Default business reserve (%)" hint="Applied to each month's net profit at closing. 0 = no reserve.">
            <Input type="number" min={0} max={100} value={shop.reservePct} onChange={(e) => setShop({ ...shop, reservePct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
          </Field>
        </div>
        <div className="flex justify-end px-4 pb-4"><Btn onClick={saveShop}>Save shop settings</Btn></div>
      </Card>

      <Card>
        <CardHeader title="Users & roles" sub="Admin: full access, approves distributions, backup/restore. Working Partner: POS, inventory, purchases, expenses, customers, daily reports." />
        <div className="p-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Name</th><th className="py-1">Username</th><th className="py-1">Role</th><th className="py-1">Active</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={String(u.id)} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 font-medium">{String(u.name)}</td>
                  <td className="py-2">{String(u.username)}</td>
                  <td className="py-2">{String(u.role)}</td>
                  <td className="py-2">{u.isActive ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <Input placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <Input placeholder="Username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
            <Input placeholder="Password (6+ chars)" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <div className="flex gap-2">
              <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as never })}>
                <option value="WORKING_PARTNER">Working Partner</option>
                <option value="ADMIN">Admin / Owner</option>
              </Select>
              <Btn onClick={addUser}>Add user</Btn>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="About ShopDesk" sub="Version 1.1.2 — offline-first, local SQLite database" />
        <div className="space-y-1 p-4 text-sm text-slate-500">
          <p>Money is stored in integer paisa — never floating point. Stock cost uses FIFO lots, so historical purchase prices are never rewritten.</p>
          <p>Your database lives in the app's user data folder and is backed up daily (Backup & Restore). Closing a month locks it against silent changes.</p>
        </div>
      </Card>
      {toast.el}
    </div>
  );
}
