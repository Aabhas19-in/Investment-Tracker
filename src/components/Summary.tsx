import { useCallback, useEffect, useState } from 'react';
import type { SheetMeta } from '../types';
import { readSheet, type SheetsCtx } from '../lib/sheets';
import { makeFormatters, parseNumeric, type CurrencyCode } from '../lib/format';
import { columnTypeDef } from '../lib/columnTypes';
import { absoluteReturn } from '../lib/finance';
import { Banner, Button, Empty, Spinner } from './UI';

interface SheetSummary {
  title: string;
  entries: number;
  totals: { header: string; total: number }[];
  invested?: number;
  currentValue?: number;
}

/** Best-effort guess at which column holds money in vs money now, purely from the header text. */
function pickColumn(headers: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

const INVESTED = [/amount\s*invested/i, /^invested/i, /invest/i, /principal/i, /cost/i, /buy\s*value/i];
const CURRENT = [/current\s*value/i, /^value$/i, /market\s*value/i, /maturity\s*amount/i, /present\s*value/i];

export function Summary({
  ctx,
  sheets,
  currency,
}: {
  ctx: SheetsCtx;
  sheets: SheetMeta[];
  currency: CurrencyCode;
}) {
  const fmt = makeFormatters(currency);
  const [rows, setRows] = useState<SheetSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (sheets.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const all = await Promise.all(
        sheets.map(async (s) => {
          const data = await readSheet(ctx, s.title);
          // Only columns you typed as Money or Number get totalled.
          const totalable = data.headers.map((_, i) =>
            columnTypeDef(data.columnTypes[i] ?? 'text').totals,
          );
          const totals = data.headers
            .map((header, i) => ({ header, i }))
            .filter(({ i }) => totalable[i])
            .map(({ header, i }) => ({
              header,
              total: data.rows.reduce((sum, r) => sum + (parseNumeric(r[i]) ?? 0), 0),
            }));

          const onlyTotalable = (idx: number) => (idx >= 0 && totalable[idx] ? idx : -1);
          const invIdx = onlyTotalable(pickColumn(data.headers, INVESTED));
          const curIdx = onlyTotalable(pickColumn(data.headers, CURRENT));
          const sumAt = (idx: number) =>
            idx < 0 ? undefined : data.rows.reduce((sum, r) => sum + (parseNumeric(r[idx]) ?? 0), 0);

          return {
            title: s.title,
            entries: data.rows.filter((r) => r.some((c) => c.trim())).length,
            totals,
            invested: sumAt(invIdx),
            currentValue: sumAt(curIdx),
          } satisfies SheetSummary;
        }),
      );
      setRows(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ctx, sheets]);

  useEffect(() => {
    void load();
  }, [load]);

  const portfolioInvested = rows?.reduce((s, r) => s + (r.invested ?? 0), 0) ?? 0;
  const portfolioValue = rows?.reduce((s, r) => s + (r.currentValue ?? 0), 0) ?? 0;
  const hasPortfolio = portfolioInvested > 0 && portfolioValue > 0;

  if (loading && !rows) return <Spinner label="Adding up your sheets…" />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-28">
      {error && <Banner kind="error">{error}</Banner>}

      {rows?.length === 0 && (
        <Empty title="Nothing to summarise" body="Create a sheet and add a few entries first." />
      )}

      {hasPortfolio && (
        <div className="mb-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
          <p className="text-xs font-medium tracking-wide text-emerald-300/80 uppercase">
            Across all sheets
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{fmt.money(portfolioValue)}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-[var(--color-mute)]">
              Invested <span className="text-slate-200">{fmt.money(portfolioInvested)}</span>
            </span>
            <span
              className={portfolioValue >= portfolioInvested ? 'text-emerald-300' : 'text-rose-300'}
            >
              {portfolioValue >= portfolioInvested ? '▲' : '▼'}{' '}
              {fmt.money(Math.abs(portfolioValue - portfolioInvested))} (
              {fmt.pct(absoluteReturn(portfolioInvested, portfolioValue))})
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {rows?.map((r) => {
          const showsReturn = r.invested != null && r.currentValue != null && r.invested > 0;
          return (
            <div
              key={r.title}
              className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink-soft)] p-4"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{r.title}</h3>
                <span className="text-xs text-[var(--color-mute)]">
                  {r.entries} {r.entries === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              {showsReturn && (
                <p
                  className={`mt-1 text-sm ${
                    r.currentValue! >= r.invested! ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {fmt.money(r.currentValue!)} · {fmt.pct(absoluteReturn(r.invested!, r.currentValue!))}
                </p>
              )}

              {r.totals.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--color-mute)]">
                  No Money or Number columns to total.
                </p>
              ) : (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  {r.totals.map((t) => (
                    <div key={t.header} className="min-w-0">
                      <dt className="truncate text-xs text-[var(--color-mute)]">{t.header}</dt>
                      <dd className="tabular-nums">
                        {t.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <Button full variant="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh from sheet'}
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--color-mute)]">
        Only columns you set to <span className="text-slate-300">Money</span> or{' '}
        <span className="text-slate-300">Number</span> are totalled — set a column’s type under
        Sheets → ⋯ → Manage columns. The portfolio card appears when a sheet has both an “invested”
        and a “current value” style column.
      </p>
    </div>
  );
}
