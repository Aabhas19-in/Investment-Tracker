import { useMemo, useState } from 'react';
import { makeFormatters, type CurrencyCode, type Formatters } from '../lib/format';
import { accentFor, initials } from '../lib/accent';
import { sheetUrl } from '../lib/config';
import { MONTH_ABBR } from '../lib/dates';
import {
  HOLDINGS_LOG_SHEET,
  SNAPSHOTS_SHEET,
  changesBetween,
  goneSince,
  type HoldingChange,
  type LoggedHolding,
  type Snapshot,
} from '../lib/holdingsSheet';
import { Badge, Banner, Button, Empty, IconButton, Sheet, Spinner } from './UI';
import { IconArrowDown, IconArrowUp, IconExternal, IconRefresh, IconUpload } from './Icons';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const shortDate = (d: Date | null) =>
  d ? `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : '—';

const longDate = (d: Date | null) =>
  d ? `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}` : '—';

const qty = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: Number.isInteger(n) ? 0 : 3 });

const signed = (n: number, fmt: Formatters) => `${n >= 0 ? '+' : '−'} ${fmt.money(Math.abs(n))}`;

/**
 * Everything you've saved into the investment sheet — one statement per date,
 * and what changed between them. This is the part a broker can't give you:
 * where the portfolio was last month, and which holding moved since.
 */
export function SavedHoldings({
  spreadsheetId,
  currency,
  snapshots,
  log,
  loading,
  error,
  justSaved,
  logSheetId,
  hasTabs,
  onRefresh,
  onGoToStatement,
}: {
  spreadsheetId: string;
  currency: CurrencyCode;
  /** Every statement saved to the sheet, oldest first. */
  snapshots: Snapshot[];
  log: LoggedHolding[];
  loading: boolean;
  error: string | null;
  /** Set right after a save, so the screen can confirm what just landed. */
  justSaved: string | null;
  logSheetId: number | null;
  hasTabs: boolean;
  onRefresh: () => void;
  onGoToStatement: () => void;
}) {
  const fmt = useMemo(() => makeFormatters(currency), [currency]);
  const [detail, setDetail] = useState<HoldingChange | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  // Which statement you're looking at: the newest, unless you pick another.
  const selected = useMemo(() => {
    if (!snapshots.length) return null;
    const found = pickedDate ? snapshots.find((s) => shortDate(s.date) === pickedDate) : null;
    return found ?? snapshots[snapshots.length - 1];
  }, [snapshots, pickedDate]);

  const index = selected ? snapshots.findIndex((s) => s === selected) : -1;
  const previous = index > 0 ? snapshots[index - 1] : null;
  const first = snapshots[0] ?? null;

  const changes = useMemo(
    () => changesBetween(log, selected?.date ?? null, previous?.date ?? null),
    [log, selected, previous],
  );
  const gone = useMemo(
    () => goneSince(log, selected?.date ?? null, previous?.date ?? null),
    [log, selected, previous],
  );

  if (!spreadsheetId) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Empty
          emoji="🔗"
          title="No investment sheet linked"
          body="Add your investment spreadsheet under Settings → Connection. Saved statements go there, and this screen reads them back."
        />
      </div>
    );
  }

  const valueChange = selected && previous ? selected.value - previous.value : null;
  const investedChange = selected && previous ? selected.invested - previous.invested : null;
  // What the market did, as opposed to what you added: value moved, less money put in.
  const marketChange =
    valueChange != null && investedChange != null ? valueChange - investedChange : null;
  const up = (selected?.pnl ?? 0) >= 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
        {error && <Banner kind="error">{error}</Banner>}

        {justSaved && (
          <div className="pb-3">
            <Banner kind="info">Saved {justSaved} to your investment sheet.</Banner>
          </div>
        )}

        {loading && snapshots.length === 0 ? (
          <Spinner label="Reading your investment sheet…" />
        ) : snapshots.length === 0 ? (
          <Empty
            emoji="🗂️"
            title="Nothing saved yet"
            body="Open a statement on the Statement tab and tap Save to sheet. Each one is filed by its date, and this screen shows how the portfolio moved between them."
            action={
              <Button icon={<IconUpload />} onClick={onGoToStatement}>
                Open a statement
              </Button>
            }
          />
        ) : (
          <>
            {/* Where it stood on the statement you're looking at */}
            <div
              className="animate-rise relative overflow-hidden rounded-card p-5 text-white shadow-card"
              style={{
                background: up
                  ? 'linear-gradient(135deg,#255b45 0%,#2f6f55 52%,#357a58 100%)'
                  : 'linear-gradient(135deg,#be123c 0%,#e11d48 55%,#f43f5e 100%)',
              }}
            >
              <div className="pointer-events-none absolute -top-14 -right-10 size-44 rounded-full bg-white/12 blur-2xl" />
              <p className="text-[0.7rem] font-bold tracking-widest text-white/75 uppercase">
                {longDate(selected?.date ?? null)}
              </p>
              <p className="mt-1.5 text-[2.2rem] leading-none font-extrabold tracking-tight tabular-nums">
                {fmt.money(selected?.value ?? 0)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-bold tabular-nums backdrop-blur-sm">
                  {up ? <IconArrowUp className="size-4" /> : <IconArrowDown className="size-4" />}
                  {fmt.money(Math.abs(selected?.pnl ?? 0))}
                </span>
                <span className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-bold tabular-nums backdrop-blur-sm">
                  {selected?.pnlPct != null ? fmt.pct(Number(selected.pnlPct.toFixed(2))) : '—'}
                </span>
                <span className="text-sm font-semibold text-white/75">
                  on {fmt.money(selected?.invested ?? 0)} invested
                </span>
              </div>
            </div>

            {/* What moved since the statement before it */}
            {previous && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Tile
                  label="Value"
                  value={signed(valueChange ?? 0, fmt)}
                  tone={(valueChange ?? 0) >= 0 ? 'pos' : 'neg'}
                  note={`since ${shortDate(previous.date)}`}
                />
                <Tile
                  label="You added"
                  value={signed(investedChange ?? 0, fmt)}
                  tone="plain"
                  note="new money"
                />
                <Tile
                  label="Market"
                  value={signed(marketChange ?? 0, fmt)}
                  tone={(marketChange ?? 0) >= 0 ? 'pos' : 'neg'}
                  note="gain on its own"
                />
              </div>
            )}

            {snapshots.length > 1 && (
              <ValueChart
                snapshots={snapshots}
                selected={selected}
                fmt={fmt}
                onPick={(s) => setPickedDate(shortDate(s.date))}
              />
            )}

            {first && selected && first !== selected && (
              <p className="mt-3 rounded-2xl bg-surface2 px-4 py-3 text-xs leading-relaxed text-ink2">
                Since your first saved statement on {longDate(first.date)}, the portfolio has gone
                from {fmt.money(first.value)} to {fmt.money(selected.value)} —{' '}
                <span className={selected.value >= first.value ? 'font-bold text-pos' : 'font-bold text-neg'}>
                  {signed(selected.value - first.value, fmt)}
                </span>
                , with {fmt.money(Math.max(selected.invested - first.invested, 0))} of that put in
                along the way.
              </p>
            )}

            {/* Holding by holding */}
            <div className="mt-5 flex items-center gap-2">
              <p className="min-w-0 flex-1 text-sm font-bold">
                {plural(changes.length, 'holding')}
                {previous && <span className="font-medium text-muted"> · change since last</span>}
              </p>
              <IconButton label="Refresh" onClick={onRefresh}>
                <IconRefresh />
              </IconButton>
              {logSheetId != null && (
                <a
                  href={sheetUrl(spreadsheetId, logSheetId)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open the investment sheet"
                  className="press grid size-12 shrink-0 place-items-center rounded-2xl border border-line bg-surface text-ink2 shadow-soft"
                >
                  <IconExternal className="size-5" />
                </a>
              )}
            </div>

            <ul className="mt-3 overflow-hidden rounded-card bg-surface shadow-card">
              {changes.map((c, i) => (
                <ChangeRow key={c.now.key + i} c={c} fmt={fmt} first={i === 0} onOpen={() => setDetail(c)} />
              ))}
            </ul>

            {gone.length > 0 && (
              <>
                <p className="mt-5 mb-2 px-1 text-xs font-extrabold tracking-wider text-muted uppercase">
                  Gone since {shortDate(previous?.date ?? null)}
                </p>
                <ul className="overflow-hidden rounded-card bg-surface opacity-75 shadow-card">
                  {gone.map((l, i) => (
                    <li
                      key={l.key + i}
                      className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}
                    >
                      <Badge text={initials(l.name)} color={accentFor(l.category || l.name)} size="sm" />
                      <span className="block min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm leading-snug font-bold">{l.name}</span>
                        <span className="block truncate text-xs font-medium text-muted">
                          was {fmt.money(l.value)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="mt-4 px-1 text-center text-[0.68rem] leading-relaxed text-muted">
              Kept in the {SNAPSHOTS_SHEET} and {HOLDINGS_LOG_SHEET} tabs of your investment sheet.
              {!hasTabs && ' They’ll be created the first time you save.'}
            </p>
          </>
        )}
      </div>

      <ChangeDetail c={detail} fmt={fmt} onClose={() => setDetail(null)} />
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: 'pos' | 'neg' | 'plain';
}) {
  const color = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink';
  return (
    <div className="rounded-card bg-surface px-3 py-3 shadow-card">
      <p className="truncate text-[0.62rem] font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className={`mt-1 truncate text-sm font-extrabold tabular-nums ${color}`}>{value}</p>
      <p className="truncate text-[0.6rem] font-medium text-muted">{note}</p>
    </div>
  );
}

/** Portfolio value at each saved statement, invested shown underneath it. */
function ValueChart({
  snapshots,
  selected,
  fmt,
  onPick,
}: {
  snapshots: Snapshot[];
  selected: Snapshot | null;
  fmt: Formatters;
  onPick: (s: Snapshot) => void;
}) {
  const shown = snapshots.slice(-12);
  const peak = Math.max(...shown.map((s) => Math.max(s.value, s.invested)), 1);
  const MAX_H = 92;

  return (
    <div className="mt-3 rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[0.68rem] font-extrabold tracking-widest text-muted uppercase">
          Value over time
        </h3>
        <span className="text-[0.68rem] font-bold text-muted">
          {plural(snapshots.length, 'statement')}
        </span>
      </div>

      <div className="scroll-x -mx-1 mt-4 flex items-end gap-2 px-1">
        {shown.map((s) => {
          const on = s === selected;
          const h = Math.max((s.value / peak) * MAX_H, 4);
          const investedH = Math.max((s.invested / peak) * MAX_H, 2);
          const gained = s.value >= s.invested;
          return (
            <button
              key={s.date?.toISOString() ?? s.rowIndex}
              onClick={() => onPick(s)}
              className="press flex min-w-11 flex-1 flex-col items-center gap-1.5"
              aria-label={`${longDate(s.date)}: ${fmt.money(s.value)}`}
            >
              <span className="relative flex w-full items-end justify-center" style={{ height: MAX_H }}>
                {/* Invested sits behind, so the gap between the two is the gain. */}
                <span
                  className="absolute bottom-0 w-full rounded-t-md bg-surface2"
                  style={{ height: investedH }}
                />
                <span
                  className="absolute bottom-0 w-3/5 rounded-t-md transition-all"
                  style={{
                    height: h,
                    background: gained ? 'var(--pos)' : 'var(--neg)',
                    opacity: on ? 1 : 0.55,
                  }}
                />
              </span>
              <span className={`text-[0.58rem] font-bold ${on ? 'text-ink2' : 'text-muted'}`}>
                {shortDate(s.date)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[0.66rem] font-medium text-muted">
        Bars are present value; the pale block behind each is what you'd put in. Tap one to see that
        statement.
      </p>
    </div>
  );
}

function ChangeRow({
  c,
  fmt,
  first,
  onOpen,
}: {
  c: HoldingChange;
  fmt: Formatters;
  first: boolean;
  onOpen: () => void;
}) {
  const l = c.now;
  const up = l.pnl >= 0;
  const moved = c.valueChange;

  return (
    <li className={first ? '' : 'border-t border-line'}>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <Badge text={initials(l.name)} color={accentFor(l.category || l.name)} size="sm" />
        <span className="block min-w-0 flex-1">
          <span className="line-clamp-2 text-sm leading-snug font-bold">{l.name}</span>
          <span className="mt-0.5 block truncate text-xs font-medium text-muted">
            {qty(l.quantity)} × {fmt.money(l.avgPrice)}
            {c.isNew ? ' · new' : ''}
            {c.unitsChange ? ` · ${c.unitsChange > 0 ? '+' : '−'}${qty(Math.abs(c.unitsChange))} units` : ''}
          </span>
        </span>
        <span className="block shrink-0 text-right">
          <span className="block font-extrabold tabular-nums">{fmt.money(l.value)}</span>
          {moved != null ? (
            <span className={`block text-xs font-bold tabular-nums ${moved >= 0 ? 'text-pos' : 'text-neg'}`}>
              {moved >= 0 ? '▲' : '▼'} {fmt.money(Math.abs(moved))}
            </span>
          ) : (
            <span className={`block text-xs font-bold tabular-nums ${up ? 'text-pos' : 'text-neg'}`}>
              {l.pnlPct != null ? fmt.pct(Number(l.pnlPct.toFixed(2))) : fmt.money(l.pnl)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function Figure({ label, value, note, noteClass = 'text-muted' }: { label: string; value: string; note?: string; noteClass?: string }) {
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

function ChangeDetail({
  c,
  fmt,
  onClose,
}: {
  c: HoldingChange | null;
  fmt: Formatters;
  onClose: () => void;
}) {
  if (!c) return null;
  const l = c.now;
  const b = c.before;
  const up = l.pnl >= 0;

  return (
    <Sheet open title={l.name} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {l.category && (
            <span
              className="rounded-full px-2.5 py-1 text-[0.68rem] font-extrabold"
              style={{
                color: accentFor(l.category),
                background: `color-mix(in srgb, ${accentFor(l.category)} 14%, transparent)`,
              }}
            >
              {l.category}
            </span>
          )}
          {l.section && (
            <span className="rounded-full bg-surface2 px-2.5 py-1 text-[0.68rem] font-extrabold text-ink2">
              {l.section}
            </span>
          )}
          {l.isin && (
            <span className="rounded-full bg-surface2 px-2.5 py-1 text-[0.68rem] font-extrabold text-muted">
              {l.isin}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-surface p-4 shadow-soft">
          <Figure label="Quantity" value={qty(l.quantity)} />
          <Figure label="Avg price" value={fmt.money(l.avgPrice)} />
          <Figure label="Last price" value={fmt.money(l.lastPrice)} />
          <Figure label="Invested" value={fmt.money(l.invested)} />
          <Figure label="Present value" value={fmt.money(l.value)} />
          <Figure
            label="Unrealised P&L"
            value={signed(l.pnl, fmt)}
            note={l.pnlPct != null ? fmt.pct(Number(l.pnlPct.toFixed(2))) : undefined}
            noteClass={up ? 'text-pos' : 'text-neg'}
          />
        </div>

        {b ? (
          <div>
            <p className="mb-2 text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
              Since {longDate(b.date)}
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-surface2 p-4">
              <Figure
                label="Value"
                value={signed(l.value - b.value, fmt)}
                note={`was ${fmt.money(b.value)}`}
                noteClass={l.value >= b.value ? 'text-pos' : 'text-neg'}
              />
              <Figure
                label="Units"
                value={
                  l.quantity === b.quantity
                    ? 'unchanged'
                    : `${l.quantity > b.quantity ? '+' : '−'}${qty(Math.abs(l.quantity - b.quantity))}`
                }
                note={`was ${qty(b.quantity)}`}
              />
              <Figure
                label="Avg price"
                value={fmt.money(l.avgPrice)}
                note={`was ${fmt.money(b.avgPrice)}`}
              />
              <Figure
                label="Last price"
                value={fmt.money(l.lastPrice)}
                note={`was ${fmt.money(b.lastPrice)}`}
              />
            </div>
          </div>
        ) : (
          <p className="rounded-2xl bg-surface2 px-4 py-3 text-xs font-medium text-muted">
            {c.isNew
              ? 'New since the previous statement.'
              : 'This is the earliest statement you’ve saved for this holding.'}
          </p>
        )}
      </div>
    </Sheet>
  );
}
