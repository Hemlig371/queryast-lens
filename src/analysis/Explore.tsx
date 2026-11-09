import {installDefaultColumns} from './defaultColumns';
import {installPivotMinMax} from './pivotMinMax';
import {formatReplaySql} from './formatReplaySql';
import {installUiPolish} from './uiPolish';
import {installMenuBounds} from './menuBounds';
import {installDatagridViewport} from './datagridViewport';
import {installViewerBackground} from './viewerBackground';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {Check, Copy, Loader2} from 'lucide-react';
import type { HTMLPerspectiveViewerElement } from '@perspective-dev/viewer';
import { loadPerspective } from './sdk';
import { ViewSqlCapture } from './viewSql';
import { copyToClipboard } from '../utils/exportUtils';
import { installDateSplitPathCompatibility } from './dateSplitPaths';
import { installExportMenuBridge } from './exportMenu';
import { analysisConnection, tablePath, type AnalysisMode } from './transport';
import { currentLang } from '../utils/i18n';
import './explore.css';
import './locale.css';

export interface AnalysisSource { database: string; schema: string; table: string; connection: string }
const text = (ru: string, en: string) => currentLang === 'en' ? en : ru;
let pendingCleanup: Promise<void> = Promise.resolve();
export interface ExploreHandle { close: () => Promise<void> }
const Explore = forwardRef<ExploreHandle, {
  source: AnalysisSource; mode?: AnalysisMode; theme?: 'light' | 'dark'; visible?: boolean; onBack?: () => void; onClose?: () => void; formatSql?: (sql: string) => Promise<string>;
}>(function Explore({ source, mode = 'wasm', theme = 'light', visible = true, onBack, onClose, formatSql }, ref) {
  const selected = source;
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sqlSnapshot, setSqlSnapshot] = useState<{sql:string} | null>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  const sqlDialog = useRef<HTMLDialogElement>(null);
  const sqlCapture = useRef<{capture:ViewSqlCapture; handler:any} | null>(null);
  const savedConfig = useRef<{key: string; config: any} | undefined>(undefined);
  const disposeRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  useImperativeHandle(ref, () => ({close: () => disposeRef.current()}), []);
  const container = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLPerspectiveViewerElement | null>(null);
  const key = selected ? `lens.analysis.v1:${JSON.stringify([mode, selected.connection, selected.database, selected.schema, selected.table])}` : '';

  useEffect(() => {
    if (!visible) sqlDialog.current?.close();
    // Perspective observes its container and redraws when it becomes visible.
  }, [visible]);

  useEffect(() => {
    if (!selected || !container.current) return;
    let cancelled = false;
    let viewer: HTMLPerspectiveViewerElement | undefined;
    let table: any;
    let client: any;
    let server: any;
    let handler: any;
    let removeExportBridge: (() => void) | undefined;
    let removeMenuBounds: (() => void) | undefined;
    let removeDatagridViewport: (() => void) | undefined;
    let removeBackground: (() => void) | undefined;
    let removeUiPolish: (() => void) | undefined;
    let restoreColumnPaths: (() => void) | undefined;
    let cleanup: Promise<void> | undefined;
    setBusy(true); setError(''); setSqlSnapshot(null); setCopied(false);
    setStatus(text('Подключение Perspective…', 'Connecting Perspective…'));
    const capture = new ViewSqlCapture();
    const opening = pendingCleanup.then(async () => {
      const perspective = await loadPerspective();
      if (cancelled) return;
      const conn = await analysisConnection(mode, entry => {
        capture.record(entry);
        if (!cancelled && entry.error && !capture.validating) setError(entry.error);
      });
      // Refuse VIEW/TEMP or a missing source; do not silently show cached data.
      const found = await conn.query(`SELECT database_name, schema_name, table_name FROM duckdb_tables() WHERE NOT temporary AND NOT internal`);
      if (!found.toArray().some(row => {
        const item = row.toJSON();
        return item.database_name === selected.database && item.schema_name === selected.schema && item.table_name === selected.table;
      })) throw new Error(text('Исходная физическая таблица не найдена', 'Source physical table was not found'));
      const { DuckDBHandler } = await import('@perspective-dev/client/virtual_servers/duckdb');
      const { client_runtime } = await import('@perspective-dev/client/registry');
      handler = new DuckDBHandler(conn);
      installDefaultColumns(handler);
      installPivotMinMax(handler, conn);
      const trackedHandler = capture.instrument(handler);
      // Viewer may own the client WASM runtime: use its initialized constructor.
      const runtime = client_runtime()!.glue;
      server = new runtime.VirtualServer(trackedHandler);
      client = await perspective.make_client(async bytes => {
        const response = (await server.handleRequest(bytes)).slice();
        await client.handle_response(response);
      }, () => {});
      const model = new runtime.GenericSQLVirtualServerModel();
      const name = model.tablePath(selected.schema === 'main' ? [selected.database, selected.table] : [selected.database, selected.schema, selected.table]);
      model.free();
      table = await client.open_table(name);
      if (cancelled) return;
      restoreColumnPaths = installDateSplitPathCompatibility(runtime.View, await table.schema());
      viewer = document.createElement('perspective-viewer') as HTMLPerspectiveViewerElement;
      const defaultTheme = themeRef.current === 'dark' ? 'Pro Dark' : 'Pro Light';
      viewer.setAttribute('theme', defaultTheme);
      viewer.style.visibility = 'hidden';
      container.current!.appendChild(viewer);
      removeMenuBounds = installMenuBounds(viewer);
      removeUiPolish = installUiPolish(viewer,currentLang);
      removeDatagridViewport = installDatagridViewport(viewer);
      removeBackground = installViewerBackground(viewer, container.current!.parentElement!);
      await viewer.load(table);
      await viewer.resetThemes();
      const saved = savedConfig.current;
      if (saved?.key === key) await viewer.restoreWorkspace(saved.config);
      else await viewer.restore({ plugin: 'Datagrid', settings: true, theme: defaultTheme, title: selected.table });
      if (cancelled) return;
      viewerRef.current = viewer;
      sqlCapture.current = {capture,handler};
      removeExportBridge = installExportMenuBridge(viewer, {
        start: () => { setError(''); setStatus(text('Подготовка экспорта…', 'Preparing export…')); },
        success: () => setStatus(''),
        error: e => { setError(`${text('Экспорт', 'Export')}: ${String(e)}`); setStatus(text('Ошибка экспорта', 'Export failed')); },
      });
      await viewer.flush();
      if (!cancelled) viewer.style.visibility = 'visible';
      setStatus('');
    }).catch(e => { if (!cancelled) { setError(String(e)); setStatus(text('Ошибка подключения', 'Connection failed')); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    const dispose = () => {
      if (cleanup) return cleanup;
      cancelled = true;
      sqlDialog.current?.close();
      viewerRef.current = null;
      sqlCapture.current = null;
      cleanup = opening.then(async () => {
        removeExportBridge?.();
        removeMenuBounds?.();
        removeUiPolish?.();
        removeDatagridViewport?.();
        removeBackground?.();
        const release = async (action: () => unknown) => {
          try { await action(); } catch (e) { console.warn('Analysis cleanup', e); }
        };
        if (viewer) {
          await release(async () => { savedConfig.current = {key, config: await viewer!.saveWorkspace()}; });
          await release(() => viewer!.delete());
          viewer.remove();
        }
        // Release the hosted source handle; never delete the user's physical table.
        await release(() => table?.free());
        await release(() => client?.terminate());
        await release(() => client?.free());
        await release(() => server?.free());
        await release(() => handler?.sqlBuilder?.free());
        await release(() => restoreColumnPaths?.());
      });
      pendingCleanup = cleanup;
      return cleanup;
    };
    disposeRef.current = dispose;
    return () => { void dispose(); };
  }, [key, revision]);

  async function returnToEditor() {
    setBusy(true);
    try {
      await viewerRef.current?.flush();
      onBack?.();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function showViewSql() {
    const viewer = viewerRef.current;
    const tracking = sqlCapture.current;
    if (!viewer || !tracking) return;
    setSqlBusy(true); setError('');
    try {
      await viewer.flush();
      const panel = viewer.getActivePanel();
      const options = panel ? {panel} : undefined;
      const view = await viewer.getView(options);
      const viewId = view.__unsafe_get_name();
      const [config, rows, columns] = await Promise.all([view.get_config(), view.num_rows(), view.num_columns()]);
      // Ensure header metadata is captured without loading the full source/result.
      await view.column_paths({start_col:0,end_col:Math.min(columns,1)});
      const snapshot = await tracking.capture.snapshot(tracking.handler,viewId,config,
        {start_row:0,end_row:rows,start_col:0,end_col:columns});
      if (sqlCapture.current !== tracking || viewerRef.current !== viewer) return;
      const active = await viewer.getView(options);
      if (active.__unsafe_get_name() !== viewId || viewer.getActivePanel() !== panel) {
        throw new Error(text('Представление изменилось. Нажмите SQL ещё раз.', 'The View changed. Click SQL again.'));
      }
      setCopied(false);
      let sql = snapshot.sql;
      if (formatSql) {
        sql = await formatReplaySql(sql,formatSql);
      }
      if (sqlCapture.current !== tracking || viewerRef.current !== viewer) return;
      setSqlSnapshot({sql});
      sqlDialog.current?.showModal();
    } catch (e) { setError(`${text('SQL представления', 'View SQL')}: ${String(e)}`); }
    finally { setSqlBusy(false); }
  }

  async function copySql() {
    const sql = sqlSnapshot?.sql;
    if (!sql) return;
    const ok = await copyToClipboard(sql);
    if (!ok) { setError(text('Не удалось скопировать SQL', 'Could not copy SQL')); return; }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  }

  return <section style={visible ? undefined : {display: 'none'}} aria-hidden={!visible} className="lens-explore" data-theme={theme} data-language={currentLang} aria-label={text('Исследование данных', 'Explore data')}>
    <header className="explore-toolbar">
      {onBack ? <button disabled={busy || sqlBusy} onClick={() => void returnToEditor()}>← {text('В редактор', 'Back to editor')}</button> : <strong>QueryAST Lens</strong>}
      {source && <span className="explore-source" title={tablePath([source.database, source.schema, source.table])}>{source.schema}.{source.table}</span>}
      {selected && <button disabled={busy || sqlBusy} onClick={() => void showViewSql()} title={text('SQL данных активной вкладки Viewer', 'SQL for the active Viewer tab')}>{sqlBusy ? '…' : text('SQL представления', 'View SQL')}</button>}
      <span className="explore-status" role={error ? 'alert' : 'status'} title={error || status}>
        {error || (busy ? <Loader2 className="explore-spinner" aria-label={text('Загрузка', 'Loading')} /> : status)}
      </span>
      {selected && <button title={text('Перечитать таблицу с сохранением настроек Viewer', 'Reload the source and keep Viewer settings')} disabled={busy} onClick={() => setRevision(n => n + 1)}>{text('Обновить', 'Refresh')}</button>}
      {onClose && <button disabled={sqlBusy} onClick={onClose} title={text('Завершить исследование и освободить его ресурсы', 'Discard the exploration and release its resources')}>{text('Закрыть исследование', 'Close exploration')}</button>}
    </header>
    <dialog className="explore-sql-dialog" ref={sqlDialog}>
      <header><strong>{text('SQL выбранного представления', 'Selected View SQL')}</strong><button onClick={() => sqlDialog.current?.close()}>{text('Закрыть', 'Close')}</button></header>
      {sqlSnapshot && <>
        <textarea aria-label={text('SQL выбранного представления', 'Selected View SQL')} readOnly value={sqlSnapshot.sql} spellCheck={false} />
        <footer><button type="button" className={copied ? 'is-copied' : ''} onClick={() => void copySql()}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? text('Скопировано', 'Copied') : text('Копировать SQL', 'Copy SQL')}
        </button></footer>
      </>}
    </dialog>
    <div className="explore-body">
      <div className="explore-viewer" ref={container} />
    </div>
  </section>;
});
export default Explore;
