import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { HTMLPerspectiveViewerElement } from '@perspective-dev/viewer';
import { loadPerspective } from './sdk';
import {rawSourceArrow} from './rawSourceArrow';
import { ViewSqlCapture } from './viewSql';
import { copyToClipboard } from '../utils/exportUtils';
import { installDateSplitPathCompatibility } from './dateSplitPaths';
import { installExportMenuBridge } from './exportMenu';
import { analysisConnection, tablePath, type AnalysisMode } from './transport';
import { currentLang } from '../utils/i18n';
import './explore.css';

export interface AnalysisSource { database: string; schema: string; table: string; connection: string }
const text = (ru: string, en: string) => currentLang === 'en' ? en : ru;
let pendingCleanup: Promise<void> = Promise.resolve();
export interface ExploreHandle { close: () => Promise<void> }
const Explore = forwardRef<ExploreHandle, {
  source: AnalysisSource; mode?: AnalysisMode; visible?: boolean; onBack?: () => void; onClose?: () => void;
}>(function Explore({ source, mode = 'wasm', visible = true, onBack, onClose }, ref) {
  const selected = source;
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(text('Подключение Perspective…', 'Connecting Perspective…'));
  const [error, setError] = useState('');
  const [sqlSnapshot, setSqlSnapshot] = useState<{source:string; rows:number; columns:number; sql:string} | null>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  const sqlDialog = useRef<HTMLDialogElement>(null);
  const sqlCapture = useRef<{capture:ViewSqlCapture; handler:any} | null>(null);
  const savedConfig = useRef<{key: string; config: any} | undefined>(undefined);
  const disposeRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [viewRows, setViewRows] = useState<number>();
  useImperativeHandle(ref, () => ({close: () => disposeRef.current()}), []);
  const [rowCount, setRowCount] = useState<number>();
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
    let removeSave: (() => void) | undefined;
    let removeExportBridge: (() => void) | undefined;
    let restoreColumnPaths: (() => void) | undefined;
    let cleanup: Promise<void> | undefined;
    setBusy(true); setError(''); setRowCount(undefined); setViewRows(undefined); setSqlSnapshot(null);
    setStatus(text('Подключение Perspective…', 'Connecting Perspective…'));
    const capture = new ViewSqlCapture();
    const opening = pendingCleanup.then(async () => {
      const perspective = await loadPerspective();
      if (cancelled) return;
      const conn = await analysisConnection(mode, entry => {
        capture.record(entry);
        if (!cancelled && entry.error) setError(entry.error);
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
      const count = await table.size();
      if (cancelled) return;
      restoreColumnPaths = installDateSplitPathCompatibility(runtime.View, await table.schema());
      setRowCount(count);
      viewer = document.createElement('perspective-viewer') as HTMLPerspectiveViewerElement;
      viewer.setAttribute('theme', 'Pro Light');
      container.current!.appendChild(viewer);
      await viewer.load(table);
      await viewer.resetThemes();
      const saved = savedConfig.current;
      if (saved?.key === key) await viewer.restoreWorkspace(saved.config);
      else await viewer.restore({ plugin: 'Datagrid', settings: true });
      if (cancelled) return;
      viewerRef.current = viewer;
      sqlCapture.current = {capture,handler};
      removeExportBridge = installExportMenuBridge(viewer, {
        start: () => { setError(''); setStatus(text('Подготовка экспорта…', 'Preparing export…')); },
        success: () => setStatus(text('Файл передан браузеру для скачивания', 'File handed to browser for download')),
        error: e => { setError(`${text('Экспорт', 'Export')}: ${String(e)}`); setStatus(text('Ошибка экспорта', 'Export failed')); },
      },(name,rows)=>rawSourceArrow(conn,name,rows));
      let countVersion = 0;
      const updateCount = async () => {
        const version = ++countVersion;
        try {
          const panel = viewer!.getActivePanel();
          const view = await viewer!.getView(panel ? {panel} : undefined);
          const count = await view.num_rows();
          if (!cancelled && version === countVersion) setViewRows(count);
        } catch { if (!cancelled) setViewRows(undefined); }
      };
      viewer.addEventListener('perspective-config-update', updateCount);
      viewer.addEventListener('perspective-active-panel-update', updateCount);
      removeSave = () => {
        viewer?.removeEventListener('perspective-config-update', updateCount);
        viewer?.removeEventListener('perspective-active-panel-update', updateCount);
      };
      await updateCount();
      await viewer.flush();
      setStatus(mode === 'wasm' ? text('Готово · данные в браузере', 'Ready · browser data') : text('Tauri · экспериментальный адаптер', 'Tauri · experimental adapter'));
    }).catch(e => { if (!cancelled) { setError(String(e)); setStatus(text('Ошибка подключения', 'Connection failed')); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    const dispose = () => {
      if (cleanup) return cleanup;
      cancelled = true;
      sqlDialog.current?.close();
      if (viewer) viewer.style.visibility = 'hidden';
      viewerRef.current = null;
      sqlCapture.current = null;
      cleanup = opening.then(async () => {
        removeSave?.();
        removeExportBridge?.();
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
      setSqlSnapshot(snapshot);
      sqlDialog.current?.showModal();
    } catch (e) { setError(`${text('SQL представления', 'View SQL')}: ${String(e)}`); }
    finally { setSqlBusy(false); }
  }

  return <section style={visible ? undefined : {display: 'none'}} aria-hidden={!visible} className="lens-explore" aria-label={text('Исследование данных', 'Explore data')}>
    <header className="explore-toolbar">
      {onBack ? <button disabled={busy || sqlBusy} onClick={() => void returnToEditor()}>← {text('В редактор', 'Back to editor')}</button> : <strong>QueryAST Lens</strong>}
      {onClose && <button disabled={sqlBusy} onClick={onClose} title={text('Завершить исследование и освободить его ресурсы', 'Discard the exploration and release its resources')}>{text('Закрыть исследование', 'Close exploration')}</button>}
      {source && <span className="explore-source" title={tablePath([source.database, source.schema, source.table])}>{source.schema}.{source.table}</span>}
      {selected && <button title={text('Перечитать таблицу с сохранением настроек Viewer', 'Reload the source and keep Viewer settings')} disabled={busy} onClick={() => setRevision(n => n + 1)}>{text('Обновить', 'Refresh')}</button>}
      {selected && <button disabled={busy || sqlBusy} onClick={() => void showViewSql()} title={text('SQL данных активной вкладки Viewer', 'SQL for the active Viewer tab')}>{sqlBusy ? '…' : text('SQL представления', 'View SQL')}</button>}
      <span className="explore-status" role={error ? 'alert' : 'status'} title={error || status}>
        {error || `${busy ? '⏳ ' : ''}${status}${rowCount !== undefined ? ` · ${text('Источник', 'Source')}: ${rowCount.toLocaleString()}${viewRows === undefined ? '' : ` · ${text('Представление', 'View')}: ${viewRows.toLocaleString()}`}` : ''}`}
      </span>
    </header>
    <dialog className="explore-sql-dialog" ref={sqlDialog}>
      <header><strong>{text('SQL выбранного представления', 'Selected View SQL')}</strong><button onClick={() => sqlDialog.current?.close()}>{text('Закрыть', 'Close')}</button></header>
      {sqlSnapshot && <>
        <p>{text('Источник', 'Source')}: <code>{sqlSnapshot.source}</code> · {sqlSnapshot.rows.toLocaleString()} × {sqlSnapshot.columns.toLocaleString()}</p>
        <p>{text('Создание временных объектов и чтение полного результата текущего представления. Запросы построения выполнены адаптером; итоговый SELECT сформирован тем же SDK без выгрузки данных. Скопируйте и выполните целиком в редакторе Lens на той же базе. Служебные имена отделены от открытого исследования. После результата оставлены временные таблицы; команды их удаления приведены в конце как комментарии.', 'Temporary object creation and the full current View result. Construction queries were executed by the adapter; the final SELECT uses the same SDK without exporting data. Copy and run the entire script in the Lens editor on the same database. Its temporary names are isolated from the open exploration. Temporary tables remain after replay; commented cleanup statements follow the result.')}</p>
        <textarea aria-label={text('SQL выбранного представления', 'Selected View SQL')} readOnly value={sqlSnapshot.sql} spellCheck={false} />
        <footer><button onClick={() => void copyToClipboard(sqlSnapshot.sql).then(ok=>{if(!ok)setError(text('Не удалось скопировать SQL', 'Could not copy SQL'));})}>{text('Копировать SQL', 'Copy SQL')}</button><small>{text('SQL воспроизводит данные; оформление и тип графика хранятся в настройках Viewer.', 'SQL reproduces data; chart type and styling belong to the Viewer configuration.')}</small></footer>
      </>}
    </dialog>
    <div className="explore-body">
      <div className="explore-viewer" ref={container} />
    </div>
  </section>;
});
export default Explore;
