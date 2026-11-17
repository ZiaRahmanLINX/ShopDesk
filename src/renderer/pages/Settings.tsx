// Settings — single owner edition. Shop details, the owner account
// (name + password change), and about. One login only.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Btn, Card, CardHeader, Field, Input, Select, useToast } from '../components/ui';

export default function Settings() {
  const [shop, setShop] = useState({ shopName: '', shopAddress: '', shopPhone: '', shopEmail: '', thankYouNote: '', thermalWidth: '80' as '58' | '80' });
  const [owner, setOwner] = useState<Record<string, unknown> | null>(null);
  const [pw, setPw] = useState({ old: '', next: '', confirm: '' });
  const toast = useToast();

  const load = () => {
    api.settingsGet().then((s) => setShop({
      shopName: String(s.shopName || ''),
      shopAddress: String(s.shopAddress || ''),
      shopPhone: String(s.shopPhone || ''),
      shopEmail: String(s.shopEmail || ''),
      thankYouNote: String(s.thankYouNote || ''),
      thermalWidth: (s.thermalWidth as '58' | '80') || '80',
    })).catch(() => undefined);
    api.listUsers().then((u) => setOwner(u[0] || null)).catch(() => undefined);
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

  const changePassword = async () => {
    if (!owner) { toast.show('Owner account not found', 'err'); return; }
    if (pw.next.length < 6) { toast.show('New password must be at least 6 characters', 'err'); return; }
    if (pw.next !== pw.confirm) { toast.show('New passwords do not match', 'err'); return; }
    try {
      await api.changePassword({ userId: String(owner.id), oldPassword: pw.old, newPassword: pw.next });
      setPw({ old: '', next: '', confirm: '' });
      toast.show('Password changed');
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
        </div>
        <div className="flex justify-end px-4 pb-4"><Btn onClick={saveShop}>Save shop settings</Btn></div>
      </Card>

      <Card>
        <CardHeader title="Owner account" sub="There is one login — yours. It has full access to everything." />
        <div className="space-y-3 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Owner</span>
            <strong>{owner ? `${String(owner.name)} (${String(owner.username)})` : '—'}</strong>
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Change password</p>
          <Field label="Current password">
            <Input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="New password (6+ characters)">
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <Field label="Repeat new password">
              <Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end"><Btn onClick={changePassword}>Change password</Btn></div>
        </div>
      </Card>

      <Card>
        <CardHeader title="About ShopDesk Owner" sub="Version 1.0.0 — offline-first, local SQLite database" />
        <div className="space-y-1 p-4 text-sm text-slate-500">
          <p>Money is stored in integer paisa — never floating point. Stock cost uses FIFO lots, so historical purchase prices are never rewritten.</p>
          <p>Your database lives in the app's user data folder and is backed up daily (Backup & Restore). Closing a month locks it against silent changes.</p>
        </div>
      </Card>
      {toast.el}
    </div>
  );
}
