/** Date helpers shared by the investments and expenses editors. */

export const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayISO = () => toISODate(new Date());

export function shiftISODate(iso: string, days: number): string {
  const base = parseSheetDate(iso) ?? new Date();
  base.setDate(base.getDate() + days);
  return toISODate(base);
}

/**
 * Sheets can hand a date back in several shapes depending on the cell's format
 * (and as a serial number if it was written as a raw value), so accept them all.
 */
export function parseSheetDate(raw: string): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // Serial number counted from the Sheets epoch, 1899-12-30.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 1000 && n < 100000) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    return null;
  }

  // 2026-08-23
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // 23-Aug-2026 / 23 Aug 2026
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (m) {
    const idx = MONTH_ABBR.findIndex((x) => m![2].toLowerCase().startsWith(x.toLowerCase()));
    if (idx >= 0) return new Date(Number(m[3]), idx, Number(m[1]));
  }

  // 23/08/2026 — day first, matching the dd-mmm-yyyy format this app writes.
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dayLabel(d: Date): string {
  const today = new Date();
  const same = (a: Date, b: Date) => toISODate(a) === toISODate(b);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
