import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  useNodesState, 
  useEdgesState, 
  BackgroundVariant
} from '@xyflow/react';
import { exportGraphImage, buildGraphTextExport, waitForGraphRendered } from './utils/graphExport';
import { computeColumnStats as computeColumnStatsPure } from './utils/columnStats';
import { reduceColumnClick, formatSelectedColumns } from './utils/columnSelection';
import { needsJsonFormat, appendJsonFormat } from './utils/clickhouseFormat';
import { buildSchemaDbKey, buildTableColumnsKey, SchemaEngine } from './utils/schemaKeys';
import { resultRowsToMarkdown } from './utils/markdownTable';
import { isNarrowNow, useIsNarrow } from './utils/useIsNarrow';
import { buildGroupBySql, buildKeepColumnsSql, buildRemoveColumnsSql, buildDistinctSql } from './utils/columnActionsSql';
import { generateFilteredSortedSql as generateFilteredSortedSqlPure } from './utils/filteredSql';
import { downloadFileWithFallback, copyToClipboard } from "./utils/exportUtils";
import { t } from './utils/i18n';
import { formatCellValue } from './utils/formatCellValue';
import { nextTabName } from './utils/tabNames';
import { decideOpenFile, MAX_OPEN_FILE_BYTES } from './utils/openFile';

import { 
  Play, 
  Code, 
  Database, 
  FileText, 
  BookText,
  Terminal, 
  Copy, 
  Check, 
  X, 
  Plus,
  AlertTriangle,
  HelpCircle, 
  Layout, 
  Layers, 
  Settings, 
  ChevronRight, 
  Activity,
  Maximize2,
  Minimize2,
  RefreshCw,
  Zap,
  Sparkles,
  Info,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Map,
  Download,
  Image as ImageIcon,
  Loader2,
  ChevronDown,
  WrapText,
  AlignLeft,
  Search,
  FolderOpen,
  FileDown,
  FileJson,
  FileCode,
  FileSpreadsheet,
  Workflow,
  History,
  ChevronUp,
  Folder,
  ChevronsUpDown,
  Unplug,
  ChevronsDownUp,
  Square,
  Table,
  Shrink,
  ArrowLeftRight,
  BarChart3,
  TableProperties,
  ArrowUp,
  ArrowDown,
  Filter,
  Columns,
  Cpu,
  ListTree,
  Network
} from 'lucide-react';

import { DataStatsViewer } from './components/DataStatsViewer';

import { parseSqlToAst, astToGraph, getLayoutedElements } from './utils/astToGraph';
import { parseMermaidToGraph } from './utils/mermaidToGraph';
import { looksLikeMermaid, formatMermaidIssue } from './utils/mermaidParse';
// Предпросмотр Markdown грузится при первом открытии (парсер, SVG-рендер диаграмм, санитайзер)
import type { MarkdownPreviewHandle } from './components/MarkdownPreview';
const MarkdownPreview = lazy(() => import('./components/MarkdownPreview'));
import { nodeTypes, edgeTypes } from './components/CustomNodes';
import { sqlPresets, SQLPreset } from './components/SQLPresets';
import { SqlSnippetsManager, ACTION_MENU_CATEGORY } from './components/SqlSnippetsManager';
import { ActionMenuTabContent, ACTION_MENU_TAB_ID } from './components/ActionMenuTabContent';
import { SqlEditor, SqlEditorRef, highlightSqlHtml, getBaseHighlight } from './components/SqlEditor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsModal, getSavedHotkeys, getSavedFormatterSettings, FormatterSettings, getSavedUiVisibilitySettings, UiVisibilitySettings, QuickActionTemplate, getQuickActionTemplates, exportWorkspaceSettings, importWorkspaceSettings, generateWorkspaceBundleObject, applyWorkspaceBundleSilently, resolveWorkspaceSyncFilePath } from './components/SettingsModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { saveVersion, getVersions, getLatestVersion } from './utils/versionHistory';
import { formatColumnType, replaceVariablesInSql, buildQuickActionSource, findUnresolvedVariables } from './lib/sqlUtils';
import { formatSqlText, compactSql } from './utils/sqlFormat';
import { MAX_RESULT_ROWS } from './utils/rowLimit';
import { buildPagedSql, splitStatements, type ExecutionMode } from './utils/pagedSql';
import { rowsFromColumns, getResultColumns, columnsFromMeta } from './utils/resultRows';
import { resultRowsToTsv } from './utils/resultTsv';
import { getTableSizeBadge } from './utils/tableSize';
import { getSavedSession, SESSION_STORAGE_KEY } from './utils/appSession';
import type { EditorTab } from './types/editorTab';
import { MermaidActionGroup } from './components/MermaidActionGroup';
import { getSessionTabs, saveSessionTabs } from './utils/sessionStorage';
import { connectDuckDbWasmFile, connectDuckDbWasmMemory, queryDuckDbWasm, disconnectDuckDbWasm, applyDuckDbConfigWasm, attachDuckDbWasmFile, getRegisteredWasmFiles } from './lib/duckdbWasm';
import { FileTreePanel } from './components/FileTreePanel';
import { pickFileTreeRoot, detectPlatform, normalizeFileSort, remapPath, isSameOrInside, type FilesSectionMode, type FileEntry, type FileSort } from './utils/fileTree';
import { createTauriProvider, createVfsProvider } from './utils/fileTreeProviders';
import { WasmFileManagerModal } from './components/WasmFileManagerModal';
import { ClickhouseModal } from './components/ClickhouseModal';
import { ClickhouseConfig, parseClickhouseCopy, parseClickhouseResponse, getClickhouseUrl, getClickhouseHeaders, isTauriEnvironment, isCapacitorEnvironment, executeClickhouseQueryTauri, executeClickhouseQueryCapacitor, executeClickhouseCopyToTauri, executeClickhouseCopyToCapacitor, executeClickhouseCopyFromTauri, cancelClickhouseQueryTauri } from './lib/clickhouse';
import { getSchemaCache, saveSchemaCache } from './utils/schemaDbCache';
import { replaceSecretsInSql } from './utils/vaultStorage';
import { exportToExcel } from './utils/excelExporter';
import { getSavedExcelSettings, getSavedExcelPresets } from './utils/excelSettingsStorage';
import { ExcelPreset } from './types/excelSettings';
import { saveTabResult, getTabResult, removeTabResult, cleanupOrphanedTabResults, getTabResultSync } from './utils/resultStorage';
import { createRunTracker, executeStatsQuery } from './utils/queryRun';
import { mergeTabResult, shouldPersistTabResult } from './utils/tabResultState';
import { copyResultRows, type CopyResultInput } from './utils/copyResult';
import { hasExcelSaveDirective } from './utils/excelParse';
import { shouldLeaveCopyToBrowser, isSelectionInEditor } from './utils/copyGuard';
import { reconcileSelectedNodeId, findSelectedNode } from './utils/graphSelection';
import { nextIsModified, setTabSql, shouldConfirmClose, formatWithFeedback } from './utils/tabModified';
import { switchConnection, stateAfterSwitch, type ConnState } from './utils/connectionSwitch';
import { resolveHotkeyAction, classifyHotkeyTarget, hotkeyHint } from './utils/appHotkeys';

export type { EditorTab } from './types/editorTab';

export default function App() {
  const savedSession = useMemo(() => getSavedSession(), []);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => savedSession?.theme || 'dark');
  const [dialect, setDialect] = useState<'PostgreSQL' | 'Oracle' | 'Clickhouse' | 'DuckDB' | ''>(() => (savedSession?.dialect as any) || 'PostgreSQL');
  const [direction, setDirection] = useState<'LR' | 'TB'>(() => savedSession?.direction || 'LR');
  const [activePresetId, setActivePresetId] = useState<string>(sqlPresets[0].id);
  const [showSortNodes, setShowSortNodes] = useState<boolean>(false);
  const [showLimitNodes, setShowLimitNodes] = useState<boolean>(false);
  const [isWrapSql, setIsWrapSql] = useState<boolean>(() => savedSession?.isWrapSql ?? isNarrowNow());
  const [isMaximizedSql, setIsMaximizedSql] = useState<boolean>(() => savedSession?.isMaximizedSql ?? true);
  
  // DuckDB Integration State
  const [duckDbConnectedPath, setDuckDbConnectedPath] = useState<string | null>(null);
  const [recentDuckDbPath, setRecentDuckDbPath] = useState<string | null>(null);
  const [recentClickhouseConfigs, setRecentClickhouseConfigs] = useState<ClickhouseConfig[]>([]);
  const [isWasmMode, setIsWasmMode] = useState<boolean>(false);
  const [showWasmFileModal, setShowWasmFileModal] = useState<boolean>(false);
  const [showDuckDbConnMenu, setShowDuckDbConnMenu] = useState<boolean>(false);
  const [duckDbResults, setDuckDbResults] = useState<any[] | null>(null);
  const [queryExecutionDuration, setQueryExecutionDuration] = useState<string | null>(null);
  const [resultColumnTypes, setResultColumnTypes] = useState<Record<string, string>>({});
  // Порядок столбцов результата (п. 3.2): объект строки не хранит порядок числовых имён; null — брать ключи первой строки
  const [resultColumns, setResultColumns] = useState<string[] | null>(null);
  const [duckDbError, setDuckDbError] = useState<string | null>(null);
  const [runningTabId, setRunningTabId] = useState<string | null>(null);
  const [isDuckDbResultVisible, setIsDuckDbResultVisible] = useState<boolean>(false);
  const [isDuckDbResultExpanded, setIsDuckDbResultExpanded] = useState<boolean>(false);
  const [duckDbSelectedCell, setDuckDbSelectedCell] = useState<{ title: string; content: string } | null>(null);
  const [isCellZoomed, setIsCellZoomed] = useState<boolean>(false);
  const [isCellSqlHighlighted, setIsCellSqlHighlighted] = useState<boolean>(false);
  const [isTransposed, setIsTransposed] = useState<boolean>(false);
  const [copiedTableImage, setCopiedTableImage] = useState<boolean>(false);
  const [copiedCellValue, setCopiedCellValue] = useState<boolean>(false);
  const [copiedResultCell, setCopiedResultCell] = useState<{ rowIndex: number; colKey: string } | null>(null);
  const [copiedSchemaCol, setCopiedSchemaCol] = useState<string | null>(null);
  const [isFormatted, setIsFormatted] = useState<boolean>(false);
  const [isCompacted, setIsCompacted] = useState<boolean>(false);
  const resultsTableRef = useRef<HTMLDivElement | null>(null);
  const [resultsViewMode, setResultsViewMode] = useState<'table' | 'chart' | 'summarize'>('table');
  const [summarizeResults, setSummarizeResults] = useState<any[] | null>(null);
  const preChartExpandedRef = useRef<boolean>(false);
  const [statsInitialMode, setStatsInitialMode] = useState<{ chartType: 'bar' | 'line' | 'pie' | 'list'; listSubMode: 'categories' | 'columns' }>({
    chartType: 'list',
    listSubMode: 'categories',
  });
  const activeStatsModeRef = useRef<{ chartType: 'bar' | 'line' | 'pie' | 'list'; listSubMode: 'categories' | 'columns' }>({
    chartType: 'list',
    listSubMode: 'categories',
  });
  const [duckDbSchema, setDuckDbSchema] = useState<any[] | null>(null);
  const [tableColumnsMap, setTableColumnsMap] = useState<Record<string, any[]>>({});
  const [loadingTableCols, setLoadingTableCols] = useState<Record<string, boolean>>({});
  const tableColumnsMapRef = useRef<Record<string, any[]>>({});
  const lastConnectedDbKeyRef = useRef<string | null>(null);
  useEffect(() => {
    tableColumnsMapRef.current = tableColumnsMap;
  }, [tableColumnsMap]);
  const [isSchemaLoading, setIsSchemaLoading] = useState<boolean>(false);
  const [isSchemaZoomed, setIsSchemaZoomed] = useState<boolean>(false);
  const [schemaSearchTerm, setSchemaSearchTerm] = useState<string>(() => savedSession?.schemaSearchTerm || '');
  const [showDuckDbSchemaPanel, setShowDuckDbSchemaPanel] = useState<boolean>(() => savedSession?.showDuckDbSchemaPanel ?? !isNarrowNow());
  // Секция «Файлы» в панели схемы: split — пополам, collapsed — только заголовок, max — на всю панель.
  const [filesSectionMode, setFilesSectionMode] = useState<FilesSectionMode>(() => savedSession?.filesSectionMode ?? 'split');
  // Порядок записей в дереве файлов (имя / дата изменения / размер); в старых сессиях поля нет — по имени.
  const [filesSort, setFilesSort] = useState<FileSort>(() => normalizeFileSort(savedSession?.filesSort));
  const [homeDirPath, setHomeDirPath] = useState<string>('');
  const [expandedSchemaNodes, setExpandedSchemaNodes] = useState<Record<string, boolean>>(() => savedSession?.expandedSchemaNodes || {});

  // Clickhouse Integration State
  const [clickhouseConfig, setClickhouseConfig] = useState<ClickhouseConfig | null>(() => savedSession?.clickhouseConfig || null);
  const [showClickhouseModal, setShowClickhouseModal] = useState<boolean>(false);
  const [activeEngine, setActiveEngine] = useState<'duckdb' | 'clickhouse'>(() => savedSession?.activeEngine || 'duckdb');
  const [activeDuckDbSchema, setActiveDuckDbSchema] = useState<string>('main');

  const isCH = activeEngine === 'clickhouse' || (!duckDbConnectedPath && !isWasmMode && Boolean(clickhouseConfig));

  const handleSetActiveDatabase = (newDb: string) => {
    if (activeEngine === 'clickhouse' || (!duckDbConnectedPath && clickhouseConfig)) {
      if (clickhouseConfig && clickhouseConfig.database !== newDb) {
        const updated = { ...clickhouseConfig, database: newDb };
        setClickhouseConfig(updated);
      }
    }
  };

  const handleSetActiveDuckDbSchema = async (newSchema: string) => {
    setActiveDuckDbSchema(newSchema);
    try {
      await handleExecuteRawQueryForStats(`USE "${newSchema.replace(/"/g, '""')}"`);
    } catch (err) {
      console.warn("Failed to USE schema:", err);
    }
  };

  const handleDuckDbAttachFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsDuckDbRunning(true);
      try {
        if (isWasmMode || (!duckDbConnectedPath && !clickhouseConfig)) {
          // If in WASM mode or not yet connected to a persistent backend
          if (!duckDbConnectedPath) {
            await connectDuckDbWasmMemory(duckDbConfig);
            setIsWasmMode(true);
            setDuckDbConnectedPath(':memory:');
          }
          await attachDuckDbWasmFile(file);
          setShowDuckDbSchemaPanel(true);
          setDuckDbError(null);
          await fetchDuckDbSchema(true);
        } else {
          // @ts-ignore
          const dbPath = file.path || file.name;
          const escapedPath = dbPath.replace(/'/g, "''");
          await handleExecuteRawQueryForStats(`ATTACH '${escapedPath}'`);
          await fetchDuckDbSchema(true);
        }
      } catch (err: any) {
        console.warn("Attach file failed:", err);
        setDuckDbError(t("Ошибка ATTACH базы данных: ") + (err.message || String(err)));
        setIsDuckDbResultVisible(true);
      } finally {
        setIsDuckDbRunning(false);
        // Reset file input so selecting the same file again triggers change
        if (e.target) {
          e.target.value = '';
        }
      }
    }
  };

  const handleAttachDuckDb = async () => {
    if (isTauriEnv) {
      try {
        let openFn: any;
        if (typeof window !== 'undefined' && (window as any).__TAURI__?.dialog?.open) {
          openFn = (window as any).__TAURI__.dialog.open;
        } else {
          const dialog = await import('@tauri-apps/api/dialog');
          openFn = dialog.open;
        }
        const selected = await openFn({
          multiple: false,
          filters: [{ name: 'DuckDB', extensions: ['duckdb', 'db'] }]
        });

        if (selected && typeof selected === 'string') {
          const dbPath = selected;
          const escapedPath = dbPath.replace(/'/g, "''");
          await handleExecuteRawQueryForStats(`ATTACH '${escapedPath}'`);
          await fetchDuckDbSchema(true);
        }
      } catch (err: any) {
        console.warn("Attach DuckDB failed:", err);
        setDuckDbError(t("Ошибка ATTACH базы данных: ") + (err.message || String(err)));
      }
    } else {
      duckDbAttachFileInputRef.current?.click();
    }
  };

  const handleDetachDuckDb = async (dbName: string) => {
    try {
      await handleExecuteRawQueryForStats(`DETACH "${dbName.replace(/"/g, '""')}"`);
      await fetchDuckDbSchema(true);
    } catch (err: any) {
      console.warn("Detach DuckDB failed:", err);
      setDuckDbError(t("Ошибка DETACH базы данных: ") + (err.message || String(err)));
    }
  };

  // Interactive Results Table States
  const [selectedResultCell, setSelectedResultCell] = useState<{ rowIndex: number; colKey: string } | null>(null);
  // Мультивыбор столбцов в шапке (Shift — диапазон, Ctrl/Cmd — добавить/убрать). Пусто, пока выбран один столбец или ничего.
  const [multiSelectedCols, setMultiSelectedCols] = useState<string[]>([]);
  const columnAnchorRef = useRef<string | null>(null);
  const [executeContextMenu, setExecuteContextMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [resultTableContextMenu, setResultTableContextMenu] = useState<{
    x: number;
    y: number;
    colKey: string;
    cellValue?: any;
    rowIndex?: number;
  } | null>(null);
  const [activeSqlSorts, setActiveSqlSorts] = useState<Array<{ colKey: string; dir: 'ASC' | 'DESC' }>>([]);
  const [activeSqlFilters, setActiveSqlFilters] = useState<Array<{ colKey: string; op: '=' | 'IS' | 'LIKE' | '!=' | '<>' | 'IS NULL' | 'IS NOT NULL'; val: any }>>([]);
  const [columnSearchTerm, setColumnSearchTerm] = useState<string>('');
  const [valueSearchTerm, setValueSearchTerm] = useState<string>('');
  const [showColumnJumpDropdown, setShowColumnJumpDropdown] = useState<boolean>(false);

  useEffect(() => {
    const handleClick = () => setExecuteContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExecuteContextMenu(null);
    };
    if (executeContextMenu) {
      window.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('click', handleClick);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [executeContextMenu]);

  useEffect(() => {
    const handleClick = () => setResultTableContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResultTableContextMenu(null);
    };
    if (resultTableContextMenu) {
      window.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('click', handleClick);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [resultTableContextMenu]);

  const handleJumpToColumn = (colKey: string) => {
    setMultiSelectedCols([]);
    setSelectedResultCell({ rowIndex: -1, colKey });
    setShowColumnJumpDropdown(false);
    setTimeout(() => {
      const el = document.getElementById(`th-col-${colKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 50);
  };
  const [lastExecutedSql, setLastExecutedSql] = useState<string>('');
  const [duckDbPage, setDuckDbPage] = useState<number>(1);
  const [duckDbPageSize, setDuckDbPageSize] = useState<number>(50);
  const [showQuickActionsMenu, setShowQuickActionsMenu] = useState<boolean>(false);
  const [quickActions, setQuickActions] = useState<QuickActionTemplate[]>(getQuickActionTemplates);
  const tableSizingRef = useRef<HTMLTableElement>(null);
  const resizingColRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);
  const rafResizeIdRef = useRef<number | null>(null);

  const getCssVarSafeName = (key: string) => {
    try {
      return btoa(encodeURIComponent(key)).replace(/[^a-zA-Z0-9]/g, '');
    } catch (e) {
      return key.replace(/[^a-zA-Z0-9\-_]/g, '_');
    }
  };

  // Reset column widths on new query results
  useEffect(() => {
    if (tableSizingRef.current) {
      tableSizingRef.current.style.cssText = '';
    }
  }, [duckDbResults]);

  const handleResizeMouseDown = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const thEl = (e.currentTarget.parentElement as HTMLElement);
    const startWidth = thEl ? thEl.getBoundingClientRect().width : 120;
    resizingColRef.current = { colKey, startX: e.clientX, startWidth };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return;
      const { colKey: key, startX, startWidth } = resizingColRef.current;
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(50, Math.round(startWidth + deltaX));

      if (rafResizeIdRef.current) {
        cancelAnimationFrame(rafResizeIdRef.current);
      }
      rafResizeIdRef.current = requestAnimationFrame(() => {
        if (tableSizingRef.current) {
          const safeKey = getCssVarSafeName(key);
          tableSizingRef.current.style.setProperty(`--cw-${safeKey}`, `${newWidth}px`);
        }
      });
    };

    const handleMouseUp = () => {
      if (rafResizeIdRef.current) {
        cancelAnimationFrame(rafResizeIdRef.current);
        rafResizeIdRef.current = null;
      }
      resizingColRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetColWidth = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (tableSizingRef.current) {
      const safeKey = getCssVarSafeName(colKey);
      tableSizingRef.current.style.removeProperty(`--cw-${safeKey}`);
    }
  };

  const [schemaContextMenu, setSchemaContextMenu] = useState<{
    x: number;
    y: number;
    dbName: string;
    schemaName: string;
    tableName: string;
    tableType: string;
    columns?: any[];
  } | null>(null);

  useEffect(() => {
    const handleClick = () => setSchemaContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSchemaContextMenu(null);
    };
    if (schemaContextMenu) {
      window.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('click', handleClick);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [schemaContextMenu]);

  const handleSchemaContextAction = (action: 'select' | 'copySelect' | 'copyInsert' | 'describe' | 'ddl') => {
    if (!schemaContextMenu) return;
    const { dbName, schemaName, tableName, tableType, columns } = schemaContextMenu;
    setSchemaContextMenu(null);

    const fullTable = dbName === schemaName
      ? `"${dbName}"."${tableName}"`
      : `"${dbName}"."${schemaName}"."${tableName}"`;

    if (action === 'copySelect') {
      let sel = '';
      if (tableType === 'Macros') {
        sel = dbName === schemaName ? `SELECT "${dbName}"."${tableName}"()` : `SELECT "${dbName}"."${schemaName}"."${tableName}"()`;
      } else {
        const colList = columns && columns.length > 0 ? columns.map((c: any) => `"${c.column_name}"`).join(', ') : '*';
        sel = dbName === schemaName
          ? `SELECT ${colList} FROM "${dbName}"."${tableName}"`
          : `SELECT ${colList} FROM "${dbName}"."${schemaName}"."${tableName}"`;
      }
      copyToClipboard(sel);
      return;
    }

    if (action === 'copyInsert') {
      let ins = '';
      if (tableType === 'Macros') {
        ins = `INSERT INTO ${fullTable} VALUES (NULL);`;
      } else {
        if (columns && columns.length > 0) {
          const colList = columns.map((c: any) => `"${c.column_name}"`).join(', ');
          const valList = columns.map((c: any) => 'NULL').join(', ');
          ins = `INSERT INTO ${fullTable} (${colList}) VALUES (${valList});`;
        } else {
          ins = `INSERT INTO ${fullTable} VALUES (NULL);`;
        }
      }
      copyToClipboard(ins);
      return;
    }

    let sql = '';
    if (action === 'select') {
      sql = `SELECT * FROM ${fullTable}`;
    } else if (action === 'describe') {
      if (tableType === 'Macros') {
        sql = `SELECT function_name, function_type, return_type, parameters, description FROM duckdb_functions() WHERE function_name = '${tableName}' AND schema_name = '${schemaName}' AND database_name = '${dbName}'`;
      } else if (tableType === 'Dictionaries') {
        sql = `DESCRIBE DICTIONARY ${fullTable}`;
      } else {
        sql = `DESCRIBE ${fullTable}`;
      }
    } else if (action === 'ddl') {
      setIsCellSqlHighlighted(true);
      if (activeEngine === 'duckdb') {
        if (tableType === 'Macros') {
          sql = `SELECT function_name AS name, parameters, macro_definition, description FROM duckdb_functions() WHERE function_name = '${tableName}' AND schema_name = '${schemaName}' AND database_name = '${dbName}'`;
        } else if (tableType === 'Views') {
          sql = `SELECT sql FROM duckdb_views() WHERE view_name = '${tableName}' AND schema_name = '${schemaName}' AND database_name = '${dbName}'`;
        } else {
          sql = `SELECT sql FROM duckdb_tables() WHERE table_name = '${tableName}' AND schema_name = '${schemaName}' AND database_name = '${dbName}'`;
        }
      } else {
        sql = tableType === 'Dictionaries' ? `SHOW CREATE DICTIONARY ${fullTable}` : `SHOW CREATE TABLE ${fullTable}`;
      }
    }

    if (sql) {
      setIsMaximizedSql(true);
      setIsDuckDbResultVisible(true);
      setIsDuckDbResultExpanded(true);
      handleExecuteCurrentEngineQuery(sql, 1);
    }
  };

  useEffect(() => {
    if (duckDbConnectedPath && duckDbConnectedPath !== ':memory:') {
      setRecentDuckDbPath(duckDbConnectedPath);
    }
  }, [duckDbConnectedPath]);

  useEffect(() => {
    if (clickhouseConfig) {
      setRecentClickhouseConfigs(prev => {
        const filtered = prev.filter(c => !(c.host === clickhouseConfig.host && c.user === clickhouseConfig.user));
        return [clickhouseConfig, ...filtered].slice(0, 3);
      });
    }
  }, [clickhouseConfig]);

  useEffect(() => {
    const updateQuickActions = () => {
      setQuickActions(getQuickActionTemplates());
    };
    window.addEventListener('sql_quick_actions_updated', updateQuickActions);
    return () => {
      window.removeEventListener('sql_quick_actions_updated', updateQuickActions);
    };
  }, [activeEngine]);

  const extractedTableName = useMemo(() => buildQuickActionSource(lastExecutedSql), [lastExecutedSql]);

  const prevDuckDbPathRef = useRef<string | null>(duckDbConnectedPath);
  useEffect(() => {
    if (prevDuckDbPathRef.current !== null && prevDuckDbPathRef.current !== duckDbConnectedPath) {
      setExpandedSchemaNodes({});
      setSchemaSearchTerm('');
    }
    prevDuckDbPathRef.current = duckDbConnectedPath;
  }, [duckDbConnectedPath]);



  // Движок, чей кэш схемы сейчас показывается (ключи столбцов таблиц включают его)
  const schemaEngine: SchemaEngine =
    (activeEngine === 'clickhouse' || (!duckDbConnectedPath && !isWasmMode && clickhouseConfig)) && clickhouseConfig
      ? 'clickhouse'
      : 'duckdb';

  const toggleSchemaNode = (id: string) => {
    setExpandedSchemaNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchTableColumns = async (dbName: string, schemaName: string, tableName: string, tableType: string) => {
    const tableKey = buildTableColumnsKey(schemaEngine, dbName, schemaName, tableName);
    if (tableColumnsMapRef.current[tableKey] && tableColumnsMapRef.current[tableKey].length > 0) return;

    setLoadingTableCols(prev => ({ ...prev, [tableKey]: true }));

    try {
      let columns: any[] = [];

      if (activeEngine === 'clickhouse' || (!duckDbConnectedPath && !isWasmMode && clickhouseConfig)) {
        if (!clickhouseConfig) return;
        const colQuery = `SELECT name AS column_name, type AS data_type FROM system.columns WHERE database = '${dbName.replace(/'/g, "''")}' AND table = '${tableName.replace(/'/g, "''")}' ORDER BY position FORMAT JSON`;
        let data: any = null;
        if (isTauriEnvironment()) {
          try {
            data = await executeClickhouseQueryTauri(clickhouseConfig, colQuery);
          } catch (e) {
            console.warn("Tauri CH table cols query failed:", e);
          }
        } else if (isCapacitorEnvironment()) {
          try {
            data = await executeClickhouseQueryCapacitor(clickhouseConfig, colQuery);
          } catch (e) {
            console.warn("Capacitor CH table cols query failed:", e);
          }
        } else {
          try {
            data = await fetchApiJson('/api/clickhouse/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...clickhouseConfig, query: colQuery }),
            });
          } catch {
            const url = getClickhouseUrl(clickhouseConfig);
            const headers = getClickhouseHeaders(clickhouseConfig);
            const chRes = await fetch(url, { method: 'POST', headers, body: colQuery });
            const text = await chRes.text();
            if (chRes.ok) {
              try {
                const parsed = JSON.parse(text);
                data = { success: true, data: parsed.data || parsed };
              } catch {}
            }
          }
        }
        if (data && data.data && Array.isArray(data.data)) {
          columns = data.data;
        } else if (data && Array.isArray(data)) {
          columns = data;
        }
      } else {
        // DuckDB
        if (tableType === 'Macros') {
          const macroInfoQuery = `SELECT function_name, parameters, return_type, description FROM duckdb_functions() WHERE function_name = '${tableName.replace(/'/g, "''")}' AND schema_name = '${schemaName.replace(/'/g, "''")}' AND database_name = '${dbName.replace(/'/g, "''")}'`;
          let rows: any[] = [];
          try {
            if (isTauriEnv && !isWasmMode) {
              const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: macroInfoQuery });
              rows = (res?.rows || []).map(r => {
                const obj: Record<string, any> = {};
                (res.columns || []).forEach((c, i) => { obj[c] = r[i]; });
                return obj;
              });
            } else if (isWasmMode) {
              rows = await queryDuckDbWasm(macroInfoQuery);
            } else {
              const data = await fetchApiJson("/api/duckdb/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: macroInfoQuery })
              });
              if (data.data) rows = data.data;
            }
          } catch (e) {
            console.warn("Failed to fetch macro details:", e);
          }

          if (rows && rows.length > 0) {
            const m = rows[0];
            const params = Array.isArray(m.parameters) ? m.parameters.join(', ') : (m.parameters || '');
            columns = [
              { column_name: `(${params})`, data_type: m.return_type || 'macro' }
            ];
            if (m.description) {
              columns.push({ column_name: m.description, data_type: 'info' });
            }
          } else {
            columns = [{ column_name: 'macro()', data_type: 'macro' }];
          }
        } else {
          const colQuery = `SELECT column_name, data_type FROM duckdb_columns() WHERE database_name = '${dbName.replace(/'/g, "''")}' AND schema_name = '${schemaName.replace(/'/g, "''")}' AND table_name = '${tableName.replace(/'/g, "''")}' ORDER BY column_index`;
          try {
            if (isTauriEnv && !isWasmMode) {
              const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: colQuery });
              columns = (res?.rows || []).map(r => {
                const obj: Record<string, any> = {};
                (res.columns || []).forEach((c, i) => { obj[c] = r[i]; });
                return obj;
              });
            } else if (isWasmMode) {
              columns = await queryDuckDbWasm(colQuery);
            } else {
              const data = await fetchApiJson("/api/duckdb/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: colQuery })
              });
              if (data.data) columns = data.data;
            }
          } catch (e) {
            console.warn("duckdb_columns() query failed:", e);
          }

          // Fallback 1: information_schema.columns
          if (!columns || columns.length === 0) {
            try {
              const fallbackColQuery = `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName.replace(/'/g, "''")}' AND (table_schema = '${schemaName.replace(/'/g, "''")}' OR table_schema = 'main') ORDER BY ordinal_position`;
              if (isWasmMode) {
                columns = await queryDuckDbWasm(fallbackColQuery);
              } else if (isTauriEnv && !isWasmMode) {
                const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: fallbackColQuery });
                columns = (res?.rows || []).map(r => {
                  const obj: Record<string, any> = {};
                  (res.columns || []).forEach((c, i) => { obj[c] = r[i]; });
                  return obj;
                });
              } else {
                const data = await fetchApiJson("/api/duckdb/query", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ query: fallbackColQuery })
                });
                if (data.data) columns = data.data;
              }
            } catch (e2) {
              console.warn("Fallback information_schema.columns failed:", e2);
            }
          }

          // Fallback 2: DESCRIBE "table"
          if (!columns || columns.length === 0) {
            try {
              const describeQuery = `DESCRIBE "${tableName.replace(/"/g, '""')}"`;
              let descRows: any[] = [];
              if (isWasmMode) {
                descRows = await queryDuckDbWasm(describeQuery);
              } else if (isTauriEnv && !isWasmMode) {
                const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: describeQuery });
                descRows = (res?.rows || []).map(r => {
                  const obj: Record<string, any> = {};
                  (res.columns || []).forEach((c, i) => { obj[c] = r[i]; });
                  return obj;
                });
              } else {
                const data = await fetchApiJson("/api/duckdb/query", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ query: describeQuery })
                });
                if (data.data) descRows = data.data;
              }
              if (descRows && descRows.length > 0) {
                columns = descRows.map(r => ({
                  column_name: r.column_name || r.Field || r.name || Object.values(r)[0],
                  data_type: r.column_type || r.Type || r.type || Object.values(r)[1] || 'TEXT'
                })).filter(c => c.column_name);
              }
            } catch (e3) {
              console.warn("DESCRIBE table failed:", e3);
            }
          }
        }
      }

      if (columns && columns.length > 0) {
        setTableColumnsMap(prev => {
          const updated = { ...prev, [tableKey]: columns };
          const isCH = activeEngine === 'clickhouse' || (!duckDbConnectedPath && !isWasmMode && clickhouseConfig);
          const dbKey = buildSchemaDbKey({ engine: isCH && clickhouseConfig ? 'clickhouse' : 'duckdb', clickhouse: clickhouseConfig, duckDbPath: duckDbConnectedPath, isWasm: isWasmMode });
          if (duckDbSchema) {
            saveSchemaCache({
              dbKey,
              timestamp: Date.now(),
              tables: duckDbSchema,
              tableColumnsMap: updated,
            });
          }
          return updated;
        });
      }
    } catch (e: any) {
      console.warn(`Failed to fetch columns for ${tableKey}:`, e);
    } finally {
      setLoadingTableCols(prev => ({ ...prev, [tableKey]: false }));
    }
  };

  const handleToggleTableNode = async (dbName: string, schemaName: string, tableName: string, tableType: string) => {
    const nodeKey = `tbl-${dbName}-${schemaName}-${tableName}`;
    const tableKey = buildTableColumnsKey(schemaEngine, dbName, schemaName, tableName);
    
    const isCurrentlyExpanded = !!expandedSchemaNodes[nodeKey];
    setExpandedSchemaNodes(prev => ({ ...prev, [nodeKey]: !isCurrentlyExpanded }));

    if (!isCurrentlyExpanded && !tableColumnsMapRef.current[tableKey]) {
      await fetchTableColumns(dbName, schemaName, tableName, tableType);
    }
  };

  const handleExpandAllSchemaNodes = () => {
    if (!groupedDuckDbSchema) return;
    const nextState: Record<string, boolean> = {};
    Object.entries(groupedDuckDbSchema).forEach(([dbName, schemas]: any) => {
      if (dbName.toLowerCase() === 'system') return;
      nextState[`db-${dbName}`] = true;
      Object.entries(schemas).forEach(([schemaName, types]: any) => {
        nextState[`sch-${dbName}-${schemaName}`] = true;
        Object.entries(types).forEach(([typeName, tables]: any) => {
          nextState[`type-${dbName}-${schemaName}-${typeName}`] = true;
        });
      });
    });
    setExpandedSchemaNodes(nextState);
  };

  const groupedDuckDbSchema = useMemo(() => {
    if (!duckDbSchema) return null;
    const tree: Record<string, Record<string, Record<string, Record<string, { info: any; columns?: any[] }>>>> = {};
    const term = schemaSearchTerm.toLowerCase();
    
    duckDbSchema.forEach(item => {
      const tblName = item.table_name || item.name || '';
      const tblMatch = tblName.toLowerCase().includes(term);
      
      const db = item.database_name || item.database || 'main';
      const sch = item.schema_name || item.schema || 'main';
      const type = item.table_type === 'Views'
        ? 'Views'
        : item.table_type === 'Macros'
        ? 'Macros'
        : item.table_type === 'Material Views'
        ? 'Material Views'
        : item.table_type === 'Dictionaries'
        ? 'Dictionaries'
        : 'Tables';
      const tbl = tblName;
      if (!tbl) return;
      const tableKey = buildTableColumnsKey(schemaEngine, db, sch, tbl);
      const cachedCols = tableColumnsMap[tableKey];

      let colMatch = false;
      if (term && cachedCols && Array.isArray(cachedCols)) {
        colMatch = cachedCols.some((c: any) => (c.column_name || '').toLowerCase().includes(term));
      }

      if (term && !tblMatch && !colMatch) return;
      
      if (!tree[db]) tree[db] = {};
      if (!tree[db][sch]) tree[db][sch] = {};
      if (!tree[db][sch][type]) tree[db][sch][type] = {};
      
      tree[db][sch][type][tbl] = {
        info: item,
        columns: cachedCols || null,
      };
    });
    return tree;
  }, [duckDbSchema, tableColumnsMap, schemaSearchTerm, schemaEngine]);

  const [showSnippetsModal, setShowSnippetsModal] = useState<boolean>(false);
  const [snippetsModalCategory, setSnippetsModalCategory] = useState<string | undefined>(undefined);
  const [snippetsModalEditId, setSnippetsModalEditId] = useState<string | undefined>();
  const [showPresetsDropdown, setShowPresetsDropdown] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [lineageHighlightMode, setLineageHighlightMode] = useState<boolean>(false);
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(() => getSavedHotkeys());
  const [formatterSettings, setFormatterSettings] = useState<FormatterSettings>(() => getSavedFormatterSettings());
  const [uiVisibility, setUiVisibility] = useState<UiVisibilitySettings>(() => getSavedUiVisibilitySettings());

  const effectiveMaxRows = Math.min(activeEngine === 'clickhouse'
    ? (uiVisibility.clickhouseMaxRows ?? 100)
    : (uiVisibility.duckDbMaxRows ?? 100), MAX_RESULT_ROWS);

  useEffect(() => {
    const scale = (uiVisibility.uiScale ?? 100) / 100;
    (document.documentElement.style as any).zoom = scale;
    document.documentElement.style.setProperty('--zoom-scale', String(scale));

    const bg = theme === 'dark' ? '#172033' : '#e2e8f0';
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    return () => {
      (document.documentElement.style as any).zoom = 1;
      document.documentElement.style.removeProperty('--zoom-scale');
    };
  }, [uiVisibility.uiScale, theme]);

  const pagedResults = useMemo(() => {
    if (!duckDbResults) return [];
    return effectiveMaxRows > 0 ? duckDbResults.slice(0, effectiveMaxRows) : duckDbResults;
  }, [duckDbResults, effectiveMaxRows]);

  const displayedResults = useMemo(() => {
    if (!pagedResults || pagedResults.length === 0) return [];
    if (!valueSearchTerm.trim()) return pagedResults;
    const term = valueSearchTerm.trim().toLowerCase();
    return pagedResults.filter(row => {
      if (!row || typeof row !== 'object') return false;
      return Object.values(row).some(val => {
        if (val === null || val === undefined) return false;
        return formatCellValue(val).toLowerCase().includes(term);
      });
    });
  }, [pagedResults, valueSearchTerm]);

  const computeColumnStats = useCallback((colKey: string, rows: any[]) => computeColumnStatsPure(colKey, rows), [activeEngine]);

  // Столбцы результата в порядке выдачи (нужны для диапазона Shift и для REMOVE COLS).
  const resultColumnKeys = useMemo<string[]>(
    () => getResultColumns(duckDbResults, resultColumns),
    [duckDbResults, resultColumns]
  );

  // Подсветка столбца: при мультивыборе — по списку, иначе как раньше — по выбранной ячейке/столбцу.
  const isColHighlighted = (colKey: string) =>
    multiSelectedCols.length > 0 ? multiSelectedCols.includes(colKey) : selectedResultCell?.colKey === colKey;

  // 2+ столбца — мультивыбор (статистика закрывается и не считается); 1 — обычный выбор со статистикой; 0 — снять выбор.
  const applyColumnSelection = (next: string[]) => {
    if (next.length >= 2) {
      setMultiSelectedCols(next);
      setSelectedResultCell(null);
      setDuckDbSelectedCell(null);
    } else if (next.length === 1) {
      setMultiSelectedCols([]);
      setSelectedResultCell({ rowIndex: -1, colKey: next[0] });
      setDuckDbSelectedCell({ title: `${t('Столбец:')} ${next[0]}`, content: computeColumnStats(next[0], displayedResults) });
    } else {
      setMultiSelectedCols([]);
      setSelectedResultCell(null);
      setDuckDbSelectedCell(null);
    }
  };

  // Клик по таблице результатов: снять фокус с редактора и остаток выделения в нём, чтобы Ctrl+C копировал выбранное в таблице.
  const releaseEditorFocus = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    try { window.getSelection()?.removeAllRanges(); } catch (_) {}
  };

  const handleColumnHeaderClick = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, colKey: string) => {
    releaseEditorFocus();
    const current = multiSelectedCols.length > 0
      ? multiSelectedCols
      : (selectedResultCell && selectedResultCell.rowIndex === -1 ? [selectedResultCell.colKey] : []);
    const { selection, anchor } = reduceColumnClick(resultColumnKeys, current, columnAnchorRef.current, e, colKey);
    columnAnchorRef.current = anchor;
    applyColumnSelection(selection);
  };

  const handleColumnHeaderContextMenu = (
    e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number },
    colKey: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    // ПКМ внутри мультивыбора сохраняет его; вне его — выбор сводится к одному столбцу, как раньше.
    if (!(multiSelectedCols.length >= 2 && multiSelectedCols.includes(colKey))) {
      setMultiSelectedCols([]);
      setSelectedResultCell({ rowIndex: -1, colKey });
    }
    setResultTableContextMenu({ x: e.clientX, y: e.clientY, colKey });
  };

  // Меню шапки: ПКМ внутри мультивыбора (2+ столбца) работает со всеми выбранными, иначе — с одним столбцом.
  const isMultiColumnMenu = !!resultTableContextMenu
    && resultTableContextMenu.cellValue === undefined
    && multiSelectedCols.length >= 2
    && multiSelectedCols.includes(resultTableContextMenu.colKey);
  const menuColumns: string[] = isMultiColumnMenu ? multiSelectedCols : (resultTableContextMenu ? [resultTableContextMenu.colKey] : []);

  // Новый результат — мультивыбор сбрасывается (столбцы могли измениться).
  useEffect(() => {
    setMultiSelectedCols([]);
    columnAnchorRef.current = null;
  }, [duckDbResults]);

  useEffect(() => {
    if (selectedResultCell && selectedResultCell.rowIndex === -1 && selectedResultCell.colKey) {
      setDuckDbSelectedCell({
        title: `${t("Столбец:")} ${selectedResultCell.colKey}`,
        content: computeColumnStats(selectedResultCell.colKey, displayedResults),
      });
    }
  }, [selectedResultCell, displayedResults, computeColumnStats]);

  useEffect(() => {
    const handleCopyKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        const selection = window.getSelection();
        if (shouldLeaveCopyToBrowser({
          activeTag: document.activeElement?.tagName ?? '',
          activeIsEditable: !!(document.activeElement as HTMLElement | null)?.isContentEditable,
          selectionText: selection ? selection.toString() : '',
          selectionInEditor: isSelectionInEditor(selection),
        })) return;

        if (multiSelectedCols.length > 0 && displayedResults && displayedResults.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          copyToClipboard(formatSelectedColumns(multiSelectedCols));
          setCopiedResultCell({ rowIndex: -1, colKey: multiSelectedCols[0] });
          setTimeout(() => setCopiedResultCell(null), 1500);
        } else if (selectedResultCell && displayedResults && displayedResults.length > 0) {
          let textToCopy = '';
          if (selectedResultCell.rowIndex === -1) {
            textToCopy = selectedResultCell.colKey;
          } else if (selectedResultCell.rowIndex >= 0 && displayedResults[selectedResultCell.rowIndex]) {
            const val = displayedResults[selectedResultCell.rowIndex][selectedResultCell.colKey];
            textToCopy = val === null || val === undefined ? 'null' : formatCellValue(val);
          }
          if (textToCopy) {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(textToCopy);
            setCopiedResultCell({ rowIndex: selectedResultCell.rowIndex, colKey: selectedResultCell.colKey });
            setTimeout(() => setCopiedResultCell(null), 1500);
          }
        } else if (duckDbSelectedCell?.content) {
          e.preventDefault();
          e.stopPropagation();
          copyToClipboard(duckDbSelectedCell.content);
          setCopiedCellValue(true);
          setTimeout(() => setCopiedCellValue(false), 1500);
        }
      }
    };
    window.addEventListener('keydown', handleCopyKeyDown);
    return () => window.removeEventListener('keydown', handleCopyKeyDown);
  }, [selectedResultCell, displayedResults, duckDbSelectedCell, multiSelectedCols]);
  const formatterSettingsRef = useRef<FormatterSettings>(formatterSettings);
  useEffect(() => {
    formatterSettingsRef.current = formatterSettings;
  }, [formatterSettings]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsImportFileInputRef = useRef<HTMLInputElement>(null);
  const win1251FileInputRef = useRef<HTMLInputElement>(null);
  const duckDbFileInputRef = useRef<HTMLInputElement>(null);
  const duckDbAttachFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportSettingsFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importWorkspaceSettings(file, async () => {
      if (duckDbConnectedPath || clickhouseConfig) {
        await handleDisconnectDuckDb();
      }
    });
    event.target.value = '';
  };

  // Tabs state for fullscreen editor
  const [tabs, setTabs] = useState<EditorTab[]>(() => {
    if (savedSession?.tabs && savedSession.tabs.length > 0) {
      return savedSession.tabs;
    }
    return [{ id: '1', title: t('Вкладка 1'), sql: sqlPresets[0].sql }];
  });
  const activeTabIdRef = useRef<string>("");
  const lastActiveSqlTabIdRef = useRef<string>('1');
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (savedSession?.activeTabId && savedSession?.tabs?.some(t => t.id === savedSession.activeTabId)) {
      return savedSession.activeTabId;
    }
    return savedSession?.tabs?.[0]?.id || '1';
  });

  const isDuckDbRunning = runningTabId === activeTabId;
  const isAnyQueryRunning = runningTabId !== null;
  const setIsDuckDbRunning = (isRunning: boolean) => {
    setRunningTabId(isRunning ? activeTabIdRef.current : null);
  };
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [loadedTabId, setLoadedTabId] = useState<string | null>(null);
  useLayoutEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isTabsLoaded, setIsTabsLoaded] = useState<boolean>(false);
  const isTabsLoadedRef = useRef<boolean>(false);

  const sqlRef = useRef<string>(tabs.find(t => t.id === activeTabId)?.sql || '');
  const isResultTableHoveredRef = useRef<boolean>(false);
  const isCreatingFilterTabRef = useRef<boolean>(false);

  useLayoutEffect(() => {
    if (!isMaximizedSql && activeTabId === ACTION_MENU_TAB_ID) {
      if (tabs.length > 0) {
        setActiveTabId(tabs[0].id);
      }
    }
  }, [isMaximizedSql, activeTabId, tabs]);

  // -- IndexedDB Results Sync logic --
  const isRestoringTabRef = useRef<boolean>(false);

  // Load results from IndexedDB when activeTabId changes
  useLayoutEffect(() => {
    isRestoringTabRef.current = true;
    let isMounted = true;
    setSelectedResultCell(null);
    setDuckDbSelectedCell(null);
    
    const applyData = (data: any) => {
      if (!isMounted) return;
      if (data) {
        setDuckDbResults(data.duckDbResults);
        setQueryExecutionDuration(data.queryExecutionDuration);
        setResultColumnTypes(data.resultColumnTypes || {});
        setResultColumns(data.resultColumns ?? null);
        setIsDuckDbResultVisible(data.isDuckDbResultVisible);
        setDuckDbPage(data.duckDbPage || 1);
        setDuckDbError(data.duckDbError || null);
        if (data.lastExecutedSql !== undefined) {
          setLastExecutedSql(data.lastExecutedSql || '');
        }
      } else {
        setDuckDbResults(null);
        setQueryExecutionDuration(null);
        setResultColumnTypes({});
        setResultColumns(null);
        setIsDuckDbResultVisible(false);
        setDuckDbPage(1);
        setDuckDbError(null);
      }
      setLoadedTabId(activeTabId);
      setTimeout(() => {
        if (isMounted) isRestoringTabRef.current = false;
      }, 50);
    };

    const syncData = getTabResultSync(activeTabId);
    if (syncData) {
      applyData(syncData);
    } else {
      applyData(null); // Синхронно очищаем старые результаты до ответа от IndexedDB
      getTabResult(activeTabId).then((data) => {
        if (data && isMounted) {
            // Если в БД что-то было, применяем
            applyData(data);
        }
      }).catch((err) => {
        console.error('Failed to get tab result from IDB:', err);
        if (isMounted) isRestoringTabRef.current = false;
      });
    }

    return () => { isMounted = false; };
  }, [activeTabId]);

  // Save results to IndexedDB when they change in RAM
  useEffect(() => {
    if (isRestoringTabRef.current || loadedTabId !== activeTabId) return;
    saveTabResult(activeTabId, {
      duckDbResults,
      queryExecutionDuration,
      resultColumnTypes,
      resultColumns,
      isDuckDbResultVisible,
      duckDbPage,
      duckDbError,
      lastExecutedSql
    }).catch(console.error);
  }, [duckDbResults, queryExecutionDuration, resultColumnTypes, resultColumns, isDuckDbResultVisible, duckDbPage, duckDbError, lastExecutedSql, activeTabId, loadedTabId]);
  
  // Cleanup orphaned tab results once tabs are fully loaded from session
  useEffect(() => {
    if (isTabsLoaded && tabs.length > 0) {
      cleanupOrphanedTabResults([...tabs.map(t => t.id), ACTION_MENU_TAB_ID]).catch(console.error);
    }
  }, [isTabsLoaded]);
  // -- End IndexedDB Results Sync logic --

  useEffect(() => {
    setResultTableContextMenu(null);
    setMultiSelectedCols([]);
    if (isCreatingFilterTabRef.current) {
      isCreatingFilterTabRef.current = false;
    } else {
      setActiveSqlFilters([]);
      setActiveSqlSorts([]);
    }
    if (activeTabId === ACTION_MENU_TAB_ID) {
      sqlRef.current = '';
    } else {
      const currentTab = tabs.find(t => t.id === activeTabId);
      if (currentTab) {
        sqlRef.current = currentTab.sql;
      }
    }
  }, [activeTabId]);

  const generateFilteredSortedSql = useCallback((
    baseSql: string,
    filters: Array<{ colKey: string; op: '=' | 'IS' | 'LIKE' | '!=' | '<>' | 'IS NULL' | 'IS NOT NULL'; val: any }>,
    sorts: Array<{ colKey: string; dir: 'ASC' | 'DESC' }>
  ) => generateFilteredSortedSqlPure(activeEngine, baseSql, filters, sorts), [activeEngine]);

  const handleApplyTableSort = (colKey: string, dir: 'ASC' | 'DESC') => {
    const updatedSorts = [{ colKey, dir }, ...activeSqlSorts.filter(s => s.colKey !== colKey)];
    setActiveSqlSorts(updatedSorts);

    const activeTab = tabs.find(t => t.id === activeTabId);
    const rootBaseSql = activeTab?.originalSql || lastExecutedSql || activeTab?.sql || '';
    const newSql = generateFilteredSortedSql(rootBaseSql, activeSqlFilters, updatedSorts);

    if (newSql) {
      sqlRef.current = newSql;
      if (activeTab?.originalSql || tabs.length >= 9) {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: newSql, originalSql: rootBaseSql } : t));
        handleExecuteCurrentEngineQuery(newSql, 1);
      } else {
        const newTabId = `tab_${Date.now()}`;
        const newTabTitle = `${activeTab?.title || t('Запрос')} (Filter)`;
        const newTab: EditorTab = {
          id: newTabId,
          title: newTabTitle,
          sql: newSql,
          originalSql: rootBaseSql,
        };
        isCreatingFilterTabRef.current = true;
        setTabs(prev => [...prev.map(t => t.id === activeTabId ? { ...t, sql: activeTab?.sql || '' } : t), newTab]);
        setActiveTabId(newTabId);
        setTimeout(() => {
          handleExecuteCurrentEngineQuery(newSql, 1, undefined, false, undefined, newTabId);
        }, 50);
      }
    }
  };

  const handleApplyTableFilter = (
    colKey: string,
    cellValue: any,
    customOp?: '=' | 'IS' | 'LIKE' | '!=' | '<>' | 'IS NULL' | 'IS NOT NULL'
  ) => {
    let op = customOp;
    if (!op) {
      op = cellValue === null || cellValue === undefined ? 'IS' : '=';
    }
    const updatedFilters = [...activeSqlFilters.filter(f => !(f.colKey === colKey && f.op === op)), { colKey, op, val: cellValue }];
    setActiveSqlFilters(updatedFilters);

    const activeTab = tabs.find(t => t.id === activeTabId);
    const rootBaseSql = activeTab?.originalSql || lastExecutedSql || activeTab?.sql || '';
    const newSql = generateFilteredSortedSql(rootBaseSql, updatedFilters, activeSqlSorts);

    if (newSql) {
      sqlRef.current = newSql;
      if (activeTab?.originalSql || tabs.length >= 9) {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: newSql, originalSql: rootBaseSql } : t));
        handleExecuteCurrentEngineQuery(newSql, 1);
      } else {
        const newTabId = `tab_${Date.now()}`;
        const newTabTitle = `${activeTab?.title || t('Запрос')} (Filter)`;
        const newTab: EditorTab = {
          id: newTabId,
          title: newTabTitle,
          sql: newSql,
          originalSql: rootBaseSql,
        };
        isCreatingFilterTabRef.current = true;
        setTabs(prev => [...prev.map(t => t.id === activeTabId ? { ...t, sql: activeTab?.sql || '' } : t), newTab]);
        setActiveTabId(newTabId);
        setTimeout(() => {
          handleExecuteCurrentEngineQuery(newSql, 1, undefined, false, undefined, newTabId);
        }, 50);
      }
    }
  };

  // Действия над столбцами из меню шапки: GROUP BY / KEEP / REMOVE / DISTINCT.
  // Оборачивают текущий запрос (с применёнными фильтрами таблицы) подзапросом и открывают результат во вкладке
  // по той же схеме, что и прежний GROUP BY (сортировка и фильтры таблицы сбрасываются).
  const handleApplyColumnAction = (kind: 'group' | 'keep' | 'remove' | 'distinct', cols: string[]) => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    const rootBaseSql = activeTab?.originalSql || lastExecutedSql || activeTab?.sql || '';
    const cleanSql = rootBaseSql.trim().replace(/;+$/, '');
    if (!cleanSql) return;

    const baseFilteredSql = generateFilteredSortedSql(rootBaseSql, activeSqlFilters, []);
    const newSql =
      kind === 'group' ? buildGroupBySql(baseFilteredSql, cols)
      : kind === 'keep' ? buildKeepColumnsSql(baseFilteredSql, cols)
      : kind === 'remove' ? buildRemoveColumnsSql(baseFilteredSql, resultColumnKeys, cols)
      : buildDistinctSql(baseFilteredSql, cols);
    if (!newSql) return;
    const tabSuffix = kind === 'group' ? 'Group' : kind === 'keep' ? 'Keep' : kind === 'remove' ? 'Remove' : 'Distinct';

    sqlRef.current = newSql;
    setActiveSqlFilters([]);
    setActiveSqlSorts([]);

    if (activeTab?.originalSql || tabs.length >= 9) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: newSql, originalSql: newSql } : t));
      handleExecuteCurrentEngineQuery(newSql, 1);
    } else {
      const newTabId = `tab_${Date.now()}`;
      const newTabTitle = `${activeTab?.title || t('Запрос')} (${tabSuffix})`;
      const newTab: EditorTab = {
        id: newTabId,
        title: newTabTitle,
        sql: newSql,
        originalSql: newSql,
      };
      setTabs(prev => [...prev.map(t => t.id === activeTabId ? { ...t, sql: activeTab?.sql || '' } : t), newTab]);
      setActiveTabId(newTabId);
      setTimeout(() => {
        handleExecuteCurrentEngineQuery(newSql, 1, undefined, false, undefined, newTabId);
      }, 50);
    }
  };

  useEffect(() => {
    const loadTabs = async () => {
      // Workspace Synchronization Auto-Import
      if (isTauriEnvironment()) {
        try {
          const rawVis = localStorage.getItem('sql_visualizer_ui_visibility_v1') || localStorage.getItem('sql_visualizer_ui_visibility');
          let syncPath: string | null = null;
          if (rawVis) {
            try {
              syncPath = JSON.parse(rawVis).workspaceSyncPath || null;
            } catch (_) {}
          }
          
          if (syncPath) {
            const filePath = resolveWorkspaceSyncFilePath(syncPath);
            try {
              const fileContent = await tauriInvoke<string>('read_text_file', { path: filePath });
              if (fileContent) {
                const parsed = JSON.parse(fileContent);
                if (parsed?.data && parsed?.exportedAt) {
                  const lastSync = localStorage.getItem('sql_last_workspace_sync_time') || '';
                  // If the file is newer than or equal to our last sync time, import it
                  if (!lastSync || isNaN(Date.parse(lastSync)) || Date.parse(parsed.exportedAt) >= Date.parse(lastSync)) {
                    await applyWorkspaceBundleSilently(parsed.data);
                    localStorage.setItem('sql_last_workspace_sync_time', parsed.exportedAt);

                    const updatedVis = getSavedUiVisibilitySettings();
                    setUiVisibility(updatedVis);
                    setFormatterSettings(getSavedFormatterSettings());
                    setHotkeys(getSavedHotkeys());
                    setQuickActions(getQuickActionTemplates());
                  }
                }
              }
            } catch (err) {
              // File might not exist yet or is inaccessible, just continue with local session
            }
          }
        } catch (e) {
          console.warn('Auto-import synchronization failed:', e);
        }
      }

      try {
        const storedTabs = await getSessionTabs();
        if (storedTabs && storedTabs.length > 0) {
          setTabs(storedTabs);
          
          const freshSession = getSavedSession();
          let nextActiveTabId = freshSession?.activeTabId || savedSession?.activeTabId || storedTabs[0].id;
          if (nextActiveTabId !== ACTION_MENU_TAB_ID && !storedTabs.some(t => t.id === nextActiveTabId)) {
            nextActiveTabId = storedTabs[0].id;
          }
          setActiveTabId(nextActiveTabId);
          if (nextActiveTabId === ACTION_MENU_TAB_ID) {
            sqlRef.current = '';
          } else {
            const initialTab = storedTabs.find(t => t.id === nextActiveTabId);
            sqlRef.current = initialTab?.sql || '';
            if (initialTab?.lastExecutedSql) {
              setLastExecutedSql(initialTab.lastExecutedSql);
            } else {
              setLastExecutedSql('');
            }
          }
          if (freshSession?.theme && freshSession.theme !== theme) {
            setTheme(freshSession.theme);
          }
          if (freshSession?.dialect && freshSession.dialect !== dialect) {
            setDialect(freshSession.dialect);
          }
          if (freshSession?.direction && freshSession.direction !== direction) {
            setDirection(freshSession.direction);
          }
          if (freshSession?.isWrapSql !== undefined && freshSession.isWrapSql !== isWrapSql) {
            setIsWrapSql(freshSession.isWrapSql);
          }
          if (freshSession?.isMaximizedSql !== undefined && freshSession.isMaximizedSql !== isMaximizedSql) {
            setIsMaximizedSql(freshSession.isMaximizedSql);
          }
          if (freshSession?.schemaSearchTerm !== undefined && freshSession.schemaSearchTerm !== schemaSearchTerm) {
            setSchemaSearchTerm(freshSession.schemaSearchTerm);
          }
          if (freshSession?.showDuckDbSchemaPanel !== undefined && freshSession.showDuckDbSchemaPanel !== showDuckDbSchemaPanel) {
            setShowDuckDbSchemaPanel(freshSession.showDuckDbSchemaPanel);
          }
          if (freshSession?.expandedSchemaNodes) {
            setExpandedSchemaNodes(freshSession.expandedSchemaNodes);
          }
        }
      } catch (e) {
        console.error("Failed to load tabs from IDB", e);
      } finally {
        setIsTabsLoaded(true);
        isTabsLoadedRef.current = true;
        setIsInitializing(false);
      }
    };
    loadTabs();
  }, [savedSession?.activeTabId]);

  const getActiveTabSql = () => {
    if (activeTabId === ACTION_MENU_TAB_ID) return '';
    return tabs.find(t => t.id === activeTabId)?.sql || '';
  };
  // Keep latest session state in ref to avoid constant disk writes while editing
  const latestSessionRef = useRef({
    tabs,
    activeTabId,
    sql: sqlRef.current,
    dialect,
    direction,
    theme,
    isWrapSql,
    isMaximizedSql,
    duckDbConnectedPath,
    schemaSearchTerm,
    expandedSchemaNodes,
    showDuckDbSchemaPanel,
    filesSectionMode,
    filesSort,
    clickhouseConfig,
    activeEngine
  });

  useEffect(() => {
    latestSessionRef.current = {
      tabs: tabs.map(t => t.id === activeTabId ? { ...t, sql: sqlRef.current } : t),
      activeTabId,
      sql: sqlRef.current,
      dialect,
      direction,
      theme,
      isWrapSql,
      isMaximizedSql,
      duckDbConnectedPath,
      schemaSearchTerm,
      expandedSchemaNodes,
      showDuckDbSchemaPanel,
      filesSectionMode,
      filesSort,
      clickhouseConfig,
      activeEngine
    };
  }, [
    tabs,
    activeTabId,
    // sql not in deps
    dialect,
    direction,
    theme,
    isWrapSql,
    isMaximizedSql,
    duckDbConnectedPath,
    schemaSearchTerm,
    expandedSchemaNodes,
    showDuckDbSchemaPanel,
    filesSectionMode,
    filesSort,
    clickhouseConfig,
    activeEngine
  ]);

  // Auto-reconnect to DuckDB database on application startup if path was saved in session
  useEffect(() => {
    const autoReconnect = async () => {
      const dbPath = savedSession?.duckDbConnectedPath;
      if (!dbPath) return;

      setIsDuckDbRunning(true);
      try {
        // В десктопе (Tauri) локальный Express-сервер не используется: не опрашиваем чужие порты.
        // Конфигурация DuckDB передаётся и в запасном пути (раньше терялась).
        const conn = await openDuckDbConnection(dbPath, { tryExpress: !isTauriEnv, allowWasm: true });
        setDuckDbConnectedPath(conn.path);
        setIsWasmMode(conn.wasm);
        setDuckDbError(null);
        setShowDuckDbSchemaPanel(true);
      } catch (err: any) {
        console.warn("DuckDB auto-reconnect error:", err);
        // сбой автопереподключения виден пользователю (раньше был только console.warn)
        setDuckDbError(t("Не удалось переподключиться к DuckDB: ") + (err?.message || String(err)));
        setIsDuckDbResultVisible(true);
      } finally {
        setIsDuckDbRunning(false);
      }
    };

    autoReconnect();
  }, []);

  // Remove import flag if present from previous reload
  useEffect(() => {
    sessionStorage.removeItem('sql_is_importing_session');
  }, []);

  const saveSessionToStorage = useCallback(async () => {
    // Prevent saving anything if session tabs have not loaded yet to avoid data loss
    if (!isTabsLoadedRef.current) {
      return;
    }
    // If we just imported local storage, do not overwrite the imported session on page reload/unload
    if (sessionStorage.getItem('sql_is_importing_session') === 'true') {
      return;
    }
    try {
      const { tabs, sql, ...restSessionData } = latestSessionRef.current;
      
      const sessionData = { 
        ...restSessionData
      };
      
      // Не сохранять пароль Clickhouse в локальное хранилище в целях безопасности
      if (sessionData.clickhouseConfig) {
        sessionData.clickhouseConfig = { ...sessionData.clickhouseConfig, key: '' };
      }
      
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));

      const tabsToSave = latestSessionRef.current.tabs
        .filter(t => t.id !== ACTION_MENU_TAB_ID)
        .map(t => 
          t.id === latestSessionRef.current.activeTabId ? { ...t, sql: sqlRef.current } : t
        );
      await saveSessionTabs(tabsToSave);

      // Workspace Synchronization Auto-Export
      if (isTauriEnvironment()) {
        const rawVis = localStorage.getItem('sql_visualizer_ui_visibility_v1') || localStorage.getItem('sql_visualizer_ui_visibility');
        let syncPath: string | null = null;
        if (rawVis) {
          try {
            syncPath = JSON.parse(rawVis).workspaceSyncPath || null;
          } catch (_) {}
        }
        if (syncPath) {
          const filePath = resolveWorkspaceSyncFilePath(syncPath);
          try {
            let shouldWrite = true;
            try {
              const existingContent = await tauriInvoke<string>('read_text_file', { path: filePath });
              if (existingContent) {
                const existingParsed = JSON.parse(existingContent);
                const lastSync = localStorage.getItem('sql_last_workspace_sync_time') || '';
                // Check if another instance has updated the file since our last sync
                if (lastSync && existingParsed?.exportedAt && Date.parse(existingParsed.exportedAt) > Date.parse(lastSync)) {
                  shouldWrite = false;
                }
              }
            } catch (_) {
              // File might not exist yet, safe to write
            }

            if (shouldWrite) {
              const bundle = await generateWorkspaceBundleObject();
              await tauriInvoke('write_text_file', {
                path: filePath,
                contents: JSON.stringify(bundle, null, 2)
              });
              localStorage.setItem('sql_last_workspace_sync_time', bundle.exportedAt);
            }
          } catch (err) {
            console.warn('Failed to auto-export workspace bundle:', err);
          }
        }
      }
    } catch (e) {
      console.error('Failed to save session to localStorage', e);
    }
  }, [activeEngine]);

  // Listen for explicit session save requests (e.g. before exporting workspace)
  useEffect(() => {
    const handleSaveNow = async (e: Event) => {
      await saveSessionToStorage();
      if (e instanceof CustomEvent && e.detail?.onComplete) {
        e.detail.onComplete();
      }
    };
    window.addEventListener('sql_save_session_now', handleSaveNow);
    return () => {
      window.removeEventListener('sql_save_session_now', handleSaveNow);
    };
  }, [saveSessionToStorage]);

  // Save session state ONLY on window close/unload, visibility hide, or every 20 minutes
  useEffect(() => {
    const handleUnload = () => {
      saveSessionToStorage();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveSessionToStorage();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('unload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Background interval: save session once every 10 minutes (10 * 60 * 1000 ms)
    const INTERVAL_10_MIN = 10 * 60 * 1000;
    const intervalId = setInterval(() => {
      saveSessionToStorage();
    }, INTERVAL_10_MIN);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('unload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [saveSessionToStorage]);


  const handleConnectToRecentClickhouse = async (cfg: ClickhouseConfig) => {
    setShowDuckDbConnMenu(false);
    if (duckDbConnectedPath || clickhouseConfig) {
      await handleDisconnectDuckDb();
    }
    setClickhouseConfig(cfg);
    setActiveEngine('clickhouse');
    setShowDuckDbSchemaPanel(true);
  };

  // ---- Подключение DuckDB (п. 3.7) ----
  // Состояние интерфейса (ClickHouse, движок, путь, результаты) меняется только после успешного подключения.
  // Если подключиться не удалось, прежнее подключение остаётся или открывается заново, а ошибка показывается.
  type DuckDbConn = { path: string; wasm: boolean };

  /** Закрывает подключение DuckDB в бэкенде, не меняя состояние интерфейса. Возвращает true, если это был WASM. */
  const closeDuckDbBackend = async (): Promise<boolean> => {
    if (isTauriEnv && !isWasmMode) {
      try {
        await tauriInvoke('disconnect_db');
      } catch (e) {
        console.error(e);
      }
    }
    if (isWasmMode) {
      await disconnectDuckDbWasm();
      return true;
    } else if (!isTauriEnv) {
      try {
        await fetchApiJson("/api/duckdb/disconnect", { method: "POST" });
      } catch (e) {
        console.error(e);
      }
    }
    return false;
  };

  /** Открывает подключение (Tauri → локальный сервер → WASM), не меняя состояние интерфейса; при неудаче бросает ошибку. */
  const openDuckDbConnection = async (
    dbPath: string,
    opts: { file?: File; tryExpress: boolean; allowWasm: boolean }
  ): Promise<DuckDbConn> => {
    let lastErr: unknown = null;

    if (isTauriEnv) {
      try {
        const path = await tauriInvoke<string>('connect_db', { path: dbPath, options: duckDbConfig });
        return { path: path || dbPath, wasm: false };
      } catch (tauriErr) {
        lastErr = tauriErr;
        console.warn("Tauri native connection failed:", tauriErr);
      }
    }

    if (opts.tryExpress) {
      try {
        const data = await fetchApiJson("/api/duckdb/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dbPath, config: duckDbConfig })
        });
        if (data && !data.error) {
          return { path: data.path || dbPath, wasm: false };
        }
        if (data?.error) lastErr = new Error(typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error)));
      } catch (expressErr) {
        lastErr = lastErr ?? expressErr;
      }
    }

    if (opts.allowWasm && !isTauriEnv) {
      if (opts.file) {
        const fileName = await connectDuckDbWasmFile(opts.file, duckDbConfig);
        return { path: fileName, wasm: true };
      }
      if (dbPath === ':memory:') {
        await connectDuckDbWasmMemory(duckDbConfig);
        return { path: ':memory:', wasm: true };
      }
    }

    throw lastErr ?? new Error(t("Не удалось подключиться к DuckDB"));
  };

  const resetConnectionResultsUi = () => {
    setDuckDbResults(null);
    setDuckDbSelectedCell(null);
    setDuckDbError(null);
    setIsDuckDbResultVisible(false);
    setIsDuckDbResultExpanded(false);
  };

  const connectDuckDb = async (
    dbPath: string,
    opts: { file?: File; tryExpress: boolean; allowWasm: boolean; errorPrefix: string }
  ) => {
    const previous: DuckDbConn | null = duckDbConnectedPath ? { path: duckDbConnectedPath, wasm: isWasmMode } : null;
    const prevState: ConnState<ClickhouseConfig> = {
      duckDbPath: duckDbConnectedPath,
      wasm: isWasmMode,
      clickhouse: clickhouseConfig,
      engine: activeEngine === 'clickhouse' ? 'clickhouse' : 'duckdb',
    };
    setIsDuckDbRunning(true);
    try {
      const result = await switchConnection<DuckDbConn>({
        previous,
        // в десктопе Rust заменяет старое соединение только при успехе; для того же файла старое нужно закрыть заранее (блокировка файла)
        openFirst: !!previous && isTauriEnv && !isWasmMode && previous.path !== dbPath,
        closeCurrent: async () => { await closeDuckDbBackend(); },
        open: () => openDuckDbConnection(dbPath, opts),
        reopen: async (prev) => {
          if (prev.wasm || prev.path === ':memory:') throw new Error('The previous connection cannot be restored');
          return openDuckDbConnection(prev.path, { tryExpress: opts.tryExpress, allowWasm: false });
        },
      });
      const next = stateAfterSwitch(prevState, result, (e: unknown) => opts.errorPrefix + ((e as any)?.message || String(e)));
      if (next.resetResults) resetConnectionResultsUi();
      setClickhouseConfig(next.state.clickhouse);
      setActiveEngine(next.state.engine);
      setDuckDbConnectedPath(next.state.duckDbPath);
      setIsWasmMode(next.state.wasm);
      if (result.ok) {
        setShowDuckDbSchemaPanel(true);
        setDuckDbError(null);
      } else {
        setDuckDbError(next.error);
        setIsDuckDbResultVisible(true);
      }
    } finally {
      setIsDuckDbRunning(false);
    }
  };

  const handleConnectToRecentDuckDb = async (dbPath: string) => {
    setShowDuckDbConnMenu(false);
    if (!isTauriEnv) return;
    await connectDuckDb(dbPath, { tryExpress: false, allowWasm: false, errorPrefix: t("Ошибка подключения к DuckDB: ") });
  };

  const handleConfigureDuckDb = async () => {
    setShowDuckDbConnMenu(false);
    if (isTauriEnv) {
      try {
        let openFn: any;
        if (typeof window !== 'undefined' && (window as any).__TAURI__?.dialog?.open) {
          openFn = (window as any).__TAURI__.dialog.open;
        } else {
          const dialog = await import('@tauri-apps/api/dialog');
          openFn = dialog.open;
        }
        const selected = await openFn({
          multiple: false,
          filters: [{ name: 'DuckDB', extensions: ['duckdb', 'db'] }]
        });

        if (selected && typeof selected === 'string') {
          await connectDuckDb(selected, { tryExpress: false, allowWasm: false, errorPrefix: t("Ошибка подключения к DuckDB: ") });
          return;
        }
        return;
      } catch (dialogErr) {
        console.warn("Tauri open dialog error, falling back to file input:", dialogErr);
      }
    }

    duckDbFileInputRef.current?.click();
  };

  const handleConnectInMemory = async () => {
    setShowDuckDbConnMenu(false);
    await connectDuckDb(':memory:', { tryExpress: !isTauriEnv, allowWasm: true, errorPrefix: t("Ошибка in-memory подключения DuckDB: ") });
  };

  const handleCreateDuckDbFile = async () => {
    setShowDuckDbConnMenu(false);
    if (isTauriEnv) {
      try {
        let saveFn: any;
        if (typeof window !== 'undefined' && (window as any).__TAURI__?.dialog?.save) {
          saveFn = (window as any).__TAURI__.dialog.save;
        } else {
          const dialog = await import('@tauri-apps/api/dialog');
          saveFn = dialog.save;
        }
        const selected = await saveFn({
          defaultPath: 'new_database.duckdb',
          filters: [{ name: 'DuckDB Database', extensions: ['duckdb', 'db'] }]
        });

        if (selected && typeof selected === 'string') {
          await connectDuckDb(selected, { tryExpress: false, allowWasm: false, errorPrefix: t("Ошибка создания файл базы данных DuckDB: ") });
        }
      } catch (dialogErr) {
        console.warn("Tauri save dialog error:", dialogErr);
      }
    } else {
      alert(t("Создание локального .duckdb файла на диске доступно в десктопном приложении."));
    }
  };

  const fetchApiJson = async (endpoint: string, options?: RequestInit) => {
    // List of target server URLs to attempt for local/desktop server calls
    const targetUrls = [
      endpoint,
      `http://127.0.0.1:48291${endpoint}`,
      `http://localhost:48291${endpoint}`,
      `http://127.0.0.1:3000${endpoint}`,
      `http://localhost:3000${endpoint}`,
    ];

    let lastError: Error | null = null;

    for (const url of targetUrls) {
      try {
        const res = await fetch(url, options);
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const text = await res.text();
          if (text.trim().startsWith("<")) {
            const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            throw new Error(`Server returned HTML (${res.status} ${res.statusText}): ${cleanText.slice(0, 300) || text.slice(0, 300)}`);
          }
          throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Request error (${res.status})`);
        }
        return data;
      } catch (err: any) {
        lastError = err;
        if (
          err.message &&
          !err.message.includes("Failed to fetch") &&
          !err.message.includes("NetworkError")
        ) {
          throw err;
        }
      }
    }

    throw new Error(
      lastError?.message ||
        t("Бэкенд-сервер недоступен. Запустите локальный сервер (node server.ts).")
    );
  };

  const isTauriEnv = typeof window !== 'undefined' && Boolean(
    (window as any).__TAURI__ ||
    (window as any).__TAURI_METADATA__ ||
    (window as any).__TAURI_IPC__
  );

  const tauriInvoke = async <T,>(cmd: string, args?: Record<string, any>): Promise<T> => {
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
      return (window as any).__TAURI__.invoke(cmd, args);
    }
    const { invoke } = await import('@tauri-apps/api/tauri');
    return invoke<T>(cmd, args);
  };

  // Дерево файлов: Tauri — реальная ФС (Rust list_dir), dev и WASM/Android — виртуальная ФС DuckDB-WASM.
  const fileTreeProvider = useMemo(
    () => isTauriEnv ? createTauriProvider(tauriInvoke, detectPlatform(navigator.userAgent)) : createVfsProvider(getRegisteredWasmFiles),
    [isTauriEnv] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (!isTauriEnv) return;
    (async () => {
      try {
        const { homeDir } = await import('@tauri-apps/api/path');
        setHomeDirPath(await homeDir());
      } catch { /* домашняя папка недоступна — корень останется пустым */ }
    })();
  }, [isTauriEnv]);
  const fileTreeRoot = isTauriEnv
    ? pickFileTreeRoot({ configured: uiVisibility.fileTreeRoot, dbPath: duckDbConnectedPath, home: homeDirPath })
    : '';

  // Двойной клик по текстовому файлу: тот же путь, что у «Открыть файл» (дедуп вкладок, лимит размера).
  const handleOpenTreeFile = async (entry: FileEntry) => {
    try {
      const { readBinaryFile } = await import('@tauri-apps/api/fs');
      const bytes = await readBinaryFile(entry.path);
      const file = new File([bytes], entry.name, { type: 'text/plain' });
      Object.defineProperty(file, 'path', { value: entry.path });
      handleOpenFile({ target: { files: [file], value: '' } } as any);
    } catch (e) {
      console.warn('Open file from tree error:', e);
    }
  };
  // Файл или папка переименованы (newPath) либо удалены в корзину (null): вкладки, открытые из них, следуют за путём.
  // Удалённый файл остаётся во вкладке как несохранённый (Ctrl+S предложит «Сохранить как»).
  const handleTreePathChanged = (oldPath: string, newPath: string | null) => {
    setTabs(prev => {
      let changed = false;
      const next = prev.map(tab => {
        if (!tab.filePath) return tab;
        if (newPath === null) {
          if (!isSameOrInside(tab.filePath, oldPath)) return tab;
          changed = true;
          return { ...tab, filePath: undefined };
        }
        const moved = remapPath(tab.filePath, oldPath, newPath);
        if (moved === null) return tab;
        changed = true;
        const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
        return { ...tab, filePath: moved, title: tab.title === baseName(tab.filePath) ? baseName(moved) : tab.title };
      });
      return changed ? next : prev;
    });
  };
  const handleOpenTreeExternal = async (entry: FileEntry) => {
    try {
      await tauriInvoke('open_path', { path: entry.path });
    } catch (e) {
      console.warn('open_path error:', e);
    }
  };

  const duckDbConfig = useMemo(() => ({
    allowUnsignedExtensions: uiVisibility.duckDbAllowUnsignedExtensions ?? false,
    memoryLimit: uiVisibility.duckDbMemoryLimit || '8GB',
    tempDirectory: uiVisibility.duckDbTempDirectory || './tmp',
    extensionDirectory: uiVisibility.duckDbExtensionDirectory || './extensions',
    threads: uiVisibility.duckDbThreads ?? 0,
    initSql: uiVisibility.duckDbInitSql ?? '',
  }), [
    uiVisibility.duckDbAllowUnsignedExtensions,
    uiVisibility.duckDbMemoryLimit,
    uiVisibility.duckDbTempDirectory,
    uiVisibility.duckDbExtensionDirectory,
    uiVisibility.duckDbThreads,
    uiVisibility.duckDbInitSql,
  ]);

  const handleDuckDbFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // @ts-ignore - access non-standard path property for desktop environments
      const dbPath = file.path || file.name;
      await connectDuckDb(dbPath, { file, tryExpress: !isTauriEnv, allowWasm: true, errorPrefix: t("Ошибка подключения к DB: ") });
    }
  };

  const fetchDuckDbSchema = async (forceRefresh: boolean = false) => {
    if (!duckDbConnectedPath && !clickhouseConfig && !isWasmMode) return;
    setIsSchemaLoading(true);

    if (forceRefresh) {
      setTableColumnsMap({});
      tableColumnsMapRef.current = {};
      setExpandedSchemaNodes(prev => {
        const next: Record<string, boolean> = {};
        Object.keys(prev).forEach(key => {
          if (!key.startsWith('tbl-') && prev[key]) {
            next[key] = true;
          }
        });
        return next;
      });
    }

    const isCH = activeEngine === 'clickhouse' || (!duckDbConnectedPath && !isWasmMode && clickhouseConfig);
    const dbKey = buildSchemaDbKey({ engine: isCH && clickhouseConfig ? 'clickhouse' : 'duckdb', clickhouse: clickhouseConfig, duckDbPath: duckDbConnectedPath, isWasm: isWasmMode });

    try {
      if (isCH) {
        if (!clickhouseConfig) return;
        const schemaQuery = "SELECT database AS database_name, database AS schema_name, name AS table_name, CASE WHEN engine LIKE '%MaterializedView%' THEN 'Material Views' WHEN engine LIKE '%View%' THEN 'Views' WHEN engine = 'Dictionary' OR engine LIKE '%Dictionary%' THEN 'Dictionaries' ELSE 'Tables' END AS table_type, total_bytes AS table_bytes FROM system.tables ORDER BY database, table_type, name FORMAT JSON";
        let data: any = null;
        if (isTauriEnvironment()) {
          try {
            data = await executeClickhouseQueryTauri(clickhouseConfig, schemaQuery);
          } catch (e: any) {
            console.warn("Tauri direct Clickhouse schema fetch failed:", e);
          }
        } else if (isCapacitorEnvironment()) {
          try {
            data = await executeClickhouseQueryCapacitor(clickhouseConfig, schemaQuery);
          } catch (e: any) {
            console.warn("Capacitor direct Clickhouse schema fetch failed:", e);
          }
        } else {
          try {
            data = await fetchApiJson('/api/clickhouse/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...clickhouseConfig,
                query: schemaQuery,
              }),
            });
          } catch {
            const url = getClickhouseUrl(clickhouseConfig);
            const headers = getClickhouseHeaders(clickhouseConfig);
            const chRes = await fetch(url, {
              method: 'POST',
              headers,
              body: schemaQuery,
            });
            const text = await chRes.text();
            if (chRes.ok) {
              try {
                const parsed = JSON.parse(text);
                data = { success: true, data: parsed.data || parsed };
              } catch {
                // ignore
              }
            }
          }
        }
        if (data && data.data && Array.isArray(data.data)) {
          setDuckDbSchema(data.data);
          saveSchemaCache({
            dbKey,
            timestamp: Date.now(),
            tables: data.data,
            tableColumnsMap: tableColumnsMapRef.current || {},
          });
        }
        return;
      }

      // DuckDB schema fetching (Tables, Views, Macros)
      let tables: any[] = [];
      const tablesAndViewsQuery = "SELECT t.database_name, t.schema_name, t.table_name, 'Tables' as table_type, t.estimated_size as estimated_rows FROM duckdb_tables() t UNION ALL SELECT v.database_name, v.schema_name, v.view_name as table_name, 'Views' as table_type, NULL as estimated_rows FROM duckdb_views() v ORDER BY database_name, schema_name, table_type, table_name";

      try {
        if (isTauriEnv && !isWasmMode) {
          try {
            const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', {
              sql: tablesAndViewsQuery
            });
            tables = (res?.rows || []).map(row => {
              const obj: Record<string, any> = {};
              (res.columns || []).forEach((col, idx) => {
                obj[col] = row[idx];
              });
              return obj;
            });
          } catch (tauriErr) {
            console.warn("Tauri schema query failed, trying backend/wasm:", tauriErr);
          }
        } else if (isWasmMode) {
          tables = await queryDuckDbWasm(tablesAndViewsQuery);
        } else {
          const data = await fetchApiJson("/api/duckdb/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: tablesAndViewsQuery })
          });
          if (data.data) {
            tables = data.data;
          }
        }
      } catch (e: any) {
        console.warn("Failed to fetch duckdb tables and views:", e?.message || e);
      }

      // Fallback 1: information_schema.tables if primary query produced no tables
      if (!tables || tables.length === 0) {
        const fallbackQuery = "SELECT table_catalog as database_name, table_schema as schema_name, table_name, CASE WHEN table_type = 'VIEW' THEN 'Views' ELSE 'Tables' END as table_type FROM information_schema.tables ORDER BY table_catalog, table_schema, table_type, table_name";
        try {
          if (isWasmMode) {
            tables = await queryDuckDbWasm(fallbackQuery);
          } else if (isTauriEnv && !isWasmMode) {
            const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: fallbackQuery });
            tables = (res?.rows || []).map(row => {
              const obj: Record<string, any> = {};
              (res.columns || []).forEach((col, idx) => { obj[col] = row[idx]; });
              return obj;
            });
          } else {
            const data = await fetchApiJson("/api/duckdb/query", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: fallbackQuery })
            });
            if (data.data) tables = data.data;
          }
        } catch (e2) {
          console.warn("Fallback DuckDB schema query failed:", e2);
        }
      }

      // Fallback 2: SHOW ALL TABLES if still empty
      if (!tables || tables.length === 0) {
        try {
          let showRows: any[] = [];
          if (isWasmMode) {
            showRows = await queryDuckDbWasm("SHOW ALL TABLES;");
          } else if (isTauriEnv && !isWasmMode) {
            const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: "SHOW ALL TABLES;" });
            showRows = (res?.rows || []).map(row => {
              const obj: Record<string, any> = {};
              (res.columns || []).forEach((col, idx) => { obj[col] = row[idx]; });
              return obj;
            });
          } else {
            const data = await fetchApiJson("/api/duckdb/query", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: "SHOW ALL TABLES;" })
            });
            if (data.data) showRows = data.data;
          }

          if (showRows && showRows.length > 0) {
            tables = showRows.map(r => ({
              database_name: r.database || r.database_name || 'memory',
              schema_name: r.schema || r.schema_name || 'main',
              table_name: r.name || r.table_name || '',
              table_type: r.temporary ? 'Temporary' : 'Tables'
            })).filter(r => r.table_name);
          }
        } catch (e3) {
          console.warn("SHOW ALL TABLES failed:", e3);
        }
      }

      // Fetch DuckDB Macros
      try {
        const macrosQuery = "SELECT DISTINCT f.database_name, f.schema_name, f.function_name as table_name, 'Macros' as table_type, NULL as estimated_rows FROM duckdb_functions() f WHERE f.function_type LIKE '%macro%' ORDER BY database_name, schema_name, table_name";
        let macroRows: any[] = [];
        if (isTauriEnv && !isWasmMode) {
          const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: macrosQuery });
          macroRows = (res?.rows || []).map(row => {
            const obj: Record<string, any> = {};
            (res.columns || []).forEach((col, idx) => {
              obj[col] = row[idx];
            });
            return obj;
          });
        } else if (isWasmMode) {
          macroRows = await queryDuckDbWasm(macrosQuery);
        } else {
          const data = await fetchApiJson("/api/duckdb/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: macrosQuery })
          });
          if (data.data) {
            macroRows = data.data;
          }
        }

        if (macroRows && macroRows.length > 0) {
          tables = [...tables, ...macroRows];
        }
      } catch (macroErr) {
        console.warn("Could not fetch DuckDB macros:", macroErr);
      }

      if (tables) {
        setDuckDbSchema(tables);
        saveSchemaCache({
          dbKey,
          timestamp: Date.now(),
          tables,
          tableColumnsMap: tableColumnsMapRef.current || {},
        });
      }
    } finally {
      setIsSchemaLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadSchema = async () => {
      if (!duckDbConnectedPath && !clickhouseConfig && !isWasmMode) {
        setDuckDbSchema(null);
        setTableColumnsMap({});
        lastConnectedDbKeyRef.current = null;
        return;
      }

      if (showDuckDbSchemaPanel) {
        const isCH = activeEngine === 'clickhouse' || (!duckDbConnectedPath && !isWasmMode && clickhouseConfig);
        const dbKey = buildSchemaDbKey({ engine: isCH && clickhouseConfig ? 'clickhouse' : 'duckdb', clickhouse: clickhouseConfig, duckDbPath: duckDbConnectedPath, isWasm: isWasmMode });

        // Если схема уже загружена в память для этой же БД, не делаем повторный запрос при разворачивании панели
        if (dbKey === lastConnectedDbKeyRef.current && duckDbSchema !== null) {
          return;
        }

        lastConnectedDbKeyRef.current = dbKey;

        const isInMemory = !isCH && duckDbConnectedPath === ':memory:';
        const cached = await getSchemaCache(dbKey);
        if (cached && cached.tables && cached.tables.length > 0 && !isInMemory) {
          if (isMounted) {
            setDuckDbSchema(cached.tables);
            if (cached.tableColumnsMap) {
              setTableColumnsMap(cached.tableColumnsMap);
            }
          }
          // Кэш схемы считается устаревшим через 5 дней. Для :memory: кэш не читается вовсе (isInMemory выше): схема всегда запрашивается заново.
          const STALE_MS = 5 * 24 * 60 * 60 * 1000;
          const isStale = (Date.now() - cached.timestamp) > STALE_MS;
          if (isStale) {
            fetchDuckDbSchema(true);
          }
        } else {
          fetchDuckDbSchema(true);
        }
      }
    };

    loadSchema();

    return () => {
      isMounted = false;
    };
  }, [duckDbConnectedPath, clickhouseConfig, activeEngine, showDuckDbSchemaPanel, isWasmMode, duckDbSchema]);

  const handleDisconnectDuckDb = async () => {
    setIsDuckDbRunning(true);
    try {
      const wasWasm = await closeDuckDbBackend();
      if (wasWasm) setIsWasmMode(false);
    } finally {
      setDuckDbConnectedPath(null);
      resetConnectionResultsUi();
      setIsDuckDbRunning(false);
    }
  };

  useEffect(() => {
    if (!uiVisibility.showDuckDbConfig && duckDbConnectedPath) {
      handleDisconnectDuckDb();
    }
    if (!uiVisibility.showClickhouseConfig && clickhouseConfig) {
      setClickhouseConfig(null);
      if (activeEngine === 'clickhouse') {
        setActiveEngine('duckdb');
      }
    }
    if (!uiVisibility.showDuckDbConfig && !uiVisibility.showClickhouseConfig) {
      setShowDuckDbSchemaPanel(false);
    }
  }, [uiVisibility.showDuckDbConfig, uiVisibility.showClickhouseConfig, duckDbConnectedPath, clickhouseConfig, activeEngine]);

  // Учёт запусков: у каждого запуска свой AbortController; отменённый запуск считается устаревшим и не пишет результат (п. 3.3)
  const runTrackerRef = useRef(createRunTracker());
  // Следующий запуск инициирован кнопками листания страниц результата (п. 3.5)
  const isPagingRunRef = useRef<boolean>(false);
  // Ошибка автоэкспорта в Excel (@excel_save) — отдельно от ошибки запроса, чтобы не подменять таблицу результата (п. 3.5)
  // Режим, в котором скрипт запущен на странице 1 (по вкладкам): страницы ≥ 2 не должны заново выполнять подготовительные операторы (п. 3.1)
  const executionModeByTabRef = useRef<Record<string, ExecutionMode | undefined>>({});

  const handleCancelDuckDbQuery = () => {
    runTrackerRef.current.cancelAll();
    
    // Also cancel Clickhouse Tauri query if running
    if (isTauriEnvironment() && activeEngine === 'clickhouse') {
      cancelClickhouseQueryTauri().catch(console.error);
    }

    // Cancel DuckDB Tauri query if running natively
    if (isTauriEnv) {
      tauriInvoke('cancel_duckdb_query').catch(() => {
        tauriInvoke('cancel_query').catch(() => {});
      });
    }
    
    setIsDuckDbRunning(false);
    // ошибка записывается в состояние вкладки (и в хранилище), а не только на экран
    updateEngineState(activeTabIdRef.current, lastExecutedSql || '', duckDbPage, { error: t("Запрос отменен пользователем") });
  };

  const handleExecuteDuckDb = async () => {
    // If query is already running on THIS tab, clicking Execute acts as CANCEL / ABORT
    if (isDuckDbRunning) {
      handleCancelDuckDbQuery();
      return;
    }
    // If ANY query is running, don't start a new one
    if (isAnyQueryRunning) {
      return;
    }

    if (!duckDbConnectedPath && !clickhouseConfig) {
      return;
    }

    handleExecuteDuckDbQuery();
  };

  const maybeAutoSelectFirstCell = async (results: any[], query: string) => {
    if (results && results.length > 0 && /^\s*(SHOW\b|SELECT\s+[\s\S]+?\bFROM\s+duckdb_(tables|views|functions)\b)/i.test(query.trim())) {
      const firstRow = results[0];
      if (firstRow && typeof firstRow === 'object') {
        const keys = Object.keys(firstRow);
        if (keys.length > 0) {
          const ddlKey = keys.find(k => /create|ddl|sql|macro_definition/i.test(k)) || keys[0];
          const val = firstRow[ddlKey];
          let contentStr = val === null || val === undefined ? 'null' : String(val);
          if (contentStr !== 'null' && !contentStr.includes('\n')) {
            try {
              const fmtSettings = getSavedFormatterSettings();
              const { format: formatSql } = await import('sql-formatter');
              contentStr = formatSql(contentStr, {
                language: 'sql',
                keywordCase: fmtSettings.keywordCase,
                tabWidth: fmtSettings.tabWidth,
                useTabs: fmtSettings.useTabs,
                expressionWidth: 20,
                denseOperators: fmtSettings.denseOperators,
              });
            } catch (e) {
              console.warn('SQL formatting in DDL failed:', e);
            }
          }
          setDuckDbSelectedCell({
            title: t('Значение'),
            content: contentStr,
          });
          setIsCellZoomed(true);
          setIsCellSqlHighlighted(true);
        }
      }
    }
  };


  const updateEngineState = (
    originTabId: string, 
    queryToExec: string, 
    page: number, 
    updates: { 
      results?: any[] | null, 
      error?: string | null, 
      duration?: string | null, 
      colTypes?: any,
      columns?: string[] | null
    },
    opts?: { skipAutoExport?: boolean }
  ) => {
    if (activeTabIdRef.current === originTabId) {
      if (updates.results !== undefined) {
        setDuckDbResults(updates.results);
        setResultColumns(updates.columns ?? null);
        if (updates.results && Array.isArray(updates.results) && updates.results.length > 0) {
          maybeAutoSelectFirstCell(updates.results, queryToExec);

          // Autonomous Excel export (only in Tauri, only for a real `@excel_save: path` directive in a block comment;
          // not when paging through an already exported result, п. 3.5)
          if (isTauriEnv && page === 1 && !opts?.skipAutoExport && hasExcelSaveDirective(queryToExec)) {
            (async () => {
              try {
                await exportToExcel({
                  data: updates.results!,
                  columns: updates.columns,
                  columnTypes: updates.colTypes || {},
                  sqlQuery: queryToExec,
                  settings: getSavedExcelSettings(),
                });
              } catch (autoErr: any) {
                console.warn("Autonomous Excel export failed:", autoErr);
              }
            })();
          }
        }
      }
      if (updates.error !== undefined) setDuckDbError(updates.error);
      if (updates.duration !== undefined) setQueryExecutionDuration(updates.duration);
      if (updates.colTypes !== undefined) setResultColumnTypes(updates.colTypes);
      
      if (updates.results !== undefined || updates.error !== undefined) {
        if (updates.results !== null && updates.error !== null) {
          setIsDuckDbResultVisible(true);
        }
      }
    } else {
      if (!shouldPersistTabResult(updates)) return;
      getTabResult(originTabId).then(existing => {
        const newData = mergeTabResult(existing, updates, { queryToExec, page });
        saveTabResult(originTabId, newData).catch(console.error);

        // In case the user switched back to this tab while we were fetching from IDB
        if (activeTabIdRef.current === originTabId) {
          setDuckDbResults(newData.duckDbResults);
          setDuckDbError(newData.duckDbError);
          setQueryExecutionDuration(newData.queryExecutionDuration);
          setResultColumnTypes(newData.resultColumnTypes || {});
          setResultColumns(newData.resultColumns ?? null);
          setIsDuckDbResultVisible(newData.isDuckDbResultVisible);
        }
      }).catch(console.error);
    }
  };

  const executeDuckDbQueryWithPagination = async (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean, executionMode?: 'sequential' | 'parallel', targetTabId?: string) => {
    const isPagingRun = isPagingRunRef.current; // запуск из кнопок листания: автоэкспорт Excel не повторяется
    isPagingRunRef.current = false;
    const originTabId = targetTabId || activeTabId;
    if (!duckDbConnectedPath) {
      return;
    }

    // режим запуска: на странице ≥ 2 берётся тот, в котором скрипт был запущен на странице 1
    const runMode: ExecutionMode | undefined = executionMode ?? (page > 1 ? executionModeByTabRef.current[originTabId] : undefined);
    // страницу ≥ 2 у скрипта, последний оператор которого не листается, не выполняем (иначе повторился бы INSERT/CREATE) — до сброса результата
    if (page > 1 && buildPagedSql(queryToExec, { page, pageSize: pageSizeToUse ?? effectiveMaxRows, dialect: 'duckdb', mode: runMode }).skip) {
      return;
    }
    if (page === 1 && !isQuickAction) {
      executionModeByTabRef.current[originTabId] = executionMode;
    }

    if (!isQuickAction) {
      setLastExecutedSql(queryToExec);
      setTabs(prev => prev.map(t => t.id === originTabId ? { ...t, lastExecutedSql: queryToExec } : t));
    }
    setDuckDbPage(page);

    const run = runTrackerRef.current.begin(originTabId);
    // устаревший (отменённый) запуск не меняет ни результат вкладки, ни флаг «выполняется»
    const updateRun = (u: Parameters<typeof updateEngineState>[3]) => {
      // тексты ошибок переводятся по точному совпадению (например, ошибка лимита строк из Rust/Express)
      if (run.isActive()) updateEngineState(originTabId, queryToExec, page, typeof u.error === 'string' ? { ...u, error: t(u.error) } : u, { skipAutoExport: isPagingRun });
    };
    const finishRun = () => {
      const info = run.finish();
      if (info.wasActive && info.remaining === 0) setIsDuckDbRunning(false);
    };
    const queryStartTime = performance.now();

    try {
      setIsDuckDbRunning(true);
      setIsDuckDbResultVisible(true);
      updateRun({ error: null });
      updateRun({ results: null, duration: null });
      setSummarizeResults(null);
      setDuckDbSelectedCell(null);

      let finalQuery = queryToExec.trim();
      const tabContextSql = (originTabId === activeTabId ? sqlRef.current : tabs.find(t => t.id === originTabId)?.sql) || sqlRef.current;
      finalQuery = replaceVariablesInSql(finalQuery, tabContextSql);
      try {
        finalQuery = replaceSecretsInSql(finalQuery);
      } catch (vaultErr: any) {
        updateRun({ error: vaultErr.message || String(vaultErr) });
        finishRun();
        setIsDuckDbResultVisible(true);
        return;
      }
      
      const maxRows = pageSizeToUse ?? effectiveMaxRows;

      if (runMode === 'parallel') {
        const statements = splitStatements(finalQuery);
        if (statements.length === 0) {
          finishRun();
          return;
        }
        const results = await Promise.all(statements.map(async (stmt) => {
          try {
            if (isTauriEnv && !isWasmMode) {
              await tauriInvoke('execute_query', { sql: stmt });
            } else if (isWasmMode) {
              await queryDuckDbWasm(stmt);
            } else {
              const res = await fetchApiJson("/api/duckdb/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: stmt }),
                signal: run.signal
              });
              if (res.error) throw new Error(res.error);
            }
            return { Query: stmt.length > 100 ? stmt.substring(0, 100) + '...' : stmt, Status: 'OK' };
          } catch (e: any) {
            return { Query: stmt.length > 100 ? stmt.substring(0, 100) + '...' : stmt, Status: `Error: ${e.message || String(e)}` };
          }
        }));
        updateRun({ results: results, duration: ((performance.now() - queryStartTime) / 1000).toFixed(2) });
        finishRun();
        return;
      }

      if (runMode === 'sequential' && splitStatements(finalQuery).length === 0) {
        finishRun();
        return;
      }

      // Запрос страницы: LIMIT/OFFSET у последнего оператора, подготовительные операторы — только на странице 1 (п. 3.1)
      const paged = buildPagedSql(finalQuery, { page, pageSize: maxRows, dialect: 'duckdb', mode: runMode });
      if (paged.skip) {
        finishRun();
        return;
      }
      for (const stmt of paged.setup) {
        if (run.signal.aborted) throw new Error(t("Запрос отменен пользователем"));
        if (isTauriEnv && !isWasmMode) {
          await tauriInvoke('execute_query', { sql: stmt });
        } else if (isWasmMode) {
          await queryDuckDbWasm(stmt);
        } else {
          const res = await fetchApiJson("/api/duckdb/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: stmt }),
            signal: run.signal
          });
          if (res.error) throw new Error(res.error);
        }
      }
      const queryWithLimit = paged.main;
      const cleanSqlHead = (runMode === 'sequential' ? paged.main : finalQuery)
        .replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/g, '')
        .trim();

      if (isTauriEnv && !isWasmMode) {
        try {
          const res = await tauriInvoke<{ columns: string[]; column_types?: string[]; rows: any[][] }>('execute_query', {
            sql: queryWithLimit
          });
          if (run.signal.aborted) throw new Error(t("Запрос отменен пользователем"));
          // уникальные имена столбцов + отдельный порядок (п. 3.2): дубли `a, a` и числовые имена не теряются
          const { rows: parsed, columns: parsedColumns } = rowsFromColumns(res?.columns || [], res?.rows || []);
          
          let finalColTypes = {};
          if (res?.columns && res?.column_types) {
            const typesDict: Record<string, string> = {};
            parsedColumns.forEach((col, idx) => {
              typesDict[col] = res.column_types![idx] || 'UNKNOWN';
            });
            finalColTypes = typesDict;
          }
          updateRun({ results: parsed, duration: ((performance.now() - queryStartTime) / 1000).toFixed(2), colTypes: finalColTypes, columns: parsedColumns });
  
          
                    if ((uiVisibility.autoUpdateSchema ?? true) && /^\s*(CREATE|DROP|ATTACH|DETACH|RENAME)\b/i.test(cleanSqlHead)) {
            fetchDuckDbSchema(true);
          }
        } catch (tauriErr: any) {
          if (run.signal.aborted) throw new Error(t("Запрос отменен пользователем"));
          let errMsg = typeof tauriErr === 'string' ? tauriErr : (tauriErr?.message || String(tauriErr));
          if (errMsg.includes("invalid escaped character") || errMsg.includes("trailing escape")) {
            errMsg += t("Подсказка пути");
          }
          updateRun({ error: errMsg });
        }
      } else if (isWasmMode) {
        const rows = await queryDuckDbWasm(queryWithLimit);
        if (run.signal.aborted) throw new Error(t("Запрос отменен пользователем"));
        const finalColTypes = (rows as any).__columnTypes ? (rows as any).__columnTypes : {};
        updateRun({ results: rows, duration: ((performance.now() - queryStartTime) / 1000).toFixed(2), colTypes: finalColTypes, columns: (rows as any).__columns ?? null });
                if ((uiVisibility.autoUpdateSchema ?? true) && /^\s*(CREATE|DROP|ATTACH|DETACH|RENAME)\b/i.test(cleanSqlHead)) {
          fetchDuckDbSchema(true);
        }
      } else {
        const data = await fetchApiJson("/api/duckdb/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryWithLimit }),
          signal: run.signal
        });
        
        if (data.error) {
          updateRun({ error: data.error });
        } else {
          const res = data.data || [];
          
          let finalColTypes = {};
          if (data.meta && Array.isArray(data.meta)) {
            const typesDict: Record<string, string> = {};
            data.meta.forEach((col: any) => {
              if (col.name && col.type) {
                typesDict[col.name] = col.type;
              }
            });
            finalColTypes = typesDict;
          }
          updateRun({ results: res, duration: ((performance.now() - queryStartTime) / 1000).toFixed(2), colTypes: finalColTypes, columns: columnsFromMeta(data.meta) });
  
          
                    if ((uiVisibility.autoUpdateSchema ?? true) && /^\s*(CREATE|DROP|ATTACH|DETACH|RENAME)\b/i.test(cleanSqlHead)) {
            fetchDuckDbSchema(true);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || run.signal.aborted) {
        updateRun({ error: t("Запрос отменен пользователем") });
      } else {
        let errMsg = err.message || t("Ошибка выполнения запроса");
        if (errMsg.includes("invalid escaped character") || errMsg.includes("trailing escape")) {
          errMsg += t("Подсказка пути");
        }
        updateRun({ error: errMsg });
      }
    } finally {
      finishRun();
    }
  };

  const executeClickhouseQueryWithPagination = async (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean, executionMode?: 'sequential' | 'parallel', targetTabId?: string) => {
    const isPagingRun = isPagingRunRef.current;
    isPagingRunRef.current = false;
    const originTabId = targetTabId || activeTabId;
    if (!clickhouseConfig) {
      return;
    }

    // режим запуска и пропуск страницы ≥ 2 без листаемого запроса — как в executeDuckDbQueryWithPagination (п. 3.1)
    const runMode: ExecutionMode | undefined = executionMode ?? (page > 1 ? executionModeByTabRef.current[originTabId] : undefined);
    if (page > 1 && buildPagedSql(queryToExec, { page, pageSize: pageSizeToUse ?? effectiveMaxRows, dialect: 'clickhouse', mode: runMode }).skip) {
      return;
    }
    if (page === 1 && !isQuickAction) {
      executionModeByTabRef.current[originTabId] = executionMode;
    }

    if (!isQuickAction) {
      setLastExecutedSql(queryToExec);
      setTabs(prev => prev.map(t => t.id === originTabId ? { ...t, lastExecutedSql: queryToExec } : t));
    }
    setDuckDbPage(page);

    const run = runTrackerRef.current.begin(originTabId);
    // устаревший (отменённый) запуск не меняет ни результат вкладки, ни флаг «выполняется»
    const updateRun = (u: Parameters<typeof updateEngineState>[3]) => {
      // тексты ошибок переводятся по точному совпадению (например, ошибка лимита строк из Rust/Express)
      if (run.isActive()) updateEngineState(originTabId, queryToExec, page, typeof u.error === 'string' ? { ...u, error: t(u.error) } : u, { skipAutoExport: isPagingRun });
    };
    const finishRun = () => {
      const info = run.finish();
      if (info.wasActive && info.remaining === 0) setIsDuckDbRunning(false);
    };
    const queryStartTime = performance.now();

    try {
      setIsDuckDbRunning(true);
      setIsDuckDbResultVisible(true);
      updateRun({ error: null });
      updateRun({ results: null, duration: null });
      setSummarizeResults(null);
      setDuckDbSelectedCell(null);
      
      let finalQuery = queryToExec.trim();
      const tabContextSql = (originTabId === activeTabId ? sqlRef.current : tabs.find(t => t.id === originTabId)?.sql) || sqlRef.current;
      finalQuery = replaceVariablesInSql(finalQuery, tabContextSql);
      try {
        finalQuery = replaceSecretsInSql(finalQuery);
      } catch (vaultErr: any) {
        updateRun({ error: vaultErr.message || String(vaultErr) });
        finishRun();
        setIsDuckDbResultVisible(true);
        return;
      }
      
      const maxRows = pageSizeToUse ?? effectiveMaxRows;

      if (runMode === 'parallel') {
        const statements = splitStatements(finalQuery);
        if (statements.length === 0) {
          finishRun();
          return;
        }
        const results = await Promise.all(statements.map(async (stmt) => {
          try {
            if (isTauriEnvironment()) {
              await executeClickhouseQueryTauri(clickhouseConfig, stmt);
            } else if (isCapacitorEnvironment()) {
              await executeClickhouseQueryCapacitor(clickhouseConfig, stmt);
            } else {
              const res = await fetchApiJson('/api/clickhouse/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...clickhouseConfig, query: stmt }),
                signal: run.signal
              });
              if (res.error) throw new Error(res.error);
            }
            return { Query: stmt.length > 100 ? stmt.substring(0, 100) + '...' : stmt, Status: 'OK' };
          } catch (e: any) {
            return { Query: stmt.length > 100 ? stmt.substring(0, 100) + '...' : stmt, Status: `Error: ${e.message || String(e)}` };
          }
        }));
        updateRun({ results: results, duration: ((performance.now() - queryStartTime) / 1000).toFixed(2) });
        finishRun();
        return;
      }

      if (runMode === 'sequential' && splitStatements(finalQuery).length === 0) {
        finishRun();
        return;
      }

      // Запрос страницы: LIMIT перед SETTINGS/FORMAT, подготовительные операторы — только на странице 1 (п. 3.1)
      const paged = buildPagedSql(finalQuery, { page, pageSize: maxRows, dialect: 'clickhouse', mode: runMode });
      if (paged.skip) {
        finishRun();
        return;
      }
      for (const stmt of paged.setup) {
        if (run.signal.aborted) throw new Error(t("Запрос отменен пользователем"));
        if (isTauriEnvironment()) {
          await executeClickhouseQueryTauri(clickhouseConfig, stmt);
        } else if (isCapacitorEnvironment()) {
          await executeClickhouseQueryCapacitor(clickhouseConfig, stmt);
        } else {
          const res = await fetchApiJson('/api/clickhouse/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...clickhouseConfig, query: stmt }),
            signal: run.signal
          });
          if (res.error) throw new Error(res.error);
        }
      }

      const cleanSqlHead = (runMode === 'sequential' ? paged.main : finalQuery)
        .replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/g, '')
        .trim();

      // Результат COPY записывается в исходную вкладку через updateEngineState (п. 3.4): раньше setDuckDbResults менял экран
      // активной вкладки, а в хранилище вкладки результат не попадал
      const finishCopy = (input: CopyResultInput) => {
        const rows = copyResultRows(input);
        updateRun({ results: rows, duration: ((performance.now() - queryStartTime) / 1000).toFixed(2), colTypes: {}, columns: Object.keys(rows[0]) });
      };

      // Check for COPY (...) TO / FROM
      const copyCmd = parseClickhouseCopy(cleanSqlHead);
      if (copyCmd) {
        if (copyCmd.type === 'COPY_TO') {
          if (isTauriEnvironment()) {
            try {
              const res = await executeClickhouseCopyToTauri(clickhouseConfig, copyCmd.innerSql, copyCmd.filePath);
              finishCopy({ kind: 'TO', filePath: copyCmd.filePath, message: res.message, bytes: res.bytes });
            } catch (err: any) {
              updateRun({ error: err.message || String(err) });
            }
          } else if (isCapacitorEnvironment()) {
            try {
              const res = await executeClickhouseCopyToCapacitor(clickhouseConfig, copyCmd.innerSql, copyCmd.filePath);
              finishCopy({ kind: 'TO', filePath: copyCmd.filePath, message: res.message, bytes: res.bytes });
            } catch (err: any) {
              updateRun({ error: err.message || String(err) });
            }
          } else {
            const data = await fetchApiJson('/api/clickhouse/copy-to', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...clickhouseConfig,
                innerSql: copyCmd.innerSql,
                filePath: copyCmd.filePath,
              }),
              signal: run.signal,
            });

            if (data.error) {
              updateRun({ error: data.error });
            } else {
              finishCopy({ kind: 'TO', filePath: copyCmd.filePath, message: data.message || `File saved (${data.bytes || 0} bytes)` });
            }
          }
        } else if (copyCmd.type === 'COPY_FROM') {
          if (isTauriEnvironment()) {
            try {
              const res = await executeClickhouseCopyFromTauri(clickhouseConfig, copyCmd.innerSql, copyCmd.filePath);
              finishCopy({ kind: 'FROM', filePath: copyCmd.filePath, message: res.message, response: res.response });
            } catch (err: any) {
              updateRun({ error: err.message || String(err) });
            }
          } else if (isCapacitorEnvironment()) {
            updateRun({
              error: t('COPY FROM недоступен на Android: загрузка файла с диска в ClickHouse поддерживается только в десктопной версии'),
            });
          } else {
            const data = await fetchApiJson('/api/clickhouse/copy-from', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...clickhouseConfig,
                innerSql: copyCmd.innerSql,
                filePath: copyCmd.filePath,
              }),
              signal: run.signal,
            });

            if (data.error) {
              updateRun({ error: data.error });
            } else {
              finishCopy({ kind: 'FROM', filePath: copyCmd.filePath, message: data.message || 'Data successfully loaded into Clickhouse', response: data.response });
            }
          }
        }
        return;
      }

      // SELECT / WITH: запрос страницы уже построен (buildPagedSql)
      let queryWithLimit = paged.main;

      if (needsJsonFormat(queryWithLimit)) {
        queryWithLimit = appendJsonFormat(queryWithLimit);
      }

      let data: any = null;
      if (isTauriEnvironment()) {
        try {
          data = await executeClickhouseQueryTauri(clickhouseConfig, queryWithLimit);
        } catch (err: any) {
          throw new Error(err.message || String(err));
        }
      } else if (isCapacitorEnvironment()) {
        try {
          data = await executeClickhouseQueryCapacitor(clickhouseConfig, queryWithLimit);
        } catch (err: any) {
          throw new Error(err.message || String(err));
        }
      } else {
        try {
          data = await fetchApiJson('/api/clickhouse/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...clickhouseConfig,
              query: queryWithLimit,
            }),
            signal: run.signal,
          });
        } catch {
          const url = getClickhouseUrl(clickhouseConfig);
          const headers = getClickhouseHeaders(clickhouseConfig);
          const chRes = await fetch(url, {
            method: 'POST',
            headers,
            body: queryWithLimit,
            signal: run.signal,
          });
          const text = await chRes.text();
          if (!chRes.ok) {
            throw new Error(text || `HTTP ${chRes.status}`);
          }
          data = parseClickhouseResponse(text, queryWithLimit);
        }
      }

      if (data && data.error) {
        updateRun({ error: data.error });
      } else if (data) {
        let resArr: any[] = [];
        if (Array.isArray(data.data)) {
          resArr = data.data;
        } else if (typeof data.text === 'string') {
          resArr = [{ Response: data.text || 'OK' }];
        } else {
          resArr = [data.data || { Status: 'OK' }];
        }
        
        let finalColTypes = {};
        if (data.meta && Array.isArray(data.meta)) {
          const typesDict: Record<string, string> = {};
          data.meta.forEach((col: any) => {
            if (col.name && col.type) {
              typesDict[col.name] = col.type;
            }
          });
          finalColTypes = typesDict;
        }
        updateRun({ results: resArr, duration: ((performance.now() - queryStartTime) / 1000).toFixed(2), colTypes: finalColTypes, columns: columnsFromMeta(data.meta) });
  
        
                if ((uiVisibility.autoUpdateSchema ?? true) && /^\s*(CREATE|DROP|ATTACH|DETACH|RENAME)\b/i.test(cleanSqlHead)) {
          fetchDuckDbSchema(true);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || run.signal?.aborted) {
        updateRun({ error: t('Запрос отменен пользователем') });
      } else {
        updateRun({ error: err.message || t('Ошибка выполнения ClickHouse запроса') });
      }
    } finally {
      finishRun();
    }
  };

  const handleExecuteCurrentEngineQuery = (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean, executionMode?: 'sequential' | 'parallel', targetTabId?: string) => {
    if (isAnyQueryRunning) return;
    
    // Create a version history checkpoint (fire-and-forget, non-blocking)
    (async () => {
      if (page !== 1 || activeTabIdRef.current === ACTION_MENU_TAB_ID) return;
      const currentSql = sqlRef.current;
      if (!currentSql.trim()) return;
      const latestVersion = await getLatestVersion();
      if (!latestVersion || latestVersion.sql !== currentSql) {
        await saveVersion(currentSql, activeTabTitleRef.current, true);
      }
    })().catch(err => {
      console.warn("Failed to save version checkpoint on execute:", err);
    });

    setResultsViewMode('table');
    setSelectedResultCell(null);
    setDuckDbSelectedCell(null);
    setIsCellSqlHighlighted(false);
    if (page === 1) {
      setColumnSearchTerm('');
      setValueSearchTerm('');
    }

    let finalQuery = queryToExec;

    if (activeEngine === 'clickhouse' || (!duckDbConnectedPath && clickhouseConfig)) {
      executeClickhouseQueryWithPagination(finalQuery, page, pageSizeToUse, isQuickAction, executionMode, targetTabId);
    } else {
      executeDuckDbQueryWithPagination(finalQuery, page, pageSizeToUse, isQuickAction, executionMode, targetTabId);
    }
  };

  // Листание страниц результата: запрос выполняется заново, но автоэкспорт Excel (@excel_save) не повторяется (п. 3.5)
  const handleChangeResultPage = (newPage: number) => {
    if (isAnyQueryRunning) return;
    isPagingRunRef.current = true;
    handleExecuteCurrentEngineQuery(lastExecutedSql, newPage);
  };

  const handleExecuteDuckDbQuery = async () => {
    let queryToExecute = sqlRef.current;
    const editorSelection = sqlEditorRef.current?.getSelection();
    if (editorSelection && editorSelection.start !== editorSelection.end) {
      queryToExecute = editorSelection.text;
    }

    if (!queryToExecute.trim()) return;
    setActiveSqlFilters([]);
    setActiveSqlSorts([]);
    setSelectedResultCell(null);
    setDuckDbSelectedCell(null);
    setColumnSearchTerm('');
    setValueSearchTerm('');
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, originalSql: undefined } : t));
    handleExecuteCurrentEngineQuery(queryToExecute, 1);
  };

  const executeSpecificDuckDbQuery = async (queryToExec: string, isQuickAction?: boolean) => {
    if (!queryToExec.trim()) return;
    setActiveSqlFilters([]);
    setActiveSqlSorts([]);
    setSelectedResultCell(null);
    setDuckDbSelectedCell(null);
    setColumnSearchTerm('');
    setValueSearchTerm('');
    if (!isQuickAction) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, originalSql: undefined } : t));
    }
    handleExecuteCurrentEngineQuery(queryToExec, 1, undefined, isQuickAction);
  };

  const executeSpecificDuckDbQueryRef = useRef(executeSpecificDuckDbQuery);
  useLayoutEffect(() => {
    executeSpecificDuckDbQueryRef.current = executeSpecificDuckDbQuery;
  });

  const handleExecuteQuickAction = useCallback((qa: QuickActionTemplate) => {
    setShowQuickActionsMenu(false);
    const targetQuery = qa.template.replace(/\{table\}/g, extractedTableName);
    // переменная {{$…}} берётся из SQL активной вкладки: если её там нет, говорим об этом, а не отправляем запрос с «{{$…}}»
    const missingVars = findUnresolvedVariables(targetQuery, sqlRef.current);
    if (missingVars.length > 0) {
      setDuckDbError(`${t('Переменная не найдена:')} ${missingVars.map(v => `{{$${v}}}`).join(', ')}`);
      setIsDuckDbResultVisible(true);
      return;
    }
    executeSpecificDuckDbQueryRef.current(targetQuery, true);
  }, [extractedTableName]);

  // Служебные запросы статистики (SUMMARIZE, распределения, ATTACH/USE). Перед выполнением подставляются {{$переменные}} и секреты —
  // как в основном запросе (п. 3.3); отмена и «выполняется» — общие с основным запросом через runTrackerRef.
  const handleExecuteRawQueryForStats = useCallback(async (sqlToRun: string): Promise<any[]> => {
    const executeRaw = async (sql: string, signal: AbortSignal): Promise<any[]> => {
      const isClickhouse = activeEngine === 'clickhouse' || (!duckDbConnectedPath && !!clickhouseConfig);
      if (isClickhouse && clickhouseConfig) {
        let queryWithFormat = sql.trim();
        if (needsJsonFormat(queryWithFormat)) {
          queryWithFormat = appendJsonFormat(queryWithFormat);
        }
        if (isTauriEnvironment()) {
          const res = await executeClickhouseQueryTauri(clickhouseConfig, queryWithFormat);
          return res?.data || [];
        } else if (isCapacitorEnvironment()) {
          const res = await executeClickhouseQueryCapacitor(clickhouseConfig, queryWithFormat);
          return res?.data || [];
        }
        const data = await fetchApiJson('/api/clickhouse/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...clickhouseConfig,
            query: queryWithFormat,
          }),
          signal
        });
        if (data?.error) {
          const errVal = typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error;
          throw new Error(errVal);
        }
        return data?.data || [];
      }
      if (isTauriEnvironment() && !isWasmMode) {
        const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql });
        // одинаковые имена столбцов не должны терять значения (п. 3.2)
        return rowsFromColumns(res?.columns || [], res?.rows || []).rows;
      } else if (isWasmMode) {
        return await queryDuckDbWasm(sql);
      }
      const data = await fetchApiJson('/api/duckdb/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
        signal
      });
      if (data?.error) {
        const errVal = typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error;
        throw new Error(errVal);
      }
      return data?.data || [];
    };

    return executeStatsQuery(sqlToRun, {
      tracker: runTrackerRef.current,
      scope: activeTabIdRef.current,
      substitute: (sql) => replaceSecretsInSql(replaceVariablesInSql(sql, sqlRef.current)),
      execute: executeRaw,
      cancelledMessage: t("Запрос отменен пользователем"),
      onStart: ({ othersActive }) => { if (othersActive === 0) setIsDuckDbRunning(true); },
      onFinish: (info) => { if (info.wasActive && info.remaining === 0) setIsDuckDbRunning(false); },
    });
  }, [activeEngine, clickhouseConfig, duckDbConnectedPath, isWasmMode]);

  const handleSelectTab = (targetId: string) => {
    if (targetId === activeTabId) return;

    const currentSql = sqlRef.current;

    // First, save current edits of the old active tab using the captured currentSql if it was an ordinary tab
    if (activeTabId !== ACTION_MENU_TAB_ID) {
      lastActiveSqlTabIdRef.current = activeTabId;
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: currentSql } : t));
    }

    // Now switch to the new active tab
    setActiveTabId(targetId);

    if (targetId === ACTION_MENU_TAB_ID) {
      sqlRef.current = '';
    } else {
      const targetTab = tabs.find(t => t.id === targetId);
      if (targetTab) {
        sqlRef.current = targetTab.sql;
        setLastExecutedSql(targetTab.lastExecutedSql || '');
      }
    }
  };

  const handleAddTab = () => {
    if (tabs.length >= 9) return;
    const newId = Date.now().toString();
    const newTab: EditorTab = {
      id: newId,
      title: nextTabName(tabs.map((tab: EditorTab) => tab.title), t('Вкладка'), 'Вкладка'),
      sql: ''
    };

    const currentSql = sqlRef.current;

    // Save current active tab SQL first if not action menu tab, then add the new tab
    if (activeTabId !== ACTION_MENU_TAB_ID) {
      setTabs(prev => {
        const updated = prev.map(t => t.id === activeTabId ? { ...t, sql: currentSql } : t);
        return [...updated, newTab];
      });
    } else {
      setTabs(prev => [...prev, newTab]);
    }

    setActiveTabId(newId);
    sqlRef.current = '';
  };

  const [tabToClosePendingConfirm, setTabToClosePendingConfirm] = useState<EditorTab | null>(null);

  useEffect(() => {
    if (!tabToClosePendingConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTabToClosePendingConfirm(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabToClosePendingConfirm]);

  const confirmCloseTab = (idToClose: string) => {
    if (idToClose === ACTION_MENU_TAB_ID) return;
    const nextTabs = tabs.filter(t => t.id !== idToClose);
    if (activeTabId === idToClose) {
      const closedIndex = tabs.findIndex(t => t.id === idToClose);
      const nextActive = nextTabs[Math.max(0, closedIndex - 1)];
      if (nextActive) {
        setActiveTabId(nextActive.id);
        sqlRef.current = nextActive.sql;
      }
    }
    setTabs(nextTabs);
    setTabToClosePendingConfirm(null);
    removeTabResult(idToClose).catch(console.error);
  };

  const handleCloseTab = (e: React.MouseEvent, idToClose: string) => {
    e.stopPropagation();
    if (idToClose === ACTION_MENU_TAB_ID) return;
    if (tabs.length <= 1) return;

    const tabToClose = tabs.find(t => t.id === idToClose);
    if (shouldConfirmClose(tabToClose)) {
      setTabToClosePendingConfirm(tabToClose!);
      return;
    }

    confirmCloseTab(idToClose);
  };

  const handleRenameTab = (id: string, newTitle: string) => {
    if (id === ACTION_MENU_TAB_ID) return;
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title: newTitle } : t));
  };
  const sqlEditorRef = useRef<SqlEditorRef>(null);

  const handleSqlChangeTimeoutRef = useRef<any>(null);

  const handleSqlChange = useCallback((newSql: string) => {
    if (activeTabId === ACTION_MENU_TAB_ID) return;
    sqlRef.current = newSql;
    
    if (handleSqlChangeTimeoutRef.current) {
      clearTimeout(handleSqlChangeTimeoutRef.current);
    }
    
    handleSqlChangeTimeoutRef.current = setTimeout(() => {
      setTabs(prev => setTabSql(prev, activeTabId, newSql));
    }, 200);
  }, [activeTabId]);

  const activeTabTitleRef = useRef<string>(t('Вкладка'));
  useEffect(() => {
    activeTabTitleRef.current = tabs.find(t => t.id === activeTabId)?.title || t('Вкладка');
  }, [tabs, activeTabId]);

  

  // Auto-save version into IndexedDB every 5 minutes if current tab SQL differs from the existing latest snapshot (ignores action menu tab)
  useEffect(() => {
    const INTERVAL_5_MIN = 5 * 60 * 1000;
    const intervalId = setInterval(async () => {
      if (activeTabIdRef.current === ACTION_MENU_TAB_ID) return;
      const currentSql = sqlRef.current;
      if (!currentSql.trim()) return;
      try {
        const latestVersion = await getLatestVersion();
        const latestSql = latestVersion ? latestVersion.sql : null;
        if (latestSql !== currentSql) {
          await saveVersion(currentSql, activeTabTitleRef.current, true);
        }
      } catch (err) {
        console.warn('Auto-save interval error:', err);
      }
    }, INTERVAL_5_MIN);

    return () => clearInterval(intervalId);
  }, []);

  const openWithTauriAndDelegate = async (delegateFn: (e: any) => void) => {
    try {
      let openFn: any, readBinaryFileFn: any;
      if (typeof window !== 'undefined' && (window as any).__TAURI__?.dialog?.open) {
        openFn = (window as any).__TAURI__.dialog.open;
        readBinaryFileFn = (window as any).__TAURI__.fs.readBinaryFile;
      } else {
        const dialog = await import('@tauri-apps/api/dialog');
        const fs = await import('@tauri-apps/api/fs');
        openFn = dialog.open;
        readBinaryFileFn = fs.readBinaryFile;
      }
      const selected = await openFn({
        multiple: false,
        filters: [{ name: 'SQL Files', extensions: ['sql', 'txt'] }]
      });
      if (typeof selected === 'string') {
        const bytes = await readBinaryFileFn(selected);
        const fileName = selected.split(/[/\\]/).pop() || 'query.sql';
        const file = new File([bytes], fileName, { type: 'text/plain' });
        Object.defineProperty(file, 'path', { value: selected });
        delegateFn({ target: { files: [file], value: '' } });
      }
    } catch (e) {
      console.warn("Tauri open error:", e);
    }
  };

  const handleOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (tabs.length >= 9) {
        alert(t('Достигнуто максимальное количество вкладок (9). Закройте одну из вкладок, чтобы открыть новый файл.'));
        e.target.value = '';
        return;
      }
      const filePath = (file as any).path || undefined;
      const decision = decideOpenFile(file, filePath, tabs);
      if (decision.kind === 'activate') {
        handleSelectTab(decision.tabId);
        e.target.value = '';
        return;
      }
      if (decision.kind === 'tooLarge') {
        alert(`${t('Файл слишком большой:')} ${file.name} (${t('максимум')} ${MAX_OPEN_FILE_BYTES / (1024 * 1024)} ${t('МБ')})`);
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        alert(`${t('Не удалось прочитать файл:')} ${file.name}`);
      };
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (typeof content === 'string') {
          const newId = Date.now().toString();
          const newTab: EditorTab = {
            id: newId,
            title: file.name,
            sql: content,
            filePath: filePath,
            savedContent: content,
            isModified: false,
          };
          const currentSql = sqlRef.current;
          setTabs(prev => {
            const updated = activeTabId === ACTION_MENU_TAB_ID
              ? prev
              : prev.map(t => t.id === activeTabId ? { ...t, sql: currentSql } : t);
            return [...updated, newTab];
          });
          setActiveTabId(newId);
          sqlRef.current = content;
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleOpenFileWin1251 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (tabs.length >= 9) {
        alert(t('Достигнуто максимальное количество вкладок (9). Закройте одну из вкладок, чтобы открыть новый файл.'));
        e.target.value = '';
        return;
      }
      const filePath = (file as any).path || undefined;
      const decision = decideOpenFile(file, filePath, tabs);
      if (decision.kind === 'activate') {
        handleSelectTab(decision.tabId);
        e.target.value = '';
        return;
      }
      if (decision.kind === 'tooLarge') {
        alert(`${t('Файл слишком большой:')} ${file.name} (${t('максимум')} ${MAX_OPEN_FILE_BYTES / (1024 * 1024)} ${t('МБ')})`);
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        alert(`${t('Не удалось прочитать файл:')} ${file.name}`);
      };
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (typeof content === 'string') {
          const newId = Date.now().toString();
          const newTab: EditorTab = {
            id: newId,
            title: file.name,
            sql: content,
            filePath: filePath,
            savedContent: content,
            isModified: false,
          };
          const currentSql = sqlRef.current;
          setTabs(prev => {
            const updated = activeTabId === ACTION_MENU_TAB_ID
              ? prev
              : prev.map(t => t.id === activeTabId ? { ...t, sql: currentSql } : t);
            return [...updated, newTab];
          });
          setActiveTabId(newId);
          sqlRef.current = content;
        }
      };
      reader.readAsText(file, 'windows-1251');
    }
    e.target.value = '';
  };

  const handleSaveSqlFile = async () => {
    saveSessionToStorage();
    await handleSaveFileLogic(false);
  };

  const handleSaveAsSqlFile = async () => {
    saveSessionToStorage();
    await handleSaveFileLogic(true);
  };

  const handleSaveFileLogic = async (forceSaveAs: boolean) => {
    const currentSql = sqlRef.current;
    if (!currentSql.trim()) return;

    const activeTab = tabs.find(t => t.id === activeTabId);
    let suggestedName = activeTab ? activeTab.title : 'query.sql';
    if (suggestedName && !suggestedName.toLowerCase().endsWith('.sql')) {
      suggestedName += '.sql';
    }

    // Tauri Desktop save logic
    if (isTauriEnvironment() || isTauriEnv) {
      try {
        let targetFilePath = forceSaveAs ? undefined : activeTab?.filePath;

        if (!targetFilePath) {
          let savePath: string | null = null;
          if ((window as any).__TAURI__?.dialog?.save) {
            savePath = await (window as any).__TAURI__.dialog.save({
              defaultPath: suggestedName,
              filters: [{ name: 'SQL Files', extensions: ['sql'] }],
            });
          } else {
            try {
              const { save } = await import('@tauri-apps/api/dialog');
              savePath = await save({
                defaultPath: suggestedName,
                filters: [{ name: 'SQL Files', extensions: ['sql'] }],
              });
            } catch (e) {
              console.warn("Tauri dialog import save failed:", e);
            }
          }

          if (!savePath) return; // User cancelled save dialog
          targetFilePath = savePath;
        }

        // Write text file in Tauri
        let fileWritten = false;
        if ((window as any).__TAURI__?.fs?.writeTextFile) {
          await (window as any).__TAURI__.fs.writeTextFile(targetFilePath, currentSql);
          fileWritten = true;
        } else {
          try {
            const { writeTextFile } = await import('@tauri-apps/api/fs');
            await writeTextFile(targetFilePath, currentSql);
            fileWritten = true;
          } catch (e) {
            console.warn("Tauri writeTextFile import failed, trying tauriInvoke:", e);
          }
        }

        if (!fileWritten) {
          await tauriInvoke('write_text_file', { path: targetFilePath, contents: currentSql });
        }

        const fileName = targetFilePath.split(/[/\\]/).pop() || suggestedName;

        setTabs(prev => prev.map(t => {
          if (t.id === activeTabId) {
            return {
              ...t,
              title: fileName,
              filePath: targetFilePath,
              savedContent: currentSql,
              isModified: false,
            };
          }
          return t;
        }));

        return;
      } catch (tauriErr) {
        console.warn('Tauri native save failed, falling back to browser download:', tauriErr);
      }
    }

    // Web File System Access API
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{
            description: 'SQL Files',
            accept: {
              'text/plain': ['.sql'],
            },
          }],
        });

        const writable = await handle.createWritable();
        await writable.write(currentSql);
        await writable.close();

        setTabs(prev => prev.map(t => {
          if (t.id === activeTabId) {
            return {
              ...t,
              savedContent: currentSql,
              isModified: false,
            };
          }
          return t;
        }));
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        console.warn('File System Access API failed, falling back to anchor download:', err);
      }
    }

    // Fallback anchor download
    const blob = new Blob([currentSql], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return {
          ...t,
          savedContent: currentSql,
          isModified: false,
        };
      }
      return t;
    }));
  };

  const handleInsertSnippet = (snippetSql: string, replaceMode?: boolean) => {
    let targetTabId = activeTabId;
    if (targetTabId === ACTION_MENU_TAB_ID) {
      if (tabs.length > 0) {
        targetTabId = tabs[0].id;
        setActiveTabId(targetTabId);
      } else {
        const newId = `tab_${Date.now()}`;
        const newTab: EditorTab = {
          id: newId,
          title: t('Запрос 1'),
          sql: snippetSql,
          isModified: false,
        };
        setTabs([newTab]);
        setActiveTabId(newId);
        sqlRef.current = snippetSql;
        return;
      }
    }

    const currentTab = tabs.find(t => t.id === targetTabId);
    const currentSql = currentTab ? currentTab.sql : '';
    const newSql = (replaceMode || !currentSql.trim()) ? snippetSql : (currentSql + '\n\n' + snippetSql);
    sqlRef.current = newSql;
    setTabs(prev => prev.map(t => {
      if (t.id === targetTabId) {
        return {
          ...t,
          sql: newSql,
          isModified: nextIsModified(t, newSql),
        };
      }
      return t;
    }));
  };

  // Ctrl+Enter / Ctrl+S / Ctrl+Shift+S обрабатываются только глобальным настраиваемым обработчиком ниже (п. 3.9, H-01)





  const [collapsedQueries, setCollapsedQueries] = useState<Set<string>>(new Set());

  
  
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [error, setError] = useState<string | null>(null);
  // Предпросмотр Markdown в панели графа (null — закрыт) и сообщение о проблемах разбора Mermaid
  const [markdownSource, setMarkdownSource] = useState<string | null>(null);
  const [mermaidNotice, setMermaidNotice] = useState<{ kind: 'error' | 'warning'; text: string } | null>(null);
  const [astResult, setAstResult] = useState<any>(null);

  const handleCollapseAll = useCallback(() => {
    const getAllIds = (ast: any, prefix = 'main_'): string[] => {
      let ids: string[] = [];
      if (!ast) return ids;
      if (ast.type === 'multi_query') {
        ast.queries.forEach((qAst: any, qIdx: number) => {
          const queryId = `${prefix}q_${qIdx}`;
          ids.push(queryId);
          ids.push(...getAllIds(qAst, `${prefix}q${qIdx}_`));
        });
      } else if (ast.type === 'procedure') {
        ast.steps.forEach((step: any, gIdx: number) => {
          if (step.parsedQuery) {
            const queryId = `${prefix}proc_step_group_${gIdx}`;
            ids.push(queryId);
            ids.push(...getAllIds(step.parsedQuery, `${prefix}step_${gIdx}_`));
          }
        });
      }
      return ids;
    };
    
    if (astResult) {
      const allIds = getAllIds(astResult);
      setCollapsedQueries(new Set(allIds));
    }
  }, [astResult]);

  const handleExpandAll = useCallback(() => {
    setCollapsedQueries(new Set());
  }, []);

  const handleToggleExpand = useCallback((queryId: string) => {
    setCollapsedQueries(prev => {
      const next = new Set(prev);
      if (next.has(queryId)) {
        next.delete(queryId);
      } else {
        next.add(queryId);
      }
      return next;
    });
  }, [activeEngine]);

  
  // Выбранный узел хранится как id; объект берётся из актуального списка узлов (п. 3.8)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(() => findSelectedNode(nodes as any[], selectedNodeId) as any, [nodes, selectedNodeId]);

  // DATA LINEAGE HIGHLIGHT CALCULATIONS
  const getLineageElements = useCallback((selectedNodeId: string | null, allNodes: any[], allEdges: any[]) => {
    if (!selectedNodeId) return { nodeIds: null, edgeIds: null };

    const connectedNodes = new Set<string>([selectedNodeId]);
    const connectedEdges = new Set<string>();

    const queueUp = [selectedNodeId];
    const visitedUp = new Set<string>([selectedNodeId]);
    while (queueUp.length > 0) {
      const curr = queueUp.shift()!;
      allEdges.forEach(e => {
        if (e.target === curr) {
          connectedEdges.add(e.id);
          if (!visitedUp.has(e.source)) {
            visitedUp.add(e.source);
            connectedNodes.add(e.source);
            queueUp.push(e.source);
          }
        }
      });
    }

    const queueDown = [selectedNodeId];
    const visitedDown = new Set<string>([selectedNodeId]);
    while (queueDown.length > 0) {
      const curr = queueDown.shift()!;
      allEdges.forEach(e => {
        if (e.source === curr) {
          connectedEdges.add(e.id);
          if (!visitedDown.has(e.target)) {
            visitedDown.add(e.target);
            connectedNodes.add(e.target);
            queueDown.push(e.target);
          }
        }
      });
    }

    return { nodeIds: connectedNodes, edgeIds: connectedEdges };
  }, [activeEngine]);

  const { nodeIds: lineageNodeIds, edgeIds: lineageEdgeIds } = React.useMemo(() => {
    if (!lineageHighlightMode || !selectedNode) return { nodeIds: null, edgeIds: null };
    return getLineageElements(selectedNode.id, nodes, edges);
  }, [lineageHighlightMode, selectedNode, nodes, edges, getLineageElements]);

  const processedNodes = React.useMemo(() => {
    if (!lineageHighlightMode || !lineageNodeIds) return nodes;
    return nodes.map((n) => {
      // заголовок запроса («Query N» с кнопкой) не часть графа данных: не гасим его при подсветке lineage
      const isLineage = lineageNodeIds.has(n.id) || n.type === 'collapseNode';
      return {
        ...n,
        style: {
          ...(n.style || {}),
          opacity: isLineage ? 1 : 0.2,
          transition: 'opacity 0.2s ease-in-out'
        }
      };
    });
  }, [nodes, lineageHighlightMode, lineageNodeIds]);

  const processedEdges = React.useMemo(() => {
    return edges.map((e: any) => {
      const isLineageModeActive = lineageHighlightMode && lineageEdgeIds;
      const isLineage = isLineageModeActive && lineageEdgeIds.has(e.id);
      
      return {
        ...e,
        animated: isLineageModeActive ? (isLineage ? true : false) : (e.animated ?? true),
        style: {
          ...(e.style || {}),
          opacity: isLineageModeActive ? (isLineage ? 1 : 0.15) : 1,
          strokeWidth: isLineage ? 3 : 2,
          stroke: isLineage ? '#3b82f6' : (e.style?.stroke || (theme === 'dark' ? '#f8fafc' : '#334155')),
          transition: 'opacity 0.2s ease-in-out'
        }
      };
    });
  }, [edges, lineageHighlightMode, lineageEdgeIds, theme]);
  const [copied, setCopied] = useState<string | boolean>(false);
  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(true);
  // Узкий экран (телефон): на экране либо редактор, либо граф
  const isNarrow = useIsNarrow();
  const [showMiniMap, setShowMiniMap] = useState<boolean>(() => !isNarrowNow());
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  // Режим документа: в панели графа открыт Markdown. Экспорт тогда относится к документу, а не к графу.
  const docMode = markdownSource !== null;
  const markdownPreviewRef = useRef<MarkdownPreviewHandle>(null);
  // Свежие узлы для экспорта: после включения полной отрисовки React Flow успевает измерить их
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const exportGraph = async (format: 'png' | 'svg' | 'jpeg', transparent: boolean = false) => {
    if (docMode) {
      // Документ экспортируется только как PNG/JPEG с фоном
      if (transparent || format === 'svg') return;
      setIsExporting(true);
      setShowExportMenu(false);
      try {
        await markdownPreviewRef.current?.exportImage(format);
      } catch (err: any) {
        console.error('Export document failed:', err);
        setError(`Failed to export document: ${err.message || String(err)}`);
      } finally {
        setIsExporting(false);
      }
      return;
    }
    if (!nodes || nodes.length === 0) return;
    setIsExporting(true);
    setShowExportMenu(false);

    try {
      // onlyRenderVisibleElements выключается на время экспорта (см. ReactFlow ниже): ждём, пока отрисуются все узлы
      await waitForGraphRendered(nodes.length);
      await exportGraphImage(nodesRef.current, theme, format, transparent);
    } catch (err: any) {
      console.error('Export graph failed:', err);
      setError(`${t("Не удалось экспортировать граф:")} ${err.message || String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const exportGraphText = (format: 'json' | 'xml' | 'mermaid' | 'drawio', toClipboard: boolean = false) => {
    if (markdownSource !== null || nodes.length === 0) return;
    setShowExportMenu(false);

    const { content, filename, mimeType } = buildGraphTextExport(format, {
      nodes,
      edges,
      dialect,
      direction,
      sql: getActiveTabSql(),
    });

    if (content) {
      if (toClipboard) {
        copyToClipboard(content);
        setCopied(format);
        setTimeout(() => setCopied(false), 2000);
      } else {
        const blob = new Blob([content], { type: mimeType });
        downloadFileWithFallback(blob, filename);
      }
    }
  };

  // Sync document.documentElement with theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Global hotkeys listener ref to avoid re-subscribing on every state change
  const hotkeysStateRef = useRef<any>(null);

  useEffect(() => {
    hotkeysStateRef.current = {
      hotkeys,
      tabs,
      activeTabId,
      lastActiveSqlTabIdRef,
      isMaximizedSql,
      uiVisibility,
      duckDbConnectedPath,
      handleExecuteDuckDb,
      handleVisualize,
      handleSaveSqlFile,
      handleSaveAsSqlFile,
      handleOpenFile,
      openWithTauriAndDelegate,
      handleCopySql,
      handleFormatSql,
      handleSelectTab,
      handleExportExcel,
      exportWorkspaceSettings,
      settingsImportFileInputRef,
      isDuckDbRunning,
      showSettingsModal,
      showSnippetsModal,
      showHistoryModal,
      showClickhouseModal,
      setShowSettingsModal,
      setShowSnippetsModal,
      setShowHistoryModal,
      setShowClickhouseModal,
      handleCancelDuckDbQuery,
      handleCopyResultsToClipboard,
      fetchDuckDbSchema,
      setShowDuckDbSchemaPanel,
      resultsViewMode,
      setResultsViewMode,
      isDuckDbResultVisible,
      setIsDuckDbResultVisible,
      isDuckDbResultExpanded,
      setIsDuckDbResultExpanded,
      setIsCellZoomed,
      setStatsInitialMode,
      activeStatsModeRef,
      selectedResultCell,
      setSelectedResultCell,
      duckDbSelectedCell,
      setDuckDbSelectedCell,
      isCellSqlHighlighted,
      setIsCellSqlHighlighted,
      isResultTableHoveredRef,
    };
  });

  // Android: системная кнопка «Назад» (только в Capacitor). Порядок действий:
  // открытое меню или подтверждение → окно (настройки, шаблоны, история, подключения, WASM) →
  // выбранная ячейка → таблица результата в редакторе (как Esc) → иначе приложение сворачивается.
  const backPressRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    backPressRef.current = () => {
      if (executeContextMenu) { setExecuteContextMenu(null); return true; }
      if (resultTableContextMenu) { setResultTableContextMenu(null); return true; }
      if (schemaContextMenu) { setSchemaContextMenu(null); return true; }
      if (tabToClosePendingConfirm) { setTabToClosePendingConfirm(null); return true; }

      if (showSettingsModal) { setShowSettingsModal(false); return true; }
      if (showSnippetsModal) {
        setShowSnippetsModal(false);
        setSnippetsModalCategory(undefined);
        setSnippetsModalEditId(undefined);
        return true;
      }
      if (showHistoryModal) { setShowHistoryModal(false); return true; }
      if (showClickhouseModal) { setShowClickhouseModal(false); return true; }
      if (showWasmFileModal) { setShowWasmFileModal(false); return true; }

      if (selectedResultCell || duckDbSelectedCell) {
        setSelectedResultCell(null);
        setDuckDbSelectedCell(null);
        setIsCellZoomed(false);
        setIsCellSqlHighlighted(false);
        return true;
      }
      if (isMaximizedSql && isDuckDbResultVisible) {
        if (isDuckDbResultExpanded) {
          setIsDuckDbResultExpanded(false);
          setIsCellZoomed(false);
        } else {
          setIsDuckDbResultVisible(false);
        }
        setIsCellSqlHighlighted(false);
        return true;
      }
      return false;
    };
  });

  useEffect(() => {
    if (!isCapacitorEnvironment()) return;
    let cancelled = false;
    let removeListener: (() => void) | undefined;
    import('@capacitor/app')
      .then(async ({ App: CapacitorApp }) => {
        const handle = await CapacitorApp.addListener('backButton', () => {
          if (!backPressRef.current()) CapacitorApp.minimizeApp().catch(console.error);
        });
        if (cancelled) handle.remove();
        else removeListener = () => { handle.remove(); };
      })
      .catch((e) => console.warn('Back button handler is not available:', e));
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!hotkeysStateRef.current) return;
      const {
        hotkeys: currentHotkeys,
        tabs: currentTabs,
        activeTabId: currentActiveTabId,
        lastActiveSqlTabIdRef: currentLastActiveSqlTabIdRef,
        isMaximizedSql: currentIsMaximizedSql,
        uiVisibility: currentUiVisibility,
        duckDbConnectedPath: currentDuckDbConnectedPath,
        handleExecuteDuckDb: currentHandleExecuteDuckDb,
        handleVisualize: currentHandleVisualize,
        handleSaveSqlFile: currentHandleSaveSqlFile,
        handleSaveAsSqlFile: currentHandleSaveAsSqlFile,
        handleOpenFile: currentHandleOpenFile,
        openWithTauriAndDelegate: currentOpenWithTauriAndDelegate,
        handleCopySql: currentHandleCopySql,
        handleFormatSql: currentHandleFormatSql,
        handleSelectTab: currentHandleSelectTab,
        handleExportExcel: currentHandleExportExcel,
        exportWorkspaceSettings: currentExportWorkspaceSettings,
        settingsImportFileInputRef: currentSettingsImportFileInputRef,
        isDuckDbRunning: currentIsDuckDbRunning,
        showSettingsModal: currentShowSettingsModal,
        showSnippetsModal: currentShowSnippetsModal,
        showHistoryModal: currentShowHistoryModal,
        showClickhouseModal: currentShowClickhouseModal,
        setShowSettingsModal: currentSetShowSettingsModal,
        setShowSnippetsModal: currentSetShowSnippetsModal,
        setShowHistoryModal: currentSetShowHistoryModal,
        setShowClickhouseModal: currentSetShowClickhouseModal,
        handleCancelDuckDbQuery: currentHandleCancelDuckDbQuery,
        handleCopyResultsToClipboard: currentHandleCopyResultsToClipboard,
        fetchDuckDbSchema: currentFetchDuckDbSchema,
        setShowDuckDbSchemaPanel: currentSetShowDuckDbSchemaPanel,
        resultsViewMode: currentResultsViewMode,
        setResultsViewMode: currentSetResultsViewMode,
        isDuckDbResultVisible: currentIsDuckDbResultVisible,
        setIsDuckDbResultVisible: currentSetIsDuckDbResultVisible,
        isDuckDbResultExpanded: currentIsDuckDbResultExpanded,
        setIsDuckDbResultExpanded: currentSetIsDuckDbResultExpanded,
        setIsCellZoomed: currentSetIsCellZoomed,
        setIsCellSqlHighlighted: currentSetIsCellSqlHighlighted,
        setStatsInitialMode: currentSetStatsInitialMode,
        activeStatsModeRef: currentActiveStatsModeRef,
        selectedResultCell: currentSelectedResultCell,
        setSelectedResultCell: currentSetSelectedResultCell,
        duckDbSelectedCell: currentDuckDbSelectedCell,
        setDuckDbSelectedCell: currentSetDuckDbSelectedCell,
        isResultTableHoveredRef: currentIsResultTableHoveredRef,
      } = hotkeysStateRef.current;

      // Что вызывает это нажатие: сочетания только из настроек, не в полях ввода, при открытом окне — только Esc (п. 3.9)
      const anyModalOpen = !!(currentShowSettingsModal || currentShowSnippetsModal || currentShowHistoryModal || currentShowClickhouseModal);
      const resolved = resolveHotkeyAction(e, currentHotkeys, {
        target: classifyHotkeyTarget(e.target as any),
        modalOpen: anyModalOpen,
        tabCount: currentTabs.length,
      });
      if (!resolved) return;
      const action = resolved.action;

      if (action === 'selectTab') {
        e.preventDefault();
        e.stopPropagation();
        currentHandleSelectTab(currentTabs[resolved.tabIndex!].id);
        return;
      }

      if (action === 'visualize') {
        e.preventDefault();
        e.stopPropagation();
        if (!currentIsMaximizedSql) {
          // режим графа: только строим граф, запрос не выполняется
          currentHandleVisualize();
        } else if (currentUiVisibility.showDuckDbConfig || currentUiVisibility.showClickhouseConfig) {
          currentHandleExecuteDuckDb();
        }
      } else if (action === 'saveFile') {
        e.preventDefault();
        e.stopPropagation();
        currentHandleSaveSqlFile();
      } else if (action === 'openFile') {
        e.preventDefault();
        e.stopPropagation();
        if (isTauriEnvironment() || isTauriEnv) {
          currentOpenWithTauriAndDelegate(currentHandleOpenFile);
        } else {
          fileInputRef.current?.click();
        }
      } else if (action === 'copySql') {
        e.preventDefault();
        e.stopPropagation();
        currentHandleCopySql();
      } else if (action === 'commentBlock') {
        e.preventDefault();
        e.stopPropagation();
        const sel = sqlEditorRef.current?.getSelection();
        if (sel) {
          const text = sel.text;
          if (text === '') {
            const fullVal = sqlRef.current || '';
            const pos = sel.start;
            const lineStart = fullVal.lastIndexOf('\n', pos - 1) + 1;
            let lineEnd = fullVal.indexOf('\n', pos);
            if (lineEnd === -1) lineEnd = fullVal.length;
            
            const lineText = fullVal.slice(lineStart, lineEnd);
            let newLineText = '';
            let diff = 0;
            
            if (lineText.startsWith('-- ')) {
              newLineText = lineText.slice(3);
              diff = -3;
            } else if (lineText.startsWith('--')) {
              newLineText = lineText.slice(2);
              diff = -2;
            } else {
              newLineText = '-- ' + lineText;
              diff = 3;
            }
            
            sqlEditorRef.current?.replaceRange(newLineText, lineStart, lineEnd, 'start');
            const newPos = Math.max(lineStart, pos + (pos > lineStart ? diff : 0));
            sqlEditorRef.current?.setSelectionRange(newPos, newPos);
          } else {
            const trimmed = text.trim();
            if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
              const firstIdx = text.indexOf('/*');
              const lastIdx = text.lastIndexOf('*/');
              const before = text.slice(0, firstIdx);
              const inner = text.slice(firstIdx + 2, lastIdx);
              const after = text.slice(lastIdx + 2);
              const newText = before + inner + after;
              sqlEditorRef.current?.replaceRange(newText, sel.start, sel.end, 'start');
              const newStart = sel.start;
              const newEnd = sel.start + newText.length;
              sqlEditorRef.current?.setSelectionRange(newStart, newEnd);
            } else {
              const newText = `/*${text}*/`;
              sqlEditorRef.current?.replaceRange(newText, sel.start, sel.end, 'start');
              const newStart = sel.start;
              const newEnd = sel.start + newText.length;
              sqlEditorRef.current?.setSelectionRange(newStart, newEnd);
            }
          }
        }
      } else if (action === 'toggleWrap') {
        e.preventDefault();
        e.stopPropagation();
        setIsWrapSql((prev) => !prev);
      } else if (action === 'formatSql') {
        e.preventDefault();
        e.stopPropagation();
        currentHandleFormatSql();
      } else if (action === 'openSnippets') {
        e.preventDefault();
        e.stopPropagation();
        currentSetShowSnippetsModal(true);
      } else if (action === 'toggleMaximized') {
        e.preventDefault();
        e.stopPropagation();
        setIsMaximizedSql((prev) => !prev);
      } else if (action === 'toggleTheme') {
        e.preventDefault();
        e.stopPropagation();
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
      } else if (action === 'openSettings') {
        e.preventDefault();
        e.stopPropagation();
        currentSetShowSettingsModal(true);
      } else if (action === 'exportResultsCopy') {
        e.preventDefault();
        e.stopPropagation();
        currentHandleCopyResultsToClipboard();
      } else if (action === 'saveAsFile') {
        e.preventDefault();
        e.stopPropagation();
        currentHandleSaveAsSqlFile();
      } else if (action === 'refreshSchema') {
        e.preventDefault();
        e.stopPropagation();
        currentFetchDuckDbSchema();
        currentSetShowDuckDbSchemaPanel?.(true);
      } else if (action === 'escapeAction') {
        let acted = false;
        if (!anyModalOpen && (currentSelectedResultCell || currentDuckDbSelectedCell)) {
          currentSetSelectedResultCell?.(null);
          currentSetDuckDbSelectedCell?.(null);
          currentSetIsCellZoomed?.(false);
          currentSetIsCellSqlHighlighted?.(false);
          acted = true;
        } else if (!anyModalOpen && currentIsResultTableHoveredRef?.current && currentIsDuckDbResultVisible) {
          if (currentIsDuckDbResultExpanded) {
            currentSetIsDuckDbResultExpanded(false);
            currentSetIsCellZoomed?.(false);
            currentSetIsCellSqlHighlighted?.(false);
          } else {
            currentSetIsDuckDbResultVisible(false);
            currentSetIsCellSqlHighlighted?.(false);
          }
          acted = true;
        } else if (!anyModalOpen && currentIsMaximizedSql && currentIsDuckDbRunning) {
          currentHandleCancelDuckDbQuery();
          acted = true;
        } else if (currentShowSettingsModal) {
          currentSetShowSettingsModal(false);
          acted = true;
        } else if (currentShowSnippetsModal) {
          currentSetShowSnippetsModal(false);
          setSnippetsModalCategory(undefined);
          setSnippetsModalEditId(undefined);
          acted = true;
        } else if (currentShowHistoryModal) {
          currentSetShowHistoryModal(false);
          acted = true;
        } else if (currentShowClickhouseModal) {
          currentSetShowClickhouseModal(false);
          acted = true;
        }
        if (acted) {
          e.preventDefault();
          e.stopPropagation();
        }
      } else if (action === 'toggleMiniMap') {
        e.preventDefault();
        e.stopPropagation();
        setShowMiniMap((prev) => !prev);
      } else if (action === 'exportGraph') {
        e.preventDefault();
        e.stopPropagation();
        setShowExportMenu((prev) => !prev);
      } else if (action === 'toggleColumnStats') {
        e.preventDefault();
        e.stopPropagation();
        if (currentResultsViewMode === 'chart') {
          currentSetResultsViewMode('table');
          currentSetIsDuckDbResultExpanded(preChartExpandedRef.current);
        } else {
          preChartExpandedRef.current = currentIsDuckDbResultExpanded;
          currentSetResultsViewMode('chart');
          currentSetIsDuckDbResultExpanded(true);
          currentSetStatsInitialMode({ chartType: 'list', listSubMode: 'columns' });
        }
      } else if (action === 'openActionMenu') {
        e.preventDefault();
        e.stopPropagation();
        if (currentActiveTabId === ACTION_MENU_TAB_ID) {
          const returnTabId = currentLastActiveSqlTabIdRef?.current && currentTabs.some((t: EditorTab) => t.id === currentLastActiveSqlTabIdRef.current)
            ? currentLastActiveSqlTabIdRef.current
            : (currentTabs[0]?.id || '1');
          currentHandleSelectTab(returnTabId);
        } else {
          currentHandleSelectTab(ACTION_MENU_TAB_ID);
        }
      } else if (action === 'exportSettings') {
        e.preventDefault();
        e.stopPropagation();
        currentExportWorkspaceSettings?.();
      } else if (action === 'importSettings') {
        e.preventDefault();
        e.stopPropagation();
        currentSettingsImportFileInputRef?.current?.click();
      } else if (action === 'exportExcelReport') {
        e.preventDefault();
        e.stopPropagation();
        currentHandleExportExcel?.();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [activeEngine]);

  const handleVisualize = (
    queryText = sqlRef.current,
    currentDialect = dialect,
    currentDir = direction
  ) => {
    setMarkdownSource(null);
    setMermaidNotice(null);
    // Узкий экран: граф показывается вместо редактора (вернуться — кнопкой в шапке графа)
    if (isNarrowNow()) setShowLeftPanel(false);
    if (queryText === sqlRef.current) {
      const editorSelection = sqlEditorRef.current?.getSelection();
      if (editorSelection && editorSelection.start !== editorSelection.end) {
        queryText = editorSelection.text;
      }
    }

    if (!queryText.trim()) {
      setError(null);
      setAstResult(null);
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      return;
    }

    const result = parseSqlToAst(queryText, currentDialect);
    if (result.error) {
      setError(result.error);
      setAstResult(null);
      // Неудачный разбор не оставляет на экране граф предыдущего запроса
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      return;
    }

    setError(null);
    setAstResult(result.ast);
  };

  const handleVisualizeMermaid = (
    queryText = sqlRef.current,
    currentDir = direction
  ) => {
    setMarkdownSource(null);
    if (isNarrowNow()) setShowLeftPanel(false);
    if (queryText === sqlRef.current) {
      const editorSelection = sqlEditorRef.current?.getSelection();
      if (editorSelection && editorSelection.start !== editorSelection.end) {
        queryText = editorSelection.text;
      }
    }

    if (!queryText.trim()) {
      setError(null);
      setMermaidNotice(null);
      setAstResult(null);
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      return;
    }

    try {
      const result = parseMermaidToGraph(queryText, currentDir);
      if (result.error) {
        setError(result.error);
        setMermaidNotice({ kind: 'error', text: result.error });
        return;
      }
      if (result.warnings && result.warnings.length > 0) {
        const shown = result.warnings.slice(0, 3).map(formatMermaidIssue).join('\n');
        const more = result.warnings.length > 3 ? `\n… +${result.warnings.length - 3}` : '';
        setMermaidNotice({ kind: 'warning', text: shown + more });
      } else {
        setMermaidNotice(null);
      }

      if (result.direction && (result.direction === 'LR' || result.direction === 'TB')) {
        setDirection(result.direction);
      }

      setError(null);
      setAstResult(null);
      setNodes(result.nodes);
      setEdges(result.edges);
      if (result.nodes.length > 0) {
        setSelectedNodeId(result.nodes[0].id);
      } else {
        setSelectedNodeId(null);
      }
    } catch (err: any) {
      setError(`Mermaid parse error: ${err?.message || String(err)}`);
      setMermaidNotice({ kind: 'error', text: `Mermaid parse error: ${err?.message || String(err)}` });
    }
  };

  // Кнопка «Markdown»: чистый Mermaid (flowchart/graph...) строится как граф, остальное — предпросмотр Markdown
  // (mermaid-блоки внутри Markdown рисуются статичным SVG и открываются как граф кнопкой на блоке).
  const handleVisualizeMarkdown = () => {
    let text = sqlRef.current;
    const editorSelection = sqlEditorRef.current?.getSelection();
    if (editorSelection && editorSelection.start !== editorSelection.end) {
      text = editorSelection.text;
    }
    if (!text.trim() || looksLikeMermaid(text)) {
      handleVisualizeMermaid(text);
      return;
    }
    setMermaidNotice(null);
    if (isNarrowNow()) setShowLeftPanel(false);
    setMarkdownSource(text);
  };

    useEffect(() => {
    if (astResult) {
      try {
        const graphData = astToGraph(
          astResult,
          'main_',
          dialect,
          {},
          {
            showSort: showSortNodes,
            showLimit: showLimitNodes,
            collapsedQueries,
            onToggleExpand: handleToggleExpand
          }
        );
        const layouted = getLayoutedElements(graphData.nodes, graphData.edges, direction);
        setNodes(layouted.nodes);
        setEdges(layouted.edges);
        
        // Выбор сохраняется, если узел остался в новом графе; иначе — узел результата / первый (п. 3.8)
        setSelectedNodeId((prev: string | null) => reconcileSelectedNodeId(prev, layouted.nodes));
      } catch (err: any) {
        const errMsg = err.message || String(err);
        if (!errMsg.includes("Not a SELECT query")) {
          setError(`Layout / AST Mapping error: ${errMsg}`);
        } else {
          setError(null);
        }
        // Граф предыдущего запроса не должен оставаться на экране после неудачного построения
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
      }
    }
  }, [astResult, dialect, direction, showSortNodes, showLimitNodes, collapsedQueries, handleToggleExpand, setNodes, setEdges]);

  const handlePresetChange = (presetId: string) => {
    const preset = sqlPresets.find(p => p.id === presetId);
    if (preset) {
      setActivePresetId(presetId);
      sqlRef.current = preset.sql; setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: preset.sql } : t));
      setDialect(preset.dialect);
    }
  };

  const handleSortToggle = () => {
    setShowSortNodes(!showSortNodes);
  };

  const handleLimitToggle = () => {
    setShowLimitNodes(!showLimitNodes);
  };

  const handleDirectionChange = (newDir: 'LR' | 'TB') => {
    setDirection(newDir);
    if (nodes.length > 0) {
      const isMermaid = nodes.some(n => n.type === 'mermaidNode' || n.type === 'mermaidEntityNode' || n.type === 'mermaidGroupNode');
      if (isMermaid) {
        // пока открыт предпросмотр Markdown, в редакторе не Mermaid — граф не пересобираем
        if (markdownSource === null) handleVisualizeMermaid(undefined, newDir);
      } else {
        const layouted = getLayoutedElements(nodes, edges, newDir);
        setNodes(layouted.nodes);
        setEdges(layouted.edges);
      }
    }
  };

  const handleCopySql = () => {
    copyToClipboard(sqlRef.current);
    setCopied('sql');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyResultsToClipboard = () => {
    const triggerCopied = () => {
      setCopied('tsv');
      setTimeout(() => setCopied(false), 2000);
    };

    if (duckDbError) {
      copyToClipboard(duckDbError)
        .then(triggerCopied)
        .catch(() => {
          try {
            copyToClipboard(duckDbError);
            triggerCopied();
          } catch (e) {
            console.error('Failed to copy error to clipboard:', e);
          }
        });
      return;
    }

    const rowsToCopy = displayedResults && displayedResults.length > 0 ? displayedResults : pagedResults;
    if (rowsToCopy && rowsToCopy.length > 0) {
      const csv = resultRowsToTsv(rowsToCopy, {
        transposed: isTransposed,
        firstRowNumber: (duckDbPage - 1) * effectiveMaxRows + 1,
        fieldLabel: t('Поле \\ №'),
        columns: resultColumns,
      });
      copyToClipboard(csv)
        .then(triggerCopied)
        .catch(() => {
          try {
            copyToClipboard(csv);
            triggerCopied();
          } catch (e) {
            console.error('Failed to copy results to clipboard:', e);
          }
        });
    } else if (duckDbResults && duckDbResults.length > 0) {
      const cols = resultColumnKeys;
      const csv = ['#', ...cols].join('\t');
      copyToClipboard(csv)
        .then(triggerCopied)
        .catch(() => {
          try {
            copyToClipboard(csv);
            triggerCopied();
          } catch (e) {}
        });
    } else if (Object.keys(resultColumnTypes).length > 0) {
      const cols = Object.keys(resultColumnTypes);
      const csv = ['#', ...cols].join('\t');
      copyToClipboard(csv)
        .then(triggerCopied)
        .catch(() => {
          try {
            copyToClipboard(csv);
            triggerCopied();
          } catch (e) {}
        });
    }
  };

  // Копирование таблицы Markdown (GFM). TSV для Excel — отдельная кнопка, её формат не менялся.
  const handleCopyResultsAsMarkdown = () => {
    const rows = displayedResults && displayedResults.length > 0 ? displayedResults : pagedResults;
    if (!rows || rows.length === 0) return;
    const md = resultRowsToMarkdown(rows as Record<string, unknown>[], {
      transposed: isTransposed,
      firstRowNumber: (duckDbPage - 1) * effectiveMaxRows + 1,
      fieldLabel: t('Поле \\ №'),
      columns: resultColumns,
    });
    if (!md) return;
    copyToClipboard(md)
      .then(() => {
        setCopied('md');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((e) => console.error('Failed to copy results as Markdown:', e));
  };

  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [showExcelPresetsMenu, setShowExcelPresetsMenu] = useState<boolean>(false);

  const handleExportExcelWithPreset = async (preset: ExcelPreset) => {
    if (!duckDbResults || duckDbResults.length === 0) return;
    setIsExportingExcel(true);
    try {
      const activeSql = lastExecutedSql || getActiveTabSql();
      await exportToExcel({
        data: duckDbResults,
        columns: resultColumns,
        columnTypes: resultColumnTypes,
        sqlQuery: activeSql,
        settings: preset.settings,
      });
    } catch (err: any) {
      console.error('Failed to export to Excel:', err);
      setDuckDbError(t('Ошибка экспорта в Excel: ') + (err.message || String(err)));
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportExcel = async () => {
    const settings = getSavedExcelSettings();
    await handleExportExcelWithPreset({
      id: 'current',
      name: t('По умолчанию'),
      isBuiltIn: false,
      settings,
    });
  };

  const handleCopyTableAsImage = () => {
    if (!resultsTableRef.current) return;
    const container = resultsTableRef.current;
    const tableEl = (container.querySelector('table') as HTMLElement) || container;

    const savedScrollTop = container.scrollTop;
    const savedScrollLeft = container.scrollLeft;

    try {
      container.scrollTop = 0;
      container.scrollLeft = 0;

      const width = tableEl.scrollWidth;
      const height = tableEl.scrollHeight;

      // Таблица сама фона не имеет — берём фон первого непрозрачного предка (иначе на картинке прозрачные ячейки).
      const solidBackground = (() => {
        let cur: HTMLElement | null = container;
        while (cur) {
          const c = getComputedStyle(cur).backgroundColor;
          if (c && c !== 'transparent') {
            const alphaMatch = c.match(/(?:,\s*|\/\s*)([\d.]+%?)\s*\)$/);
            let alpha = 1;
            if (alphaMatch) alpha = alphaMatch[1].endsWith('%') ? parseFloat(alphaMatch[1]) / 100 : parseFloat(alphaMatch[1]);
            if (alpha >= 0.95) return c;
          }
          cur = cur.parentElement;
        }
        return theme === 'dark' ? '#0f172a' : '#ffffff';
      })();

      const blobPromise = import('html-to-image').then(({ toBlob }) => toBlob(tableEl, {
        pixelRatio: 2,
        backgroundColor: solidBackground,
        width,
        height,
        style: {
          overflow: 'visible',
          width: `${width}px`,
          height: `${height}px`,
          maxHeight: 'none',
          maxWidth: 'none',
        },
        filter: (node) => {
          if (node instanceof HTMLElement) {
            if (node.classList.contains('no-export')) {
              return false;
            }
          }
          return true;
        },
      })).then(blob => {
        if (!blob) throw new Error('Failed to generate blob');
        return blob;
      });

      const restoreScroll = () => {
        container.scrollTop = savedScrollTop;
        container.scrollLeft = savedScrollLeft;
      };

      try {
        const item = new ClipboardItem({ 'image/png': blobPromise });
        navigator.clipboard.write([item])
          .then(() => {
            setCopiedTableImage(true);
            setTimeout(() => setCopiedTableImage(false), 2000);
          })
          .catch((err) => console.error('Failed to copy table image:', err))
          .finally(restoreScroll);
      } catch (e) {
        // Fallback for older browsers
        blobPromise.then((blob) => {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(() => {
              setCopiedTableImage(true);
              setTimeout(() => setCopiedTableImage(false), 2000);
            })
            .catch((err) => console.error('Fallback clipboard write failed:', err))
            .finally(restoreScroll);
        }).catch(err => {
            console.error('Failed to generate blob:', err);
            restoreScroll();
        });
      }
    } catch (err) {
      console.error('Failed to initiate copy table image:', err);
      container.scrollTop = savedScrollTop;
      container.scrollLeft = savedScrollLeft;
    }
  };

  const doFormat = (text: string): Promise<string> =>
    formatSqlText(text, dialect, formatterSettingsRef.current || formatterSettings);

  const handleFormatSql = async () => {
    // «Отформатировано» показывается только после успешного форматирования (п. 3.17)
    const flashFormatted = () => {
      setIsFormatted(true);
      setTimeout(() => setIsFormatted(false), 1500);
    };

    const sel = sqlEditorRef.current?.getSelection();

    if (sel && sel.text.trim()) {
      const res = await formatWithFeedback(sel.text, doFormat);
      if (res.ok === true) {
        sqlEditorRef.current?.replaceSelection(res.text);
        flashFormatted();
      } else {
        console.warn('Format error', res.error);
      }
      return;
    }

    const currentSqlText = sqlRef.current;
    if (!currentSqlText.trim()) return;

    const res = await formatWithFeedback(currentSqlText, doFormat);
    if (res.ok === false) {
      console.warn('Format error', res.error);
      return;
    }
    sqlRef.current = res.text;
    setTabs(prev => setTabSql(prev, activeTabId, res.text));
    flashFormatted();
  };

  const handleInsertGeneratedSqlFromStats = async (cols: string[]) => {
    const colList = cols && cols.length > 0
      ? cols.map(c => `"${c.replace(/"/g, '""')}"`).join(', ')
      : '*';
    const targetTable = extractedTableName || 'table';
    const rawSql = `SELECT ${colList} FROM ${targetTable};`;
    let sqlToInsert = rawSql;
    try {
      sqlToInsert = await doFormat(rawSql);
    } catch (e) {
      console.warn('Format generated SQL error', e);
    }
    handleInsertSnippet(sqlToInsert);
    setResultsViewMode('table');
    if (preChartExpandedRef.current !== undefined) {
      setIsDuckDbResultExpanded(preChartExpandedRef.current);
    }
  };

  const handleCompactSql = useCallback(() => {
    setIsCompacted(true);
    setTimeout(() => setIsCompacted(false), 1500);

    const sel = sqlEditorRef.current?.getSelection();
    if (sel && sel.text) {
      const compacted = compactSql(sel.text);
      sqlEditorRef.current?.replaceSelection(compacted);
      return;
    }

    const currentSqlText = sqlRef.current;
    if (!currentSqlText) return;
    const compacted = compactSql(currentSqlText);
    sqlRef.current = compacted;
    setTabs(prev => setTabSql(prev, activeTabId, compacted));
  }, [activeTabId]);

  const handleNodeClick = (_event: any, node: any) => {
    setSelectedNodeId(node.id);
  };

  if (isInitializing) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${theme === 'dark' ? 'bg-slate-850 text-slate-200' : 'bg-slate-200 text-slate-800'}`}>
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: 'calc(100vh / var(--zoom-scale, 1))',
        width: 'calc(100vw / var(--zoom-scale, 1))',
      }}
      className={`flex flex-col min-h-0 overflow-hidden ${theme === 'dark' ? 'dark bg-slate-850 text-slate-200' : 'bg-slate-200 text-slate-800'} font-sans select-none overflow-hidden`}
    >
      
      {/* CORE WORKSPACE */}
      <main className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT PANEL: INPUT & CONFIG (40% WIDTH) */}
        {showLeftPanel && (
        <aside id="control-panel" className={`w-[40%] min-w-[380px] max-w-[580px] max-md:w-full max-md:min-w-0 max-md:max-w-none border-r flex flex-col shrink-0 transition-colors ${
          theme === 'dark' ? 'bg-slate-750/50 border-slate-600' : 'bg-slate-200/80 border-slate-400/60'
        }`}>
          
          {/* LEFT PANEL TOP BAR */}
          <div className={`flex items-center justify-between px-4 h-[38px] border-b shrink-0 select-none transition-colors ${
            theme === 'dark' ? 'bg-slate-750 border-slate-600' : 'bg-slate-200/80 border-slate-400/60'
          }`}>
            <div className="flex items-center gap-2 max-w-[240px] truncate">
              <h3 
                onClick={() => setIsMaximizedSql(true)}
                className={`font-bold text-sm truncate shrink-0 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}
              >
                SQL Query
              </h3>
            </div>
              <div className="flex flex-nowrap items-center gap-1.5 relative">
                {/* HIDDEN FILE INPUT FOR OPEN SQL FILE */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".sql,.txt,text/plain" 
                  onChange={handleOpenFile} 
                  className="hidden" 
                />
                <input 
                  type="file" 
                  ref={settingsImportFileInputRef} 
                  accept=".json,application/json" 
                  onChange={handleImportSettingsFile} 
                  className="hidden" 
                />
                <input 
                  type="file" 
                  ref={win1251FileInputRef} 
                  accept=".sql,.txt,text/plain" 
                  onChange={handleOpenFileWin1251} 
                  className="hidden" 
                />

                {/* OPEN FILE BUTTON */}
                {uiVisibility.showOpenFile && (
                <button
                  onClick={() => isTauriEnvironment() || isTauriEnv ? openWithTauriAndDelegate(handleOpenFile) : fileInputRef.current?.click()}
                  className={`flex items-center justify-center gap-1 text-xs px-1.5 py-1 font-normal transition-colors ${
                    theme === 'dark' 
                      ? 'text-slate-300 hover:text-slate-100' 
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={t('Открыть SQL файл с диска (UTF-8)')}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                </button>
                )}

                {/* SAVE FILE BUTTON */}
                {uiVisibility.showSaveFile && (
                <button
                  onClick={handleSaveSqlFile}
                  className={`flex items-center justify-center gap-1 text-xs px-1.5 py-1 font-normal transition-colors ${
                    theme === 'dark' 
                      ? 'text-slate-300 hover:text-slate-100' 
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={t('Сохранить SQL в .sql файл')}
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-500" />
                </button>
                )}

                {uiVisibility.showSnippets && (
                <button
                  onClick={() => setShowSnippetsModal(true)}
                  className={`flex items-center justify-center gap-1 text-xs px-2.5 h-[26px] rounded-md font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600' 
                      : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 shadow-2xs'
                  }`}
                  title={t('Библиотека шаблонов')}
                >
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                </button>
                )}

                {uiVisibility.showMaximizeButton && (
                <button
                  onClick={() => setIsMaximizedSql(true)}
                  className={`flex items-center justify-center gap-1 text-xs px-2.5 h-[26px] rounded-md font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600' 
                      : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 shadow-2xs'
                  }`}
                  title={t('Открыть SQL Query редактор')}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Editor</span>
                </button>
                )}
              </div>
            </div>

          {/* LEFT PANEL CONTENT */}
          <div className="flex-1 flex flex-col p-3 space-y-3 min-h-0 overflow-y-auto">
            {/* CODE EDITOR WORKSPACE */}
            <div className="flex-1 flex flex-col min-h-0 relative">
              {/* SYNTAX HIGHLIGHTED SQL EDITOR OR ACTION MENU */}
              <ErrorBoundary title={t("Ошибка редактора SQL")} theme={theme} resetKey={activeTabId}>
                {!isTabsLoaded ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{t('Загрузка сессии...')}</span>
                  </div>
                ) : activeTabId === ACTION_MENU_TAB_ID ? (
                  <ActionMenuTabContent
                    theme={theme}
                    activeEngine={activeEngine}
                    isDuckDbRunning={isDuckDbRunning}
                    onExecuteSql={(sqlToExec, dialect, isSeq) => {
                      handleExecuteCurrentEngineQuery(sqlToExec, 1, undefined, false, isSeq ? 'sequential' : undefined);
                    }}
                    onOpenSnippetsManager={(cat, snippetId) => {
                      setSnippetsModalCategory(cat || ACTION_MENU_CATEGORY);
                      if (snippetId) setSnippetsModalEditId(snippetId);
                      setShowSnippetsModal(true);
                    }}
                    onInsertIntoEditor={(sqlToInsert) => {
                      handleInsertSnippet(sqlToInsert);
                    }}
                  />
                ) : !isMaximizedSql ? (
                  <SqlEditor editorRef={sqlEditorRef}
                    docId={activeTabId}
                    value={getActiveTabSql()}
                    onChange={handleSqlChange}
                    isWrapSql={isWrapSql}
                    theme={theme}
                    onCompactSql={handleCompactSql}
                    onExecuteQuickAction={handleExecuteQuickAction}
                    extractedTableName={extractedTableName}
                    isQuickActionsEnabled={(uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && !!duckDbResults && duckDbResults.length > 0 && !isAnyQueryRunning}
                    schemaTables={duckDbSchema || undefined}
                  />
                ) : (
                  <div className="flex-1" />
                )}
              </ErrorBoundary>
          </div>

          {/* VISUALIZE ACTION BAR */}
          <div className="flex flex-wrap items-center gap-1.5 relative">
            {/* На узком экране вспомогательные кнопки — одна строка с прокруткой; на десктопе обёртка не влияет на вёрстку (contents) */}
            <div className="contents max-md:flex max-md:w-full max-md:items-center max-md:gap-1.5 narrow-scroll-x">
            {/* SETTINGS BUTTON */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className={`p-1.5 rounded-md border transition-all shrink-0 ${
                theme === 'dark' 
                  ? 'bg-slate-800/60 hover:bg-slate-700/60 border-slate-700/80 text-slate-300 hover:text-slate-100' 
                  : 'bg-slate-200/50 hover:bg-slate-200 border-slate-300/80 text-slate-700 hover:text-slate-900'
              }`}
              title={t('Настройки и масштаб интерфейса')}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {/* PRESETS BUTTON & POPOVER */}
            {uiVisibility.showPresets && (
            <div className="relative">
              <button
                onClick={() => setShowPresetsDropdown(!showPresetsDropdown)}
                className={`text-xs px-2 py-1.5 rounded-md border transition-colors shrink-0 font-medium ${
                  showPresetsDropdown
                    ? (theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-200 border-slate-300 text-slate-800')
                    : (theme === 'dark' 
                        ? 'bg-slate-800/60 hover:bg-slate-700/60 border-slate-700/80 text-slate-400 hover:text-slate-300' 
                        : 'bg-slate-200/50 hover:bg-slate-200 border-slate-300/80 text-slate-500 hover:text-slate-700')
                }`}
                title={t('Готовые шаблоны и примеры SQL')}
              >
                {t('Пресеты')}
              </button>

              {/* PRESETS DROPDOWN POPOVER */}
              {showPresetsDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setShowPresetsDropdown(false)} 
                  />
                  <div className={`absolute bottom-full mb-1.5 left-0 max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:mb-0 max-md:w-auto max-md:max-h-[70vh] max-md:overflow-y-auto z-40 rounded-lg border shadow-xl p-2 w-72 animate-in fade-in duration-150 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-600/40 mb-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400">{t('Готовые SQL пресеты')}</span>
                      <button 
                        onClick={() => setShowPresetsDropdown(false)}
                        className="p-0.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-200"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                      {sqlPresets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            handlePresetChange(preset.id);
                            setShowPresetsDropdown(false);
                          }}
                          className={`w-full text-left p-1.5 rounded transition-all text-xs flex flex-col gap-0.5 border ${
                            activePresetId === preset.id
                              ? theme === 'dark' ? 'bg-amber-950/40 border-amber-500/50 text-amber-200 font-semibold' : 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                              : theme === 'dark' ? 'hover:bg-slate-700/60 border-transparent text-slate-300' : 'hover:bg-slate-100 border-transparent text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate pr-1 font-medium">{preset.title}</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-700/40 text-slate-300 font-mono shrink-0">
                              {preset.dialect}
                            </span>
                          </div>
                          {preset.description && (
                            <span className="text-[10px] text-slate-400 line-clamp-1 leading-tight font-normal">
                              {preset.description}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            )}

            {/* WRAP TEXT BUTTON */}
            <button
              onClick={() => setIsWrapSql(!isWrapSql)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-mono transition-all shrink-0 ${
                isWrapSql
                  ? 'bg-blue-600 text-white font-bold'
                  : theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
              }`}
              title={t('Перенос строки')}
            >
              <WrapText className="w-3 h-3" />
              <span>{t('Перенос')}</span>
            </button>

            {/* FORMAT SQL BUTTON */}
            {uiVisibility.showFormatSql && (
            <button
              onClick={handleFormatSql}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-mono transition-all shrink-0 ${
                theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
              }`}
              title={hotkeyHint(t('Форматировать SQL'), hotkeys, 'formatSql')}
            >
              {isFormatted ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <AlignLeft className="w-3 h-3" />
              )}
              <span>{t('Формат')}</span>
            </button>
            )}

            {/* COMPACT SQL BUTTON */}
            {uiVisibility.showCompactSql !== false && (
            <button
              onClick={handleCompactSql}
              className={`p-1.5 rounded-md transition-all shrink-0 ${
                theme === 'dark' ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/50' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              title={t('Формат в одну строку')}
            >
              {isCompacted ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Shrink className="w-3.5 h-3.5" />
              )}
            </button>
            )}

            {/* COPY SQL BUTTON */}
            {uiVisibility.showCopySql && (
            <button
              onClick={handleCopySql}
              className={`flex items-center gap-1 text-xs px-1.5 py-1.5 rounded-md transition-colors shrink-0 ${theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-600 hover:text-slate-900'}`}
              title={t('Скопировать SQL')}
            >
              {copied === 'sql' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">{t('Скопировано!')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>{t('Копировать')}</span>
                </>
              )}
            </button>
            )}

            </div>

            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              {uiVisibility.showMermaidIntegration !== false && (
                <MermaidActionGroup theme={theme} onVisualize={() => handleVisualizeMarkdown()} />
              )}

              <button
                onClick={() => handleVisualize()}
                className="px-3 py-1.5 shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md shadow-md shadow-blue-900/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Visualize</span>
              </button>
            </div>
          </div>
          </div>
        </aside>
        )}

        {/* RIGHT PANEL: INTERACTIVE CANVAS (70% WIDTH) */}
        <section className={`flex-1 max-md:min-w-0 flex flex-col h-full relative transition-colors ${showLeftPanel ? 'max-md:hidden' : ''} ${
          theme === 'dark' ? 'bg-slate-850 text-slate-200' : 'bg-slate-200 text-slate-800'
        }`}>
          
          {/* CANVAS CONTROLS HEADER */}
          <div className={`flex items-center justify-between px-4 h-[38px] narrow-scroll-x max-md:gap-3 border-b z-10 select-none transition-colors ${
            theme === 'dark' ? 'bg-slate-750 border-slate-600 text-slate-200' : 'bg-slate-200/80 border-slate-400/60 text-slate-800'
          }`}>
            <div className="flex items-center gap-3 text-xs">
              {uiVisibility.showLayoutDirection && (
              <>
                <div className="flex items-center gap-1.5 font-medium">
                  <Layout className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className={`flex p-0.5 rounded-md border ${
                  theme === 'dark' ? 'bg-slate-850 border-slate-600' : 'bg-slate-100 border-slate-300 shadow-sm'
                }`}>
                  <button
                    onClick={() => handleDirectionChange('LR')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      direction === 'LR' 
                        ? 'bg-blue-600 text-white font-bold' 
                        : theme === 'dark' ? 'text-slate-300 hover:text-slate-100 font-normal' : 'text-slate-700 hover:text-slate-900 font-normal'
                    }`}
                  >
                    LR
                  </button>
                  <button
                    onClick={() => handleDirectionChange('TB')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      direction === 'TB' 
                        ? 'bg-blue-600 text-white font-bold' 
                        : theme === 'dark' ? 'text-slate-300 hover:text-slate-100 font-normal' : 'text-slate-700 hover:text-slate-900 font-normal'
                    }`}
                  >
                    TB
                  </button>
                </div>
              </>
              )}

              {(uiVisibility.showSortLimitToggle || uiVisibility.showLineageFocus) && (
              <>
                <div className={`h-4 w-px ${theme === 'dark' ? 'bg-slate-600' : 'bg-slate-300'}`} />

                <div className={`flex p-0.5 rounded-md border text-sm truncate ${
                  theme === 'dark' ? 'bg-slate-850 border-slate-600' : 'bg-slate-100 border-slate-300 shadow-sm'
                }`}>
                  {uiVisibility.showSortLimitToggle && (
                  <>
                    <button
                      onClick={handleSortToggle}
                      className={`px-2.5 py-1 rounded text-xs transition-all ${
                        showSortNodes 
                          ? 'bg-emerald-600 text-white font-bold' 
                          : theme === 'dark' ? 'text-slate-300 hover:text-slate-100 font-normal' : 'text-slate-700 hover:text-slate-900 font-normal'
                      }`}
                      title="Toggle visualization of ORDER BY (Sort) nodes"
                    >
                      Sort Node
                    </button>
                    <button
                      onClick={handleLimitToggle}
                      className={`px-2.5 py-1 rounded text-xs transition-all ${
                        showLimitNodes 
                          ? 'bg-emerald-600 text-white font-bold' 
                          : theme === 'dark' ? 'text-slate-300 hover:text-slate-100 font-normal' : 'text-slate-700 hover:text-slate-900 font-normal'
                      }`}
                      title="Toggle visualization of LIMIT / OFFSET nodes"
                    >
                      Limit Node
                    </button>
                  </>
                  )}
                  {uiVisibility.showLineageFocus && (
                  <button
                    onClick={() => setLineageHighlightMode(!lineageHighlightMode)}
                    className={`px-2.5 py-1 rounded text-xs transition-all flex items-center gap-1 ${
                      lineageHighlightMode 
                        ? 'bg-purple-600 text-white font-bold shadow-xs' 
                        : theme === 'dark' ? 'text-slate-300 hover:text-slate-100 font-normal' : 'text-slate-700 hover:text-slate-900 font-normal'
                    }`}
                    title={t('Подсветка взаимосвязей (Data Lineage) выделенного узла')}
                  >
                    <Workflow className="w-3 h-3" />
                    <span>Focus</span>
                  </button>
                  )}
                </div>
              </>
              )}
            </div>

            {/* AST Preview toggle and Info labels */}
            <div className="flex items-center gap-2">
              {(uiVisibility.showEditorToggleBtn || isNarrow) && (
              <button
                onClick={() => setShowLeftPanel(!showLeftPanel)}
                className={`p-1.5 rounded-lg border transition-all ${
                  theme === 'dark' 
                    ? 'bg-slate-850 border-slate-600 text-slate-200 hover:text-slate-100' 
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900 shadow-sm'
                }`}
                title={showLeftPanel ? 'Hide Editor Panel' : 'Show Editor Panel'}
              >
                {showLeftPanel ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
              </button>
              )}

              {uiVisibility.showMiniMapButton && (
              <button
                onClick={() => setShowMiniMap(!showMiniMap)}
                className={`p-1.5 rounded-lg border transition-all ${
                  !showMiniMap
                    ? (theme === 'dark' ? 'bg-slate-750 border-slate-500 text-slate-200' : 'bg-slate-200 border-slate-300 text-slate-700')
                    : (theme === 'dark' ? 'bg-slate-850 border-slate-600 text-slate-200 hover:text-slate-100' : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900 shadow-sm')
                }`}
                title={showMiniMap ? 'Hide MiniMap' : 'Show MiniMap'}
              >
                <Map className="w-3.5 h-3.5" />
              </button>
              )}

              {uiVisibility.showThemeToggle && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className={`p-1.5 rounded-lg border transition-all ${
                  theme === 'dark' 
                    ? 'bg-slate-850 border-slate-600 text-slate-200 hover:text-slate-100' 
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900 shadow-sm'
                }`}
                title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-blue-500" />}
              </button>
              )}

              {/* EXPORT GRAPH DROPDOWN */}
              {uiVisibility.showExportButton && (
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={isExporting || (nodes.length === 0 && !docMode)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all bg-blue-600 hover:bg-blue-500 border-blue-500 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export entire graph as image/vector scheme"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{t('Экспорт')}</span>
                  <ChevronDown className="w-3 h-3 opacity-80" />
                </button>

                {showExportMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setShowExportMenu(false)} 
                    />
                    <div className={`absolute right-0 max-md:fixed max-md:top-auto max-md:right-2 mt-1 w-52 rounded-lg border shadow-xl z-30 overflow-hidden py-1 text-xs ${
                      theme === 'dark' ? 'bg-slate-750 border-slate-600 text-slate-100' : 'bg-slate-100 border-slate-300 text-slate-800'
                    }`}>
                      {uiVisibility.showExportPngBg !== false && (
                      <button
                        onClick={() => exportGraph('png', false)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors ${
                          theme === 'dark' ? 'hover:bg-blue-600/30' : 'hover:bg-blue-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                          <span className="font-semibold">PNG Image</span>
                        </div>
                        <span className="text-[10px] opacity-70 font-mono">With Bg</span>
                      </button>
                      )}

                      {uiVisibility.showExportPngTransparent !== false && (
                      <button
                        disabled={docMode}
                        onClick={() => exportGraph('png', true)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors border-t${docMode ? ' opacity-40 pointer-events-none' : ''} ${
                          theme === 'dark' ? 'hover:bg-blue-600/30 border-slate-600/30' : 'hover:bg-blue-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-3.5 h-3.5 text-cyan-500" />
                          <span className="font-semibold">PNG Transparent</span>
                        </div>
                        <span className={`text-[10px] font-mono ${theme === 'dark' ? 'text-cyan-300' : 'text-cyan-600'}`}>No Bg</span>
                      </button>
                      )}
                      
                      {uiVisibility.showExportSvgBg !== false && (
                      <button
                        disabled={docMode}
                        onClick={() => exportGraph('svg', false)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors border-t${docMode ? ' opacity-40 pointer-events-none' : ''} ${
                          theme === 'dark' ? 'hover:bg-blue-600/30 border-slate-600/50' : 'hover:bg-blue-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Code className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="font-semibold">SVG Vector</span>
                        </div>
                        <span className="text-[10px] opacity-70 font-mono">With Bg</span>
                      </button>
                      )}

                      {uiVisibility.showExportSvgTransparent !== false && (
                      <button
                        disabled={docMode}
                        onClick={() => exportGraph('svg', true)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors border-t${docMode ? ' opacity-40 pointer-events-none' : ''} ${
                          theme === 'dark' ? 'hover:bg-blue-600/30 border-slate-600/30' : 'hover:bg-blue-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Code className="w-3.5 h-3.5 text-teal-500" />
                          <span className="font-semibold">SVG Transparent</span>
                        </div>
                        <span className={`text-[10px] font-mono ${theme === 'dark' ? 'text-teal-300' : 'text-teal-600'}`}>No Bg</span>
                      </button>
                      )}

                      {uiVisibility.showExportJpeg !== false && (
                      <button
                        onClick={() => exportGraph('jpeg', false)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors border-t ${
                          theme === 'dark' ? 'hover:bg-blue-600/30 border-slate-600/50' : 'hover:bg-blue-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                          <span className="font-semibold">JPEG Image</span>
                        </div>
                        <span className="text-[10px] opacity-70 font-mono">With Bg</span>
                      </button>
                      )}

                      <div className="my-1 border-t border-slate-600/30 dark:border-slate-600/50" />

                      {uiVisibility.showExportJson !== false && (
                      <div
                        className={`w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors ${
                          theme === 'dark' ? 'hover:bg-blue-600/30' : 'hover:bg-blue-50'
                        }${docMode ? ' opacity-40 pointer-events-none' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <FileJson className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-semibold">JSON Data</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={docMode}
                            onClick={() => exportGraphText('json', true)}
                            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${copied === 'json' ? 'text-emerald-500' : theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Copy JSON to clipboard"
                          >
                            {copied === 'json' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            disabled={docMode}
                            onClick={() => exportGraphText('json')}
                            className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Download JSON file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      )}

                      {uiVisibility.showExportXml !== false && (
                      <div
                        className={`w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors border-t ${
                          theme === 'dark' ? 'hover:bg-blue-600/30 border-slate-600/30' : 'hover:bg-blue-50 border-slate-200'
                        }${docMode ? ' opacity-40 pointer-events-none' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <FileCode className="w-3.5 h-3.5 text-purple-400" />
                          <span className="font-semibold">XML Schema</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={docMode}
                            onClick={() => exportGraphText('xml', true)}
                            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${copied === 'xml' ? 'text-emerald-500' : theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Copy XML to clipboard"
                          >
                            {copied === 'xml' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            disabled={docMode}
                            onClick={() => exportGraphText('xml')}
                            className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Download XML file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      )}

                      {uiVisibility.showExportMermaid !== false && (
                      <div
                        className={`w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors border-t ${
                          theme === 'dark' ? 'hover:bg-blue-600/30 border-slate-600/30' : 'hover:bg-blue-50 border-slate-200'
                        }${docMode ? ' opacity-40 pointer-events-none' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <Workflow className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-semibold">Mermaid Diagram</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={docMode}
                            onClick={() => exportGraphText('mermaid', true)}
                            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${copied === 'mermaid' ? 'text-emerald-500' : theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Copy Mermaid to clipboard"
                          >
                            {copied === 'mermaid' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            disabled={docMode}
                            onClick={() => exportGraphText('mermaid')}
                            className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Download Mermaid file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      )}

                      {uiVisibility.showExportDrawio !== false && (
                      <div
                        className={`w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors border-t ${
                          theme === 'dark' ? 'hover:bg-blue-600/30 border-slate-600/30' : 'hover:bg-blue-50 border-slate-200'
                        }${docMode ? ' opacity-40 pointer-events-none' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <Workflow className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="font-semibold">Draw.io Diagram</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={docMode}
                            onClick={() => exportGraphText('drawio')}
                            className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Download Draw.io file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              )}
                            

            </div>
          </div>

          {/* REACT FLOW CANVAS CONTAINER */}
          <div className={`flex-1 w-full relative min-h-0 ${theme === 'dark' ? 'bg-slate-850' : 'bg-slate-200'} ${isMaximizedSql ? 'graph-paused' : ''}`} style={{ willChange: 'transform', transform: 'translateZ(0)', zoom: 1 / ((uiVisibility.uiScale ?? 100) / 100) }}>
            <ErrorBoundary title={t("Ошибка отображения графа")} theme={theme} resetKey={activeTabId}>
            {/* Grid Pattern Background styled specifically to match the design style */}
            <div className={`absolute inset-0 pointer-events-none opacity-[0.07] dark:opacity-10`} style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            
            {markdownSource !== null ? (
              <Suspense fallback={null}>
                <MarkdownPreview
                  ref={markdownPreviewRef}
                  source={markdownSource}
                  theme={theme}
                  onOpenMermaid={(code) => handleVisualizeMermaid(code)}
                />
              </Suspense>
            ) : nodes.length > 0 ? (
              <ReactFlow
                nodes={processedNodes}
                edges={processedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={2}
                className="sql-flow-canvas"
                onlyRenderVisibleElements={!isExporting}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{
                  type: 'smoothstep',
                  animated: true,
                  style: { strokeWidth: 2, stroke: theme === 'dark' ? '#f8fafc' : '#334155' }
                }}
              >
                <Background 
                  color={theme === 'dark' ? "#64748b" : "#94a3b8"} 
                  gap={24} 
                  size={1} 
                  variant={BackgroundVariant.Dots} 
                  className="opacity-15"
                />
                <Controls className={`!shadow-md ${
                  theme === 'dark' 
                    ? '!bg-slate-750 !border-slate-600 !text-slate-100 [&_button]:!bg-slate-750 [&_button]:!border-slate-600 [&_button]:!text-slate-200 [&_button:hover]:!text-slate-200' 
                    : '!bg-slate-100 !border-slate-300 !text-slate-700 [&_button]:!bg-slate-100 [&_button]:!border-slate-300 [&_button]:!text-slate-700 [&_button:hover]:!bg-slate-200'
                }`} />
                {showMiniMap && (
                  <MiniMap 
                    className={`!shadow-lg !rounded-lg border ${
                      theme === 'dark' ? '!bg-slate-750 !border-slate-600' : '!bg-slate-100 !border-slate-300'
                    }`}
                    nodeColor={(n: any) => {
                      if (n.type === 'tableNode') return theme === 'dark' ? '#3b82f6' : '#2563eb';
                      if (n.type === 'resultNode') return theme === 'dark' ? '#10b981' : '#059669';
                      if (n.type === 'filterNode') return theme === 'dark' ? '#f59e0b' : '#d97706';
                      if (n.type === 'mermaidNode' || n.type === 'mermaidEntityNode') return theme === 'dark' ? '#64748b' : '#94a3b8';
                      if (n.type === 'mermaidGroupNode') return 'transparent';
                      return theme === 'dark' ? '#475569' : '#94a3b8';
                    }}
                    maskColor={theme === 'dark' ? 'rgba(15, 23, 42, 0.7)' : 'rgba(226, 232, 240, 0.6)'}
                  />
                )}
              </ReactFlow>
            ) : (
              <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-transparent ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                <div className={`w-12 h-12 rounded-full border flex items-center justify-center mb-3 ${theme === 'dark' ? 'border-slate-600 text-slate-300' : 'border-slate-300 text-slate-600 bg-slate-100 shadow-sm'}`}>
                  <Database className="w-6 h-6" />
                </div>
                <div className={`text-xs max-w-xs leading-normal ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {t('Введите SQL-запрос в редактор слева и нажмите ')} <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}>Visualize</strong> {t(' для построения логического графа.')}
                </div>
                <div className={`text-xs max-w-xs leading-normal italic ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {t('Поддерживается построение произвольных диаграмм (')}<strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}>Mermaid</strong> {t(' синтаксис).')}
                </div>
              </div>
            )}
              </ErrorBoundary>

            {/* Проблемы разбора Mermaid: ошибка или пропущенные выражения с номерами строк */}
            {mermaidNotice && markdownSource === null && (
              <div
                className={`absolute left-3 top-3 z-20 max-w-md rounded-md border px-3 py-2 text-xs shadow-md whitespace-pre-wrap flex items-start gap-2 ${
                  mermaidNotice.kind === 'error'
                    ? theme === 'dark' ? 'bg-red-950/90 border-red-700 text-red-200' : 'bg-red-50 border-red-300 text-red-800'
                    : theme === 'dark' ? 'bg-amber-950/90 border-amber-700 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-800'
                }`}
              >
                <span className="flex-1 min-w-0 break-words">
                  <strong>{mermaidNotice.kind === 'error' ? 'Mermaid: ' : t('Mermaid: пропущено') + '\n'}</strong>{mermaidNotice.text}
                </span>
                <button type="button" onClick={() => setMermaidNotice(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="close">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* FLOATING SELECTED NODE DRAWER / BOTTOM DETAILS BAR */}
          {uiVisibility.showGraphFooter !== false && selectedNode && (
            <div className={`border-t p-4 shrink-0 shadow-2xl animate-in slide-in-from-bottom duration-200 ${
              theme === 'dark' ? 'bg-slate-750 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      selectedNode.type === 'tableNode' ? 'bg-blue-500' :
                      selectedNode.type === 'joinNode' ? 'bg-purple-500' :
                      selectedNode.type === 'filterNode' ? 'bg-amber-500' :
                      selectedNode.type === 'groupByNode' || selectedNode.type === 'havingNode' ? 'bg-pink-500' :
                      selectedNode.type === 'resultNode' ? 'bg-emerald-500' : 'bg-cyan-500'
                    }`} />
                    <h4 className={`text-sm font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                      {selectedNode.data.title || selectedNode.data.label || 'Details'}
                    </h4>
                  </div>

                  {/* Dynamic description of execution */}
                  <div className="mt-2 text-xs leading-relaxed font-mono select-text">
                    {selectedNode.type === 'tableNode' && (
                      <div className="flex flex-col gap-1">
                        <div>
                          <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Source relation:</span>{' '}
                          <span className={theme === 'dark' ? 'text-blue-300 font-bold' : 'text-blue-600 font-bold'}>{selectedNode.data.label}</span>
                          {selectedNode.data.alias && (
                            <> as <span className={theme === 'dark' ? 'text-blue-400 font-semibold' : 'text-blue-500 font-semibold'}>"{selectedNode.data.alias}"</span></>
                          )}
                        </div>
                        
                      </div>
                    )}

                    {selectedNode.type === 'joinNode' && (
                      <div className="space-y-1">
                        <div>
                          <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Operation:</span>{' '}
                          <span className="text-purple-500 font-bold">{selectedNode.data.joinType}</span>
                        </div>
                        <div className={`p-2 rounded border mt-1 max-h-24 overflow-y-auto ${
                          theme === 'dark' ? 'bg-slate-850 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}>
                          <span className="text-purple-500 font-medium">ON Condition:</span>{' '}
                          <code>{selectedNode.data.condition}</code>
                        </div>
                        
                      </div>
                    )}

                    {selectedNode.type === 'filterNode' && (
                      <div className="space-y-1">
                        <div className={`p-2 rounded border max-h-24 overflow-y-auto ${
                          theme === 'dark' ? 'bg-slate-850 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}>
                          <span className="text-amber-500 font-semibold">Condition:</span>{' '}
                          <code>{selectedNode.data.condition}</code>
                        </div>
                        
                      </div>
                    )}

                    {selectedNode.type === 'groupByNode' && (
                      <div>
                        <div>
                          <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Grouping Columns:</span>{' '}
                          <span className="text-pink-500 font-bold">{selectedNode.data.columns}</span>
                        </div>
                        
                      </div>
                    )}

                    {selectedNode.type === 'havingNode' && (
                      <div className="space-y-1">
                        <div className={`p-2 rounded border ${
                          theme === 'dark' ? 'bg-slate-850 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}>
                          <span className="text-rose-500 font-semibold">HAVING Expression:</span>{' '}
                          <code>{selectedNode.data.condition}</code>
                        </div>
                        
                      </div>
                    )}

                    {selectedNode.type === 'sortNode' && (
                      <div>
                        <div>
                          <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Order By:</span>{' '}
                          <span className="text-teal-500 font-bold">{selectedNode.data.details}</span>
                        </div>
                        
                      </div>
                    )}

                    {selectedNode.type === 'limitNode' && (
                      <div>
                        <div>
                          <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Parameters:</span>{' '}
                          <span className="text-cyan-500 font-bold">{selectedNode.data.details}</span>
                        </div>
                        
                      </div>
                    )}

                    {selectedNode.type === 'resultNode' && (
                      <div className="space-y-1.5">
                        <div className={`text-[11px] ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>
                          {selectedNode.data.columns?.some((col: any) => col.name && col.name.includes('Operation:'))
                            ? ''
                            : ''}
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                          {selectedNode.data.columns?.map((col: any, idx: number) => (
                            <span key={idx} className={`px-2 py-1 rounded text-[10px] border ${
                              theme === 'dark' 
                                ? 'bg-slate-850 text-emerald-300 border-slate-600' 
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              {col.name} {col.alias ? `as ${col.alias}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedNode.type === 'constantNode' && (
                      <div className="space-y-1">
                        <div className={`p-2 rounded border ${
                          theme === 'dark' ? 'bg-slate-850 border-slate-750 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}>
                          <code>{selectedNode.data.details}</code>
                        </div>
                      </div>
                    )}

                    {(selectedNode.type === 'mermaidNode' || selectedNode.type === 'mermaidEntityNode') && (
                      <div className="space-y-1">
                        <div>
                          <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Shape:</span>{' '}
                          <span className="text-teal-500 font-bold">{selectedNode.data.shape || 'rectangle'}</span>
                        </div>
                        {selectedNode.data.subgraph && (
                          <div>
                            <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Subgraph:</span>{' '}
                            <span className="text-blue-400 font-semibold">{selectedNode.data.subgraph}</span>
                          </div>
                        )}
                        {selectedNode.data.classes && selectedNode.data.classes.length > 0 && (
                          <div>
                            <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Classes:</span>{' '}
                            <span className="text-purple-400 font-mono">{selectedNode.data.classes.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedNode.type === 'mermaidGroupNode' && (
                      <div className="space-y-1">
                        <div>
                          <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>Group:</span>{' '}
                          <span className="text-indigo-400 font-bold">{selectedNode.data.label || 'Subgraph'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedNodeId(null)}
                  className={`p-1.5 rounded transition-colors shrink-0 ${
                    theme === 'dark' ? 'hover:bg-slate-600 text-slate-200' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        </section>

      </main>

      {/* FULLSCREEN OVERLAY MODAL */}
      {isMaximizedSql && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 p-0 flex flex-col items-center justify-center animate-in fade-in duration-150">
          <div className={`w-full h-full flex flex-col overflow-hidden relative transition-colors ${
            theme === 'dark' ? 'bg-slate-850 text-slate-200' : 'bg-slate-100 text-slate-900'
          }`}>
            {/* HEADER */}
            <div className={`flex flex-nowrap items-center justify-between gap-2 px-4 h-[38px] border-b shrink-0 ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-200/90 border-slate-300'
            }`}>
              <div
                onClick={() => setIsMaximizedSql(false)}
                className="flex items-center gap-2.5 shrink-0"
              >
                <Search className="w-3.5 h-3.5 text-blue-500" />
                <h3 className={`font-bold text-sm truncate max-md:hidden ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  Query Editor
                </h3>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 ml-auto narrow-scroll-x max-md:min-w-0 max-md:flex-1">
                {uiVisibility.showOpenFile && (
                <button
                  onClick={() => isTauriEnvironment() || isTauriEnv ? openWithTauriAndDelegate(handleOpenFile) : fileInputRef.current?.click()}
                  className={`flex items-center gap-1 text-xs px-1.5 py-1 font-normal transition-colors ${
                    theme === 'dark' 
                      ? 'text-slate-300 hover:text-slate-100' 
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={t('Открыть SQL файл с диска (UTF-8)')}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                </button>
                )}

                {uiVisibility.showSaveFile && (
                <button
                  onClick={handleSaveSqlFile}
                  className={`flex items-center gap-1 text-xs px-1.5 py-1 font-normal transition-colors ${
                    theme === 'dark' 
                      ? 'text-slate-300 hover:text-slate-100' 
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={t('Сохранить SQL в .sql файл')}
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-500" />
                </button>
                )}

                {!isTauriEnv && !isTauriEnvironment() && (
                <button
                  onClick={() => setShowWasmFileModal(true)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 h-[26px] rounded-md transition-all ${
                    theme === 'dark' 
                      ? 'text-blue-300 shadow-2xs' 
                      : 'text-blue-700 shadow-2xs'
                  }`}
                  title={t('Виртуальная файловая система (WASM VFS)')}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                  <span>WASM</span>
                </button>
                )}

                {uiVisibility.showSnippets && (
                <button
                  onClick={() => setShowSnippetsModal(true)}
                  className={`flex items-center justify-center gap-1 text-xs px-2.5 h-[26px] rounded-md font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'bg-transparent border border-slate-600 text-slate-200 hover:bg-slate-700/60' 
                      : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 shadow-2xs'
                  }`}
                  title={t('Библиотека шаблонов')}
                >
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                </button>
                )}

                {uiVisibility.showHistory && (
                <button
                  onClick={() => setShowHistoryModal(true)}
                  className={`flex items-center justify-center gap-1 text-xs px-2.5 h-[26px] rounded-md font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'bg-transparent border border-slate-600 text-slate-200 hover:bg-slate-700/60' 
                      : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 shadow-2xs'
                  }`}
                  title={t('История версий SQL')}
                >
                  <History className="w-3.5 h-3.5 text-purple-500" />
                </button>
                )}

                <input 
                  type="file" 
                  ref={duckDbFileInputRef} 
                  onChange={handleDuckDbFileChange} 
                  className="hidden" 
                />

                <input 
                  type="file" 
                  ref={duckDbAttachFileInputRef} 
                  onChange={handleDuckDbAttachFileChange} 
                  className="hidden" 
                />

                {(uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && (
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <button
                      onClick={() => setShowDuckDbConnMenu(!showDuckDbConnMenu)}
                    className={`flex items-center gap-1 text-xs px-2.5 h-[26px] rounded font-semibold transition-colors text-sm truncate ${
                      clickhouseConfig
                        ? theme === 'dark' 
                          ? 'text-amber-300 hover:text-amber-100 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30' 
                          : 'text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 shadow-2xs'
                        : theme === 'dark' 
                          ? 'text-teal-300 hover:text-teal-100 bg-teal-950/40 hover:bg-teal-900/60 border border-teal-500/30' 
                          : 'text-teal-800 hover:text-teal-950 bg-teal-100 hover:bg-teal-200 border border-teal-300 shadow-2xs'
                    }`}
                    title={t('Настроить подключение DB')}
                  >
                    {duckDbConnectedPath === ':memory:' ? (
                      <Cpu className={`w-3.5 h-3.5 ${clickhouseConfig ? 'text-amber-500' : duckDbConnectedPath ? 'text-teal-500' : 'text-slate-400'}`} />
                    ) : (
                      <Database className={`w-3.5 h-3.5 ${clickhouseConfig ? 'text-amber-500' : duckDbConnectedPath ? 'text-teal-500' : 'text-slate-400'}`} />
                    )}
                    <span>{duckDbConnectedPath ? (duckDbConnectedPath === ':memory:' ? 'In-Memory (Connected)' : 'DuckDB (Connected)') : clickhouseConfig ? 'Clickhouse (Connected)' : 'Connect DB'}</span>
                    <ChevronDown className="w-3 h-3 opacity-70 ml-0.5" />
                  </button>

                  {showDuckDbConnMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-30" 
                        onClick={() => setShowDuckDbConnMenu(false)} 
                      />
                      <div className={`absolute top-full mt-1 right-0 max-md:fixed max-md:top-auto max-md:right-2 z-40 rounded-lg border shadow-xl p-1.5 w-60 animate-in fade-in duration-150 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                      }`}>
                        {uiVisibility.showDuckDbConfig && (
                          <>
                            <button
                              onClick={() => {
                                setShowDuckDbConnMenu(false);
                                handleConfigureDuckDb();
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>{t('Открыть файл DuckDB')}</span>
                            </button>
                            <button
                              onClick={() => {
                                setShowDuckDbConnMenu(false);
                                handleCreateDuckDbFile();
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span>{t('Создать новую БД (.duckdb)')}</span>
                            </button>
                            <button
                              onClick={() => {
                                setShowDuckDbConnMenu(false);
                                handleConnectInMemory();
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <Cpu className="w-3.5 h-3.5 text-purple-500 shrink-0 opacity-80" />
                              <span>{t('In-Memory БД (:memory:)')}</span>
                            </button>
                            {recentDuckDbPath && recentDuckDbPath !== duckDbConnectedPath && (
                              <>
                                <div className={`my-1 border-t ${theme === 'dark' ? 'border-slate-700/60' : 'border-slate-200'}`} />
                                <button
                                  onClick={() => handleConnectToRecentDuckDb(recentDuckDbPath)}
                                  className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors mt-1 ${
                                    theme === 'dark' ? 'hover:bg-slate-700/50 text-slate-300' : 'hover:bg-slate-50 text-slate-600'
                                  }`}
                                  title={recentDuckDbPath}
                                >
                                  <Database className="w-3.5 h-3.5 text-blue-400 shrink-0 opacity-70" />
                                  <span className="truncate">{recentDuckDbPath.split(/[/\\]/).pop()}</span>
                                </button>
                              </>
                            )}
                          </>
                        )}

                        {uiVisibility.showDuckDbConfig && uiVisibility.showClickhouseConfig && (
                          <div className={`my-1 border-t ${theme === 'dark' ? 'border-slate-700/60' : 'border-slate-200'}`} />
                        )}

                        {uiVisibility.showClickhouseConfig && (
                          <>
                            <button
                              onClick={() => {
                                setShowDuckDbConnMenu(false);
                                // подключение меняется только по кнопке «Подключить» в окне (onConnect), отмена окна ничего не отключает (п. 3.7)
                                setShowClickhouseModal(true);
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <Database className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>{t('Подключить Clickhouse')}</span>
                            </button>
                            {(() => {
                              const validRecentCfgs = recentClickhouseConfigs.filter(cfg => 
                                !(clickhouseConfig && cfg.host === clickhouseConfig.host && cfg.user === clickhouseConfig.user)
                              );
                              if (validRecentCfgs.length === 0) return null;
                              
                              return (
                                <>
                                  <div className={`my-1 border-t ${theme === 'dark' ? 'border-slate-700/60' : 'border-slate-200'}`} />
                                  {validRecentCfgs.map((cfg, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => handleConnectToRecentClickhouse(cfg)}
                                      className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors mt-1 ${
                                        theme === 'dark' ? 'hover:bg-slate-700/50 text-slate-300' : 'hover:bg-slate-50 text-slate-600'
                                      }`}
                                      title={`${cfg.host} (${cfg.user})`}
                                    >
                                      <Database className="w-3.5 h-3.5 text-blue-400 shrink-0 opacity-70" />
                                      <span className="truncate">{cfg.host} - {cfg.user}</span>
                                    </button>
                                  ))}
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </>
                  )}

                  </div>
                  {!duckDbConnectedPath && !clickhouseConfig && !showDuckDbSchemaPanel && (
                    <button
                      onClick={() => setShowDuckDbSchemaPanel(true)}
                      className={`flex items-center justify-center h-[26px] w-[26px] rounded transition-colors ${
                        theme === 'dark' 
                          ? 'text-blue-400 hover:bg-blue-950/40 border border-blue-500/30' 
                          : 'text-blue-600 hover:bg-blue-100 border border-blue-300 shadow-2xs'
                      }`}
                      title={t('Схема и файлы')}
                    >
                      <Database className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {duckDbConnectedPath && (
                    <div className="flex items-center gap-1">
                      {!showDuckDbSchemaPanel && (
                        <button
                          onClick={() => setShowDuckDbSchemaPanel(true)}
                          className={`flex items-center justify-center h-[26px] w-[26px] rounded transition-colors ${
                            theme === 'dark' 
                              ? 'text-blue-400 hover:bg-blue-950/40 border border-blue-500/30' 
                              : 'text-blue-600 hover:bg-blue-100 border border-blue-300 shadow-2xs'
                          }`}
                          title={t('Схема и файлы')}
                        >
                          <Database className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={handleDisconnectDuckDb}
                        className={`flex items-center justify-center h-[26px] w-[26px] rounded transition-colors ${
                          theme === 'dark' 
                            ? 'text-red-400 hover:bg-red-950/40 border border-red-500/30' 
                            : 'text-red-600 hover:bg-red-100 border border-red-300 shadow-2xs'
                        }`}
                        title={t('Отключить DuckDB')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {clickhouseConfig && (
                    <div className="flex items-center gap-1">
                      {!showDuckDbSchemaPanel && (
                        <button
                          onClick={() => setShowDuckDbSchemaPanel(true)}
                          className={`flex items-center justify-center h-[26px] w-[26px] rounded transition-colors ${
                            theme === 'dark' 
                              ? 'text-blue-400 hover:bg-blue-950/40 border border-blue-500/30' 
                              : 'text-blue-600 hover:bg-blue-100 border border-blue-300 shadow-2xs'
                          }`}
                          title={t('Схема и файлы')}
                        >
                          <Database className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setClickhouseConfig(null);
                          if (activeEngine === 'clickhouse') {
                            setActiveEngine('duckdb');
                          }
                          if (!duckDbConnectedPath) {
                            setShowDuckDbSchemaPanel(false);
                          }
                        }}
                        className={`flex items-center justify-center h-[26px] w-[26px] rounded transition-colors ${
                          theme === 'dark' 
                            ? 'text-red-400 hover:bg-red-950/40 border border-red-500/30' 
                            : 'text-red-600 hover:bg-red-100 border border-red-300 shadow-2xs'
                        }`}
                        title={t('Отключить Clickhouse')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                )}

                {uiVisibility.showMaximizeButton && (
                <>
                  <div className="h-4 w-px bg-slate-400/40 dark:bg-slate-600" />

                  <button
                    onClick={() => {
                      setIsMaximizedSql(false);
                      // Узкий экран: «Вернуться к графу» показывает граф, а не панель редактора
                      if (isNarrowNow()) setShowLeftPanel(false);
                    }}
                    className={`flex items-center justify-center gap-1.5 px-3 h-[26px] rounded-md text-xs font-semibold transition-colors ${
                      theme === 'dark'
                        ? 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600'
                        : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 shadow-2xs'
                    }`}
                    title={t('Вернуться к графу')}
                  >
                    <Workflow className="w-3.5 h-3.5" />
                    <span>Graph</span>
                  </button>
                </>
                )}
              </div>
            </div>

            {/* CONTENT AREA WITH TAB BAR, BODY & SCHEMA BROWSER */}
            <div className="flex-1 flex flex-row min-h-0 min-w-0">
              {/* LEFT COLUMN: TAB BAR & EDITOR */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
                {/* TAB BAR (Fullscreen Only) */}
                <div className={`flex items-end gap-1 pl-0 pr-3 h-[37px] border-b overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0 select-none ${
                  theme === 'dark' ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-200/60 border-slate-300'
                }`}>
                  {/* STATIC ACTION MENU TAB BUTTON */}
                  <div
                    onClick={() => handleSelectTab(ACTION_MENU_TAB_ID)}
                    className={`group flex items-center justify-end w-[35.5px] py-1.5 pr-2 rounded-tr-lg border-t border-r cursor-pointer transition-all shrink-0 select-none ${
                      activeTabId === ACTION_MENU_TAB_ID
                        ? theme === 'dark'
                          ? 'bg-slate-850 border-slate-700 text-amber-400 font-semibold shadow-2xs'
                          : 'bg-white border-slate-300 text-amber-600 font-semibold shadow-2xs'
                        : theme === 'dark'
                          ? 'bg-slate-800/40 border-transparent text-slate-400 font-semibold hover:text-slate-200 hover:bg-slate-750'
                          : 'bg-slate-200/40 border-transparent text-slate-600 font-semibold hover:text-slate-900 hover:bg-slate-200/80'
                    }`}
                    title={t('Меню действий и no-code пайплайнов')}
                  >
                    <Code 
                      className="w-4 h-4 shrink-0 opacity-80" 
                      strokeWidth={activeTabId === ACTION_MENU_TAB_ID ? 3 : 2}
                    />
                  </div>

                  {tabs.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    return (
                      <div
                        key={tab.id}
                        onClick={() => handleSelectTab(tab.id)}
                        className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-t border-x cursor-pointer text-xs font-medium transition-all max-w-[200px] shrink-0 ${
                          isActive
                            ? theme === 'dark'
                              ? 'bg-slate-850 border-slate-700 text-blue-400 font-semibold shadow-2xs'
                              : 'bg-white border-slate-300 text-blue-600 font-semibold shadow-2xs'
                            : theme === 'dark'
                              ? 'bg-slate-800/40 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                              : 'bg-slate-200/40 border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
                        }`}
                      >
                        {tab.isModified && tab.filePath ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" title={t('Файл изменен (не сохранен)')} />
                        ) : (
                          <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        )}
                        {editingTabId === tab.id ? (
                          <input
                            type="text"
                            value={tab.title}
                            onChange={(e) => handleRenameTab(tab.id, e.target.value)}
                            onBlur={() => setEditingTabId(null)}
                            onKeyDown={(e) => e.key === 'Enter' && setEditingTabId(null)}
                            autoFocus
                            className="bg-transparent outline-none w-full border-b border-blue-500 text-xs px-0.5"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingTabId(tab.id);
                            }}
                            className="truncate flex-1"
                            title={tab.filePath ? tab.filePath : t("Двойной клик для переименования")}
                          >
                            {tab.title}
                          </span>
                        )}

                        {tabs.length > 1 && (
                          <button
                            onClick={(e) => handleCloseTab(e, tab.id)}
                            className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                              theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                            title={t("Закрыть вкладку")}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {tabs.length < 9 && (
                    <button
                      onClick={handleAddTab}
                      className={`flex items-center justify-center w-8 py-1.5 rounded-t-lg border-t border-x transition-colors shrink-0 cursor-pointer ${
                        theme === 'dark'
                          ? 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                          : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
                      }`}
                      title={t("Новая вкладка")}
                    >
                      <Plus className="w-4 h-4 opacity-70" />
                    </button>
                  )}
                </div>

                {/* BODY */}
                <div className="flex-1 p-0 flex flex-col min-h-0 relative">
                  {!isTabsLoaded ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
                      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                      <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{t('Загрузка SQL сессии...')}</span>
                    </div>
                  ) : activeTabId === ACTION_MENU_TAB_ID ? (
                    <ErrorBoundary title={t("Ошибка редактора SQL")} theme={theme} resetKey={activeTabId}>
                      <ActionMenuTabContent
                        theme={theme}
                        activeEngine={activeEngine}
                        isDuckDbRunning={isDuckDbRunning}
                        onExecuteSql={(sqlToExec, dialect, isSeq) => {
                          handleExecuteCurrentEngineQuery(sqlToExec, 1, undefined, false, isSeq ? 'sequential' : undefined);
                        }}
                        onOpenSnippetsManager={(cat, snippetId) => {
                          setSnippetsModalCategory(cat || ACTION_MENU_CATEGORY);
                          if (snippetId) setSnippetsModalEditId(snippetId);
                          setShowSnippetsModal(true);
                        }}
                        onInsertIntoEditor={(sqlToInsert) => {
                          handleInsertSnippet(sqlToInsert);
                        }}
                      />
                    </ErrorBoundary>
                  ) : (
                    <ErrorBoundary title={t("Ошибка редактора SQL")} theme={theme} resetKey={activeTabId}>
                      <SqlEditor editorRef={sqlEditorRef}
                    docId={activeTabId}
                        value={getActiveTabSql()}
                        onChange={handleSqlChange}
                        isWrapSql={isWrapSql}
                        theme={theme}
                        onCompactSql={handleCompactSql}
                        onExecuteQuickAction={handleExecuteQuickAction}
                        extractedTableName={extractedTableName}
                        isQuickActionsEnabled={(uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && !!duckDbResults && duckDbResults.length > 0 && !isAnyQueryRunning}
                        isFullScreen={true}
                        schemaTables={duckDbSchema || undefined}
                      />
                    </ErrorBoundary>
                  )}
                </div>

                {/* CONFIRMATION OVERLAY FOR UNSAVED TAB CLOSE (CONTAINED TO TABS & EDITOR) */}
                {tabToClosePendingConfirm && (
                  <div 
                    onClick={() => setTabToClosePendingConfirm(null)}
                    className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-150"
                  >
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      className={`w-full max-w-sm p-4 rounded-xl border shadow-xl flex flex-col gap-3.5 font-sans ${
                        theme === 'dark' 
                          ? 'bg-slate-850 border-slate-700 text-slate-100' 
                          : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-semibold text-sm ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                            {t('Закрыть несохраненную вкладку?')}
                          </h3>
                          <p className={`text-xs mt-1 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                            {t('Вкладка')} &quot;<span className={`font-medium ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>{tabToClosePendingConfirm.title}</span>&quot; {t('содержит несохраненные изменения')}.
                          </p>
                        </div>
                      </div>
                      <div className={`flex items-center justify-end gap-2 pt-2.5 border-t ${theme === 'dark' ? 'border-slate-700/50' : 'border-slate-200'}`}>
                        <button
                          type="button"
                          onClick={() => setTabToClosePendingConfirm(null)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            theme === 'dark' 
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' 
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {t('Отмена')}
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmCloseTab(tabToClosePendingConfirm.id)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            theme === 'dark'
                              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30'
                              : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                          }`}
                        >
                          {t('Закрыть')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SCHEMA BROWSER */}
              {showDuckDbSchemaPanel && (
                <div 
                  className={`${isSchemaZoomed ? 'w-[50vw]' : 'w-[30vw] min-w-[220px]'} max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-50 max-md:w-[85vw] max-md:min-w-0 max-md:shadow-2xl flex flex-col shrink-0 border-l min-h-0 ${theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-300'}`}
                >
                  {(duckDbConnectedPath || clickhouseConfig) && (
                  <div className={filesSectionMode === 'max' ? 'hidden' : `flex flex-col min-h-0 ${filesSectionMode === 'collapsed' ? 'flex-1' : 'flex-1 basis-0'}`}>
                  <div className={`px-3 h-[37px] border-b flex items-center justify-between shrink-0 transition-colors ${theme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
                    <span className={`text-xs font-semibold flex items-center gap-2 text-sm truncate shrink-0 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      <Database className="w-3.5 h-3.5 text-teal-500" />
                      <span>Schema Browser</span>
                      {isSchemaLoading && (
                        <span className="flex items-center gap-1 text-[10px] font-normal text-blue-400 animate-pulse ml-1">
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => fetchDuckDbSchema(true)}
                        className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                        title={hotkeyHint(t('Обновить схему'), hotkeys, 'refreshSchema')}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSchemaLoading ? 'animate-spin text-blue-400' : ''}`} />
                      </button>
                      <button 
                        onClick={() => setIsSchemaZoomed(!isSchemaZoomed)}
                        className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                        title={isSchemaZoomed ? t("Стандартный размер") : t("Увеличить в 2 раза")}
                      >
                        {isSchemaZoomed ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                      <button 
                        onClick={() => setShowDuckDbSchemaPanel(false)}
                        className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                        title={t("Закрыть")}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {duckDbSchema && groupedDuckDbSchema ? (
                    <>
                      <div className={`p-2 border-b flex items-center gap-1 shrink-0 transition-colors ${theme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-300 bg-slate-100/50'}`}>
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 opacity-50 pointer-events-none" />
                          <input 
                            type="text" 
                            placeholder={t('Поиск...')} 
                            value={schemaSearchTerm}
                            onChange={(e) => setSchemaSearchTerm(e.target.value)}
                            className={`w-full pl-7 ${schemaSearchTerm ? 'pr-7' : 'pr-2'} py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-300 placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-700 placeholder-slate-400'}`}
                          />
                          {schemaSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setSchemaSearchTerm('')}
                              className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors ${
                                theme === 'dark' 
                                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' 
                                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                              }`}
                              title={t('Очистить поиск')}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {!isCH && (
                          <button 
                            onClick={handleAttachDuckDb}
                            className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                            title={t('Прикрепить базу данных (ATTACH)')}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button 
                          onClick={handleExpandAllSchemaNodes}
                          className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                          title={t('Развернуть все')}
                        >
                          <ChevronsUpDown className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setExpandedSchemaNodes({})}
                          className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                          title={t('Свернуть все')}
                        >
                          <ChevronsDownUp className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 text-xs">
                        {Object.keys(groupedDuckDbSchema).length > 0 ? (
                          Object.entries(groupedDuckDbSchema)
                            .sort(([dbA], [dbB]) => {
                              if (dbA.toLowerCase() === 'system') return 1;
                              if (dbB.toLowerCase() === 'system') return -1;
                              return dbA.localeCompare(dbB);
                            })
                            .map(([dbName, schemas]) => {
                              const isCurrentChDb = isCH && (clickhouseConfig?.database || 'default') === dbName;
                              const defaultDuckDbName = (!duckDbConnectedPath || duckDbConnectedPath === ':memory:')
                                ? 'memory'
                                : (duckDbConnectedPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '').toLowerCase() || 'memory');
                              const isDefaultDuckDb = dbName.toLowerCase() === defaultDuckDbName || (!duckDbConnectedPath && ['memory', 'temp'].includes(dbName.toLowerCase()));

                              return (
                                <div key={dbName} className="mb-1">
                                  <div 
                                    className={`group/db text-xs font-bold px-2 py-1 flex items-center justify-between gap-1.5 rounded cursor-pointer select-none transition-colors ${
                                      theme === 'dark' ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-800'
                                    }`}
                                    onClick={() => toggleSchemaNode(`db-${dbName}`)}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <Database className={`w-3.5 h-3.5 shrink-0 ${dbName.toLowerCase() === 'system' ? 'opacity-35' : 'opacity-70'}`} />
                                      <span className="truncate">{dbName}</span>
                                    </div>

                                    {isCH ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSetActiveDatabase(dbName);
                                        }}
                                        title={isCurrentChDb ? t('Текущая база данных (активна для запросов)') : `${t('Сделать активной базой')} "${dbName}"`}
                                        className={`p-0.5 rounded transition-all cursor-pointer ${
                                          isCurrentChDb
                                            ? 'opacity-100'
                                            : 'opacity-0 group-hover/db:opacity-60 hover:!opacity-100 hover:bg-slate-500/10'
                                        }`}
                                      >
                                        <Check className={`w-3.5 h-3.5 ${
                                          isCurrentChDb
                                            ? theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                                            : theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'
                                        }`} />
                                      </button>
                                    ) : (
                                      (() => {
                                        if (isDefaultDuckDb) {
                                          return (
                                            <div
                                              title={t('База данных по умолчанию')}
                                              className="p-0.5 rounded opacity-100"
                                            >
                                              <Check className={`w-3.5 h-3.5 ${
                                                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                                              }`} />
                                            </div>
                                          );
                                        }

                                        if (!['system', 'temp', 'memory'].includes(dbName.toLowerCase())) {
                                          return (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDetachDuckDb(dbName);
                                              }}
                                              title={`${t('Отключить базу (DETACH)')} "${dbName}"`}
                                              className="p-0.5 rounded transition-all cursor-pointer opacity-0 group-hover/db:opacity-60 hover:!opacity-100 hover:bg-slate-500/10"
                                            >
                                              <Unplug className={`w-3.5 h-3.5 ${
                                                theme === 'dark' ? 'text-slate-400 hover:text-rose-400' : 'text-slate-500 hover:text-rose-600'
                                              }`} />
                                            </button>
                                          );
                                        }

                                        return null;
                                      })()
                                    )}
                                  </div>
                                  {expandedSchemaNodes[`db-${dbName}`] && (
                                    <div className="pl-2 border-l ml-2 border-slate-400/20 mt-1">
                                      {Object.entries(schemas).map(([schemaName, types]) => {
                                        const isCurrentDuckSchema = !isCH && isDefaultDuckDb && (activeDuckDbSchema || 'main') === schemaName;

                                        return (
                                          <div key={schemaName} className="mb-1">
                                            {!isCH && (
                                              <div 
                                                className={`group/sch text-[11px] font-semibold px-2 py-1 flex items-center justify-between gap-1.5 rounded cursor-pointer select-none transition-colors ${
                                                  theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-700'
                                                }`}
                                                onClick={() => toggleSchemaNode(`sch-${dbName}-${schemaName}`)}
                                              >
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                  <FileText className="w-3 h-3 shrink-0 opacity-70" />
                                                  <span className="truncate">{schemaName}</span>
                                                </div>

                                                {isDefaultDuckDb && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleSetActiveDuckDbSchema(schemaName);
                                                    }}
                                                    title={isCurrentDuckSchema ? t('Текущая схема (активна для запросов)') : `${t('Сделать активной схемой')} "${schemaName}"`}
                                                    className={`p-0.5 rounded transition-all cursor-pointer ${
                                                      isCurrentDuckSchema
                                                        ? 'opacity-100'
                                                        : 'opacity-0 group-hover/sch:opacity-60 hover:!opacity-100 hover:bg-slate-500/10'
                                                    }`}
                                                  >
                                                    <Check className={`w-3.5 h-3.5 ${
                                                      isCurrentDuckSchema
                                                        ? theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                                                        : theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'
                                                    }`} />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                            {(isCH || expandedSchemaNodes[`sch-${dbName}-${schemaName}`]) && (
                                              <div className={isCH ? "" : "pl-2 border-l ml-2 border-slate-400/20 mt-1"}>
                                                {Object.entries(types)
                                                  .sort(([a], [b]) => {
                                                    const order = ['Tables', 'Views', 'Macros', 'Material Views', 'Dictionaries'];
                                                    const idxA = order.indexOf(a);
                                                    const idxB = order.indexOf(b);
                                                    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
                                                  })
                                                  .map(([typeName, tables]) => (
                                                  <div key={typeName} className="mb-1">
                                                    <div 
                                                      className={`text-[11px] font-semibold px-2 py-1 flex items-center gap-1.5 rounded cursor-pointer select-none transition-colors ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-200 text-slate-600'}`}
                                                      onClick={() => toggleSchemaNode(`type-${dbName}-${schemaName}-${typeName}`)}
                                                    >
                                                      <Folder className="w-3 h-3 opacity-70" />
                                                      <span className="truncate">{typeName}</span>
                                                    </div>
                                                    {expandedSchemaNodes[`type-${dbName}-${schemaName}-${typeName}`] && (
                                                      <div className="pl-2 border-l ml-2 border-slate-400/20 mt-1">
                                                        {Object.entries(tables).map(([tableName, tableData]: any) => {
                                                  const itemInfo = tableData.info || {};
                                                  const cols = tableData.columns;
                                                  const tableKey = buildTableColumnsKey(schemaEngine, dbName, schemaName, tableName);
                                                  const sizeBadge = getTableSizeBadge([itemInfo]);
                                                  const isLoadingCols = !!loadingTableCols[tableKey];
                                                  const isExpanded = !!expandedSchemaNodes[`tbl-${dbName}-${schemaName}-${tableName}`];

                                                  return (
                                                    <div key={tableName} className="mb-1">
                                                      <div 
                                                        draggable={true}
                                                        style={{ WebkitUserDrag: 'element' } as React.CSSProperties}
                                                        onDragStart={(e) => {
                                                          let sel = '';
                                                          if (itemInfo.table_type === 'Macros') {
                                                            sel = dbName === schemaName ? `SELECT "${dbName}"."${tableName}"()` : `SELECT "${dbName}"."${schemaName}"."${tableName}"()`;
                                                          } else {
                                                            const colList = cols && cols.length > 0 ? cols.map((c: any) => `"${c.column_name}"`).join(', ') : '*';
                                                            sel = dbName === schemaName
                                                              ? `SELECT ${colList} FROM "${dbName}"."${tableName}"`
                                                              : `SELECT ${colList} FROM "${dbName}"."${schemaName}"."${tableName}"`;
                                                          }
                                                          e.dataTransfer.setData('text/plain', sel);
                                                          e.dataTransfer.effectAllowed = 'copy';
                                                          (window as any).__currentDragText = sel;
                                                        }}
                                                        className={`group text-[11px] font-medium px-2 py-1 flex items-center justify-between gap-1 rounded cursor-pointer select-none transition-colors ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                                                        onClick={() => handleToggleTableNode(dbName, schemaName, tableName, itemInfo.table_type)}
                                                        onContextMenu={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          setSchemaContextMenu({
                                                            x: e.clientX,
                                                            y: e.clientY,
                                                            dbName,
                                                            schemaName,
                                                            tableName,
                                                            tableType: itemInfo.table_type,
                                                            columns: cols,
                                                          });
                                                        }}
                                                        title={t("Нажмите, чтобы развернуть, или ПКМ для меню")}
                                                      >
                                                        <div className={`flex items-center gap-1.5 truncate ${
                                                          theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
                                                        }`}>
                                                          {itemInfo.table_type === 'Macros' ? (
                                                            <span className="font-serif italic font-bold text-[11px] leading-none shrink-0 opacity-80 select-none pr-0.5" title={t("Нажмите, чтобы развернуть и скопировать название")}>
                                                              fx
                                                            </span>
                                                          ) : itemInfo.table_type === 'Views' || itemInfo.table_type === 'Material Views' ? (
                                                            <FileText className="w-3 h-3 opacity-80 shrink-0" />
                                                          ) : (
                                                            itemInfo.table_type === 'Dictionaries' ? (
                                                             <BookText className="w-3 h-3 opacity-80 shrink-0" />
                                                           ) : (
                                                             <Layout className="w-3 h-3 opacity-70 shrink-0" />
                                                           )
                                                          )}
                                                          <span className="truncate" title={tableName}>{tableName}</span>
                                                          {isLoadingCols && (
                                                            <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400 shrink-0 ml-1" />
                                                          )}
                                                        </div>
                                                        {sizeBadge && (
                                                          <div className="flex items-center gap-1 shrink-0">
                                                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-500/15 text-slate-400 font-mono">
                                                              {sizeBadge}
                                                            </span>
                                                          </div>
                                                        )}
                                                      </div>

                                                      {isExpanded && (
                                                        <div className="pl-4 mt-0.5 space-y-0.5">
                                                          {isLoadingCols ? (
                                                            <div className="flex items-center gap-1.5 py-1 text-[10px] text-blue-400 animate-pulse">
                                                              <Loader2 className="w-3 h-3 animate-spin" />
                                                              <span>{t('Загрузка...')}</span>
                                                            </div>
                                                          ) : cols && cols.length > 0 ? (
                                                            cols.map((col: any, idx: number) => (
                                                              <div 
                                                                key={idx} 
                                                                draggable={true}
                                                                onDragStart={(e) => {
                                                                  e.stopPropagation();
                                                                  const colRef = `${tableName}.${col.column_name}`;
                                                                  e.dataTransfer.setData('text/plain', colRef);
                                                                  e.dataTransfer.effectAllowed = 'copy';
                                                                  (window as any).__currentDragText = colRef;
                                                                }}
                                                                style={{ WebkitUserDrag: 'element' } as React.CSSProperties}
                                                                className={`cursor-pointer text-[10px] flex items-center justify-between gap-2 px-1.5 py-0.5 rounded transition-colors ${theme === 'dark' ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-200'}`}
                                                                onClick={() => {
                                                                  const colKey = `${dbName}.${schemaName}.${tableName}.${col.column_name}`;
                                                                  const colRef = `${tableName}.${col.column_name}`;
                                                                  copyToClipboard(colRef);
                                                                  setCopiedSchemaCol(colKey);
                                                                  setTimeout(() => setCopiedSchemaCol(null), 1500);
                                                                }}
                                                                title={`${col.column_name} (${col.data_type})\n${t('Нажмите или перетащите для вставки')}`}
                                                              >
                                                                <span className="font-mono truncate min-w-0 flex-1" title={col.column_name}>{col.column_name}</span>
                                                                {copiedSchemaCol === `${dbName}.${schemaName}.${tableName}.${col.column_name}` ? (
                                                                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                                                ) : (
                                                                  <span className="text-[9px] opacity-60 shrink-0 font-mono max-w-[120px] truncate text-right" title={col.data_type}>
                                                                    {/^Enum(8|16)?\s*\(/i.test(col.data_type || '') 
                                                                      ? ((col.data_type || '').match(/^(Enum(?:8|16)?)/i)?.[1] || 'Enum') + '(...)' 
                                                                      : (col.data_type || '').length > 22 
                                                                        ? (col.data_type || '').slice(0, 20) + '…' 
                                                                        : col.data_type}
                                                                  </span>
                                                                )}
                                                              </div>
                                                            ))
                                                          ) : (
                                                            <div className="text-[10px] opacity-50 px-1 py-0.5 italic">
                                                              {t('Данные отсутствуют')}
                                                            </div>
                                                          )}
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                        ) : (
                          <div className="py-8 text-center opacity-70 flex flex-col items-center justify-center gap-1.5">
                            <Database className="w-5 h-5 opacity-40" />
                            <span>{schemaSearchTerm ? t('Ничего не найдено по запросу') : t('Таблицы не найдены (БД пуста)')}</span>
                            {schemaSearchTerm && (
                              <button 
                                onClick={() => setSchemaSearchTerm('')}
                                className="text-[11px] text-blue-400 hover:underline mt-1"
                              >
                                {t('Сбросить фильтр')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  ) : isSchemaLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{t('Загрузка схемы базы данных...')}</span>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-50">
                      <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{t('Схема не загружена или пуста')}</span>
                    </div>
                  )}
                  </div>
                  )}
                  <FileTreePanel
                    theme={theme}
                    provider={fileTreeProvider}
                    root={fileTreeRoot}
                    mode={filesSectionMode}
                    onModeChange={setFilesSectionMode}
                    sort={filesSort}
                    onSortChange={setFilesSort}
                    uiScale={uiVisibility.uiScale ?? 100}
                    onPathChanged={handleTreePathChanged}
                    standalone={!(duckDbConnectedPath || clickhouseConfig)}
                    isZoomed={isSchemaZoomed}
                    onToggleZoom={() => setIsSchemaZoomed(z => !z)}
                    onClose={() => setShowDuckDbSchemaPanel(false)}
                    onOpenInTab={handleOpenTreeFile}
                    onOpenExternal={handleOpenTreeExternal}
                  />
                </div>
              )}

              {/* SCHEMA TABLE CONTEXT MENU */}
              {schemaContextMenu && (
                <div
                  className={`fixed z-50 w-40 rounded-lg border shadow-xl py-1 text-xs select-none ${
                    theme === 'dark'
                      ? 'bg-slate-800 border-slate-700 text-slate-200'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                  style={(() => {
                    const scale = (uiVisibility.uiScale ?? 100) / 100;
                    return {
                      left: Math.max(8, Math.min(schemaContextMenu.x / scale, (window.innerWidth / scale) - 170)),
                      top: Math.max(8, Math.min(schemaContextMenu.y / scale, (window.innerHeight / scale) - 160)),
                    };
                  })()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleSchemaContextAction('select')}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{t('Показать')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSchemaContextAction('copySelect')}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{t('Копировать Select')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSchemaContextAction('copyInsert')}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>{t('Копировать Insert')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSchemaContextAction('describe')}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Describe</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSchemaContextAction('ddl')}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>Show DDL</span>
                  </button>
                </div>
              )}
            </div>

            {/* DUCKDB / CLICKHOUSE RESULTS PANEL */}
            {isMaximizedSql && (uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && isDuckDbResultVisible && (
              <div
                onMouseEnter={() => { isResultTableHoveredRef.current = true; }}
                onMouseLeave={() => { isResultTableHoveredRef.current = false; }}
                className={`flex flex-col min-h-0 overflow-hidden z-10 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                } ${
                  isDuckDbResultExpanded 
                    ? 'border-t flex flex-col shrink-0 h-[calc(100%-175px)]' 
                    : 'border-t flex flex-col shrink-0 h-[40%]'
                }`}
              >
                <div className={`relative z-30 flex flex-wrap items-center justify-between px-3 py-1.5 border-b shrink-0 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
                }`}>
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className={`text-xs font-semibold flex items-center gap-2 shrink-0 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      <Database className="w-3.5 h-3.5 text-teal-500" />
                      {t('Результат запроса')}
                    </span>

                    {duckDbResults && (
                      <div className="flex items-center gap-2 text-xs shrink-0">
                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded transition-all ${
                          theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          <span>({t('записей:')} {duckDbResults.length})</span>
                        </div>

                        {queryExecutionDuration !== null && (
                          <div className={`flex items-center gap-1 px-2.5 py-1 rounded transition-all ${
                            theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                          }`}>
                            <span>{queryExecutionDuration} {t('сек')}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          <button
                            disabled={duckDbPage <= 1 || isAnyQueryRunning}
                            onClick={() => handleChangeResultPage(duckDbPage - 1)}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all font-mono disabled:opacity-30 disabled:cursor-not-allowed ${
                              theme === 'dark' ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/40' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-400/30'
                            }`}
                            title={t('Предыдущая страница')}
                          >
                            &lt;
                          </button>
                          <span className={`flex items-center text-xs px-2.5 py-1 rounded transition-all ${
                            theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                          }`}>
                            {t('стр')} {duckDbPage}
                          </span>
                          <button
                            disabled={isAnyQueryRunning || !duckDbResults || duckDbResults.length < effectiveMaxRows}
                            onClick={() => handleChangeResultPage(duckDbPage + 1)}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all font-mono disabled:opacity-30 disabled:cursor-not-allowed ${
                              theme === 'dark' ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/40' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-400/30'
                            }`}
                            title={t('Следующая страница')}
                          >
                            &gt;
                          </button>
                        </div>

                        {/* COLUMN JUMP SELECTOR */}
                        {duckDbResults.length > 0 && (
                          <div className="relative shrink-0">
                            <div className="relative flex items-center">
                              <Search className="w-3.5 h-3.5 absolute left-2 text-slate-400 pointer-events-none" />
                              <input
                                type="text"
                                placeholder={t('Переход')}
                                value={columnSearchTerm}
                                onFocus={() => setShowColumnJumpDropdown(true)}
                                onChange={(e) => {
                                  setColumnSearchTerm(e.target.value);
                                  if (!showColumnJumpDropdown) setShowColumnJumpDropdown(true);
                                }}
                                className={`w-26 pl-7 pr-6 py-0.5 text-xs rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                  theme === 'dark' 
                                    ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500 focus:bg-slate-900' 
                                    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                                }`}
                                title={t('Быстрый поиск и переход к столбцу')}
                              />
                              {columnSearchTerm && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setColumnSearchTerm('');
                                  }}
                                  className="absolute right-1.5 text-slate-400 hover:text-slate-200 text-xs font-bold px-0.5"
                                  title={t('Очистить')}
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            {showColumnJumpDropdown && (
                              <>
                                <div 
                                  className="fixed inset-0 z-30" 
                                  onClick={() => {
                                    setShowColumnJumpDropdown(false);
                                  }} 
                                />
                                <div className={`absolute right-0 top-full mt-1 z-40 rounded-lg border shadow-xl p-1.5 w-[180px] animate-in fade-in duration-150 ${
                                  theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                                }`}>
                                  <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
                                    {resultColumnKeys
                                      .filter(col => col.toLowerCase().includes(columnSearchTerm.toLowerCase()))
                                      .map((col) => {
                                        const isSelected = selectedResultCell?.colKey === col;
                                        return (
                                          <button
                                            key={col}
                                            type="button"
                                            onClick={() => {
                                              handleJumpToColumn(col);
                                              setShowColumnJumpDropdown(false);
                                            }}
                                            title={col}
                                            className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between transition-colors ${
                                              isSelected
                                                ? theme === 'dark'
                                                  ? 'bg-blue-600/25 text-blue-300 font-medium'
                                                  : 'bg-blue-100/70 text-blue-800 font-medium'
                                                : theme === 'dark'
                                                  ? 'hover:bg-slate-700 text-slate-300'
                                                  : 'hover:bg-slate-100 text-slate-700'
                                            }`}
                                          >
                                            <span className="truncate font-mono" title={col}>{col}</span>
                                            {isSelected && <Check className="w-3 h-3 shrink-0 ml-1 text-blue-500" />}
                                          </button>
                                        );
                                      })}
                                    {resultColumnKeys.filter(col => col.toLowerCase().includes(columnSearchTerm.toLowerCase())).length === 0 && (
                                      <div className="text-[11px] text-slate-400 p-2 text-center italic">
                                        {t('Столбцы не найдены')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* VALUE SEARCH SELECTOR */}
                        {duckDbResults.length > 0 && (
                          <div className="relative flex items-center shrink-0">
                            <input
                              type="text"
                              placeholder={t('Поиск')}
                              value={valueSearchTerm}
                              onChange={(e) => setValueSearchTerm(e.target.value)}
                              className={`w-18 pl-2 pr-5 py-0.5 text-xs rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                theme === 'dark' 
                                  ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500 focus:bg-slate-900' 
                                  : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                              }`}
                              title={t('Быстрый поиск значения в результате')}
                            />
                            {valueSearchTerm && (
                              <button
                                type="button"
                                onClick={() => setValueSearchTerm('')}
                                className="absolute right-1 text-slate-400 hover:text-slate-200 text-xs font-bold px-0.5"
                                title={t('Очистить')}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-auto">
                    {/* CANCEL QUERY BUTTON */}
                    {isDuckDbRunning && (
                      <button
                        onClick={handleCancelDuckDbQuery}
                        className="flex items-center justify-center gap-1 text-xs px-2 h-6 rounded font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors mr-1 shadow-2xs shrink-0"
                        title={t('Отменить выполнение текущего запроса')}
                      >
                        <Square className="w-3 h-3 fill-white shrink-0" />
                        <span>{t('Отменить')}</span>
                      </button>
                    )}

                    {/* QUICK ACTIONS BUTTON AND DROPDOWN */}
                    <div className="relative">
                      <button
                        onClick={() => setShowQuickActionsMenu(!showQuickActionsMenu)}
                        disabled={!duckDbResults || duckDbResults.length === 0 || isAnyQueryRunning}
                        className={`h-6 w-6 flex items-center justify-center rounded transition-colors disabled:opacity-40 ${
                          theme === 'dark'
                            ? 'hover:bg-slate-700 text-slate-400'
                            : 'hover:bg-slate-200 text-slate-500'
                        }`}
                        title={t('Быстрые действия над результатами')}
                      >
                        <Zap className="w-4 h-4" />
                      </button>

                      {showQuickActionsMenu && (
                        <>
                          <div 
                            className="fixed inset-0 z-30" 
                            onClick={() => setShowQuickActionsMenu(false)} 
                          />
                          <div className={`absolute top-full mt-1 right-0 z-40 rounded-lg border shadow-xl p-1.5 w-56 animate-in fade-in duration-150 ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                          }`}>
                            <div className={`px-2 py-1 rounded text-xs flex items-center gap-2 border-b mb-0.5 font-mono min-w-0 ${
                              theme === 'dark' ? 'border-slate-700/60 text-slate-400' : 'border-slate-200 text-slate-500'
                            }`} title={extractedTableName}>
                              <Table className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                              <span className="truncate">{extractedTableName}</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto pr-0.5">
                              {quickActions.map((action) => (
                                <button
                                  key={action.id}
                                  onClick={() => handleExecuteQuickAction(action)}
                                  title={t(action.name)}
                                  className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors min-w-0 ${
                                    theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  <span className="truncate">{t(action.name)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* DUCKDB SUMMARIZE BUTTON */}
                    {activeEngine === 'duckdb' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!duckDbResults || duckDbResults.length === 0) return;

                          if (resultsViewMode === 'summarize') {
                            setResultsViewMode('table');
                            setIsDuckDbResultExpanded(preChartExpandedRef.current);
                            return;
                          }

                          if (resultsViewMode === 'table') {
                            preChartExpandedRef.current = isDuckDbResultExpanded;
                          }
                          setIsDuckDbResultExpanded(true);

                          if (summarizeResults && summarizeResults.length > 0) {
                            setResultsViewMode('summarize');
                            return;
                          }

                          setDuckDbError(null);

                          const runRawQuery = (sqlToRun: string): Promise<any[]> => handleExecuteRawQueryForStats(sqlToRun);

                          try {
                            const strippedSql = (lastExecutedSql || '').trim().replace(/;+$/, '');
                            let targetTable = extractedTableName;
                            if (!targetTable || targetTable === 'table') {
                              targetTable = '';
                            }

                            let sqlToRun = targetTable ? `SUMMARIZE ${targetTable}` : (strippedSql ? `SUMMARIZE (\n${strippedSql}\n)` : '');
                            if (!sqlToRun) {
                              throw new Error(t('Нет таблицы или SQL-запроса для выполнения SUMMARIZE'));
                            }

                            let rows: any[] | null = null;
                            try {
                              rows = await runRawQuery(sqlToRun);
                            } catch (firstErr: any) {
                              if (targetTable && strippedSql) {
                                rows = await runRawQuery(`SUMMARIZE (\n${strippedSql}\n)`);
                              } else {
                                throw firstErr;
                              }
                            }

                            if (rows && rows.length > 0) {
                              setSummarizeResults(rows);
                              setResultsViewMode('summarize');
                            } else {
                              throw new Error(t('База данных вернула пустой результат для SUMMARIZE'));
                            }
                          } catch (err: any) {
                            console.error("SUMMARIZE execution error:", err);
                            setDuckDbError(err?.message || String(err));
                          }
                        }}
                        disabled={!duckDbResults || duckDbResults.length === 0}
                        className={`h-6 w-6 flex items-center justify-center rounded transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                          resultsViewMode === 'summarize'
                            ? 'bg-amber-600 text-white hover:bg-amber-500 font-medium'
                            : theme === 'dark'
                              ? 'hover:bg-slate-700 text-slate-400'
                              : 'hover:bg-slate-200 text-slate-500'
                        }`}
                        title={resultsViewMode === 'summarize' ? t("Вернуться к таблице") : t("Экспресс-статистика по столбцам (SUMMARIZE)")}
                      >
                        <TableProperties className="w-4 h-4" />
                      </button>
                    )}

                    {/* CHART / ANALYTICS MODE TOGGLE BUTTON */}
                    <button
                      type="button"
                      onClick={() => {
                        if (resultsViewMode === 'chart') {
                          setResultsViewMode('table');
                          setIsDuckDbResultExpanded(preChartExpandedRef.current);
                        } else {
                          if (resultsViewMode === 'table') {
                            preChartExpandedRef.current = isDuckDbResultExpanded;
                          }
                          setResultsViewMode('chart');
                          setIsDuckDbResultExpanded(true);
                          setStatsInitialMode({ chartType: 'list', listSubMode: 'categories' });
                        }
                      }}
                      disabled={!duckDbResults || duckDbResults.length === 0}
                      className={`h-6 w-6 flex items-center justify-center rounded transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                        resultsViewMode === 'chart'
                          ? 'bg-teal-600 text-white hover:bg-teal-500 font-medium'
                          : theme === 'dark'
                            ? 'hover:bg-slate-700 text-slate-400'
                            : 'hover:bg-slate-200 text-slate-500'
                      }`}
                      title={resultsViewMode === 'chart' ? t("Вернуться к таблице") : t("Визуализировать результаты (Графики)")}
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>

                    {/* TRANSPOSE BUTTON */}
                    <button
                      type="button"
                      onClick={() => setIsTransposed(!isTransposed)}
                      disabled={!duckDbResults || duckDbResults.length === 0 || resultsViewMode === 'chart' || resultsViewMode === 'summarize'}
                      className={`h-6 w-6 flex items-center justify-center rounded transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                        isTransposed
                          ? 'bg-teal-600 text-white hover:bg-teal-500'
                          : theme === 'dark'
                            ? 'hover:bg-slate-700 text-slate-400'
                            : 'hover:bg-slate-200 text-slate-500'
                      }`}
                      title={isTransposed ? t("Обычный вид таблицы") : t("Транспонировать таблицу (строки <-> столбцы)")}
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                    {uiVisibility.showExcelExport !== false && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={handleExportExcel}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (!duckDbResults || duckDbResults.length === 0 || isExportingExcel) return;
                            setShowExcelPresetsMenu(prev => !prev);
                          }}
                          disabled={!duckDbResults || duckDbResults.length === 0 || isExportingExcel}
                          className={`h-6 px-1.5 flex items-center gap-1.5 rounded transition-colors text-xs shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                            theme === 'dark'
                              ? 'hover:bg-slate-700 text-slate-400'
                              : 'hover:bg-slate-200 text-slate-500'
                          }`}
                          title={t("Сформировать Excel отчет (ПКМ: выбор пресета)")}
                        >
                          {isExportingExcel ? (
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                          ) : (
                            <FileSpreadsheet className={`w-4 h-4 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
                          )}
                          <span className="hidden sm:inline">Excel</span>
                        </button>

                        {showExcelPresetsMenu && (
                          <>
                            <div 
                              className="fixed inset-0 z-30" 
                              onClick={() => setShowExcelPresetsMenu(false)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setShowExcelPresetsMenu(false);
                              }}
                            />
                            <div className={`absolute top-full mt-1 right-0 z-40 rounded-lg border shadow-xl p-1.5 w-56 animate-in fade-in duration-150 ${
                              theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                            }`}>
                              <div className={`px-2 py-1 rounded text-xs flex items-center gap-2 border-b mb-0.5 font-mono min-w-0 ${
                                theme === 'dark' ? 'border-slate-700/60 text-slate-400' : 'border-slate-200 text-slate-500'
                              }`} title={t("Пресеты экспорта Excel")}>
                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span className="truncate">{t('Пресеты Excel')}</span>
                              </div>
                              <div className="max-h-60 overflow-y-auto pr-0.5">
                                {getSavedExcelPresets().map((preset) => (
                                  <button
                                    key={preset.id}
                                    onClick={() => {
                                      setShowExcelPresetsMenu(false);
                                      handleExportExcelWithPreset(preset);
                                    }}
                                    title={preset.name}
                                    className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors min-w-0 ${
                                      theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                                    }`}
                                  >
                                    <span className="truncate">{preset.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <button 
                      onClick={handleCopyResultsToClipboard}
                      className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                      }`}
                      title={copied === 'tsv' ? t("Скопировано!") : t("Скопировать результаты (TSV)")}
                    >
                      {copied === 'tsv' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button 
                      onClick={handleCopyResultsAsMarkdown}
                      className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                      }`}
                      title={copied === 'md' ? t("Скопировано!") : t("Скопировать как Markdown")}
                    >
                      {copied === 'md' ? <Check className="w-4 h-4 text-emerald-500" /> : <FileText className="w-4 h-4" />}
                    </button>
                    <button 
                      onClick={handleCopyTableAsImage}
                      className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                      }`}
                      title={copiedTableImage ? t("Скопировано!") : t("Скопировать таблицу как картинку")}
                    >
                      {copiedTableImage ? <Check className="w-4 h-4 text-emerald-500" /> : <ImageIcon className="w-4 h-4" />}
                    </button>
                    {!isDuckDbResultExpanded && (
                      <button 
                        onClick={() => setIsDuckDbResultExpanded(true)}
                        className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                          theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                        }`}
                        title={t("Увеличить таблицу")}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        if (isDuckDbResultExpanded) {
                          setIsDuckDbResultExpanded(false);
                          setIsCellZoomed(false);
                        } else {
                          setIsDuckDbResultVisible(false);
                        }
                      }}
                      className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                      }`}
                      title={isDuckDbResultExpanded ? t("Уменьшить таблицу") : t("Свернуть таблицу")}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {isDuckDbResultExpanded && (
                      <button 
                        onClick={() => {
                          setIsDuckDbResultExpanded(false);
                          setIsDuckDbResultVisible(false);
                          setIsCellZoomed(false);
                        }}
                        className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                          theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                        }`}
                        title={t("Закрыть результаты")}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                
              <div 
                  className="flex-1 overflow-hidden relative flex flex-row min-h-0"
                  onMouseEnter={() => { isResultTableHoveredRef.current = true; }}
                  onMouseLeave={() => { isResultTableHoveredRef.current = false; }}
                >
                  <div ref={resultsTableRef} className="flex-1 min-h-0 overflow-auto p-0 relative">
                    {isDuckDbRunning && resultsViewMode === 'table' ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20 backdrop-blur-sm z-10">
                        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                      </div>
                    ) : duckDbError && resultsViewMode === 'table' ? (
                      <div className="p-4 text-red-500 font-mono text-xs whitespace-pre-wrap">
                        Error: {duckDbError}
                      </div>
                    ) : duckDbResults && duckDbResults.length > 0 ? (
                      resultsViewMode === 'summarize' ? (
                        <DataStatsViewer
                          data={summarizeResults || duckDbResults}
                          theme={theme}
                          isSummarizeMode={true}
                          tableName={extractedTableName}
                          lastExecutedSql={lastExecutedSql || getActiveTabSql()}
                          activeEngine={activeEngine}
                          onExecuteQuery={handleExecuteRawQueryForStats}
                          onInsertSql={handleInsertGeneratedSqlFromStats}
                        />
                      ) : resultsViewMode === 'chart' ? (
                        <DataStatsViewer
                          data={duckDbResults}
                          columns={resultColumns}
                          theme={theme}
                          columnTypes={resultColumnTypes}
                          initialChartType={statsInitialMode.chartType}
                          initialListSubMode={statsInitialMode.listSubMode}
                          onSubModeChange={(ct, sm) => {
                            activeStatsModeRef.current = { chartType: ct, listSubMode: sm };
                          }}
                          tableName={extractedTableName}
                          lastExecutedSql={lastExecutedSql || getActiveTabSql()}
                          activeEngine={activeEngine}
                          onExecuteQuery={handleExecuteRawQueryForStats}
                          onInsertSql={handleInsertGeneratedSqlFromStats}
                        />
                      ) : isTransposed ? (
                        <table className="w-full text-left border-separate border-spacing-0 text-xs">
                          <thead className="sticky top-0 z-20 [transform:translateZ(0)]">
                            <tr className="h-[35px]">
                              <th className={`sticky top-0 left-0 z-30 px-3 h-[35px] font-semibold border-b-[1.5px] border-r-[1.5px] whitespace-nowrap min-w-[140px] max-w-[200px] [transform:translateZ(0)] ${
                                theme === 'dark' ? 'border-b-slate-600 border-r-slate-600 text-slate-200 bg-slate-800' : 'border-b-slate-300 border-r-slate-300 text-slate-800 bg-slate-100'
                              }`}>
                                {t('Поле \\ №')}
                              </th>
                              {displayedResults.map((_, i) => {
                                const rowNum = (duckDbPage - 1) * effectiveMaxRows + i + 1;
                                const isRowSelected = selectedResultCell?.rowIndex === i;
                                return (
                                  <th
                                    key={i}
                                    className={`sticky top-0 z-20 px-3 h-[35px] font-semibold border-b-[1.5px] border-r whitespace-nowrap text-center min-w-[80px] max-w-[200px] [transform:translateZ(0)] ${
                                      isRowSelected
                                        ? theme === 'dark' ? 'bg-blue-950 text-blue-300 border-b-blue-500' : 'bg-blue-100 text-blue-800 border-b-blue-500'
                                        : theme === 'dark' ? 'border-b-slate-600 border-r-slate-700/80 text-slate-200 bg-slate-800' : 'border-b-slate-300 border-r-slate-200 text-slate-800 bg-slate-100'
                                    }`}
                                  >
                                    #{rowNum}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {displayedResults.length > 0 && resultColumnKeys.map((colKey) => {
                              const isColSelected = isColHighlighted(colKey);
                              const isColCopied = copiedResultCell?.rowIndex === -1 && copiedResultCell?.colKey === colKey;
                              return (
                                <tr key={colKey}>
                                  <td 
                                    id={`th-col-${colKey}`}
                                    className={`sticky left-0 z-10 px-3 py-1.5 font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] cursor-pointer border-r-[1.5px] border-b [transform:translateZ(0)] ${
                                      isColSelected
                                        ? theme === 'dark' ? 'bg-blue-950 text-blue-200 border-r-blue-500 border-b-slate-700/80 font-bold' : 'bg-blue-100 text-blue-900 border-r-blue-500 border-b-slate-200 font-bold'
                                        : theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-r-slate-600 border-b-slate-700/80' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-r-slate-300 border-b-slate-200'
                                    }`}
                                    title={`${colKey}${resultColumnTypes[colKey] ? ` (${formatColumnType(resultColumnTypes[colKey])})` : ''}`}
                                    onClick={(e) => handleColumnHeaderClick(e, colKey)}
                                    onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                                    onContextMenu={(e) => handleColumnHeaderContextMenu(e, colKey)}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate">{colKey}</span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {isColCopied && (
                                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        )}
                                        {activeSqlSorts.find(s => s.colKey === colKey) && (
                                          <span className="text-[10px] text-blue-400 font-bold shrink-0">
                                            {activeSqlSorts.find(s => s.colKey === colKey)?.dir === 'ASC' ? '▲' : '▼'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  {displayedResults.map((row, i) => {
                                    const val = row[colKey];
                                    const isCellSelected = selectedResultCell?.rowIndex === i && selectedResultCell?.colKey === colKey;
                                    const isCellCopied = copiedResultCell?.rowIndex === i && copiedResultCell?.colKey === colKey;
                                    const isRowSelected = selectedResultCell?.rowIndex === i;

                                    let cellClasses = 'px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[288px] cursor-pointer border-r border-b ';
                                    if (isCellSelected) {
                                      cellClasses += theme === 'dark' ? 'bg-blue-600/40 text-blue-100 font-semibold border-r-slate-700/80 border-b-slate-700/80' : 'bg-blue-500/25 text-blue-950 font-semibold border-r-slate-200 border-b-slate-200';
                                    } else if (isRowSelected || isColSelected) {
                                      cellClasses += theme === 'dark' ? 'bg-blue-950/40 text-slate-300 border-slate-700/80' : 'bg-blue-50/70 text-slate-800 border-slate-200';
                                    } else {
                                      cellClasses += theme === 'dark' ? 'border-r-slate-700/80 border-b-slate-700/80 text-slate-400 hover:bg-slate-700/50' : 'border-r-slate-200 border-b-slate-200 text-slate-600 hover:bg-slate-200/50';
                                    }

                                    const valStr = val === null ? null : formatCellValue(val);
                                    const displayVal = valStr === null ? null : (valStr.length > 200 ? valStr.substring(0, 200) + '…' : valStr);

                                    return (
                                      <td
                                        key={i}
                                        className={cellClasses}
                                        title={valStr === null ? 'null' : (valStr.length > 200 ? valStr.substring(0, 200) + '...' : valStr)}
                                        onClick={() => {
                                          releaseEditorFocus();
                                          setSelectedResultCell({ rowIndex: i, colKey });
                                          setDuckDbSelectedCell({ title: t(t('Значение')), content: valStr === null ? 'null' : valStr });
                                        }}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setSelectedResultCell({ rowIndex: i, colKey });
                                          setResultTableContextMenu({ x: e.clientX, y: e.clientY, colKey, cellValue: val, rowIndex: i });
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                                          <span className="truncate">{displayVal === null ? <span className="opacity-50 italic">null</span> : displayVal}</span>
                                          {isCellCopied && (
                                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 inline-block" />
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <table ref={tableSizingRef} className="w-full text-left border-separate border-spacing-0 text-xs">
                          <thead className="sticky top-0 z-20 [transform:translateZ(0)]">
                            <tr className="h-[35px]">
                              <th className={`sticky top-0 left-0 z-30 px-2 h-[35px] font-semibold border-b-[1.5px] border-r-[1.5px] text-center w-12 shrink-0 select-none [transform:translateZ(0)] ${
                                theme === 'dark' ? 'border-b-slate-600 border-r-slate-600 text-slate-200 bg-slate-800' : 'border-b-slate-300 border-r-slate-300 text-slate-800 bg-slate-100'
                              }`}>
                                #
                              </th>
                              {resultColumnKeys.map((col) => {
                                const isColSelected = isColHighlighted(col);
                                const isColCopied = copiedResultCell?.rowIndex === -1 && copiedResultCell?.colKey === col;
                                const sortInfo = activeSqlSorts.find(s => s.colKey === col);
                                const isFiltered = activeSqlFilters.some(f => f.colKey === col);
                                const safeKey = getCssVarSafeName(col);
                                return (
                                  <th 
                                    key={col} 
                                    id={`th-col-${col}`}
                                    style={{
                                      width: `var(--cw-${safeKey}, auto)`,
                                      minWidth: `var(--cw-${safeKey}, auto)`,
                                      maxWidth: `var(--cw-${safeKey}, 180px)`
                                    }}
                                    className={`relative group sticky top-0 z-20 px-3 h-[35px] font-semibold border-b-[1.5px] border-r overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer [transform:translateZ(0)] ${
                                      isColSelected
                                        ? theme === 'dark'
                                          ? 'border-b-blue-500 border-r-slate-700/80 text-blue-300 bg-blue-950 font-bold'
                                          : 'border-b-blue-500 border-r-slate-200 text-blue-800 bg-blue-100 font-bold'
                                        : theme === 'dark' 
                                          ? 'border-b-slate-600 border-r-slate-700/80 text-slate-200 bg-slate-800 hover:bg-slate-700' 
                                          : 'border-b-slate-300 border-r-slate-200 text-slate-800 bg-slate-100 hover:bg-slate-200'
                                    }`}
                                    title={`${col.length > 200 ? col.substring(0, 200) + '...' : col}${resultColumnTypes[col] ? ` (${formatColumnType(resultColumnTypes[col])})` : ''}`}
                                    onClick={(e) => handleColumnHeaderClick(e, col)}
                                    onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                                    onContextMenu={(e) => handleColumnHeaderContextMenu(e, col)}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate">{col}</span>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        {isColCopied && (
                                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        )}
                                        {sortInfo && (
                                          <span className="text-[10px] text-blue-400 font-bold">
                                            {sortInfo.dir === 'ASC' ? '▲' : '▼'}
                                          </span>
                                        )}
                                        {isFiltered && (
                                          <Filter className="w-3 h-3 text-amber-400" />
                                        )}
                                      </div>
                                    </div>
                                    <div
                                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize select-none group/resizer z-30 flex items-center justify-end"
                                      onMouseDown={(e) => handleResizeMouseDown(e, col)}
                                      onDoubleClick={(e) => handleResetColWidth(e, col)}
                                      onClick={(e) => e.stopPropagation()}
                                      title={t("Потяните для изменения ширины. Двойной клик — сброс (Auto-fit)")}
                                    >
                                      <div className={`w-[2px] h-full opacity-0 group-hover/resizer:opacity-100 transition-opacity ${theme === 'dark' ? 'bg-blue-400' : 'bg-blue-600'}`} />
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {displayedResults.map((row, i) => {
                              const rowNum = (duckDbPage - 1) * effectiveMaxRows + i + 1;
                              const isRowSelected = selectedResultCell?.rowIndex === i;
                              return (
                                <tr key={i}>
                                  <td className={`sticky left-0 z-10 px-2 py-1.5 text-center font-mono text-[11px] select-none shrink-0 border-r-[1.5px] border-b [transform:translateZ(0)] ${
                                    isRowSelected
                                      ? theme === 'dark'
                                        ? 'text-blue-300 bg-blue-950 border-r-blue-500 border-b-slate-700/80 font-bold'
                                        : 'text-blue-800 bg-blue-100 border-r-blue-500 border-b-slate-200 font-bold'
                                      : theme === 'dark' 
                                        ? 'text-slate-300 bg-slate-900 border-r-slate-600 border-b-slate-700/80' 
                                        : 'text-slate-600 bg-slate-100 border-r-slate-300 border-b-slate-200'
                                  }`}>
                                    {rowNum}
                                  </td>
                                  {resultColumnKeys.map((colKey, j) => {
                                    const val: any = (row as any)[colKey];
                                    const isCellSelected = selectedResultCell?.rowIndex === i && selectedResultCell?.colKey === colKey;
                                    const isCellCopied = copiedResultCell?.rowIndex === i && copiedResultCell?.colKey === colKey;
                                    const isColSelected = isColHighlighted(colKey);
                                    const safeKey = getCssVarSafeName(colKey);

                                    let cellClasses = `px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer border-r border-b `;

                                    if (isCellSelected) {
                                      cellClasses += theme === 'dark'
                                        ? 'bg-blue-600/40 text-blue-100 font-semibold z-10 border-r-slate-700/80 border-b-slate-700/80'
                                        : 'bg-blue-500/25 text-blue-950 font-semibold z-10 border-r-slate-200 border-b-slate-200';
                                    } else if (isRowSelected && isColSelected) {
                                      cellClasses += theme === 'dark'
                                        ? 'bg-blue-600/25 text-slate-200 border-slate-700/80'
                                        : 'bg-blue-500/20 text-slate-900 border-slate-200';
                                    } else if (isRowSelected || isColSelected) {
                                      cellClasses += theme === 'dark'
                                        ? 'bg-blue-950/40 text-slate-300 border-slate-700/80'
                                        : 'bg-blue-50/70 text-slate-800 border-slate-200';
                                    } else {
                                      cellClasses += theme === 'dark'
                                        ? 'border-r-slate-700/80 border-b-slate-700/80 text-slate-400 hover:bg-slate-700/50'
                                        : 'border-r-slate-200 border-b-slate-200 text-slate-600 hover:bg-slate-200/50';
                                    }

                                    const valStr = val === null ? null : formatCellValue(val);
                                    const displayVal = valStr === null ? null : (valStr.length > 200 ? valStr.substring(0, 200) + '…' : valStr);

                                    return (
                                      <td 
                                        key={j} 
                                        style={{
                                          width: `var(--cw-${safeKey}, auto)`,
                                          minWidth: `var(--cw-${safeKey}, auto)`,
                                          maxWidth: `var(--cw-${safeKey}, 288px)`
                                        }}
                                        className={cellClasses}
                                        title={valStr === null ? 'null' : (valStr.length > 200 ? valStr.substring(0, 200) + '...' : valStr)}
                                        onClick={() => {
                                          releaseEditorFocus();
                                          setSelectedResultCell({ rowIndex: i, colKey });
                                          setDuckDbSelectedCell({ title: t(t('Значение')), content: valStr === null ? 'null' : valStr });
                                        }}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setSelectedResultCell({ rowIndex: i, colKey });
                                          setResultTableContextMenu({
                                            x: e.clientX,
                                            y: e.clientY,
                                            colKey,
                                            cellValue: val,
                                            rowIndex: i
                                          });
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                                          <span className="truncate">{displayVal === null ? <span className="opacity-50 italic">null</span> : displayVal}</span>
                                          {isCellCopied && (
                                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 inline-block" />
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )
                    ) : duckDbResults && duckDbResults.length === 0 ? (
                      <div className={`p-4 text-xs italic ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                        {t('Запрос выполнен успешно. Данные отсутствуют.')}
                      </div>
                    ) : null}
                  </div>
                  {duckDbSelectedCell && resultsViewMode === 'table' && (
                    <div 
                      className={`${isCellZoomed ? 'w-[50vw]' : 'w-[30vw] min-w-[220px]'} border-l flex flex-col shrink-0 ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-slate-50'}`}
                    >
                      <div className={`flex items-center justify-between px-3 h-[35px] border-b-[1.5px] shrink-0 box-border ${theme === 'dark' ? 'border-b-slate-600' : 'border-b-slate-300'}`}>
                        <span className={`text-xs font-semibold truncate max-w-[180px] ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                          {duckDbSelectedCell.title}
                        </span>
                        <div className="flex items-center gap-1">
                          <button 
                            type="button"
                            onClick={async () => {
                              if (!isCellSqlHighlighted && duckDbSelectedCell?.content && !duckDbSelectedCell.content.includes('\n')) {
                                try {
                                  const fmtSettings = getSavedFormatterSettings();
                                  const { format: formatSql } = await import('sql-formatter');
                                  const formatted = formatSql(duckDbSelectedCell.content, {
                                    language: 'sql',
                                    keywordCase: fmtSettings.keywordCase,
                                    tabWidth: fmtSettings.tabWidth,
                                    useTabs: fmtSettings.useTabs,
                                    expressionWidth: 20,
                                    denseOperators: fmtSettings.denseOperators,
                                  });
                                  setDuckDbSelectedCell(prev => prev ? { ...prev, content: formatted } : prev);
                                } catch (e) {
                                  console.warn('SQL formatting in cell failed:', e);
                                }
                              }
                              setIsCellSqlHighlighted(!isCellSqlHighlighted);
                            }}
                            className={`p-1 rounded transition-colors ${
                              isCellSqlHighlighted
                                ? 'bg-teal-600 text-white hover:bg-teal-500 font-medium'
                                : theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                            }`}
                            title={isCellSqlHighlighted ? t("Отключить подсветку SQL") : t("Включить подсветку SQL")}
                          >
                            <Code className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => {
                              if ((selectedResultCell?.rowIndex === -1 && selectedResultCell?.colKey) || duckDbSelectedCell.title.startsWith(t('Столбец:'))) {
                                const colKey = selectedResultCell?.colKey || duckDbSelectedCell.title.replace(new RegExp(`^${t('Столбец:')}\\s*`), '');
                                const rows = (displayedResults || []).map(r => {
                                  const v = r[colKey];
                                  return v === null || v === undefined ? 'null' : String(v);
                                });
                                copyToClipboard([colKey, ...rows].join('\n'));
                              } else {
                                copyToClipboard(duckDbSelectedCell.content);
                              }
                              setCopiedCellValue(true);
                              setTimeout(() => setCopiedCellValue(false), 2000);
                            }}
                            className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                            title={copiedCellValue ? t("Скопировано!") : t("Скопировать значение")}
                          >
                            {copiedCellValue ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            onClick={() => setIsCellZoomed(!isCellZoomed)}
                            className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                            title={isCellZoomed ? t("Стандартный размер") : t("Увеличить в 2 раза")}
                          >
                            {isCellZoomed ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            onClick={() => {
                              setDuckDbSelectedCell(null);
                              setSelectedResultCell(null);
                              setIsCellSqlHighlighted(false);
                            }}
                            className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                            title={t("Закрыть")}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className={`flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap select-text [word-break:break-word] ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                        {isCellSqlHighlighted ? (
                          <div 
                            dangerouslySetInnerHTML={{ 
                              __html: getBaseHighlight(duckDbSelectedCell.content, theme) 
                            }} 
                          />
                        ) : (
                          duckDbSelectedCell.content
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* EXECUTE CONTEXT MENU */}
            {executeContextMenu && (
              <div 
                className={`fixed z-[99999] [transform:translateZ(0)] min-w-[200px] rounded-lg border shadow-xl py-1 text-xs select-none ${
                  theme === 'dark' 
                    ? 'bg-slate-800 border-slate-700 text-slate-200' 
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
                style={(() => {
                  const scale = (uiVisibility.uiScale ?? 100) / 100;
                  return {
                    left: Math.max(8, Math.min(executeContextMenu.x / scale, (window.innerWidth / scale) - 240)),
                    top: Math.max(8, Math.min(executeContextMenu.y / scale, (window.innerHeight / scale) - 100)),
                  };
                })()}
              >
                <button 
                  type="button"
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                  onClick={() => {
                    handleExecuteCurrentEngineQuery(executeContextMenu.text, 1, undefined, false, 'sequential');
                    setExecuteContextMenu(null);
                  }}
                >
                  <ListTree className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>{t('Последовательное выполнение')}</span>
                </button>
                <button 
                  type="button"
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                  onClick={() => {
                    handleExecuteCurrentEngineQuery(executeContextMenu.text, 1, undefined, false, 'parallel');
                    setExecuteContextMenu(null);
                  }}
                >
                  <Network className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <span>{t('Параллельное выполнение')}</span>
                </button>
              </div>
            )}

            {/* RESULTS TABLE CONTEXT MENU */}
            {resultTableContextMenu && (
              <div
                className={`fixed z-[99999] [transform:translateZ(0)] w-52 rounded-lg border shadow-2xl py-1 text-xs select-none ${
                  theme === 'dark'
                    ? 'bg-slate-800 border-slate-600 text-slate-100'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
                style={(() => {
                  const scale = (uiVisibility.uiScale ?? 100) / 100;
                  return {
                    left: Math.max(8, Math.min(resultTableContextMenu.x / scale, (window.innerWidth / scale) - 220)),
                    top: Math.max(8, Math.min(resultTableContextMenu.y / scale, (window.innerHeight / scale) - 340)),
                  };
                })()}
                onClick={(e) => e.stopPropagation()}
              >
                {!isMultiColumnMenu && (
                <>
                {/* SORT ASC */}
                <button
                  type="button"
                  onClick={() => {
                    handleApplyTableSort(resultTableContextMenu.colKey, 'ASC');
                    setResultTableContextMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                    theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                  }`}
                >
                  <ArrowUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>ORDER BY (ASC)</span>
                </button>

                {/* SORT DESC */}
                <button
                  type="button"
                  onClick={() => {
                    handleApplyTableSort(resultTableContextMenu.colKey, 'DESC');
                    setResultTableContextMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                    theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                  }`}
                >
                  <ArrowDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>ORDER BY (DESC)</span>
                </button>

                </>
                )}

                {/* HEADER-ONLY ACTIONS (GROUP BY, REMOVE/KEEP COLS, DISTINCT & NULL/EMPTY FILTERS) */}
                {resultTableContextMenu.cellValue === undefined && (
                  <>
                    {/* GROUP BY */}
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyColumnAction('group', menuColumns);
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 border-slate-700/60' : 'hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="truncate">{isMultiColumnMenu ? 'GROUP BY' : `GROUP BY "${resultTableContextMenu.colKey}"`}</span>
                    </button>

                    {/* REMOVE COLS */}
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyColumnAction('remove', menuColumns);
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 border-slate-700/60' : 'hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="truncate">{isMultiColumnMenu ? 'REMOVE COLS' : 'REMOVE COL'}</span>
                    </button>

                    {/* KEEP COLS */}
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyColumnAction('keep', menuColumns);
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 border-slate-700/60' : 'hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <Columns className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{isMultiColumnMenu ? 'KEEP COLS' : 'KEEP COL'}</span>
                    </button>

                    {/* DISTINCT */}
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyColumnAction('distinct', menuColumns);
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 border-slate-700/60' : 'hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">{isMultiColumnMenu ? 'DISTINCT' : `DISTINCT "${resultTableContextMenu.colKey}"`}</span>
                    </button>

                    {!isMultiColumnMenu && (
                    <>
                    {/* NULL / EMPTY FILTERS */}
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyTableFilter(resultTableContextMenu.colKey, null, 'IS NULL');
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors border-t ${
                        theme === 'dark' ? 'hover:bg-slate-700 border-slate-700/60' : 'hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">WHERE IS NULL</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleApplyTableFilter(resultTableContextMenu.colKey, null, 'IS NOT NULL');
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                      }`}
                    >
                      <Filter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">WHERE IS NOT NULL</span>
                    </button>
                    </>
                    )}
                  </>
                )}

                {/* FILTER BY CELL VALUE (IF CELL CLICKED) */}
                {resultTableContextMenu.cellValue !== undefined && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyTableFilter(resultTableContextMenu.colKey, resultTableContextMenu.cellValue, '=');
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors border-t ${
                        theme === 'dark' ? 'hover:bg-slate-700 border-slate-700/60' : 'hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <Filter className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate">
                        WHERE = {resultTableContextMenu.cellValue === null ? 'NULL' : `'${String(resultTableContextMenu.cellValue)}'`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleApplyTableFilter(resultTableContextMenu.colKey, resultTableContextMenu.cellValue, '<>');
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                      }`}
                    >
                      <Filter className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="truncate">
                        WHERE &lt;&gt; {resultTableContextMenu.cellValue === null ? 'NULL' : `'${String(resultTableContextMenu.cellValue)}'`}
                      </span>
                    </button>

                    {resultTableContextMenu.cellValue !== null && resultTableContextMenu.cellValue !== undefined && (
                      <button
                        type="button"
                        onClick={() => {
                          handleApplyTableFilter(resultTableContextMenu.colKey, resultTableContextMenu.cellValue, 'LIKE');
                          setResultTableContextMenu(null);
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                          theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">
                          WHERE LIKE '%{String(resultTableContextMenu.cellValue)}%'
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* FOOTER */}
            <div className={`px-4 py-2 border-t flex flex-wrap items-center justify-between shrink-0 relative z-40 ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-300/80 border-slate-400/60'
            }`}>
              <div className="flex flex-wrap items-center gap-3 narrow-scroll-x max-md:w-full">
                {/* SETTINGS BUTTON */}
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className={`p-1 rounded transition-colors flex items-center gap-1 ${
                    theme === 'dark' 
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40' 
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-400/30'
                  }`}
                  title={t('Настройки и масштаб интерфейса')}
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>

                {/* PRESETS BUTTON & POPOVER IN FOOTER */}
                {uiVisibility.showPresets && (
                <div className="relative">
                  <button
                    onClick={() => setShowPresetsDropdown(!showPresetsDropdown)}
                    className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 font-medium ${
                      showPresetsDropdown
                        ? (theme === 'dark' ? 'bg-slate-700/80 text-slate-100 border border-slate-600' : 'bg-slate-400/40 text-slate-900 border border-slate-400')
                        : (theme === 'dark' 
                            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 border border-transparent' 
                            : 'text-slate-700 hover:text-slate-900 hover:bg-slate-400/30 border border-transparent')
                    }`}
                    title={t('Готовые шаблоны и примеры SQL')}
                  >
                    <span>{t('Пресеты')}</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>

                  {showPresetsDropdown && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowPresetsDropdown(false)} 
                      />
                      <div className={`absolute bottom-full mb-2 left-0 max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:mb-0 max-md:w-auto max-md:max-h-[70vh] max-md:overflow-y-auto z-50 rounded-lg border shadow-2xl p-2 w-80 animate-in fade-in duration-150 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                      }`}>
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-600/40 mb-1.5">
                          <span className="text-xs uppercase font-bold text-slate-400">{t('Готовые SQL пресеты')}</span>
                          <button 
                            onClick={() => setShowPresetsDropdown(false)}
                            className="p-0.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                          {sqlPresets.map((preset) => (
                            <button
                              key={preset.id}
                              onClick={() => {
                                handlePresetChange(preset.id);
                                setShowPresetsDropdown(false);
                              }}
                              className={`w-full text-left p-2 rounded transition-all text-xs flex flex-col gap-0.5 border ${
                                activePresetId === preset.id
                                  ? theme === 'dark' ? 'bg-amber-950/50 border-amber-500/60 text-amber-200 font-semibold' : 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                                  : theme === 'dark' ? 'hover:bg-slate-700/60 border-transparent text-slate-300' : 'hover:bg-slate-100 border-transparent text-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="truncate pr-1 font-medium">{preset.title}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-300 font-mono shrink-0">
                                  {preset.dialect}
                                </span>
                              </div>
                              {preset.description && (
                                <span className="text-[10px] text-slate-400 line-clamp-1 leading-tight font-normal">
                                  {preset.description}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                )}

                {(uiVisibility.showSearchSql ?? true) && (
                <button
                  onClick={(e) => {
                    sqlEditorRef.current?.openSearch?.(false);
                  }}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
                    theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={t('Поиск и замена текста (Ctrl+F / Ctrl+H)')}
                >
                  <Search className="w-3.5 h-3.5 text-blue-500" />
                  <span>{t('Поиск')}</span>
                </button>
                )}

                <button
                  onClick={() => setIsWrapSql(!isWrapSql)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
                    isWrapSql
                      ? 'bg-blue-600 text-white font-bold'
                      : theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={t('Перенос строки')}
                >
                  <WrapText className="w-3.5 h-3.5" />
                  <span>{t('Перенос')}</span>
                </button>

                {uiVisibility.showFormatSql && (
                <button
                  onClick={handleFormatSql}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
                    theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={hotkeyHint(t('Форматировать SQL'), hotkeys, 'formatSql')}
                >
                  {isFormatted ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <AlignLeft className="w-3.5 h-3.5" />
                  )}
                  <span>{t('Формат')}</span>
                </button>
                )}

                {uiVisibility.showCompactSql !== false && (
                <button
                  onClick={handleCompactSql}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
                    theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={hotkeyHint(t('Формат в одну строку'), hotkeys, 'compactSql')}
                >
                  {isCompacted ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Shrink className="w-3.5 h-3.5" />
                  )}
                </button>
                )}

                {uiVisibility.showCopySql && (
                <button
                  onClick={handleCopySql}
                  className={`flex items-center gap-1 text-xs px-2 py-1 transition-colors ${
                    theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-800 hover:text-slate-950'
                  }`}
                  title={t('Скопировать SQL')}
                >
                  {copied === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'sql' ? t('Скопировано!') : t('Скопировать SQL')}</span>
                </button>
                )}

                {(uiVisibility.showWin1251Button ?? true) && (
                <button
                  onClick={() => isTauriEnvironment() || isTauriEnv ? openWithTauriAndDelegate(handleOpenFileWin1251) : win1251FileInputRef.current?.click()}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-all ${
                    theme === 'dark' 
                      ? 'text-slate-300 hover:text-slate-100' 
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title={t('Открыть файл в кодировке Windows-1251')}
                >
                  <span>Win-1251</span>
                </button>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {(uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && (duckDbResults !== null || duckDbError !== null) && !isDuckDbResultVisible && (
                  <button
                    onClick={() => setIsDuckDbResultVisible(true)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold text-xs shadow-sm transition-all ${
                      theme === 'dark'
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    }`}
                    title={t('Развернуть результат запроса')}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>{t('Результат')}</span>
                  </button>
                )}
                {(uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && activeTabId !== ACTION_MENU_TAB_ID && (
                <button
                  onClick={handleExecuteDuckDb}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isAnyQueryRunning) return;
                    
                    let queryToExecute = sqlRef.current;
                    const editorSelection = sqlEditorRef.current?.getSelection();
                    if (editorSelection && editorSelection.start !== editorSelection.end) {
                      queryToExecute = editorSelection.text;
                    }

                    setExecuteContextMenu({ x: e.clientX, y: e.clientY, text: queryToExecute });
                  }}
                  disabled={isAnyQueryRunning}
                  className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg font-bold text-xs shadow-md transition-all ${
                    isAnyQueryRunning
                      ? 'bg-slate-500 cursor-not-allowed text-white opacity-80'
                      : theme === 'dark'
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-teal-500 hover:bg-teal-600 text-white'
                  }`}
                  title={t('Выполнить запрос в DB')}
                >
                  {isAnyQueryRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                  <span>{t('Выполнить')}</span>
                </button>
                )}
                {activeTabId !== ACTION_MENU_TAB_ID && (
                <button
                  onClick={() => {
                    handleVisualize();
                    setIsMaximizedSql(false);
                  }}
                  className="flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Visualize</span>
                </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SQL SNIPPETS & BUILDER MODAL */}
      <SqlSnippetsManager
        isOpen={showSnippetsModal}
        initialEditSnippetId={snippetsModalEditId}
        onClose={() => {
          setShowSnippetsModal(false);
          setSnippetsModalCategory(undefined);
          setSnippetsModalEditId(undefined);
        }}
        onInsertSnippet={handleInsertSnippet}
        theme={theme}
        uiVisibility={uiVisibility}
        initialCategory={snippetsModalCategory}
      />

      {/* SETTINGS & HOTKEYS MODAL */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        theme={theme}
        hotkeys={hotkeys}
        onUpdateHotkeys={setHotkeys}
        formatterSettings={formatterSettings}
        onUpdateFormatterSettings={setFormatterSettings}
        uiVisibility={uiVisibility}
        onUpdateUiVisibility={setUiVisibility}
        onBeforeImport={async () => {
          if (duckDbConnectedPath || clickhouseConfig) {
            await handleDisconnectDuckDb();
          }
        }}
      />

      {/* VERSION HISTORY MODAL */}
      <VersionHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        currentSql={getActiveTabSql()}
        currentDialect={dialect}
        currentTabTitle={activeTabTitleRef.current}
        onRestoreVersion={(restoredSql, restoredDialect) => {
          sqlRef.current = restoredSql; setTabs(prev => setTabSql(prev, activeTabId, restoredSql));
          if (restoredDialect) {
            setDialect(restoredDialect as any);
          }
        }}
        theme={theme}
        uiVisibility={uiVisibility}
      />

      {/* WASM FILE MANAGER MODAL */}
      <WasmFileManagerModal
        isOpen={showWasmFileModal}
        onClose={() => setShowWasmFileModal(false)}
        theme={theme}
        onSchemaRefresh={() => fetchDuckDbSchema(true)}
      />

      {/* CLICKHOUSE CONFIG MODAL */}
      <ClickhouseModal
        isOpen={showClickhouseModal}
        onClose={() => setShowClickhouseModal(false)}
        config={clickhouseConfig}
        onConnect={(cfg) => {
          if (duckDbConnectedPath) {
            handleDisconnectDuckDb();
          }
          setClickhouseConfig(cfg);
          setActiveEngine('clickhouse');
          setShowDuckDbSchemaPanel(true);
        }}
        onDisconnect={() => {
          setClickhouseConfig(null);
          if (activeEngine === 'clickhouse') {
            setActiveEngine('duckdb');
          }
        }}
        theme={theme}
        fetchApiJson={fetchApiJson}
      />



    </div>
  );
}
