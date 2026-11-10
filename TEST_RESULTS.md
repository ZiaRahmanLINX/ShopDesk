# ShopDesk — Test Results

Run on 2026-11-10 in the Linux build sandbox. All amounts in Rs (paisa in code).

## 1. Accounting scenarios A–I (`npm run test:scenarios`)

42 checks, **all passed**. The script (`tests/scenarios.ts`) runs the real
service layer against a throwaway SQLite database.

| Scenario | What was checked | Result |
|---|---|---|
| A — partner invests Rs 300,000 | Cash 300,000; capital balance 300,000 | PASS |
| B — buy Rs 200,000 inventory | Cash 100,000; inventory value 200,000; purchase is NOT an expense (expenses still 0) | PASS |
| C — Rs 30,000 cash sales + Rs 5,000 credit | Cash 130,000; customer outstanding 5,000; gross profit 16,000; COGS 19,000 (FIFO) | PASS |
| D — urgent stock Rs 15,000 mid-month | Cash 115,000; inventory 196,000; net profit unchanged by the purchase (16,000 before and after) | PASS |
| E — additional capital Rs 20,000 | Cash 135,000; capital balance 320,000 | PASS |
| F — partner loan Rs 10,000 | Cash 145,000; loan balance 10,000; capital unchanged at 320,000 (separate ledgers) | PASS |
| G — rent 8,000 + electricity 2,000 | Cash 135,000; total expenses 10,000 | PASS |
| H — customer pays Rs 2,000 | Cash 137,000; customer outstanding 3,000 | PASS |
| I — close month, reserve 50%, split 50/50 | Net profit 6,000; reserve 3,000; distributable 3,000; each partner 1,500; closing inventory 196,000; month status CLOSED; 2 distribution rows summing to 3,000; reserve recorded 3,000; second close rejected; new sale in locked month rejected | PASS |
| Cross-checks | Purchase cash-outs total 215,000 (200,000 + 15,000, no double count); supplier payable 0; item quantities X 900 / Y 440 / Z 160; dashboard cash 137,000, customer outstanding 3,000, inventory value 196,000 | PASS |

## 2. Typecheck (`npm run typecheck`)

Clean — renderer (`tsconfig.json`) and main process
(`tsconfig.node.json`) both pass with no errors.

Issues found and fixed during the check: `baseUrl` missing in both
tsconfigs; seven `useEffect(load, …)` calls returning a Promise; the shared
`Input` component not accepting `ref`/`hint`; the Partnership modal type
missing `'reserve'`; an unsafe cast in the partner statement.

## 3. Production build (`npm run build`)

Clean. Prisma Client generated (v6.19.3), Vite renderer built (466 modules,
~1.0 MB JS), main process compiled to `dist-electron`.

Issues found and fixed during the build: `package.json` `main` pointed at
`dist-electron/main.js` but tsc emits `dist-electron/main/main.js`; the
window loaded `dist-electron/renderer/index.html` instead of
`dist/renderer/index.html`; the Tailwind Vite plugin was missing from
`vite.config.ts`, so the built CSS contained no utility classes (the login
screen rendered unstyled until this was fixed).

## 4. Launch smoke test (headless, Xvfb)

The built app was launched under Xvfb and driven through the real UI via
CDP (`scripts/e2e-login.mjs`):

- App boots, creates the database in the user-data folder, runs migrations
  and seeds the demo data. **No errors in the launch log.**
- Login screen renders styled (Tailwind working). Login as
  `admin / admin123` succeeds.
- Dashboard renders with real seeded numbers, verified by hand against the
  seed data: today's sales Rs 11,620 (cash 7,370 · online 1,610 · credit
  2,640), monthly gross profit Rs 1,360, monthly net −Rs 9,140, monthly
  expenses Rs 10,500, stock purchases Rs 223,900, inventory value
  Rs 212,640, cash balance Rs 112,220, customer credit Rs 2,640, supplier
  payables Rs 39,250. Bar chart (monthly sales vs profit) and pie chart
  (expenses by category: rent 76%, electricity 19%, tea 5%) both render.
- Screenshots: login and dashboard checked visually.

Bugs found by this test and fixed: the demo seed's first purchase paid
Rs 201,500 against a Rs 174,650 total (rejected by the paid ≤ total guard);
the seed now computes the total from the product list. A failed first-run
seed previously left a half-seeded database forever; the seed now records a
`seeded` flag and wipes + retries a partial seed on the next launch.
Bootstrap failures are now caught and logged instead of becoming unhandled
promise rejections.

## 5. Windows packaging (`npm run dist:win`)

- **ShopDesk-1.0.0-Portable.exe** (91 MB) — built successfully. Single
  self-contained file, no install needed.
- **ShopDesk-1.0.0-Setup.exe — NOT built (see below).**

### ⚠️ NSIS installer cannot be built in this sandbox — do not ship a Setup file from here

The NSIS target fails with `spawn wine ENOENT`: building a Windows
installer on Linux needs Wine to run Microsoft's installer compiler, and
there is no Wine in this sandbox. The 334 KB `ShopDesk-1.0.0-Setup.exe`
left behind by the failed build is a stub with no app payload inside it
(verified: no 7z payload, no `app.asar`, no `ShopDesk.exe` reference) — it
cannot install anything and must not be distributed. It has been deleted
from `release/`.

To get a real installer, run `npm run dist:win` on a Windows PC (where the
installer compiler runs natively, no Wine needed). The Portable exe is the
recommended download until then — it is complete and self-contained.

### Packaging bug found and fixed: Prisma engine missing from the bundle

The first portable build packaged the app but **not** Prisma's native query
engine (`@prisma/engines`) or the generated client — the app would have
crashed on its first database call. Two separate causes, both fixed:

1. `@prisma/engines` was in `devDependencies`, so electron-builder's
   production-dependency scan skipped it. It is a real runtime dependency
   and now lives in `dependencies`.
2. The generated client lived in `node_modules/.prisma`, which
   electron-builder never packages (dot-directory). The generator now
   outputs to `src/main/generated-prisma` instead, the three
   `@prisma/client` imports point at it, and `build:main` copies it into
   `dist-electron`. Both the engines and the generated client's own engine
   copies are in `asarUnpack`, so the native binaries sit outside the asar
   where Electron can load them.

The rebuilt package was verified: `query_engine-windows.dll.node` is
present unpacked in both `node_modules/@prisma/engines` and
`dist-electron/main/generated-prisma`, and the migration SQL is in
`resources/migrations/`.

## 6. Not verified in the sandbox

- Installing and running the .exe on a real Windows 10/11 PC (no Windows
  here). The portable exe is a standard Electron build and the win-unpacked
  folder is present, but the final click-through on Windows is untested.
- Printing to a real thermal printer (invoice HTML + PDF export are
  implemented; only the print dialog path was exercised in code, not on
  hardware).
- Barcode scanner hardware (keyboard-wedge scanners work through the same
  search box that was tested with typed input).
- Performance on a low-spec PC (the app is a single local SQLite database
  with no network calls; startup in the sandbox was a few seconds).

## 7. Known cosmetic issues

- On the dashboard pie chart, the "Tea and refreshments" label can clip at
  the card's right edge at 1366px width.
- (Removed in v1.1.2: the note above about demo sales no longer applies —
  demo data no longer ships.)


## 8. v1.1.2 — login bug fix + demo removal (2026-11-11)

**Bug (found on a real Windows PC, 2026-11-10):** first launch showed the
login screen, but signing in failed with `Invalid db.user.findUnique() …
The table main.User does not exist in the current database.` Root cause:
`extraResources` in electron-builder.yml copied the whole `resources/`
folder into `resources/migrations/`, so the migration file landed at
`resources/migrations/migrations/0001_init.sql` — one level too deep.
`runMigrations()` found no `.sql` files, applied nothing, and returned
successfully, leaving an empty database. The app opened anyway because
`bootstrapDatabase()` swallows its error and the setup-status check
defaulted to "setup done" on failure.

**Fix:**
- `electron-builder.yml`: `extraResources` now copies `resources/migrations`
  (the files) into `migrations`, so `0001_init.sql` lands at
  `resources/migrations/0001_init.sql`. Verified in the packaged build:
  `release/win-unpacked/resources/migrations/0001_init.sql` exists, no
  nested directory.
- `src/main/db.ts` `runMigrations()`: picks the first candidate directory
  that actually contains `.sql` files (falls through to the copy inside
  app.asar if needed); throws a clear error if no migration files are
  found anywhere; verifies the `User` table exists after applying.
- `src/renderer/App.tsx`: a setup-status failure now shows a database
  error screen instead of silently opening the login screen; a
  missing-table login error shows a plain-language message instead of the
  raw Prisma error.
- New regression test `tests/migrations.ts` (`npm run test:migrations`):
  6 checks, all passed — fresh DB gets its tables, re-running is
  idempotent, fresh DB reports needsSetup, clean-setup login works.

**Demo removal (user request):** first-run setup is now clean setup only —
every user creates their own account. Removed: the "Explore with demo
data" choice from the Setup wizard, the `setup:loadDemo` IPC handler, the
demo seed code (`seedDemo`/`seedIfEmpty`), the demo hint on the login
screen, and demo mentions from the README, user guide and tutorial.
`tests/setup.ts` demo section replaced; `tests/migrations.ts` now uses
clean setup. The `demo` flag in setup status/meta is kept only so
databases set up with demo data before v1.1.2 still report correctly.

**Verified for v1.1.2:** typecheck clean; 42/42 scenario checks;
setup checks pass; 6/6 migration checks pass; headless e2e drove the
clean setup wizard → tutorial → Settings (About card shows "Version
1.1.2"); portable exe built
(`ShopDesk-1.1.2-Portable.exe`, 109,450,042 bytes, SHA-256
`59d31f10057fda632f68b5766dbc175d5072d171594386387cd40f5952d2f7c8`).
Still not verified on a real Windows PC — the fix is verified in
packaging, tests and headless runs; the user is the first real-Windows
check.
