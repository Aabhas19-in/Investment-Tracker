import type { Formatters } from '../lib/format';
import { accentFor } from '../lib/accent';
import { IconClose } from './Icons';

/**
 * Spend per category as circles of equal size — the percentage on each one
 * carries the comparison, so a big month and a small one read the same way.
 * Each bubble is labelled with its category, amount and share, so identity
 * never rests on colour alone.
 *
 * Tapping bubbles adds them up: pick as many as you like and the total above
 * follows the selection. The ✕ drops the lot and shows the whole month again.
 */
export function CategoryBubbles({
  totals,
  grandTotal,
  selected,
  fmt,
  onToggle,
  onClear,
}: {
  totals: [string, number][];
  grandTotal: number;
  /** Every category currently counted in. Empty means the whole month. */
  selected: string[];
  fmt: Formatters;
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const SIZE = 100;
  const picked = new Set(selected);

  return (
    <div>
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-[0.68rem] font-extrabold tracking-widest text-muted uppercase">
          Where it went
        </h3>
        {selected.length > 0 && (
          <button
            onClick={onClear}
            aria-label="Clear selected categories"
            className="press flex items-center gap-1.5 rounded-full bg-surface2 py-1 pr-2 pl-2.5 text-[0.68rem] font-extrabold text-ink2"
          >
            {selected.length} selected
            <IconClose className="size-3" strokeWidth={2.8} />
          </button>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2.5">
        {totals.map(([name, value], i) => {
          const color = accentFor(name);
          const share = grandTotal > 0 ? Math.round((value / grandTotal) * 100) : 0;
          const on = picked.has(name);
          const amount = fmt.money(value);

          // The full amount has to fit inside a circle, so step the type down
          // as the number gets longer rather than truncating it.
          const amountSize = amount.length > 11 ? 0.6 : amount.length > 8 ? 0.7 : 0.82;

          return (
            <button
              key={name}
              onClick={() => onToggle(name)}
              aria-pressed={on}
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
              <span className="flex w-full items-center justify-center gap-1 text-[0.64rem] font-bold">
                {on && <span aria-hidden>✓</span>}
                <span className="truncate">{name}</span>
              </span>
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
        {selected.length === 0
          ? 'Tap categories to add them up'
          : 'Tap another to add it in, or tap a tick to drop it'}
      </p>
    </div>
  );
}
