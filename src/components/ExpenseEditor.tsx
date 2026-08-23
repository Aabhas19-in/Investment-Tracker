import { useEffect, useMemo, useState } from 'react';
import { columnTypeDef, type ColumnType } from '../lib/columnTypes';
import {
  monthTitle,
  parseMonthTitle,
  parseSheetDate,
  toISODate,
  todayISO,
} from '../lib/expenses';
import { Banner, Button, Field, Sheet, inputClass } from './UI';
import { IconTrash } from './Icons';

function inputModeFor(type: ColumnType): 'decimal' | 'text' {
  return type === 'currency' || type === 'number' || type === 'percent' ? 'decimal' : 'text';
}

/**
 * Add / edit one expense. The Date column is mandatory and pre-filled with
 * today, but stays editable so you can back-date anything you forgot.
 */
export function ExpenseEditor({
  open,
  headers,
  columnTypes,
  dateIndex,
  categoryIndex,
  categories,
  sheetTitle,
  accent,
  displayRow,
  formulaRow,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  headers: string[];
  columnTypes: ColumnType[];
  dateIndex: number;
  categoryIndex: number;
  /** Existing categories in this sheet — the dynamic divisions you've built up. */
  categories: string[];
  sheetTitle: string;
  accent: string;
  /** Displayed values, used for date cells so we read a real date back. */
  displayRow: string[] | null;
  /** Raw values, used everywhere else so formulas survive an edit. */
  formulaRow: string[] | null;
  onClose: () => void;
  onSave: (values: string[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editing = displayRow !== null;

  useEffect(() => {
    if (!open) return;
    setValues(
      headers.map((_, i) => {
        // Dates come from the displayed value; a raw date cell can be a serial number.
        if (i === dateIndex) {
          const parsed = parseSheetDate(displayRow?.[i] ?? formulaRow?.[i] ?? '');
          return parsed ? toISODate(parsed) : editing ? '' : todayISO();
        }
        return formulaRow?.[i] ?? '';
      }),
    );
    setConfirmDelete(false);
  }, [open, headers, dateIndex, displayRow, formulaRow, editing]);

  const setAt = (i: number, v: string) =>
    setValues((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });

  /** Warn — but don't block — when a back-dated expense lands outside this month's tab. */
  const monthWarning = useMemo(() => {
    if (dateIndex < 0) return null;
    const sheetMonth = parseMonthTitle(sheetTitle);
    const picked = parseSheetDate(values[dateIndex] ?? '');
    if (!sheetMonth || !picked) return null;
    if (
      picked.getMonth() === sheetMonth.getMonth() &&
      picked.getFullYear() === sheetMonth.getFullYear()
    ) {
      return null;
    }
    return `This date falls in ${monthTitle(picked)}, but you're saving into ${sheetTitle}.`;
  }, [dateIndex, values, sheetTitle]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const shiftDate = (days: number) => {
    const base = parseSheetDate(values[dateIndex] ?? '') ?? new Date();
    base.setDate(base.getDate() + days);
    setAt(dateIndex, toISODate(base));
  };

  return (
    <Sheet open={open} title={editing ? 'Edit expense' : 'New expense'} onClose={onClose}>
      <div className="space-y-4">
        {headers.map((h, i) => {
          const type = columnTypes[i] ?? 'text';

          if (i === dateIndex) {
            return (
              <Field key={i} label={h || 'Date'}>
                <input
                  type="date"
                  className={inputClass}
                  value={values[i] ?? ''}
                  onChange={(e) => setAt(i, e.target.value)}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { label: 'Today', iso: todayISO() },
                    { label: 'Yesterday', iso: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toISODate(d); })() },
                  ].map((q) => (
                    <button
                      key={q.label}
                      onClick={() => setAt(i, q.iso)}
                      className={`press rounded-xl border px-3 py-2 text-xs font-bold ${
                        values[i] === q.iso ? 'border-brand bg-brandsoft text-brand' : 'border-line text-muted'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                  <button
                    onClick={() => shiftDate(-1)}
                    className="press rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted"
                  >
                    −1 day
                  </button>
                  <button
                    onClick={() => shiftDate(1)}
                    className="press rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted"
                  >
                    +1 day
                  </button>
                </div>
              </Field>
            );
          }

          if (i === categoryIndex) {
            // Pick-only: new categories are created deliberately from ⋯ → Categories,
            // never as a side effect of logging an expense.
            return (
              <Field key={i} label={h || 'Category'} hint="Tap one of your categories.">
                {categories.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line px-4 py-4 text-center">
                    <p className="text-sm font-bold">No categories yet</p>
                    <p className="mt-1 text-xs text-muted">
                      Close this and use ⋯ → Categories to create some first.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <button
                        key={c}
                        onClick={() => setAt(i, values[i] === c ? '' : c)}
                        className={`press rounded-xl border px-3.5 py-2.5 text-xs font-bold ${
                          values[i] === c
                            ? 'border-brand bg-brandsoft text-brand'
                            : 'border-line text-muted'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            );
          }

          return (
            <Field key={i} label={h || `Column ${i + 1}`}>
              <div className="relative">
                <input
                  className={inputClass}
                  value={values[i] ?? ''}
                  type={type === 'date' ? 'date' : 'text'}
                  inputMode={inputModeFor(type)}
                  placeholder={type === 'text' ? '' : '0'}
                  onChange={(e) => setAt(i, e.target.value)}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[0.66rem] font-bold tracking-wider text-muted/70 uppercase">
                  {type !== 'text' && type !== 'date' ? columnTypeDef(type).label : ''}
                </span>
              </div>
            </Field>
          );
        })}

        {monthWarning && <Banner kind="info">{monthWarning}</Banner>}

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
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
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
                Delete expense
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
