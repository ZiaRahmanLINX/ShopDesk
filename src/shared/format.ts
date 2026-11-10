// Pure formatting helpers shared by main and renderer (no Node APIs).
export function formatPKR(paisa: number): string {
  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const rupees = Math.floor(abs / 100);
  const ps = abs % 100;
  const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}Rs ${grouped}.${String(ps).padStart(2, '0')}`;
}

export function formatPKRCompact(paisa: number): string {
  const r = paisa / 100;
  if (Math.abs(r) >= 1_000_000) return `Rs ${(r / 1_000_000).toFixed(1)}M`;
  if (Math.abs(r) >= 1_000) return `Rs ${(r / 1_000).toFixed(1)}k`;
  return formatPKR(paisa);
}

/** Parse a user-typed rupees amount ("1,250.50" or "1250") into paisa. */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[,Rs\s]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function fmtDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
