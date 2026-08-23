import { useState } from 'react';
import {
  extractSpreadsheetId,
  sheetUrl,
  xlsxDownloadUrl,
  type AppConfig,
  type ThemePref,
} from '../lib/config';
import { signOut } from '../lib/googleAuth';
import { Banner, Button, Field, inputClass } from './UI';
import { IconDownload, IconExternal, IconLogout } from './Icons';

const THEMES: { id: ThemePref; label: string; emoji: string }[] = [
  { id: 'system', label: 'Auto', emoji: '🌗' },
  { id: 'light', label: 'Light', emoji: '☀️' },
  { id: 'dark', label: 'Dark', emoji: '🌙' },
];

/** Open + download, offered identically for each workbook the app is linked to. */
function SheetLinks({ id }: { id: string }) {
  const linkClass =
    'press flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line px-5 text-[0.9rem] font-bold text-ink2';
  return (
    <div className="space-y-3">
      <a href={sheetUrl(id)} target="_blank" rel="noreferrer" className={linkClass}>
        <IconExternal className="size-5" />
        Open in Google Sheets
      </a>
      <a href={xlsxDownloadUrl(id)} className={linkClass}>
        <IconDownload className="size-5" />
        Download as Excel (.xlsx)
      </a>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 px-1 text-[0.7rem] font-extrabold tracking-widest text-muted uppercase">
        {title}
      </h2>
      <div className="rounded-card bg-surface p-5 shadow-card">{children}</div>
    </section>
  );
}

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
  const [expensesInput, setExpensesInput] = useState(config.expensesSpreadsheetId);
  const [clientInput, setClientInput] = useState(config.clientId);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setConfig({
      spreadsheetId: extractSpreadsheetId(sheetInput),
      expensesSpreadsheetId: extractSpreadsheetId(expensesInput),
      clientId: clientInput.trim(),
    });
    setSaved(true);
    onReload();
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pt-4 pb-28">
      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-2.5">
          {THEMES.map((t) => {
            const on = config.theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setConfig({ theme: t.id })}
                className={`press flex flex-col items-center gap-1.5 rounded-2xl border-2 py-4 text-xs font-bold transition ${
                  on ? 'border-brand bg-brandsoft text-brand' : 'border-line text-muted'
                }`}
              >
                <span className="text-xl">{t.emoji}</span>
                {t.label}
              </button>
            );
          })}
        </div>

      </Section>

      <Section title="Connection">
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
            label="Expenses spreadsheet"
            hint="A separate workbook for the Expenses tab, with one sheet per month."
          >
            <input
              className={inputClass}
              value={expensesInput}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              onChange={(e) => setExpensesInput(e.target.value)}
            />
          </Field>

          <Field
            label="Google OAuth Client ID"
            hint="From Google Cloud Console → Credentials. Lets the app write to your sheet without a backend."
          >
            <input
              className={inputClass}
              value={clientInput}
              placeholder="…apps.googleusercontent.com"
              onChange={(e) => setClientInput(e.target.value)}
            />
          </Field>

          <Button full onClick={save}>
            Save
          </Button>
          {saved && <Banner kind="info">Saved. Reloading your sheets…</Banner>}
        </div>
      </Section>

      {config.spreadsheetId && (
        <Section title="Investments sheet">
          <SheetLinks id={config.spreadsheetId} />
        </Section>
      )}

      {config.expensesSpreadsheetId && (
        <Section title="Expenses sheet">
          <SheetLinks id={config.expensesSpreadsheetId} />
        </Section>
      )}

      {signedIn && (
        <Button full variant="danger" icon={<IconLogout />} onClick={signOut}>
          Sign out of Google
        </Button>
      )}

      <div className="rounded-card border border-line px-5 py-4 text-xs leading-relaxed text-muted">
        <p className="mb-1.5 font-extrabold text-ink2">What this app keeps</p>
        <p>
          Only the settings on this screen, in your browser’s local storage. No investment data, no
          rows, no totals, and no Google access token are ever stored — the token lives in memory and
          disappears when you close the tab. Every number you see was read from the spreadsheet just
          now.
        </p>
      </div>
    </div>
  );
}
