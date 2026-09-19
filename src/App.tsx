import { useEffect, useState, type ReactNode } from 'react';
import type { Tab } from './types';
import { useConfig } from './lib/config';
import { CURRENCY } from './lib/format';
import { isSignedIn, onAuthChange, signIn } from './lib/googleAuth';
import { Banner, Button } from './components/UI';
import {
  IconChart,
  IconGear,
  IconReceipt,
  IconSparkle,
  IconWallet,
  TreeArt,
} from './components/Icons';
import { HoldingsView } from './components/HoldingsView';
import { ExpensesView } from './components/ExpensesView';
import { ExpenseSummary } from './components/ExpenseSummary';
import { Settings } from './components/Settings';

const TABS: { id: Tab; label: string; icon: typeof IconWallet }[] = [
  { id: 'data', label: 'Investments', icon: IconWallet },
  { id: 'expenses', label: 'Expenses', icon: IconReceipt },
  { id: 'summary', label: 'Summary', icon: IconChart },
  { id: 'settings', label: 'Settings', icon: IconGear },
];

const TITLES: Record<Tab, string> = {
  data: 'Your holdings',
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
  const [tab, setTab] = useState<Tab>('data');
  const [signedIn, setSignedIn] = useState(isSignedIn);
  const [error, setError] = useState<string | null>(null);

  // Signing in is what the expense sheets need; holdings are read from a file
  // you pick, so that tab works whatever the spreadsheets are doing.
  const configured = Boolean(config.clientId);

  useEffect(() => {
    const off = onAuthChange(setSignedIn);
    return () => void off();
  }, []);

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
              No server, no database. Your expenses live in your own Google Sheet — this app just
              needs to know which one.
            </p>
          </div>
          <Settings config={config} setConfig={setConfig} signedIn={signedIn} />
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
                    setError(e instanceof Error ? e.message : String(e));
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
      header={
        <div className="flex items-end justify-between gap-3 px-4 pt-3 pb-1">
          <div className="min-w-0">
            {(tab === 'data' || tab === 'expenses') && (
              <p className="text-xs font-bold tracking-wide text-muted">{greeting()},</p>
            )}
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{TITLES[tab]}</h1>
          </div>
        </div>
      }
    >
      {tab === 'data' && <HoldingsView currency={CURRENCY} />}

      {tab === 'expenses' && (
        <ExpensesView
          spreadsheetId={config.expensesSpreadsheetId}
          clientId={config.clientId}
          currency={CURRENCY}
        />
      )}

      {tab === 'summary' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-28">
          <ExpenseSummary
            spreadsheetId={config.expensesSpreadsheetId}
            clientId={config.clientId}
            currency={CURRENCY}
          />
        </div>
      )}

      {tab === 'settings' && (
        <Settings config={config} setConfig={setConfig} signedIn={signedIn} />
      )}
    </Shell>
  );
}

function Shell({
  children,
  header,
  tab,
  setTab,
  hideNav,
}: {
  children: ReactNode;
  header?: ReactNode;
  tab: Tab;
  setTab: (t: Tab) => void;
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
