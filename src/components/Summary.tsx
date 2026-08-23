import { useCallback, useEffect, useState } from 'react';
import type { SheetMeta } from '../types';
import { readSheet, type SheetsCtx } from '../lib/sheets';
import { makeFormatters, parseNumeric, type CurrencyCode } from '../lib/format';
import { columnTypeDef } from '../lib/columnTypes';
import { accentFor, initials } from '../lib/accent';
import { absoluteReturn } from '../lib/finance';
import { Badge, Banner, Button, Empty, Spinner } from './UI';
import { IconArrowDown, IconArrowUp, IconRefresh } from './Icons';

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
  const up = portfolioValue >= portfolioInvested;

  if (loading && !rows) return <Spinner label="Adding up your sheets…" />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
      {error && <Banner kind="error">{error}</Banner>}

      {rows?.length === 0 && (
        <Empty emoji="📭" title="Nothing to summarise" body="Create a sheet and add a few entries first." />
      )}

      {hasPortfolio && (
        <div
          className="animate-rise relative overflow-hidden rounded-[1.75rem] p-6 text-white shadow-card"
          style={{
            background: up
              ? 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 52%,#a855f7 100%)'
              : 'linear-gradient(135deg,#be123c 0%,#e11d48 55%,#f43f5e 100%)',
          }}
        >
          {/* Soft highlight so the card has depth rather than being a flat fill. */}
          <div className="pointer-events-none absolute -top-16 -right-10 size-52 rounded-full bg-white/12 blur-2xl" />
          <p className="text-[0.7rem] font-bold tracking-widest text-white/70 uppercase">
            Total portfolio value
          </p>
          <p className="mt-2 text-[2.6rem] leading-none font-extrabold tracking-tight tabular-nums">
            {fmt.money(portfolioValue)}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-bold tabular-nums backdrop-blur-sm">
              {up ? <IconArrowUp className="size-4" /> : <IconArrowDown className="size-4" />}
              {fmt.money(Math.abs(portfolioValue - portfolioInvested))}
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-bold tabular-nums backdrop-blur-sm">
              {fmt.pct(absoluteReturn(portfolioInvested, portfolioValue))}
            </span>
            <span className="text-sm font-semibold text-white/75">
              on {fmt.money(portfolioInvested)} invested
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {rows?.map((r, n) => {
          const color = accentFor(r.title);
          const showsReturn = r.invested != null && r.currentValue != null && r.invested > 0;
          const gained = showsReturn && r.currentValue! >= r.invested!;
          return (
            <div
              key={r.title}
              style={{ animationDelay: `${Math.min(n, 8) * 30}ms` }}
              className="animate-rise rounded-card bg-surface p-4 shadow-card"
            >
              <div className="flex items-center gap-3">
                <Badge text={initials(r.title)} color={color} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-extrabold tracking-tight">{r.title}</h3>
                  <p className="text-xs font-semibold text-muted">
                    {r.entries} {r.entries === 1 ? 'entry' : 'entries'}
                  </p>
                </div>
                {showsReturn && (
                  <div className="text-right">
                    <p className="font-extrabold tabular-nums">{fmt.money(r.currentValue!)}</p>
                    <p
                      className={`text-xs font-bold tabular-nums ${gained ? 'text-pos' : 'text-neg'}`}
                    >
                      {gained ? '▲' : '▼'} {fmt.pct(absoluteReturn(r.invested!, r.currentValue!))}
                    </p>
                  </div>
                )}
              </div>

              {r.totals.length > 0 && (
                <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-line pt-3.5">
                  {r.totals.map((t) => (
                    <div key={t.header} className="min-w-0">
                      <dt className="truncate text-[0.66rem] font-bold tracking-wider text-muted uppercase">
                        {t.header}
                      </dt>
                      <dd className="truncate text-sm font-bold tabular-nums">
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

      {rows && rows.length > 0 && (
        <div className="mt-5">
          <Button full variant="ghost" icon={<IconRefresh />} onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh from sheet'}
          </Button>
        </div>
      )}

      <p className="mt-5 px-1 text-xs leading-relaxed text-muted">
        Only columns you set to <span className="font-bold text-ink2">Money</span> or{' '}
        <span className="font-bold text-ink2">Number</span> are totalled — change a column’s type
        under Investments → ⋯ → Manage columns. The big card appears once a sheet has both an “invested”
        and a “current value” column.
      </p>
    </div>
  );
}
