/**
 * The investment workbook — the parent record.
 *
 * A broker's statement only ever tells you about today. Saving one here keeps
 * it, so the sheet slowly becomes the thing the statement can't give you: a
 * history. Every save writes two things,
 *
 *   Snapshots     one row per statement — invested, present value and P&L on
 *                 that date, so you can see the portfolio move month to month
 *   Holdings Log  one row per holding per statement, so you can see which fund
 *                 or share actually moved, and by how much
 *
 * Saving the same statement twice replaces that date rather than doubling it,
 * so you can re-save after re-downloading without making a mess.
 */
import type { ColumnSpec, SheetData, SheetMeta } from '../types';
import { parseSheetDate, toISODate } from './dates';
import { parseNumeric } from './format';
import { cellAt, layoutOf, rowFor, sameText } from './sheetTabs';
import type { HoldingsFile, HoldingsSection } from './holdings';

export const SNAPSHOTS_SHEET = 'Snapshots';
export const HOLDINGS_LOG_SHEET = 'Holdings Log';

export function findStatementSheets(sheets: SheetMeta[]): {
  snapshots: SheetMeta | null;
  log: SheetMeta | null;
} {
  return {
    snapshots: sheets.find((s) => sameText(s.title, SNAPSHOTS_SHEET)) ?? null,
    log: sheets.find((s) => sameText(s.title, HOLDINGS_LOG_SHEET)) ?? null,
  };
}

/* ----------------------------------------------------------------- columns */

export const SNAPSHOT_COL = {
  date: 'Date',
  invested: 'Invested',
  value: 'Present value',
  pnl: 'P&L',
  pnlPct: 'P&L %',
  holdings: 'Holdings',
  client: 'Client',
  file: 'Source file',
  savedAt: 'Saved at',
} as const;

export const SNAPSHOT_COLUMNS: ColumnSpec[] = [
  { name: SNAPSHOT_COL.date, type: 'date' },
  { name: SNAPSHOT_COL.invested, type: 'currency' },
  { name: SNAPSHOT_COL.value, type: 'currency' },
  { name: SNAPSHOT_COL.pnl, type: 'currency' },
  { name: SNAPSHOT_COL.pnlPct, type: 'percent' },
  { name: SNAPSHOT_COL.holdings, type: 'number' },
  { name: SNAPSHOT_COL.client, type: 'text' },
  { name: SNAPSHOT_COL.file, type: 'text' },
  { name: SNAPSHOT_COL.savedAt, type: 'date' },
];

export const LOG_COL = {
  date: 'Date',
  section: 'Section',
  name: 'Name',
  isin: 'ISIN',
  category: 'Category',
  quantity: 'Quantity',
  avg: 'Avg price',
  last: 'Last price',
  invested: 'Invested',
  value: 'Present value',
  pnl: 'P&L',
  pnlPct: 'P&L %',
} as const;

export const LOG_COLUMNS: ColumnSpec[] = [
  { name: LOG_COL.date, type: 'date' },
  { name: LOG_COL.section, type: 'text' },
  { name: LOG_COL.name, type: 'text' },
  { name: LOG_COL.isin, type: 'text' },
  { name: LOG_COL.category, type: 'text' },
  { name: LOG_COL.quantity, type: 'number' },
  { name: LOG_COL.avg, type: 'currency' },
  { name: LOG_COL.last, type: 'currency' },
  { name: LOG_COL.invested, type: 'currency' },
  { name: LOG_COL.value, type: 'currency' },
  { name: LOG_COL.pnl, type: 'currency' },
  { name: LOG_COL.pnlPct, type: 'percent' },
];

export type SnapshotLayout = Record<keyof typeof SNAPSHOT_COL, number>;
export type LogLayout = Record<keyof typeof LOG_COL, number>;

export const snapshotLayout = (headers: string[]): SnapshotLayout =>
  layoutOf(headers, SNAPSHOT_COL);
export const logLayout = (headers: string[]): LogLayout => layoutOf(headers, LOG_COL);

/* ------------------------------------------------------------------- reads */

export interface Snapshot {
  rowIndex: number;
  date: Date | null;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number | null;
  holdings: number;
  client: string;
  file: string;
}

export interface LoggedHolding {
  rowIndex: number;
  date: Date | null;
  section: string;
  name: string;
  key: string;
  isin: string;
  category: string;
  quantity: number;
  avgPrice: number;
  lastPrice: number;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number | null;
}

/** Holdings are matched across dates by ISIN, falling back to the name. */
export const holdingKeyOf = (isin: string, name: string) =>
  (isin.trim() || name.trim()).toLowerCase();

const n = (row: string[], i: number) => parseNumeric(cellAt(row, i)) ?? 0;

export function readSnapshots(data: SheetData | null): Snapshot[] {
  if (!data) return [];
  const L = snapshotLayout(data.headers);
  if (L.date < 0) return [];
  return data.rows
    .flatMap((row, rowIndex) => {
      const date = parseSheetDate(cellAt(row, L.date));
      if (!date) return [];
      const invested = n(row, L.invested);
      const value = n(row, L.value);
      const pnl = L.pnl >= 0 ? n(row, L.pnl) : value - invested;
      return [
        {
          rowIndex,
          date,
          invested,
          value,
          pnl,
          pnlPct: invested > 0 ? (pnl / invested) * 100 : null,
          holdings: n(row, L.holdings),
          client: cellAt(row, L.client),
          file: cellAt(row, L.file),
        },
      ];
    })
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
}

export function readLog(data: SheetData | null): LoggedHolding[] {
  if (!data) return [];
  const L = logLayout(data.headers);
  if (L.name < 0) return [];
  return data.rows.flatMap((row, rowIndex) => {
    const name = cellAt(row, L.name);
    if (!name) return [];
    const invested = n(row, L.invested);
    const value = n(row, L.value);
    const pnl = L.pnl >= 0 ? n(row, L.pnl) : value - invested;
    const isin = cellAt(row, L.isin);
    return [
      {
        rowIndex,
        date: parseSheetDate(cellAt(row, L.date)),
        section: cellAt(row, L.section),
        name,
        key: holdingKeyOf(isin, name),
        isin,
        category: cellAt(row, L.category),
        quantity: n(row, L.quantity),
        avgPrice: n(row, L.avg),
        lastPrice: n(row, L.last),
        invested,
        value,
        pnl,
        pnlPct: invested > 0 ? (pnl / invested) * 100 : null,
      },
    ];
  });
}

/* ------------------------------------------------------------------ deltas */

export interface HoldingChange {
  now: LoggedHolding;
  before: LoggedHolding | null;
  /** Change in present value since the previous statement. */
  valueChange: number | null;
  /** Change in units — what you actually bought or sold in between. */
  unitsChange: number | null;
  isNew: boolean;
}

export const sameDay = (a: Date | null, b: Date | null) =>
  Boolean(a && b && toISODate(a) === toISODate(b));

/** The holdings on `date`, each next to how it looked on the statement before it. */
export function changesBetween(
  log: LoggedHolding[],
  date: Date | null,
  previous: Date | null,
): HoldingChange[] {
  const now = log.filter((l) => sameDay(l.date, date));
  const before = log.filter((l) => sameDay(l.date, previous));
  const byKey = new Map(before.map((l) => [l.key, l]));

  return now
    .map((l) => {
      const prior = byKey.get(l.key) ?? null;
      return {
        now: l,
        before: prior,
        valueChange: prior ? l.value - prior.value : null,
        unitsChange: prior ? l.quantity - prior.quantity : null,
        isNew: Boolean(previous) && !prior,
      };
    })
    .sort((a, b) => b.now.value - a.now.value);
}

/** Holdings that were there last time and have gone since. */
export function goneSince(
  log: LoggedHolding[],
  date: Date | null,
  previous: Date | null,
): LoggedHolding[] {
  if (!previous) return [];
  const nowKeys = new Set(log.filter((l) => sameDay(l.date, date)).map((l) => l.key));
  return log.filter((l) => sameDay(l.date, previous) && !nowKeys.has(l.key));
}

/* ------------------------------------------------------------------ writes */

/**
 * Which parts of a statement to keep: the per-asset sheets when it has them,
 * since a "Combined" sheet is only those two added together and would double
 * every total.
 */
export function sectionsToSave(file: HoldingsFile): HoldingsSection[] {
  const withLines = file.sections.filter((s) => s.lines.length > 0);
  const detailed = withLines.filter((s) => !/combined/i.test(s.name));
  return detailed.length ? detailed : withLines;
}

/** The date a statement is filed under: its own "as on", or the day you opened it. */
export function statementDate(file: HoldingsFile): Date {
  return parseSheetDate(file.asOn ?? '') ?? new Date(file.loadedAt);
}

export interface StatementTotals {
  invested: number;
  value: number;
  pnl: number;
  holdings: number;
}

export function totalsOf(sections: HoldingsSection[]): StatementTotals {
  const lines = sections.flatMap((s) => s.lines);
  const invested = lines.reduce((sum, l) => sum + l.invested, 0);
  const value = lines.reduce((sum, l) => sum + l.value, 0);
  return { invested, value, pnl: value - invested, holdings: lines.length };
}

/**
 * A percent column holds a fraction: 0.0327 shows as 3.27%. Rounded, so the
 * cell holds a tidy number rather than eighteen decimals of float dust.
 */
const asFraction = (pct: number | null) => (pct == null ? '' : String(Number((pct / 100).toFixed(6))));

export function snapshotRow(
  headers: string[],
  L: SnapshotLayout,
  file: HoldingsFile,
  savedAt: Date,
): string[] {
  const sections = sectionsToSave(file);
  const totals = totalsOf(sections);
  const pct = totals.invested > 0 ? (totals.pnl / totals.invested) * 100 : null;

  return rowFor(headers, [
    { colIndex: L.date, value: toISODate(statementDate(file)) },
    { colIndex: L.invested, value: String(round(totals.invested)) },
    { colIndex: L.value, value: String(round(totals.value)) },
    { colIndex: L.pnl, value: String(round(totals.pnl)) },
    { colIndex: L.pnlPct, value: asFraction(pct) },
    { colIndex: L.holdings, value: String(totals.holdings) },
    { colIndex: L.client, value: file.clientId ?? '' },
    { colIndex: L.file, value: file.fileName },
    { colIndex: L.savedAt, value: toISODate(savedAt) },
  ]);
}

export function logRows(headers: string[], L: LogLayout, file: HoldingsFile): string[][] {
  const date = toISODate(statementDate(file));
  return sectionsToSave(file).flatMap((section) =>
    section.lines.map((l) =>
      rowFor(headers, [
        { colIndex: L.date, value: date },
        { colIndex: L.section, value: section.name },
        { colIndex: L.name, value: l.name },
        { colIndex: L.isin, value: l.isin },
        { colIndex: L.category, value: l.category },
        { colIndex: L.quantity, value: String(l.quantity) },
        { colIndex: L.avg, value: String(round(l.avgPrice, 4)) },
        { colIndex: L.last, value: String(round(l.lastPrice, 4)) },
        { colIndex: L.invested, value: String(round(l.invested)) },
        { colIndex: L.value, value: String(round(l.value)) },
        { colIndex: L.pnl, value: String(round(l.pnl)) },
        { colIndex: L.pnlPct, value: asFraction(l.pnlPct) },
      ]),
    ),
  );
}

const round = (x: number, places = 2) => Number(x.toFixed(places));

/** Rows already filed under a date — replaced, so re-saving can't double up. */
export const rowsOnDate = (rows: { rowIndex: number; date: Date | null }[], date: Date) =>
  rows.filter((r) => sameDay(r.date, date)).map((r) => r.rowIndex);
