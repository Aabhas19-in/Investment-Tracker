import { useEffect, useMemo, useState } from 'react';
import type { SheetData } from '../types';
import { listSheets, readSheet, type SheetsCtx } from '../lib/sheets';
import { makeFormatters, parseNumeric, type CurrencyCode } from '../lib/format';
import {
  AMOUNT_COLUMN,
  CATEGORIES_SHEET,
  CATEGORY_COLUMN,
  DATE_COLUMN,
  describeRow,
  findColumn,
  isIncomeSheet,
  monthTitle,
  sortMonthSheets,
} from '../lib/expenses';
import { MONTH_ABBR, dayLabel, parseSheetDate } from '../lib/dates';
import { Banner, Empty, Spinner, inputClass } from './UI';
import { CategoryBubbles } from './CategoryBubbles';
import { IncomeByMonth, type IncomeMonth } from './IncomeByMonth';
import { IconArrowDown } from './Icons';

const ACCENT = '#e0713a';

/**
 * One sheet of the expenses workbook, summarised. Months get a category
 * breakdown; the Income sheet has no categories, so it gets an itemised list
 * instead of a wall of "Uncategorised".
 */
export function ExpenseSummary({
  spreadsheetId,
  clientId,
  currency,
}: {
  spreadsheetId: string;
  clientId: string;
  currency: CurrencyCode;
}) {
  const fmt = useMemo(() => makeFormatters(currency), [currency]);
  const ctx: SheetsCtx = useMemo(() => ({ clientId, spreadsheetId }), [clientId, spreadsheetId]);

  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<SheetData | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [incomeMonth, setIncomeMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const income = month ? isIncomeSheet(month) : false;

  // Income leads the list, then months newest first (sortMonthSheets pins it).
  useEffect(() => {
    if (!spreadsheetId) return;
    let dead = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = sortMonthSheets(await listSheets(ctx))
          .map((s) => s.title)
          .filter((t) => t !== CATEGORIES_SHEET);
        if (dead) return;
        setMonths(list);
        setMonth((prev) => {
          if (prev && list.includes(prev)) return prev;
          const thisMonth = monthTitle(new Date());
          return list.find((t) => t === thisMonth) ?? list[0] ?? null;
        });
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!dead) setLoading(false);
      }
    })();

    return () => {
      dead = true;
    };
  }, [ctx, spreadsheetId]);

  useEffect(() => {
    if (!month) return;
    let dead = false;
    setFilter(null);
    setIncomeMonth(null);

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await readSheet(ctx, month);
        if (!dead) setData(d);
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!dead) setLoading(false);
      }
    })();

    return () => {
      dead = true;
    };
  }, [ctx, month]);

  const filled = useMemo(
    () => (data?.rows ?? []).filter((r) => r.some((c) => c.trim())),
    [data],
  );

  const amtIdx = data ? findColumn(data.headers, AMOUNT_COLUMN, data.columnTypes, 'currency') : -1;
  const dateIdx = data ? findColumn(data.headers, DATE_COLUMN, data.columnTypes, 'date') : -1;
  const catIdx = data ? findColumn(data.headers, CATEGORY_COLUMN, data.columnTypes) : -1;

  const amountOf = (row: string[]) => (amtIdx >= 0 ? (parseNumeric(row[amtIdx]) ?? 0) : 0);

  /** Category totals, biggest first — months only. */
  const totals = useMemo<[string, number][]>(() => {
    if (!data || income) return [];
    const map = new Map<string, number>();
    for (const row of filled) {
      const name = (catIdx >= 0 ? row[catIdx] : '').trim() || 'Uncategorised';
      map.set(name, (map.get(name) ?? 0) + amountOf(row));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filled, income, catIdx, amtIdx]);

  /** Individual receipts, newest first — the Income sheet only. */
  const incomeRows = useMemo(() => {
    if (!data || !income) return [];
    return filled
      .map((row) => ({
        label: describeRow(data.headers, row, [dateIdx, amtIdx], 'Income'),
        date: dateIdx >= 0 ? parseSheetDate(row[dateIdx]) : null,
        amount: amountOf(row),
      }))
      .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filled, income, dateIdx, amtIdx]);

  /**
   * Income grouped by the month its date falls in — oldest first, which is the
   * order the bars read in. Rows without a usable date collect at the end so
   * they are still visible rather than silently dropped.
   */
  const incomeMonths = useMemo<IncomeMonth[]>(() => {
    const map = new Map<string, { date: Date | null; total: number; count: number }>();
    for (const r of incomeRows) {
      const key = r.date ? monthTitle(r.date) : 'No date';
      const g = map.get(key) ?? { date: r.date, total: 0, count: 0 };
      g.total += r.amount;
      g.count += 1;
      map.set(key, g);
    }
    return [...map.entries()]
      .sort((a, b) => (a[1].date?.getTime() ?? Infinity) - (b[1].date?.getTime() ?? Infinity))
      .map(([key, g]) => ({
        key,
        short: g.date ? MONTH_ABBR[g.date.getMonth()] : '—',
        year: g.date ? String(g.date.getFullYear()).slice(2) : '',
        total: g.total,
        count: g.count,
      }));
  }, [incomeRows]);

  const visibleIncome = useMemo(
    () =>
      incomeMonth === null
        ? incomeRows
        : incomeRows.filter((r) => (r.date ? monthTitle(r.date) : 'No date') === incomeMonth),
    [incomeRows, incomeMonth],
  );

  const grandTotal = income
    ? visibleIncome.reduce((s, r) => s + r.amount, 0)
    : totals.reduce((s, [, v]) => s + v, 0);
  const focused = filter ? (totals.find(([n]) => n === filter)?.[1] ?? 0) : grandTotal;

  if (!spreadsheetId) {
    return (
      <Empty
        emoji="🧾"
        title="No expenses sheet linked"
        body="Add an expenses spreadsheet under Settings → Connection, then come back here."
      />
    );
  }

  return (
    <div>
      {months.length > 0 && (
        <label className="mb-4 block">
          <span className="mb-2 block text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
            Sheet
          </span>
          <select
            className={inputClass}
            value={month ?? ''}
            onChange={(e) => setMonth(e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <Banner kind="error">{error}</Banner>}

      {loading && !data ? (
        <Spinner label="Adding that up…" />
      ) : months.length === 0 ? (
        <Empty
          emoji="🗓️"
          title="No months yet"
          body="Log an expense first and the breakdown shows up here."
        />
      ) : grandTotal === 0 ? (
        <Empty
          emoji="🫙"
          title={income ? 'No income recorded' : `Nothing spent in ${month}`}
          body={
            income
              ? 'Add a row to your Income sheet and it appears here.'
              : 'Add some expenses to that month and the breakdown appears here.'
          }
        />
      ) : (
        <div className="animate-rise space-y-4">
          <div
            className="relative overflow-hidden rounded-card p-5 text-white shadow-card"
            style={{
              background: income
                ? 'linear-gradient(135deg,#0e9f6e 0%,#046c4e 100%)'
                : `linear-gradient(135deg, ${ACCENT} 0%, #b8442f 100%)`,
            }}
          >
            <div className="pointer-events-none absolute -top-12 -right-8 size-40 rounded-full bg-white/12 blur-2xl" />
            <p className="text-[0.7rem] font-bold tracking-widest text-white/75 uppercase">
              {income
                ? incomeMonth
                  ? `Income · ${incomeMonth}`
                  : 'Total income'
                : filter
                  ? `${filter} · ${month}`
                  : `Spent in ${month}`}
            </p>
            <p className="mt-1.5 text-[2.2rem] leading-none font-extrabold tracking-tight tabular-nums">
              {fmt.money(focused)}
            </p>
            <p className="mt-2 text-xs font-semibold text-white/75">
              {income
                ? `${visibleIncome.length} ${visibleIncome.length === 1 ? 'entry' : 'entries'} · ${incomeMonths.length} ${incomeMonths.length === 1 ? 'month' : 'months'}`
                : `${filled.length} ${filled.length === 1 ? 'expense' : 'expenses'} · ${totals.length} ${
                    totals.length === 1 ? 'category' : 'categories'
                  }`}
            </p>
          </div>

          {income ? (
            <>
              <IncomeByMonth
                months={incomeMonths}
                selected={incomeMonth}
                fmt={fmt}
                onSelect={setIncomeMonth}
              />

              <ul className="overflow-hidden rounded-card bg-surface shadow-card">
                {visibleIncome.map((r, i) => (
                <li
                  key={`${r.label}-${i}`}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    i > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pos/12 text-pos">
                    <IconArrowDown className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.label}</p>
                    {r.date && (
                      <p className="text-xs font-medium text-muted">{dayLabel(r.date)}</p>
                    )}
                  </div>
                    <span className="shrink-0 font-extrabold text-pos tabular-nums">
                      + {fmt.money(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded-card bg-surface p-5 shadow-card">
              <CategoryBubbles
                totals={totals}
                grandTotal={grandTotal}
                selected={filter}
                fmt={fmt}
                onSelect={(name) => setFilter(filter === name ? null : name)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
