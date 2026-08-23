/**
 * Thin wrapper over the Google Sheets REST API v4.
 *
 * Nothing here caches investment data. Every call goes to the spreadsheet,
 * which is the single source of truth.
 */
import { getToken, invalidateToken } from './googleAuth';
import { detectColumnType, numberFormatFor, type ColumnType } from './columnTypes';
import type { CurrencyCode } from './format';
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

interface FormatProbe {
  sheets?: {
    data?: {
      rowData?: { values?: { effectiveFormat?: { numberFormat?: { type?: string } } }[] }[];
    }[];
  }[];
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
        `&fields=sheets.data.rowData.values.effectiveFormat.numberFormat.type`,
    ),
  ]);

  const grid = displayed.values ?? [];
  const rawGrid = raw.values ?? [];
  const formatCells = formats.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values ?? [];
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
    columnTypes: headers.map((_, i) =>
      detectColumnType(formatCells[i]?.effectiveFormat?.numberFormat?.type),
    ),
  };
}

/* ----------------------------------------------------------------- writes */

export function appendRow(ctx: SheetsCtx, title: string, values: string[]) {
  const range = encodeURIComponent(`${quoteTitle(title)}!A1`);
  return call<unknown>(
    ctx,
    `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [values] }) },
  );
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
  await batchUpdate(ctx, requests);
}

/** Changes an existing column's type in place. */
export function setColumnType(
  ctx: SheetsCtx,
  sheetId: number,
  colIndex: number,
  type: ColumnType,
  currency: CurrencyCode,
) {
  return batchUpdate(ctx, [formatColumnRequest(sheetId, colIndex, type, currency)]);
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
