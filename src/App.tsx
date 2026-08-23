import { useCallback, useEffect, useState } from 'react';
import type { SheetData, SheetMeta, Tab } from './types';
import { useConfig } from './lib/config';
import { isSignedIn, onAuthChange, signIn } from './lib/googleAuth';
import * as api from './lib/sheets';
import { Banner, Button } from './components/UI';
import { DataView, type DataActions } from './components/DataView';
import { Summary } from './components/Summary';
import { Calculators } from './components/Calculators';
import { Settings } from './components/Settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'data', label: 'Sheets', icon: '▦' },
  { id: 'summary', label: 'Summary', icon: '◑' },
  { id: 'calc', label: 'Calculate', icon: 'ƒ' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const [config, setConfig] = useConfig();
  const [tab, setTab] = useState<Tab>('data');
  const [signedIn, setSignedIn] = useState(isSignedIn);

  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx: api.SheetsCtx = { clientId: config.clientId, spreadsheetId: config.spreadsheetId };
  const active = sheets.find((s) => s.title === activeTitle) ?? null;
  const configured = Boolean(config.clientId && config.spreadsheetId);

  useEffect(() => {
    const off = onAuthChange(setSignedIn);
    return () => void off();
  }, []);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  /** Re-reads the tab list, keeping the current selection when it still exists. */
  const loadSheets = useCallback(
    async (preferTitle?: string) => {
      if (!configured) return;
      setLoading(true);
      setError(null);
      try {
        const list = await api.listSheets(ctx);
        setSheets(list);
        setActiveTitle((prev) => {
          const wanted = preferTitle ?? prev;
          return list.some((s) => s.title === wanted) ? wanted! : (list[0]?.title ?? null);
        });
      } catch (e) {
        fail(e);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.clientId, config.spreadsheetId, configured],
  );

  const loadData = useCallback(
    async (title: string | null) => {
      if (!title || !configured) return setData(null);
      setLoading(true);
      setError(null);
      try {
        setData(await api.readSheet(ctx, title));
      } catch (e) {
        fail(e);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.clientId, config.spreadsheetId, configured],
  );

  useEffect(() => {
    if (signedIn) void loadSheets();
  }, [signedIn, loadSheets]);

  useEffect(() => {
    void loadData(activeTitle);
  }, [activeTitle, loadData]);

  /** Wraps a mutation so it always ends with fresh data pulled back from the sheet. */
  const mutate = async (
    fn: () => Promise<unknown>,
    opts: { relist?: boolean; title?: string } = {},
  ): Promise<void> => {
    setError(null);
    try {
      await fn();
      if (opts.relist) await loadSheets(opts.title);
      else await loadData(activeTitle);
    } catch (e) {
      fail(e);
      throw e;
    }
  };

  const actions: DataActions = {
    createSheet: (title, columns) =>
      mutate(() => api.addSheet(ctx, title, columns, config.currency), { relist: true, title }),
    deleteSheet: (sheetId) => mutate(() => api.deleteSheet(ctx, sheetId), { relist: true }),
    renameSheet: (sheetId, title) =>
      mutate(() => api.renameSheet(ctx, sheetId, title), { relist: true, title }),
    addColumn: (name, type) =>
      mutate(async () => {
        if (!active) return;
        await api.addColumn(ctx, active, name, data?.headers.length ?? 0, type, config.currency);
        await loadSheets(active.title); // column count changed
      }),
    renameColumn: (index, name) =>
      mutate(() => api.renameColumn(ctx, active!.title, index, name)),
    retypeColumn: (index, type) =>
      mutate(() => api.setColumnType(ctx, active!.sheetId, index, type, config.currency)),
    deleteColumn: (index) => mutate(() => api.deleteColumn(ctx, active!.sheetId, index)),
    addRow: (values) => mutate(() => api.appendRow(ctx, active!.title, values)),
    updateRow: (index, values) => mutate(() => api.updateRow(ctx, active!.title, index, values)),
    deleteRow: (index) => mutate(() => api.deleteRow(ctx, active!.sheetId, index)),
  };

  if (!configured) {
    return (
      <Shell tab="settings" setTab={setTab} hideNav>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 pt-8">
            <h1 className="text-2xl font-bold">Let’s connect your spreadsheet</h1>
            <p className="mt-2 text-sm text-[var(--color-mute)]">
              This app has no server and no database. Everything lives in your own Google Sheet, so
              it needs two things before it can start.
            </p>
          </div>
          <Settings
            config={config}
            setConfig={setConfig}
            signedIn={signedIn}
            onReload={() => void loadSheets()}
          />
        </div>
      </Shell>
    );
  }

  if (!signedIn) {
    return (
      <Shell tab={tab} setTab={setTab} hideNav>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-8 text-center">
          <div className="mb-6 text-5xl">📈</div>
          <h1 className="text-2xl font-bold">Investment Tracker</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-mute)]">
            Sign in with the Google account that owns your spreadsheet. The app keeps no copy of your
            data — it reads and writes your sheet directly, every time.
          </p>
          <div className="mt-8 w-full max-w-xs">
            <Button
              full
              onClick={async () => {
                setError(null);
                try {
                  await signIn(config.clientId);
                } catch (e) {
                  fail(e);
                }
              }}
            >
              Sign in with Google
            </Button>
            <div className="mt-3">
              <Button full variant="ghost" onClick={() => setTab('settings')}>
                Change spreadsheet
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-6 w-full max-w-sm text-left">
              <Banner kind="error">{error}</Banner>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell tab={tab} setTab={setTab}>
      {error && (
        <div className="px-4 pt-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      {tab === 'data' && (
        <DataView
          sheets={sheets}
          active={active}
          data={data}
          loading={loading}
          spreadsheetId={config.spreadsheetId}
          onSelect={setActiveTitle}
          onRefresh={() => void loadData(activeTitle)}
          actions={actions}
        />
      )}
      {tab === 'summary' && <Summary ctx={ctx} sheets={sheets} currency={config.currency} />}
      {tab === 'calc' && <Calculators currency={config.currency} />}
      {tab === 'settings' && (
        <Settings
          config={config}
          setConfig={setConfig}
          signedIn={signedIn}
          onReload={() => void loadSheets()}
        />
      )}

      {loading && data && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40">
          <div className="h-0.5 animate-pulse bg-emerald-400" />
        </div>
      )}
    </Shell>
  );
}

function Shell({
  children,
  tab,
  setTab,
  hideNav,
}: {
  children: React.ReactNode;
  tab: Tab;
  setTab: (t: Tab) => void;
  hideNav?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Children own their own scrolling so headers and tab strips can stay pinned. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      {!hideNav && (
        <nav
          className="shrink-0 border-t border-[var(--color-line)] bg-[var(--color-ink)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto grid max-w-lg grid-cols-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition ${
                  tab === t.id ? 'text-emerald-300' : 'text-[var(--color-mute)]'
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
