import type { ReactNode } from 'react';
import { accentFor } from '../lib/accent';

/**
 * A category and the holdings inside it, as one card.
 *
 * The heading takes the category's own colour — the same hue the bubbles and
 * badges use elsewhere — and carries a hairline showing how much of the
 * portfolio sits in it, so the shape of the thing is readable without reading
 * a single number.
 */
export function GroupCard({
  label,
  count,
  value,
  share,
  note,
  noteTone = 'muted',
  children,
}: {
  label: string;
  count: number;
  /** Formatted total for the group. */
  value: string;
  /** 0–100, how much of the section this group is. */
  share: number;
  /** Optional second figure, e.g. how far the group moved. */
  note?: string;
  noteTone?: 'muted' | 'pos' | 'neg';
  children: ReactNode;
}) {
  const color = accentFor(label);

  // "Equity - Flexi Cap" reads better as Flexi Cap with a small Equity tag:
  // the family repeats on every card, the name is what you're looking for.
  const split = label.indexOf(' - ');
  const family = split > 0 ? label.slice(0, split) : null;
  const name = split > 0 ? label.slice(split + 3) : label;

  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-card">
      <div
        className="flex items-center gap-2.5 px-4 py-2.5"
        style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="block min-w-0 flex-1">
          <span className="block truncate text-[0.82rem] font-extrabold tracking-tight">
            {name}
          </span>
          {family && (
            <span className="block truncate text-[0.6rem] font-bold tracking-wider text-muted uppercase">
              {family}
            </span>
          )}
        </span>
        {count > 1 && (
          <span
            className="grid size-5 shrink-0 place-items-center rounded-full text-[0.6rem] font-extrabold"
            style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, color }}
          >
            {count}
          </span>
        )}
        <span className="block shrink-0 text-right">
          <span className="block text-[0.82rem] font-extrabold tabular-nums">{value}</span>
          {note && (
            <span
              className={`block text-[0.62rem] font-bold tabular-nums ${
                noteTone === 'pos' ? 'text-pos' : noteTone === 'neg' ? 'text-neg' : 'text-muted'
              }`}
            >
              {note}
            </span>
          )}
        </span>
      </div>

      {/* How much of the whole this group is. */}
      <div className="h-[3px] w-full" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
        <div
          className="h-full rounded-r-full"
          style={{ width: `${Math.max(Math.min(share, 100), 1.5)}%`, background: color }}
        />
      </div>

      {children}
    </section>
  );
}
