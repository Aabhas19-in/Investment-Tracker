import { useEffect, useState } from 'react';
import {
  STATUS_DONE,
  STATUS_OPEN,
  columnTypeDef,
  isCompleted,
  isDateLike,
  type ColumnType,
} from '../lib/columnTypes';
import { parseSheetDate, toISODate, todayISO } from '../lib/dates';
import { Button, Field, Sheet, inputClass } from './UI';
import { DateField } from './DateField';
import { IconTrash } from './Icons';
import { InvestmentTypeSelector, type InvestmentType } from './InvestmentTypeSelector';

/** The keyboard that suits each column type — small thing, big deal on a phone. */
function inputModeFor(type: ColumnType): 'decimal' | 'text' {
  return type === 'currency' || type === 'number' || type === 'percent' ? 'decimal' : 'text';
}

/**
 * Provide contextual hints for fields based on investment type.
 */
function getFieldHint(fieldName: string, investmentType: InvestmentType): string | undefined {
  const lowerName = fieldName.toLowerCase();

  if (investmentType === 'sip') {
    if (/monthly|amount|installment|payment|contribution/.test(lowerName)) {
      return '📊 For SIP: Enter your regular monthly investment amount';
    }
    if (/duration|months|tenure|period/.test(lowerName)) {
      return '📊 For SIP: Number of months you plan to invest';
    }
    if (/start|begin|from date/.test(lowerName)) {
      return '📊 For SIP: Date when you start making regular investments';
    }
  } else {
    if (/amount|principal|invested|investment/.test(lowerName)) {
      return '💰 For Lump Sum: The total amount you invested at once';
    }
    if (/date|purchase|invested.*date/.test(lowerName)) {
      return '💰 For Lump Sum: The date of your single investment';
    }
    if (/maturity|end|mature.*date/.test(lowerName)) {
      return '💰 For Lump Sum: When your investment matures or is due';
    }
  }

  return undefined;
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
  const [investmentType, setInvestmentType] = useState<InvestmentType>('lump-sum');

  const editing = formulaRow !== null;

  // Detect if there's an "Investment Type" column
  const investmentTypeColIndex = headers.findIndex(
    (h) => /investment.?type|type.?investment/i.test(h),
  );
  const hasInvestmentTypeColumn = investmentTypeColIndex >= 0;

  useEffect(() => {
    if (!open) return;
    setValues(
      headers.map((_, i) => {
        // Every date column opens on today for a new row, and on its own stored
        // date when editing — never on a raw serial number.
        // A new entry is Ongoing until you tick it.
        if ((columnTypes[i] ?? 'text') === 'status') {
          const stored = formulaRow?.[i] ?? '';
          return isCompleted(stored) ? STATUS_DONE : STATUS_OPEN;
        }
        if (isDateLike(columnTypes[i] ?? 'text')) {
          const parsed = parseSheetDate(displayRow?.[i] ?? formulaRow?.[i] ?? '');
          return parsed ? toISODate(parsed) : editing ? '' : todayISO();
        }
        return formulaRow?.[i] ?? '';
      }),
    );
    setConfirmDelete(false);

    // Initialize investment type from existing value or default to lump-sum
    if (hasInvestmentTypeColumn && formulaRow) {
      const stored = formulaRow[investmentTypeColIndex] ?? '';
      if (stored.toLowerCase().includes('sip')) {
        setInvestmentType('sip');
      } else if (stored.toLowerCase().includes('lump')) {
        setInvestmentType('lump-sum');
      }
    }
  }, [open, headers, columnTypes, displayRow, formulaRow, editing, hasInvestmentTypeColumn, investmentTypeColIndex]);

  const setAt = (i: number, v: string) =>
    setValues((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });

  const handleInvestmentTypeChange = (type: InvestmentType) => {
    setInvestmentType(type);
    if (hasInvestmentTypeColumn) {
      const displayName = type === 'sip' ? 'SIP' : 'Lump Sum';
      setAt(investmentTypeColIndex, displayName);
    }
  };

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

        {/* Investment Type Selector - show if column exists or always show it as helper */}
        {headers.length > 0 && (
          <InvestmentTypeSelector value={investmentType} onChange={handleInvestmentTypeChange} />
        )}

        {headers.map((h, i) => {
          const type = columnTypes[i] ?? 'text';

          // Skip the investment type column if it exists - we handle it above
          if (hasInvestmentTypeColumn && i === investmentTypeColIndex) {
            return null;
          }

          // Determine if this field is relevant to the selected investment type
          const fieldHint = getFieldHint(h, investmentType);

          if (type === 'status') {
            const done = isCompleted(values[i] ?? '');
            return (
              <button
                key={`${h}-${i}`}
                onClick={() => setAt(i, done ? STATUS_OPEN : STATUS_DONE)}
                className="press flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left"
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors ${
                    done ? 'border-pos bg-pos text-white' : 'border-line'
                  }`}
                >
                  {done && (
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 13 4 4 10-10" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{h || 'Completed'}</span>
                  <span className="block text-xs text-muted">
                    {done
                      ? 'Kept in the sheet, hidden from this list'
                      : 'Ongoing — tick once this is done'}
                  </span>
                </span>
              </button>
            );
          }

          if (isDateLike(type)) {
            return (
              <Field
                key={`${h}-${i}`}
                label={h || 'Date'}
                hint={
                  fieldHint ||
                  (type === 'trigger'
                    ? "You'll be reminded on this tab as the date approaches."
                    : undefined)
                }
              >
                <DateField value={values[i] ?? ''} onChange={(iso) => setAt(i, iso)} />
              </Field>
            );
          }

          return (
            <Field key={`${h}-${i}`} label={h || `Column ${i + 1}`} hint={fieldHint}>
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
