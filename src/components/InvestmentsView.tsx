import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SheetData, SheetMeta } from '../types';
import * as api from '../lib/sheets';
import type { CurrencyCode } from '../lib/format';
import { MONTH_ABBR } from '../lib/dates';
import { loadHoldings, saveHoldings, type HoldingsFile } from '../lib/holdings';
import {
  HOLDINGS_LOG_SHEET,
  LOG_COLUMNS,
  SNAPSHOTS_SHEET,
  SNAPSHOT_COLUMNS,
  findStatementSheets,
  logLayout,
  logRows,
  readLog,
  readSnapshots,
  rowsOnDate,
  sameDay,
  sectionsToSave,
  snapshotLayout,
  snapshotRow,
  statementDate,
} from '../lib/holdingsSheet';
import { HoldingsView } from './HoldingsView';
import { SavedHoldings } from './SavedHoldings';

type Section = 'statement' | 'saved';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const longDate = (d: Date) => `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;

/**
 * The investments tab, in two halves.
 *
 * Statement is the file you just downloaded from your broker. Saved is your
 * investment sheet — the parent record every statement is filed into, which is
 * what turns a pile of one-day snapshots into a history.
 */
export function InvestmentsView({
  clientId,
  spreadsheetId,
  currency,
  sheets,
  onSheetsChanged,
}: {
  clientId: string;
  spreadsheetId: string;
  currency: CurrencyCode;
  /** Tabs in the investment workbook, from the app's own listing. */
  sheets: SheetMeta[];
  onSheetsChanged: () => Promise<void> | void;
}) {
  const ctx = useMemo<api.SheetsCtx>(() => ({ clientId, spreadsheetId }), [clientId, spreadsheetId]);
  const tabs = useMemo(() => findStatementSheets(sheets), [sheets]);
  const snapshotsTitle = tabs.snapshots?.title ?? null;
  const logTitle = tabs.log?.title ?? null;

  const [section, setSection] = useState<Section>('statement');
  const [file, setFile] = useState<HoldingsFile | null>(() => loadHoldings());

  const [snapshotsData, setSnapshotsData] = useState<SheetData | null>(null);
  const [logData, setLogData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!spreadsheetId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, l] = await Promise.all([
        snapshotsTitle ? api.readSheet(ctx, snapshotsTitle) : null,
        logTitle ? api.readSheet(ctx, logTitle) : null,
      ]);
      setSnapshotsData(s);
      setLogData(l);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [ctx, spreadsheetId, snapshotsTitle, logTitle]);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshots = useMemo(() => readSnapshots(snapshotsData), [snapshotsData]);
  const log = useMemo(() => readLog(logData), [logData]);

  /** The statement on screen, and whether that date is already in the sheet. */
  const pending = file ? statementDate(file) : null;
  const alreadySaved = Boolean(pending && snapshots.some((s) => sameDay(s.date, pending)));

  /**
   * A statement you've just opened is filed straight away — there's nothing to
   * decide, so there's nothing to tap.
   */
  const keepFile = (next: HoldingsFile | null) => {
    setFile(next);
    saveHoldings(next);
    setJustSaved(null);
    setSaveFailed(null);
    if (next && spreadsheetId) void save(next);
  };

  /**
   * Writes the statement into the investment sheet: one row in Snapshots, one
   * per holding in Holdings Log. Re-saving the same date replaces those rows
   * rather than piling up a second copy.
   */
  const save = async (target: HoldingsFile | null = file) => {
    if (!target) return;
    setSaving(true);
    setError(null);
    setSaveFailed(null);
    try {
      let list = sheets;
      let created = false;

      if (!findStatementSheets(list).snapshots) {
        await api.addSheet(ctx, SNAPSHOTS_SHEET, SNAPSHOT_COLUMNS, currency);
        created = true;
      }
      if (!findStatementSheets(list).log) {
        await api.addSheet(ctx, HOLDINGS_LOG_SHEET, LOG_COLUMNS, currency);
        created = true;
      }
      if (created) {
        list = await api.listSheets(ctx);
        void onSheetsChanged();
      }

      const found = findStatementSheets(list);
      if (!found.snapshots || !found.log) {
        throw new Error('Couldn’t create the tabs in your investment sheet. Try again.');
      }

      const [snapData, logSheetData] = await Promise.all([
        api.readSheet(ctx, found.snapshots.title),
        api.readSheet(ctx, found.log.title),
      ]);
      const S = snapshotLayout(snapData.headers);
      const L = logLayout(logSheetData.headers);
      if (S.date < 0 || L.date < 0 || L.name < 0) {
        throw new Error(
          `Your ${SNAPSHOTS_SHEET} or ${HOLDINGS_LOG_SHEET} tab is missing its Date or Name column. Rename it or delete the tab and save again.`,
        );
      }

      const date = statementDate(target);
      const staleSnapshots = rowsOnDate(readSnapshots(snapData), date);
      const staleLog = rowsOnDate(readLog(logSheetData), date);
      if (staleSnapshots.length || staleLog.length) {
        await api.deleteRows(ctx, [
          { sheetId: found.snapshots.sheetId, dataRowIndices: staleSnapshots },
          { sheetId: found.log.sheetId, dataRowIndices: staleLog },
        ]);
      }

      await api.appendRows(ctx, found.snapshots.title, [
        snapshotRow(snapData.headers, S, target, new Date()),
      ]);
      await api.appendRows(ctx, found.log.title, logRows(logSheetData.headers, L, target));

      const [s, l] = await Promise.all([
        api.readSheet(ctx, found.snapshots.title),
        api.readSheet(ctx, found.log.title),
      ]);
      setSnapshotsData(s);
      setLogData(l);
      setJustSaved(longDate(date));
    } catch (e) {
      // Kept beside the file rather than thrown away: the statement is still
      // perfectly readable, it just isn't in the sheet yet.
      setSaveFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const rowCount = file ? sectionsToSave(file).reduce((n, s) => n + s.lines.length, 0) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-1 pb-3">
        <div className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
          {([
            { id: 'statement', label: 'Statement' },
            { id: 'saved', label: 'Saved' },
          ] as { id: Section; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className={`press flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors ${
                section === t.id ? 'bg-brand text-onbrand' : 'text-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {section === 'statement' ? (
        <HoldingsView
          currency={currency}
          file={file}
          onFile={keepFile}
          save={{
            state: saving ? 'saving' : saveFailed ? 'failed' : alreadySaved ? 'saved' : 'unsaved',
            message: saveFailed,
            linked: Boolean(spreadsheetId),
            detail: pending ? `${longDate(pending)} · ${rowCount} rows` : '',
            onRetry: () => void save(),
          }}
        />
      ) : (
        <SavedHoldings
          spreadsheetId={spreadsheetId}
          currency={currency}
          snapshots={snapshots}
          log={log}
          loading={loading}
          error={error}
          justSaved={justSaved}
          logSheetId={tabs.log?.sheetId ?? null}
          hasTabs={Boolean(tabs.snapshots)}
          onRefresh={() => void load()}
          onGoToStatement={() => setSection('statement')}
        />
      )}
    </div>
  );
}
