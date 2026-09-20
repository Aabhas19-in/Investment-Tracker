import { useCallback, useSyncExternalStore } from 'react';

/**
 * The only thing this app persists locally: which spreadsheet to open, which
 * OAuth client to use, and a currency symbol. No investment data, no access
 * token, no cached rows — those live in the spreadsheet or in memory.
 */
/** Two light themes: the current one, and the warm cream it started as. */
export type ThemePref = 'light' | 'legacy';

export interface AppConfig {
  spreadsheetId: string;
  /** Separate workbook for the Expenses tab — kept apart from investments on purpose. */
  expensesSpreadsheetId: string;
  clientId: string;
  theme: ThemePref;
  /** Sheet title -> column headers whose total you've dismissed. A view preference, not data. */
  hiddenTotals: Record<string, string[]>;
}

const KEY = 'investment-tracker/config';

const defaults: AppConfig = {
  spreadsheetId: import.meta.env.VITE_SPREADSHEET_ID ?? '',
  expensesSpreadsheetId: import.meta.env.VITE_EXPENSES_SPREADSHEET_ID ?? '',
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  theme: 'light',
  hiddenTotals: {},
};

function read(): AppConfig {
  try {
    const raw = localStorage.getItem(KEY);
    const stored: AppConfig = raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    // 'system' and 'dark' are gone; anything unrecognised lands on the light theme.
    return { ...stored, theme: stored.theme === 'legacy' ? 'legacy' : 'light' };
  } catch {
    return defaults;
  }
}

let current = read();
const listeners = new Set<() => void>();

function applyTheme(theme: ThemePref) {
  document.documentElement.setAttribute('data-theme', theme === 'legacy' ? 'legacy' : 'light');
}
applyTheme(current.theme);

function write(patch: Partial<AppConfig>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private browsing — settings just won't survive a reload */
  }
  if (patch.theme) applyTheme(patch.theme);
  listeners.forEach((l) => l());
}

export function useConfig(): [AppConfig, (patch: Partial<AppConfig>) => void] {
  const config = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  return [config, useCallback(write, [])];
}

/** Accepts either a full Google Sheets URL or a bare id. */
export function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return (match?.[1] ?? input).trim();
}

export const sheetUrl = (id: string, gid?: number) =>
  `https://docs.google.com/spreadsheets/d/${id}/edit${gid != null ? `#gid=${gid}` : ''}`;

export const xlsxDownloadUrl = (id: string) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
