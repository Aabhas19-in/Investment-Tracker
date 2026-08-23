import { useMemo, useState } from 'react';
import { CALCULATORS, xirr, type CashFlow, type ResultRow } from '../lib/finance';
import { makeFormatters, type CurrencyCode } from '../lib/format';
import { Button, Field, inputClass } from './UI';
import { IconPlus, IconTrash } from './Icons';

/** Each family of calculators gets its own hue, so the picker isn't a grey row. */
const GROUP_COLOR: Record<string, string> = {
  Growth: '#12a594',
  Planning: '#4f6ff0',
  Returns: '#8b5cf6',
  'Reality check': '#e0713a',
};

export function Calculators({ currency }: { currency: CurrencyCode }) {
  const fmt = useMemo(() => makeFormatters(currency), [currency]);
  const [activeId, setActiveId] = useState(CALCULATORS[0].id);
  const calc = CALCULATORS.find((c) => c.id === activeId)!;
  const color = GROUP_COLOR[calc.group] ?? '#4f6ff0';

  // One value bag per calculator, so switching back and forth keeps your inputs.
  const [values, setValues] = useState<Record<string, Record<string, number>>>({});
  const current = values[calc.id] ?? Object.fromEntries(calc.fields.map((f) => [f.key, f.initial]));

  const setValue = (key: string, n: number) =>
    setValues((prev) => ({ ...prev, [calc.id]: { ...current, [key]: n } }));

  const results = calc.custom ? [] : calc.compute(current, fmt);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-28">
      <div className="scroll-x flex gap-2.5 px-4 pt-1 pb-4">
        {CALCULATORS.map((c) => {
          const cc = GROUP_COLOR[c.group] ?? '#4f6ff0';
          const on = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={on ? { background: cc, color: '#fff' } : { ['--accent' as string]: cc }}
              className={`press shrink-0 rounded-2xl px-4 py-2.5 text-sm font-bold ${
                on ? 'shadow-card' : 'accent-chip'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      <div className="px-4">
        <div className="animate-rise rounded-card bg-surface p-5 shadow-card">
          <span
            className="inline-block rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold tracking-wider uppercase"
            style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
          >
            {calc.group}
          </span>
          <h2 className="mt-3 text-xl font-extrabold tracking-tight">{calc.name}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{calc.blurb}</p>
        </div>

        {calc.custom === 'xirr' ? (
          <XirrPanel currency={currency} color={color} />
        ) : (
          <>
            <div className="mt-4 space-y-4 rounded-card bg-surface p-5 shadow-card">
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
                      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[0.7rem] font-bold tracking-wide text-muted uppercase">
                        {f.kind === 'percent' ? '% p.a.' : f.kind === 'years' ? 'years' : ''}
                      </span>
                    </div>
                  )}
                </Field>
              ))}
            </div>

            <ResultCard rows={results} color={color} />
          </>
        )}

        <p className="mt-6 px-1 text-xs leading-relaxed text-muted">
          These are projections from the numbers you type. Real returns vary, and nothing here is
          investment advice.
        </p>
      </div>
    </div>
  );
}

function ResultCard({ rows, color }: { rows: ResultRow[]; color: string }) {
  if (rows.length === 0) return null;
  const [lead, ...rest] = rows;

  return (
    <div className="mt-4">
      <div
        className="animate-rise relative overflow-hidden rounded-card p-5 text-white shadow-card"
        style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 62%, #6d28d9) 100%)` }}
      >
        <div className="pointer-events-none absolute -top-12 -right-8 size-40 rounded-full bg-white/12 blur-2xl" />
        <p className="text-[0.7rem] font-bold tracking-widest text-white/75 uppercase">{lead.label}</p>
        <p className="mt-1.5 text-[2.3rem] leading-none font-extrabold tracking-tight tabular-nums">
          {lead.value}
        </p>
        {lead.hint && <p className="mt-2.5 text-xs font-medium text-white/80">{lead.hint}</p>}
      </div>

      {rest.length > 0 && (
        <div className="mt-3 rounded-card bg-surface p-5 shadow-card">
          {rest.map((r, i) => (
            <div key={i} className={i > 0 ? 'mt-3.5 border-t border-line pt-3.5' : ''}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-semibold text-muted">{r.label}</span>
                <span className="font-extrabold tabular-nums">{r.value}</span>
              </div>
              {r.hint && <p className="mt-1 text-xs text-muted">{r.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function XirrPanel({ currency, color }: { currency: CurrencyCode; color: string }) {
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
    <div className="mt-4">
      <div className="rounded-card bg-surface p-5 shadow-card">
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
                className={`${inputClass} tabular-nums ${f.amount < 0 ? 'text-neg' : 'text-pos'}`}
                value={Number.isFinite(f.amount) ? f.amount : ''}
                onChange={(e) => update(i, { amount: Number(e.target.value) })}
              />
              <button
                onClick={() => setFlows(flows.filter((_, j) => j !== i))}
                aria-label="Remove cash flow"
                className="press grid size-12 shrink-0 place-items-center rounded-2xl bg-surface2 text-muted"
              >
                <IconTrash className="size-4.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <Button
            variant="soft"
            full
            icon={<IconPlus />}
            onClick={() => setFlows([...flows, { date: today(), amount: 0 }])}
          >
            Add a cash flow
          </Button>
        </div>

        <p className="mt-4 rounded-2xl bg-surface2 px-4 py-3 text-xs leading-relaxed text-ink2">
          Money you put in is <span className="font-bold text-neg">negative</span>. Money that came
          back — including today’s value as the last row — is{' '}
          <span className="font-bold text-pos">positive</span>.
        </p>
      </div>

      <ResultCard
        color={color}
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
