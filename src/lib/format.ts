import type { Formatters } from './finance';

export const CURRENCIES = [
  { code: 'INR', symbol: '₹', locale: 'en-IN' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', locale: 'en-GB' },
  { code: 'AED', symbol: 'د.إ', locale: 'en-AE' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

/** The app is INR-only. Kept as one constant so it's a one-line change if that ever shifts. */
export const CURRENCY: CurrencyCode = 'INR';

export function makeFormatters(code: CurrencyCode): Formatters {
  const cur = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
  // Exact, never rounded to the nearest rupee. Paise appear as a proper pair of
  // digits when the amount has them, and are left off entirely when it doesn't:
  // ₹1,234.50 but ₹1,200 — not ₹1,234.5 and not ₹1,200.00.
  const whole = new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
    maximumFractionDigits: 0,
  });
  const withPaise = new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = {
    format: (n: number) => (Math.abs(n % 1) > 1e-9 ? withPaise : whole).format(n),
  };
  const plain = new Intl.NumberFormat(cur.locale, { maximumFractionDigits: 2 });

  return {
    money: (n) => (Number.isFinite(n) ? money.format(n) : '—'),
    pct: (n) => (Number.isFinite(n) ? `${plain.format(n)}%` : '—'),
    num: (n) => (Number.isFinite(n) ? plain.format(n) : '—'),
  };
}

/**
 * Pulls a number out of whatever the sheet displays — "₹1,20,000", "12.5%",
 * "(500)" for negatives, "1 234". Returns null when the cell isn't numeric,
 * which is how the Summary tab decides which columns to total.
 */
export function parseNumeric(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  // "12.5%" reads back as 12.5, matching what the sheet shows.
  s = s.replace(/[^\d.\-]/g, '');
  if (!s || s === '-' || s === '.') return null;

  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}
