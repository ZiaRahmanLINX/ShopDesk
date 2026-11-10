// Backup & restore: file-level SQLite backups with verification.
import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getPrisma, dbPath } from '../db';

export function backupDir(): string {
  const dir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Copy the live DB file to the backups folder. Returns the backup path. */
export async function createBackup(label?: string): Promise<string> {
  const src = dbPath();
  if (!fs.existsSync(src)) throw new Error('Database file not found');
  const dest = path.join(backupDir(), `shopdesk-${stamp()}${label ? `-${label}` : ''}.db`);
  fs.copyFileSync(src, dest);
  return dest;
}

/** Automatic daily backup: one per calendar day, kept for 30 days. */
export async function autoBackupIfNeeded(): Promise<string | null> {
  const dir = backupDir();
  const today = stamp().slice(0, 8);
  const existing = fs.readdirSync(dir).filter((f) => f.includes(today) && f.endsWith('.db'));
  if (existing.length > 0) return null;
  const file = await createBackup('auto');
  // Prune backups older than 30 days.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    try {
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    } catch {
      /* ignore */
    }
  }
  return file;
}

export async function listBackups(): Promise<{ name: string; path: string; size: number; modified: string }[]> {
  const dir = backupDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      return { name: f, path: fp, size: st.size, modified: st.mtime.toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/** Verify a backup file: it must open and pass PRAGMA integrity_check. */
export async function verifyBackup(filePath: string): Promise<{ ok: boolean; detail: string }> {
  if (!fs.existsSync(filePath)) return { ok: false, detail: 'File not found' };
  // Use a throwaway Prisma client pointed at the backup (read-only check via sqlite pragma).
  const { PrismaClient } = await import('../generated-prisma');
  const tmp = new PrismaClient({ datasourceUrl: `file:${filePath}` });
  try {
    const rows = await tmp.$queryRawUnsafe<{ integrity_check: string }[]>(`PRAGMA integrity_check`);
    const ok = rows.length === 1 && rows[0].integrity_check === 'ok';
    // Also confirm the core tables exist.
    const tables = await tmp.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Product','Sale','Purchase','CashAccount')`,
    );
    const tablesOk = tables.length === 4;
    return { ok: ok && tablesOk, detail: ok && tablesOk ? 'integrity_check: ok, core tables present' : `integrity_check: ${rows[0]?.integrity_check}, tables found: ${tables.length}/4` };
  } catch (e) {
    return { ok: false, detail: String(e) };
  } finally {
    await tmp.$disconnect();
  }
}

/** Restore a backup over the live DB. Caller must restart the app afterwards. */
export async function restoreBackup(filePath: string): Promise<void> {
  const check = await verifyBackup(filePath);
  if (!check.ok) throw new Error(`Backup verification failed: ${check.detail}`);
  const db = getPrisma();
  await db.$disconnect();
  const live = dbPath();
  const keep = `${live}.pre-restore-${stamp()}.db`;
  fs.copyFileSync(live, keep);
  fs.copyFileSync(filePath, live);
}

export async function exportBackupToFile(): Promise<string | null> {
  const res = await dialog.showSaveDialog({
    title: 'Save database backup',
    defaultPath: `shopdesk-backup-${stamp()}.db`,
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.copyFileSync(dbPath(), res.filePath);
  return res.filePath;
}

export async function pickBackupFile(): Promise<string | null> {
  const res = await dialog.showOpenDialog({
    title: 'Choose a backup file to restore',
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
}
