import { useEffect, useState } from 'react';
import { COLUMN_TYPES, columnTypeDef, type ColumnType } from '../lib/columnTypes';
import { Banner, Button, Field, Sheet, inputClass } from './UI';
import { IconPlus, IconTrash } from './Icons';

/** Type picker as chips — one tap, and you can see every option at once. */
function TypePicker({
  value,
  onChange,
  disabled,
}: {
  value: ColumnType;
  onChange: (t: ColumnType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLUMN_TYPES.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            disabled={disabled}
            onClick={() => onChange(t.id)}
            className={`press rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50 ${
              on ? 'border-brand bg-brandsoft text-brand' : 'border-line text-muted'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact version for dense rows where chips would wrap badly. */
function TypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: ColumnType;
  onChange: (t: ColumnType) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className={`${inputClass} px-3 py-3 text-sm font-bold`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ColumnType)}
    >
      {COLUMN_TYPES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

/** Name + type, the pair every "add a column" flow asks for up front. */
function NewColumnFields({
  name,
  type,
  onName,
  onType,
  onSubmit,
}: {
  name: string;
  type: ColumnType;
  onName: (v: string) => void;
  onType: (t: ColumnType) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <input
        className={inputClass}
        value={name}
        placeholder="Column name, e.g. Amount invested"
        onChange={(e) => onName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <TypePicker value={type} onChange={onType} />
      <p className="text-xs font-medium text-muted">{columnTypeDef(type).blurb}</p>
    </div>
  );
}

export function ColumnManager({
  open,
  headers,
  columnTypes,
  sheetTitle,
  lockedColumns = [],
  tags,
  onClose,
  onAdd,
  onRename,
  onRetype,
  onDelete,
}: {
  open: boolean;
  headers: string[];
  columnTypes: ColumnType[];
  sheetTitle: string;
  /** Column names that can't be renamed, retyped or deleted (e.g. Date on expenses). */
  lockedColumns?: string[];
  /** Controls which totals appear as tags above the list. Omit to hide the switch. */
  tags?: { hidden: string[]; onToggle: (header: string, visible: boolean) => void };
  onClose: () => void;
  onAdd: (name: string, type: ColumnType) => Promise<void>;
  onRename: (index: number, name: string) => Promise<void>;
  onRetype: (index: number, type: ColumnType) => Promise<void>;
  onDelete: (index: number) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<ColumnType>('currency');
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftName('');
    setDraftType('currency');
    setEdits({});
    setError(null);
    setPendingDelete(null);
  }, [open]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const name = draftName.trim();
    if (!name) return setError('Give the column a name.');
    if (headers.some((h) => h.toLowerCase() === name.toLowerCase()))
      return setError(`"${name}" is already a column.`);
    return run(async () => {
      await onAdd(name, draftType);
      setDraftName('');
    });
  };

  return (
    <Sheet open={open} title={`Columns in ${sheetTitle}`} onClose={onClose}>
      <div className="space-y-5">
        <p className="rounded-2xl bg-surface2 px-4 py-3 text-xs leading-relaxed text-ink2">
          A column’s type is saved as its number format in Google Sheets. Only{' '}
          <span className="font-bold">Money</span> and <span className="font-bold">Number</span>{' '}
          columns can be totalled — switch a total on to show it as a tag above your entries.
        </p>

        <ul className="space-y-2">
          {headers.map((h, i) => {
            const locked = lockedColumns.some((l) => l.toLowerCase() === h.trim().toLowerCase());
            const type = columnTypes[i] ?? 'text';
            const canTag = Boolean(tags) && columnTypeDef(type).totals;
            const tagged = canTag && !tags!.hidden.includes(h);
            return (
              <li key={i} className="space-y-2 rounded-2xl border border-line p-2">
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputClass} py-3 ${locked ? 'opacity-60' : ''}`}
                    value={edits[i] ?? h}
                    readOnly={locked}
                    onChange={(e) => setEdits({ ...edits, [i]: e.target.value })}
                    onBlur={() => {
                      const next = (edits[i] ?? h).trim();
                      if (next && next !== h) run(() => onRename(i, next));
                    }}
                  />
                  <div className="w-28 shrink-0">
                    <TypeSelect
                      value={type}
                      disabled={busy || locked}
                      onChange={(next) => run(() => onRetype(i, next))}
                    />
                  </div>
                  {locked ? (
                    <span
                      title={`${h} is required and can't be changed`}
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface2 text-muted"
                    >
                      🔒
                    </span>
                  ) : pendingDelete === i ? (
                    <Button variant="danger" disabled={busy} onClick={() => run(() => onDelete(i))}>
                      Sure?
                    </Button>
                  ) : (
                    <button
                      onClick={() => setPendingDelete(i)}
                      aria-label={`Delete ${h}`}
                      className="press grid size-11 shrink-0 place-items-center rounded-xl bg-surface2 text-muted"
                    >
                      <IconTrash className="size-4" />
                    </button>
                  )}
                </div>

                {canTag && (
                  <button
                    onClick={() => tags!.onToggle(h, !tagged)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left"
                  >
                    <span className="text-xs font-bold text-muted">Show total as a tag</span>
                    <span
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        tagged ? 'bg-brand' : 'bg-line'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 size-5 rounded-full bg-white shadow-soft transition-all ${
                          tagged ? 'left-[1.375rem]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="rounded-2xl border border-dashed border-line p-4">
          <Field label="Add a column" hint="Pick the type first — it sets the formatting and totals.">
            <NewColumnFields
              name={draftName}
              type={draftType}
              onName={setDraftName}
              onType={setDraftType}
              onSubmit={add}
            />
          </Field>
          <div className="mt-3">
            <Button full icon={<IconPlus />} disabled={busy || !draftName.trim()} onClick={add}>
              {busy ? 'Working…' : 'Add column'}
            </Button>
          </div>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <p className="px-1 text-xs leading-relaxed text-muted">
          Deleting a column removes that data from every row of this sheet, and cannot be undone from
          here.
        </p>
      </div>
    </Sheet>
  );
}
