import type { Formatters } from '../lib/format';
import { accentFor } from '../lib/accent';

/**
 * Spend per category as circles of equal size — the percentage on each one
 * carries the comparison, so a big month and a small one read the same way.
 * Each bubble is labelled with its category, amount and share, so identity
 * never rests on colour alone.
 */
export function CategoryBubbles({
  totals,
  grandTotal,
  selected,
  fmt,
  onSelect,
}: {
  totals: [string, number][];
  grandTotal: number;
  selected: string | null;
  fmt: Formatters;
  onSelect: (name: string) => void;
}) {
  const SIZE = 100;

  return (
    <div>
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-[0.68rem] font-extrabold tracking-widest text-muted uppercase">
          Where it went
        </h3>
        {selected && (
          <button
            onClick={() => onSelect(selected)}
            className="press text-xs font-bold text-expense"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2.5">
        {totals.map(([name, value], i) => {
          const color = accentFor(name);
          const share = grandTotal > 0 ? Math.round((value / grandTotal) * 100) : 0;
          const on = selected === name;
          const amount = fmt.money(value);

          // The full amount has to fit inside a circle, so step the type down
          // as the number gets longer rather than truncating it.
          const amountSize = amount.length > 11 ? 0.6 : amount.length > 8 ? 0.7 : 0.82;

          return (
            <button
              key={name}
              onClick={() => onSelect(name)}
              title={`${name} · ${amount} · ${share}%`}
              style={{
                width: SIZE,
                height: SIZE,
                animationDelay: `${Math.min(i, 8) * 40}ms`,
                background: `color-mix(in srgb, ${color} ${on ? 26 : 13}%, transparent)`,
                boxShadow: on ? `0 0 0 2px ${color}` : undefined,
                color,
              }}
              className="press animate-rise flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-2.5 text-center"
            >
              <span className="w-full truncate text-[0.64rem] font-bold">{name}</span>
              <span
                className="w-full font-extrabold tabular-nums"
                style={{ fontSize: `${amountSize}rem` }}
              >
                {amount}
              </span>
              <span className="text-[0.6rem] font-bold tabular-nums opacity-70">{share}%</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[0.68rem] font-medium text-muted">
        Tap a category to see it on its own
      </p>
    </div>
  );
}
