import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SheetData, SheetMeta, Tab } from './types';
import { useConfig } from './lib/config';
import { CURRENCY } from './lib/format';
import { isSignedIn, onAuthChange, signIn } from './lib/googleAuth';
import * as api from './lib/sheets';
import { countPressing } from './lib/triggers';
import { Banner, Button } from './components/UI';
import {
  IconChart,
  IconGear,
  IconReceipt,
  IconSparkle,
  IconWallet,
  TreeArt,
} from './components/Icons';
import { DataView, type DataActions } from './components/DataView';
import { ExpensesView } from './components/ExpensesView';
import { Summary } from './components/Summary';
import { Settings } from './components/Settings';

const TABS: { id: Tab; label: string; icon: typeof IconWallet }[] = [
  { id: 'data', label: 'Investments', icon: IconWallet },
  { id: 'expenses', label: 'Expenses', icon: IconReceipt },
  { id: 'summary', label: 'Summary', icon: IconChart },
  { id: 'settings', label: 'Settings', icon: IconGear },
];

const TITLES: Record<Tab, string> = {
  data: 'Your investments',
  expenses: 'Where it goes',
  summary: 'Where you stand',
  settings: 'Settings',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function App() {
  const [config, setConfig] = useConfig();
  const [tab, setTab] = useState<Tab>('expenses');
  const [signedIn, setSignedIn] = useState(isSignedIn);

  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerCounts, setTriggerCounts] = useState<Record<string, number>>({});

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

  /**
   * Reminder counts for the sheets you are not currently looking at, so each
   * tab can badge itself. Runs quietly in the background whenever the sheet
   * list changes; the open sheet's count is recomputed live just below.
   */
  const sheetKey = sheets.map((x) => x.title).join('|');
  useEffect(() => {
    if (!signedIn || !configured || sheets.length === 0) return;
    let cancelled = false;

    void (async () => {
      const counts: Record<string, number> = {};
      for (const sheet of sheets) {
        if (cancelled) return;
        try {
          const d = await api.readSheet(ctx, sheet.title);
          counts[sheet.title] = countPressing(d.rows, d.columnTypes);
        } catch {
          /* a sheet we cannot read simply gets no badge */
        }
      }
      if (!cancelled) setTriggerCounts(counts);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, configured, sheetKey, config.clientId, config.spreadsheetId]);

  /** The open sheet is authoritative, so its badge reflects the latest read. */
  const liveCounts = useMemo(() => {
    if (!activeTitle || !data) return triggerCounts;
    return { ...triggerCounts, [activeTitle]: countPressing(data.rows, data.columnTypes) };
  }, [triggerCounts, activeTitle, data]);

  const totalReminders = Object.values(liveCounts).reduce((a, b) => a + b, 0);

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
      mutate(() => api.addSheet(ctx, title, columns, CURRENCY), { relist: true, title }),
    deleteSheet: (sheetId) => mutate(() => api.deleteSheet(ctx, sheetId), { relist: true }),
    renameSheet: (sheetId, title) =>
      mutate(() => api.renameSheet(ctx, sheetId, title), { relist: true, title }),
    addColumn: (name, type) =>
      mutate(async () => {
        if (!active) return;
        await api.addColumn(ctx, active, name, data?.headers.length ?? 0, type, CURRENCY);
        await loadSheets(active.title); // column count changed
      }),
    renameColumn: (index, name) => mutate(() => api.renameColumn(ctx, active!.title, index, name)),
    retypeColumn: (index, type) =>
      mutate(() => api.setColumnType(ctx, active!.sheetId, index, type, CURRENCY)),
    deleteColumn: (index) => mutate(() => api.deleteColumn(ctx, active!.sheetId, index)),
    addRow: (values) => mutate(() => api.appendRow(ctx, active!.title, values)),
    updateRow: (index, values) => mutate(() => api.updateRow(ctx, active!.title, index, values)),
    deleteRow: (index) => mutate(() => api.deleteRow(ctx, active!.sheetId, index)),
    readFormulas: (index) =>
      api.readRowFormulas(ctx, active!.title, index, data?.headers.length ?? 0),
  };

  if (!configured) {
    return (
      <Shell tab="settings" setTab={setTab} hideNav>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="animate-rise px-5 pt-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-brandsoft px-3.5 py-1.5 text-xs font-bold text-brand">
              <IconSparkle className="size-3.5" />
              One-time setup
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
              Let’s connect
              <br />
              your spreadsheet
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              No server, no database. Everything lives in your own Google Sheet — this app just needs
              to know which one.
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
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10">
          <div
            className="animate-rise mx-auto w-full max-w-sm"
            style={{ paddingTop: 'max(3.5rem, env(safe-area-inset-top))' }}
          >
            <TreeArt className="mx-auto w-40 text-ink" />

            <h1 className="mt-8 text-center text-[1.7rem] leading-tight font-extrabold tracking-tight">
              Investment & Expense Tracker
            </h1>
            <p className="mx-auto mt-3 max-w-[17rem] text-center text-sm leading-relaxed text-muted">
              What you own and what you spend, kept in your own spreadsheet.
            </p>

            <div className="mt-10">
              <Button
                full
                variant="leaf"
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
              <p className="mt-4 text-center text-xs leading-relaxed text-muted">
                Nothing is stored here — the token lives in memory and disappears when you close the
                tab.
              </p>
            </div>

            {error && (
              <div className="mt-5">
                <Banner kind="error">{error}</Banner>
              </div>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      tab={tab}
      setTab={setTab}
      badges={{ data: totalReminders }}
      header={
        <div className="flex items-end justify-between gap-3 px-4 pt-3 pb-1">
          <div className="min-w-0">
            {(tab === 'data' || tab === 'expenses') && (
              <p className="text-xs font-bold tracking-wide text-muted">{greeting()},</p>
            )}
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{TITLES[tab]}</h1>
          </div>
          {loading && (
            <span className="mb-1.5 size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-brand" />
          )}
        </div>
      }
    >
      {error && (
        <div className="px-4 pb-3">
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
          reminderCounts={liveCounts}
        />
      )}
      {tab === 'expenses' && (
        <ExpensesView
          spreadsheetId={config.expensesSpreadsheetId}
          clientId={config.clientId}
          currency={CURRENCY}
        />
      )}
      {tab === 'summary' && (
        <Summary
          ctx={ctx}
          sheets={sheets}
          currency={CURRENCY}
          expensesSpreadsheetId={config.expensesSpreadsheetId}
          clientId={config.clientId}
        />
      )}
      {tab === 'settings' && (
        <Settings
          config={config}
          setConfig={setConfig}
          signedIn={signedIn}
          onReload={() => void loadSheets()}
        />
      )}
    </Shell>
  );
}

function Shell({
  children,
  header,
  tab,
  setTab,
  badges,
  hideNav,
}: {
  children: ReactNode;
  header?: ReactNode;
  tab: Tab;
  setTab: (t: Tab) => void;
  /** Unread-style counts per tab, e.g. pending investment reminders. */
  badges?: Partial<Record<Tab, number>>;
  hideNav?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      {header && (
        <div className="shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {header}
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>

      {!hideNav && (
        <nav
          className="shrink-0 border-t border-line bg-surface/85 backdrop-blur-xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto grid max-w-lg grid-cols-4 px-2 py-1.5">
            {TABS.map((t) => {
              const on = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="press flex flex-col items-center gap-1 rounded-2xl py-2"
                >
                  <span
                    className={`relative grid h-8 w-14 place-items-center rounded-full transition-colors ${
                      on ? 'bg-brandsoft text-brand' : 'text-muted'
                    }`}
                  >
                    <Icon className="size-5" strokeWidth={on ? 2.3 : 1.9} />
                    {Boolean(badges?.[t.id]) && (
                      <span className="absolute top-0 right-2.5 grid min-w-4 place-items-center rounded-full bg-neg px-1 text-[0.58rem] font-extrabold text-white">
                        {badges![t.id]}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-[0.64rem] leading-none font-bold tracking-tight ${
                      on ? 'text-brand' : 'text-muted'
                    }`}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
