import { useEffect, useState } from 'react';
import { Button, Field, Sheet, inputClass } from './UI';

/**
 * Add / edit one row. Values are sent with USER_ENTERED, so anything starting
 * with `=` is stored as a live spreadsheet formula (e.g. `=C2*D2`).
 */
export function RowEditor({
  open,
  headers,
  initial,
  rowNumber,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  headers: string[];
  /** Raw cell contents when editing, empty when adding. */
  initial: string[] | null;
  /** Sheet row number, shown so `=C4*D4` style formulas are easy to write. */
  rowNumber: number | null;
  onClose: () => void;
  onSave: (values: string[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(headers.map((_, i) => initial?.[i] ?? ''));
    setConfirmDelete(false);
  }, [open, headers, initial]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={initial ? `Edit row ${rowNumber}` : 'New entry'}
      onClose={onClose}
    >
      <div className="space-y-4">
        {headers.length === 0 && (
          <p className="text-sm text-[var(--color-mute)]">
            This sheet has no columns yet. Add one first.
          </p>
        )}

        {headers.map((h, i) => (
          <Field key={`${h}-${i}`} label={h || `Column ${i + 1}`}>
            <input
              className={inputClass}
              value={values[i] ?? ''}
              inputMode={/amount|price|qty|value|units|rate|nav|invest/i.test(h) ? 'decimal' : 'text'}
              placeholder="—"
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                setValues(next);
              }}
            />
          </Field>
        ))}

        {headers.length > 0 && (
          <p className="text-xs text-[var(--color-mute)]">
            Tip: start a value with <code className="text-emerald-300">=</code> to store a live
            spreadsheet formula
            {rowNumber ? (
              <>
                {' '}— e.g. <code className="text-emerald-300">=C{rowNumber}*D{rowNumber}</code>
              </>
            ) : null}
            .
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex-1">
            <Button full disabled={busy || headers.length === 0} onClick={() => run(() => onSave(values))}>
              {busy ? 'Saving…' : 'Save to sheet'}
            </Button>
          </div>
        </div>

        {onDelete && (
          <div className="border-t border-[var(--color-line)] pt-4">
            {confirmDelete ? (
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
                <div className="flex-1">
                  <Button full variant="danger" disabled={busy} onClick={() => run(onDelete)}>
                    Delete this row permanently
                  </Button>
                </div>
              </div>
            ) : (
              <Button full variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete row
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
