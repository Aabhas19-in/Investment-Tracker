import { useEffect, useMemo, useRef, useState } from 'react';
import { makeFormatters, type CurrencyCode, type Formatters } from '../lib/format';
import { accentFor, initials } from '../lib/accent';
import { MONTH_ABBR, parseSheetDate } from '../lib/dates';
import {
  parseHoldings,
  sectionTotals,
  splitByCategory,
  type HoldingLine,
  type HoldingsFile,
} from '../lib/holdings';
import { readSpreadsheetFile } from '../lib/xlsx';
import { Badge, Banner, Sheet, Spinner } from './UI';
import { IconArrowDown, IconArrowUp, IconTrash, IconUpload } from './Icons';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "2026-09-19" -> "19 Sep 2026", and anything unparseable is shown as it came. */
function prettyDate(value: string | null): string | null {
  if (!value) return null;
  const d = parseSheetDate(value);
  return d ? `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}` : value;
}

const qty = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: Number.isInteger(n) ? 0 : 3 });

/**
 * Your holdings, read from a statement you upload.
 *
 * The file is opened in the browser — it never goes to a server, and nothing is
 * written to your spreadsheets. The last one you opened is remembered on this
 * device so the tab isn't empty when you come back.
 */
export interface SaveStatus {
  state: 'saving' | 'saved' | 'failed' | 'unsaved';
  /** Why the last save didn't work, when it didn't. */
  message: string | null;
  /** Whether an investment sheet is linked at all. */
  linked: boolean;
  /** "19 Sep 2026 · 13 rows", for the line under the file name. */
  detail: string;
  onRetry: () => void;
}

export function HoldingsView({
  currency,
  file,
  onFile,
  save,
}: {
  currency: CurrencyCode;
  /** The statement on screen, held by the parent so both tabs see it. */
  file: HoldingsFile | null;
  onFile: (next: HoldingsFile | null) => void;
  /** How filing it into the investment sheet is going. */
  save: SaveStatus;
}) {
  const fmt = useMemo(() => makeFormatters(currency), [currency]);

  const [sectionName, setSectionName] = useState<string | null>(null);
  const [detail, setDetail] = useState<HoldingLine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** The combined view first when the statement has one. */
  const pickDefault = (f: HoldingsFile) =>
    (f.sections.find((s) => /combined/i.test(s.name)) ?? f.sections[0])?.name ?? null;

  useEffect(() => {
    if (file && !file.sections.some((s) => s.name === sectionName)) setSectionName(pickDefault(file));
  }, [file, sectionName]);

  const section = file?.sections.find((s) => s.name === sectionName) ?? file?.sections[0] ?? null;

  const open = async (picked: File | null | undefined) => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const sheets = await readSpreadsheetFile(picked);
      const parsed = parseHoldings(sheets, picked.name, new Date());
      onFile(parsed);
      setSectionName(pickDefault(parsed));
      setDetail(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = () => {
    onFile(null);
    setSectionName(null);
    setDetail(null);
  };

  // Biggest first: what you hold most of is what you care about most.
  const lines = useMemo(
    () => [...(section?.lines ?? [])].sort((a, b) => b.value - a.value),
    [section],
  );

  /** The three worth knowing without reading the whole list. */
  const highlights = useMemo(() => {
    if (lines.length === 0) return [];
    const total = lines.reduce((sum, l) => sum + l.value, 0);
    const byReturn = [...lines]
      .filter((l) => l.pnlPct != null)
      .sort((a, b) => (b.pnlPct ?? 0) - (a.pnlPct ?? 0));

    const out: { label: string; line: HoldingLine; note: string; tone: 'plain' | 'pos' | 'neg' }[] = [
      {
        label: 'Biggest',
        line: lines[0],
        note: total > 0 ? `${Math.round((lines[0].value / total) * 100)}%` : fmt.money(lines[0].value),
        tone: 'plain',
      },
    ];
    if (byReturn.length > 1) {
      const best = byReturn[0];
      const worst = byReturn[byReturn.length - 1];
      out.push({
        label: 'Best',
        line: best,
        note: fmt.pct(Number((best.pnlPct ?? 0).toFixed(2))),
        tone: (best.pnlPct ?? 0) >= 0 ? 'pos' : 'neg',
      });
      out.push({
        label: 'Worst',
        line: worst,
        note: fmt.pct(Number((worst.pnlPct ?? 0).toFixed(2))),
        tone: (worst.pnlPct ?? 0) >= 0 ? 'pos' : 'neg',
      });
    }
    return out;
  }, [lines, fmt]);

  const slices = useMemo(() => splitByCategory(section?.lines ?? []), [section]);
  const totals = section ? sectionTotals(section) : null;
  const up = (totals?.pnl ?? 0) >= 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        onChange={(e) => void open(e.target.files?.[0])}
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void open(e.dataTransfer.files?.[0]);
        }}
      >
        {error && (
          <div className="px-4 pb-3">
            <Banner kind="error">{error}</Banner>
          </div>
        )}

        {busy ? (
          <Spinner label="Reading your statement…" />
        ) : !file || !section ? (
          <Dropzone dragging={dragging} onPick={() => inputRef.current?.click()} />
        ) : (
          <div className="px-4 pb-32">
            {/* Where the file came from, and whether it's in the sheet yet */}
            <div className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="block min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{file.fileName}</span>
                  <span className="block truncate text-xs font-medium text-muted">
                    {[
                      prettyDate(file.asOn) && `As on ${prettyDate(file.asOn)}`,
                      file.clientId && `Client ${file.clientId}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="press shrink-0 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink2"
                >
                  Replace
                </button>
              </div>
              <SaveLine save={save} />
            </div>

            {/* Which statement */}
            {file.sections.length > 1 && (
              <div className="scroll-x -mx-4 mt-3 flex gap-2.5 px-4">
                {file.sections.map((s) => {
                  const on = s.name === section.name;
                  const c = accentFor(s.name);
                  return (
                    <button
                      key={s.name}
                      onClick={() => setSectionName(s.name)}
                      style={on ? { background: c, color: '#fff' } : { ['--accent' as string]: c }}
                      className={`press shrink-0 rounded-2xl px-4 py-2.5 text-sm font-bold ${
                        on ? 'shadow-card' : 'accent-chip'
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}

            {section.raw ? (
              <RawTable raw={section.raw} />
            ) : (
              <>
                {/* What it's worth */}
                <div
                  className="animate-rise relative mt-3 overflow-hidden rounded-card p-5 text-white shadow-card"
                  style={{
                    background: up
                      ? 'linear-gradient(135deg,#255b45 0%,#2f6f55 52%,#357a58 100%)'
                      : 'linear-gradient(135deg,#be123c 0%,#e11d48 55%,#f43f5e 100%)',
                  }}
                >
                  <div className="pointer-events-none absolute -top-14 -right-10 size-44 rounded-full bg-white/12 blur-2xl" />
                  <p className="text-[0.7rem] font-bold tracking-widest text-white/75 uppercase">
                    {section.name} · present value
                  </p>
                  <p className="mt-1.5 text-[2.2rem] leading-none font-extrabold tracking-tight tabular-nums">
                    {fmt.money(totals?.value ?? 0)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-bold tabular-nums backdrop-blur-sm">
                      {up ? <IconArrowUp className="size-4" /> : <IconArrowDown className="size-4" />}
                      {fmt.money(Math.abs(totals?.pnl ?? 0))}
                    </span>
                    <span className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-bold tabular-nums backdrop-blur-sm">
                      {totals?.pnlPct != null ? fmt.pct(Number(totals.pnlPct.toFixed(2))) : '—'}
                    </span>
                    <span className="text-sm font-semibold text-white/75">
                      on {fmt.money(totals?.invested ?? 0)} invested
                    </span>
                  </div>
                </div>

                {slices.length > 1 && <Split slices={slices} fmt={fmt} />}

                {/* Worth knowing before you read the list */}
                {highlights.length > 0 && (
                  <ul className="mt-3 overflow-hidden rounded-card bg-surface shadow-card">
                    {highlights.map((h, i) => (
                      <li key={h.label} className={i > 0 ? 'border-t border-line' : ''}>
                        <button
                          onClick={() => setDetail(h.line)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                        >
                          <span className="w-14 shrink-0 text-[0.62rem] font-extrabold tracking-wider text-muted uppercase">
                            {h.label}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-bold">
                            {h.line.name}
                          </span>
                          <span
                            className={`shrink-0 text-xs font-extrabold tabular-nums ${
                              h.tone === 'pos' ? 'text-pos' : h.tone === 'neg' ? 'text-neg' : 'text-ink2'
                            }`}
                          >
                            {h.note}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* The holdings themselves, biggest first */}
                <p className="mt-4 px-1 text-sm font-bold">
                  {plural(section.lines.length, 'holding')}
                  <span className="font-medium text-muted"> · biggest first</span>
                </p>

                <ul className="mt-3 overflow-hidden rounded-card bg-surface shadow-card">
                  {lines.map((l, i) => (
                    <LineRow key={`${l.isin}-${l.name}`} l={l} fmt={fmt} first={i === 0} onOpen={() => setDetail(l)} />
                  ))}
                </ul>

                <button
                  onClick={clear}
                  className="press mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3 text-xs font-bold text-muted"
                >
                  <IconTrash className="size-4" />
                  Remove this statement
                </button>

                <p className="mt-3 px-1 text-center text-[0.68rem] leading-relaxed text-muted">
                  Read from your file on this device. Nothing was uploaded, and your spreadsheets
                  weren't touched.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <LineDetail l={detail} fmt={fmt} onClose={() => setDetail(null)} />
    </div>
  );
}

/** One line: filed, filing, or what went wrong — never a button you must press. */
function SaveLine({ save }: { save: SaveStatus }) {
  if (!save.linked) {
    return (
      <p className="mt-2 border-t border-line pt-2 text-xs font-medium text-muted">
        Link your investment sheet in Settings to keep statements.
      </p>
    );
  }

  if (save.state === 'failed') {
    return (
      <button
        onClick={save.onRetry}
        className="press mt-2 flex w-full items-center gap-2 border-t border-line pt-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-neg">
          Couldn’t save to your sheet
        </span>
        <span className="shrink-0 text-xs font-bold text-brand">Try again</span>
      </button>
    );
  }

  const text =
    save.state === 'saving'
      ? 'Saving to your sheet…'
      : save.state === 'saved'
        ? `✓ In your sheet${save.detail ? ` · ${save.detail}` : ''}`
        : 'Not in your sheet yet';

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
      <p
        className={`min-w-0 flex-1 truncate text-xs font-semibold ${
          save.state === 'saved' ? 'text-pos' : 'text-muted'
        }`}
      >
        {text}
      </p>
      {save.state === 'unsaved' && (
        <button onClick={save.onRetry} className="press shrink-0 text-xs font-bold text-brand">
          Save
        </button>
      )}
    </div>
  );
}

function Dropzone({ dragging, onPick }: { dragging: boolean; onPick: () => void }) {
  return (
    <div className="px-4 pb-10">
      <button
        onClick={onPick}
        className={`press flex w-full flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? 'border-brand bg-brandsoft' : 'border-line bg-surface'
        }`}
      >
        <span className="grid size-16 place-items-center rounded-[1.4rem] bg-brandsoft text-brand">
          <IconUpload className="size-7" />
        </span>
        <span className="mt-1 block text-lg font-extrabold tracking-tight">
          Upload your holdings
        </span>
        <span className="block max-w-xs text-sm leading-relaxed text-muted">
          Pick the statement your broker gives you — an .xlsx or .csv file. Equity, mutual funds and
          the combined view all come through.
        </span>
        <span className="mt-2 inline-flex min-h-11 items-center rounded-2xl bg-brand px-5 text-sm font-bold text-onbrand">
          Choose file
        </span>
      </button>

      <div className="mt-5 rounded-card bg-surface p-4 shadow-soft">
        <p className="text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
          Where to get it
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink2">
          In Zerodha Console, open <span className="font-bold">Portfolio → Holdings</span> and
          download the statement. If it's sitting in Google Drive, download it there first and pick
          it here.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          The file is read inside this tab. It isn't uploaded anywhere, and it doesn't go into your
          Google Sheets.
        </p>
      </div>
    </div>
  );
}

function Split({ slices, fmt }: { slices: { label: string; value: number; share: number }[]; fmt: Formatters }) {
  return (
    <div className="mt-3 rounded-card bg-surface p-4 shadow-card">
      <h3 className="text-[0.68rem] font-extrabold tracking-widest text-muted uppercase">
        Where it sits
      </h3>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface2">
        {slices.map((s) => (
          <span
            key={s.label}
            title={`${s.label} ${Math.round(s.share)}%`}
            style={{ width: `${s.share}%`, background: accentFor(s.label) }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {slices.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[0.7rem] font-bold">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: accentFor(s.label) }} />
            <span className="text-ink2">{s.label}</span>
            <span className="text-muted tabular-nums">
              {Math.round(s.share)}% · {fmt.money(s.value)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function LineRow({
  l,
  fmt,
  first,
  onOpen,
}: {
  l: HoldingLine;
  fmt: Formatters;
  first: boolean;
  onOpen: () => void;
}) {
  const up = l.pnl >= 0;
  return (
    <li className={first ? '' : 'border-t border-line'}>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <Badge text={initials(l.name)} color={accentFor(l.category || l.name)} size="sm" />
        <span className="block min-w-0 flex-1">
          {/* Fund names are long; two lines beats an ellipsis on a phone. */}
          <span className="line-clamp-2 text-sm leading-snug font-bold">{l.name}</span>
          <span className="mt-0.5 block truncate text-xs font-medium text-muted">
            {qty(l.quantity)} × {fmt.money(l.avgPrice)}
            {l.category ? ` · ${l.category}` : ''}
          </span>
        </span>
        <span className="block shrink-0 text-right">
          <span className="block font-extrabold tabular-nums">{fmt.money(l.value)}</span>
          <span className={`block text-xs font-bold tabular-nums ${up ? 'text-pos' : 'text-neg'}`}>
            {up ? '▲' : '▼'} {l.pnlPct != null ? fmt.pct(Number(l.pnlPct.toFixed(2))) : fmt.money(l.pnl)}
          </span>
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

function LineDetail({ l, fmt, onClose }: { l: HoldingLine | null; fmt: Formatters; onClose: () => void }) {
  if (!l) return null;
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
            value={`${up ? '+' : '−'} ${fmt.money(Math.abs(l.pnl))}`}
            note={l.pnlPct != null ? fmt.pct(Number(l.pnlPct.toFixed(2))) : undefined}
            noteClass={up ? 'text-pos' : 'text-neg'}
          />
        </div>

        {l.extras.length > 0 && (
          <div>
            <p className="mb-2 text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
              Also in the statement
            </p>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {l.extras.map((x, i) => (
                <li
                  key={x.label}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                    i > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <span className="min-w-0 truncate text-xs font-medium text-muted">{x.label}</span>
                  <span className="shrink-0 text-xs font-bold tabular-nums">{x.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** A sheet we couldn't read as holdings is still shown, exactly as it came. */
function RawTable({ raw }: { raw: { headers: string[]; rows: string[][] } }) {
  return (
    <div className="mt-3">
      <p className="mb-2 px-1 text-xs font-medium text-muted">
        This sheet isn't a holdings table, so here it is as it came.
      </p>
      <div className="scroll-x rounded-card bg-surface shadow-card">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {raw.headers.map((h, i) => (
                <th
                  key={i}
                  className="border-b border-line px-4 py-3 text-left text-[0.68rem] font-bold whitespace-nowrap text-muted uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {raw.rows.map((row, r) => (
              <tr key={r}>
                {raw.headers.map((_, c) => (
                  <td
                    key={c}
                    className="border-b border-line px-4 py-3 font-medium whitespace-nowrap"
                  >
                    {row[c] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
