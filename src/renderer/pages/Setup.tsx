// First-run Setup Wizard. Shown instead of the login screen when the
// database has no users yet. One path only: clean setup — shop details,
// then your owner account. There is no demo data; the owner creates their
// own account. Single owner throughout.
import { useState } from 'react';
import { api } from '../lib/api';
import { Btn, Input, Field } from '../components/ui';

interface Session {
  id: string;
  name: string;
  username: string;
}

export default function Setup({ onDone }: { onDone: (u: Session) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Step 1 — shop
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');

  // Step 2 — owner account
  const [ownerName, setOwnerName] = useState('');
  const [ownerUser, setOwnerUser] = useState('admin');
  const [ownerPass, setOwnerPass] = useState('');
  const [ownerPass2, setOwnerPass2] = useState('');

  const validStep1 = () => {
    if (!shopName.trim()) return 'Give your shop a name.';
    return '';
  };

  const validStep2 = () => {
    if (!ownerName.trim()) return 'Enter your name.';
    if (!ownerUser.trim()) return 'Choose a username.';
    if (ownerPass.length < 6) return 'Password must be at least 6 characters.';
    if (ownerPass !== ownerPass2) return 'Passwords do not match.';
    return '';
  };

  const next = () => {
    setErr('');
    const problem = validStep1();
    if (problem) {
      setErr(problem);
      return;
    }
    setStep(2);
  };

  const finish = async () => {
    const problem = validStep2();
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await api.setupComplete({
        shopName: shopName.trim(),
        shopAddress: shopAddress.trim(),
        shopPhone: shopPhone.trim(),
        owner: { name: ownerName.trim(), username: ownerUser.trim(), password: ownerPass },
      });
      const user = await api.login(ownerUser.trim(), ownerPass);
      onDone(user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  };

  const stepsLabel = ['Your shop', 'Your owner account'][step - 1];

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 p-4 dark:bg-slate-900">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-2xl font-bold text-blue-700 dark:text-blue-400">Welcome to ShopDesk Owner</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set up your own shop in about a minute.
        </p>
        <p className="mt-3 text-xs font-medium text-slate-400">
          Step {step} of 2 — {stepsLabel}
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
          </div>
        )}

        {step === 2 && (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Owner login — full access to everything. There is only one login: yours.</p>
            <Field label="Your name *">
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Ahmed Raza" autoFocus />
            </Field>
            <Field label="Username *">
              <Input value={ownerUser} onChange={(e) => setOwnerUser(e.target.value)} />
            </Field>
            <Field label="Password * (6+ characters)">
              <Input type="password" value={ownerPass} onChange={(e) => setOwnerPass(e.target.value)} />
            </Field>
            <Field label="Repeat password *">
              <Input type="password" value={ownerPass2} onChange={(e) => setOwnerPass2(e.target.value)} />
            </Field>
          </div>
        )}

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

        <div className="mt-5 flex gap-2">
          {step > 1 && (
            <Btn variant="secondary" onClick={() => { setErr(''); setStep(1); }} disabled={busy}>
              Back
            </Btn>
          )}
          {step < 2 ? (
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
