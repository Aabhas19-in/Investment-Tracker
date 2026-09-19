import { useCallback, useEffect, useState } from 'react';
import type { SheetMeta } from '../types';
import { readSheet, type SheetsCtx } from '../lib/sheets';
import { type CurrencyCode } from '../lib/format';
import { accentFor, initials } from '../lib/accent';
import { isSipPaymentsSheet } from '../lib/sip';
import { Badge, Banner, Button, Empty, Spinner } from './UI';
import { IconRefresh } from './Icons';
import { ExpenseSummary } from './ExpenseSummary';

interface SheetSummary {
  title: string;
  entries: number;
}

/**
 * A plain roll-call of the investments workbook: which sheets exist and how
 * much is in each. The numbers themselves live on the Investments tab, where
 * the entries and their totals are in front of you.
 */
function InvestmentSummary({ ctx, sheets }: { ctx: SheetsCtx; sheets: SheetMeta[] }) {
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
      // The SIP Payments log is the SIP Plans tab's own working, not a holding of its own.
      const holdings = sheets.filter((s) => !isSipPaymentsSheet(s.title));
      const all = await Promise.all(
        holdings.map(async (s) => {
          const data = await readSheet(ctx, s.title);
          return {
            title: s.title,
            entries: data.rows.filter((r) => r.some((c) => c.trim())).length,
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

  if (loading && !rows) return <Spinner label="Reading your sheets…" />;

  return (
    <div className="px-4 pb-28">
      {error && <Banner kind="error">{error}</Banner>}

      {rows?.length === 0 && (
        <Empty emoji="📭" title="Nothing to summarise" body="Create a sheet and add a few entries first." />
      )}

      <div className="space-y-3">
        {rows?.map((r, n) => (
          <div
            key={r.title}
            style={{ animationDelay: `${Math.min(n, 8) * 30}ms` }}
            className="animate-rise flex items-center gap-3 rounded-card bg-surface p-4 shadow-card"
          >
            <Badge text={initials(r.title)} color={accentFor(r.title)} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-extrabold tracking-tight">{r.title}</h3>
              <p className="text-xs font-semibold text-muted">
                {r.entries} {r.entries === 1 ? 'entry' : 'entries'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {rows && rows.length > 0 && (
        <div className="mt-5">
          <Button full variant="ghost" icon={<IconRefresh />} onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh from sheet'}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

const VIEWS = [
  { id: 'investments', label: 'Investments' },
  { id: 'expenses', label: 'Expenses' },
] as const;

type View = (typeof VIEWS)[number]['id'];

export function Summary({
  ctx,
  sheets,
  currency,
  expensesSpreadsheetId,
  clientId,
}: {
  ctx: SheetsCtx;
  sheets: SheetMeta[];
  currency: CurrencyCode;
  expensesSpreadsheetId: string;
  clientId: string;
}) {
  const [view, setView] = useState<View>('investments');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-4 pt-1 pb-4">
        <div className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`press flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors ${
                view === v.id
                  ? v.id === 'expenses'
                    ? 'bg-expense text-white'
                    : 'bg-brand text-onbrand'
                  : 'text-muted'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'investments' ? (
        <InvestmentSummary ctx={ctx} sheets={sheets} />
      ) : (
        <div className="px-4 pb-28">
          <ExpenseSummary
            spreadsheetId={expensesSpreadsheetId}
            clientId={clientId}
            currency={currency}
          />
        </div>
      )}
    </div>
  );
}
