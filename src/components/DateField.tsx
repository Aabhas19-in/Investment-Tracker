import { shiftISODate, todayISO, toISODate } from '../lib/dates';
import { inputClass } from './UI';

const yesterdayISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
};

/**
 * A date picker plus the shortcuts that cover almost every real entry: it's
 * today, it's yesterday, or it's a day either side of what's already there.
 */
export function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const quick = [
    { label: 'Today', iso: todayISO() },
    { label: 'Yesterday', iso: yesterdayISO() },
  ];

  return (
    <>
      <input type="date" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            onClick={() => onChange(q.iso)}
            className={`press rounded-xl border px-3 py-2 text-xs font-bold ${
              value === q.iso ? 'border-brand bg-brandsoft text-brand' : 'border-line text-muted'
            }`}
          >
            {q.label}
          </button>
        ))}
        <button
          onClick={() => onChange(shiftISODate(value, -1))}
          className="press rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted"
        >
          −1 day
        </button>
        <button
          onClick={() => onChange(shiftISODate(value, 1))}
          className="press rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted"
        >
          +1 day
        </button>
      </div>
    </>
  );
}
