import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SheetData, SheetMeta } from '../types';
import * as api from '../lib/sheets';
import type { ColumnType } from '../lib/columnTypes';
import { makeFormatters, parseNumeric, type CurrencyCode } from '../lib/format';
import { sheetUrl } from '../lib/config';
import { accentFor } from '../lib/accent';
import {
  AMOUNT_COLUMN,
  CATEGORY_COLUMN,
  DATE_COLUMN,
  EXPENSE_COLUMNS,
  categoriesIn,
  dayLabel,
  findColumn,
  monthTitle,
  parseSheetDate,
  sortMonthSheets,
} from '../lib/expenses';
import { Banner, Button, Empty, IconButton, Sheet, Spinner } from './UI';
import { IconDots, IconExternal, IconPlus, IconRefresh, IconTrash } from './Icons';
import { ColumnManager } from './Manage';
import { ExpenseEditor } from './ExpenseEditor';

const ACCENT = '#e0713a';

export function ExpensesView({
  spreadsheetId,
  clientId,
  currency,
}: {
  spreadsheetId: string;
  clientId: string;
  currency: CurrencyCode;
}) {
  const ctx: api.SheetsCtx = useMemo(() => ({ clientId, spreadsheetId }), [clientId, spreadsheetId]);
  const fmt = useMemo(() => makeFormatters(currency), [currency]);

  const [months, setMonths] = useState<SheetMeta[]>([]);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [newMonthOpen, setNewMonthOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const active = months.find((m) => m.title === activeTitle) ?? null;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const loadMonths = useCallback(
    async (prefer?: string) => {
      if (!spreadsheetId) return;
      setLoading(true);
      setError(null);
      try {
        const list = sortMonthSheets(await api.listSheets(ctx));
        setMonths(list);
        setActiveTitle((prev) => {
          const wanted = prefer ?? prev;
          if (list.some((s) => s.title === wanted)) return wanted!;
          // Default to this month's tab when it exists, otherwise the newest one.
          const thisMonth = monthTitle(new Date());
          return list.find((s) => s.title === thisMonth)?.title ?? list[0]?.title ?? null;
        });
      } catch (e) {
        fail(e);
      } finally {
        setLoading(false);
      }
    },
    [ctx, spreadsheetId],
  );

  const loadData = useCallback(
    async (title: string | null) => {
      if (!title || !spreadsheetId) return setData(null);
      setLoading(true);
      setError(null);
      try {
        setData(await api.readSheet(ctx, title));
      } catch (e) {
        fail(e);
      } finally {
        setLoading(false);
      }
    },
    [ctx, spreadsheetId],
  );

  useEffect(() => {
    void loadMonths();
  }, [loadMonths]);

  useEffect(() => {
    void loadData(activeTitle);
    setFilter(null);
  }, [activeTitle, loadData]);

  const mutate = async (fn: () => Promise<unknown>, opts: { relist?: string | true } = {}) => {
    setError(null);
    try {
      await fn();
      if (opts.relist) await loadMonths(typeof opts.relist === 'string' ? opts.relist : undefined);
      else await loadData(activeTitle);
    } catch (e) {
      fail(e);
      throw e;
    }
  };

  /* ------------------------------------------------------------- derived */

  const headers = data?.headers ?? [];
  const types: ColumnType[] = data?.columnTypes ?? [];
  const rows = data?.rows ?? [];

  const dateIdx = findColumn(headers, DATE_COLUMN, types, 'date');
  const catIdx = findColumn(headers, CATEGORY_COLUMN, types);
  const amountIdx = findColumn(headers, AMOUNT_COLUMN, types, 'currency');

  const categories = useMemo(() => categoriesIn(rows, catIdx), [rows, catIdx]);

  const entries = useMemo(
    () =>
      rows
        .map((row, index) => ({
          row,
          index,
          date: dateIdx >= 0 ? parseSheetDate(row[dateIdx]) : null,
          category: catIdx >= 0 ? row[catIdx]?.trim() : '',
          amount: amountIdx >= 0 ? (parseNumeric(row[amountIdx]) ?? 0) : 0,
        }))
        .filter((e) => e.row.some((c) => c.trim())),
    [rows, dateIdx, catIdx, amountIdx],
  );

  const shown = filter ? entries.filter((e) => e.category === filter) : entries;
  const monthTotal = shown.reduce((s, e) => s + e.amount, 0);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.category || '—', (map.get(e.category || '—') ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  /** Newest day first — the shape a day-to-day expense log actually wants. */
  const byDay = useMemo(() => {
    const groups = new Map<string, { label: string; sort: number; items: typeof shown }>();
    for (const e of shown) {
      const key = e.date ? e.date.toDateString() : (e.row[dateIdx] || 'No date');
      const g = groups.get(key) ?? {
        label: e.date ? dayLabel(e.date) : 'No date',
        sort: e.date ? e.date.getTime() : -1,
        items: [],
      };
      g.items.push(e);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.sort - a.sort);
  }, [shown, dateIdx]);

  const missingDate = headers.length > 0 && dateIdx < 0;

  /**
   * A Date column without DATE formatting displays Google's raw serial number
   * (46256 rather than 23-Aug-2026). Sheets you built by hand won't have it, so
   * stamp the format on once per sheet and re-read.
   */
  const healAttempts = useRef(new Map<string, number>());
  useEffect(() => {
    if (!active || dateIdx < 0 || !data) return;

    // Trust the symptom, not just the reported format: a date cell rendering as
    // a bare 5-digit serial means that row never got the column's DATE format.
    const showsSerial = rows.some((r) => /^\d{5}(\.\d+)?$/.test((r[dateIdx] ?? '').trim()));
    if (types[dateIdx] === 'date' && !showsSerial) return;

    const tries = healAttempts.current.get(active.title) ?? 0;
    if (tries >= 3) return; // never loop on a sheet we can't fix
    healAttempts.current.set(active.title, tries + 1);

    void (async () => {
      try {
        await api.setColumnType(ctx, active.sheetId, dateIdx, 'date', currency);
        await loadData(active.title);
      } catch (e) {
        fail(e);
      }
    })();
  }, [active, data, rows, dateIdx, types, ctx, currency, loadData]);

  /* ----------------------------------------------------------------- ui */

  if (!spreadsheetId) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Empty
          emoji="🧾"
          title="No expenses sheet linked"
          body="Add an expenses spreadsheet under Settings → Connection, then come back here."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Month switcher */}
      <div className="scroll-x flex shrink-0 gap-2.5 px-4 pt-1 pb-3">
        {months.map((m) => {
          const on = active?.sheetId === m.sheetId;
          return (
            <button
              key={m.sheetId}
              onClick={() => setActiveTitle(m.title)}
              style={on ? { background: ACCENT, color: '#fff' } : { ['--accent' as string]: ACCENT }}
              className={`press shrink-0 rounded-2xl px-4 py-2.5 text-sm font-bold ${
                on ? 'shadow-card' : 'accent-chip'
              }`}
            >
              {m.title}
            </button>
          );
        })}
        <button
          onClick={() => setNewMonthOpen(true)}
          className="press flex shrink-0 items-center gap-1.5 rounded-2xl border border-dashed border-line px-4 py-2.5 text-sm font-bold text-muted"
        >
          <IconPlus className="size-4" />
          Month
        </button>
      </div>

      {error && (
        <div className="px-4 pb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      {active && headers.length > 0 && (
        <div className="shrink-0 px-4 pb-3">
          {/* Month total */}
          <div
            className="relative overflow-hidden rounded-card p-5 text-white shadow-card"
            style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, #b8442f 100%)` }}
          >
            <div className="pointer-events-none absolute -top-12 -right-8 size-40 rounded-full bg-white/12 blur-2xl" />
            <p className="text-[0.7rem] font-bold tracking-widest text-white/75 uppercase">
              {filter ? `${filter} · ${active.title}` : `Spent in ${active.title}`}
            </p>
            <p className="mt-1.5 text-[2.2rem] leading-none font-extrabold tracking-tight tabular-nums">
              {fmt.money(monthTotal)}
            </p>
            <p className="mt-2 text-xs font-semibold text-white/75">
              {shown.length} {shown.length === 1 ? 'expense' : 'expenses'}
            </p>
          </div>

          {/* Divisions inside the month */}
          {categoryTotals.length > 0 && (
            <div className="scroll-x -mx-4 mt-3 flex gap-2 px-4">
              <button
                onClick={() => setFilter(null)}
                className={`press shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                  filter === null ? 'border-brand bg-brandsoft text-brand' : 'border-line text-muted'
                }`}
              >
                All
              </button>
              {categoryTotals.map(([name, total]) => (
                <button
                  key={name}
                  onClick={() => setFilter(filter === name ? null : name)}
                  className={`press shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                    filter === name ? 'border-brand bg-brandsoft text-brand' : 'border-line text-muted'
                  }`}
                >
                  {name}
                  <span className="ml-1.5 tabular-nums opacity-70">{fmt.money(total)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <p className="text-sm font-bold">{active.title}</p>
              <p className="text-xs font-medium text-muted">Tap an expense to edit or delete</p>
            </div>
            <IconButton label="Refresh" onClick={() => void loadData(activeTitle)}>
              <IconRefresh />
            </IconButton>
            <IconButton
              label="Month options"
              onClick={() => {
                setConfirmDelete(false);
                setMoreOpen(true);
              }}
            >
              <IconDots />
            </IconButton>
          </div>

          {missingDate && (
            <div className="mt-3">
              <Banner kind="error">
                This sheet has no Date column. Add one from ⋯ → Manage columns so expenses can be
                dated.
              </Banner>
            </div>
          )}
        </div>
      )}

      {/* Entries grouped by day */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !data ? (
          <Spinner label="Reading your expenses…" />
        ) : months.length === 0 ? (
          <Empty
            emoji="🗓️"
            title="No months yet"
            body="Create a month sheet to start logging expenses. One tab per month keeps things tidy."
            action={
              <Button icon={<IconPlus />} onClick={() => setNewMonthOpen(true)}>
                Add {monthTitle(new Date())}
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <Empty
            emoji={filter ? '🔍' : '🧾'}
            title={filter ? `Nothing under ${filter}` : 'No expenses yet'}
            body={
              filter
                ? 'Tap All to see everything in this month.'
                : 'Tap the + button to log your first expense. The date is filled in for you.'
            }
          />
        ) : (
          <div className="space-y-5 px-4 pb-32">
            {byDay.map((g, gi) => {
              const dayTotal = g.items.reduce((s, e) => s + e.amount, 0);
              return (
                <section
                  key={g.label + gi}
                  style={{ animationDelay: `${Math.min(gi, 6) * 30}ms` }}
                  className="animate-rise"
                >
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h3 className="text-xs font-extrabold tracking-wider text-muted uppercase">
                      {g.label}
                    </h3>
                    <span className="text-xs font-bold tabular-nums text-muted">
                      {fmt.money(dayTotal)}
                    </span>
                  </div>

                  <ul className="overflow-hidden rounded-card bg-surface shadow-card">
                    {g.items.map((e, i) => (
                      <li
                        key={e.index}
                        onClick={() => setEditing(e.index)}
                        className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 active:bg-surface2 ${
                          i > 0 ? 'border-t border-line' : ''
                        }`}
                      >
                        <span
                          className="grid size-10 shrink-0 place-items-center rounded-2xl text-sm"
                          style={{
                            background: `color-mix(in srgb, ${accentFor(e.category || 'x')} 16%, transparent)`,
                          }}
                        >
                          {(e.category || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{e.category || 'Uncategorised'}</p>
                          <p className="truncate text-xs font-medium text-muted">
                            {headers
                              .map((_, hi) =>
                                hi !== dateIdx && hi !== catIdx && hi !== amountIdx && e.row[hi]?.trim()
                                  ? e.row[hi]
                                  : null,
                              )
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                        </div>
                        <span className="shrink-0 font-extrabold tabular-nums">
                          {amountIdx >= 0 ? e.row[amountIdx] || fmt.money(0) : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {active && headers.length > 0 && (
        <button
          onClick={() => setEditing('new')}
          style={{ background: ACCENT }}
          className="press fixed right-5 bottom-26 z-30 grid size-15 place-items-center rounded-[1.4rem] text-white shadow-glow"
          aria-label="Add expense"
        >
          <IconPlus className="size-7" strokeWidth={2.4} />
        </button>
      )}

      <NewMonthDialog
        open={newMonthOpen}
        existing={months.map((m) => m.title)}
        onClose={() => setNewMonthOpen(false)}
        onCreate={async (title) => {
          await mutate(() => api.addSheet(ctx, title, EXPENSE_COLUMNS, currency), { relist: title });
          setNewMonthOpen(false);
        }}
      />

      {active && (
        <ColumnManager
          open={columnsOpen}
          headers={headers}
          columnTypes={types}
          sheetTitle={active.title}
          lockedColumns={[DATE_COLUMN]}
          onClose={() => setColumnsOpen(false)}
          onAdd={(name, type) =>
            mutate(async () => {
              await api.addColumn(ctx, active, name, headers.length, type, currency);
              await loadMonths(active.title);
            })
          }
          onRename={(i, name) => mutate(() => api.renameColumn(ctx, active.title, i, name))}
          onRetype={(i, type) => mutate(() => api.setColumnType(ctx, active.sheetId, i, type, currency))}
          onDelete={(i) => mutate(() => api.deleteColumn(ctx, active.sheetId, i))}
        />
      )}

      {active && (
        <ExpenseEditor
          open={editing !== null}
          headers={headers}
          columnTypes={types}
          dateIndex={dateIdx}
          categoryIndex={catIdx}
          categories={categories}
          sheetTitle={active.title}
          accent={ACCENT}
          displayRow={typeof editing === 'number' ? (rows[editing] ?? []) : null}
          formulaRow={typeof editing === 'number' ? (data?.formulaRows[editing] ?? []) : null}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            if (typeof editing === 'number') {
              await mutate(() => api.updateRow(ctx, active.title, editing, values));
            } else {
              await mutate(async () => {
                await api.appendRow(ctx, active.title, values);
                // Guarantees the new row's date renders as a date, whatever
                // formatting the sheet's blank rows happened to carry.
                if (dateIdx >= 0) {
                  await api.setColumnType(ctx, active.sheetId, dateIdx, 'date', currency);
                }
              });
            }
            setEditing(null);
          }}
          onDelete={
            typeof editing === 'number'
              ? async () => {
                  await mutate(() => api.deleteRow(ctx, active.sheetId, editing));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}

      {active && (
        <Sheet open={moreOpen} title={active.title} onClose={() => setMoreOpen(false)}>
          <div className="space-y-3">
            <Button
              full
              variant="ghost"
              onClick={() => {
                setMoreOpen(false);
                setColumnsOpen(true);
              }}
            >
              Manage columns
            </Button>

            <a
              href={sheetUrl(spreadsheetId, active.sheetId)}
              target="_blank"
              rel="noreferrer"
              className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-5 text-[0.9rem] font-bold text-ink2 shadow-soft"
            >
              <IconExternal className="size-5" />
              Open in Google Sheets
            </a>

            <div className="border-t border-line pt-3">
              {confirmDelete ? (
                <Button
                  full
                  variant="danger"
                  icon={<IconTrash />}
                  onClick={async () => {
                    await mutate(() => api.deleteSheet(ctx, active.sheetId), { relist: true });
                    setMoreOpen(false);
                  }}
                >
                  Yes, delete “{active.title}”
                </Button>
              ) : (
                <Button full variant="danger" icon={<IconTrash />} onClick={() => setConfirmDelete(true)}>
                  Delete this month
                </Button>
              )}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function NewMonthDialog({
  open,
  existing,
  onClose,
  onCreate,
}: {
  open: boolean;
  existing: string[];
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMonth(new Date().getMonth());
    setYear(new Date().getFullYear());
    setError(null);
  }, [open]);

  const title = `${MONTH_NAMES[month]} ${year}`;
  const taken = existing.some((t) => t.toLowerCase() === title.toLowerCase());

  return (
    <Sheet open={open} title="New month" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-card bg-surface p-4 shadow-card">
          <button
            onClick={() => setYear(year - 1)}
            className="press grid size-10 place-items-center rounded-xl bg-surface2 font-bold"
          >
            −
          </button>
          <span className="text-xl font-extrabold tabular-nums">{year}</span>
          <button
            onClick={() => setYear(year + 1)}
            className="press grid size-10 place-items-center rounded-xl bg-surface2 font-bold"
          >
            +
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {MONTH_NAMES.map((m, i) => {
            const on = i === month;
            const already = existing.some((t) => t.toLowerCase() === `${m} ${year}`.toLowerCase());
            return (
              <button
                key={m}
                onClick={() => setMonth(i)}
                className={`press rounded-xl border-2 py-3 text-sm font-bold ${
                  on
                    ? 'border-brand bg-brandsoft text-brand'
                    : already
                      ? 'border-line text-muted/40'
                      : 'border-line text-muted'
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>

        <p className="text-center text-sm font-semibold text-muted">
          Creates a tab called <span className="font-extrabold text-ink">{title}</span> with Date,
          Category, Amount and Note columns.
        </p>

        {taken && <Banner kind="error">{title} already exists.</Banner>}
        {error && <Banner kind="error">{error}</Banner>}

        <Button
          full
          disabled={busy || taken}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onCreate(title);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Creating…' : `Create ${title}`}
        </Button>
      </div>
    </Sheet>
  );
}
