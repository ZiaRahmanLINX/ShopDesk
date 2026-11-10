# ShopDesk — Shop Management & Partnership Accounting

A complete, offline Windows desktop app for a small retail shop run by a
two-person partnership. Built with Electron, React + TypeScript, Tailwind,
Node, SQLite, Prisma and Zod. No internet needed, no monthly fee, your data
stays on your own computer.

## What it does

- **Point of Sale** — fast keyboard-friendly billing (F2 search, F9 complete,
  Esc clear), barcode entry, split payments (Cash / Bank / Easypaisa /
  JazzCash / Credit), change calculation, unique invoice numbers, reprints
  and audited refunds.
- **Inventory** — products with SKU/barcode, categories, minimum-stock
  alerts, damage/expiry adjustments, full movement history, FIFO stock
  costing (the oldest stock is sold first, so profit is always honest).
- **Purchases** — cash / credit / partial payments, supplier returns,
  funding source recorded for every purchase (business cash, partner capital,
  partner loan, supplier credit).
- **Customers & Udhaar** — credit sales ledger, collections, statements.
- **Suppliers** — payables ledger, payments, statements.
- **Cashbook** — cash, bank, Easypaisa, JazzCash and other accounts,
  transfers between accounts, daily cash count with shortage/overage.
- **Partnership** — capital and loans in **separate ledgers** (a loan is never
  confused with capital), withdrawals (never treated as expenses), business
  reserve, and profit distribution only after partner approval.
- **Monthly closing** — locks the month against silent edits, produces
  Profit & Loss, Balance Sheet, Cash Flow, inventory valuation and the
  distribution report. Corrections after closing are traceable adjustments
  only — nothing is silently rewritten or deleted.
- **Reports** — sales, products, purchases, expenses, cash flow and audit
  log, with PDF/CSV/Excel export and date filters.
- **Backup & Restore** — automatic daily backup (30-day retention), manual
  backup, USB export, integrity check and restore.
- **Invoices** — thermal 58mm / 80mm and A4, PDF export, preview, and
  configurable shop branding (name, address, phone, thank-you note).

## Accounting rules the app enforces

- Purchases increase inventory (an asset). They are **not** expenses — only
  the cost of goods actually sold (COGS) counts against profit.
- All money is stored in integer paisa. No floating-point rounding.
- Credit sales (Udhaar) are never counted as cash.
- Transfers between your own accounts are never income or expense.
- Partner withdrawals are never expenses.
- Profit is never distributed automatically — a partner must approve it.

## Install (Windows 10/11)

1. Download `ShopDesk-1.0.0-Portable.exe` from the Releases page (no install needed — just run it).
2. First run creates your database and loads demo data so you can try
   everything safely.
3. Demo logins: **admin / admin123** (full access) and
   **partner / partner123** (Working Partner: POS, inventory, purchases,
   expenses, customers, daily reports).

## First steps after install

1. Sign in as admin, go to **Settings** and change the shop name, address,
   phone and the demo passwords. Change the reserve percentage if you want
   a different share kept back before profit is distributed.
2. Go to **Partnership** and enter the two partners' real names and the
   agreed profit share (default 50/50).
3. In **Products**, delete the demo products and add your real stock — or
   record your first real purchase in **Purchases** (it adds the stock for
   you).
4. Take a backup from **Backup & Restore** once your real data is in.

## Updating without losing data

Your database lives in Windows at
`%APPDATA%\ShopDesk\shopdesk.db` — **not** inside the app folder. Installing
a newer ShopDesk version over the old one, or replacing the .exe, never
touches it. To be safe, take a backup from Backup & Restore before any
update, and keep a copy on a USB stick.

## Demo data (what the first run contains)

- Shop: "Naimat Kiryana Store", Dargah Road, Pir Jo Goth (change it in
  Settings — it is only an example).
- Partners: Capital Partner (Rs 300,000 invested) and Working Partner,
  50/50.
- 14 grocery products, 2 suppliers, 2 purchases (one cash, one part credit),
  6 sales (cash, Easypaisa and one credit), 3 expenses.
- To start clean instead: sign in as admin → **Backup & Restore** →
  restore is not needed; delete demo products/purchases from their pages,
  or delete `%APPDATA%\ShopDesk\shopdesk.db` while the app is closed and
  relaunch (a fresh demo database is created — then delete the demo rows).

## Running the checks

```bash
npm install --ignore-scripts   # then see "Prisma engine" note below
npm run typecheck              # TypeScript (renderer + main)
npm run test:scenarios         # scenarios A–I against the real services
npm run build                  # production build (renderer + main)
npm run dist:win               # Windows installer + portable .exe
                               # (on Windows: both. In this Linux sandbox
                               # only the portable target builds — the NSIS
                               # installer needs Wine, which isn't here.)
```

**Prisma engine note (sandbox only):** in this Linux sandbox the
`@prisma/engines` postinstall download is reset by the egress proxy. The
working route is `npm install --ignore-scripts`, then curl the engine
binaries into `~/.cache/prisma/` (see `AGENTS.md` in the home directory for
the exact recipe). On a normal Windows PC or Mac, plain `npm install`
works.

## Test results

See [TEST_RESULTS.md](TEST_RESULTS.md): all 42 checks in scenarios A–I
pass, typecheck is clean, the production build succeeds, and the app was
launched headlessly and driven through login to the dashboard (numbers
verified against the demo seed).

## Project layout

```
src/main/            Electron main process: DB, migrations, services, IPC
src/main/services/   catalog, purchases, sales, finance, partners, closing,
                     reports, backup, auth
src/renderer/        React UI (17 pages) + shared UI kit
src/shared/          Zod schemas, types, money formatting (paisa)
prisma/              schema + migrations
resources/migrations/  shipped SQL applied at first launch and on upgrade
tests/scenarios.ts   accounting scenarios A–I
docs/USER_GUIDE.md  plain-language guide for the shop owner
```

## License

Built for a single shop's own use. No warranty; keep backups.
