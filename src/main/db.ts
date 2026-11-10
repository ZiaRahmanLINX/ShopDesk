// Database bootstrap: Prisma client, runtime DB location, migration runner.
import { PrismaClient } from './generated-prisma';
import fs from 'node:fs';
import path from 'node:path';

// Electron's `app` is only available inside the Electron main process. The
// scenario tests run the same services in plain Node, so resolve it lazily
// and fall back to an explicit path / the project directory.
function electronApp(): { getPath: (name: string) => string; getAppPath: () => string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const e = require('electron');
    if (e && e.app && typeof e.app.getPath === 'function') return e.app as never;
  } catch {
    /* not running under Electron */
  }
  return null;
}

let prisma: PrismaClient | null = null;

export function dbPath(): string {
  const override = process.env.SHOPDESK_DB_PATH;
  if (override) return override;
  const app = electronApp();
  if (app) return path.join(app.getPath('userData'), 'shopdesk.db');
  return path.join(process.cwd(), 'shopdesk-test.db');
}

export function getPrisma(): PrismaClient {
  if (prisma) return prisma;
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  prisma = new PrismaClient({
    datasourceUrl: `file:${file}`,
    log: process.env.SHOPDESK_DEBUG ? ['error', 'warn'] : ['error'],
  });
  return prisma;
}

/** Apply versioned SQL migrations from resources/migrations in order.
 *  Each file is applied once, tracked in the _migrations table. Safe to
 *  re-run: files are idempotent (CREATE TABLE IF NOT EXISTS) and tracked. */
export async function runMigrations(): Promise<void> {
  const db = getPrisma();
  await db.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "_migrations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL UNIQUE, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  const applied = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT "name" FROM "_migrations"`,
  );
  const done = new Set(applied.map((r) => r.name));

  const appPath = electronApp()?.getAppPath() || process.cwd();
  const dirs = [
    // packaged app: resources/migrations (extraResources)
    path.join((process as unknown as { resourcesPath?: string }).resourcesPath || '', 'migrations'),
    // dev: project resources/migrations
    path.join(appPath, 'resources', 'migrations'),
    path.join(__dirname, '..', '..', 'resources', 'migrations'),
  ];
  let dir = '';
  for (const d of dirs) {
    if (d && fs.existsSync(d)) {
      dir = d;
      break;
    }
  }
  if (!dir) return;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    // Split on statement boundaries the migration files use (they are
    // written one statement per line-block separated by ";\n").
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    await db.$transaction(async (tx) => {
      for (const stmt of statements) {
        await tx.$executeRawUnsafe(stmt);
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO "_migrations" ("name") VALUES ('${file.replace(/'/g, "''")}')`,
      );
    });
  }
}

// ---------- Settings (key/value JSON) ----------
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = getPrisma();
  const row = await db.appSettings.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = getPrisma();
  await db.appSettings.upsert({
    where: { key },
    update: { value: JSON.stringify(value) },
    create: { key, value: JSON.stringify(value) },
  });
}

export interface ShopSettings {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopEmail: string;
  thankYouNote: string;
  reservePct: number;
  currency: string;
  thermalWidth: '58' | '80';
}

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: 'My Shop',
  shopAddress: '',
  shopPhone: '',
  shopEmail: '',
  thankYouNote: 'Thank you for shopping with us!',
  reservePct: 0,
  currency: 'PKR',
  thermalWidth: '80',
};

export async function getShopSettings(): Promise<ShopSettings> {
  return getSetting<ShopSettings>('shop', DEFAULT_SETTINGS);
}

// ---------- Number series ----------
function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

/** INV-20261110-0001 style invoice numbers (unique per day). */
export async function nextInvoiceNo(): Promise<string> {
  const db = getPrisma();
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
  const prefix = `INV-${stamp}-`;
  const count = await db.sale.count({
    where: { invoiceNo: { startsWith: prefix } },
  });
  return `${prefix}${pad(count + 1, 4)}`;
}

export async function nextReceiptNo(prefix: string): Promise<string> {
  const db = getPrisma();
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
  const full = `${prefix}-${stamp}-`;
  const count = await db.payment.count({
    where: { receiptNo: { startsWith: full } },
  });
  return `${full}${pad(count + 1, 4)}`;
}

export async function nextPurchaseInvoiceNo(): Promise<string> {
  const db = getPrisma();
  const count = await db.purchase.count();
  return `PUR-${pad(count + 1, 5)}`;
}

// ---------- Audit ----------
export async function audit(
  userId: string | null,
  action: string,
  entityType: string | null,
  entityId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  const db = getPrisma();
  await db.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      details: JSON.stringify(details),
    },
  });
}
