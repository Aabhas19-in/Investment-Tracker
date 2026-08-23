/**
 * Investing formulas. Pure functions + a small declarative description of each
 * calculator, so the UI can render any of them without bespoke components.
 *
 * Convention: rates arrive as percentages (12 means 12%), periods in years
 * unless a field says otherwise.
 */

/* ------------------------------------------------------------ core maths */

/** Lump sum growth. compoundsPerYear: 1 yearly, 4 quarterly, 12 monthly. */
export function futureValue(principal: number, ratePct: number, years: number, compoundsPerYear = 1) {
  const i = ratePct / 100 / compoundsPerYear;
  return principal * Math.pow(1 + i, compoundsPerYear * years);
}

export function presentValue(target: number, ratePct: number, years: number, compoundsPerYear = 1) {
  const i = ratePct / 100 / compoundsPerYear;
  return target / Math.pow(1 + i, compoundsPerYear * years);
}

/** SIP with contributions at the start of each month (the usual assumption). */
export function sipFutureValue(monthly: number, ratePct: number, years: number) {
  const i = ratePct / 100 / 12;
  const n = Math.round(years * 12);
  if (i === 0) return monthly * n;
  return monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
}

/** SIP where the monthly amount rises by `stepUpPct` every 12 months. */
export function stepUpSipFutureValue(monthly: number, ratePct: number, years: number, stepUpPct: number) {
  const i = ratePct / 100 / 12;
  const n = Math.round(years * 12);
  let contribution = monthly;
  let balance = 0;
  let invested = 0;
  for (let m = 0; m < n; m++) {
    if (m > 0 && m % 12 === 0) contribution *= 1 + stepUpPct / 100;
    balance = (balance + contribution) * (1 + i);
    invested += contribution;
  }
  return { futureValue: balance, invested };
}

/** Monthly SIP needed to reach `target`. */
export function requiredSip(target: number, ratePct: number, years: number) {
  const i = ratePct / 100 / 12;
  const n = Math.round(years * 12);
  if (n === 0) return target;
  if (i === 0) return target / n;
  return (target * i) / ((Math.pow(1 + i, n) - 1) * (1 + i));
}

export function cagr(begin: number, end: number, years: number) {
  if (begin <= 0 || years <= 0) return NaN;
  return (Math.pow(end / begin, 1 / years) - 1) * 100;
}

export function absoluteReturn(invested: number, current: number) {
  if (invested <= 0) return NaN;
  return ((current - invested) / invested) * 100;
}

/** Return after stripping out inflation — what your money actually gained. */
export function realReturn(nominalPct: number, inflationPct: number) {
  return ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}

/** Equated monthly instalment for a loan. */
export function emi(principal: number, annualRatePct: number, years: number) {
  const i = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  if (n === 0) return 0;
  if (i === 0) return principal / n;
  return (principal * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

/** How many months a corpus survives a fixed monthly withdrawal. Infinity if it never runs out. */
export function swpMonths(corpus: number, monthlyWithdrawal: number, annualRatePct: number) {
  const i = annualRatePct / 100 / 12;
  if (monthlyWithdrawal <= 0) return Infinity;
  if (i === 0) return corpus / monthlyWithdrawal;
  if (monthlyWithdrawal <= corpus * i) return Infinity; // growth alone covers the withdrawal
  return -Math.log(1 - (corpus * i) / monthlyWithdrawal) / Math.log(1 + i);
}

export interface CashFlow {
  /** ISO date, yyyy-mm-dd. Negative amount = money you put in, positive = money you took out. */
  date: string;
  amount: number;
}

/**
 * XIRR — the annualised return of an irregular set of cash flows.
 * This is the honest number for a real portfolio where you invested on
 * random dates. Newton-Raphson first, bisection as a guaranteed fallback.
 */
export function xirr(flows: CashFlow[]): number {
  const valid = flows
    .filter((f) => f.date && Number.isFinite(f.amount) && f.amount !== 0)
    .map((f) => ({ t: new Date(f.date).getTime(), amount: f.amount }))
    .filter((f) => Number.isFinite(f.t))
    .sort((a, b) => a.t - b.t);

  if (valid.length < 2) return NaN;
  if (!valid.some((f) => f.amount < 0) || !valid.some((f) => f.amount > 0)) return NaN;

  const t0 = valid[0].t;
  const DAY = 86_400_000;
  const npv = (rate: number) =>
    valid.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, (f.t - t0) / DAY / 365), 0);

  let rate = 0.1;
  for (let k = 0; k < 60; k++) {
    const f = npv(rate);
    const df = (npv(rate + 1e-6) - f) / 1e-6;
    if (!Number.isFinite(df) || df === 0) break;
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - rate) < 1e-9) return next * 100;
    rate = next;
  }

  let lo = -0.9999;
  let hi = 100;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let k = 0; k < 300; k++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

/* ----------------------------------------------------- calculator catalog */

export interface CalcField {
  key: string;
  label: string;
  kind: 'money' | 'percent' | 'years' | 'number' | 'select';
  initial: number;
  help?: string;
  options?: { label: string; value: number }[];
}

export interface ResultRow {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}

export interface Formatters {
  money(n: number): string;
  pct(n: number): string;
  num(n: number): string;
}

export interface Calculator {
  id: string;
  name: string;
  group: 'Growth' | 'Planning' | 'Returns' | 'Reality check';
  blurb: string;
  /** `xirr` renders its own cash-flow editor instead of the generic field list. */
  custom?: 'xirr';
  fields: CalcField[];
  compute(v: Record<string, number>, f: Formatters): ResultRow[];
}

const COMPOUNDING = [
  { label: 'Yearly', value: 1 },
  { label: 'Half-yearly', value: 2 },
  { label: 'Quarterly', value: 4 },
  { label: 'Monthly', value: 12 },
];

const yearsAndMonths = (months: number) => {
  if (!Number.isFinite(months)) return 'Never runs out';
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  return `${y} yr ${m} mo`;
};

export const CALCULATORS: Calculator[] = [
  {
    id: 'fv',
    name: 'Future Value (lumpsum)',
    group: 'Growth',
    blurb: 'One-time investment left to compound.',
    fields: [
      { key: 'principal', label: 'Amount invested', kind: 'money', initial: 100000 },
      { key: 'rate', label: 'Expected return', kind: 'percent', initial: 12 },
      { key: 'years', label: 'Time', kind: 'years', initial: 10 },
      { key: 'freq', label: 'Compounding', kind: 'select', initial: 1, options: COMPOUNDING },
    ],
    compute: (v, f) => {
      const fv = futureValue(v.principal, v.rate, v.years, v.freq);
      return [
        { label: 'Future value', value: f.money(fv), emphasis: true },
        { label: 'Invested', value: f.money(v.principal) },
        { label: 'Gain', value: f.money(fv - v.principal) },
        { label: 'Total growth', value: f.pct(absoluteReturn(v.principal, fv)) },
      ];
    },
  },
  {
    id: 'sip',
    name: 'SIP / recurring investment',
    group: 'Growth',
    blurb: 'A fixed amount invested every month.',
    fields: [
      { key: 'monthly', label: 'Monthly investment', kind: 'money', initial: 5000 },
      { key: 'rate', label: 'Expected return', kind: 'percent', initial: 12 },
      { key: 'years', label: 'Time', kind: 'years', initial: 10 },
    ],
    compute: (v, f) => {
      const fv = sipFutureValue(v.monthly, v.rate, v.years);
      const invested = v.monthly * Math.round(v.years * 12);
      return [
        { label: 'Future value', value: f.money(fv), emphasis: true },
        { label: 'Invested', value: f.money(invested) },
        { label: 'Gain', value: f.money(fv - invested) },
        { label: 'Total growth', value: f.pct(absoluteReturn(invested, fv)) },
      ];
    },
  },
  {
    id: 'stepup',
    name: 'Step-up SIP',
    group: 'Growth',
    blurb: 'SIP that you raise every year as your income grows.',
    fields: [
      { key: 'monthly', label: 'Starting monthly amount', kind: 'money', initial: 5000 },
      { key: 'step', label: 'Yearly increase', kind: 'percent', initial: 10 },
      { key: 'rate', label: 'Expected return', kind: 'percent', initial: 12 },
      { key: 'years', label: 'Time', kind: 'years', initial: 10 },
    ],
    compute: (v, f) => {
      const { futureValue: fv, invested } = stepUpSipFutureValue(v.monthly, v.rate, v.years, v.step);
      const flat = sipFutureValue(v.monthly, v.rate, v.years);
      return [
        { label: 'Future value', value: f.money(fv), emphasis: true },
        { label: 'Invested', value: f.money(invested) },
        { label: 'Gain', value: f.money(fv - invested) },
        { label: 'Extra vs a flat SIP', value: f.money(fv - flat), hint: 'What the yearly step-up bought you' },
      ];
    },
  },
  {
    id: 'goal',
    name: 'Goal planner',
    group: 'Planning',
    blurb: 'How much to invest each month to hit a target.',
    fields: [
      { key: 'target', label: 'Target amount', kind: 'money', initial: 1000000 },
      { key: 'rate', label: 'Expected return', kind: 'percent', initial: 12 },
      { key: 'years', label: 'Time available', kind: 'years', initial: 10 },
    ],
    compute: (v, f) => {
      const sip = requiredSip(v.target, v.rate, v.years);
      const lump = presentValue(v.target, v.rate, v.years);
      return [
        { label: 'Monthly SIP needed', value: f.money(sip), emphasis: true },
        { label: 'Or one-time today', value: f.money(lump) },
        { label: 'Total you would pay in', value: f.money(sip * Math.round(v.years * 12)) },
      ];
    },
  },
  {
    id: 'pv',
    name: 'Present value',
    group: 'Planning',
    blurb: 'What a future amount is worth in today’s money.',
    fields: [
      { key: 'target', label: 'Future amount', kind: 'money', initial: 1000000 },
      { key: 'rate', label: 'Discount rate', kind: 'percent', initial: 12 },
      { key: 'years', label: 'Years away', kind: 'years', initial: 10 },
      { key: 'freq', label: 'Compounding', kind: 'select', initial: 1, options: COMPOUNDING },
    ],
    compute: (v, f) => [
      { label: 'Present value', value: f.money(presentValue(v.target, v.rate, v.years, v.freq)), emphasis: true },
    ],
  },
  {
    id: 'swp',
    name: 'Withdrawal plan (SWP)',
    group: 'Planning',
    blurb: 'How long a corpus lasts if you pull money out monthly.',
    fields: [
      { key: 'corpus', label: 'Corpus', kind: 'money', initial: 2500000 },
      { key: 'withdraw', label: 'Monthly withdrawal', kind: 'money', initial: 20000 },
      { key: 'rate', label: 'Expected return', kind: 'percent', initial: 8 },
    ],
    compute: (v, f) => {
      const months = swpMonths(v.corpus, v.withdraw, v.rate);
      const safe = (v.corpus * (v.rate / 100)) / 12;
      return [
        { label: 'Corpus lasts', value: yearsAndMonths(months), emphasis: true },
        {
          label: 'Withdrawal that lasts forever',
          value: f.money(safe),
          hint: 'Taking only the returns leaves the corpus untouched',
        },
      ];
    },
  },
  {
    id: 'cagr',
    name: 'CAGR',
    group: 'Returns',
    blurb: 'Annualised return between two values.',
    fields: [
      { key: 'begin', label: 'Amount invested', kind: 'money', initial: 100000 },
      { key: 'end', label: 'Value now', kind: 'money', initial: 180000 },
      { key: 'years', label: 'Years held', kind: 'years', initial: 5 },
    ],
    compute: (v, f) => [
      { label: 'CAGR', value: f.pct(cagr(v.begin, v.end, v.years)), emphasis: true },
      { label: 'Absolute return', value: f.pct(absoluteReturn(v.begin, v.end)) },
      { label: 'Gain', value: f.money(v.end - v.begin) },
    ],
  },
  {
    id: 'xirr',
    name: 'XIRR (irregular investments)',
    group: 'Returns',
    custom: 'xirr',
    blurb: 'The real return when you invested on scattered dates. Enter investments as negative, current value / redemptions as positive.',
    fields: [],
    compute: () => [],
  },
  {
    id: 'posttax',
    name: 'Post-tax return',
    group: 'Reality check',
    blurb: 'What is left after capital gains tax.',
    fields: [
      { key: 'invested', label: 'Amount invested', kind: 'money', initial: 100000 },
      { key: 'current', label: 'Value now', kind: 'money', initial: 150000 },
      { key: 'tax', label: 'Tax on gains', kind: 'percent', initial: 12.5 },
    ],
    compute: (v, f) => {
      const gain = Math.max(0, v.current - v.invested);
      const tax = (gain * v.tax) / 100;
      return [
        { label: 'In hand after tax', value: f.money(v.current - tax), emphasis: true },
        { label: 'Gain', value: f.money(gain) },
        { label: 'Tax payable', value: f.money(tax) },
        { label: 'Post-tax return', value: f.pct(absoluteReturn(v.invested, v.current - tax)) },
      ];
    },
  },
  {
    id: 'inflation',
    name: 'Inflation impact',
    group: 'Reality check',
    blurb: 'Your return after inflation, and what today’s money is worth later.',
    fields: [
      { key: 'nominal', label: 'Return you expect', kind: 'percent', initial: 12 },
      { key: 'inflation', label: 'Inflation', kind: 'percent', initial: 6 },
      { key: 'amount', label: 'Amount today', kind: 'money', initial: 100000 },
      { key: 'years', label: 'Years', kind: 'years', initial: 10 },
    ],
    compute: (v, f) => {
      const real = realReturn(v.nominal, v.inflation);
      return [
        { label: 'Real (after-inflation) return', value: f.pct(real), emphasis: true },
        {
          label: `Buying power of ${f.money(v.amount)} in ${v.years} yr`,
          value: f.money(presentValue(v.amount, v.inflation, v.years)),
        },
        { label: 'Real value of the investment', value: f.money(futureValue(v.amount, real, v.years)) },
      ];
    },
  },
  {
    id: 'double',
    name: 'Doubling time',
    group: 'Reality check',
    blurb: 'How long money takes to double (exact, plus the rule of 72).',
    fields: [{ key: 'rate', label: 'Return', kind: 'percent', initial: 12 }],
    compute: (v, f) => {
      const exact = Math.log(2) / Math.log(1 + v.rate / 100);
      return [
        { label: 'Doubles in', value: `${f.num(exact)} years`, emphasis: true },
        { label: 'Rule of 72 estimate', value: `${f.num(72 / v.rate)} years` },
        { label: 'Triples in', value: `${f.num(Math.log(3) / Math.log(1 + v.rate / 100))} years` },
      ];
    },
  },
  {
    id: 'emi',
    name: 'Loan EMI',
    group: 'Reality check',
    blurb: 'Monthly instalment and the true cost of a loan.',
    fields: [
      { key: 'principal', label: 'Loan amount', kind: 'money', initial: 1000000 },
      { key: 'rate', label: 'Interest rate', kind: 'percent', initial: 9 },
      { key: 'years', label: 'Tenure', kind: 'years', initial: 20 },
    ],
    compute: (v, f) => {
      const m = emi(v.principal, v.rate, v.years);
      const total = m * Math.round(v.years * 12);
      return [
        { label: 'Monthly EMI', value: f.money(m), emphasis: true },
        { label: 'Total repaid', value: f.money(total) },
        { label: 'Interest paid', value: f.money(total - v.principal) },
      ];
    },
  },
];
