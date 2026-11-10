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

1. Download `ShopDesk-1.1.2-Portable.exe` from the Releases page (no install needed — just run it).
2. First run shows the setup screen: enter your shop name, partners and
   your own logins. Every user creates their own account — there is no
   demo data and no shared password.

## First steps after install

1. On first run, choose **Set up my shop** and follow the three steps
   (shop details, partners and profit shares, your logins).
2. After setup, the app opens on the **Tutorial** page — eight steps that
   walk you through your first week. You can open it any time from the
   sidebar.
3. Add your products in **Products**, or record your first real purchase
   in **Purchases** (it adds the stock for you).
4. Take a backup from **Backup & Restore** once your real data is in.

## Updating without losing data

Your database lives in Windows at
`%APPDATA%\ShopDesk\shopdesk.db` — **not** inside the app folder. Installing
a newer ShopDesk version over the old one, or replacing the .exe, never
touches it. To be safe, take a backup from Backup & Restore before any
update, and keep a copy on a USB stick.

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

See [TEST_RESULTS.md](TEST_RESULTS.md): all 42 checks in scenarios A–I
pass, typecheck is clean, the production build succeeds, and the app was
launched headlessly and driven through setup, login and the dashboard
(numbers verified against the test shop data).

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
