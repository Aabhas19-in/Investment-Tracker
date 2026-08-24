/**
 * Thin wrapper over the Google Sheets REST API v4.
 *
 * Nothing here caches investment data. Every call goes to the spreadsheet,
 * which is the single source of truth.
 */
import { getToken, invalidateToken } from './googleAuth';
import {
  STATUS_DONE,
  STATUS_OPEN,
  detectColumnType,
  numberFormatFor,
  type ColumnType,
} from './columnTypes';
import type { CurrencyCode } from './format';
import { TRIGGER_SOON_DAYS } from './triggers';
import type { ColumnSpec, SheetData, SheetMeta } from '../types';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SheetsCtx {
  clientId: string;
  spreadsheetId: string;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
export function colLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** A1 ranges need the tab name quoted, and inner quotes doubled. */
function quoteTitle(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

async function call<T>(ctx: SheetsCtx, path: string, init: RequestInit = {}, retry = true): Promise<T> {
  if (!ctx.spreadsheetId) throw new Error('No spreadsheet linked. Add its ID in Settings.');
  const token = await getToken(ctx.clientId);
  const res = await fetch(`${API}/${ctx.spreadsheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && retry) {
    invalidateToken();
    return call<T>(ctx, path, init, false);
  }

  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      message = JSON.parse(body)?.error?.message ?? body;
    } catch {
      /* keep the raw body */
    }
    if (res.status === 403) {
      message += '\n\nMake sure the Google account you signed in with can edit this spreadsheet, and that the Google Sheets API is enabled in your Cloud project.';
    }
    if (res.status === 404) {
      message += '\n\nCheck the Spreadsheet ID in Settings.';
    }
    throw new Error(message);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

function batchUpdate<T = { replies: unknown[] }>(ctx: SheetsCtx, requests: unknown[]) {
  return call<T>(ctx, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

interface ConditionalFormatRule {
  ranges?: { startColumnIndex?: number; endColumnIndex?: number }[];
  booleanRule?: {
    condition?: { type?: string; values?: { userEnteredValue?: string }[] };
  };
}

interface ProbeCell {
  effectiveFormat?: { numberFormat?: { type?: string } };
  dataValidation?: {
    condition?: { type?: string; values?: { userEnteredValue?: string }[] };
  };
}

interface FormatProbe {
  sheets?: {
    data?: { rowData?: { values?: ProbeCell[] }[] }[];
    conditionalFormats?: ConditionalFormatRule[];
  }[];
}

/**
 * A status column is marked by its Google Sheets dropdown, so the type lives in
 * the spreadsheet (and you get a working picker there too) rather than in the app.
 */
function isStatusCell(cell?: ProbeCell): boolean {
  const c = cell?.dataValidation?.condition;
  if (c?.type !== 'ONE_OF_LIST') return false;
  return (c.values ?? []).some((v) => v.userEnteredValue === STATUS_DONE);
}

/** Our trigger rules are the ones comparing a cell against TODAY(). */
function isTriggerRule(rule: ConditionalFormatRule): boolean {
  const c = rule.booleanRule?.condition;
  if (c?.type !== 'CUSTOM_FORMULA') return false;
  return (c.values ?? []).some((v) => (v.userEnteredValue ?? '').includes('TODAY()'));
}

function columnsWithTriggerRules(rules: ConditionalFormatRule[]): Set<number> {
  const cols = new Set<number>();
  for (const rule of rules) {
    if (!isTriggerRule(rule)) continue;
    for (const r of rule.ranges ?? []) {
      const from = r.startColumnIndex ?? 0;
      const to = r.endColumnIndex ?? from + 1;
      for (let i = from; i < to; i++) cols.add(i);
    }
  }
  return cols;
}

/* ------------------------------------------------------------------ reads */

export async function listSheets(ctx: SheetsCtx): Promise<SheetMeta[]> {
  const data = await call<{
    sheets?: {
      properties: {
        sheetId: number;
        title: string;
        index: number;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }[];
  }>(ctx, '?fields=sheets.properties(sheetId,title,index,gridProperties)');

  return (data.sheets ?? []).map((s) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
    index: s.properties.index,
    rowCount: s.properties.gridProperties?.rowCount ?? 1000,
    columnCount: s.properties.gridProperties?.columnCount ?? 26,
  }));
}

/**
 * Reads a tab twice in one round trip: once as displayed values (so `=B2*C2`
 * arrives already calculated) and once as raw formulas (so editing a computed
 * cell doesn't silently replace the formula with its result).
 */
export async function readSheet(ctx: SheetsCtx, title: string): Promise<SheetData> {
  const range = encodeURIComponent(quoteTitle(title));
  // batchGet applies one render option to every range, so this needs two calls.
  // The third reads row 2's number formats, which is where column types live.
  const [displayed, raw, formats] = await Promise.all([
    call<{ values?: string[][] }>(
      ctx,
      `/values/${range}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`,
    ),
    call<{ values?: string[][] }>(ctx, `/values/${range}?valueRenderOption=FORMULA&majorDimension=ROWS`),
    call<FormatProbe>(
      ctx,
      `?ranges=${encodeURIComponent(`${quoteTitle(title)}!2:2`)}` +
        `&fields=sheets(data.rowData.values(effectiveFormat.numberFormat.type,dataValidation),conditionalFormats)`,
    ),
  ]);

  const grid = displayed.values ?? [];
  const rawGrid = raw.values ?? [];
  const formatCells = formats.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values ?? [];
  const triggerCols = columnsWithTriggerRules(formats.sheets?.[0]?.conditionalFormats ?? []);
  const headers = (grid[0] ?? []).map((h) => String(h ?? ''));
  const width = headers.length;

  const pad = (row: string[] | undefined) => {
    const r = (row ?? []).map((c) => (c == null ? '' : String(c)));
    while (r.length < width) r.push('');
    return r.slice(0, width);
  };

  return {
    headers,
    rows: grid.slice(1).map(pad),
    formulaRows: rawGrid.slice(1).map(pad),
    columnTypes: headers.map((_, i) => {
      if (isStatusCell(formatCells[i])) return 'status';
      const base = detectColumnType(formatCells[i]?.effectiveFormat?.numberFormat?.type);
      return base === 'date' && triggerCols.has(i) ? 'trigger' : base;
    }),
  };
}

/* ----------------------------------------------------------------- writes */

/**
 * Note the absence of `insertDataOption=INSERT_ROWS`: that would splice in a
 * brand-new row, which arrives with no column formatting, so dates would render
 * as raw serial numbers (46257) and money would lose its currency format. The
 * default OVERWRITE instead fills the next already-formatted blank row.
 */
export function appendRow(ctx: SheetsCtx, title: string, values: string[]) {
  const range = encodeURIComponent(`${quoteTitle(title)}!A1`);
  return call<unknown>(ctx, `/values/${range}:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    body: JSON.stringify({ values: [values] }),
  });
}

/** `dataRowIndex` is 0-based over data rows, i.e. the first row under the header. */
export function updateRow(ctx: SheetsCtx, title: string, dataRowIndex: number, values: string[]) {
  const sheetRow = dataRowIndex + 2; // +1 for header, +1 because A1 is 1-based
  const a1 = `${quoteTitle(title)}!A${sheetRow}:${colLetter(values.length - 1)}${sheetRow}`;
  return call<unknown>(ctx, `/values/${encodeURIComponent(a1)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [values] }),
  });
}

export function deleteRow(ctx: SheetsCtx, sheetId: number, dataRowIndex: number) {
  const start = dataRowIndex + 1; // skip the header row
  return batchUpdate(ctx, [
    { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: start, endIndex: start + 1 } } },
  ]);
}

/* -------------------------------------------------------- columns & tabs */

/**
 * The two conditional-format rules that make a column a "trigger" column.
 * Google Sheets evaluates these itself, so the cell is coloured in the
 * spreadsheet too — and their presence is how the app recognises the column
 * later, which keeps the type in the sheet rather than in the app.
 */
function triggerRuleRequests(sheetId: number, colIndex: number, soonDays: number) {
  const cell = `${colLetter(colIndex)}2`;
  const range = { sheetId, startRowIndex: 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 };

  const rule = (formula: string, bg: [number, number, number], fg: [number, number, number]) => ({
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [range],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
          format: {
            backgroundColor: { red: bg[0], green: bg[1], blue: bg[2] },
            textFormat: { bold: true, foregroundColor: { red: fg[0], green: fg[1], blue: fg[2] } },
          },
        },
      },
    },
  });

  return [
    // Coming up within the window — amber.
    rule(
      `=AND(${cell}<>"", ${cell}>TODAY(), ${cell}<=TODAY()+${soonDays})`,
      [0.99, 0.91, 0.71],
      [0.55, 0.35, 0.02],
    ),
    // Today or already gone by — red. Added last so it sits on top.
    rule(`=AND(${cell}<>"", ${cell}<=TODAY())`, [0.97, 0.8, 0.8], [0.6, 0.09, 0.15]),
  ];
}

/** Indices of the trigger rules already on a column, so they can be replaced. */
async function triggerRuleIndices(ctx: SheetsCtx, sheetId: number, colIndex: number) {
  const data = await call<{
    sheets?: { properties?: { sheetId?: number }; conditionalFormats?: ConditionalFormatRule[] }[];
  }>(ctx, '?fields=sheets(properties.sheetId,conditionalFormats)');

  const sheet = data.sheets?.find((s) => s.properties?.sheetId === sheetId);
  const found: number[] = [];
  (sheet?.conditionalFormats ?? []).forEach((rule, i) => {
    if (!isTriggerRule(rule)) return;
    const hits = (rule.ranges ?? []).some(
      (r) => (r.startColumnIndex ?? 0) <= colIndex && colIndex < (r.endColumnIndex ?? -1),
    );
    if (hits) found.push(i);
  });
  return found;
}

/**
 * Puts an Ongoing/Completed dropdown on a status column, or strips it when the
 * column becomes something else. `showCustomUi` is what renders it as a real
 * picker in Google Sheets instead of a bare warning.
 */
function statusValidationRequest(sheetId: number, colIndex: number, on: boolean) {
  const range = { sheetId, startRowIndex: 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 };
  if (!on) return { setDataValidation: { range } };
  return {
    setDataValidation: {
      range,
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: [
            { userEnteredValue: STATUS_OPEN },
            { userEnteredValue: STATUS_DONE },
          ],
        },
        showCustomUi: true,
        strict: false,
      },
    },
  };
}

/**
 * The column type is applied as a number format over every data row (row 2 down),
 * leaving the header itself as plain text.
 */
function formatColumnRequest(
  sheetId: number,
  colIndex: number,
  type: ColumnType,
  currency: CurrencyCode,
) {
  const numberFormat = numberFormatFor(type, currency);
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 },
      // An empty cell with this field mask clears the format back to General,
      // which is what a "Text" column wants so formulas still evaluate.
      cell: numberFormat ? { userEnteredFormat: { numberFormat } } : {},
      fields: 'userEnteredFormat.numberFormat',
    },
  };
}

export async function addColumn(
  ctx: SheetsCtx,
  sheet: SheetMeta,
  name: string,
  atIndex: number,
  type: ColumnType,
  currency: CurrencyCode,
) {
  const requests: unknown[] = [];
  // The grid has a fixed width; grow it first if we're about to write past the edge.
  if (atIndex >= sheet.columnCount) {
    requests.push({
      appendDimension: { sheetId: sheet.sheetId, dimension: 'COLUMNS', length: atIndex - sheet.columnCount + 1 },
    });
  }
  requests.push({
    insertDimension: {
      range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: atIndex, endIndex: atIndex + 1 },
      inheritFromBefore: false,
    },
  });
  requests.push({
    updateCells: {
      range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: atIndex, endColumnIndex: atIndex + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: name } }] }],
      fields: 'userEnteredValue',
    },
  });
  requests.push(formatColumnRequest(sheet.sheetId, atIndex, type, currency));
  if (type === 'trigger') {
    requests.push(...triggerRuleRequests(sheet.sheetId, atIndex, TRIGGER_SOON_DAYS));
  }
  if (type === 'status') {
    requests.push(statusValidationRequest(sheet.sheetId, atIndex, true));
  }
  await batchUpdate(ctx, requests);
}

/**
 * Changes an existing column's type in place, adding or removing the trigger
 * highlighting to match. Old rules are dropped highest-index-first, since each
 * delete shifts the ones after it.
 */
export async function setColumnType(
  ctx: SheetsCtx,
  sheetId: number,
  colIndex: number,
  type: ColumnType,
  currency: CurrencyCode,
) {
  const requests: unknown[] = [formatColumnRequest(sheetId, colIndex, type, currency)];

  const stale = await triggerRuleIndices(ctx, sheetId, colIndex);
  for (const index of stale.sort((a, b) => b - a)) {
    requests.push({ deleteConditionalFormatRule: { sheetId, index } });
  }
  if (type === 'trigger') {
    requests.push(...triggerRuleRequests(sheetId, colIndex, TRIGGER_SOON_DAYS));
  }
  requests.push(statusValidationRequest(sheetId, colIndex, type === 'status'));

  return batchUpdate(ctx, requests);
}

export function renameColumn(ctx: SheetsCtx, title: string, colIndex: number, name: string) {
  const a1 = `${quoteTitle(title)}!${colLetter(colIndex)}1`;
  return call<unknown>(ctx, `/values/${encodeURIComponent(a1)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[name]] }),
  });
}

export function deleteColumn(ctx: SheetsCtx, sheetId: number, colIndex: number) {
  return batchUpdate(ctx, [
    { deleteDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: colIndex, endIndex: colIndex + 1 } } },
  ]);
}

export async function addSheet(
  ctx: SheetsCtx,
  title: string,
  columns: ColumnSpec[],
  currency: CurrencyCode,
) {
  const res = await batchUpdate<{ replies: { addSheet?: { properties: { sheetId: number } } }[] }>(ctx, [
    {
      addSheet: {
        properties: {
          title,
          gridProperties: { rowCount: 1000, columnCount: Math.max(26, columns.length + 5), frozenRowCount: 1 },
        },
      },
    },
  ]);
  const sheetId = res.replies?.[0]?.addSheet?.properties.sheetId;

  if (columns.length) {
    const a1 = `${quoteTitle(title)}!A1`;
    await call<unknown>(ctx, `/values/${encodeURIComponent(a1)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [columns.map((c) => c.name)] }),
    });
  }

  if (sheetId != null) {
    await batchUpdate(ctx, [
      // Bold the header row so the tab reads well inside Google Sheets too.
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.93, green: 0.95, blue: 0.99 },
            },
          },
          fields: 'userEnteredFormat(textFormat,backgroundColor)',
        },
      },
      ...columns.map((c, i) => formatColumnRequest(sheetId, i, c.type, currency)),
      ...columns.flatMap((c, i) =>
        c.type === 'trigger' ? triggerRuleRequests(sheetId, i, TRIGGER_SOON_DAYS) : [],
      ),
      ...columns.flatMap((c, i) =>
        c.type === 'status' ? [statusValidationRequest(sheetId, i, true)] : [],
      ),
    ]);
  }
}

export function renameSheet(ctx: SheetsCtx, sheetId: number, title: string) {
  return batchUpdate(ctx, [
    { updateSheetProperties: { properties: { sheetId, title }, fields: 'title' } },
  ]);
}

export function deleteSheet(ctx: SheetsCtx, sheetId: number) {
  return batchUpdate(ctx, [{ deleteSheet: { sheetId } }]);
}
