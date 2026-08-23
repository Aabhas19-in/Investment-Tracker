import type { ColumnType } from './lib/columnTypes';

export interface SheetMeta {
  /** Google's internal numeric id for the tab — needed for structural edits. */
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface SheetData {
  headers: string[];
  /** What the sheet *displays* (formulas already evaluated). Used for the table. */
  rows: string[][];
  /** The raw cell content (`=B2*C2` stays a formula). Used when editing. */
  formulaRows: string[][];
  /** Per column, read back from the sheet's own number formats. */
  columnTypes: ColumnType[];
}

export interface ColumnSpec {
  name: string;
  type: ColumnType;
}

export type Tab = 'data' | 'summary' | 'calc' | 'settings';
