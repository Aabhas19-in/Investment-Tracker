import { useMemo, useState } from 'react';
import type { ColumnSpec, SheetData, SheetMeta } from '../types';
import { parseNumeric } from '../lib/format';
import { columnTypeDef, isCompleted, type ColumnType } from '../lib/columnTypes';
import { isPressing, triggerInfo, triggerTone, type TriggerInfo } from '../lib/triggers';
import { accentFor, initials } from '../lib/accent';
import { sheetUrl, useConfig } from '../lib/config';
import { Badge, Button, Empty, IconButton, Sheet, Spinner, inputClass } from './UI';
import {
  IconCards,
  IconClose,
  IconDots,
  IconExternal,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconBell,
  IconSearch,
  IconTable,
  IconTrash,
} from './Icons';
import { ColumnManager, NewSheetDialog } from './Manage';
import { RowEditor } from './RowEditor';

export interface DataActions {
  createSheet(title: string, columns: ColumnSpec[]): Promise<void>;
  deleteSheet(sheetId: number): Promise<void>;
  renameSheet(sheetId: number, title: string): Promise<void>;
  addColumn(name: string, type: ColumnType): Promise<void>;
  renameColumn(index: number, name: string): Promise<void>;
  retypeColumn(index: number, type: ColumnType): Promise<void>;
  deleteColumn(index: number): Promise<void>;
  addRow(values: string[]): Promise<void>;
  updateRow(index: number, values: string[]): Promise<void>;
  deleteRow(index: number): Promise<void>;
}

/**
 * Which columns carry the story of a row, so the card can lead with them.
 * Everything else still shows, just smaller.
 */
function pickHighlights(headers: string[], types: ColumnType[]) {
  const find = (pred: (h: string, i: number) => boolean) => headers.findIndex(pred);

  const title = (() => {
    const named = find((h) => /name|stock|fund|coin|bank|item|form|type/i.test(h));
    if (named >= 0) return named;
    const text = types.findIndex((t) => t === 'text');
    return text >= 0 ? text : 0;
  })();

  // Deliberately 'date' and not any date-like column: a trigger date is shown
  // by its own badge, so leading a card with it would read as the purchase date.
  const date = types.findIndex((t) => t === 'date');

  const value = (() => {
    const current = find((h) => /current value|market value|maturity amount/i.test(h));
    if (current >= 0) return current;
    const invested = find((h) => /amount invested|invested|principal/i.test(h));
    if (invested >= 0) return invested;
    return types.findIndex((t) => t === 'currency');
  })();

  return { title, date, value };
}

export function DataView({
  sheets,
  active,
  data,
  loading,
  spreadsheetId,
  onSelect,
  onRefresh,
  actions,
  reminderCounts,
}: {
  sheets: SheetMeta[];
  active: SheetMeta | null;
  data: SheetData | null;
  loading: boolean;
  spreadsheetId: string;
  onSelect: (title: string) => void;
  onRefresh: () => void;
  actions: DataActions;
  /** Pending reminders per sheet title, for the badge on each chip. */
  reminderCounts: Record<string, number>;
}) {
  const [config, setConfig] = useConfig();
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmSheetDelete, setConfirmSheetDelete] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const headers = data?.headers ?? [];
  const rows = data?.rows ?? [];
  const accent = accentFor(active?.title ?? '');

  const defs = useMemo(
    () => headers.map((_, i) => columnTypeDef(data?.columnTypes[i] ?? 'text')),
    [headers, data],
  );
  const hasTotals = defs.some((d) => d.totals);
  const highlights = useMemo(
    () => pickHighlights(headers, data?.columnTypes ?? []),
    [headers, data],
  );

  const statusCols = useMemo(
    () =>
      headers.map((_, i) => i).filter((i) => (data?.columnTypes[i] ?? 'text') === 'status'),
    [headers, data],
  );

  /** Ticked-off entries stay in the spreadsheet; they just leave this list. */
  const isRowCompleted = useMemo(
    () => (row: string[]) => statusCols.some((i) => isCompleted(row[i] ?? '')),
    [statusCols],
  );

  const completedCount = useMemo(
    () => (statusCols.length === 0 ? 0 : rows.filter(isRowCompleted).length),
    [rows, statusCols, isRowCompleted],
  );

  // Keep the original row index so edits hit the right sheet row after filtering.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let indexed = rows.map((row, index) => ({ row, index }));
    if (!showCompleted) indexed = indexed.filter(({ row }) => !isRowCompleted(row));
    if (!q) return indexed;
    return indexed.filter(({ row }) => row.some((c) => c.toLowerCase().includes(q)));
  }, [rows, query, showCompleted, isRowCompleted]);

  /**
   * Every trigger date that has arrived or is close, newest deadline first.
   * The sheet colours these cells too; this is what puts them in front of you
   * the moment the tab opens.
   */
  const alerts = useMemo(() => {
    const cols = headers
      .map((_, i) => i)
      .filter((i) => (data?.columnTypes[i] ?? 'text') === 'trigger');
    if (cols.length === 0) return [];

    const found: { rowIndex: number; label: string; column: string; info: TriggerInfo }[] = [];
    rows.forEach((row, rowIndex) => {
      if (isRowCompleted(row)) return; // done deals stop reminding
      for (const i of cols) {
        const info = triggerInfo(row[i]);
        if (!info || !isPressing(info)) continue;
        found.push({
          rowIndex,
          column: headers[i],
          info,
          label: row[highlights.title]?.trim() || `Row ${rowIndex + 2}`,
        });
      }
    });
    return found.sort((a, b) => a.info.days - b.info.days);
  }, [rows, headers, data, highlights.title, isRowCompleted]);

  const overdueCount = alerts.filter((a) => a.info.status !== 'soon').length;
  const soonCount = alerts.length - overdueCount;

  /**
   * Row index -> its nearest trigger, for the badge on each card. Distant ones
   * are included too and simply render muted, so a 2028 maturity is visible
   * from the day you enter it rather than appearing out of nowhere.
   */
  const rowTriggers = useMemo(() => {
    const cols = headers
      .map((_, i) => i)
      .filter((i) => (data?.columnTypes[i] ?? 'text') === 'trigger');
    const map = new Map<number, TriggerInfo>();
    rows.forEach((row, rowIndex) => {
      if (isRowCompleted(row)) return;
      for (const i of cols) {
        const info = triggerInfo(row[i]);
        if (!info) continue;
        const current = map.get(rowIndex);
        if (!current || info.days < current.days) map.set(rowIndex, info);
      }
    });
    return map;
  }, [rows, headers, data, isRowCompleted]);

  const totals = useMemo(
    () =>
      headers
        .map((header, i) => ({ header, i }))
        .filter(({ i }) => defs[i].totals)
        .map(({ header, i }) => ({
          header,
          value: visible.reduce((sum, { row }) => sum + (parseNumeric(row[i]) ?? 0), 0),
        })),
    [headers, defs, visible],
  );

  // Which totals show as tags is a per-sheet view preference, remembered like
  // the theme. Crossing a tag off here is the same switch as the one in
  // Manage columns, so it stays off until you turn it back on there.
  const sheetKey = active?.title ?? '';
  const hidden = config.hiddenTotals[sheetKey] ?? [];
  const shownTotals = totals.filter((t) => !hidden.includes(t.header));

  const setTagVisible = (header: string, visible: boolean) =>
    setConfig({
      hiddenTotals: {
        ...config.hiddenTotals,
        [sheetKey]: visible ? hidden.filter((h) => h !== header) : [...hidden, header],
      },
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sheet switcher */}
      <div className="scroll-x flex shrink-0 gap-2.5 px-4 pt-1 pb-3">
        {sheets.map((s) => {
          const c = accentFor(s.title);
          const on = active?.sheetId === s.sheetId;
          return (
            <button
              key={s.sheetId}
              onClick={() => onSelect(s.title)}
              style={on ? { background: c, color: '#fff' } : { ['--accent' as string]: c }}
              className={`press flex shrink-0 items-center gap-2 rounded-2xl py-2.5 pr-4 pl-2.5 text-sm font-bold ${
                on ? 'shadow-card' : 'accent-chip'
              }`}
            >
              <span
                className="grid size-7 place-items-center rounded-xl text-[0.65rem] font-extrabold"
                style={
                  on
                    ? { background: 'rgb(255 255 255 / 0.25)', color: '#fff' }
                    : { background: `color-mix(in srgb, ${c} 22%, transparent)`, color: c }
                }
              >
                {initials(s.title)}
              </span>
              {s.title}
              {Boolean(reminderCounts[s.title]) && (
                <span
                  className="grid min-w-5 place-items-center rounded-full px-1.5 text-[0.62rem] font-extrabold"
                  style={
                    on
                      ? { background: 'rgb(255 255 255 / 0.3)', color: '#fff' }
                      : { background: 'var(--neg)', color: '#fff' }
                  }
                >
                  {reminderCounts[s.title]}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setNewSheetOpen(true)}
          className="press flex shrink-0 items-center gap-1.5 rounded-2xl border border-dashed border-line px-4 py-2.5 text-sm font-bold text-muted"
        >
          <IconPlus className="size-4" />
          New
        </button>
      </div>

      {/* Totals + toolbar */}
      {active && headers.length > 0 && (
        <div className="shrink-0 px-4 pb-3">
          {hasTotals && (
            <div className="scroll-x -mx-4 flex gap-3 px-4 pb-3">
              {shownTotals.map((t) => (
                <div
                  key={t.header}
                  className="relative min-w-36 shrink-0 rounded-card bg-surface px-4 py-3 shadow-card"
                >
                  <button
                    onClick={() => setTagVisible(t.header, false)}
                    aria-label={`Hide ${t.header} total`}
                    className="press absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-surface2 text-muted"
                  >
                    <IconClose className="size-3" strokeWidth={2.6} />
                  </button>
                  <p className="truncate pr-7 text-[0.68rem] font-bold tracking-wider text-muted uppercase">
                    {t.header}
                  </p>
                  <p className="mt-1 text-lg font-extrabold tabular-nums" style={{ color: accent }}>
                    {t.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
              ))}

            </div>
          )}

          <div className="flex items-center gap-2">
            {searchOpen ? (
              <input
                className={inputClass}
                value={query}
                autoFocus
                placeholder={`Search ${active.title}…`}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => !query && setSearchOpen(false)}
              />
            ) : (
              <>
                <div className="flex-1">
                  <p className="text-sm font-bold">
                    {visible.length} {visible.length === 1 ? 'entry' : 'entries'}
                  </p>
                  <p className="text-xs font-medium text-muted">
                    Tap one to edit or delete
                    {completedCount > 0 && (
                      <>
                        {' · '}
                        <button
                          onClick={() => setShowCompleted(!showCompleted)}
                          className="font-bold text-brand"
                        >
                          {showCompleted ? 'hide' : 'show'} {completedCount} completed
                        </button>
                      </>
                    )}
                  </p>
                </div>
                <IconButton label="Search" onClick={() => setSearchOpen(true)}>
                  <IconSearch />
                </IconButton>
                <IconButton
                  label={view === 'cards' ? 'Switch to table' : 'Switch to cards'}
                  onClick={() => setView(view === 'cards' ? 'table' : 'cards')}
                >
                  {view === 'cards' ? <IconTable /> : <IconCards />}
                </IconButton>
                <IconButton label="Refresh" onClick={onRefresh}>
                  <IconRefresh />
                </IconButton>
              </>
            )}
            <IconButton
              label="Sheet options"
              onClick={() => {
                setRenameDraft(active.title);
                setConfirmSheetDelete(false);
                setMoreOpen(true);
              }}
            >
              <IconDots />
            </IconButton>
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {alerts.length > 0 && (
          <div className="animate-rise mx-4 mb-3 overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <IconBell className="size-4 text-neg" />
              <p className="text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
                {alerts.length} {alerts.length === 1 ? 'reminder' : 'reminders'}
              </p>
              <span className="ml-auto flex items-center gap-1.5">
                {overdueCount > 0 && (
                  <span className="rounded-full bg-neg/12 px-2 py-0.5 text-[0.68rem] font-extrabold text-neg">
                    {overdueCount} due
                  </span>
                )}
                {soonCount > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[0.68rem] font-extrabold"
                    style={{ color: '#b4740f', background: 'color-mix(in srgb, #e8992b 16%, transparent)' }}
                  >
                    {soonCount} soon
                  </span>
                )}
              </span>
            </div>
            <ul>
              {(alertsExpanded ? alerts : alerts.slice(0, 5)).map((a, i) => {
                const tone = triggerTone(a.info.status);
                return (
                  <li
                    key={`${a.rowIndex}-${a.column}-${i}`}
                    onClick={() => setEditing(a.rowIndex)}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-3 active:bg-surface2 ${
                      i > 0 ? 'border-t border-line' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{a.label}</p>
                      <p className="truncate text-xs font-medium text-muted">{a.column}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold"
                      style={{ color: tone.fg, background: tone.bg }}
                    >
                      {a.info.status === 'passed' ? 'Due' : ''} {a.info.label}
                    </span>
                  </li>
                );
              })}
            </ul>
            {alerts.length > 5 && (
              <button
                onClick={() => setAlertsExpanded(!alertsExpanded)}
                className="press w-full border-t border-line px-4 py-2.5 text-xs font-bold text-brand"
              >
                {alertsExpanded ? 'Show less' : `Show all ${alerts.length}`}
              </button>
            )}
          </div>
        )}
        {loading && !data ? (
          <Spinner label="Reading your sheet…" />
        ) : !active ? (
          <Empty
            emoji="🌱"
            title="Start your first sheet"
            body="One sheet per kind of investment — Gold, Stocks, whatever you're putting money into."
            action={
              <Button icon={<IconPlus />} onClick={() => setNewSheetOpen(true)}>
                Create a sheet
              </Button>
            }
          />
        ) : headers.length === 0 ? (
          <Empty
            emoji="🧱"
            title={`${active.title} has no columns`}
            body="Add the columns you want to track. You can change them whenever you like."
            action={<Button onClick={() => setColumnsOpen(true)}>Add columns</Button>}
          />
        ) : visible.length === 0 ? (
          <Empty
            emoji={query ? '🔍' : '💸'}
            title={query ? 'Nothing matches' : 'No entries yet'}
            body={
              query
                ? 'Try a different search term.'
                : 'Tap the + button to record your first investment here.'
            }
          />
        ) : view === 'cards' ? (
          <ul className="space-y-3 px-4 pb-32">
            {visible.map(({ row, index }, n) => (
              <EntryCard
                key={index}
                row={row}
                headers={headers}
                defs={defs}
                highlights={highlights}
                accent={accent}
                trigger={rowTriggers.get(index)}
                completed={isRowCompleted(row)}
                delay={n}
                onOpen={() => setEditing(index)}
              />
            ))}
          </ul>
        ) : (
          <div className="px-4 pb-32">
            <div className="scroll-x rounded-card bg-surface shadow-card">
              {/* border-separate, not collapse: sticky cells don't work under
                  border-collapse in Chrome, which unpins the Edit column. */}
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        className={`border-b border-line px-4 py-3 text-[0.68rem] font-bold whitespace-nowrap text-muted uppercase ${
                          defs[i].numeric ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h || `Col ${i + 1}`}
                      </th>
                    ))}
                    <th className="sticky right-0 border-b border-line bg-surface px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ row, index }) => (
                    <tr key={index} onClick={() => setEditing(index)} className="cursor-pointer">
                      {headers.map((_, i) => (
                        <td
                          key={i}
                          className={`border-b border-line px-4 py-3.5 font-medium whitespace-nowrap ${
                            defs[i].numeric ? 'text-right tabular-nums' : 'text-left'
                          } ${row[i] ? '' : 'text-muted/50'}`}
                        >
                          {row[i] || '—'}
                        </td>
                      ))}
                      <td className="sticky right-0 border-b border-line bg-surface px-3 py-3.5">
                        <span className="grid size-8 place-items-center rounded-xl bg-surface2 text-ink2">
                          <IconPencil className="size-4" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add entry */}
      {active && headers.length > 0 && (
        <button
          onClick={() => setEditing('new')}
          style={{ background: accent }}
          className="press fixed right-5 bottom-26 z-30 grid size-15 place-items-center rounded-[1.4rem] text-white shadow-glow"
          aria-label="Add entry"
        >
          <IconPlus className="size-7" strokeWidth={2.4} />
        </button>
      )}

      <NewSheetDialog
        open={newSheetOpen}
        existingTitles={sheets.map((s) => s.title)}
        onClose={() => setNewSheetOpen(false)}
        onCreate={async (title, columns) => {
          await actions.createSheet(title, columns);
          setNewSheetOpen(false);
        }}
      />

      {active && (
        <ColumnManager
          open={columnsOpen}
          headers={headers}
          columnTypes={data?.columnTypes ?? []}
          sheetTitle={active.title}
          tags={{ hidden, onToggle: setTagVisible }}
          onClose={() => setColumnsOpen(false)}
          onAdd={actions.addColumn}
          onRename={actions.renameColumn}
          onRetype={actions.retypeColumn}
          onDelete={actions.deleteColumn}
        />
      )}

      <RowEditor
        open={editing !== null}
        headers={headers}
        columnTypes={data?.columnTypes ?? []}
        accent={accent}
        rowNumber={typeof editing === 'number' ? editing + 2 : rows.length + 2}
        displayRow={typeof editing === 'number' ? (rows[editing] ?? []) : null}
        formulaRow={typeof editing === 'number' ? (data?.formulaRows[editing] ?? []) : null}
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          if (typeof editing === 'number') await actions.updateRow(editing, values);
          else await actions.addRow(values);
          setEditing(null);
        }}
        onDelete={
          typeof editing === 'number'
            ? async () => {
                await actions.deleteRow(editing);
                setEditing(null);
              }
            : undefined
        }
      />

      {active && (
        <Sheet open={moreOpen} title={active.title} onClose={() => setMoreOpen(false)}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
              />
              <Button
                disabled={!renameDraft.trim() || renameDraft === active.title}
                onClick={async () => {
                  await actions.renameSheet(active.sheetId, renameDraft.trim());
                  setMoreOpen(false);
                }}
              >
                Rename
              </Button>
            </div>

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
              {confirmSheetDelete ? (
                <Button
                  full
                  variant="danger"
                  icon={<IconTrash />}
                  onClick={async () => {
                    await actions.deleteSheet(active.sheetId);
                    setMoreOpen(false);
                  }}
                >
                  Yes, delete “{active.title}”
                </Button>
              ) : (
                <Button full variant="danger" icon={<IconTrash />} onClick={() => setConfirmSheetDelete(true)}>
                  Delete this sheet
                </Button>
              )}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function EntryCard({
  row,
  headers,
  defs,
  highlights,
  accent,
  trigger,
  completed,
  delay,
  onOpen,
}: {
  row: string[];
  headers: string[];
  defs: { numeric: boolean }[];
  highlights: { title: number; date: number; value: number };
  accent: string;
  trigger?: TriggerInfo;
  completed?: boolean;
  delay: number;
  onOpen: () => void;
}) {
  const title = row[highlights.title]?.trim() || headers[highlights.title] || 'Entry';
  const date = highlights.date >= 0 ? row[highlights.date] : '';
  const value = highlights.value >= 0 ? row[highlights.value] : '';

  // Every remaining column, empty ones included — otherwise a freshly added
  // column (appended last, still blank) would be invisible on the card.
  const rest = headers
    .map((h, i) => ({ h, v: row[i], i }))
    .filter(({ i }) => i !== highlights.title && i !== highlights.date && i !== highlights.value);

  return (
    <li
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(delay, 8) * 28}ms` }}
      className={`press animate-rise cursor-pointer rounded-card bg-surface p-4 shadow-card ${
        completed ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <Badge text={initials(title)} color={accent} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold tracking-tight">{title}</p>
          {date && <p className="mt-0.5 text-xs font-semibold text-muted">{date}</p>}
          {completed && (
            <span className="mt-1.5 mr-1.5 inline-flex items-center gap-1 rounded-full bg-pos/12 px-2 py-0.5 text-[0.68rem] font-extrabold text-pos">
              ✓ Completed
            </span>
          )}
          {trigger && (
            <span
              className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-extrabold"
              style={{ color: triggerTone(trigger.status).fg, background: triggerTone(trigger.status).bg }}
            >
              <IconBell className="size-3" />
              {trigger.status === 'passed' ? 'Due' : ''} {trigger.label}
            </span>
          )}
        </div>
        {value && (
          <div className="text-right">
            <p className="text-lg font-extrabold tabular-nums">{value}</p>
            <p className="text-[0.68rem] font-bold tracking-wider text-muted uppercase">
              {headers[highlights.value]}
            </p>
          </div>
        )}
      </div>

      {rest.length > 0 && (
        <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-line pt-3.5">
          {rest.map(({ h, v, i }) => (
            <div key={i} className="min-w-0">
              <dt className="truncate text-[0.66rem] font-bold tracking-wider text-muted uppercase">
                {h}
              </dt>
              <dd
                className={`truncate text-sm font-semibold ${defs[i].numeric ? 'tabular-nums' : ''} ${
                  v?.trim() ? '' : 'text-muted/50'
                }`}
              >
                {v?.trim() || '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
