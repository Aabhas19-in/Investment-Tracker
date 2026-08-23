import { useEffect, useState } from 'react';
import { columnTypeDef, type ColumnType } from '../lib/columnTypes';
import { parseSheetDate, toISODate, todayISO } from '../lib/dates';
import { Button, Field, Sheet, inputClass } from './UI';
import { DateField } from './DateField';
import { IconTrash } from './Icons';

/** The keyboard that suits each column type — small thing, big deal on a phone. */
function inputModeFor(type: ColumnType): 'decimal' | 'text' {
  return type === 'currency' || type === 'number' || type === 'percent' ? 'decimal' : 'text';
}

/**
 * Add / edit one row. Values are sent with USER_ENTERED, so anything starting
 * with `=` is stored as a live spreadsheet formula (e.g. `=C2*D2`).
 */
export function RowEditor({
  open,
  headers,
  columnTypes,
  accent,
  displayRow,
  formulaRow,
  rowNumber,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  headers: string[];
  columnTypes: ColumnType[];
  accent: string;
  /** Displayed values — used for date cells, whose raw value is a serial number. */
  displayRow: string[] | null;
  /** Raw cell contents, so formulas survive an edit. Null when adding. */
  formulaRow: string[] | null;
  /** Sheet row number, shown so `=C4*D4` style formulas are easy to write. */
  rowNumber: number | null;
  onClose: () => void;
  onSave: (values: string[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editing = formulaRow !== null;

  useEffect(() => {
    if (!open) return;
    setValues(
      headers.map((_, i) => {
        // Every date column opens on today for a new row, and on its own stored
        // date when editing — never on a raw serial number.
        if ((columnTypes[i] ?? 'text') === 'date') {
          const parsed = parseSheetDate(displayRow?.[i] ?? formulaRow?.[i] ?? '');
          return parsed ? toISODate(parsed) : editing ? '' : todayISO();
        }
        return formulaRow?.[i] ?? '';
      }),
    );
    setConfirmDelete(false);
  }, [open, headers, columnTypes, displayRow, formulaRow, editing]);

  const setAt = (i: number, v: string) =>
    setValues((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title={editing ? 'Edit entry' : 'New entry'} onClose={onClose}>
      <div className="space-y-4">
        {headers.length === 0 && (
          <p className="text-sm text-muted">This sheet has no columns yet. Add one first.</p>
        )}

        {headers.map((h, i) => {
          const type = columnTypes[i] ?? 'text';

          if (type === 'date') {
            return (
              <Field key={`${h}-${i}`} label={h || 'Date'}>
                <DateField value={values[i] ?? ''} onChange={(iso) => setAt(i, iso)} />
              </Field>
            );
          }

          return (
            <Field key={`${h}-${i}`} label={h || `Column ${i + 1}`}>
              <div className="relative">
                <input
                  className={inputClass}
                  value={values[i] ?? ''}
                  inputMode={inputModeFor(type)}
                  placeholder={type === 'text' ? '' : '0'}
                  onChange={(e) => setAt(i, e.target.value)}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[0.66rem] font-bold tracking-wider text-muted/70 uppercase">
                  {type !== 'text' ? columnTypeDef(type).label : ''}
                </span>
              </div>
            </Field>
          );
        })}

        {headers.length > 0 && (
          <div className="rounded-2xl bg-surface2 px-4 py-3 text-xs leading-relaxed text-ink2">
            Start a value with <code className="font-bold text-brand">=</code> to store a live
            spreadsheet formula
            {rowNumber ? (
              <>
                {' '}— e.g.{' '}
                <code className="font-bold text-brand">
                  =C{rowNumber}*D{rowNumber}
                </code>
              </>
            ) : null}
            .
          </div>
        )}

        <div className="sticky bottom-0 -mx-5 flex gap-3 bg-bg px-5 pt-3 pb-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <button
            onClick={() => run(() => onSave(values))}
            disabled={busy || headers.length === 0}
            style={{ background: accent }}
            className="press min-h-12 flex-1 rounded-2xl text-[0.9rem] font-bold text-white shadow-card disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save to sheet'}
          </button>
        </div>

        {onDelete && (
          <div className="border-t border-line pt-4">
            {confirmDelete ? (
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
                <div className="flex-1">
                  <Button full variant="danger" disabled={busy} onClick={() => run(onDelete)}>
                    Delete permanently
                  </Button>
                </div>
              </div>
            ) : (
              <Button full variant="danger" icon={<IconTrash />} onClick={() => setConfirmDelete(true)}>
                Delete entry
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
