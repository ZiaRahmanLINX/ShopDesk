// Tutorial — the first-week guide for a new user. Each step opens the
// page it talks about, so you learn by doing.
import { Btn, Card, CardHeader } from '../components/ui';
import type { Page } from '../App';

const STEPS: { title: string; text: string; page: Page; cta: string }[] = [
  {
    title: '1. Your shop is set up',
    text: 'You already did this on the first screen: shop name, partners and logins. To change any of it later — shop name, address, phone, reserve percentage, or to add another user — open Settings.',
    page: 'settings',
    cta: 'Open Settings',
  },
  {
    title: '2. Add your products',
    text: 'Open Products and add what you sell: name, SKU, buying price, selling price and unit (kg, litre, piece…). Start with your 10–20 fastest-selling items; you can add the rest any time. Set a minimum quantity and ShopDesk will warn you when stock runs low.',
    page: 'products',
    cta: 'Open Products',
  },
  {
    title: '3. Record your first purchase',
    text: 'Open Purchases → New Purchase. Pick the supplier, add the items with their buying cost, and say how it was paid — full, part payment, or full credit. Also pick the funding source: business cash, partner capital, partner loan, or supplier credit. Buying stock is not an expense — stock is an asset, and only the cost of what you actually sell counts against profit.',
    page: 'purchases',
    cta: 'Open Purchases',
  },
  {
    title: '4. Make your first sale',
    text: 'Open Point of Sale. Type a product name or SKU (or scan a barcode), press Enter to add it, and press F9 to take payment. The customer can pay cash, bank, Easypaisa, JazzCash — or on credit (Udhaar), in which case pick the customer first. F2 jumps back to search, Esc clears the bill.',
    page: 'pos',
    cta: 'Open Point of Sale',
  },
  {
    title: '5. Record an expense',
    text: 'Open Expenses whenever the shop spends money that is not stock: rent, electricity, transport, tea. Pick a category and how it was paid. Expenses reduce profit the month they happen — unlike purchases, which only count as cost when the stock is sold.',
    page: 'expenses',
    cta: 'Open Expenses',
  },
  {
    title: '6. Check your profit',
    text: 'Open Profit & Loss any time to see the month so far: sales, minus the cost of goods sold, minus expenses, equals net profit. It also shows what is still owed to you (customers) and what you still owe (suppliers).',
    page: 'pl',
    cta: 'Open Profit & Loss',
  },
  {
    title: '7. Close the month',
    text: 'At the end of the month, open Partnership and close the month. Closing locks that month against silent changes — later corrections are recorded as adjustments, so the numbers can never be quietly rewritten. After closing, the profit can be distributed between partners (only after approval — never automatically).',
    page: 'partnership',
    cta: 'Open Partnership',
  },
  {
    title: '8. Back up your data',
    text: 'Open Backup & Restore. ShopDesk already backs up automatically once a day and keeps 30 days of backups. Take a manual backup before any big change, and keep a copy on a USB stick — your database lives on this computer, so a backup is your safety net.',
    page: 'backup',
    cta: 'Open Backup & Restore',
  },
];

export default function Tutorial({ go }: { go: (p: Page) => void }) {
  return (
    <div className="space-y-4">
      <CardHeader
        title="Tutorial — your first week with ShopDesk"
        sub="Eight short steps, in the order you will actually do them. Each one opens the page it talks about, so you learn by doing."
      />
      {STEPS.map((s) => (
        <Card key={s.title}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{s.text}</p>
            </div>
            <Btn variant="secondary" className="shrink-0" onClick={() => go(s.page)}>
              {s.cta}
            </Btn>
          </div>
        </Card>
      ))}
      <Card>
        <p className="font-semibold">Want to practise first?</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Take a backup first (Backup page), try things freely, and restore the backup afterwards to undo
          everything. That is the safe way to practise on your real shop data.
        </p>
      </Card>
    </div>
  );
}
