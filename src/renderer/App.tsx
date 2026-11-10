import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { Btn, Input, Field, useToast } from './components/ui';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Purchases from './pages/Purchases';
import Sales from './pages/Sales';
import Invoices from './pages/Invoices';
import Expenses from './pages/Expenses';
import Customers from './pages/Customers';
import Udhaar from './pages/Udhaar';
import Suppliers from './pages/Suppliers';
import Cashbook from './pages/Cashbook';
import Partnership from './pages/Partnership';
import ProfitLoss from './pages/ProfitLoss';
import Reports from './pages/Reports';
import Backup from './pages/Backup';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import Tutorial from './pages/Tutorial';

export type Page =
  | 'dashboard' | 'tutorial' | 'pos' | 'products' | 'inventory' | 'purchases' | 'sales'
  | 'invoices' | 'expenses' | 'customers' | 'udhaar' | 'suppliers' | 'cashbook'
  | 'partnership' | 'pl' | 'reports' | 'backup' | 'settings';

const NAV: { id: Page; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'tutorial', label: 'Tutorial', icon: '🎓' },
  { id: 'pos', label: 'Point of Sale', icon: '🧾' },
  { id: 'products', label: 'Products', icon: '📦' },
  { id: 'inventory', label: 'Inventory', icon: '🏷️' },
  { id: 'purchases', label: 'Purchases', icon: '🛒' },
  { id: 'sales', label: 'Sales', icon: '💰' },
  { id: 'invoices', label: 'Invoices', icon: '🧮' },
  { id: 'expenses', label: 'Expenses', icon: '💸' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'udhaar', label: 'Udhaar (Credit)', icon: '📒' },
  { id: 'suppliers', label: 'Suppliers', icon: '🏭' },
  { id: 'cashbook', label: 'Cashbook', icon: '🏦' },
  { id: 'partnership', label: 'Partnership', icon: '🤝' },
  { id: 'pl', label: 'Profit & Loss', icon: '📈' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'backup', label: 'Backup & Restore', icon: '💾', adminOnly: true },
  { id: 'settings', label: 'Settings', icon: '⚙️', adminOnly: true },
];

interface Session {
  id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'WORKING_PARTNER';
}

export default function App() {
  const [user, setUser] = useState<Session | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [dark, setDark] = useState(false);
  const [shopName, setShopName] = useState('ShopDesk');
  const [setup, setSetup] = useState<{ needsSetup: boolean; demoMode: boolean } | null>(null);
  const toast = useToast();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    api.setupStatus().then(setSetup).catch(() => setSetup({ needsSetup: false, demoMode: false }));
  }, []);

  useEffect(() => {
    api.settingsGet().then((s) => setShopName((s.shopName as string) || 'ShopDesk')).catch(() => undefined);
  }, [user]);

  if (!user) {
    if (setup === null) {
      return (
        <div className="flex h-full items-center justify-center bg-slate-100 dark:bg-slate-900">
          <p className="text-sm text-slate-400">Loading ShopDesk…</p>
        </div>
      );
    }
    if (setup.needsSetup) {
      return (
        <Setup
          onDone={(u) => {
            if (u === 'demo') {
              setSetup({ needsSetup: false, demoMode: true });
            } else {
              setUser(u);
              setPage('tutorial');
            }
          }}
        />
      );
    }
    return <Login demoMode={setup.demoMode} onLogin={setUser} />;
  }

  const visibleNav = NAV.filter((n) => !n.adminOnly || user.role === 'ADMIN');

  return (
    <div className="flex h-full bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-700">
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">ShopDesk</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{shopName}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {visibleNav.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                page === n.id
                  ? 'bg-blue-600 font-medium text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <span className="w-5 text-center">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{user.name}</p>
          <p className="text-[11px] text-slate-400">{user.role === 'ADMIN' ? 'Admin / Owner' : 'Working Partner'}</p>
          <div className="mt-2 flex gap-2">
            <Btn variant="secondary" className="flex-1 !px-2 !py-1 text-xs" onClick={() => setDark(!dark)}>
              {dark ? '☀️ Light' : '🌙 Dark'}
            </Btn>
            <Btn variant="ghost" className="flex-1 !px-2 !py-1 text-xs" onClick={() => { api.logout(); setUser(null); }}>
              Logout
            </Btn>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1 overflow-y-auto p-5">
        {page === 'dashboard' && <Dashboard go={setPage} />}
        {page === 'tutorial' && <Tutorial go={setPage} />}
        {page === 'pos' && <POS />}
        {page === 'products' && <Products />}
        {page === 'inventory' && <Inventory />}
        {page === 'purchases' && <Purchases />}
        {page === 'sales' && <Sales />}
        {page === 'invoices' && <Invoices />}
        {page === 'expenses' && <Expenses />}
        {page === 'customers' && <Customers />}
        {page === 'udhaar' && <Udhaar />}
        {page === 'suppliers' && <Suppliers />}
        {page === 'cashbook' && <Cashbook />}
        {page === 'partnership' && <Partnership isAdmin={user.role === 'ADMIN'} />}
        {page === 'pl' && <ProfitLoss />}
        {page === 'reports' && <Reports />}
        {page === 'backup' && <Backup />}
        {page === 'settings' && <Settings />}
      </main>
      {toast.el}
    </div>
  );
}

function Login({ onLogin, demoMode }: { onLogin: (u: Session) => void; demoMode: boolean }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const u = await api.login(username, password);
      onLogin(u);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 dark:bg-slate-900">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-2xl font-bold text-blue-700 dark:text-blue-400">ShopDesk</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Shop Management & Partnership Accounting</p>
        <div className="mt-5 space-y-3">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Btn type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
        </div>
        {demoMode && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Demo data: sign in with <b>admin / admin123</b> (owner) or <b>partner / partner123</b> (working partner).
            This is sample data for practice — change both passwords in Settings → Users before real use.
          </p>
        )}
        {!demoMode && (
          <p className="mt-4 text-center text-[11px] text-slate-400">Sign in with the account created during setup.</p>
        )}
      </form>
    </div>
  );
}
