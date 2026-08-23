import { useMemo, useState } from 'react';
import { CALCULATORS, xirr, type CashFlow } from '../lib/finance';
import { makeFormatters, type CurrencyCode } from '../lib/format';
import { Button, Field, inputClass } from './UI';

export function Calculators({ currency }: { currency: CurrencyCode }) {
  const fmt = useMemo(() => makeFormatters(currency), [currency]);
  const [activeId, setActiveId] = useState(CALCULATORS[0].id);
  const calc = CALCULATORS.find((c) => c.id === activeId)!;

  // One value bag per calculator, so switching back and forth keeps your inputs.
  const [values, setValues] = useState<Record<string, Record<string, number>>>({});
  const current =
    values[calc.id] ?? Object.fromEntries(calc.fields.map((f) => [f.key, f.initial]));

  const setValue = (key: string, n: number) =>
    setValues((prev) => ({ ...prev, [calc.id]: { ...current, [key]: n } }));

  const results = calc.custom ? [] : calc.compute(current, fmt);

  const groups = [...new Set(CALCULATORS.map((c) => c.group))];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-28">
      <div className="scroll-x sticky top-0 z-10 flex gap-2 border-b border-[var(--color-line)] bg-[var(--color-ink)] px-4 py-3">
        {CALCULATORS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
              c.id === activeId
                ? 'bg-emerald-400 text-slate-950'
                : 'border border-[var(--color-line)] bg-[var(--color-ink-soft)] text-slate-300'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="px-4 py-5">
        <h2 className="text-lg font-semibold">{calc.name}</h2>
        <p className="mt-1 text-sm text-[var(--color-mute)]">{calc.blurb}</p>

        {calc.custom === 'xirr' ? (
          <XirrPanel currency={currency} />
        ) : (
          <>
            <div className="mt-5 space-y-4">
              {calc.fields.map((f) => (
                <Field key={f.key} label={f.label} hint={f.help}>
                  {f.kind === 'select' ? (
                    <select
                      className={inputClass}
                      value={current[f.key]}
                      onChange={(e) => setValue(f.key, Number(e.target.value))}
                    >
                      {f.options!.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputClass}
                        value={Number.isFinite(current[f.key]) ? current[f.key] : ''}
                        step={f.kind === 'percent' ? 0.1 : f.kind === 'years' ? 1 : 100}
                        onChange={(e) => setValue(f.key, Number(e.target.value))}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-[var(--color-mute)]">
                        {f.kind === 'percent' ? '% p.a.' : f.kind === 'years' ? 'years' : ''}
                      </span>
                    </div>
                  )}
                </Field>
              ))}
            </div>

            <ResultCard rows={results} />
          </>
        )}

        <p className="mt-8 text-xs leading-relaxed text-[var(--color-mute)]">
          Groups available: {groups.join(' · ')}. These are projections from the numbers you type —
          real returns vary, and nothing here is investment advice.
        </p>
      </div>
    </div>
  );
}

function ResultCard({ rows }: { rows: { label: string; value: string; hint?: string; emphasis?: boolean }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink-soft)] p-5">
      {rows.map((r, i) => (
        <div key={i} className={i > 0 ? 'mt-4 border-t border-[var(--color-line)] pt-4' : ''}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-[var(--color-mute)]">{r.label}</span>
            <span
              className={
                r.emphasis
                  ? 'text-2xl font-bold tabular-nums text-emerald-300'
                  : 'text-base font-semibold tabular-nums text-slate-100'
              }
            >
              {r.value}
            </span>
          </div>
          {r.hint && <p className="mt-1 text-xs text-[var(--color-mute)]">{r.hint}</p>}
        </div>
      ))}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function XirrPanel({ currency }: { currency: CurrencyCode }) {
  const fmt = useMemo(() => makeFormatters(currency), [currency]);
  const [flows, setFlows] = useState<CashFlow[]>([
    { date: '2025-01-01', amount: -50000 },
    { date: today(), amount: 62000 },
  ]);

  const rate = xirr(flows);
  const invested = flows.filter((f) => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const returned = flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);

  const update = (i: number, patch: Partial<CashFlow>) =>
    setFlows(flows.map((f, j) => (i === j ? { ...f, ...patch } : f)));

  return (
    <div className="mt-5">
      <div className="space-y-3">
        {flows.map((f, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="date"
              className={inputClass}
              value={f.date}
              onChange={(e) => update(i, { date: e.target.value })}
            />
            <input
              type="number"
              inputMode="decimal"
              className={inputClass}
              value={Number.isFinite(f.amount) ? f.amount : ''}
              onChange={(e) => update(i, { amount: Number(e.target.value) })}
            />
            <Button variant="ghost" onClick={() => setFlows(flows.filter((_, j) => j !== i))}>
              ×
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Button
          variant="ghost"
          full
          onClick={() => setFlows([...flows, { date: today(), amount: 0 }])}
        >
          + Add a cash flow
        </Button>
      </div>

      <p className="mt-3 text-xs text-[var(--color-mute)]">
        Money you put in is <span className="text-rose-300">negative</span>; money that came back —
        including today’s value as the last row — is <span className="text-emerald-300">positive</span>.
      </p>

      <ResultCard
        rows={[
          {
            label: 'XIRR (annualised)',
            value: Number.isFinite(rate) ? fmt.pct(rate) : '—',
            emphasis: true,
            hint: Number.isFinite(rate)
              ? undefined
              : 'Needs at least one negative and one positive amount on different dates.',
          },
          { label: 'Total invested', value: fmt.money(invested) },
          { label: 'Total returned / current value', value: fmt.money(returned) },
          { label: 'Net gain', value: fmt.money(returned - invested) },
        ]}
      />
    </div>
  );
}
