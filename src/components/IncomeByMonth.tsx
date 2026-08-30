import type { Formatters } from '../lib/format';

export interface IncomeMonth {
  /** "Aug 2026", or "No date" for rows without one. */
  key: string;
  short: string;
  year: string;
  total: number;
  count: number;
}

const MIN_H = 6;
const MAX_H = 84;

/**
 * Income per month as bars, doubling as the month filter.
 *
 * One series, so it takes a single hue and needs no legend. Only the selected
 * bar (or the biggest, when nothing is selected) is labelled with its amount —
 * a number over every bar would be unreadable at this width, and the total
 * card above already carries the precise figure.
 */
export function IncomeByMonth({
  months,
  selected,
  fmt,
  onSelect,
}: {
  months: IncomeMonth[];
  selected: string | null;
  fmt: Formatters;
  onSelect: (key: string | null) => void;
}) {
  if (months.length === 0) return null;

  const peak = Math.max(...months.map((m) => m.total), 1);
  const biggest = months.reduce((a, b) => (b.total > a.total ? b : a)).key;

  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-[0.68rem] font-extrabold tracking-widest text-muted uppercase">
          Month by month
        </h3>
        {selected && (
          <button onClick={() => onSelect(null)} className="press text-xs font-bold text-pos">
            Show all
          </button>
        )}
      </div>

      <div className="scroll-x -mx-1 mt-4 flex items-end gap-2 px-1 pb-1">
        {months.map((m) => {
          const on = selected === m.key;
          const dim = selected !== null && !on;
          const h = Math.max((m.total / peak) * MAX_H, MIN_H);
          const labelled = on || (selected === null && m.key === biggest);

          return (
            <button
              key={m.key}
              onClick={() => onSelect(on ? null : m.key)}
              title={`${m.key} · ${fmt.money(m.total)} · ${m.count} ${m.count === 1 ? 'entry' : 'entries'}`}
              className="press flex w-14 shrink-0 flex-col items-center gap-1.5"
            >
              <span
                className={`text-[0.6rem] font-extrabold tabular-nums transition-opacity ${
                  labelled ? 'text-pos opacity-100' : 'opacity-0'
                }`}
              >
                {fmt.money(m.total)}
              </span>

              {/* Track keeps every column the same height, so the bars line up. */}
              <span className="flex h-[84px] w-full items-end justify-center">
                <span
                  className="w-7 rounded-t-md transition-all"
                  style={{
                    height: h,
                    background: on ? 'var(--pos)' : 'color-mix(in srgb, var(--pos) 45%, transparent)',
                    opacity: dim ? 0.4 : 1,
                  }}
                />
              </span>

              <span
                className={`text-[0.66rem] font-bold ${on ? 'text-pos' : 'text-muted'}`}
              >
                {m.short}
              </span>
              <span className="-mt-1 text-[0.58rem] font-bold text-muted/70 tabular-nums">
                {m.year}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[0.68rem] font-medium text-muted">
        Tap a month to see just that one
      </p>
    </div>
  );
}
