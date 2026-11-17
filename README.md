# ShopDesk Owner — Single-Owner Shop Management

A complete, offline Windows desktop app for a small retail shop run by a
single owner. Built with Electron, React + TypeScript, Tailwind,
Node, SQLite, Prisma and Zod. No internet needed, no monthly fee, your data
stays on your own computer. All amounts are in Pakistani Rupees (Rs).

## What it does

- **Point of Sale** — fast keyboard-friendly billing (F2 search, F9 complete,
  Esc clear), barcode entry, split payments (Cash / Bank / Easypaisa /
  JazzCash / Credit), change calculation, unique invoice numbers, reprints
  and audited refunds.
- **Inventory** — products with SKU/barcode, categories, minimum-stock
  alerts, damage/expiry adjustments, full movement history, FIFO stock
  costing (the oldest stock is sold first, so profit is always honest).
- **Purchases** — cash / credit / partial payments, supplier returns,
  funding source recorded for every purchase (business cash or supplier
  credit).
- **Customers & Udhaar** — credit sales ledger, collections, statements.
- **Suppliers** — payables ledger, payments, statements.
- **Cashbook** — cash, bank, Easypaisa, JazzCash and other accounts,
  transfers between accounts, daily cash count with shortage/overage.
- **Owner** — your capital in (initial or additional) and your drawings
  out, with totals. Drawings are personal money — never treated as
  expenses and never reducing profit.
- **Monthly closing** — locks the month against silent edits, produces
  Profit & Loss, Balance Sheet, Cash Flow and inventory valuation. The
  month's net profit stays in the business as retained earnings.
  Corrections after closing are traceable adjustments only — nothing is
  silently rewritten or deleted.
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
- Owner drawings are never expenses.
- Profit is never split or paid out automatically — net profit stays in
  the business as retained earnings.

## Install (Windows 10/11)

1. Download `ShopDesk Owner-1.0.0-Portable.exe` from the Releases page (no install needed — just run it).
2. First run shows the setup screen: enter your shop name, then create
   your owner account. Every owner creates their own account — there is no
   demo data and no shared password.

## First steps after install

1. On first run, choose **Set up my shop** and follow the two steps
   (shop details, your owner account).
2. After setup, the app opens on the **Tutorial** page — eight steps that
   walk you through your first week. You can open it any time from the
   sidebar.
3. Add your products in **Products**, or record your first real purchase
   in **Purchases** (it adds the stock for you).
4. Take a backup from **Backup & Restore** once your real data is in.

## Updating without losing data

Your database lives in the app's user data folder — **not** inside the app
folder. Installing a newer ShopDesk Owner version over the old one, or
replacing the .exe, never touches it. To be safe, take a backup from
Backup & Restore before any update, and keep a copy on a USB stick.

## Running the checks

```bash
npm install --ignore-scripts   # then see "Prisma engine" note below
npm run typecheck              # TypeScript (renderer + main)
npm run test:scenarios         # scenarios A–I against the real services
npm run test:setup             # first-run setup: clean setup, refusals
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

See [TEST_RESULTS.md](TEST_RESULTS.md) for the last full run of the
checks above against the app.

## Project layout

```
src/main/            Electron main process: DB, migrations, services, IPC
src/main/services/   catalog, purchases, sales, finance, owner, closing,
                     reports, backup, auth
src/renderer/        React UI + shared UI kit
src/shared/          Zod schemas, types, money formatting (paisa)
prisma/              schema + migrations
resources/migrations/  shipped SQL applied at first launch and on upgrade
tests/scenarios.ts   accounting scenarios A–I
docs/USER_GUIDE.md  plain-language guide for the shop owner
```

## License

Built for a single shop's own use. No warranty; keep backups.
