import type { ColumnSpec, SheetMeta } from '../types';
import type { ColumnType } from './columnTypes';

/**
 * Expense sheets are one tab per month ("Aug 2026") and always carry a Date
 * column. Category is the dynamic "division" inside a month — you add new ones
 * as you spend, and they come straight back out of the sheet.
 */

export const DATE_COLUMN = 'Date';
export const CATEGORY_COLUMN = 'Category';
export const AMOUNT_COLUMN = 'Amount';

/**
 * Categories live in their own tab of the expenses workbook, so the list exists
 * independently of whether anything has been spent under it yet — and is still
 * editable straight from Google Sheets.
 */
export const CATEGORIES_SHEET = 'Categories';

/** Created on every new month sheet. Date is mandatory and can't be removed. */
export const EXPENSE_COLUMNS: ColumnSpec[] = [
  { name: DATE_COLUMN, type: 'date' },
  { name: CATEGORY_COLUMN, type: 'text' },
  { name: AMOUNT_COLUMN, type: 'currency' },
  { name: 'Note', type: 'text' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthTitle = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** "Aug 2026" / "August 2026" -> a Date on the 1st. Null for any other tab name. */
export function parseMonthTitle(title: string): Date | null {
  const m = title.trim().match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS.findIndex((x) => m[1].toLowerCase().startsWith(x.toLowerCase()));
  if (idx < 0) return null;
  return new Date(Number(m[2]), idx, 1);
}

/** Newest month first; anything not month-shaped sinks to the bottom, alphabetically. */
export function sortMonthSheets(sheets: SheetMeta[]): SheetMeta[] {
  return [...sheets].sort((a, b) => {
    const da = parseMonthTitle(a.title);
    const db = parseMonthTitle(b.title);
    if (da && db) return db.getTime() - da.getTime();
    if (da) return -1;
    if (db) return 1;
    return a.title.localeCompare(b.title);
  });
}

/* ------------------------------------------------------------------ dates */

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayISO = () => toISODate(new Date());

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
    const idx = MONTHS.findIndex((x) => m![2].toLowerCase().startsWith(x.toLowerCase()));
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

/* ---------------------------------------------------------------- columns */

/**
 * Finds a well-known column by name, falling back to the first column of the
 * right type so sheets you built by hand still work.
 */
export function findColumn(
  headers: string[],
  name: string,
  types: ColumnType[],
  fallbackType?: ColumnType,
): number {
  const byName = headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  if (byName >= 0) return byName;
  if (fallbackType) return types.findIndex((t) => t === fallbackType);
  return -1;
}

/** Distinct category values in the sheet, most used first — the dynamic divisions. */
export function categoriesIn(rows: string[][], colIndex: number): string[] {
  if (colIndex < 0) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = row[colIndex]?.trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}
