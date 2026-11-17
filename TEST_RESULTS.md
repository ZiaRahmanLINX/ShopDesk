# ShopDesk Owner — Test Results (single-owner edition)

Run on 2026-11-17 in the Linux build sandbox, branch `single-owner`.
All amounts in Rs (paisa in code). This edition has one owner, no partners,
no reserve, no profit split — profit stays in the business as retained
earnings. The partnership edition's results live on `main`.

## 1. Accounting scenarios (`npm run test:scenarios`)

47 checks, **all passed**. The script (`tests/scenarios.ts`) runs the real
service layer against a throwaway SQLite database.

| Scenario | What was checked | Result |
|---|---|---|
| A — owner invests Rs 300,000 | Cash 300,000; owner capital 300,000 (INITIAL) | PASS |
| B — buy Rs 200,000 inventory | Cash 100,000; inventory value 200,000; purchase is NOT an expense (expenses still 0) | PASS |
| C — Rs 30,000 cash sales + Rs 5,000 credit | Cash 130,000; customer outstanding 5,000; gross profit 16,000; COGS 19,000 (FIFO) | PASS |
| D — urgent stock Rs 15,000 mid-month | Cash 115,000; inventory 196,000; net profit unchanged by the purchase (16,000 before and after) | PASS |
| E — additional capital Rs 20,000 | Cash 135,000; owner capital 320,000 | PASS |
| F — owner drawing Rs 10,000 | Cash down, drawings 10,000; expenses still 0; capital unchanged; drawing above the cash balance is rejected | PASS |
| G — rent 8,000 + electricity 2,000 | Cash 135,000; total expenses 10,000 | PASS |
| H — customer pays Rs 2,000 | Cash 137,000; customer outstanding 3,000 | PASS |
| I — close month | Net profit 6,000; no reserve/distribution rows exist; balance-sheet equity = owner capital 320,000; retained earnings = net profit − drawings = −4,000; second close rejected; new sale in locked month rejected | PASS |
| Cross-checks | Purchase cash-outs total 215,000 (200,000 + 15,000, no double count); supplier payable 0; item quantities X 900 / Y 440 / Z 160; dashboard cash 117,000, customer outstanding 3,000, inventory value 196,000; cashbook OWNER_CAPITAL ins 320,000, OWNER_DRAWING outs 10,000 | PASS |

Note on I: retained earnings is the balance-sheet balancing figure
(assets − liabilities − equity). Drawings reduce cash without reducing
equity, so they land in retained earnings: 6,000 profit − 10,000 drawings
= −4,000. That is correct single-owner bookkeeping, not a bug.

## 2. Setup (`npm run test:setup`) — 18/18 PASS

One user (the owner), no `role` column, all 6 partner tables absent, shop
name saved, 4 cash accounts, 11 expense categories, 7 product categories,
0 products/sales, meta `setupCompleted` true, `demo` false, owner login
works with no role in the session, second setup refused, password under
6 characters rejected.

## 3. Migrations (`npm run test:migrations`) — 21/21 PASS

`runMigrations` applies 0001 + 0002 + 0003 in order and is idempotent.
Fresh DB reports needsSetup; clean-setup owner login works. A populated
v1.1.2 database (2 partners, capital/loan/withdrawal rows, a closed month
with reserve/distribution rows, a partner-funded purchase, a lot tied to
that purchase) migrates with its business data intact: partner tables
gone, closing row kept with netProfit intact, purchase re-pointed to
BUSINESS_CASH, legacy lot kept with its purchaseId, partnership columns
dropped. A lot with a null `purchaseId` (opening stock) can be created.

## 4. Typecheck (`npm run typecheck`)

Clean — renderer (`tsconfig.json`) and main process
(`tsconfig.node.json`) both pass with no errors.

## 5. Production build (`npm run build`)

Clean. Prisma Client generated (v6.19.3), Vite renderer built (469
modules, ~1.0 MB JS), main process compiled to `dist-electron`.

## 6. Launch smoke test (headless, Xvfb) — 13/13 PASS

The built app was launched under Xvfb with a fresh user-data dir and
driven through the real UI via CDP (`scripts/e2e-owner.mjs`):

- Setup wizard appears ("Welcome to ShopDesk Owner", no partner wording);
  2 steps (shop + owner account) complete and the app auto-logs in.
- Product "Smoke Tea" added (Rs 100 cost / Rs 150 price, opening qty 10)
  and listed; POS cash sale of 1 × Rs 150 completes with an invoice.
- Owner page renders (Total capital in / Total drawings out / Net owner
  balance, all Rs 0.00) with no partner wording.
- Month Close preview shows the sale (net sales Rs 150, COGS Rs 100,
  gross profit Rs 50, net profit Rs 50 retained in the business, cash
  Rs 150, closing inventory Rs 900); closing 2026-11 locks it — the
  Closed months table lists 2026-11 as Locked, toast "Month 2026-11
  closed and locked". No reserve/distribution wording anywhere.
- No console errors or exceptions. Screenshot:
  `/tmp/shopdesk-owner-monthclose.png` (kept in the sandbox only).

### Bug found by this test and fixed: fake `purchaseId` on stock lots

`createProduct` (opening stock), stock adjustment, and sale refunds all
created `PurchaseLot` rows with literal fake ids (`'OPENING'`,
`'ADJUSTMENT'`, `'REFUND'`). `PurchaseLot.purchaseId` has a foreign key
to `Purchase`, so with FK enforcement on, adding a product with opening
stock crashed with a foreign-key violation. **This bug pre-existed in
v1.1.2** (same literals in the partnership code) — it was never caught
because tests and the old e2e never added a product with opening stock.

Fix (migration 0003): `PurchaseLot.purchaseId` is now nullable; the
three call sites write `null`; the migration recreates the table and
re-points any legacy fake ids to NULL. `prisma migrate diff` against the
schema is empty after the fix.

## 7. Windows packaging (`npm run dist:win`) — not run on this branch

Same sandbox limit as `main`: the NSIS installer cannot be built here
(no Wine; `spawn wine ENOENT`), and a failed NSIS run leaves a 334 KB
stub Setup.exe with no payload — never ship it. Run `npm run dist:win`
on a Windows PC for a real installer; the Portable target is the
deliverable from here. The release workflow
(`.github/workflows/build-windows.yml`) now also triggers on the
`single-owner` branch.

## 8. Not verified in the sandbox

- Installing and running the built .exe on a real Windows 10/11 PC (no
  Windows here). The portable exe is a standard Electron build; the
  final click-through on Windows is untested.
- Printing to a real thermal printer (invoice HTML + PDF export are
  implemented; only the print dialog path was exercised in code, not on
  hardware).
- Barcode scanner hardware (keyboard-wedge scanners work through the
  same search box that was tested with typed input).
- Performance on a low-spec PC (single local SQLite database, no network
  calls; startup in the sandbox was a few seconds).
