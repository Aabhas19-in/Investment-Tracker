import { parseSheetDate, toISODate } from './dates';
import { isCompleted } from './columnTypes';

/**
 * A "trigger" is a date you want to be reminded about — an FD maturing, a
 * lock-in ending, a renewal. The sheet colours the cell itself via conditional
 * formatting; this is the same reckoning done client-side so the app can show
 * a banner and badges without waiting for you to open Google Sheets.
 */

/** How far ahead counts as "coming up". Must match the sheet's formula. */
export const TRIGGER_SOON_DAYS = 30;

export type TriggerStatus = 'passed' | 'today' | 'soon' | 'later';

export interface TriggerInfo {
  date: Date;
  /** Whole days from today; negative once the date has gone by. */
  days: number;
  status: TriggerStatus;
  /** Short human phrasing, e.g. "in 12 days" or "3 months ago". */
  label: string;
}

const DAY = 86_400_000;

function phrase(days: number): string {
  const n = Math.abs(days);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';

  const plural = (value: string, word: string) => `${value} ${word}${value === '1' ? '' : 's'}`;

  const unit =
    n < 45
      ? plural(String(n), 'day')
      : n < 365
        ? plural(String(Math.round(n / 30)), 'month')
        : plural((n / 365).toFixed(n % 365 === 0 ? 0 : 1), 'year');

  return days > 0 ? `in ${unit}` : `${unit} ago`;
}

export function triggerInfo(raw: string): TriggerInfo | null {
  const date = parseSheetDate(raw);
  if (!date) return null;

  // Compare whole days, so "today" doesn't flip based on the clock.
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((b - a) / DAY);

  const status: TriggerStatus =
    days < 0 ? 'passed' : days === 0 ? 'today' : days <= TRIGGER_SOON_DAYS ? 'soon' : 'later';

  return { date, days, status, label: phrase(days) };
}

/** Anything worth putting in front of you the moment you open the tab. */
export const isPressing = (t: TriggerInfo) => t.status !== 'later';

export const triggerTone = (status: TriggerStatus) =>
  status === 'passed' || status === 'today'
    ? { fg: 'var(--neg)', bg: 'color-mix(in srgb, var(--neg) 12%, transparent)' }
    : status === 'soon'
      ? { fg: '#b4740f', bg: 'color-mix(in srgb, #e8992b 16%, transparent)' }
      : { fg: 'var(--muted)', bg: 'transparent' };

export const isoOf = (d: Date) => toISODate(d);

/** How many trigger dates on a sheet have arrived or are close. */
export function countPressing(rows: string[][], columnTypes: string[]): number {
  const cols = columnTypes.map((t, i) => (t === 'trigger' ? i : -1)).filter((i) => i >= 0);
  if (cols.length === 0) return 0;

  const statusCols = columnTypes.map((t, i) => (t === 'status' ? i : -1)).filter((i) => i >= 0);

  let n = 0;
  for (const row of rows) {
    // A completed entry has nothing left to remind you about.
    if (statusCols.some((i) => isCompleted(row[i] ?? ''))) continue;
    for (const i of cols) {
      const info = triggerInfo(row[i] ?? '');
      if (info && isPressing(info)) n++;
    }
  }
  return n;
}
