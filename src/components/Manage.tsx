import { useEffect, useState } from 'react';
import type { ColumnSpec } from '../types';
import { COLUMN_TYPES, columnTypeDef, type ColumnType } from '../lib/columnTypes';
import { Banner, Button, Field, Sheet, inputClass } from './UI';

const col = (name: string, type: ColumnType): ColumnSpec => ({ name, type });

/**
 * Starter column sets. They are only suggestions — every one is editable
 * before you create the tab, and columns can be added or removed later.
 */
export const TEMPLATES: { name: string; columns: ColumnSpec[] }[] = [
  { name: 'Blank', columns: [col('Date', 'date'), col('Notes', 'text')] },
  {
    name: 'Gold',
    columns: [
      col('Date', 'date'),
      col('Form', 'text'),
      col('Grams', 'number'),
      col('Rate per gram', 'currency'),
      col('Amount invested', 'currency'),
      col('Current rate', 'currency'),
      col('Current value', 'currency'),
      col('Notes', 'text'),
    ],
  },
  {
    name: 'Stocks',
    columns: [
      col('Date', 'date'),
      col('Stock', 'text'),
      col('Quantity', 'number'),
      col('Buy price', 'currency'),
      col('Amount invested', 'currency'),
      col('Current price', 'currency'),
      col('Current value', 'currency'),
      col('Notes', 'text'),
    ],
  },
  {
    name: 'Mutual funds',
    columns: [
      col('Date', 'date'),
      col('Fund name', 'text'),
      col('Mode', 'text'),
      col('Units', 'number'),
      col('NAV', 'currency'),
      col('Amount invested', 'currency'),
      col('Current NAV', 'currency'),
      col('Current value', 'currency'),
    ],
  },
  {
    name: 'Fixed deposit',
    columns: [
      col('Start date', 'date'),
      col('Bank', 'text'),
      col('Principal', 'currency'),
      col('Interest rate', 'percent'),
      col('Tenure (years)', 'number'),
      col('Maturity date', 'date'),
      col('Maturity amount', 'currency'),
    ],
  },
  {
    name: 'Crypto',
    columns: [
      col('Date', 'date'),
      col('Coin', 'text'),
      col('Quantity', 'number'),
      col('Buy price', 'currency'),
      col('Amount invested', 'currency'),
      col('Current price', 'currency'),
      col('Current value', 'currency'),
    ],
  },
];

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
      className={`${inputClass} py-2.5`}
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

/** Name + type, the pair every "add a column" flow now asks for up front. */
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
    <div className="space-y-2">
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
      <TypeSelect value={type} onChange={onType} />
      <p className="text-xs text-[var(--color-mute)]">{columnTypeDef(type).blurb}</p>
    </div>
  );
}

export function NewSheetDialog({
  open,
  existingTitles,
  onClose,
  onCreate,
}: {
  open: boolean;
  existingTitles: string[];
  onClose: () => void;
  onCreate: (title: string, columns: ColumnSpec[]) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [columns, setColumns] = useState<ColumnSpec[]>(TEMPLATES[0].columns);
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<ColumnType>('currency');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setColumns(TEMPLATES[0].columns);
    setDraftName('');
    setDraftType('currency');
    setError(null);
  }, [open]);

  const addDraft = () => {
    const name = draftName.trim();
    if (!name) return setError('Give the column a name.');
    if (columns.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      return setError(`"${name}" is already a column.`);
    setColumns([...columns, { name, type: draftType }]);
    setDraftName('');
    setError(null);
  };

  const submit = async () => {
    const name = title.trim();
    if (!name) return setError('Give the sheet a name.');
    if (existingTitles.some((t) => t.toLowerCase() === name.toLowerCase()))
      return setError(`A sheet called "${name}" already exists.`);
    if (columns.length === 0) return setError('Add at least one column.');

    setBusy(true);
    setError(null);
    try {
      await onCreate(name, columns);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title="New sheet" onClose={onClose}>
      <div className="space-y-5">
        <Field label="Sheet name" hint="This becomes a tab in your Google Sheet, e.g. Gold">
          <input
            className={inputClass}
            value={title}
            autoFocus
            placeholder="Gold"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <div>
          <span className="mb-2 block text-xs font-medium tracking-wide text-[var(--color-mute)] uppercase">
            Start from
          </span>
          <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => {
                  setColumns(t.columns);
                  if (!title.trim() && t.name !== 'Blank') setTitle(t.name);
                }}
                className="shrink-0 rounded-full border border-[var(--color-line)] bg-[var(--color-ink-soft)] px-3.5 py-2 text-sm text-slate-200 active:bg-[var(--color-line)]"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-xs font-medium tracking-wide text-[var(--color-mute)] uppercase">
            Columns ({columns.length})
          </span>
          <ul className="space-y-2">
            {columns.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-center gap-2">
                <input
                  className={`${inputClass} py-2.5`}
                  value={c.name}
                  onChange={(e) =>
                    setColumns(columns.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
                  }
                />
                <div className="w-32 shrink-0">
                  <TypeSelect
                    value={c.type}
                    onChange={(type) =>
                      setColumns(columns.map((x, j) => (i === j ? { ...x, type } : x)))
                    }
                  />
                </div>
                <button
                  onClick={() => setColumns(columns.filter((_, j) => j !== i))}
                  aria-label={`Remove ${c.name}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-mute)] active:bg-[var(--color-ink-soft)]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-xl border border-[var(--color-line)] p-3">
            <NewColumnFields
              name={draftName}
              type={draftType}
              onName={setDraftName}
              onType={setDraftType}
              onSubmit={addDraft}
            />
            <div className="mt-2">
              <Button full variant="ghost" onClick={addDraft}>
                Add column
              </Button>
            </div>
          </div>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <Button full disabled={busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create sheet'}
        </Button>
      </div>
    </Sheet>
  );
}

export function ColumnManager({
  open,
  headers,
  columnTypes,
  sheetTitle,
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
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-mute)]">
          A column’s type is stored as its number format in Google Sheets. Only{' '}
          <span className="text-slate-200">Money</span> and{' '}
          <span className="text-slate-200">Number</span> columns appear in the totals row.
        </p>

        <ul className="space-y-2">
          {headers.map((h, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                className={`${inputClass} py-2.5`}
                value={edits[i] ?? h}
                onChange={(e) => setEdits({ ...edits, [i]: e.target.value })}
                onBlur={() => {
                  const next = (edits[i] ?? h).trim();
                  if (next && next !== h) run(() => onRename(i, next));
                }}
              />
              <div className="w-32 shrink-0">
                <TypeSelect
                  value={columnTypes[i] ?? 'text'}
                  disabled={busy}
                  onChange={(type) => run(() => onRetype(i, type))}
                />
              </div>
              {pendingDelete === i ? (
                <Button variant="danger" disabled={busy} onClick={() => run(() => onDelete(i))}>
                  Sure?
                </Button>
              ) : (
                <button
                  onClick={() => setPendingDelete(i)}
                  aria-label={`Delete ${h}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-mute)] active:bg-[var(--color-ink-soft)]"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="border-t border-[var(--color-line)] pt-4">
          <Field label="Add a column" hint="Pick the type first — it decides formatting and totals.">
            <NewColumnFields
              name={draftName}
              type={draftType}
              onName={setDraftName}
              onType={setDraftType}
              onSubmit={add}
            />
          </Field>
          <div className="mt-2">
            <Button full disabled={busy || !draftName.trim()} onClick={add}>
              {busy ? 'Working…' : 'Add column'}
            </Button>
          </div>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <p className="text-xs text-[var(--color-mute)]">
          Deleting a column removes that data from every row of this sheet, and cannot be undone from
          here.
        </p>
      </div>
    </Sheet>
  );
}
