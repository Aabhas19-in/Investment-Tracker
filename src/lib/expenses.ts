import type { ColumnSpec, SheetMeta } from '../types';
import type { ColumnType } from './columnTypes';
import { MONTH_ABBR } from './dates';

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

export const monthTitle = (d: Date) => `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;

/** "Aug 2026" / "August 2026" -> a Date on the 1st. Null for any other tab name. */
export function parseMonthTitle(title: string): Date | null {
  const m = title.trim().match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (!m) return null;
  const idx = MONTH_ABBR.findIndex((x) => m[1].toLowerCase().startsWith(x.toLowerCase()));
  if (idx < 0) return null;
  return new Date(Number(m[2]), idx, 1);
}

/** Newest month first; anything not month-shaped sinks to the bottom, alphabetically. */
export function sortMonthSheets(sheets: SheetMeta[]): SheetMeta[] {
  return [...sheets].sort((a, b) => {
    // Income leads, then months newest first, then anything else alphabetically.
    const ia = isIncomeSheet(a.title);
    const ib = isIncomeSheet(b.title);
    if (ia !== ib) return ia ? -1 : 1;

    const da = parseMonthTitle(a.title);
    const db = parseMonthTitle(b.title);
    if (da && db) return db.getTime() - da.getTime();
    if (da) return -1;
    if (db) return 1;
    return a.title.localeCompare(b.title);
  });
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

/**
 * A tab named "Income" is money coming in, not a month of spending. It's pinned
 * to the front of the switcher and rendered differently — income rows have no
 * category, so treating them like expenses showed a "?" badge and the label
 * "Uncategorised".
 */
export const INCOME_SHEET = 'Income';

export const isIncomeSheet = (title: string) =>
  title.trim().toLowerCase() === INCOME_SHEET.toLowerCase();

/**
 * What an income row is *for* — the first text column carrying a value, e.g.
 * "Salary" or "Freelance". Falls back to the sheet's own name so a row is
 * never nameless.
 */
export function describeRow(
  headers: string[],
  row: string[],
  skip: number[],
  fallback: string,
): string {
  for (let i = 0; i < headers.length; i++) {
    if (skip.includes(i)) continue;
    const v = (row[i] ?? '').trim();
    if (v) return v;
  }
  return fallback;
}
