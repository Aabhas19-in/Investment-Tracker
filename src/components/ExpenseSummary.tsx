import { useEffect, useMemo, useState } from 'react';
import { listSheets, readSheet, type SheetsCtx } from '../lib/sheets';
import { makeFormatters, parseNumeric, type CurrencyCode } from '../lib/format';
import {
  AMOUNT_COLUMN,
  CATEGORIES_SHEET,
  CATEGORY_COLUMN,
  findColumn,
  monthTitle,
  sortMonthSheets,
} from '../lib/expenses';
import { Banner, Empty, Spinner, inputClass } from './UI';
import { CategoryBubbles } from './CategoryBubbles';

const ACCENT = '#e0713a';

/**
 * One month of spending, broken down by category. Reads the expenses workbook
 * directly rather than sharing state with the Expenses tab, so opening Summary
 * always shows what the sheet says right now.
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
  const [totals, setTotals] = useState<[string, number][]>([]);
  const [entries, setEntries] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Month list, newest first, defaulting to the current month when it exists.
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

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await readSheet(ctx, month);
        if (dead) return;

        const catIdx = findColumn(d.headers, CATEGORY_COLUMN, d.columnTypes);
        const amtIdx = findColumn(d.headers, AMOUNT_COLUMN, d.columnTypes, 'currency');

        const map = new Map<string, number>();
        let n = 0;
        for (const row of d.rows) {
          if (!row.some((c) => c.trim())) continue;
          n++;
          const name = (catIdx >= 0 ? row[catIdx] : '').trim() || 'Uncategorised';
          const amount = amtIdx >= 0 ? (parseNumeric(row[amtIdx]) ?? 0) : 0;
          map.set(name, (map.get(name) ?? 0) + amount);
        }
        setTotals([...map.entries()].sort((a, b) => b[1] - a[1]));
        setEntries(n);
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

  const grandTotal = totals.reduce((s, [, v]) => s + v, 0);
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
            Month
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

      {loading && totals.length === 0 ? (
        <Spinner label="Adding up that month…" />
      ) : months.length === 0 ? (
        <Empty
          emoji="🗓️"
          title="No months yet"
          body="Log an expense first and the breakdown shows up here."
        />
      ) : grandTotal === 0 ? (
        <Empty
          emoji="🫙"
          title={`Nothing spent in ${month}`}
          body="Add some expenses to that month and the breakdown appears here."
        />
      ) : (
        <div className="animate-rise space-y-4">
          <div
            className="relative overflow-hidden rounded-card p-5 text-white shadow-card"
            style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, #b8442f 100%)` }}
          >
            <div className="pointer-events-none absolute -top-12 -right-8 size-40 rounded-full bg-white/12 blur-2xl" />
            <p className="text-[0.7rem] font-bold tracking-widest text-white/75 uppercase">
              {filter ? `${filter} · ${month}` : `Spent in ${month}`}
            </p>
            <p className="mt-1.5 text-[2.2rem] leading-none font-extrabold tracking-tight tabular-nums">
              {fmt.money(focused)}
            </p>
            <p className="mt-2 text-xs font-semibold text-white/75">
              {entries} {entries === 1 ? 'expense' : 'expenses'} · {totals.length}{' '}
              {totals.length === 1 ? 'category' : 'categories'}
            </p>
          </div>

          <div className="rounded-card bg-surface p-5 shadow-card">
            <CategoryBubbles
              totals={totals}
              grandTotal={grandTotal}
              selected={filter}
              fmt={fmt}
              onSelect={(name) => setFilter(filter === name ? null : name)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
