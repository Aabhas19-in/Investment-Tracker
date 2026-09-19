/**
 * Small shared helpers for the tabs this app writes itself — the ones with a
 * known set of columns, as opposed to a sheet you built by hand.
 *
 * Columns are found by header name rather than by position, so reordering or
 * adding columns in Google Sheets doesn't break anything.
 */
import type { SheetData } from '../types';

export const sameText = (a: string, b: string) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Trimmed cell, or '' when the column isn't there at all. */
export const cellAt = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? '').trim() : '');

/** Maps each known column to the index it sits at, or -1 when it's missing. */
export function layoutOf<K extends string>(
  headers: string[],
  names: Record<K, string>,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of Object.keys(names) as K[]) {
    out[key] = headers.findIndex((h) => sameText(h ?? '', names[key]));
  }
  return out;
}

/** A row sized to the tab's real width, with the given cells filled in. */
export function rowFor(headers: string[], cells: { colIndex: number; value: string }[]): string[] {
  const row = headers.map(() => '');
  for (const c of cells) if (c.colIndex >= 0) row[c.colIndex] = c.value;
  return row;
}

/** True when a tab is missing any of the columns it can't work without. */
export function missingRequired<K extends string>(
  data: SheetData | null,
  names: Record<K, string>,
  required: K[],
): boolean {
  if (!data) return false;
  const layout = layoutOf(data.headers, names);
  return required.some((k) => layout[k] < 0);
}
