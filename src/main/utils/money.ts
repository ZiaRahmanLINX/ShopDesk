// Money helpers — all amounts are integer PAISA (PKR x 100).
// Never use floats for money anywhere in the app.

export function toPaisa(rupees: number | string): number {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (!Number.isFinite(n)) throw new Error('Invalid amount');
  return Math.round(n * 100);
}

export function fromPaisa(paisa: number): number {
  return paisa / 100;
}

/** "Rs 1,234.50" — deterministic PKR formatting. */
export function formatPKR(paisa: number): string {
  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const rupees = Math.floor(abs / 100);
  const ps = abs % 100;
  const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}Rs ${grouped}.${String(ps).padStart(2, '0')}`;
}

/** Compact "Rs 1.2k" style for charts. */
export function formatPKRCompact(paisa: number): string {
  const r = paisa / 100;
  if (Math.abs(r) >= 1_000_000) return `Rs ${(r / 1_000_000).toFixed(1)}M`;
  if (Math.abs(r) >= 1_000) return `Rs ${(r / 1_000).toFixed(1)}k`;
  return formatPKR(paisa);
}

export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function monthBounds(key: string): { start: Date; end: Date } {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}
