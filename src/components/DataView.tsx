import { useMemo, useState } from 'react';
import type { ColumnSpec, SheetData, SheetMeta } from '../types';
import { parseNumeric } from '../lib/format';
import { columnTypeDef, type ColumnType } from '../lib/columnTypes';
import { sheetUrl } from '../lib/config';
import { Button, Empty, Sheet, Spinner, inputClass } from './UI';
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

export function DataView({
  sheets,
  active,
  data,
  loading,
  spreadsheetId,
  onSelect,
  onRefresh,
  actions,
}: {
  sheets: SheetMeta[];
  active: SheetMeta | null;
  data: SheetData | null;
  loading: boolean;
  spreadsheetId: string;
  onSelect: (title: string) => void;
  onRefresh: () => void;
  actions: DataActions;
}) {
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmSheetDelete, setConfirmSheetDelete] = useState(false);

  const headers = data?.headers ?? [];
  const rows = data?.rows ?? [];

  // Alignment and totals both follow the column's declared type — no guessing
  // from the data, so nothing gets summed unless you asked for it.
  const defs = useMemo(
    () => headers.map((_, i) => columnTypeDef(data?.columnTypes[i] ?? 'text')),
    [headers, data],
  );
  const hasTotals = defs.some((d) => d.totals);

  // Keep the original row index so edits hit the right sheet row after filtering.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const indexed = rows.map((row, index) => ({ row, index }));
    if (!q) return indexed;
    return indexed.filter(({ row }) => row.some((c) => c.toLowerCase().includes(q)));
  }, [rows, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sheet tabs */}
      <div className="scroll-x flex shrink-0 gap-2 border-b border-[var(--color-line)] px-4 py-3">
        {sheets.map((s) => (
          <button
            key={s.sheetId}
            onClick={() => onSelect(s.title)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              active?.sheetId === s.sheetId
                ? 'bg-emerald-400 text-slate-950'
                : 'border border-[var(--color-line)] bg-[var(--color-ink-soft)] text-slate-300'
            }`}
          >
            {s.title}
          </button>
        ))}
        <button
          onClick={() => setNewSheetOpen(true)}
          className="shrink-0 rounded-full border border-dashed border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-mute)]"
        >
          + New
        </button>
      </div>

      {/* Toolbar */}
      {active && (
        <div className="flex shrink-0 items-center gap-2 px-4 py-3">
          <input
            className={`${inputClass} py-2.5`}
            value={query}
            placeholder={`Search ${active.title}…`}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="ghost" onClick={onRefresh}>
            ↻
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRenameDraft(active.title);
              setConfirmSheetDelete(false);
              setMoreOpen(true);
            }}
          >
            ⋯
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !data ? (
          <Spinner label="Reading your sheet…" />
        ) : !active ? (
          <Empty
            title="No sheets yet"
            body="Create your first sheet — one per kind of investment, like Gold or Stocks."
            action={<Button onClick={() => setNewSheetOpen(true)}>Create a sheet</Button>}
          />
        ) : headers.length === 0 ? (
          <Empty
            title={`${active.title} has no columns`}
            body="Add the columns you want to track. You can change them any time."
            action={<Button onClick={() => setColumnsOpen(true)}>Add columns</Button>}
          />
        ) : visible.length === 0 ? (
          <Empty
            title={query ? 'Nothing matches' : 'No entries yet'}
            body={
              query
                ? 'Try a different search.'
                : 'Tap the + button to record your first investment in this sheet.'
            }
          />
        ) : (
          <div className="px-4 pb-28">
            <p className="pb-2 text-xs text-[var(--color-mute)]">
              Tap a row to edit or delete it
              {hasTotals && (
                <> · totals cover the {visible.length} row{visible.length === 1 ? '' : 's'} shown</>
              )}
            </p>
            <div className="scroll-x">
              <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-[var(--color-ink)] px-2 py-2 text-right text-xs font-medium text-[var(--color-mute)]">
                    #
                  </th>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={`border-b border-[var(--color-line)] px-3 py-2 text-xs font-semibold whitespace-nowrap text-[var(--color-mute)] uppercase ${
                        defs[i].numeric ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h || `Col ${i + 1}`}
                    </th>
                  ))}
                  {/* Pinned to the right edge so editing stays reachable at any scroll position. */}
                  <th className="sticky right-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-ink)] px-2 py-2 text-xs font-semibold text-[var(--color-mute)] uppercase">
                    Edit
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, index }) => (
                  <tr
                    key={index}
                    onClick={() => setEditing(index)}
                    className="cursor-pointer active:bg-[var(--color-ink-soft)]"
                  >
                    <td className="sticky left-0 z-10 bg-[var(--color-ink)] px-2 py-3 text-right text-xs text-[var(--color-line)]">
                      {index + 2}
                    </td>
                    {headers.map((_, i) => (
                      <td
                        key={i}
                        className={`border-b border-[var(--color-line)] px-3 py-3 whitespace-nowrap ${
                          defs[i].numeric ? 'text-right tabular-nums' : 'text-left'
                        } ${row[i] ? 'text-slate-100' : 'text-[var(--color-line)]'}`}
                      >
                        {row[i] || '—'}
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-ink)] px-2 py-3 text-center">
                      <span
                        aria-hidden
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-ink-soft)] text-sm text-emerald-300"
                      >
                        ✎
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {hasTotals && (
                <tfoot>
                  <tr>
                    <td className="sticky left-0 bg-[var(--color-ink)]" />
                    {headers.map((_, i) => {
                      if (!defs[i].totals) return <td key={i} />;
                      const total = visible.reduce(
                        (sum, { row }) => sum + (parseNumeric(row[i]) ?? 0),
                        0,
                      );
                      return (
                        <td
                          key={i}
                          className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-300"
                        >
                          {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 bg-[var(--color-ink)]" />
                  </tr>
                </tfoot>
              )}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add entry */}
      {active && headers.length > 0 && (
        <button
          onClick={() => setEditing('new')}
          className="fixed right-5 bottom-24 z-30 flex size-14 items-center justify-center rounded-full bg-emerald-400 text-3xl font-light text-slate-950 shadow-lg shadow-emerald-500/20 active:bg-emerald-300"
          aria-label="Add entry"
        >
          +
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
        rowNumber={typeof editing === 'number' ? editing + 2 : rows.length + 2}
        initial={typeof editing === 'number' ? (data?.formulaRows[editing] ?? []) : null}
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
          <div className="space-y-4">
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
              className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-ink-soft)] px-4 text-sm font-semibold text-slate-200"
            >
              Open in Google Sheets ↗
            </a>

            <div className="border-t border-[var(--color-line)] pt-4">
              {confirmSheetDelete ? (
                <Button
                  full
                  variant="danger"
                  onClick={async () => {
                    await actions.deleteSheet(active.sheetId);
                    setMoreOpen(false);
                  }}
                >
                  Yes, delete “{active.title}” and all its rows
                </Button>
              ) : (
                <Button full variant="danger" onClick={() => setConfirmSheetDelete(true)}>
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
