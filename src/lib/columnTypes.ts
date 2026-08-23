import { CURRENCIES, type CurrencyCode } from './format';

/**
 * A column's type is stored as the Google Sheets number format on that column —
 * not in the app. So it survives everywhere, shows up correctly when you open
 * the sheet in Google Sheets, and there is still nothing for this app to persist.
 */
export type ColumnType = 'text' | 'number' | 'currency' | 'percent' | 'date';

export interface ColumnTypeDef {
  id: ColumnType;
  label: string;
  blurb: string;
  /** Include this column in the totals row. */
  totals: boolean;
  /** Right-align it in the table. */
  numeric: boolean;
}

export const COLUMN_TYPES: ColumnTypeDef[] = [
  { id: 'text', label: 'Text', blurb: 'Names, notes, anything', totals: false, numeric: false },
  { id: 'currency', label: 'Money', blurb: 'Amounts — added up in the totals row', totals: true, numeric: true },
  { id: 'number', label: 'Number', blurb: 'Quantity, units, grams — added up too', totals: true, numeric: true },
  { id: 'percent', label: 'Percent', blurb: 'Rates and returns — not added up', totals: false, numeric: true },
  { id: 'date', label: 'Date', blurb: 'Purchase date, maturity date', totals: false, numeric: false },
];

export const columnTypeDef = (type: ColumnType) =>
  COLUMN_TYPES.find((t) => t.id === type) ?? COLUMN_TYPES[0];

export interface NumberFormat {
  type: string;
  pattern: string;
}

/**
 * The Sheets numberFormat to stamp on a column. `null` means "clear it back to
 * General" — used for text columns, so a formula typed into one still evaluates
 * instead of being displayed literally.
 */
export function numberFormatFor(type: ColumnType, currency: CurrencyCode): NumberFormat | null {
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? '₹';
  switch (type) {
    case 'currency':
      return { type: 'CURRENCY', pattern: `"${symbol}"#,##0.00` };
    case 'number':
      return { type: 'NUMBER', pattern: '#,##0.##' };
    case 'percent':
      return { type: 'PERCENT', pattern: '0.00%' };
    case 'date':
      return { type: 'DATE', pattern: 'dd-mmm-yyyy' };
    case 'text':
    default:
      return null;
  }
}

/** Reads a column's type back from whatever number format the sheet reports. */
export function detectColumnType(apiType?: string): ColumnType {
  switch (apiType) {
    case 'CURRENCY':
      return 'currency';
    case 'PERCENT':
      return 'percent';
    case 'NUMBER':
    case 'SCIENTIFIC':
      return 'number';
    case 'DATE':
    case 'DATE_TIME':
    case 'TIME':
      return 'date';
    default:
      return 'text';
  }
}
