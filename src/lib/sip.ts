/**
 * SIPs — a fixed amount into a fund on the same day every month, usually on
 * auto-pay. The debit happens on its own; this is the ledger where you confirm,
 * month by month, that it actually went through (or that it didn't).
 *
 * Two tabs in the investments workbook, both created by the app and both
 * perfectly readable in Google Sheets:
 *
 *   SIP Plans     One row per SIP. "Instalments paid" and "Amount invested" are
 *                 live COUNTIFS / SUMIFS formulas over the payments tab, so the
 *                 sheet stays right even if you never open the app, and the
 *                 Summary tab counts SIPs like any other holding.
 *   SIP Payments  One row per month you've marked — Paid or Missed.
 *
 * A plan and its payments are joined by fund name, exactly the way those
 * formulas join them, so the app and the spreadsheet can't disagree.
 */
import type { ColumnSpec, SheetData, SheetMeta } from '../types';
import { STATUS_DONE, STATUS_OPEN, isCompleted } from './columnTypes';
import { MONTH_ABBR, parseSheetDate, toISODate } from './dates';
import { parseMonthTitle } from './expenses';
import { parseNumeric } from './format';
import { accentFor } from './accent';
import { colLetter, type CellWrite } from './sheets';

export const SIP_PLANS_SHEET = 'SIP Plans';
export const SIP_PAYMENTS_SHEET = 'SIP Payments';

/** One colour for everything SIP, so the chip, cards and button read as a set. */
export const SIP_ACCENT = accentFor('SIP');

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const isSipPlansSheet = (title: string) => sameText(title, SIP_PLANS_SHEET);
export const isSipPaymentsSheet = (title: string) => sameText(title, SIP_PAYMENTS_SHEET);

/** Both SIP tabs live behind the SIP chip, never in the ordinary sheet switcher. */
export const isSipSheet = (title: string) => isSipPlansSheet(title) || isSipPaymentsSheet(title);

export function findSipSheets(sheets: SheetMeta[]): {
  plans: SheetMeta | null;
  payments: SheetMeta | null;
} {
  return {
    plans: sheets.find((s) => isSipPlansSheet(s.title)) ?? null,
    payments: sheets.find((s) => isSipPaymentsSheet(s.title)) ?? null,
  };
}

/* ----------------------------------------------------------------- columns */

export const PLAN_COL = {
  fund: 'Fund name',
  amount: 'Monthly amount',
  day: 'SIP day',
  start: 'Start date',
  instalments: 'Instalments paid',
  invested: 'Amount invested',
  current: 'Current value',
  status: 'Status',
  notes: 'Notes',
} as const;

/**
 * SIP day is deliberately Text rather than Number: a Number column gets totalled,
 * and "SIP day: 45" across three plans is nonsense on the Summary tab.
 */
export const PLAN_COLUMNS: ColumnSpec[] = [
  { name: PLAN_COL.fund, type: 'text' },
  { name: PLAN_COL.amount, type: 'currency' },
  { name: PLAN_COL.day, type: 'text' },
  { name: PLAN_COL.start, type: 'date' },
  { name: PLAN_COL.instalments, type: 'number' },
  { name: PLAN_COL.invested, type: 'currency' },
  { name: PLAN_COL.current, type: 'currency' },
  { name: PLAN_COL.status, type: 'status' },
  { name: PLAN_COL.notes, type: 'text' },
];

export const PAY_COL = {
  date: 'Date',
  fund: 'Fund name',
  month: 'For month',
  amount: 'Amount',
  status: 'Status',
  note: 'Note',
} as const;

export const PAYMENT_COLUMNS: ColumnSpec[] = [
  { name: PAY_COL.date, type: 'date' },
  { name: PAY_COL.fund, type: 'text' },
  { name: PAY_COL.month, type: 'date' },
  { name: PAY_COL.amount, type: 'currency' },
  { name: PAY_COL.status, type: 'text' },
  { name: PAY_COL.note, type: 'text' },
];

export const PAID = 'Paid';
export const MISSED = 'Missed';

/** Shown as "Sep 2026" in the sheet, but still a real date underneath. */
export const MONTH_NUMBER_FORMAT = { type: 'DATE', pattern: 'mmm yyyy' };

type PlanKey = keyof typeof PLAN_COL;
type PayKey = keyof typeof PAY_COL;
export type PlanLayout = Record<PlanKey, number>;
export type PaymentLayout = Record<PayKey, number>;

function layoutOf<K extends string>(headers: string[], names: Record<K, string>): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of Object.keys(names) as K[]) {
    out[key] = headers.findIndex((h) => sameText(h ?? '', names[key]));
  }
  return out;
}

/** Columns are found by header name, so reordering them in Google Sheets is fine. */
export const planLayout = (headers: string[]): PlanLayout => layoutOf(headers, PLAN_COL);
export const paymentLayout = (headers: string[]): PaymentLayout => layoutOf(headers, PAY_COL);

/** What the app can't work without. Anything else missing is simply skipped. */
const PLAN_REQUIRED: PlanKey[] = ['fund', 'amount', 'day'];
const PAY_REQUIRED: PayKey[] = ['fund', 'month', 'amount', 'status'];

/**
 * The standard columns a hand-made or hand-edited SIP tab lacks, but only when
 * something essential is among them — a deleted Notes column isn't worth a
 * warning, a deleted Fund name column is.
 */
export function missingColumns(
  plans: SheetData | null,
  payments: SheetData | null,
): { plans: ColumnSpec[]; payments: ColumnSpec[] } {
  const check = <K extends string>(
    data: SheetData | null,
    names: Record<K, string>,
    specs: ColumnSpec[],
    required: K[],
  ) => {
    if (!data) return [];
    const layout = layoutOf(data.headers, names);
    if (required.every((k) => layout[k] >= 0)) return [];
    return specs.filter((spec) => !data.headers.some((h) => sameText(h ?? '', spec.name)));
  };
  return {
    plans: check(plans, PLAN_COL, PLAN_COLUMNS, PLAN_REQUIRED),
    payments: check(payments, PAY_COL, PAYMENT_COLUMNS, PAY_REQUIRED),
  };
}

/** The "Sep 2026" month format and a Paid / Missed dropdown on the payments tab. */
export function paymentStyling(P: PaymentLayout) {
  return [
    ...(P.month >= 0 ? [{ colIndex: P.month, numberFormat: MONTH_NUMBER_FORMAT }] : []),
    ...(P.status >= 0 ? [{ colIndex: P.status, oneOf: [PAID, MISSED] }] : []),
  ];
}

/* ------------------------------------------------------------------ months */

/** A month as one integer (year × 12 + month), so month ranges are plain arithmetic. */
export const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

const yearOf = (mi: number) => Math.floor(mi / 12);
const monthOf = (mi: number) => mi - yearOf(mi) * 12;

export const monthLabel = (mi: number) => `${MONTH_ABBR[monthOf(mi)]} ${yearOf(mi)}`;
export const monthShort = (mi: number) => MONTH_ABBR[monthOf(mi)];

/** The 1st of a month, as the date written into the "For month" column. */
export const monthStart = (mi: number) => new Date(yearOf(mi), monthOf(mi), 1);

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The debit date in a given month. A 31st SIP lands on the 30th, or the 28th in February. */
export function dueDate(mi: number, day: number): Date {
  const last = new Date(yearOf(mi), monthOf(mi) + 1, 0).getDate();
  return new Date(yearOf(mi), monthOf(mi), Math.min(Math.max(Math.trunc(day), 1), last));
}

/**
 * The first month a plan expects money. A SIP started on the 14th with a 5th
 * debit date first debits next month; one started on the 5th debits that day.
 */
export function firstInstalmentMonth(start: Date, day: number): number {
  const mi = monthIndex(start);
  return dueDate(mi, day) < startOfDay(start) ? mi + 1 : mi;
}

/** Every month from `first` whose debit date has already arrived by `today`. */
export function monthsDueSince(first: number, day: number, today: Date): number[] {
  const t = startOfDay(today);
  const out: number[] = [];
  for (let mi = Math.max(first, monthIndex(t) - MAX_MONTHS_BACK); mi <= monthIndex(t); mi++) {
    if (dueDate(mi, day) <= t) out.push(mi);
  }
  return out;
}

/** "Sep 2026", or a date in any shape the sheet hands back, as a month index. */
function parseMonthCell(raw: string): number | null {
  const s = String(raw ?? '').trim().replace(/^'/, '');
  if (!s) return null;
  const d = parseMonthTitle(s) ?? parseSheetDate(s);
  return d ? monthIndex(d) : null;
}

export function parseDay(raw: string): number | null {
  const n = parseNumeric(raw);
  if (n == null) return null;
  const d = Math.trunc(n);
  return d >= 1 && d <= 31 ? d : null;
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const suffix: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${n}${suffix[n % 10] ?? 'th'}`;
}

/** Matches the way COUNTIFS compares text: case doesn't matter, spelling does. */
export const fundKey = (name: string) => name.trim().toLowerCase();

/**
 * Fund names are written with USER_ENTERED (so the sheet formats them like
 * anything you type) and matched by COUNTIFS, so a few characters mean
 * something other than text to Google Sheets.
 */
export function fundNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Give the SIP a fund name.';
  if (/^[=+\-@]/.test(n)) {
    return 'A fund name can’t start with = + - or @ — Google Sheets would read it as a formula.';
  }
  if (/[*?~]/.test(n)) {
    return 'Leave * ? and ~ out of the fund name — Google Sheets treats them as wildcards when matching payments.';
  }
  return null;
}

/* ------------------------------------------------------------------- reads */

export interface SipPlan {
  /** 0-based data row on the SIP Plans tab. */
  rowIndex: number;
  fund: string;
  key: string;
  amount: number | null;
  day: number | null;
  start: Date | null;
  currentValue: number | null;
  stopped: boolean;
  notes: string;
}

export type PaymentStatus = 'paid' | 'missed';

export interface SipPayment {
  /** 0-based data row on the SIP Payments tab. */
  rowIndex: number;
  fund: string;
  key: string;
  month: number | null;
  date: Date | null;
  amount: number | null;
  status: PaymentStatus;
  note: string;
}

const cellAt = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? '').trim() : '');

export function readPlans(data: SheetData | null): SipPlan[] {
  if (!data) return [];
  const L = planLayout(data.headers);
  if (L.fund < 0) return [];
  return data.rows.flatMap((row, rowIndex) => {
    const fund = cellAt(row, L.fund);
    if (!fund) return [];
    return [
      {
        rowIndex,
        fund,
        key: fundKey(fund),
        amount: parseNumeric(cellAt(row, L.amount)),
        day: parseDay(cellAt(row, L.day)),
        start: parseSheetDate(cellAt(row, L.start)),
        currentValue: parseNumeric(cellAt(row, L.current)),
        stopped: isCompleted(cellAt(row, L.status)),
        notes: cellAt(row, L.notes),
      },
    ];
  });
}

export function readPayments(data: SheetData | null): SipPayment[] {
  if (!data) return [];
  const L = paymentLayout(data.headers);
  if (L.fund < 0) return [];
  return data.rows.flatMap((row, rowIndex) => {
    const fund = cellAt(row, L.fund);
    if (!fund) return [];
    const date = parseSheetDate(cellAt(row, L.date));
    const status: PaymentStatus = sameText(cellAt(row, L.status), MISSED) ? 'missed' : 'paid';
    return [
      {
        rowIndex,
        fund,
        key: fundKey(fund),
        // A row typed by hand without a month still lands somewhere sensible.
        month: parseMonthCell(cellAt(row, L.month)) ?? (date ? monthIndex(date) : null),
        date,
        amount: parseNumeric(cellAt(row, L.amount)),
        // Mirrors the formulas' "<>Missed": anything not marked Missed counts as paid.
        status,
        note: cellAt(row, L.note),
      },
    ];
  });
}

/* ------------------------------------------------------------------ status */

/**
 * paid / missed — you've marked it.
 * due           — the debit date has arrived and it isn't marked yet.
 * upcoming      — the debit date is still ahead.
 * idle          — nothing expected: before the SIP started, or it's stopped.
 */
export type MonthState = 'paid' | 'missed' | 'due' | 'upcoming' | 'idle';

export interface MonthCell {
  month: number;
  due: Date;
  state: MonthState;
  records: SipPayment[];
}

export interface SipStatus {
  plan: SipPlan;
  records: SipPayment[];
  instalments: number;
  invested: number;
  missed: number;
  /** The first month this plan expects a debit. */
  firstMonth: number;
  /** Oldest to newest, always running through the current month. */
  months: MonthCell[];
  current: MonthCell;
  /** Months before this one whose debit date passed without being marked. */
  overdue: MonthCell[];
  needsAttention: boolean;
}

/** Stops a mistyped start year (1926 for 2026) from generating a century of months. */
const MAX_MONTHS_BACK = 50 * 12;

export function sipStatus(plan: SipPlan, payments: SipPayment[], today: Date): SipStatus {
  const t = startOfDay(today);
  const thisMonth = monthIndex(t);
  const day = plan.day ?? 1;

  const records = payments.filter((p) => p.key === plan.key);
  const paid = records.filter((r) => r.status === 'paid');
  const recorded = records.map((r) => r.month).filter((m): m is number => m != null);

  const firstMonth = plan.start
    ? firstInstalmentMonth(plan.start, day)
    : recorded.length
      ? Math.min(...recorded)
      : thisMonth;

  const from = Math.max(Math.min(firstMonth, thisMonth, ...recorded), thisMonth - MAX_MONTHS_BACK);
  const to = Math.max(thisMonth, ...recorded);

  const byMonth = new Map<number, SipPayment[]>();
  for (const r of records) {
    if (r.month == null) continue;
    byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]);
  }

  const months: MonthCell[] = [];
  for (let mi = from; mi <= to; mi++) {
    const due = dueDate(mi, day);
    const recs = byMonth.get(mi) ?? [];
    const state: MonthState = recs.some((r) => r.status === 'paid')
      ? 'paid'
      : recs.length
        ? 'missed'
        : plan.stopped || mi < firstMonth
          ? 'idle'
          : due <= t
            ? 'due'
            : 'upcoming';
    months.push({ month: mi, due, state, records: recs });
  }

  const current = months.find((m) => m.month === thisMonth)!;
  const overdue = months.filter((m) => m.state === 'due' && m.month < thisMonth);

  return {
    plan,
    records,
    instalments: paid.length,
    invested: paid.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    missed: records.length - paid.length,
    firstMonth,
    months,
    current,
    overdue,
    needsAttention: months.some((m) => m.state === 'due'),
  };
}

/** SIPs with a debit that has gone by unmarked — the number on the badge. */
export function sipAttentionCount(
  plans: SheetData | null,
  payments: SheetData | null,
  today = new Date(),
): number {
  const records = readPayments(payments);
  return readPlans(plans).filter((p) => sipStatus(p, records, today).needsAttention).length;
}

/** The date a payment is recorded against: the debit date, unless that's still ahead. */
export function recordDate(month: number, day: number, today: Date): Date {
  const due = dueDate(month, day);
  const t = startOfDay(today);
  return due <= t ? due : t;
}

/* ------------------------------------------------------------------ writes */

export interface PlanDraft {
  fund: string;
  amount: number;
  day: number;
  /** ISO yyyy-mm-dd, or '' for none. */
  start: string;
  /** A plain number as text, or '' to leave it blank. */
  currentValue: string;
  stopped: boolean;
  notes: string;
}

type Cell = Omit<CellWrite, 'title' | 'dataRowIndex'>;

/** The cells a plan owns. Anything else in its row is left alone. */
export function planCells(L: PlanLayout, d: PlanDraft): Cell[] {
  const pairs: [number, string][] = [
    [L.fund, d.fund],
    [L.amount, String(d.amount)],
    [L.day, String(d.day)],
    [L.start, d.start],
    [L.current, d.currentValue],
    [L.status, d.stopped ? STATUS_DONE : STATUS_OPEN],
    [L.notes, d.notes],
  ];
  return pairs.filter(([i]) => i >= 0).map(([colIndex, value]) => ({ colIndex, value }));
}

/**
 * The live totals for the plan on `sheetRow` (1-based, as in its A1 address), e.g.
 * =IF($A5="","",COUNTIFS('SIP Payments'!$B:$B,$A5,'SIP Payments'!$E:$E,"<>Missed"))
 */
export function planFormulaCells(
  sheetRow: number,
  L: PlanLayout,
  P: PaymentLayout,
  paymentsTitle: string,
): Cell[] {
  if (L.fund < 0 || P.fund < 0 || P.status < 0) return [];
  const tab = `'${paymentsTitle.replace(/'/g, "''")}'`;
  const whole = (i: number) => `${tab}!$${colLetter(i)}:$${colLetter(i)}`;
  const fund = `$${colLetter(L.fund)}${sheetRow}`;
  const match = `${whole(P.fund)},${fund},${whole(P.status)},"<>${MISSED}"`;

  const out: Cell[] = [];
  if (L.instalments >= 0) {
    out.push({ colIndex: L.instalments, value: `=IF(${fund}="","",COUNTIFS(${match}))` });
  }
  if (L.invested >= 0 && P.amount >= 0) {
    out.push({
      colIndex: L.invested,
      value: `=IF(${fund}="","",SUMIFS(${whole(P.amount)},${match}))`,
    });
  }
  return out;
}

export interface PaymentDraft {
  fund: string;
  month: number;
  date: Date | null;
  amount: number | null;
  status: PaymentStatus;
  note?: string;
}

/** A full row for the payments tab, laid out to match its actual headers. */
export function paymentRow(headers: string[], P: PaymentLayout, d: PaymentDraft): string[] {
  const row = headers.map(() => '');
  const put = (i: number, v: string) => {
    if (i >= 0) row[i] = v;
  };
  put(P.date, d.date ? toISODate(d.date) : '');
  put(P.fund, d.fund);
  put(P.month, toISODate(monthStart(d.month)));
  put(P.amount, d.amount != null ? String(d.amount) : '');
  put(P.status, d.status === 'paid' ? PAID : MISSED);
  put(P.note, d.note ?? '');
  return row;
}
