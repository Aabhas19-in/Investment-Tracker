import { useState } from 'react';
import { CURRENCIES, type CurrencyCode } from '../lib/format';
import { extractSpreadsheetId, sheetUrl, xlsxDownloadUrl, type AppConfig } from '../lib/config';
import { signOut } from '../lib/googleAuth';
import { Banner, Button, Field, inputClass } from './UI';

export function Settings({
  config,
  setConfig,
  signedIn,
  onReload,
}: {
  config: AppConfig;
  setConfig: (patch: Partial<AppConfig>) => void;
  signedIn: boolean;
  onReload: () => void;
}) {
  const [sheetInput, setSheetInput] = useState(config.spreadsheetId);
  const [clientInput, setClientInput] = useState(config.clientId);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setConfig({
      spreadsheetId: extractSpreadsheetId(sheetInput),
      clientId: clientInput.trim(),
    });
    setSaved(true);
    onReload();
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-28">
      <div className="space-y-5">
        <Field
          label="Spreadsheet"
          hint="Paste the full Google Sheets URL or just its ID. This is where every entry is stored."
        >
          <input
            className={inputClass}
            value={sheetInput}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            onChange={(e) => setSheetInput(e.target.value)}
          />
        </Field>

        <Field
          label="Google OAuth Client ID"
          hint="From Google Cloud Console → Credentials. Needed so the app can write to your sheet without a backend."
        >
          <input
            className={inputClass}
            value={clientInput}
            placeholder="…apps.googleusercontent.com"
            onChange={(e) => setClientInput(e.target.value)}
          />
        </Field>

        <Field label="Currency">
          <select
            className={inputClass}
            value={config.currency}
            onChange={(e) => setConfig({ currency: e.target.value as CurrencyCode })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code}
              </option>
            ))}
          </select>
        </Field>

        <Button full onClick={save}>
          Save
        </Button>
        {saved && <Banner kind="info">Saved. Reloading your sheets…</Banner>}

        <div className="space-y-3 border-t border-[var(--color-line)] pt-5">
          {config.spreadsheetId && (
            <>
              <a
                href={sheetUrl(config.spreadsheetId)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-ink-soft)] px-4 text-sm font-semibold text-slate-200"
              >
                Open in Google Sheets ↗
              </a>
              <a
                href={xlsxDownloadUrl(config.spreadsheetId)}
                className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-ink-soft)] px-4 text-sm font-semibold text-slate-200"
              >
                Download as Excel (.xlsx) ↓
              </a>
            </>
          )}

          {signedIn && (
            <Button full variant="danger" onClick={signOut}>
              Sign out of Google
            </Button>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink-soft)] p-4 text-xs leading-relaxed text-[var(--color-mute)]">
          <p className="mb-2 font-semibold text-slate-300">What this app keeps</p>
          <p>
            Only the three settings on this screen, in your browser’s local storage. No investment
            data, no rows, no totals, and no Google access token are ever stored — the token lives in
            memory and disappears when you close the tab. Every number you see was read from the
            spreadsheet just now.
          </p>
        </div>
      </div>
    </div>
  );
}
