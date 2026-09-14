import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ColumnSpec, SheetData, SheetMeta } from '../types';
import * as api from '../lib/sheets';
import { makeFormatters, parseNumeric, type CurrencyCode, type Formatters } from '../lib/format';
import { accentFor, initials } from '../lib/accent';
import { sheetUrl } from '../lib/config';
import { MONTH_ABBR, parseSheetDate, toISODate, todayISO } from '../lib/dates';
import { triggerTone } from '../lib/triggers';
import {
  MISSED,
  PAID,
  PAYMENT_COLUMNS,
  PLAN_COLUMNS,
  SIP_ACCENT,
  SIP_PAYMENTS_SHEET,
  SIP_PLANS_SHEET,
  dueDate,
  findSipSheets,
  firstInstalmentMonth,
  fundKey,
  fundNameProblem,
  missingColumns,
  monthIndex,
  monthLabel,
  monthShort,
  monthsDueSince,
  ordinal,
  parseDay,
  paymentLayout,
  paymentRow,
  paymentStyling,
  planCells,
  planFormulaCells,
  planLayout,
  readPayments,
  readPlans,
  recordDate,
  sipStatus,
  startOfDay,
  type MonthCell,
  type MonthState,
  type PlanDraft,
  type SipPayment,
  type SipPlan,
  type SipStatus,
} from '../lib/sip';
import { Badge, Banner, Button, Empty, Field, IconButton, Sheet, Spinner, inputClass } from './UI';
import { DateField } from './DateField';
import { IconExternal, IconPencil, IconPlus, IconRefresh, IconTrash } from './Icons';

type Mark = 'paid' | 'missed' | null;

const DAY_MS = 86_400_000;
const daysBetween = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);

/** "5 Sep 2026" — spelled with the app's own month names; en-IN would say "Sept". */
const longDate = (d: Date) => `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;

/** "5 Sep", with the year only once it isn't this one. */
const shortDate = (d: Date) =>
  d.getFullYear() === new Date().getFullYear()
    ? `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`
    : longDate(d);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Everything written below starts from a fresh read of both tabs, never from what's on screen. */
interface Fresh {
  plansMeta: SheetMeta;
  paymentsMeta: SheetMeta;
  plans: SheetData;
  payments: SheetData;
}

/**
 * The SIP tracker, shown on the Investments tab behind its own chip.
 *
 * Auto-pay moves the money; this is where you confirm it moved. Each SIP shows
 * this month's debit — due, upcoming, paid or missed — with one tap to mark it,
 * and a strip of recent months so a gap is obvious at a glance.
 */
export function SipView({
  clientId,
  spreadsheetId,
  sheets,
  currency,
  onSheetsChanged,
  onAttentionChange,
}: {
  clientId: string;
  spreadsheetId: string;
  /** Every tab in the investments workbook; the SIP ones are picked out by name. */
  sheets: SheetMeta[];
  currency: CurrencyCode;
  /** Re-lists the workbook's tabs once the SIP tabs are created or reshaped. */
  onSheetsChanged: () => Promise<void> | void;
  /** How many SIPs have a debit that's gone by unmarked, for the badges. */
  onAttentionChange: (count: number) => void;
}) {
  const ctx = useMemo<api.SheetsCtx>(() => ({ clientId, spreadsheetId }), [clientId, spreadsheetId]);
  const fmt = useMemo(() => makeFormatters(currency), [currency]);
  const tabs = useMemo(() => findSipSheets(sheets), [sheets]);
  const plansTitle = tabs.plans?.title ?? null;
  const paymentsTitle = tabs.payments?.title ?? null;

  const [plansData, setPlansData] = useState<SheetData | null>(null);
  const [paymentsData, setPaymentsData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SipPlan | 'new' | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  /** When the editor was opened from a SIP's history, that's where closing it returns. */
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [showStopped, setShowStopped] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plans, payments] = await Promise.all([
        plansTitle ? api.readSheet(ctx, plansTitle) : null,
        paymentsTitle ? api.readSheet(ctx, paymentsTitle) : null,
      ]);
      setPlansData(plans);
      setPaymentsData(payments);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [ctx, plansTitle, paymentsTitle]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ------------------------------------------------------------- derived */

  // A string, so the memo below rolls over at midnight but not on every render.
  const todayKey = todayISO();

  const statuses = useMemo(() => {
    const today = parseSheetDate(todayKey) ?? new Date();
    const records = readPayments(paymentsData);
    return readPlans(plansData).map((p) => sipStatus(p, records, today));
  }, [plansData, paymentsData, todayKey]);

  /** Anything needing a tap first, then by how soon this month's debit is. */
  const running = useMemo(
    () =>
      statuses
        .filter((s) => !s.plan.stopped)
        .sort(
          (a, b) =>
            Number(b.needsAttention) - Number(a.needsAttention) ||
            a.current.due.getTime() - b.current.due.getTime() ||
            a.plan.fund.localeCompare(b.plan.fund),
        ),
    [statuses],
  );
  const stopped = statuses.filter((s) => s.plan.stopped);
  const attention = running.filter((s) => s.needsAttention).length;

  // Only once the plans are actually on screen — a zero while loading would
  // flash the badge off and back on.
  const settled = !plansTitle || plansData !== null;
  useEffect(() => {
    if (settled) onAttentionChange(attention);
  }, [settled, attention, onAttentionChange]);

  const gaps = useMemo(() => missingColumns(plansData, paymentsData), [plansData, paymentsData]);
  const needsRepair = gaps.plans.length > 0 || gaps.payments.length > 0;

  const detail = statuses.find((s) => s.plan.key === detailKey) ?? null;
  const thisMonth = monthIndex(parseSheetDate(todayKey) ?? new Date());

  const monthly = running.reduce((sum, s) => sum + (s.plan.amount ?? 0), 0);
  const invested = statuses.reduce((sum, s) => sum + s.invested, 0);
  const instalments = statuses.reduce((sum, s) => sum + s.instalments, 0);
  const valued = statuses.filter((s) => s.plan.currentValue != null);
  const value = valued.reduce((sum, s) => sum + (s.plan.currentValue ?? 0), 0);
  const valuedInvested = valued.reduce((sum, s) => sum + s.invested, 0);
  const expectedNow = running.filter((s) => s.current.state !== 'idle');
  const paidNow = expectedNow.filter((s) => s.current.state === 'paid').length;

  /* ----------------------------------------------------------- mutations */

  /** Card and history actions: one at a time, errors on the banner. Resolves true on success. */
  const act = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reread = async (plansT: string, paymentsT: string) => {
    const [plans, payments] = await Promise.all([
      api.readSheet(ctx, plansT),
      api.readSheet(ctx, paymentsT),
    ]);
    setPlansData(plans);
    setPaymentsData(payments);
  };

  const missingColumnsError = () =>
    new Error(
      'Your SIP tabs are missing columns the app needs. Tap “Add missing columns” on the SIP page first.',
    );

  /**
   * Creates whichever SIP tab doesn't exist yet, then reads both fresh. Rows are
   * found again by fund name in that fresh read, so a row that moved in Google
   * Sheets in the meantime is never overwritten by its old position.
   */
  const prepare = async (): Promise<Fresh> => {
    let list = sheets;
    let created = false;

    if (!findSipSheets(list).payments) {
      const id = await api.addSheet(ctx, SIP_PAYMENTS_SHEET, PAYMENT_COLUMNS, currency);
      if (id != null) {
        const headers = PAYMENT_COLUMNS.map((c) => c.name);
        await api.styleColumns(ctx, id, paymentStyling(paymentLayout(headers)));
      }
      created = true;
    }
    if (!findSipSheets(list).plans) {
      await api.addSheet(ctx, SIP_PLANS_SHEET, PLAN_COLUMNS, currency);
      created = true;
    }
    if (created) {
      list = await api.listSheets(ctx);
      void onSheetsChanged();
    }

    const found = findSipSheets(list);
    if (!found.plans || !found.payments) {
      throw new Error('The SIP tabs couldn’t be found. Refresh and try again.');
    }
    const [plans, payments] = await Promise.all([
      api.readSheet(ctx, found.plans.title),
      api.readSheet(ctx, found.payments.title),
    ]);
    const missing = missingColumns(plans, payments);
    if (missing.plans.length || missing.payments.length) throw missingColumnsError();
    return { plansMeta: found.plans, paymentsMeta: found.payments, plans, payments };
  };

  /** Month-level writes only need the payments tab, so they skip reading the plans. */
  const freshPayments = async (): Promise<{ meta: SheetMeta; data: SheetData }> => {
    if (!tabs.payments) {
      const f = await prepare();
      return { meta: f.paymentsMeta, data: f.payments };
    }
    const data = await api.readSheet(ctx, tabs.payments.title);
    if (missingColumns(null, data).payments.length) throw missingColumnsError();
    return { meta: tabs.payments, data };
  };

  /**
   * Keeps "Instalments paid" and "Amount invested" pointing at the right row for
   * every plan. Cheap to redo on each save, and it quietly repairs formulas
   * after rows were sorted or moved in Google Sheets.
   */
  const formulaCells = (f: Fresh, plansHeaders: string[], rowIndices: number[]): api.CellWrite[] => {
    const L = planLayout(plansHeaders);
    const P = paymentLayout(f.payments.headers);
    return rowIndices.flatMap((rowIndex) =>
      planFormulaCells(rowIndex + 2, L, P, f.paymentsMeta.title).map((c) => ({
        ...c,
        title: f.plansMeta.title,
        dataRowIndex: rowIndex,
      })),
    );
  };

  const savePlan = async (draft: PlanDraft, original: SipPlan | null, backfill: number[]) => {
    const f = await prepare();
    const L = planLayout(f.plans.headers);
    const P = paymentLayout(f.payments.headers);
    const plans = readPlans(f.plans);
    const records = readPayments(f.payments);
    const key = fundKey(draft.fund);

    const clash = plans.find((p) => p.key === key && p.key !== original?.key);
    if (clash) {
      throw new Error(
        `There’s already a SIP called “${clash.fund}”. Give this one a distinct name — add the folio number or the SIP date, say.`,
      );
    }

    if (original) {
      const row = plans.find((p) => p.key === original.key);
      if (!row) {
        throw new Error(`“${original.fund}” is no longer in the ${f.plansMeta.title} tab. Refresh and try again.`);
      }
      const cells: api.CellWrite[] = [
        ...planCells(L, draft).map((c) => ({ ...c, title: f.plansMeta.title, dataRowIndex: row.rowIndex })),
        ...formulaCells(f, f.plans.headers, plans.map((p) => p.rowIndex)),
      ];
      if (draft.fund !== row.fund) {
        // Payments are joined to their plan by name, so they follow it to the new one.
        for (const r of records) {
          if (r.key === original.key) {
            cells.push({ title: f.paymentsMeta.title, dataRowIndex: r.rowIndex, colIndex: P.fund, value: draft.fund });
          }
        }
      }
      await api.updateCells(ctx, cells);
    } else {
      const row = f.plans.headers.map(() => '');
      for (const c of planCells(L, draft)) row[c.colIndex] = c.value;

      const landed =
        (await api.appendRows(ctx, f.plansMeta.title, [row])) ??
        readPlans(await api.readSheet(ctx, f.plansMeta.title)).find((p) => p.key === key)?.rowIndex ??
        null;

      const rowIndices = plans.map((p) => p.rowIndex);
      if (landed != null) rowIndices.push(landed);
      await api.updateCells(ctx, formulaCells(f, f.plans.headers, rowIndices));

      // Re-adding a fund that already has history mustn't double up those months.
      const taken = new Set(records.filter((r) => r.key === key).map((r) => r.month));
      const past = backfill.filter((m) => !taken.has(m));
      if (past.length) {
        await api.appendRows(
          ctx,
          f.paymentsMeta.title,
          past.map((month) =>
            paymentRow(f.payments.headers, P, {
              fund: draft.fund,
              month,
              date: dueDate(month, draft.day),
              amount: draft.amount,
              status: 'paid',
            }),
          ),
        );
      }
    }

    await reread(f.plansMeta.title, f.paymentsMeta.title);
  };

  const deletePlan = async (plan: SipPlan) => {
    const f = await prepare();
    const row = readPlans(f.plans).find((p) => p.key === plan.key);
    if (!row) throw new Error(`“${plan.fund}” is no longer in the sheet. Refresh and try again.`);
    const records = readPayments(f.payments)
      .filter((r) => r.key === plan.key)
      .map((r) => r.rowIndex);
    await api.deleteRows(ctx, [
      { sheetId: f.plansMeta.sheetId, dataRowIndices: [row.rowIndex] },
      { sheetId: f.paymentsMeta.sheetId, dataRowIndices: records },
    ]);
    await reread(f.plansMeta.title, f.paymentsMeta.title);
  };

  /** Sets one month to Paid or Missed, or clears it (null). */
  const markMonth = (plan: SipPlan, month: number, next: Mark) =>
    act(async () => {
      const { meta, data } = await freshPayments();
      const P = paymentLayout(data.headers);
      const recs = readPayments(data).filter((r) => r.key === plan.key && r.month === month);

      if (next === null) {
        await api.deleteRows(ctx, [{ sheetId: meta.sheetId, dataRowIndices: recs.map((r) => r.rowIndex) }]);
      } else if (recs.length) {
        const status = next === 'paid' ? PAID : MISSED;
        const cells: api.CellWrite[] = recs.map((r) => ({
          title: meta.title,
          dataRowIndex: r.rowIndex,
          colIndex: P.status,
          value: status,
        }));
        // A month flipped from Missed to Paid picks up the SIP amount if it never had one.
        if (next === 'paid' && plan.amount != null) {
          for (const r of recs) {
            if (r.amount == null) {
              cells.push({ title: meta.title, dataRowIndex: r.rowIndex, colIndex: P.amount, value: String(plan.amount) });
            }
          }
        }
        await api.updateCells(ctx, cells);
      } else {
        await api.appendRows(ctx, meta.title, [
          paymentRow(data.headers, P, {
            fund: plan.fund,
            month,
            date: recordDate(month, plan.day ?? 1, new Date()),
            amount: next === 'paid' ? plan.amount : null,
            status: next,
          }),
        ]);
      }
      setPaymentsData(await api.readSheet(ctx, meta.title));
    });

  /** Every earlier month that went by unmarked, as Paid, in one write. */
  const markOverduePaid = (s: SipStatus) =>
    act(async () => {
      const { meta, data } = await freshPayments();
      const P = paymentLayout(data.headers);
      const taken = new Set(readPayments(data).filter((r) => r.key === s.plan.key).map((r) => r.month));
      const rows = s.overdue
        .map((c) => c.month)
        .filter((m) => !taken.has(m))
        .map((month) =>
          paymentRow(data.headers, P, {
            fund: s.plan.fund,
            month,
            date: recordDate(month, s.plan.day ?? 1, new Date()),
            amount: s.plan.amount,
            status: 'paid',
          }),
        );
      await api.appendRows(ctx, meta.title, rows);
      setPaymentsData(await api.readSheet(ctx, meta.title));
    });

  const updateRecord = (plan: SipPlan, month: number, patch: RecordPatch) =>
    act(async () => {
      const { meta, data } = await freshPayments();
      const P = paymentLayout(data.headers);
      const rec = readPayments(data).find((r) => r.key === plan.key && r.month === month);
      if (!rec) throw new Error(`${monthLabel(month)} is no longer marked in the sheet. Refresh and try again.`);
      const pairs: [number, string][] = [
        [P.amount, patch.amount],
        [P.date, patch.date],
        [P.note, patch.note],
      ];
      await api.updateCells(
        ctx,
        pairs
          .filter(([i]) => i >= 0)
          .map(([colIndex, value]) => ({ title: meta.title, dataRowIndex: rec.rowIndex, colIndex, value })),
      );
      setPaymentsData(await api.readSheet(ctx, meta.title));
    });

  /**
   * A SIP tab made or edited by hand can lack columns the app relies on. They're
   * added at the far right, so nothing already in the tab moves.
   */
  const repair = () =>
    act(async () => {
      const addAll = async (meta: SheetMeta, data: SheetData, specs: ColumnSpec[]) => {
        let width = data.headers.length;
        let columnCount = meta.columnCount;
        for (const spec of specs) {
          await api.addColumn(ctx, { ...meta, columnCount }, spec.name, width, spec.type, currency);
          columnCount = Math.max(columnCount, width + 1) + 1;
          width += 1;
        }
      };
      if (tabs.plans && plansData && gaps.plans.length) {
        await addAll(tabs.plans, plansData, gaps.plans);
      }
      if (tabs.payments && paymentsData && gaps.payments.length) {
        await addAll(tabs.payments, paymentsData, gaps.payments);
        const headers = [...paymentsData.headers, ...gaps.payments.map((c) => c.name)];
        await api.styleColumns(ctx, tabs.payments.sheetId, paymentStyling(paymentLayout(headers)));
      }
      await onSheetsChanged();

      // New formula columns start blank on existing plans, so fill them in.
      const f = await prepare();
      await api.updateCells(ctx, formulaCells(f, f.plans.headers, readPlans(f.plans).map((p) => p.rowIndex)));
      await reread(f.plansMeta.title, f.paymentsMeta.title);
    });

  /* ----------------------------------------------------------------- view */

  const openEditorFromDetail = (plan: SipPlan) => {
    setReturnTo(plan.key);
    setDetailKey(null);
    setEditing(plan);
  };

  const closeEditor = (nextDetail: string | null = returnTo) => {
    setEditing(null);
    setDetailKey(nextDetail);
    setReturnTo(null);
  };

  const headline =
    statuses.length === 0
      ? 'SIP tracker'
      : attention > 0
        ? `${plural(attention, 'SIP')} to mark`
        : expectedNow.length > 0
          ? `${monthLabel(thisMonth)} · ${paidNow} of ${expectedNow.length} paid`
          : 'All caught up';

  const editingStatus =
    editing && editing !== 'new' ? statuses.find((s) => s.plan.key === editing.key) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-3">
        {statuses.length > 0 && (
          <div className="scroll-x -mx-4 flex gap-3 px-4 pb-3">
            <Stat label="Monthly SIP" value={fmt.money(monthly)} note={`${running.length} running`} />
            <Stat label="Invested" value={fmt.money(invested)} note={plural(instalments, 'instalment')} />
            {valued.length > 0 && (
              <Stat
                label="Current value"
                value={fmt.money(value)}
                note={
                  valuedInvested > 0
                    ? `${value >= valuedInvested ? '▲' : '▼'} ${fmt.pct(((value - valuedInvested) / valuedInvested) * 100)}`
                    : undefined
                }
                noteClass={value >= valuedInvested ? 'text-pos' : 'text-neg'}
              />
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-bold ${attention > 0 ? 'text-neg' : ''}`}>{headline}</p>
            <p className="truncate text-xs font-medium text-muted">
              Confirm each month’s auto-pay here
            </p>
          </div>
          <IconButton label="Refresh" onClick={() => void load()}>
            <IconRefresh />
          </IconButton>
          {tabs.plans && (
            <a
              href={sheetUrl(spreadsheetId, tabs.plans.sheetId)}
              target="_blank"
              rel="noreferrer"
              aria-label="Open SIP Plans in Google Sheets"
              className="press grid size-12 shrink-0 place-items-center rounded-2xl border border-line bg-surface text-ink2 shadow-soft"
            >
              <IconExternal className="size-5" />
            </a>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && !editing && !detail && (
          <div className="px-4 pb-3">
            <Banner kind="error">{error}</Banner>
          </div>
        )}

        {needsRepair && (
          <div className="mx-4 mb-3 rounded-2xl border border-neg/20 bg-neg/10 px-4 py-3.5 text-neg">
            <p className="text-sm font-bold">Your SIP tabs are missing some columns</p>
            <p className="mt-1 text-xs leading-relaxed">
              {[
                ...gaps.plans.map((c) => `${tabs.plans?.title ?? SIP_PLANS_SHEET}: ${c.name}`),
                ...gaps.payments.map((c) => `${tabs.payments?.title ?? SIP_PAYMENTS_SHEET}: ${c.name}`),
              ].join(' · ')}
              . They’re added at the far right — nothing already in the tabs moves.
            </p>
            <div className="mt-3">
              <Button variant="danger" disabled={busy} onClick={() => void repair()}>
                {busy ? 'Adding…' : 'Add missing columns'}
              </Button>
            </div>
          </div>
        )}

        {loading && plansTitle && !plansData ? (
          <Spinner label="Reading your SIPs…" />
        ) : statuses.length === 0 ? (
          <Empty
            emoji="🔁"
            title="Track your SIPs"
            body="Add each SIP once — fund, amount and debit date. Then every month, tap Paid when the auto-pay goes through. Your sheet gets a SIP Plans tab and a SIP Payments tab that keep count."
            action={
              <Button icon={<IconPlus />} onClick={() => setEditing('new')}>
                Add a SIP
              </Button>
            }
          />
        ) : (
          <div className="px-4 pb-32">
            <ul className="space-y-3">
              {running.map((s, n) => (
                <SipCard
                  key={s.plan.key}
                  s={s}
                  fmt={fmt}
                  busy={busy}
                  delay={n}
                  onOpen={() => setDetailKey(s.plan.key)}
                  onMark={(month, next) => void markMonth(s.plan, month, next)}
                  onMarkOverdue={() => void markOverduePaid(s)}
                />
              ))}
            </ul>

            {running.length === 0 && (
              <p className="rounded-card bg-surface px-4 py-5 text-center text-sm font-medium text-muted shadow-card">
                None of your SIPs are running right now.
              </p>
            )}

            {stopped.length > 0 && (
              <>
                <button
                  onClick={() => setShowStopped(!showStopped)}
                  className="press mt-3 w-full rounded-2xl border border-dashed border-line px-4 py-3 text-xs font-bold text-muted"
                >
                  {showStopped ? 'Hide' : 'Show'} {plural(stopped.length, 'stopped SIP')}
                </button>
                {showStopped && (
                  <ul className="mt-3 space-y-3">
                    {stopped.map((s, n) => (
                      <SipCard
                        key={s.plan.key}
                        s={s}
                        fmt={fmt}
                        busy={busy}
                        delay={n}
                        onOpen={() => setDetailKey(s.plan.key)}
                        onMark={(month, next) => void markMonth(s.plan, month, next)}
                        onMarkOverdue={() => void markOverduePaid(s)}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}

            <Legend />
          </div>
        )}
      </div>

      {statuses.length > 0 && (
        <button
          onClick={() => setEditing('new')}
          style={{ background: SIP_ACCENT }}
          className="press fixed right-5 bottom-26 z-30 grid size-15 place-items-center rounded-[1.4rem] text-white shadow-glow"
          aria-label="Add SIP"
        >
          <IconPlus className="size-7" strokeWidth={2.4} />
        </button>
      )}

      <PlanDetail
        s={detail}
        fmt={fmt}
        busy={busy}
        error={error}
        onClose={() => setDetailKey(null)}
        onEdit={openEditorFromDetail}
        onMark={(month, next) => markMonth(detail!.plan, month, next)}
        onUpdateRecord={(month, patch) => updateRecord(detail!.plan, month, patch)}
      />

      <PlanEditor
        open={editing !== null}
        plan={editing === 'new' ? null : editing}
        recordCount={editingStatus?.records.length ?? 0}
        onClose={() => closeEditor()}
        onSave={async (draft, backfill) => {
          await savePlan(draft, editing === 'new' ? null : editing, backfill);
          closeEditor(returnTo ? fundKey(draft.fund) : null);
        }}
        onDelete={
          editing && editing !== 'new'
            ? async () => {
                await deletePlan(editing);
                closeEditor(null);
              }
            : undefined
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

const TONE = {
  paid: { fg: 'var(--pos)', bg: 'color-mix(in srgb, var(--pos) 13%, transparent)' },
  missed: { fg: 'var(--neg)', bg: 'color-mix(in srgb, var(--neg) 10%, transparent)' },
  quiet: { fg: 'var(--muted)', bg: 'var(--surface-2)' },
};

/** This month, in a word or two. */
function StatePill({ s }: { s: SipStatus }) {
  const today = new Date();
  const { current } = s;

  let text: string;
  let tone: { fg: string; bg: string };

  if (s.plan.stopped) {
    text = 'Stopped';
    tone = TONE.quiet;
  } else {
    switch (current.state) {
      case 'paid':
        text = '✓ Paid';
        tone = TONE.paid;
        break;
      case 'missed':
        text = '✕ Missed';
        tone = TONE.missed;
        break;
      case 'due':
        text = daysBetween(current.due, today) === 0 ? 'Due today' : `Due ${shortDate(current.due)}`;
        tone = triggerTone('passed');
        break;
      case 'upcoming': {
        const days = daysBetween(today, current.due);
        text = days === 1 ? 'Tomorrow' : `In ${days} days`;
        tone = days <= 3 ? triggerTone('soon') : TONE.quiet;
        break;
      }
      default:
        text = `Starts ${monthShort(s.firstMonth)}`;
        tone = TONE.quiet;
    }
  }

  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold whitespace-nowrap"
      style={{ color: tone.fg, background: tone.bg }}
    >
      {text}
    </span>
  );
}

const CELL: Record<MonthState, { style: CSSProperties; glyph: string; label: string }> = {
  paid: { style: { background: 'var(--pos)', color: '#fff' }, glyph: '✓', label: 'paid' },
  missed: {
    style: { background: 'color-mix(in srgb, var(--neg) 14%, transparent)', color: 'var(--neg)' },
    glyph: '✕',
    label: 'missed',
  },
  due: { style: { boxShadow: 'inset 0 0 0 2px var(--neg)', color: 'var(--neg)' }, glyph: '!', label: 'not marked' },
  upcoming: {
    style: { boxShadow: 'inset 0 0 0 1.5px var(--line)', color: 'var(--muted)' },
    glyph: '',
    label: 'coming up',
  },
  idle: { style: { background: 'var(--surface-2)' }, glyph: '', label: 'nothing due' },
};

/** The last six months, oldest on the left, so a missing tick stands out. */
function MonthStrip({ s, onOpen }: { s: SipStatus; onOpen: () => void }) {
  const last = s.current.month;
  const cells = Array.from({ length: 6 }, (_, i) => {
    const month = last - 5 + i;
    return s.months.find((c) => c.month === month) ?? { month, state: 'idle' as const };
  });

  return (
    <button
      onClick={onOpen}
      className="mt-3.5 grid w-full grid-cols-6 gap-1.5"
      aria-label={`${s.plan.fund}: ${cells.map((c) => `${monthShort(c.month)} ${CELL[c.state].label}`).join(', ')}`}
    >
      {cells.map((c) => (
        <span key={c.month} className="flex flex-col items-center gap-1">
          <span
            className="grid h-7 w-full place-items-center rounded-lg text-[0.72rem] font-extrabold"
            style={CELL[c.state].style}
          >
            {CELL[c.state].glyph}
          </span>
          <span
            className={`text-[0.6rem] font-bold ${c.month === last ? 'text-ink2' : 'text-muted'}`}
          >
            {monthShort(c.month)}
          </span>
        </span>
      ))}
    </button>
  );
}

function Legend() {
  const items: MonthState[] = ['paid', 'missed', 'due', 'upcoming'];
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2">
      {items.map((state) => (
        <span key={state} className="flex items-center gap-1.5 text-[0.68rem] font-bold text-muted">
          <span
            className="grid size-4 place-items-center rounded-[0.3rem] text-[0.55rem] font-extrabold"
            style={CELL[state].style}
          >
            {CELL[state].glyph}
          </span>
          {CELL[state].label}
        </span>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  noteClass = 'text-muted',
}: {
  label: string;
  value: string;
  note?: string;
  noteClass?: string;
}) {
  return (
    <div className="min-w-36 shrink-0 rounded-card bg-surface px-4 py-3 shadow-card">
      <p className="truncate text-[0.68rem] font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums" style={{ color: SIP_ACCENT }}>
        {value}
      </p>
      {note && <p className={`text-[0.7rem] font-bold tabular-nums ${noteClass}`}>{note}</p>}
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  noteClass = 'text-muted',
}: {
  label: string;
  value: string;
  note?: string;
  noteClass?: string;
}) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-[0.66rem] font-bold tracking-wider text-muted uppercase">
        {label}
      </span>
      <span className="block truncate text-sm font-bold tabular-nums">{value}</span>
      {note && <span className={`block truncate text-[0.68rem] font-bold tabular-nums ${noteClass}`}>{note}</span>}
    </span>
  );
}

function gainNote(s: SipStatus, fmt: Formatters) {
  const cv = s.plan.currentValue;
  if (cv == null || s.invested <= 0) return null;
  const up = cv >= s.invested;
  return {
    text: `${up ? '▲' : '▼'} ${fmt.pct(((cv - s.invested) / s.invested) * 100)}`,
    className: up ? 'text-pos' : 'text-neg',
  };
}

function SipCard({
  s,
  fmt,
  busy,
  delay,
  onOpen,
  onMark,
  onMarkOverdue,
}: {
  s: SipStatus;
  fmt: Formatters;
  busy: boolean;
  delay: number;
  onOpen: () => void;
  onMark: (month: number, next: Mark) => void;
  onMarkOverdue: () => void;
}) {
  const { plan, current, overdue } = s;
  const gain = gainNote(s, fmt);
  const label = monthShort(current.month);
  const record = current.records[0];

  return (
    <li
      style={{ animationDelay: `${Math.min(delay, 8) * 28}ms` }}
      className={`animate-rise rounded-card bg-surface p-4 shadow-card ${plan.stopped ? 'opacity-70' : ''}`}
    >
      <button onClick={onOpen} className="flex w-full items-start gap-3 text-left">
        <Badge text={initials(plan.fund)} color={accentFor(plan.fund)} />
        <span className="block min-w-0 flex-1">
          <span className="block truncate font-bold tracking-tight">{plan.fund}</span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-muted">
            {plan.amount != null ? fmt.money(plan.amount) : 'No amount'} ·{' '}
            {plan.day ? `${ordinal(plan.day)} of every month` : 'SIP day not set'}
          </span>
        </span>
        <StatePill s={s} />
      </button>

      <MonthStrip s={s} onOpen={onOpen} />

      <button
        onClick={onOpen}
        className="mt-3 grid w-full grid-cols-3 gap-x-3 border-t border-line pt-3 text-left"
      >
        <Figure label="Instalments" value={String(s.instalments)} />
        <Figure label="Invested" value={fmt.money(s.invested)} />
        <Figure
          label="Value"
          value={plan.currentValue != null ? fmt.money(plan.currentValue) : '—'}
          note={gain?.text}
          noteClass={gain?.className}
        />
      </button>

      {!plan.stopped && overdue.length > 0 && (
        <div
          className="mt-3.5 rounded-2xl border px-3.5 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--neg) 28%, transparent)',
            background: 'color-mix(in srgb, var(--neg) 6%, transparent)',
          }}
        >
          <p className="text-xs font-bold text-neg">
            {plural(overdue.length, 'earlier month')} not marked
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-muted">
            {[...overdue].reverse().map((c) => monthLabel(c.month)).join(', ')}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              disabled={busy}
              onClick={onMarkOverdue}
              className="press min-h-10 flex-1 rounded-xl bg-brand px-3 text-xs font-bold text-onbrand disabled:opacity-40"
            >
              ✓ Mark {overdue.length === 1 ? 'it' : `all ${overdue.length}`} paid
            </button>
            <button
              onClick={onOpen}
              className="press min-h-10 rounded-xl border border-line bg-surface px-3.5 text-xs font-bold text-ink2"
            >
              Review
            </button>
          </div>
        </div>
      )}

      {!plan.stopped && (current.state === 'due' || current.state === 'upcoming') && (
        <div className="mt-3.5 flex gap-2">
          <button
            disabled={busy}
            onClick={() => onMark(current.month, 'paid')}
            className={`press min-h-11 flex-1 rounded-2xl px-4 text-sm font-bold disabled:opacity-40 ${
              current.state === 'due' ? 'bg-brand text-onbrand shadow-soft' : 'bg-brandsoft text-brand'
            }`}
          >
            ✓ {label} paid
          </button>
          <button
            disabled={busy}
            onClick={() => onMark(current.month, 'missed')}
            className="press min-h-11 rounded-2xl border border-line bg-surface px-4 text-sm font-bold text-ink2 disabled:opacity-40"
          >
            Missed
          </button>
        </div>
      )}

      {!plan.stopped && (current.state === 'paid' || current.state === 'missed') && (
        <div className="mt-3.5 flex items-center gap-2 rounded-2xl bg-surface2 px-3.5 py-2.5">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink2">
            {current.state === 'paid'
              ? `✓ ${label}${record?.amount != null ? ` · ${fmt.money(record.amount)}` : ''}${
                  record?.date ? ` on ${shortDate(record.date)}` : ''
                }`
              : `✕ ${label} marked as missed`}
          </span>
          <button
            disabled={busy}
            onClick={() => onMark(current.month, null)}
            className="press shrink-0 px-1 text-xs font-bold text-brand disabled:opacity-40"
          >
            Undo
          </button>
        </div>
      )}

      {!plan.stopped && current.state === 'idle' && (
        <p className="mt-3.5 rounded-2xl bg-surface2 px-3.5 py-2.5 text-xs font-semibold text-muted">
          First instalment on {longDate(dueDate(s.firstMonth, plan.day ?? 1))}
        </p>
      )}
    </li>
  );
}

/* ----------------------------------------------------------------- history */

interface RecordPatch {
  /** Plain number as text, or '' to clear. */
  amount: string;
  /** ISO date, or '' to clear. */
  date: string;
  note: string;
}

function PlanDetail({
  s,
  fmt,
  busy,
  error,
  onClose,
  onEdit,
  onMark,
  onUpdateRecord,
}: {
  s: SipStatus | null;
  fmt: Formatters;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onEdit: (plan: SipPlan) => void;
  onMark: (month: number, next: Mark) => Promise<boolean>;
  onUpdateRecord: (month: number, patch: RecordPatch) => Promise<boolean>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const planKey = s?.plan.key ?? null;

  useEffect(() => {
    setShowAll(false);
    setExpanded(null);
  }, [planKey]);

  if (!s) return null;

  const { plan } = s;
  const gain = gainNote(s, fmt);
  // Newest first, and only months where something was expected or marked.
  const history = s.months.filter((c) => c.state !== 'idle').reverse();
  const shown = showAll ? history : history.slice(0, 12);

  return (
    <Sheet open title={plan.fund} onClose={onClose}>
      <div className="space-y-5">
        {error && <Banner kind="error">{error}</Banner>}

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-surface p-4 shadow-soft">
          <Figure label="Monthly" value={plan.amount != null ? fmt.money(plan.amount) : '—'} />
          <Figure label="SIP day" value={plan.day ? `${ordinal(plan.day)} of the month` : '—'} />
          <Figure label="Started" value={plan.start ? longDate(plan.start) : '—'} />
          <Figure
            label="Instalments"
            value={`${s.instalments} paid`}
            note={s.missed ? `${s.missed} missed` : undefined}
            noteClass="text-neg"
          />
          <Figure label="Invested" value={fmt.money(s.invested)} />
          <Figure
            label="Current value"
            value={plan.currentValue != null ? fmt.money(plan.currentValue) : 'Not set'}
            note={gain?.text}
            noteClass={gain?.className}
          />
        </div>

        {plan.notes && (
          <p className="rounded-2xl bg-surface2 px-4 py-3 text-xs leading-relaxed text-ink2">{plan.notes}</p>
        )}

        <Button full variant="ghost" icon={<IconPencil />} onClick={() => onEdit(plan)}>
          Edit SIP{plan.currentValue == null ? ' · add current value' : ''}
        </Button>

        <div>
          <p className="mb-1 text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
            Month by month
          </p>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Tap Paid or Missed to set a month, and tap it again to clear it. Tap a marked month to
            change its amount, date or note.
          </p>

          {history.length === 0 ? (
            <p className="rounded-2xl bg-surface2 px-4 py-3 text-xs font-medium text-muted">
              {plan.stopped
                ? 'No months were marked for this SIP.'
                : `Nothing due yet — the first instalment is on ${longDate(dueDate(s.firstMonth, plan.day ?? 1))}.`}
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {shown.map((c, i) => (
                <HistoryRow
                  key={c.month}
                  c={c}
                  fmt={fmt}
                  busy={busy}
                  first={i === 0}
                  expanded={expanded === c.month}
                  onToggle={() => setExpanded(expanded === c.month ? null : c.month)}
                  onMark={async (next) => {
                    const ok = await onMark(c.month, next);
                    if (ok && next === null && expanded === c.month) setExpanded(null);
                  }}
                  onUpdate={async (patch) => {
                    if (await onUpdateRecord(c.month, patch)) setExpanded(null);
                  }}
                />
              ))}
            </ul>
          )}

          {history.length > 12 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="press mt-2 w-full py-2 text-xs font-bold text-brand"
            >
              {showAll ? 'Show fewer' : `Show all ${history.length} months`}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Choice({
  on,
  kind,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  kind: 'paid' | 'missed';
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const style: CSSProperties = on
    ? kind === 'paid'
      ? { background: 'var(--pos)', color: '#fff', borderColor: 'transparent' }
      : { background: TONE.missed.bg, color: 'var(--neg)', borderColor: 'color-mix(in srgb, var(--neg) 35%, transparent)' }
    : {};
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      style={style}
      className="press min-h-9 rounded-xl border border-line px-3 text-xs font-bold text-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function HistoryRow({
  c,
  fmt,
  busy,
  first,
  expanded,
  onToggle,
  onMark,
  onUpdate,
}: {
  c: MonthCell;
  fmt: Formatters;
  busy: boolean;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMark: (next: Mark) => void;
  onUpdate: (patch: RecordPatch) => void;
}) {
  const rec = c.records[0];
  const detail = rec
    ? [
        rec.amount != null ? fmt.money(rec.amount) : c.state === 'paid' ? 'No amount' : null,
        rec.date ? shortDate(rec.date) : null,
        c.records.length > 1 ? `${c.records.length} entries` : null,
        rec.note || null,
      ]
        .filter(Boolean)
        .join(' · ')
    : c.state === 'due'
      ? `Not marked · due ${shortDate(c.due)}`
      : `Due ${shortDate(c.due)}`;

  return (
    <li className={first ? '' : 'border-t border-line'}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button disabled={!rec} onClick={onToggle} className="block min-w-0 flex-1 text-left">
          <span className="block text-sm font-bold">{monthLabel(c.month)}</span>
          <span
            className={`block truncate text-xs font-medium ${c.state === 'due' ? 'text-neg' : 'text-muted'}`}
          >
            {detail}
          </span>
        </button>
        <div className="flex shrink-0 gap-1.5">
          <Choice
            on={c.state === 'paid'}
            kind="paid"
            disabled={busy}
            onClick={() => onMark(c.state === 'paid' ? null : 'paid')}
          >
            Paid
          </Choice>
          <Choice
            on={c.state === 'missed'}
            kind="missed"
            disabled={busy}
            onClick={() => onMark(c.state === 'missed' ? null : 'missed')}
          >
            Missed
          </Choice>
        </div>
      </div>
      {expanded && rec && <RecordEditor rec={rec} busy={busy} onSave={onUpdate} onCancel={onToggle} />}
    </li>
  );
}

function RecordEditor({
  rec,
  busy,
  onSave,
  onCancel,
}: {
  rec: SipPayment;
  busy: boolean;
  onSave: (patch: RecordPatch) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(rec.amount != null ? String(rec.amount) : '');
  const [date, setDate] = useState(rec.date ? toISODate(rec.date) : '');
  const [note, setNote] = useState(rec.note);
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    const n = amount.trim() ? parseNumeric(amount) : null;
    if (amount.trim() && n == null) return setProblem('Amount should be a number, or leave it blank.');
    setProblem(null);
    onSave({ amount: n == null ? '' : String(n), date, note: note.trim() });
  };

  return (
    <div className="space-y-3 border-t border-line bg-surface2 px-4 py-3.5">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount">
          <input
            className={inputClass}
            inputMode="decimal"
            value={amount}
            placeholder="0"
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Debited on">
          <input type="date" className={`${inputClass} px-3`} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Note">
        <input
          className={inputClass}
          value={note}
          placeholder="Optional — e.g. units allotted"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {problem && <Banner kind="error">{problem}</Banner>}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex-1">
          <Button full disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

const QUICK_DAYS = [1, 5, 7, 10, 15, 20, 25, 28];

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors ${
        on ? 'border-pos bg-pos text-white' : 'border-line'
      }`}
    >
      {on && (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4 4 10-10" />
        </svg>
      )}
    </span>
  );
}

function PlanEditor({
  open,
  plan,
  recordCount,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  /** Null when adding a new SIP. */
  plan: SipPlan | null;
  recordCount: number;
  onClose: () => void;
  onSave: (draft: PlanDraft, backfill: number[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const editing = plan !== null;
  const [fund, setFund] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [current, setCurrent] = useState('');
  const [notes, setNotes] = useState('');
  const [stopped, setStopped] = useState(false);
  const [backfill, setBackfill] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const planKey = plan?.key ?? null;
  useEffect(() => {
    if (!open) return;
    setFund(plan?.fund ?? '');
    setAmount(plan?.amount != null ? String(plan.amount) : '');
    setDay(plan?.day != null ? String(plan.day) : '');
    setStart(plan ? (plan.start ? toISODate(plan.start) : '') : todayISO());
    setCurrent(plan?.currentValue != null ? String(plan.currentValue) : '');
    setNotes(plan?.notes ?? '');
    setStopped(plan?.stopped ?? false);
    setBackfill(true);
    setError(null);
    setConfirmDelete(false);
    // Keyed on the plan's identity, not the object — a background refresh
    // mustn't wipe what you're halfway through typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planKey]);

  const dayN = parseDay(day);

  /** For a new SIP that's already been running: the debits that have already happened. */
  const pastDue = useMemo(() => {
    const startDate = parseSheetDate(start);
    if (editing || !dayN || !startDate) return [];
    return monthsDueSince(firstInstalmentMonth(startDate, dayN), dayN, new Date());
  }, [editing, dayN, start]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const problem = fundNameProblem(fund);
    if (problem) return setError(problem);
    const amt = parseNumeric(amount);
    if (amt == null || amt <= 0) return setError('Enter the monthly SIP amount.');
    if (!dayN) return setError('Enter the day of the month the SIP is debited — 1 to 31.');
    if (start && !parseSheetDate(start)) return setError('That start date doesn’t look right.');
    const cv = current.trim() ? parseNumeric(current) : null;
    if (current.trim() && cv == null) return setError('Current value should be a number, or leave it blank.');

    return run(() =>
      onSave(
        {
          fund: fund.trim(),
          amount: amt,
          day: dayN,
          start,
          currentValue: cv == null ? '' : String(cv),
          stopped,
          notes: notes.trim(),
        },
        !editing && backfill ? pastDue : [],
      ),
    );
  };

  return (
    <Sheet open={open} title={editing ? 'Edit SIP' : 'New SIP'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Fund name">
          <input
            className={inputClass}
            value={fund}
            placeholder="e.g. Parag Parikh Flexi Cap"
            onChange={(e) => setFund(e.target.value)}
          />
        </Field>

        <Field label="Monthly amount">
          <div className="relative">
            <input
              className={inputClass}
              value={amount}
              inputMode="decimal"
              placeholder="5000"
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[0.66rem] font-bold tracking-wider text-muted/70 uppercase">
              Money
            </span>
          </div>
        </Field>

        <Field
          label="SIP day"
          hint="The date the auto-pay is debited each month. A 31st falls back to the last day of shorter months."
        >
          <input
            className={inputClass}
            value={day}
            inputMode="numeric"
            placeholder="e.g. 5"
            onChange={(e) => setDay(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_DAYS.map((n) => (
              <button
                key={n}
                onClick={() => setDay(String(n))}
                className={`press rounded-xl border px-3 py-2 text-xs font-bold ${
                  dayN === n ? 'border-brand bg-brandsoft text-brand' : 'border-line text-muted'
                }`}
              >
                {ordinal(n)}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Start date" hint="When the first instalment went out. Nothing is expected before it.">
          <DateField value={start} onChange={setStart} />
        </Field>

        {!editing && pastDue.length > 0 && (
          <button
            onClick={() => setBackfill(!backfill)}
            className="press flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left"
          >
            <Tick on={backfill} />
            <span className="block min-w-0 flex-1">
              <span className="block text-sm font-bold">
                Mark {plural(pastDue.length, 'past instalment')} as paid
              </span>
              <span className="block text-xs leading-relaxed text-muted">
                {pastDue.length === 1
                  ? monthLabel(pastDue[0])
                  : `${monthLabel(pastDue[0])} – ${monthLabel(pastDue[pastDue.length - 1])}`}{' '}
                — the auto-pay has already run. You can change any month later.
              </span>
            </span>
          </button>
        )}

        <Field label="Current value" hint="Optional — from your fund app or statement. Update it whenever you check.">
          <input
            className={inputClass}
            value={current}
            inputMode="decimal"
            placeholder="0"
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>

        <Field label="Notes">
          <input
            className={inputClass}
            value={notes}
            placeholder="Folio, platform, goal…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {editing && (
          <button
            onClick={() => setStopped(!stopped)}
            className="press flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left"
          >
            <Tick on={stopped} />
            <span className="block min-w-0 flex-1">
              <span className="block text-sm font-bold">SIP stopped</span>
              <span className="block text-xs text-muted">
                {stopped
                  ? 'No more reminders. Its history and totals stay in the sheet.'
                  : 'Tick this once you’ve cancelled the SIP — nothing is deleted.'}
              </span>
            </span>
          </button>
        )}

        {error && <Banner kind="error">{error}</Banner>}

        <div className="sticky bottom-0 -mx-5 flex gap-3 bg-bg px-5 pt-3 pb-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <button
            onClick={() => void save()}
            disabled={busy}
            style={{ background: SIP_ACCENT }}
            className="press min-h-12 flex-1 rounded-2xl text-[0.9rem] font-bold text-white shadow-card disabled:opacity-40"
          >
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add SIP'}
          </button>
        </div>

        {onDelete && (
          <div className="border-t border-line pt-4">
            {confirmDelete ? (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-muted">
                  This removes the SIP
                  {recordCount > 0 ? ` and its ${plural(recordCount, 'marked month')}` : ''} from your
                  sheet. To keep the history, tick “SIP stopped” instead.
                </p>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </Button>
                  <div className="flex-1">
                    <Button full variant="danger" disabled={busy} onClick={() => void run(onDelete)}>
                      Delete permanently
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button full variant="danger" icon={<IconTrash />} onClick={() => setConfirmDelete(true)}>
                Delete SIP
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
