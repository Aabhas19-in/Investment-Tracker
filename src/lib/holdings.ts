/**
 * Makes sense of a holdings statement exported from a broker — the kind Zerodha
 * Console gives you, with an Equity sheet, a Mutual Funds sheet and a Combined
 * one, each carrying a small summary block above the table.
 *
 * Columns are matched by their header text, so a statement with slightly
 * different wording (or an extra column) still reads. A sheet that looks like
 * nothing we recognise is kept whole and shown as a plain table, so no part of
 * your file is silently dropped.
 */
import { parseNumeric } from './format';
import type { XlsxSheet } from './xlsx';

export interface HoldingLine {
  name: string;
  isin: string;
  /** Sector for shares, instrument type for funds. */
  category: string;
  quantity: number;
  avgPrice: number;
  lastPrice: number;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number | null;
  /** Columns we didn't map — kept so the detail view can still show them. */
  extras: { label: string; value: string }[];
}

export interface HoldingsSummary {
  invested: number | null;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
}

export interface HoldingsSection {
  name: string;
  asOn: string | null;
  summary: HoldingsSummary;
  lines: HoldingLine[];
  /** Set instead of `lines` when the sheet isn't a holdings table. */
  raw: { headers: string[]; rows: string[][] } | null;
}

export interface HoldingsFile {
  fileName: string;
  /** ISO timestamp of when it was read in. */
  loadedAt: string;
  clientId: string | null;
  asOn: string | null;
  sections: HoldingsSection[];
}

/** Lower-case, letters and digits only — so "Unrealize P&L Pct." matches its twin. */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A statement writes "-" where a column doesn't apply to that row. */
const text = (s: string | null | undefined): string => {
  const t = (s ?? '').trim();
  return t === '-' || t === '—' || t === 'NA' || t === 'N/A' ? '' : t;
};

const num = (s: string | null | undefined): number | null => {
  const t = text(s);
  return t ? parseNumeric(t) : null;
};

const firstValueAfter = (row: string[], at: number): string =>
  row.slice(at + 1).find((c) => c.trim()) ?? '';

/** Where a labelled value sits in the block above the table. */
function labelled(rows: string[][], label: string): string | null {
  const wanted = key(label);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (key(row[i] ?? '') === wanted) {
        const v = firstValueAfter(row, i);
        if (v) return v;
      }
    }
  }
  return null;
}

/** "Equity Holdings Statement as on 2026-09-19" -> "2026-09-19". */
function statementDate(rows: string[][]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      const m = /as on[:\s]+(.+)$/i.exec((cell ?? '').trim());
      if (m) return m[1].trim();
    }
  }
  return null;
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['symbol', 'instrument', 'scrip', 'fund', 'name', 'tradingsymbol', 'security'],
  isin: ['isin'],
  sector: ['sector'],
  instrument: ['instrumenttype', 'schemetype', 'category', 'type'],
  quantity: ['quantityavailable', 'quantity', 'qty', 'units', 'balance', 'freeqty'],
  avgPrice: ['averageprice', 'avgprice', 'avgcost', 'buyavg', 'averagecost', 'buyprice'],
  lastPrice: ['previousclosingprice', 'closingprice', 'lastprice', 'ltp', 'currentprice', 'nav', 'marketprice'],
  pnl: ['unrealizedpl', 'unrealisedpl', 'pl', 'pnl', 'profitloss'],
  pnlPct: ['unrealizedplpct', 'unrealisedplpct', 'unrealizeplpct', 'plpct', 'pnlpct', 'returnpct', 'netchg'],
  invested: ['investedvalue', 'investmentvalue', 'buyvalue', 'costvalue'],
  value: ['presentvalue', 'currentvalue', 'marketvalue', 'closingvalue'],
};

/** Header text -> the field it means, or null when it's an extra we keep as-is. */
function mapHeaders(headers: string[]): (keyof typeof HEADER_ALIASES | null)[] {
  return headers.map((h) => {
    const k = key(h ?? '');
    if (!k) return null;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(k)) return field as keyof typeof HEADER_ALIASES;
    }
    // "Quantity Pledged (Margin)" and friends stay as extras rather than
    // being mistaken for the quantity you actually hold.
    return null;
  });
}

/** The row that starts the table: the one naming a symbol or fund. */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const filled = rows[i].filter((c) => c.trim());
    if (filled.length < 3) continue;
    const keys = filled.map(key);
    const names = HEADER_ALIASES.name;
    if (keys.some((k) => names.includes(k)) && keys.some((k) => k.startsWith('quantity') || k === 'units' || k === 'qty')) {
      return i;
    }
  }
  return -1;
}

function parseSection(sheet: XlsxSheet): HoldingsSection {
  const rows = sheet.rows;
  const headerAt = findHeaderRow(rows);

  const summary: HoldingsSummary = {
    invested: num(labelled(rows, 'Invested Value')),
    value: num(labelled(rows, 'Present Value')),
    pnl: num(labelled(rows, 'Unrealized P&L')),
    pnlPct: num(labelled(rows, 'Unrealized P&L Pct.')),
  };
  const asOn = statementDate(rows);

  if (headerAt < 0) {
    const filled = rows.filter((r) => r.some((c) => c.trim()));
    return {
      name: sheet.name,
      asOn,
      summary,
      lines: [],
      raw: filled.length
        ? { headers: filled[0], rows: filled.slice(1) }
        : { headers: [], rows: [] },
    };
  }

  const headers = rows[headerAt];
  const fields = mapHeaders(headers);
  const at = (field: string) => fields.indexOf(field as never);

  const lines: HoldingLine[] = [];
  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[at('name')] ?? '').trim();
    if (!name) {
      // One blank row ends the table; a footer note after it is ignored too.
      if (row.some((c) => c.trim())) continue;
      break;
    }

    const quantity = num(row[at('quantity')]) ?? 0;
    const avgPrice = num(row[at('avgPrice')]) ?? 0;
    const lastPrice = num(row[at('lastPrice')]) ?? 0;
    const invested = num(row[at('invested')]) ?? quantity * avgPrice;
    const value = num(row[at('value')]) ?? quantity * lastPrice;
    const pnl = num(row[at('pnl')]) ?? value - invested;
    const pnlPct = num(row[at('pnlPct')]) ?? (invested > 0 ? (pnl / invested) * 100 : null);

    // Unmapped columns are worth showing only when they actually say something:
    // "Quantity Pledged (Margin) 0.0000" on every row is just noise.
    const extras = headers
      .map((h, c) => ({ label: (h ?? '').trim(), value: text(row[c]) }))
      .filter((x, c) => fields[c] === null && x.label && x.value && parseNumeric(x.value) !== 0);

    lines.push({
      name,
      isin: text(row[at('isin')]),
      // The combined statement carries both columns and dashes out the one
      // that doesn't apply, so take whichever actually has something in it.
      category: text(row[at('sector')]) || text(row[at('instrument')]),
      quantity,
      avgPrice,
      lastPrice,
      invested,
      value,
      pnl,
      pnlPct,
      extras,
    });
  }

  return { name: sheet.name, asOn, summary, lines, raw: null };
}

export function parseHoldings(sheets: XlsxSheet[], fileName: string, now: Date): HoldingsFile {
  const sections = sheets.map(parseSection);
  const clientId =
    sheets.map((s) => labelled(s.rows, 'Client ID')).find((v) => v && v.trim()) ?? null;

  if (sections.every((s) => s.lines.length === 0 && (!s.raw || s.raw.rows.length === 0))) {
    throw new Error('No holdings found in that file. Is it the statement you meant to upload?');
  }

  return {
    fileName,
    loadedAt: now.toISOString(),
    clientId,
    asOn: sections.find((s) => s.asOn)?.asOn ?? null,
    sections,
  };
}

/** Totals for a section, from its own summary block where it has one. */
export function sectionTotals(section: HoldingsSection): HoldingsSummary {
  const invested = section.summary.invested ?? section.lines.reduce((s, l) => s + l.invested, 0);
  const value = section.summary.value ?? section.lines.reduce((s, l) => s + l.value, 0);
  const pnl = section.summary.pnl ?? value - invested;
  const pnlPct = section.summary.pnlPct ?? (invested > 0 ? (pnl / invested) * 100 : null);
  return { invested, value, pnl, pnlPct };
}

export interface Slice {
  label: string;
  value: number;
  share: number;
}

/** Where the money sits inside a section, biggest first. */
export function splitByCategory(lines: HoldingLine[]): Slice[] {
  const total = lines.reduce((s, l) => s + l.value, 0);
  if (total <= 0) return [];
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.category || 'Other', (map.get(l.category || 'Other') ?? 0) + l.value);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, share: (value / total) * 100 }));
}

/* ------------------------------------------------------------- persistence */

const STORE_KEY = 'investment-tracker/holdings';

/**
 * The last file you opened, kept in this browser so the tab isn't empty when
 * you come back. It never leaves the device and never goes into a spreadsheet.
 */
export function saveHoldings(file: HoldingsFile | null) {
  try {
    if (file) localStorage.setItem(STORE_KEY, JSON.stringify(file));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* private browsing — it just won't survive a reload */
  }
}

export function loadHoldings(): HoldingsFile | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HoldingsFile;
    return Array.isArray(parsed?.sections) ? parsed : null;
  } catch {
    return null;
  }
}
