// First-run Setup Wizard. Shown instead of the login screen when the
// database has no users yet. One path only: clean setup — shop details,
// partners, your own logins. There is no demo data; every user creates
// their own account.
import { useState } from 'react';
import { api } from '../lib/api';
import { Btn, Input, Field, Select } from '../components/ui';

interface Session {
  id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'WORKING_PARTNER';
}

type PartnerForm = { name: string; type: 'CAPITAL' | 'WORKING'; share: number };

export default function Setup({ onDone }: { onDone: (u: Session) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Step 1 — shop
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [reservePct, setReservePct] = useState('0');

  // Step 2 — partners
  const [twoPartners, setTwoPartners] = useState(true);
  const [p1, setP1] = useState<PartnerForm>({ name: '', type: 'CAPITAL', share: 50 });
  const [p2, setP2] = useState<PartnerForm>({ name: '', type: 'WORKING', share: 50 });

  // Step 3 — accounts
  const [adminName, setAdminName] = useState('');
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPass, setAdminPass] = useState('');
  const [adminPass2, setAdminPass2] = useState('');
  const [addPartnerLogin, setAddPartnerLogin] = useState(true);
  const [partnerName, setPartnerName] = useState('');
  const [partnerUser, setPartnerUser] = useState('partner');
  const [partnerPass, setPartnerPass] = useState('');
  const [partnerPass2, setPartnerPass2] = useState('');

  const toggleTwoPartners = (on: boolean) => {
    setTwoPartners(on);
    if (on) {
      setP1({ ...p1, share: 50 });
      setP2({ ...p2, share: 50 });
    } else {
      setP1({ ...p1, share: 100 });
    }
  };

  const validStep1 = () => {
    if (!shopName.trim()) return 'Give your shop a name.';
    const r = Number(reservePct);
    if (!Number.isInteger(r) || r < 0 || r > 100) return 'Reserve must be a whole number from 0 to 100.';
    return '';
  };

  const validStep2 = () => {
    if (!p1.name.trim()) return 'Enter the first partner’s name.';
    if (twoPartners) {
      if (!p2.name.trim()) return 'Enter the second partner’s name.';
      if (p1.share + p2.share !== 100) return 'The two profit shares must add up to 100%.';
    }
    return '';
  };

  const validStep3 = () => {
    if (!adminName.trim()) return 'Enter your name.';
    if (!adminUser.trim()) return 'Choose an admin username.';
    if (adminPass.length < 6) return 'Admin password must be at least 6 characters.';
    if (adminPass !== adminPass2) return 'Admin passwords do not match.';
    if (addPartnerLogin) {
      if (!partnerName.trim()) return 'Enter the working partner’s name.';
      if (!partnerUser.trim()) return 'Choose a username for the working partner.';
      if (partnerPass.length < 6) return 'Partner password must be at least 6 characters.';
      if (partnerPass !== partnerPass2) return 'Partner passwords do not match.';
      if (partnerUser.trim() === adminUser.trim()) return 'The two usernames must be different.';
    }
    return '';
  };

  const next = () => {
    setErr('');
    const problem = step === 1 ? validStep1() : step === 2 ? validStep2() : '';
    if (problem) {
      setErr(problem);
      return;
    }
    setStep((step + 1) as 1 | 2 | 3);
  };

  const finish = async () => {
    const problem = validStep3();
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const partners = twoPartners
        ? [
            { name: p1.name.trim(), type: p1.type, profitSharePct: p1.share },
            { name: p2.name.trim(), type: p2.type, profitSharePct: p2.share },
          ]
        : [{ name: p1.name.trim(), type: p1.type, profitSharePct: 100 }];
      await api.setupComplete({
        shopName: shopName.trim(),
        shopAddress: shopAddress.trim(),
        shopPhone: shopPhone.trim(),
        reservePct: Number(reservePct),
        partners,
        admin: { name: adminName.trim(), username: adminUser.trim(), password: adminPass },
        partnerUser: addPartnerLogin
          ? { name: partnerName.trim(), username: partnerUser.trim(), password: partnerPass }
          : null,
      });
      const user = await api.login(adminUser.trim(), adminPass);
      onDone(user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  };

  const stepsLabel = ['Your shop', 'Partners', 'Your logins'][step - 1];

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 p-4 dark:bg-slate-900">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-2xl font-bold text-blue-700 dark:text-blue-400">Welcome to ShopDesk</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set up your own shop in about a minute.
        </p>
        <p className="mt-3 text-xs font-medium text-slate-400">
          Step {step} of 3 — {stepsLabel}
        </p>

        {step === 1 && (
          <div className="mt-5 space-y-3">
            <Field label="Shop name *">
              <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Ahmed Kiryana Store" autoFocus />
            </Field>
            <Field label="Address">
              <Input value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="Street, area, city" />
            </Field>
            <Field label="Phone">
              <Input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder="03xx-xxxxxxx" />
            </Field>
            <Field label="Reserve before profit sharing (%)" hint="Profit kept back in the business reserve before partners are paid. 0 means distribute everything. You can change this later in Settings.">
              <Input type="number" min={0} max={100} value={reservePct} onChange={(e) => setReservePct(e.target.value)} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="mt-5 space-y-3">
            <Field label="Partner 1 — name *">
              <Input value={p1.name} onChange={(e) => setP1({ ...p1, name: e.target.value })} placeholder="e.g. Ahmed Raza" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Partner 1 — role">
                <Select value={p1.type} onChange={(e) => setP1({ ...p1, type: e.target.value as 'CAPITAL' | 'WORKING' })}>
                  <option value="CAPITAL">Capital partner (invested money)</option>
                  <option value="WORKING">Working partner (runs the shop)</option>
                </Select>
              </Field>
              <Field label="Profit share (%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={p1.share}
                  disabled={!twoPartners}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    setP1({ ...p1, share: v });
                    if (twoPartners) setP2({ ...p2, share: 100 - v });
                  }}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={twoPartners} onChange={(e) => toggleTwoPartners(e.target.checked)} />
              Two partners (uncheck if you run the shop alone)
            </label>
            {twoPartners && (
              <>
                <Field label="Partner 2 — name *">
                  <Input value={p2.name} onChange={(e) => setP2({ ...p2, name: e.target.value })} placeholder="e.g. Bilal Ahmed" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Partner 2 — role">
                    <Select value={p2.type} onChange={(e) => setP2({ ...p2, type: e.target.value as 'CAPITAL' | 'WORKING' })}>
                      <option value="WORKING">Working partner (runs the shop)</option>
                      <option value="CAPITAL">Capital partner (invested money)</option>
                    </Select>
                  </Field>
                  <Field label="Profit share (%)">
                    <Input type="number" min={0} max={100} value={p2.share} onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setP2({ ...p2, share: v });
                      setP1({ ...p1, share: 100 - v });
                    }} />
                  </Field>
                </div>
                <p className="text-xs text-slate-400">Shares must add up to 100% — changing one adjusts the other.</p>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Owner / admin login — full access to everything.</p>
            <Field label="Your name *">
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="e.g. Ahmed Raza" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Admin username *">
                <Input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} />
              </Field>
              <Field label="Admin password * (6+ characters)">
                <Input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} />
              </Field>
            </div>
            <Field label="Repeat admin password *">
              <Input type="password" value={adminPass2} onChange={(e) => setAdminPass2(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={addPartnerLogin} onChange={(e) => setAddPartnerLogin(e.target.checked)} />
              Add a second login for the working partner (POS, stock, purchases — no settings or closing)
            </label>
            {addPartnerLogin && (
              <>
                <Field label="Working partner’s name *">
                  <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="e.g. Bilal Ahmed" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Partner username *">
                    <Input value={partnerUser} onChange={(e) => setPartnerUser(e.target.value)} />
                  </Field>
                  <Field label="Partner password * (6+ characters)">
                    <Input type="password" value={partnerPass} onChange={(e) => setPartnerPass(e.target.value)} />
                  </Field>
                </div>
                <Field label="Repeat partner password *">
                  <Input type="password" value={partnerPass2} onChange={(e) => setPartnerPass2(e.target.value)} />
                </Field>
              </>
            )}
          </div>
        )}

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

        <div className="mt-5 flex gap-2">
          {step > 1 && (
            <Btn variant="secondary" onClick={() => { setErr(''); setStep((step - 1) as 1 | 2); }} disabled={busy}>
              Back
            </Btn>
          )}
          {step < 3 ? (
            <Btn className="flex-1" onClick={next} disabled={busy}>Continue</Btn>
          ) : (
            <Btn className="flex-1" onClick={finish} disabled={busy}>{busy ? 'Setting up…' : 'Finish setup'}</Btn>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">
          Your data stays on your own computer. Nothing is uploaded anywhere.
        </p>
      </div>
    </div>
  );
}
