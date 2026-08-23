import { useEffect, useState } from 'react';
import type { ColumnSpec } from '../types';
import { COLUMN_TYPES, columnTypeDef, type ColumnType } from '../lib/columnTypes';
import { accentFor } from '../lib/accent';
import { Banner, Button, Field, Sheet, inputClass } from './UI';
import { IconPlus, IconTrash } from './Icons';

const col = (name: string, type: ColumnType): ColumnSpec => ({ name, type });

/** Emoji per template — the picker should look inviting, not like a dropdown. */
export const TEMPLATES: { name: string; emoji: string; columns: ColumnSpec[] }[] = [
  { name: 'Blank', emoji: '📄', columns: [col('Date', 'date'), col('Notes', 'text')] },
  {
    name: 'Gold',
    emoji: '🪙',
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
    emoji: '📈',
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
    emoji: '🧺',
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
    emoji: '🏦',
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
    emoji: '🪐',
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
  const [picked, setPicked] = useState('Blank');
  const [columns, setColumns] = useState<ColumnSpec[]>(TEMPLATES[0].columns);
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<ColumnType>('currency');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setPicked('Blank');
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

  const accent = accentFor(title || picked);

  return (
    <Sheet open={open} title="New sheet" onClose={onClose}>
      <div className="space-y-6">
        <div>
          <span className="mb-2.5 block text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
            What are you tracking?
          </span>
          <div className="grid grid-cols-3 gap-2.5">
            {TEMPLATES.map((t) => {
              const on = picked === t.name;
              return (
                <button
                  key={t.name}
                  onClick={() => {
                    setPicked(t.name);
                    setColumns(t.columns);
                    if (!title.trim() && t.name !== 'Blank') setTitle(t.name);
                  }}
                  className={`press flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3.5 text-[0.7rem] font-bold transition ${
                    on ? 'border-brand bg-brandsoft text-brand' : 'border-line text-muted'
                  }`}
                >
                  <span className="text-2xl">{t.emoji}</span>
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Sheet name" hint="This becomes a tab in your Google Sheet.">
          <input
            className={inputClass}
            value={title}
            placeholder="Gold"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <div>
          <span className="mb-2.5 block text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
            Columns ({columns.length})
          </span>
          <ul className="space-y-2">
            {columns.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-center gap-2">
                <input
                  className={`${inputClass} py-3`}
                  value={c.name}
                  onChange={(e) =>
                    setColumns(columns.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
                  }
                />
                <div className="w-28 shrink-0">
                  <TypeSelect
                    value={c.type}
                    onChange={(type) => setColumns(columns.map((x, j) => (i === j ? { ...x, type } : x)))}
                  />
                </div>
                <button
                  onClick={() => setColumns(columns.filter((_, j) => j !== i))}
                  aria-label={`Remove ${c.name}`}
                  className="press grid size-11 shrink-0 place-items-center rounded-xl bg-surface2 text-muted"
                >
                  <IconTrash className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-2xl border border-dashed border-line p-4">
            <NewColumnFields
              name={draftName}
              type={draftType}
              onName={setDraftName}
              onType={setDraftType}
              onSubmit={addDraft}
            />
            <div className="mt-3">
              <Button full variant="soft" icon={<IconPlus />} onClick={addDraft}>
                Add column
              </Button>
            </div>
          </div>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <button
          onClick={submit}
          disabled={busy}
          style={{ background: accent }}
          className="press min-h-13 w-full rounded-2xl text-[0.95rem] font-extrabold text-white shadow-card disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create sheet'}
        </button>
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
      <div className="space-y-5">
        <p className="rounded-2xl bg-surface2 px-4 py-3 text-xs leading-relaxed text-ink2">
          A column’s type is saved as its number format in Google Sheets. Only{' '}
          <span className="font-bold">Money</span> and <span className="font-bold">Number</span>{' '}
          columns get totalled.
        </p>

        <ul className="space-y-2">
          {headers.map((h, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                className={`${inputClass} py-3`}
                value={edits[i] ?? h}
                onChange={(e) => setEdits({ ...edits, [i]: e.target.value })}
                onBlur={() => {
                  const next = (edits[i] ?? h).trim();
                  if (next && next !== h) run(() => onRename(i, next));
                }}
              />
              <div className="w-28 shrink-0">
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
                  className="press grid size-11 shrink-0 place-items-center rounded-xl bg-surface2 text-muted"
                >
                  <IconTrash className="size-4" />
                </button>
              )}
            </li>
          ))}
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
