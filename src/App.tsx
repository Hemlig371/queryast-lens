// @ts-nocheck
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  useNodesState, 
  useEdgesState, 
  BackgroundVariant,
  getNodesBounds,
  getViewportForBounds
} from '@xyflow/react';
import { toPng, toSvg, toJpeg, toBlob } from 'html-to-image';
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
  Workflow,
  History,
  ChevronUp,
  Folder,
  ChevronsUpDown,
  ChevronsDownUp,
  Square,
  Table,
  Zap,
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
import { nodeTypes } from './components/CustomNodes';
import { sqlPresets, SQLPreset } from './components/SQLPresets';
import { SqlSnippetsManager } from './components/SqlSnippetsManager';
import { SqlEditor, SqlEditorRef, highlightSqlHtml } from './components/SqlEditor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsModal, getSavedHotkeys, getSavedFormatterSettings, FormatterSettings, getSavedUiVisibilitySettings, UiVisibilitySettings, QuickActionTemplate, getQuickActionTemplates } from './components/SettingsModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { saveVersion, getVersions, getLatestVersion } from './utils/versionHistory';
import { format as formatSql } from 'sql-formatter';
import { splitBySemicolonIgnoringQuotes } from './lib/sqlUtils';
import { getSessionTabs, saveSessionTabs } from './utils/sessionStorage';
import { connectDuckDbWasmFile, connectDuckDbWasmMemory, queryDuckDbWasm, disconnectDuckDbWasm, exportDuckDbFile, applyDuckDbConfigWasm } from './lib/duckdbWasm';
import { ClickhouseModal } from './components/ClickhouseModal';
import { ClickhouseConfig, parseClickhouseCopy, getClickhouseUrl, getClickhouseHeaders, isTauriEnvironment, executeClickhouseQueryTauri, executeClickhouseCopyToTauri, executeClickhouseCopyFromTauri, cancelClickhouseQueryTauri } from './lib/clickhouse';
import { getSchemaCache, saveSchemaCache } from './utils/schemaDbCache';

export interface EditorTab {
  id: string;
  title: string;
  sql: string;
  originalSql?: string;
  filePath?: string;
  savedContent?: string;
  isModified?: boolean;
}

function getTableSizeBadge(columns: any[]): string | null {
  const firstCol = columns?.[0];
  if (firstCol?.table_bytes !== undefined && firstCol?.table_bytes !== null) {
    const b = Number(firstCol.table_bytes);
    if (!isNaN(b) && b > 0) {
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
      return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  } else if (firstCol?.estimated_rows !== undefined && firstCol?.estimated_rows !== null) {
    const r = Number(firstCol.estimated_rows);
    if (!isNaN(r) && r >= 0) {
      if (r < 1000) return `~${r} стр.`;
      if (r < 1000000) return `~${(r / 1000).toFixed(1)}k стр.`;
      return `~${(r / 1000000).toFixed(1)}M стр.`;
    }
  }
  return null;
}

const SESSION_STORAGE_KEY = 'sql_visualizer_session_v2';

interface SavedSession {
  tabs?: EditorTab[];
  activeTabId?: string;
  sql?: string;
  dialect?: 'PostgreSQL' | 'Oracle' | 'Clickhouse';
  direction?: 'LR' | 'TB';
  theme?: 'dark' | 'light';
  isWrapSql?: boolean;
  isMaximizedSql?: boolean;
  duckDbConnectedPath?: string | null;
  schemaSearchTerm?: string;
  expandedSchemaNodes?: Record<string, boolean>;
  showDuckDbSchemaPanel?: boolean;
  clickhouseConfig?: ClickhouseConfig | null;
  activeEngine?: 'duckdb' | 'clickhouse' | null;
}

const getSavedSession = (): SavedSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to parse session from localStorage', e);
  }
  return null;
};

export default function App() {
  const savedSession = useMemo(() => getSavedSession(), []);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => savedSession?.theme || 'dark');
  const [dialect, setDialect] = useState<'PostgreSQL' | 'Oracle' | 'Clickhouse'>(() => savedSession?.dialect || 'PostgreSQL');
  const [direction, setDirection] = useState<'LR' | 'TB'>(() => savedSession?.direction || 'LR');
  const [activePresetId, setActivePresetId] = useState<string>(sqlPresets[0].id);
  const [showSortNodes, setShowSortNodes] = useState<boolean>(false);
  const [showLimitNodes, setShowLimitNodes] = useState<boolean>(false);
  const [isWrapSql, setIsWrapSql] = useState<boolean>(() => savedSession?.isWrapSql ?? false);
  const [isMaximizedSql, setIsMaximizedSql] = useState<boolean>(() => savedSession?.isMaximizedSql ?? true);
  
  // DuckDB Integration State
  const [duckDbConnectedPath, setDuckDbConnectedPath] = useState<string | null>(null);
  const [recentDuckDbPath, setRecentDuckDbPath] = useState<string | null>(null);
  const [recentClickhouseConfigs, setRecentClickhouseConfigs] = useState<ClickhouseConfig[]>([]);
  const [isWasmMode, setIsWasmMode] = useState<boolean>(false);
  const [showDuckDbConnMenu, setShowDuckDbConnMenu] = useState<boolean>(false);
  const [duckDbResults, setDuckDbResults] = useState<any[] | null>(null);
  const [duckDbError, setDuckDbError] = useState<string | null>(null);
  const [isDuckDbRunning, setIsDuckDbRunning] = useState<boolean>(false);
  const [isDuckDbResultVisible, setIsDuckDbResultVisible] = useState<boolean>(false);
  const [isDuckDbResultExpanded, setIsDuckDbResultExpanded] = useState<boolean>(false);
  const [duckDbSelectedCell, setDuckDbSelectedCell] = useState<{ title: string; content: string } | null>(null);
  const [isCellZoomed, setIsCellZoomed] = useState<boolean>(false);
  const [isTransposed, setIsTransposed] = useState<boolean>(false);
  const [copiedTableImage, setCopiedTableImage] = useState<boolean>(false);
  const [copiedCellValue, setCopiedCellValue] = useState<boolean>(false);
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
  const [showDuckDbSchemaPanel, setShowDuckDbSchemaPanel] = useState<boolean>(() => savedSession?.showDuckDbSchemaPanel ?? true);
  const [expandedSchemaNodes, setExpandedSchemaNodes] = useState<Record<string, boolean>>(() => savedSession?.expandedSchemaNodes || {});

  // Clickhouse Integration State
  const [clickhouseConfig, setClickhouseConfig] = useState<ClickhouseConfig | null>(() => savedSession?.clickhouseConfig || null);
  const [showClickhouseModal, setShowClickhouseModal] = useState<boolean>(false);
  const [activeEngine, setActiveEngine] = useState<'duckdb' | 'clickhouse'>(() => savedSession?.activeEngine || 'duckdb');

  // Interactive Results Table States
  const [selectedResultCell, setSelectedResultCell] = useState<{ rowIndex: number; colKey: string } | null>(null);
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
      navigator.clipboard.writeText(sel);
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
      navigator.clipboard.writeText(ins);
      return;
    }

    let sql = '';
    if (action === 'select') {
      sql = `SELECT * FROM ${fullTable}`;
    } else if (action === 'describe') {
      sql = `DESCRIBE ${fullTable}`;
    } else if (action === 'ddl') {
      if (activeEngine === 'duckdb') {
        sql = `SELECT sql FROM duckdb_tables() WHERE table_name = '${tableName}' AND schema_name = '${schemaName}'`;
      } else {
        sql = `SHOW CREATE TABLE ${fullTable}`;
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

  const extractedTableName = useMemo(() => {
    if (!lastExecutedSql.trim()) return 'table';
    const cleanSql = lastExecutedSql.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/g, '').trim();

    const fromMatch = cleanSql.match(/\bFROM\s+/i);
    if (!fromMatch || fromMatch.index === undefined) {
      return `(${cleanSql.replace(/;+$/, '')}) AS _sub`;
    }

    const afterFrom = cleanSql.slice(fromMatch.index + fromMatch[0].length).trim();
    if (!afterFrom) return 'table';

    // 1. Single-quoted string file path / table: 'path/to/file.parquet' or 's3://...'
    const singleQuoteMatch = afterFrom.match(/^('(?:''|[^'\\]|\\.)*')/);
    if (singleQuoteMatch) {
      return singleQuoteMatch[1];
    }

    // 2. Function call or Parenthesized expression / subquery: read_parquet(...) or (SELECT ...)
    if (/^(?:[a-zA-Z0-9_$]+\s*)?\(/.test(afterFrom)) {
      let parenCount = 0;
      let inString: string | null = null;
      let endIndex = -1;

      for (let i = 0; i < afterFrom.length; i++) {
        const char = afterFrom[i];
        if (inString) {
          if (char === inString && afterFrom[i - 1] !== '\\') {
            inString = null;
          }
        } else if (char === "'" || char === '"') {
          inString = char;
        } else if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
          if (parenCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      if (endIndex !== -1) {
        const extracted = afterFrom.slice(0, endIndex + 1).trim();
        if (extracted.startsWith('(')) {
          return `${extracted} AS _sub`;
        }
        return extracted;
      }
    }

    // 3. Table name (can be qualified with dots, e.g. "default"."actors", db.schema.table, `db`.`tbl`)
    const identPartRegex = /^(?:"(?:""|[^"\\]|\\.)*"|`(?:``|[^`\\]|\\.)*`|\[[^\]]+\]|[^\s;(),."']+)/;
    let curr = afterFrom;
    let matchLength = 0;

    while (curr.length > 0) {
      const partMatch = curr.match(identPartRegex);
      if (!partMatch) break;
      matchLength += partMatch[0].length;
      curr = curr.slice(partMatch[0].length);

      const dotMatch = curr.match(/^\s*\.\s*/);
      if (dotMatch) {
        matchLength += dotMatch[0].length;
        curr = curr.slice(dotMatch[0].length);
      } else {
        break;
      }
    }

    if (matchLength > 0) {
      return afterFrom.slice(0, matchLength).trim();
    }

    return `(${cleanSql.replace(/;+$/, '')}) AS _sub`;
  }, [lastExecutedSql]);

  const prevDuckDbPathRef = useRef<string | null>(duckDbConnectedPath);
  useEffect(() => {
    if (prevDuckDbPathRef.current !== null && prevDuckDbPathRef.current !== duckDbConnectedPath) {
      setExpandedSchemaNodes({});
      setSchemaSearchTerm('');
    }
    prevDuckDbPathRef.current = duckDbConnectedPath;
  }, [duckDbConnectedPath]);



  const toggleSchemaNode = (id: string) => {
    setExpandedSchemaNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchTableColumns = async (dbName: string, schemaName: string, tableName: string, tableType: string) => {
    const tableKey = `${dbName}.${schemaName}.${tableName}`;
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
          const dbKey = isCH && clickhouseConfig
            ? `clickhouse:${clickhouseConfig.host}:${clickhouseConfig.user}:${clickhouseConfig.database || 'default'}`
            : `duckdb:${duckDbConnectedPath || (isWasmMode ? 'wasm' : 'local')}`;
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
    const tableKey = `${dbName}.${schemaName}.${tableName}`;
    
    const isCurrentlyExpanded = !!expandedSchemaNodes[nodeKey];
    setExpandedSchemaNodes(prev => ({ ...prev, [nodeKey]: !isCurrentlyExpanded }));
    
    const tablePath = dbName === schemaName ? `${dbName}.${tableName}` : `${dbName}.${schemaName}.${tableName}`;
    navigator.clipboard.writeText(tablePath);

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
      const tableKey = `${db}.${sch}.${tbl}`;
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
  }, [duckDbSchema, tableColumnsMap, schemaSearchTerm]);

  const [showSnippetsModal, setShowSnippetsModal] = useState<boolean>(false);
  const [showPresetsDropdown, setShowPresetsDropdown] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [lineageHighlightMode, setLineageHighlightMode] = useState<boolean>(false);
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(() => getSavedHotkeys());
  const [formatterSettings, setFormatterSettings] = useState<FormatterSettings>(() => getSavedFormatterSettings());
  const [uiVisibility, setUiVisibility] = useState<UiVisibilitySettings>(() => getSavedUiVisibilitySettings());

  const effectiveMaxRows = activeEngine === 'clickhouse'
    ? (uiVisibility.clickhouseMaxRows ?? 100)
    : (uiVisibility.duckDbMaxRows ?? 100);

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
    const maxRows = uiVisibility.clickhouseMaxRows ?? uiVisibility.duckDbMaxRows ?? 100;
    return maxRows > 0 ? duckDbResults.slice(0, maxRows) : duckDbResults;
  }, [duckDbResults, uiVisibility.clickhouseMaxRows, uiVisibility.duckDbMaxRows]);

  const displayedResults = useMemo(() => {
    if (!pagedResults || pagedResults.length === 0) return [];
    if (!valueSearchTerm.trim()) return pagedResults;
    const term = valueSearchTerm.trim().toLowerCase();
    return pagedResults.filter(row => {
      if (!row || typeof row !== 'object') return false;
      return Object.values(row).some(val => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(term);
      });
    });
  }, [pagedResults, valueSearchTerm]);

  const computeColumnStats = useCallback((colKey: string, rows: any[]) => {
    if (!rows || rows.length === 0) return `Количество (Count): 0\nУникальных (Distinct): 0\nПустых (Null/Empty): 0`;

    const totalCount = rows.length;
    let nullOrEmptyCount = 0;
    const uniqueValues = new Set<string>();
    const numericValues: number[] = [];

    for (const row of rows) {
      const val = row[colKey];
      if (val === null || val === undefined || val === '') {
        nullOrEmptyCount++;
      } else {
        uniqueValues.add(String(val));
        if (typeof val === 'number' && !isNaN(val)) {
          numericValues.push(val);
        } else if (typeof val === 'string' && val.trim() !== '') {
          const num = Number(val);
          if (!isNaN(num)) {
            numericValues.push(num);
          }
        }
      }
    }

    const distinctCount = uniqueValues.size;

    const formatInt = (n: number) => {
      return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    };

    let result = `Количество (Count): ${formatInt(totalCount)}\n`;
    result += `Уникальных (Distinct): ${formatInt(distinctCount)}\n`;
    result += `Пустых (Null/Empty): ${formatInt(nullOrEmptyCount)}`;

    const nonNullCount = totalCount - nullOrEmptyCount;
    const isNumericCol = nonNullCount > 0 && numericValues.length >= Math.ceil(nonNullCount * 0.5);

    if (isNumericCol && numericValues.length > 0) {
      const sum = numericValues.reduce((acc, v) => acc + v, 0);
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      const avg = sum / numericValues.length;

      const formatNum = (n: number) => {
        const isNeg = n < 0;
        const absN = Math.abs(n);
        const str = Number.isInteger(absN) ? absN.toString() : parseFloat(absN.toFixed(6)).toString();
        const parts = str.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return (isNeg ? '-' : '') + parts.join('.');
      };

      const sortedNum = [...numericValues].sort((a, b) => a - b);
      const mid = Math.floor(sortedNum.length / 2);
      const median = sortedNum.length % 2 !== 0 
        ? sortedNum[mid] 
        : (sortedNum[mid - 1] + sortedNum[mid]) / 2;

      result += `\n\nСумма (Sum): ${formatNum(sum)}`;
      result += `\nМин. (Min): ${formatNum(min)}`;
      result += `\nМакс. (Max): ${formatNum(max)}`;
      result += `\nСреднее (Avg): ${formatNum(avg)}`;
      result += `\nМедиана (Median): ${formatNum(median)}`;
    }

    return result;
  }, [activeEngine]);

  useEffect(() => {
    if (selectedResultCell && selectedResultCell.rowIndex === -1 && selectedResultCell.colKey) {
      setDuckDbSelectedCell({
        title: `Столбец: ${selectedResultCell.colKey}`,
        content: computeColumnStats(selectedResultCell.colKey, displayedResults),
      });
    }
  }, [selectedResultCell, displayedResults, computeColumnStats]);

  useEffect(() => {
    const handleCopyKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;

        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;

        if (selectedResultCell && displayedResults && displayedResults.length > 0) {
          let textToCopy = '';
          if (selectedResultCell.rowIndex === -1) {
            textToCopy = selectedResultCell.colKey;
          } else if (selectedResultCell.rowIndex >= 0 && displayedResults[selectedResultCell.rowIndex]) {
            const val = displayedResults[selectedResultCell.rowIndex][selectedResultCell.colKey];
            textToCopy = val === null || val === undefined ? 'null' : String(val);
          }
          if (textToCopy) {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard.writeText(textToCopy);
          }
        } else if (duckDbSelectedCell?.content) {
          e.preventDefault();
          e.stopPropagation();
          navigator.clipboard.writeText(duckDbSelectedCell.content);
        }
      }
    };
    window.addEventListener('keydown', handleCopyKeyDown);
    return () => window.removeEventListener('keydown', handleCopyKeyDown);
  }, [selectedResultCell, displayedResults, duckDbSelectedCell]);
  const formatterSettingsRef = useRef<FormatterSettings>(formatterSettings);
  useEffect(() => {
    formatterSettingsRef.current = formatterSettings;
  }, [formatterSettings]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const win1251FileInputRef = useRef<HTMLInputElement>(null);
  const duckDbFileInputRef = useRef<HTMLInputElement>(null);

  // Tabs state for fullscreen editor
  const [tabs, setTabs] = useState<EditorTab[]>(() => {
    if (savedSession?.tabs && savedSession.tabs.length > 0) {
      return savedSession.tabs;
    }
    return [{ id: '1', title: 'Вкладка 1', sql: sqlPresets[0].sql }];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (savedSession?.activeTabId && savedSession?.tabs?.some(t => t.id === savedSession.activeTabId)) {
      return savedSession.activeTabId;
    }
    return savedSession?.tabs?.[0]?.id || '1';
  });
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const [isTabsLoaded, setIsTabsLoaded] = useState<boolean>(false);
  const isTabsLoadedRef = useRef<boolean>(false);

  const sqlRef = useRef<string>(tabs.find(t => t.id === activeTabId)?.sql || '');
  const isResultTableHoveredRef = useRef<boolean>(false);
  const isCreatingFilterTabRef = useRef<boolean>(false);

  useEffect(() => {
    setResultTableContextMenu(null);
    if (isCreatingFilterTabRef.current) {
      isCreatingFilterTabRef.current = false;
    } else {
      setActiveSqlFilters([]);
      setActiveSqlSorts([]);
    }
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) {
      sqlRef.current = currentTab.sql;
    }
  }, [activeTabId]);

  const generateFilteredSortedSql = useCallback((
    baseSql: string,
    filters: Array<{ colKey: string; op: '=' | 'IS' | 'LIKE' | '!=' | '<>' | 'IS NULL' | 'IS NOT NULL'; val: any }>,
    sorts: Array<{ colKey: string; dir: 'ASC' | 'DESC' }>
  ) => {
    const cleanSql = baseSql.trim().replace(/;+$/, '');
    if (!cleanSql) return '';
    if (filters.length === 0 && sorts.length === 0) return cleanSql;

    const whereClauses = filters.map(f => {
      const safeCol = f.colKey.replace(/"/g, '""');
      if (f.op === 'IS NULL') {
        return `("${safeCol}" IS NULL OR CAST("${safeCol}" AS ${activeEngine === 'clickhouse' ? 'String' : 'VARCHAR'}) = '')`;
      }
      if (f.op === 'IS NOT NULL') {
        return `("${safeCol}" IS NOT NULL AND CAST("${safeCol}" AS ${activeEngine === 'clickhouse' ? 'String' : 'VARCHAR'}) <> '')`;
      }
      if (f.op === '<>') {
        if (f.val === null || f.val === undefined) {
          return `"${safeCol}" IS NOT NULL`;
        }
        if (typeof f.val === 'number' || typeof f.val === 'boolean') {
          return `"${safeCol}" <> ${f.val}`;
        }
        const escapedVal = String(f.val).replace(/'/g, "''");
        return `"${safeCol}" <> '${escapedVal}'`;
      }
      if (f.op === 'LIKE') {
        if (f.val === null || f.val === undefined) {
          return `"${safeCol}" IS NOT NULL`;
        }
        const escapedVal = String(f.val).replace(/'/g, "''");
        return `LOWER(CAST("${safeCol}" AS ${activeEngine === 'clickhouse' ? 'String' : 'VARCHAR'})) LIKE LOWER('%${escapedVal}%')`;
      }
      if (f.val === null || f.val === undefined) {
        return f.op === '!=' || f.op === '<>' ? `"${safeCol}" IS NOT NULL` : `"${safeCol}" IS NULL`;
      }
      if (typeof f.val === 'number' || typeof f.val === 'boolean') {
        return `"${safeCol}" ${f.op} ${f.val}`;
      }
      const escapedVal = String(f.val).replace(/'/g, "''");
      return `"${safeCol}" ${f.op} '${escapedVal}'`;
    });

    const orderClauses = sorts.map(s => `"${s.colKey.replace(/"/g, '""')}" ${s.dir}`);

    let wrappedSql = `SELECT * FROM (${cleanSql}) AS _filtered_query`;
    if (whereClauses.length > 0) {
      wrappedSql += `\nWHERE ${whereClauses.join(' AND ')}`;
    }
    if (orderClauses.length > 0) {
      wrappedSql += `\nORDER BY ${orderClauses.join(', ')}`;
    }

    return wrappedSql;
  }, [activeEngine]);

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
        const newTabTitle = `${activeTab?.title || 'Запрос'} (Filter)`;
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
          handleExecuteCurrentEngineQuery(newSql, 1);
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
        const newTabTitle = `${activeTab?.title || 'Запрос'} (Filter)`;
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
          handleExecuteCurrentEngineQuery(newSql, 1);
        }, 50);
      }
    }
  };

  const handleApplyTableGroupBy = (colKey: string) => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    const rootBaseSql = activeTab?.originalSql || lastExecutedSql || activeTab?.sql || '';
    const cleanSql = rootBaseSql.trim().replace(/;+$/, '');
    if (!cleanSql) return;

    const baseFilteredSql = generateFilteredSortedSql(rootBaseSql, activeSqlFilters, []);
    const newSql = `SELECT "${colKey.replace(/"/g, '""')}", COUNT(*) AS count\nFROM (\n  ${baseFilteredSql}\n) AS _sub\nGROUP BY 1\nORDER BY 2 DESC`;

    sqlRef.current = newSql;
    setActiveSqlFilters([]);
    setActiveSqlSorts([]);

    if (activeTab?.originalSql || tabs.length >= 9) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: newSql, originalSql: newSql } : t));
      handleExecuteCurrentEngineQuery(newSql, 1);
    } else {
      const newTabId = `tab_${Date.now()}`;
      const newTabTitle = `${activeTab?.title || 'Запрос'} (Group)`;
      const newTab: EditorTab = {
        id: newTabId,
        title: newTabTitle,
        sql: newSql,
        originalSql: newSql,
      };
      setTabs(prev => [...prev.map(t => t.id === activeTabId ? { ...t, sql: activeTab?.sql || '' } : t), newTab]);
      setActiveTabId(newTabId);
      setTimeout(() => {
        handleExecuteCurrentEngineQuery(newSql, 1);
      }, 50);
    }
  };

  useEffect(() => {
    const loadTabs = async () => {
      try {
        const storedTabs = await getSessionTabs();
        if (storedTabs && storedTabs.length > 0) {
          setTabs(storedTabs);
          
          let nextActiveTabId = savedSession?.activeTabId || storedTabs[0].id;
          if (!storedTabs.some(t => t.id === nextActiveTabId)) {
            nextActiveTabId = storedTabs[0].id;
          }
          setActiveTabId(nextActiveTabId);
          sqlRef.current = storedTabs.find(t => t.id === nextActiveTabId)?.sql || '';
        }
      } catch (e) {
        console.error("Failed to load tabs from IDB", e);
      } finally {
        setIsTabsLoaded(true);
        isTabsLoadedRef.current = true;
      }
    };
    loadTabs();
  }, [savedSession?.activeTabId]);

  const getActiveTabSql = () => tabs.find(t => t.id === activeTabId)?.sql || '';
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
    clickhouseConfig,
    activeEngine
  ]);

  // Auto-reconnect to DuckDB database on application startup if path was saved in session
  useEffect(() => {
    const autoReconnect = async () => {
      const dbPath = savedSession?.duckDbConnectedPath;
      if (!dbPath) return;

      try {
        setIsDuckDbRunning(true);
        let connectedSuccessfully = false;

        if (isTauriEnv) {
          try {
            const path = await tauriInvoke<string>('connect_db', { path: dbPath, options: duckDbConfig });
            setDuckDbConnectedPath(path || dbPath);
            setIsWasmMode(false);
            setDuckDbError(null);
            connectedSuccessfully = true;
          } catch (tauriErr) {
            console.warn("Tauri auto-connect failed:", tauriErr);
          }
        }

        if (!connectedSuccessfully) {
          try {
            const data = await fetchApiJson("/api/duckdb/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dbPath })
            });
            if (data && !data.error) {
              connectedSuccessfully = true;
              setIsWasmMode(false);
              setDuckDbConnectedPath(data.path || dbPath);
              setDuckDbError(null);
            }
          } catch (_) {
            connectedSuccessfully = false;
          }
        }

        if (!connectedSuccessfully && !isTauriEnv && dbPath === ':memory:') {
          try {
            await connectDuckDbWasmMemory();
            connectedSuccessfully = true;
            setIsWasmMode(true);
            setDuckDbConnectedPath(':memory:');
            setDuckDbError(null);
          } catch (err) {
            console.warn("WASM auto-connect to :memory: failed:", err);
          }
        }

        if (connectedSuccessfully) {
          setShowDuckDbSchemaPanel(true);
        } else {
          console.warn("Could not auto-reconnect DuckDB database for path:", dbPath);
        }
      } catch (err: any) {
        console.warn("DuckDB auto-reconnect error:", err);
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

      const tabsToSave = latestSessionRef.current.tabs.map(t => 
        t.id === latestSessionRef.current.activeTabId ? { ...t, sql: sqlRef.current } : t
      );
      await saveSessionTabs(tabsToSave);
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

    // Background interval: save session once every 20 minutes (20 * 60 * 1000 ms)
    const INTERVAL_20_MIN = 20 * 60 * 1000;
    const intervalId = setInterval(() => {
      saveSessionToStorage();
    }, INTERVAL_20_MIN);

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

  const handleConnectToRecentDuckDb = async (dbPath: string) => {
    setShowDuckDbConnMenu(false);
    if (duckDbConnectedPath || clickhouseConfig) {
      await handleDisconnectDuckDb();
    }
    setClickhouseConfig(null);
    setActiveEngine('duckdb');
    if (isTauriEnv) {
      setIsDuckDbRunning(true);
      try {
        const path = await tauriInvoke<string>('connect_db', { path: dbPath, options: duckDbConfig });
        setDuckDbConnectedPath(path || dbPath);
        setIsWasmMode(false);
        setShowDuckDbSchemaPanel(true);
        setDuckDbError(null);
      } catch (err: any) {
        setDuckDbError("Ошибка подключения к DuckDB: " + (err.message || String(err)));
        setIsDuckDbResultVisible(true);
      } finally {
        setIsDuckDbRunning(false);
      }
    }
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
          filters: [{ name: 'DuckDB / SQLite', extensions: ['duckdb', 'db', 'sqlite'] }]
        });

        if (selected && typeof selected === 'string') {
          if (duckDbConnectedPath || clickhouseConfig) {
            await handleDisconnectDuckDb();
          }
          setClickhouseConfig(null);
          setActiveEngine('duckdb');
          
          const dbPath = selected;
          setIsDuckDbRunning(true);
          try {
            const path = await tauriInvoke<string>('connect_db', { path: dbPath, options: duckDbConfig });
            setDuckDbConnectedPath(path || dbPath);
            setIsWasmMode(false);
            setShowDuckDbSchemaPanel(true);
            setDuckDbError(null);
          } catch (err: any) {
            setDuckDbError("Ошибка подключения к DuckDB: " + (err.message || String(err)));
            setIsDuckDbResultVisible(true);
          } finally {
            setIsDuckDbRunning(false);
          }
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
    if (duckDbConnectedPath || clickhouseConfig) {
      await handleDisconnectDuckDb();
    }
    setClickhouseConfig(null);
    setActiveEngine('duckdb');
    
    setIsDuckDbRunning(true);
    let connectedSuccessfully = false;

    if (isTauriEnv) {
      try {
        await tauriInvoke<string>('connect_db', { path: ':memory:', options: duckDbConfig });
        setDuckDbConnectedPath(':memory:');
        setIsWasmMode(false);
        setShowDuckDbSchemaPanel(true);
        setDuckDbError(null);
        connectedSuccessfully = true;
      } catch (tauriErr: any) {
        console.warn("Tauri native in-memory connection failed, trying server/WASM:", tauriErr);
      }
    }

    if (!connectedSuccessfully) {
      try {
        const data = await fetchApiJson("/api/duckdb/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dbPath: ':memory:', config: duckDbConfig })
        });
        if (data && !data.error) {
          connectedSuccessfully = true;
          setIsWasmMode(false);
          setDuckDbConnectedPath(':memory:');
          setShowDuckDbSchemaPanel(true);
          setDuckDbError(null);
        }
      } catch (_) {
        connectedSuccessfully = false;
      }
    }

    if (!connectedSuccessfully && !isTauriEnv) {
      try {
        await connectDuckDbWasmMemory(duckDbConfig);
        connectedSuccessfully = true;
        setIsWasmMode(true);
        setDuckDbConnectedPath(':memory:');
        setShowDuckDbSchemaPanel(true);
        setDuckDbError(null);
      } catch (err: any) {
        setDuckDbError("Ошибка in-memory подключения DuckDB: " + (err.message || String(err)));
        setIsDuckDbResultVisible(true);
      }
    }
    
    setIsDuckDbRunning(false);
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
          if (duckDbConnectedPath || clickhouseConfig) {
            await handleDisconnectDuckDb();
          }
          setClickhouseConfig(null);
          setActiveEngine('duckdb');

          const dbPath = selected;
          setIsDuckDbRunning(true);
          try {
            const path = await tauriInvoke<string>('connect_db', { path: dbPath, options: duckDbConfig });
            setDuckDbConnectedPath(path || dbPath);
            setIsWasmMode(false);
            setShowDuckDbSchemaPanel(true);
            setDuckDbError(null);
          } catch (err: any) {
            setDuckDbError("Ошибка создания файл базы данных DuckDB: " + (err.message || String(err)));
            setIsDuckDbResultVisible(true);
          } finally {
            setIsDuckDbRunning(false);
          }
        }
      } catch (dialogErr) {
        console.warn("Tauri save dialog error:", dialogErr);
      }
    } else {
      alert("Создание локального .duckdb файла на диске доступно в десктопном приложении.");
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
        "Бэкенд-сервер недоступен. Запустите локальный сервер (node server.ts)."
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

  const duckDbConfig = useMemo(() => ({
    allowUnsignedExtensions: uiVisibility.duckDbAllowUnsignedExtensions ?? false,
    memoryLimit: uiVisibility.duckDbMemoryLimit || '8GB',
    tempDirectory: uiVisibility.duckDbTempDirectory || './tmp',
    extensionDirectory: uiVisibility.duckDbExtensionDirectory || './extensions',
    threads: uiVisibility.duckDbThreads ?? 0,
  }), [
    uiVisibility.duckDbAllowUnsignedExtensions,
    uiVisibility.duckDbMemoryLimit,
    uiVisibility.duckDbTempDirectory,
    uiVisibility.duckDbExtensionDirectory,
    uiVisibility.duckDbThreads,
  ]);

  const handleDuckDbFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (duckDbConnectedPath || clickhouseConfig) {
        await handleDisconnectDuckDb();
      }
      setClickhouseConfig(null);
      setActiveEngine('duckdb');

      // @ts-ignore - access non-standard path property for desktop environments
      const dbPath = file.path || file.name;
      
      try {
        setIsDuckDbRunning(true);
        let connectedSuccessfully = false;

        // 1. Try Tauri native Rust command first if in Tauri environment
        if (isTauriEnv) {
          try {
            const path = await tauriInvoke<string>('connect_db', { path: dbPath, options: duckDbConfig });
            setDuckDbConnectedPath(path || dbPath);
            setIsWasmMode(false);
            setShowDuckDbSchemaPanel(true);
            setDuckDbError(null);
            connectedSuccessfully = true;
          } catch (tauriErr: any) {
            console.warn("Tauri native connection failed, trying server/WASM:", tauriErr);
          }
        }

        // 2. Try Local Express server if not connected yet
        if (!connectedSuccessfully) {
          try {
            const data = await fetchApiJson("/api/duckdb/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dbPath, config: duckDbConfig })
            });
            if (data && !data.error) {
              connectedSuccessfully = true;
              setIsWasmMode(false);
              setDuckDbConnectedPath(data.path);
              setShowDuckDbSchemaPanel(true);
              setDuckDbError(null);
            }
          } catch (_) {
            connectedSuccessfully = false;
          }
        }

        // 3. Fallback to WASM Mode if neither Tauri nor Express backend connected
        if (!connectedSuccessfully && !isTauriEnv) {
          const fileName = await connectDuckDbWasmFile(file, duckDbConfig);
          setIsWasmMode(true);
          setDuckDbConnectedPath(fileName);
          setShowDuckDbSchemaPanel(true);
          setDuckDbError(null);
        }
      } catch (err: any) {
        setDuckDbError("Ошибка подключения к DB: " + (err.message || String(err)));
        setIsDuckDbResultVisible(true);
      } finally {
        setIsDuckDbRunning(false);
      }
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
    const dbKey = isCH && clickhouseConfig
      ? `clickhouse:${clickhouseConfig.host}:${clickhouseConfig.user}:${clickhouseConfig.database || 'default'}`
      : `duckdb:${duckDbConnectedPath || (isWasmMode ? 'wasm' : 'local')}`;

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
        const dbKey = isCH && clickhouseConfig
          ? `clickhouse:${clickhouseConfig.host}:${clickhouseConfig.user}:${clickhouseConfig.database || 'default'}`
          : `duckdb:${duckDbConnectedPath || (isWasmMode ? 'wasm' : 'local')}`;

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
          const STALE_MS = 3 * 24 * 60 * 60 * 1000;
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
      if (isTauriEnv && !isWasmMode) {
        try {
          await tauriInvoke('disconnect_db');
        } catch (e) {
          console.error(e);
        }
      }
      if (isWasmMode) {
        await disconnectDuckDbWasm();
        setIsWasmMode(false);
      } else {
        try {
          await fetchApiJson("/api/duckdb/disconnect", { method: "POST" });
        } catch (e) {
          console.error(e);
        }
      }
    } finally {
      setDuckDbConnectedPath(null);
      setDuckDbResults(null);
      setDuckDbSelectedCell(null);
      setDuckDbError(null);
      setIsDuckDbResultVisible(false);
      setIsDuckDbResultExpanded(false);
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

  const duckDbAbortControllerRef = useRef<AbortController | null>(null);

  const handleCancelDuckDbQuery = () => {
    if (duckDbAbortControllerRef.current) {
      duckDbAbortControllerRef.current.abort();
      duckDbAbortControllerRef.current = null;
    }
    
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
    setDuckDbError("Запрос отменен пользователем");
  };

  const handleExecuteDuckDb = async () => {
    // If query is already running, clicking Execute acts as CANCEL / ABORT
    if (isDuckDbRunning) {
      handleCancelDuckDbQuery();
      return;
    }

    if (!duckDbConnectedPath && !clickhouseConfig) {
      return;
    }

    handleExecuteDuckDbQuery();
  };

  const maybeAutoSelectFirstCell = (results: any[], query: string) => {
    if (results && results.length > 0 && /^\s*(SHOW\b|SELECT\s+sql\s+FROM\s+duckdb_[a-z_]+\b)/i.test(query.trim())) {
      const firstRow = results[0];
      if (firstRow && typeof firstRow === 'object') {
        const keys = Object.keys(firstRow);
        if (keys.length > 0) {
          const ddlKey = keys.find(k => /create|ddl|sql/i.test(k)) || keys[0];
          const val = firstRow[ddlKey];
          setDuckDbSelectedCell({
            title: 'Значение',
            content: val === null || val === undefined ? 'null' : String(val),
          });
          setIsCellZoomed(true);
        }
      }
    }
  };

  const executeDuckDbQueryWithPagination = async (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean, executionMode?: 'sequential' | 'parallel') => {
    if (!duckDbConnectedPath) {
      return;
    }

    if (!isQuickAction) {
      setLastExecutedSql(queryToExec);
    }
    setDuckDbPage(page);

    const controller = new AbortController();
    duckDbAbortControllerRef.current = controller;

    try {
      setIsDuckDbRunning(true);
      setIsDuckDbResultVisible(true);
      setDuckDbError(null);
      setDuckDbResults(null);
      setSummarizeResults(null);
      setDuckDbSelectedCell(null);

      let finalQuery = queryToExec.trim();
      
      if (executionMode) {
        const statements = splitBySemicolonIgnoringQuotes(finalQuery).map(s => s.trim()).filter(Boolean);
        if (statements.length === 0) {
          setIsDuckDbRunning(false);
          return;
        }

        if (executionMode === 'sequential') {
          const setupStatements = statements.slice(0, -1);
          finalQuery = statements[statements.length - 1];
          for (const stmt of setupStatements) {
            if (controller.signal.aborted) throw new Error("Запрос отменен пользователем");
            if (isTauriEnv && !isWasmMode) {
              await tauriInvoke('execute_query', { sql: stmt });
            } else if (isWasmMode) {
              await queryDuckDbWasm(stmt);
            } else {
              const res = await fetchApiJson("/api/duckdb/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: stmt }),
                signal: controller.signal
              });
              if (res.error) throw new Error(res.error);
            }
          }
        } else if (executionMode === 'parallel') {
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
                  signal: controller.signal
                });
                if (res.error) throw new Error(res.error);
              }
              return { Query: stmt.length > 100 ? stmt.substring(0, 100) + '...' : stmt, Status: 'OK' };
            } catch (e: any) {
              return { Query: stmt.length > 100 ? stmt.substring(0, 100) + '...' : stmt, Status: `Error: ${e.message || String(e)}` };
            }
          }));
          setDuckDbResults(results);
          setIsDuckDbRunning(false);
          duckDbAbortControllerRef.current = null;
          return;
        }
      }

      const maxRows = pageSizeToUse ?? effectiveMaxRows;
      let queryWithLimit = finalQuery;
      const cleanSqlHead = finalQuery
        .replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/g, '')
        .trim();

      if (maxRows > 0 && /^\s*\(?\s*(SELECT|WITH|FROM|VALUES|DESCRIBE|SHOW)\b/i.test(cleanSqlHead)) {
        const stripped = finalQuery.replace(/;+$/, '');
        if (page > 1) {
          const offset = (page - 1) * maxRows;
          queryWithLimit = `SELECT * FROM (${stripped}) AS _limited_subquery LIMIT ${maxRows} OFFSET ${offset}`;
        } else {
          if (!/\bLIMIT\s+\d+/i.test(cleanSqlHead)) {
            queryWithLimit = `SELECT * FROM (${stripped}) AS _limited_subquery LIMIT ${maxRows}`;
          }
        }
      }

      if (isTauriEnv && !isWasmMode) {
        try {
          const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', {
            sql: queryWithLimit
          });
          if (controller.signal.aborted) throw new Error("Запрос отменен пользователем");
          const parsed = (res?.rows || []).map(row => {
            const obj: Record<string, any> = {};
            (res.columns || []).forEach((col, idx) => {
              obj[col] = row[idx];
            });
            return obj;
          });
          setDuckDbResults(parsed);
          maybeAutoSelectFirstCell(parsed, queryToExec);
        } catch (tauriErr: any) {
          if (controller.signal.aborted) throw new Error("Запрос отменен пользователем");
          let errMsg = typeof tauriErr === 'string' ? tauriErr : (tauriErr?.message || String(tauriErr));
          if (errMsg.includes("invalid escaped character") || errMsg.includes("trailing escape")) {
            errMsg += "\n\n💡 Подсказка: В строках SQL пути Windows содержат обратные слэши '\\', которые считаются спецсимволами. Замените '\\' на прямые слэши '/' (напр. 'C:/Users/...') или удвойте их '\\\\'.";
          }
          setDuckDbError(errMsg);
        }
      } else if (isWasmMode) {
        const rows = await queryDuckDbWasm(queryWithLimit);
        if (controller.signal.aborted) throw new Error("Запрос отменен пользователем");
        setDuckDbResults(rows);
        maybeAutoSelectFirstCell(rows, queryToExec);
      } else {
        const data = await fetchApiJson("/api/duckdb/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryWithLimit }),
          signal: controller.signal
        });
        
        if (data.error) {
          setDuckDbError(data.error);
        } else {
          const res = data.data || [];
          setDuckDbResults(res);
          maybeAutoSelectFirstCell(res, queryToExec);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        setDuckDbError("Запрос отменен пользователем");
      } else {
        let errMsg = err.message || "Ошибка выполнения запроса";
        if (errMsg.includes("invalid escaped character") || errMsg.includes("trailing escape")) {
          errMsg += "\n\n💡 Подсказка: В строках SQL пути Windows содержат обратные слэши '\\', которые считаются спецсимволами. Замените '\\' на прямые слэши '/' (напр. 'C:/Users/...') или удвойте их '\\\\'.";
        }
        setDuckDbError(errMsg);
      }
    } finally {
      setIsDuckDbRunning(false);
      duckDbAbortControllerRef.current = null;
    }
  };

  const executeClickhouseQueryWithPagination = async (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean, executionMode?: 'sequential' | 'parallel') => {
    if (!clickhouseConfig) {
      return;
    }

    if (!isQuickAction) {
      setLastExecutedSql(queryToExec);
    }
    setDuckDbPage(page);

    const controller = new AbortController();
    duckDbAbortControllerRef.current = controller;

    try {
      setIsDuckDbRunning(true);
      setIsDuckDbResultVisible(true);
      setDuckDbError(null);
      setDuckDbResults(null);
      setDuckDbSelectedCell(null);
      
      let finalQuery = queryToExec.trim();
      
      if (executionMode) {
        const statements = splitBySemicolonIgnoringQuotes(finalQuery).map(s => s.trim()).filter(Boolean);
        if (statements.length === 0) {
          setIsDuckDbRunning(false);
          return;
        }

        if (executionMode === 'sequential') {
          const setupStatements = statements.slice(0, -1);
          finalQuery = statements[statements.length - 1];
          for (const stmt of setupStatements) {
            if (controller.signal.aborted) throw new Error("Запрос отменен пользователем");
            if (isTauriEnvironment()) {
              await executeClickhouseQueryTauri(clickhouseConfig, stmt);
            } else {
              const res = await fetchApiJson('/api/clickhouse/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...clickhouseConfig, query: stmt }),
                signal: controller.signal
              });
              if (res.error) throw new Error(res.error);
            }
          }
        } else if (executionMode === 'parallel') {
          const results = await Promise.all(statements.map(async (stmt) => {
            try {
              if (isTauriEnvironment()) {
                await executeClickhouseQueryTauri(clickhouseConfig, stmt);
              } else {
                const res = await fetchApiJson('/api/clickhouse/query', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...clickhouseConfig, query: stmt }),
                  signal: controller.signal
                });
                if (res.error) throw new Error(res.error);
              }
              return { Query: stmt.length > 100 ? stmt.substring(0, 100) + '...' : stmt, Status: 'OK' };
            } catch (e: any) {
              return { Query: stmt.length > 100 ? stmt.substring(0, 100) + '...' : stmt, Status: `Error: ${e.message || String(e)}` };
            }
          }));
          setDuckDbResults(results);
          setIsDuckDbRunning(false);
          duckDbAbortControllerRef.current = null;
          return;
        }
      }

      const cleanSqlHead = finalQuery
        .replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/g, '')
        .trim();

      // Check for COPY (...) TO / FROM
      const copyCmd = parseClickhouseCopy(cleanSqlHead);
      if (copyCmd) {
        if (copyCmd.type === 'COPY_TO') {
          if (isTauriEnvironment()) {
            try {
              const res = await executeClickhouseCopyToTauri(clickhouseConfig, copyCmd.innerSql, copyCmd.filePath);
              setDuckDbResults([
                {
                  Status: 'Success (COPY TO)',
                  File: copyCmd.filePath,
                  Message: res.message,
                  Bytes: `${res.bytes} bytes`,
                },
              ]);
            } catch (err: any) {
              setDuckDbError(err.message || String(err));
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
              signal: controller.signal,
            });

            if (data.error) {
              setDuckDbError(data.error);
            } else {
              setDuckDbResults([
                {
                  Status: 'Success (COPY TO)',
                  File: copyCmd.filePath,
                  Message: data.message || `File saved (${data.bytes || 0} bytes)`,
                },
              ]);
            }
          }
        } else if (copyCmd.type === 'COPY_FROM') {
          if (isTauriEnvironment()) {
            try {
              const res = await executeClickhouseCopyFromTauri(clickhouseConfig, copyCmd.innerSql, copyCmd.filePath);
              setDuckDbResults([
                {
                  Status: 'Success (COPY FROM)',
                  File: copyCmd.filePath,
                  Message: res.message,
                  Response: res.response || 'OK',
                },
              ]);
            } catch (err: any) {
              setDuckDbError(err.message || String(err));
            }
          } else {
            const data = await fetchApiJson('/api/clickhouse/copy-from', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...clickhouseConfig,
                innerSql: copyCmd.innerSql,
                filePath: copyCmd.filePath,
              }),
              signal: controller.signal,
            });

            if (data.error) {
              setDuckDbError(data.error);
            } else {
              setDuckDbResults([
                {
                  Status: 'Success (COPY FROM)',
                  File: copyCmd.filePath,
                  Message: data.message || 'Data successfully loaded into Clickhouse',
                  Response: data.response || 'OK',
                },
              ]);
            }
          }
        }
        return;
      }

      // SELECT / WITH query pagination limit wrapper
      const maxRows = pageSizeToUse ?? effectiveMaxRows;
      let queryWithLimit = queryToExec.trim();

      if (maxRows > 0 && /^\s*\(?\s*(SELECT|WITH|FROM|VALUES|DESCRIBE|SHOW)\b/i.test(cleanSqlHead)) {
        const stripped = queryWithLimit.replace(/;+$/, '');
        if (page > 1) {
          const offset = (page - 1) * maxRows;
          queryWithLimit = `SELECT * FROM (${stripped}) AS _limited_subquery LIMIT ${maxRows} OFFSET ${offset}`;
        } else {
          if (!/\bLIMIT\s+\d+/i.test(cleanSqlHead)) {
            queryWithLimit = `SELECT * FROM (${stripped}) AS _limited_subquery LIMIT ${maxRows}`;
          }
        }
      }

      if (!/\bFORMAT\b/i.test(queryWithLimit) && !/^\s*(CREATE|INSERT|DELETE|ALTER|DROP|TRUNCATE|SET|USE|OPTIMIZE|SYSTEM)\b/i.test(queryWithLimit)) {
        queryWithLimit += ' FORMAT JSON';
      }

      let data: any = null;
      if (isTauriEnvironment()) {
        try {
          data = await executeClickhouseQueryTauri(clickhouseConfig, queryWithLimit);
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
            signal: controller.signal,
          });
        } catch {
          const url = getClickhouseUrl(clickhouseConfig);
          const headers = getClickhouseHeaders(clickhouseConfig);
          const chRes = await fetch(url, {
            method: 'POST',
            headers,
            body: queryWithLimit,
            signal: controller.signal,
          });
          const text = await chRes.text();
          if (!chRes.ok) {
            throw new Error(text || `HTTP ${chRes.status}`);
          }
          try {
            const parsed = JSON.parse(text);
            data = { success: true, data: parsed.data || parsed };
          } catch {
            data = { success: true, text };
          }
        }
      }

      if (data && data.error) {
        setDuckDbError(data.error);
      } else if (data) {
        let resArr: any[] = [];
        if (Array.isArray(data.data)) {
          resArr = data.data;
        } else if (typeof data.text === 'string') {
          resArr = [{ Response: data.text || 'OK' }];
        } else {
          resArr = [data.data || { Status: 'OK' }];
        }
        setDuckDbResults(resArr);
        maybeAutoSelectFirstCell(resArr, queryToExec);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal?.aborted) {
        setDuckDbError('Запрос отменен пользователем');
      } else {
        setDuckDbError(err.message || 'Ошибка выполнения ClickHouse запроса');
      }
    } finally {
      setIsDuckDbRunning(false);
      duckDbAbortControllerRef.current = null;
    }
  };

  const handleExecuteCurrentEngineQuery = (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean, executionMode?: 'sequential' | 'parallel') => {
    setResultsViewMode('table');
    setSelectedResultCell(null);
    setDuckDbSelectedCell(null);

    let finalQuery = queryToExec;
    if (formatterSettings.autoEscapeWindowsPaths ?? true) {
      finalQuery = finalQuery.replace(/\b(read_csv_auto|read_csv|read_parquet|read_json|read_json_auto|FROM|TO)\s*\(?\s*(['"])(.*?)(['"])/gi, (match, keyword, quote1, innerPath, quote2) => {
        if (innerPath.includes('\\')) {
          const escapedPath = innerPath.replace(/\\/g, '/');
          return `${keyword} ${quote1}${escapedPath}${quote2}`;
        }
        return match;
      });
    }

    if (activeEngine === 'clickhouse' || (!duckDbConnectedPath && clickhouseConfig)) {
      executeClickhouseQueryWithPagination(finalQuery, page, pageSizeToUse, isQuickAction, executionMode);
    } else {
      executeDuckDbQueryWithPagination(finalQuery, page, pageSizeToUse, isQuickAction, executionMode);
    }
  };

  const handleExecuteDuckDbQuery = async () => {
    let queryToExecute = sqlRef.current;
    const textareas = document.querySelectorAll('textarea');
    for (const textarea of Array.from(textareas)) {
      if (textarea.offsetWidth > 0 && textarea.offsetHeight > 0 && textarea.selectionStart !== textarea.selectionEnd) {
        queryToExecute = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
        break;
      }
    }

    if (!queryToExecute.trim()) return;
    setActiveSqlFilters([]);
    setActiveSqlSorts([]);
    setSelectedResultCell(null);
    setDuckDbSelectedCell(null);
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, originalSql: undefined } : t));
    handleExecuteCurrentEngineQuery(queryToExecute, 1);
  };

  const executeSpecificDuckDbQuery = async (queryToExec: string, isQuickAction?: boolean) => {
    if (!queryToExec.trim()) return;
    setActiveSqlFilters([]);
    setActiveSqlSorts([]);
    setSelectedResultCell(null);
    setDuckDbSelectedCell(null);
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, originalSql: undefined } : t));
    handleExecuteCurrentEngineQuery(queryToExec, 1, undefined, isQuickAction);
  };

  const handleExecuteQuickAction = (qa: QuickActionTemplate) => {
    setShowQuickActionsMenu(false);
    const targetQuery = qa.template.replace(/\{table\}/g, extractedTableName);
    executeSpecificDuckDbQuery(targetQuery, true);
  };

  const handleExecuteRawQueryForStats = useCallback(async (sqlToRun: string): Promise<any[]> => {
    const isClickhouse = activeEngine === 'clickhouse' || (!duckDbConnectedPath && !!clickhouseConfig);
    if (isClickhouse && clickhouseConfig) {
      let queryWithFormat = sqlToRun.trim();
      if (!/\bFORMAT\b/i.test(queryWithFormat) && !/^\s*(CREATE|INSERT|DELETE|ALTER|DROP|TRUNCATE|SET|USE|OPTIMIZE|SYSTEM)\b/i.test(queryWithFormat)) {
        queryWithFormat += ' FORMAT JSON';
      }
      
      const controller = new AbortController();
      duckDbAbortControllerRef.current = controller;
      setIsDuckDbRunning(true);
      
      try {
        if (isTauriEnvironment()) {
          const res = await executeClickhouseQueryTauri(clickhouseConfig, queryWithFormat);
          if (controller.signal.aborted) throw new Error("Запрос отменен пользователем");
          return res?.data || [];
        } else {
          const data = await fetchApiJson('/api/clickhouse/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...clickhouseConfig,
              query: queryWithFormat,
            }),
            signal: controller.signal
          });
          if (controller.signal.aborted) throw new Error("Запрос отменен пользователем");
          if (data?.error) {
            const errVal = typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error;
            throw new Error(errVal);
          }
          return data?.data || [];
        }
      } catch (err: any) {
        if (controller.signal.aborted || err.name === 'AbortError') {
          throw new Error("Запрос отменен пользователем");
        }
        throw err;
      } finally {
        setIsDuckDbRunning(false);
        duckDbAbortControllerRef.current = null;
      }
    } else {
      if (isTauriEnvironment() && !isWasmMode) {
        const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: sqlToRun });
        return (res?.rows || []).map(row => {
          const obj: Record<string, any> = {};
          (res.columns || []).forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });
      } else if (isWasmMode) {
        return await queryDuckDbWasm(sqlToRun);
      } else {
        const data = await fetchApiJson('/api/duckdb/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: sqlToRun })
        });
        if (data?.error) {
          const errVal = typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error;
          throw new Error(errVal);
        }
        return data?.data || [];
      }
    }
  }, [activeEngine, clickhouseConfig, duckDbConnectedPath, isWasmMode]);

  const handleSelectTab = (targetId: string) => {
    if (targetId === activeTabId) return;
    const targetTab = tabs.find(t => t.id === targetId);
    if (!targetTab) return;

    const currentSql = sqlRef.current;

    // First, save current edits of the old active tab using the captured currentSql
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: currentSql } : t));

    // Now switch to the new active tab
    setActiveTabId(targetId);
    sqlRef.current = targetTab.sql;
  };

  const handleAddTab = () => {
    if (tabs.length >= 9) return;
    const newId = Date.now().toString();
    const nextNum = tabs.length + 1;
    const newTab: EditorTab = {
      id: newId,
      title: `Вкладка ${nextNum}`,
      sql: ''
    };

    const currentSql = sqlRef.current;

    // Save current active tab SQL first using the captured currentSql, then add the new tab
    setTabs(prev => {
      const updated = prev.map(t => t.id === activeTabId ? { ...t, sql: currentSql } : t);
      return [...updated, newTab];
    });

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
  };

  const handleCloseTab = (e: React.MouseEvent, idToClose: string) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;

    const tabToClose = tabs.find(t => t.id === idToClose);
    if (tabToClose?.isModified) {
      setTabToClosePendingConfirm(tabToClose);
      return;
    }

    confirmCloseTab(idToClose);
  };

  const handleRenameTab = (id: string, newTitle: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title: newTitle } : t));
  };
  const sqlEditorRef = useRef<SqlEditorRef>(null);

  const handleSqlChange = useCallback((newSql: string) => {
    sqlRef.current = newSql;
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        if (t.sql === newSql) return t;
        if (t.isModified) return { ...t, sql: newSql };
        return { ...t, sql: newSql, isModified: true };
      }
      return t;
    }));
  }, [activeTabId]);

  // Auto-save version into IndexedDB every 10 minutes if current tab SQL differs from the existing latest snapshot
  useEffect(() => {
    const INTERVAL_10_MIN = 10 * 60 * 1000;
    const intervalId = setInterval(async () => {
      const currentSql = sqlRef.current;
      if (!currentSql.trim()) return;

      try {
        const latestVersion = await getLatestVersion();
        const latestSql = latestVersion ? latestVersion.sql : null;

        if (latestSql !== currentSql) {
          await saveVersion(currentSql, 'Автосохранение', true);
        }
      } catch (err) {
        console.warn('Auto-save interval error:', err);
      }
    }, INTERVAL_10_MIN);

    return () => clearInterval(intervalId);
  }, [activeEngine]);

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
        alert('Достигнуто максимальное количество вкладок (9). Закройте одну из вкладок, чтобы открыть новый файл.');
        e.target.value = '';
        return;
      }
      const filePath = (file as any).path || undefined;
      const reader = new FileReader();
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
            const updated = prev.map(t => t.id === activeTabId ? { ...t, sql: currentSql } : t);
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
        alert('Достигнуто максимальное количество вкладок (9). Закройте одну из вкладок, чтобы открыть новый файл.');
        e.target.value = '';
        return;
      }
      const filePath = (file as any).path || undefined;
      const reader = new FileReader();
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
            const updated = prev.map(t => t.id === activeTabId ? { ...t, sql: currentSql } : t);
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
        let targetFilePath = activeTab?.filePath;

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
    link.click();
    URL.revokeObjectURL(url);

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
    const currentSql = sqlRef.current || '';
    if (replaceMode || !currentSql.trim()) {
      sqlRef.current = snippetSql;
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: snippetSql } : t));
    } else {
      const newSql = currentSql + '\n\n' + snippetSql;
      sqlRef.current = newSql;
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: snippetSql } : t));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteDuckDb();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS' || e.key === 'ы' || e.key === 'Ы')) {
        e.preventDefault();
        handleSaveSqlFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duckDbConnectedPath, clickhouseConfig, isDuckDbRunning, activeEngine, activeTabId, tabs]);





  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());

  
  
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [error, setError] = useState<string | null>(null);
  const [astResult, setAstResult] = useState<any>(null);

  const handleExpandAll = useCallback(() => {
    const getAllIds = (ast: any, prefix = 'main_'): string[] => {
      let ids: string[] = [];
      if (!ast) return ids;
      if (ast.type === 'multi_query') {
        ast.queries.forEach((qAst: any, qIdx: number) => {
          const queryId = `${prefix}query_block_${qIdx}`;
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
      setExpandedQueries(new Set(allIds));
    }
  }, [astResult]);

  const handleToggleExpand = useCallback((queryId: string) => {
    setExpandedQueries(prev => {
      const next = new Set(prev);
      if (next.has(queryId)) {
        next.delete(queryId);
      } else {
        next.add(queryId);
      }
      return next;
    });
  }, [activeEngine]);

  
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

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
      const isLineage = lineageNodeIds.has(n.id);
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
  const [showAstPreview, setShowAstPreview] = useState<boolean>(false);
  const [copied, setCopied] = useState<string | boolean>(false);
  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(true);
  const [showMiniMap, setShowMiniMap] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  const exportGraph = async (format: 'png' | 'svg' | 'jpeg', transparent: boolean = false) => {
    if (!nodes || nodes.length === 0) return;
    setIsExporting(true);
    setShowExportMenu(false);

    try {
      const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement;
      if (!viewportElement) {
        throw new Error('Graph canvas element not found');
      }

      const nodesBounds = getNodesBounds(nodes);
      const padding = 80;
      const width = Math.max(1200, Math.ceil(nodesBounds.width + padding * 2));
      const height = Math.max(800, Math.ceil(nodesBounds.height + padding * 2));

      const viewport = getViewportForBounds(
        nodesBounds,
        width,
        height,
        0.1,
        4,
        0.1
      );

      const defaultBgColor = theme === 'dark' ? '#172033' : '#e2e8f0';
      const bgColor = transparent ? undefined : defaultBgColor;

      const options: any = {
        width: width,
        height: height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
        pixelRatio: 2,
        filter: (node: Element) => {
          if (!node) return true;
          const className = typeof node.className === 'string'
            ? node.className
            : (node.className && typeof (node.className as any).baseVal === 'string' ? (node.className as any).baseVal : '');

          if (className) {
            if (
              className.includes('react-flow__handle') ||
              className.includes('react-flow__controls') ||
              className.includes('react-flow__minimap') ||
              className.includes('react-flow__attribution') ||
              className.includes('react-flow__panel')
            ) {
              return false;
            }
          }
          return true;
        }
      };

      if (bgColor) {
        options.backgroundColor = bgColor;
      }

      // Inline styles & attributes for SVG element export rendering
      const cleanupTasks: Array<() => void> = [];

      // 1. Hide scrollbars and arrows in nodes during capture
      const styleEl = document.createElement('style');
      styleEl.id = 'export-hide-scrollbars-style';
      styleEl.innerHTML = `
        ::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          opacity: 0 !important;
        }
        ::-webkit-scrollbar-button {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          opacity: 0 !important;
        }
        ::-webkit-scrollbar-thumb {
          display: none !important;
        }
        ::-webkit-scrollbar-track {
          display: none !important;
        }
        * {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
      `;
      document.head.appendChild(styleEl);
      cleanupTasks.push(() => styleEl.remove());

      // 2. Prepare edge paths (<path class="react-flow__edge-path">)
      const edgePaths = viewportElement.querySelectorAll('.react-flow__edges path, .react-flow__edge-path, .react-flow__edge path');
      edgePaths.forEach((path) => {
        const pathEl = path as HTMLElement;
        const computed = window.getComputedStyle(pathEl);
        const origStroke = path.getAttribute('stroke');
        const origStrokeWidth = path.getAttribute('stroke-width');
        const origStrokeDasharray = path.getAttribute('stroke-dasharray');
        const origFill = path.getAttribute('fill');
        
        const origInlineStroke = pathEl.style.getPropertyValue('stroke');
        const origInlineStrokePriority = pathEl.style.getPropertyPriority('stroke');
        const origInlineStrokeWidth = pathEl.style.getPropertyValue('stroke-width');
        const origInlineStrokeWidthPriority = pathEl.style.getPropertyPriority('stroke-width');

        let stroke = computed.stroke;
        if (!stroke || stroke === 'none' || stroke === 'rgba(0, 0, 0, 0)') {
          stroke = '#94a3b8';
        }

        if (transparent && theme === 'dark') {
          // In dark mode, lines are very light (e.g. #f8fafc). On a transparent export, 
          // they disappear against typical light viewers. Force them to a neutral visible gray.
          if (stroke !== '#3b82f6' && stroke !== 'rgb(59, 130, 246)') {
            stroke = '#64748b'; 
          }
        }

        let strokeWidth = computed.strokeWidth;
        if (!strokeWidth || strokeWidth === '0px') {
          strokeWidth = '1.5px';
        }

        path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-width', strokeWidth.replace('px', ''));
        path.setAttribute('fill', 'none');
        pathEl.style.setProperty('stroke', stroke, 'important');
        pathEl.style.setProperty('stroke-width', strokeWidth, 'important');

        const dashArray = pathEl.style.strokeDasharray || computed.strokeDasharray;
        if (dashArray && dashArray !== 'none') {
          path.setAttribute('stroke-dasharray', dashArray);
        }

        cleanupTasks.push(() => {
          if (origStroke !== null) path.setAttribute('stroke', origStroke); else path.removeAttribute('stroke');
          if (origStrokeWidth !== null) path.setAttribute('stroke-width', origStrokeWidth); else path.removeAttribute('stroke-width');
          if (origStrokeDasharray !== null) path.setAttribute('stroke-dasharray', origStrokeDasharray); else path.removeAttribute('stroke-dasharray');
          if (origFill !== null) path.setAttribute('fill', origFill); else path.removeAttribute('fill');
          
          if (origInlineStroke) {
             pathEl.style.setProperty('stroke', origInlineStroke, origInlineStrokePriority);
          } else {
             pathEl.style.removeProperty('stroke');
          }
          if (origInlineStrokeWidth) {
             pathEl.style.setProperty('stroke-width', origInlineStrokeWidth, origInlineStrokeWidthPriority);
          } else {
             pathEl.style.removeProperty('stroke-width');
          }
        });
      });

      // 2.5 Prepare marker colors (arrow heads)
      if (transparent && theme === 'dark') {
        const flowContainer = viewportElement.closest('.react-flow');
        if (flowContainer) {
          const markerPaths = flowContainer.querySelectorAll('marker path, marker polyline, marker polygon');
          markerPaths.forEach((marker) => {
            const m = marker as HTMLElement;
            const origFill = m.getAttribute('fill');
            const origStroke = m.getAttribute('stroke');
            
            const origInlineFill = m.style.getPropertyValue('fill');
            const origInlineFillPriority = m.style.getPropertyPriority('fill');
            const origInlineStroke = m.style.getPropertyValue('stroke');
            const origInlineStrokePriority = m.style.getPropertyPriority('stroke');
            
            // Only modify markers that aren't the blue highlight ones
            const currentFill = window.getComputedStyle(m).fill;
            if (currentFill !== '#3b82f6' && currentFill !== 'rgb(59, 130, 246)') {
              m.setAttribute('fill', '#64748b');
              m.style.setProperty('fill', '#64748b', 'important');
              if (origStroke || window.getComputedStyle(m).stroke !== 'none') {
                 m.setAttribute('stroke', '#64748b');
                 m.style.setProperty('stroke', '#64748b', 'important');
              }
            }
            
            cleanupTasks.push(() => {
              if (origFill !== null) m.setAttribute('fill', origFill); else m.removeAttribute('fill');
              if (origStroke !== null) m.setAttribute('stroke', origStroke); else m.removeAttribute('stroke');
              
              if (origInlineFill) {
                m.style.setProperty('fill', origInlineFill, origInlineFillPriority);
              } else {
                m.style.removeProperty('fill');
              }
              if (origInlineStroke) {
                m.style.setProperty('stroke', origInlineStroke, origInlineStrokePriority);
              } else {
                m.style.removeProperty('stroke');
              }
            });
          });
        }
      }

      // 3. Prepare edge label background rects (<rect class="react-flow__edge-textbg">)
      const edgeRects = viewportElement.querySelectorAll('.react-flow__edge-textbg, .react-flow__edge rect');
      edgeRects.forEach((rect) => {
        const origFill = rect.getAttribute('fill');
        const origFillOpacity = rect.getAttribute('fill-opacity');
        const origStroke = rect.getAttribute('stroke');
        const origStrokeWidth = rect.getAttribute('stroke-width');
        const origRx = rect.getAttribute('rx');
        const origRy = rect.getAttribute('ry');

        rect.setAttribute('fill', (transparent && theme === 'dark') ? '#1e293b' : '#ffffff');
        rect.setAttribute('fill-opacity', '1');
        rect.setAttribute('stroke', (transparent && theme === 'dark') ? '#94a3b8' : '#cbd5e1');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('rx', '4');
        rect.setAttribute('ry', '4');

        cleanupTasks.push(() => {
          if (origFill !== null) rect.setAttribute('fill', origFill); else rect.removeAttribute('fill');
          if (origFillOpacity !== null) rect.setAttribute('fill-opacity', origFillOpacity); else rect.removeAttribute('fill-opacity');
          if (origStroke !== null) rect.setAttribute('stroke', origStroke); else rect.removeAttribute('stroke');
          if (origStrokeWidth !== null) rect.setAttribute('stroke-width', origStrokeWidth); else rect.removeAttribute('stroke-width');
          if (origRx !== null) rect.setAttribute('rx', origRx); else rect.removeAttribute('rx');
          if (origRy !== null) rect.setAttribute('ry', origRy); else rect.removeAttribute('ry');
        });
      });

      // 4. Prepare edge label text (<text class="react-flow__edge-text">)
      const edgeTexts = viewportElement.querySelectorAll('.react-flow__edge-text, .react-flow__edge text');
      edgeTexts.forEach((text) => {
        const origFill = text.getAttribute('fill');
        const origFontSize = text.getAttribute('font-size');
        const origFontWeight = text.getAttribute('font-weight');
        const origFontFamily = text.getAttribute('font-family');

        text.setAttribute('fill', (transparent && theme === 'dark') ? '#f8fafc' : '#0f172a');
        text.setAttribute('font-size', '10px');
        text.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
        text.setAttribute('font-weight', '600');

        cleanupTasks.push(() => {
          if (origFill !== null) text.setAttribute('fill', origFill); else text.removeAttribute('fill');
          if (origFontSize !== null) text.setAttribute('font-size', origFontSize); else text.removeAttribute('font-size');
          if (origFontWeight !== null) text.setAttribute('font-weight', origFontWeight); else text.removeAttribute('font-weight');
          if (origFontFamily !== null) text.setAttribute('font-family', origFontFamily); else text.removeAttribute('font-family');
        });
      });

      // 5. HTML edge labels if present
      const htmlEdgeLabels = viewportElement.querySelectorAll('.react-flow__edge-label, .react-flow__edge-text-wrapper');
      htmlEdgeLabels.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const origBg = htmlEl.style.backgroundColor;
        const origColor = htmlEl.style.color;

        htmlEl.style.backgroundColor = (transparent && theme === 'dark') ? '#1e293b' : '#ffffff';
        htmlEl.style.color = (transparent && theme === 'dark') ? '#f8fafc' : '#0f172a';

        cleanupTasks.push(() => {
          htmlEl.style.backgroundColor = origBg;
          htmlEl.style.color = origColor;
        });
      });

      let dataUrl = '';
      try {
        if (format === 'png') {
          dataUrl = await toPng(viewportElement, options);
        } else if (format === 'svg') {
          dataUrl = await toSvg(viewportElement, options);
        } else if (format === 'jpeg') {
          dataUrl = await toJpeg(viewportElement, { ...options, quality: 0.95 });
        }
      } finally {
        cleanupTasks.forEach(cb => cb());
      }

      if (dataUrl) {
        const link = document.createElement('a');
        const suffix = transparent ? '-transparent' : '';
        link.download = `sql-graph-export${suffix}.${format}`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err: any) {
      console.error('Export graph failed:', err);
      setError(`Failed to export graph: ${err.message || String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const exportGraphText = (format: 'json' | 'xml' | 'mermaid' | 'drawio', toClipboard: boolean = false) => {
    if (nodes.length === 0) return;
    setShowExportMenu(false);

    let content = '';
    let filename = '';
    let mimeType = 'text/plain;charset=utf-8';

    if (format === 'json') {
      const exportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          dialect,
          nodeCount: nodes.length,
          edgeCount: edges.length,
        },
    // sql not in deps
        nodes: nodes.map((n: any) => ({
          id: n.id,
          type: n.type,
          label: n.data?.label || n.data?.title || '',
          data: n.data,
          position: n.position
        })),
        edges: edges.map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label || '',
          type: e.type
        }))
      };
      content = JSON.stringify(exportData, null, 2);
      filename = 'sql-graph-export.json';
      mimeType = 'application/json;charset=utf-8';
    } else if (format === 'xml') {
      const escapeXml = (str: any) => {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<sqlGraph dialect="${escapeXml(dialect)}" exportedAt="${new Date().toISOString()}">\n`;
      xml += `  <query><![CDATA[${sql}]]></query>\n`;
      xml += `  <nodes count="${nodes.length}">\n`;
      nodes.forEach((n: any) => {
        const title = n.data?.title || n.data?.label || n.id;
        const nodeType = n.data?.type || n.type || 'node';
        xml += `    <node id="${escapeXml(n.id)}" type="${escapeXml(nodeType)}">\n`;
        xml += `      <title>${escapeXml(title)}</title>\n`;
        if (n.data?.tableName) xml += `      <tableName>${escapeXml(n.data.tableName)}</tableName>\n`;
        if (n.data?.condition) xml += `      <condition>${escapeXml(n.data.condition)}</condition>\n`;
        if (n.data?.columns && Array.isArray(n.data.columns)) {
          xml += `      <columns>\n`;
          n.data.columns.forEach((col: any) => {
            const colName = typeof col === 'string' ? col : col.name || String(col);
            xml += `        <column>${escapeXml(colName)}</column>\n`;
          });
          xml += `      </columns>\n`;
        }
        xml += `    </node>\n`;
      });
      xml += `  </nodes>\n`;
      xml += `  <edges count="${edges.length}">\n`;
      edges.forEach((e: any) => {
        xml += `    <edge id="${escapeXml(e.id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">\n`;
        if (e.label) xml += `      <label>${escapeXml(String(e.label))}</label>\n`;
        xml += `    </edge>\n`;
      });
      xml += `  </edges>\n`;
      xml += `</sqlGraph>`;
      content = xml;
      filename = 'sql-graph-export.xml';
      mimeType = 'application/xml;charset=utf-8';
    } else if (format === 'drawio') {
      const escapeXml = (str: any) => {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };

      const escapeHtmlText = (str: any) => {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      };

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<mxfile host="QueryAST Lens" modified="${new Date().toISOString()}" agent="QueryAST Lens" version="21.0.0" type="device">\n`;
      xml += `  <diagram id="sql-data-flow" name="SQL Data Flow">\n`;
      xml += `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">\n`;
      xml += `      <root>\n`;
      xml += `        <mxCell id="0" />\n`;
      xml += `        <mxCell id="1" parent="0" />\n`;

      nodes.forEach((n: any, idx: number) => {
        const title = n.data?.title || n.data?.label || n.id;
        const nodeType = n.data?.type || n.type || 'table';
        const posX = Math.round(n.position?.x ?? (idx * 220));
        const posY = Math.round(n.position?.y ?? 100);

        let labelHtml = `<b>${escapeHtmlText(title)}</b>`;
        if (n.data?.tableName) {
          labelHtml += `<br/><font color="#64748b">Table: ${escapeHtmlText(n.data.tableName)}</font>`;
        }
        if (n.data?.condition) {
          labelHtml += `<br/><font color="#3b82f6">ON: ${escapeHtmlText(n.data.condition)}</font>`;
        }
        if (n.data?.columns && Array.isArray(n.data.columns) && n.data.columns.length > 0) {
          const colList = n.data.columns.map((col: any) => typeof col === 'string' ? col : col.name || String(col)).join(', ');
          labelHtml += `<br/><font color="#10b981">Cols: ${escapeHtmlText(colList)}</font>`;
        }

        let fillColor = '#f8fafc';
        let strokeColor = '#94a3b8';
        if (nodeType === 'source' || nodeType === 'table') {
          fillColor = '#eff6ff';
          strokeColor = '#3b82f6';
        } else if (nodeType === 'cte') {
          fillColor = '#faf5ff';
          strokeColor = '#a855f7';
        } else if (nodeType === 'join') {
          fillColor = '#fff7ed';
          strokeColor = '#f97316';
        } else if (nodeType === 'select' || nodeType === 'output') {
          fillColor = '#ecfdf5';
          strokeColor = '#10b981';
        }

        const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=2;shadow=1;fontFamily=Helvetica;fontSize=12;align=center;verticalAlign=middle;`;
        const width = 200;
        const height = 90;

        xml += `        <mxCell id="${escapeXml(n.id)}" value="${escapeXml(labelHtml)}" style="${style}" vertex="1" parent="1">\n`;
        xml += `          <mxGeometry x="${posX}" y="${posY}" width="${width}" height="${height}" as="geometry" />\n`;
        xml += `        </mxCell>\n`;
      });

      edges.forEach((e: any) => {
        const edgeLabel = e.label ? escapeXml(String(e.label)) : '';
        const style = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#64748b;strokeWidth=2;endArrow=classic;endSize=6;`;

        xml += `        <mxCell id="${escapeXml(e.id)}" value="${edgeLabel}" style="${style}" edge="1" parent="1" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">\n`;
        xml += `          <mxGeometry relative="1" as="geometry" />\n`;
        xml += `        </mxCell>\n`;
      });

      xml += `      </root>\n`;
      xml += `    </mxGraphModel>\n`;
      xml += `  </diagram>\n`;
      xml += `</mxfile>`;

      content = xml;
      filename = 'sql-graph-export.drawio.xml';
      mimeType = 'application/xml;charset=utf-8';
    } else if (format === 'mermaid') {
      const dir = direction === 'LR' ? 'LR' : 'TD';
      const lines: string[] = [`graph ${dir}`];

      const sanitize = (text: any) => {
        return String(text || '')
          .replace(/"/g, "'")
          .replace(/[\r\n]+/g, ' ')
          .replace(/[<>]/g, '');
      };

      nodes.forEach((node: any) => {
        const data = node.data || {};
        const label = data.label || node.id;
        const title = data.title || label;
        
        let detail = '';
        if (data.tableName) detail = `Table: ${data.tableName}`;
        else if (data.alias) detail = `Alias: ${data.alias}`;
        else if (data.condition) detail = `Cond: ${data.condition}`;

        const display = detail ? `${title} [${detail}]` : title;
        const cleanId = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
        lines.push(`  ${cleanId}["${sanitize(display)}"]`);
      });

      edges.forEach((edge: any) => {
        const source = edge.source.replace(/[^a-zA-Z0-9_]/g, '_');
        const target = edge.target.replace(/[^a-zA-Z0-9_]/g, '_');
        const label = edge.label ? `|"${sanitize(String(edge.label))}"|` : '';
        lines.push(`  ${source} -->${label} ${target}`);
      });

      content = lines.join('\n');
      filename = 'sql-graph-export.mmd';
      mimeType = 'text/plain;charset=utf-8';
    }

    if (content) {
      if (toClipboard) {
        navigator.clipboard.writeText(content);
        setCopied(format);
        setTimeout(() => setCopied(false), 2000);
      } else {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
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
      isMaximizedSql,
      uiVisibility,
      duckDbConnectedPath,
      handleExecuteDuckDb,
      handleVisualize,
      handleSaveSqlFile,
      openWithTauriAndDelegate,
      handleCopySql,
      handleFormatSql,
      handleSelectTab,
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
      isDuckDbResultExpanded,
      setIsDuckDbResultExpanded,
      setStatsInitialMode,
      activeStatsModeRef,
      selectedResultCell,
      setSelectedResultCell,
      duckDbSelectedCell,
      setDuckDbSelectedCell,
      isResultTableHoveredRef,
    };
  });

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!hotkeysStateRef.current) return;
      const {
        hotkeys: currentHotkeys,
        tabs: currentTabs,
        isMaximizedSql: currentIsMaximizedSql,
        uiVisibility: currentUiVisibility,
        duckDbConnectedPath: currentDuckDbConnectedPath,
        handleExecuteDuckDb: currentHandleExecuteDuckDb,
        handleVisualize: currentHandleVisualize,
        handleSaveSqlFile: currentHandleSaveSqlFile,
        openWithTauriAndDelegate: currentOpenWithTauriAndDelegate,
        handleCopySql: currentHandleCopySql,
        handleFormatSql: currentHandleFormatSql,
        handleSelectTab: currentHandleSelectTab,
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
        isDuckDbResultExpanded: currentIsDuckDbResultExpanded,
        setIsDuckDbResultExpanded: currentSetIsDuckDbResultExpanded,
        setStatsInitialMode: currentSetStatsInitialMode,
        activeStatsModeRef: currentActiveStatsModeRef,
        selectedResultCell: currentSelectedResultCell,
        setSelectedResultCell: currentSetSelectedResultCell,
        duckDbSelectedCell: currentDuckDbSelectedCell,
        setDuckDbSelectedCell: currentSetDuckDbSelectedCell,
        isResultTableHoveredRef: currentIsResultTableHoveredRef,
      } = hotkeysStateRef.current;

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let keyName = e.key ? e.key.toUpperCase() : '';
      if (e.code && e.code.startsWith('Key')) {
        keyName = e.code.slice(3).toUpperCase();
      } else if (e.code && e.code.startsWith('Digit')) {
        keyName = e.code.slice(5);
      } else if (e.code === 'Space' || e.key === ' ') {
        keyName = 'Space';
      } else if (e.code === 'Enter' || e.key === 'Enter') {
        keyName = 'Enter';
      } else if (e.code === 'Escape' || e.key === 'Escape') {
        keyName = 'Esc';
      } else if (e.code === 'Slash') {
        keyName = '/';
      } else if (e.code === 'Backslash') {
        keyName = '\\';
      } else if (e.code === 'Period') {
        keyName = '.';
      } else if (e.code === 'Comma') {
        keyName = ',';
      } else if (e.code === 'Semicolon') {
        keyName = ';';
      } else if (e.code === 'Quote') {
        keyName = "'";
      } else if (e.code === 'BracketLeft') {
        keyName = '[';
      } else if (e.code === 'BracketRight') {
        keyName = ']';
      } else if (e.code === 'Minus') {
        keyName = '-';
      } else if (e.code === 'Equal') {
        keyName = '=';
      } else if (e.code === 'Backquote') {
        keyName = '`';
      }

      const combo = parts.length > 0 ? `${parts.join('+')}+${keyName}` : keyName;

      // Tab switching hotkey (Modifier + 1..9)
      const tabModifier = currentHotkeys.tabSwitchModifier || 'Ctrl';
      let modMatch = false;
      if (tabModifier === 'Ctrl' && (e.ctrlKey || e.metaKey)) modMatch = true;
      else if (tabModifier === 'Alt' && e.altKey) modMatch = true;
      else if (tabModifier === 'Shift' && e.shiftKey) modMatch = true;
      else if (tabModifier === 'Meta' && e.metaKey) modMatch = true;

      if (modMatch) {
        let digitNum: number | null = null;
        if (e.code && e.code.startsWith('Digit')) {
          const d = parseInt(e.code.slice(5), 10);
          if (d >= 1 && d <= 9) digitNum = d;
        } else if (e.key && e.key >= '1' && e.key <= '9') {
          digitNum = parseInt(e.key, 10);
        }

        if (digitNum !== null) {
          const targetIndex = digitNum - 1;
          if (currentTabs[targetIndex]) {
            e.preventDefault();
            e.stopPropagation();
            currentHandleSelectTab(currentTabs[targetIndex].id);
            return;
          }
        }
      }

      if (combo === (currentHotkeys.visualize || 'Ctrl+Enter')) {
        e.preventDefault();
        e.stopPropagation();
        if (!currentIsMaximizedSql) {
          currentHandleVisualize();
        }
        if (currentUiVisibility.showDuckDbConfig || currentUiVisibility.showClickhouseConfig) {
          currentHandleExecuteDuckDb();
        }
      } else if (combo === (currentHotkeys.saveFile || 'Ctrl+S')) {
        e.preventDefault();
        e.stopPropagation();
        currentHandleSaveSqlFile();
      } else if (combo === (currentHotkeys.openFile || 'Ctrl+O')) {
        e.preventDefault();
        e.stopPropagation();
        if (isTauriEnvironment() || isTauriEnv) {
          currentOpenWithTauriAndDelegate('utf-8');
        } else {
          fileInputRef.current?.click();
        }
      } else if (combo === (currentHotkeys.copySql || 'Ctrl+Shift+C')) {
        e.preventDefault();
        e.stopPropagation();
        currentHandleCopySql();
      } else if (combo === (currentHotkeys.commentBlock || 'Ctrl+/')) {
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
      } else if (combo === (currentHotkeys.toggleWrap || 'Alt+W')) {
        e.preventDefault();
        e.stopPropagation();
        setIsWrapSql((prev) => !prev);
      } else if (combo === (currentHotkeys.formatSql || 'Ctrl+Shift+F')) {
        e.preventDefault();
        e.stopPropagation();
        currentHandleFormatSql();
      } else if (combo === (currentHotkeys.openSnippets || 'Ctrl+K')) {
        e.preventDefault();
        e.stopPropagation();
        currentSetShowSnippetsModal(true);
      } else if (combo === (currentHotkeys.toggleMaximized || 'Alt+F')) {
        e.preventDefault();
        e.stopPropagation();
        setIsMaximizedSql((prev) => !prev);
      } else if (combo === (currentHotkeys.toggleTheme || 'Alt+T')) {
        e.preventDefault();
        e.stopPropagation();
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
      } else if (combo === (currentHotkeys.openSettings || 'Ctrl+,')) {
        e.preventDefault();
        e.stopPropagation();
        currentSetShowSettingsModal(true);
      } else if (combo === (currentHotkeys.exportResultsCopy || 'Ctrl+Shift+S')) {
        e.preventDefault();
        e.stopPropagation();
        currentHandleCopyResultsToClipboard();
      } else if (combo === (currentHotkeys.refreshSchema || 'Ctrl+R')) {
        e.preventDefault();
        e.stopPropagation();
        currentFetchDuckDbSchema();
        currentSetShowDuckDbSchemaPanel?.(true);
      } else if (combo === (currentHotkeys.escapeAction || 'Esc')) {
        let acted = false;
        if ((currentSelectedResultCell || currentDuckDbSelectedCell) && currentIsResultTableHoveredRef?.current) {
          currentSetSelectedResultCell?.(null);
          currentSetDuckDbSelectedCell?.(null);
          acted = true;
        } else if (currentIsMaximizedSql && currentIsDuckDbRunning) {
          currentHandleCancelDuckDbQuery();
          acted = true;
        } else if (currentShowSettingsModal) {
          currentSetShowSettingsModal(false);
          acted = true;
        } else if (currentShowSnippetsModal) {
          currentSetShowSnippetsModal(false);
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
      } else if (combo === (currentHotkeys.toggleMiniMap || 'Alt+M')) {
        e.preventDefault();
        e.stopPropagation();
        setShowMiniMap((prev) => !prev);
      } else if (combo === (currentHotkeys.exportGraph || 'Ctrl+E')) {
        e.preventDefault();
        e.stopPropagation();
        setShowExportMenu((prev) => !prev);
      } else if (combo === (currentHotkeys.toggleColumnStats || 'Alt+Q')) {
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
    if (queryText === sqlRef.current) {
      const textareas = document.querySelectorAll('textarea');
      for (const textarea of Array.from(textareas)) {
        if (textarea.offsetWidth > 0 && textarea.offsetHeight > 0 && textarea.selectionStart !== textarea.selectionEnd) {
          queryText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
          break;
        }
      }
    }

    if (!queryText.trim()) {
      setError(null);
      setAstResult(null);
      setNodes([]);
      setEdges([]);
      setSelectedNode(null);
      return;
    }

    const result = parseSqlToAst(queryText, currentDialect);
    if (result.error) {
      setError(result.error);
      setAstResult(null);
      return;
    }

    setError(null);
    setAstResult(result.ast);
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
            expandedQueries,
            onToggleExpand: handleToggleExpand
          }
        );
        const layouted = getLayoutedElements(graphData.nodes, graphData.edges, direction);
        setNodes(layouted.nodes);
        setEdges(layouted.edges);
        
        // Select the result node as default if available and no selected node
        if (!selectedNode) {
          const resultNode = layouted.nodes.find(n => n.id.endsWith('result'));
          if (resultNode) {
            setSelectedNode(resultNode);
          } else if (layouted.nodes.length > 0) {
            setSelectedNode(layouted.nodes[0]);
          }
        }
      } catch (err: any) {
        const errMsg = err.message || String(err);
        if (!errMsg.includes("Not a SELECT query")) {
          setError(`Layout / AST Mapping error: ${errMsg}`);
        } else {
          setError(null);
        }
      }
    }
  }, [astResult, dialect, direction, showSortNodes, showLimitNodes, expandedQueries, handleToggleExpand, setNodes, setEdges]);

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
      const layouted = getLayoutedElements(nodes, edges, newDir);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlRef.current);
    setCopied('sql');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyResultsToClipboard = () => {
    if (duckDbError) {
      navigator.clipboard.writeText(duckDbError);
    } else {
      const rowsToCopy = displayedResults && displayedResults.length > 0 ? displayedResults : pagedResults;
      if (rowsToCopy && rowsToCopy.length > 0) {
        if (isTransposed) {
          const headers = ['Поле \\ №', ...rowsToCopy.map((_, i) => `#${(duckDbPage - 1) * (uiVisibility.duckDbMaxRows || 100) + i + 1}`)];
          const rows = Object.keys(rowsToCopy[0]).map(colKey => [
            colKey,
            ...rowsToCopy.map(r => r[colKey] === null ? 'null' : String(r[colKey]))
          ]);
          const csv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
          navigator.clipboard.writeText(csv);
        } else {
          const headers = ['#', ...Object.keys(rowsToCopy[0])];
          const rows = rowsToCopy.map((r, i) => [
            (duckDbPage - 1) * (uiVisibility.duckDbMaxRows || 100) + i + 1,
            ...Object.values(r).map(v => v === null ? 'null' : String(v))
          ]);
          const csv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
          navigator.clipboard.writeText(csv);
        }
        setCopied('tsv');
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleCopyTableAsImage = async () => {
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

      const blob = await toBlob(tableEl, {
        pixelRatio: 2,
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
      });

      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopiedTableImage(true);
        setTimeout(() => setCopiedTableImage(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy table image:', err);
    } finally {
      container.scrollTop = savedScrollTop;
      container.scrollLeft = savedScrollLeft;
    }
  };

  const convertInlineDashComments = (sql: string): string => {
    const lines = sql.split('\n');
    return lines
      .map((line) => {
        let inString: string | null = null;
        let inBlockComment = false;
        let codeFoundBeforeDash = false;
        let dashIndex = -1;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];

          if (inString) {
            if (char === inString && line[i - 1] !== '\\') {
              inString = null;
            }
          } else if (inBlockComment) {
            if (char === '*' && nextChar === '/') {
              inBlockComment = false;
              i++;
            }
          } else if (char === "'" || char === '"' || char === '`') {
            inString = char;
            codeFoundBeforeDash = true;
          } else if (char === '/' && nextChar === '*') {
            inBlockComment = true;
            i++;
          } else if (char === '-' && nextChar === '-') {
            dashIndex = i;
            break;
          } else if (char !== ' ' && char !== '\t' && char !== '\r') {
            codeFoundBeforeDash = true;
          }
        }

        if (dashIndex !== -1 && codeFoundBeforeDash) {
          const before = line.slice(0, dashIndex);
          const commentText = line.slice(dashIndex + 2);
          const safeCommentText = commentText.replace(/\*\//g, '* /');
          return `${before}/* ${safeCommentText.trim()} */`;
        }

        return line;
      })
      .join('\n');
  };

  const compactSql = (text: string): string => {
    if (!text) return text;

    const preprocessed = convertInlineDashComments(text);
    const lines = preprocessed.split('\n');

    const chunks: Array<{ type: 'comment' | 'code'; lines: string[] }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const isStandaloneComment = trimmed.startsWith('--');

      if (isStandaloneComment) {
        chunks.push({ type: 'comment', lines: [trimmed] });
      } else {
        if (chunks.length > 0 && chunks[chunks.length - 1].type === 'code') {
          chunks[chunks.length - 1].lines.push(line);
        } else {
          chunks.push({ type: 'code', lines: [line] });
        }
      }
    }

    const resultLines: string[] = [];

    for (const chunk of chunks) {
      if (chunk.type === 'comment') {
        resultLines.push(chunk.lines[0]);
      } else {
        const codeBlock = chunk.lines.join('\n').trim();
        if (codeBlock) {
          const compacted = codeBlock.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
          resultLines.push(compacted);
        }
      }
    }

    return resultLines.join('\n');
  };

  const handleFormatSql = () => {
    const cfg = formatterSettingsRef.current || formatterSettings;
    const sel = sqlEditorRef.current?.getSelection();

    const doFormat = (text: string) => {
      const primaryLang =
        dialect === 'PostgreSQL' || dialect === 'Oracle' || dialect === 'Clickhouse' ? 'postgresql' :
        dialect === 'MySQL' ? 'mysql' :
        dialect === 'SQLite' ? 'sqlite' : 'postgresql';

      const fallbackLangs = [primaryLang, 'postgresql', 'mysql', 'sqlite', 'sql'].filter(
        (lang, index, self) => self.indexOf(lang) === index
      );

      const smartSplitByComma = (str: string): string[] => {
        const result: string[] = [];
        let current = '';
        let parenDepth = 0;
        let inString: string | null = null;
        let inBlockComment = false;

        for (let i = 0; i < str.length; i++) {
          const char = str[i];
          const nextChar = str[i + 1];

          if (inString) {
            current += char;
            if (char === inString && str[i - 1] !== '\\') {
              inString = null;
            }
          } else if (inBlockComment) {
            current += char;
            if (char === '*' && nextChar === '/') {
              current += '/';
              inBlockComment = false;
              i++;
            }
          } else if (char === '/' && nextChar === '*') {
            inBlockComment = true;
            current += '/*';
            i++;
          } else if (char === "'" || char === '"' || char === '`') {
            inString = char;
            current += char;
          } else if (char === '(' || char === '[' || char === '{') {
            parenDepth++;
            current += char;
          } else if (char === ')' || char === ']' || char === '}') {
            if (parenDepth > 0) parenDepth--;
            current += char;
          } else if (char === ',' && parenDepth === 0) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        if (current.trim().length > 0 || result.length > 0) {
          result.push(current.trim());
        }
        return result.filter(Boolean);
      };

      const cleanFormattedSql = (sql: string): string => {
        const statements = splitBySemicolonIgnoringQuotes(sql);
        const cleanedStatements = statements.map(stmt => {
          const trimmed = stmt.trim();
          if (!trimmed) return '';
          return trimmed.replace(/\n\s*\n/g, '\n');
        }).filter(Boolean);

        const hasSemicolon = sql.trim().endsWith(';');
        if (cleanedStatements.length === 0) return sql;
        return cleanedStatements.join(';\n\n') + (hasSemicolon ? ';' : '');
      };

      const preprocessedText = convertInlineDashComments(text);

      for (const lang of fallbackLangs) {
        try {
          let formatted = formatSql(preprocessedText, {
            language: lang as any,
            keywordCase: cfg.keywordCase,
            tabWidth: cfg.tabWidth,
            useTabs: cfg.useTabs,
            expressionWidth: cfg.expressionWidth,
            denseOperators: cfg.denseOperators,
          });

          // Apply custom clause line wrapping if expressionWidth >= 0
          if (cfg.expressionWidth >= 0) {
            const maxWidth = cfg.expressionWidth;
            const indent = cfg.useTabs ? '\t' : ' '.repeat(cfg.tabWidth || 2);

            // 1. Clean up WITH clause line breaks and align CTE definitions
            formatted = formatted.replace(
              /(^|\n)(\s*)WITH\s+([\s\S]+?)(?=\n\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|;|$))/gi,
              (match, prefix, baseIndent, body) => {
                const singleLineWith = `${baseIndent}WITH ${body.replace(/\s+/g, ' ')}`;
                if (singleLineWith.length <= maxWidth) {
                  return prefix + singleLineWith;
                }
                const cleanedBody = body.replace(
                  /^(\s*)([a-zA-Z0-9_"]+)\s+AS\s*\(/gim,
                  (_, __, cteName) => `${baseIndent}${indent}${cteName} AS (`
                );
                return `${prefix}${baseIndent}WITH ${cleanedBody.trim()}`;
              }
            );

            // 1.5 Target parenthesized column and value lists in INSERT INTO and VALUES clauses
            formatted = formatted.replace(
              /((?:INSERT\s+INTO\s+[^(]+|\bVALUES\b[\s\S]*?|,\s*))\(([\s\S]+?)\)/gi,
              (match, prefix, inner) => {
                if (!/\b(INSERT|VALUES)\b/i.test(prefix) && !/^\s*,\s*$/.test(prefix)) {
                  return match;
                }
                if (/\bSELECT\b/i.test(inner) || inner.includes('--')) {
                  return match;
                }

                const prefixLines = prefix.split('\n');
                const lastPrefixLine = prefixLines[prefixLines.length - 1];
                const matchIndent = lastPrefixLine.match(/^(\s*)/)?.[1] || '';

                const items = smartSplitByComma(inner).map((s) => s.trim()).filter(Boolean);
                if (items.length === 0) return match;

                const singleLine = `(${items.join(', ')})`;
                if ((lastPrefixLine + singleLine).length <= maxWidth) {
                  return `${prefix}${singleLine}`;
                }

                const packedLines: string[] = [];
                let current = '';
                const itemIndent = matchIndent + indent;

                for (let i = 0; i < items.length; i++) {
                  const item = items[i];
                  const isLast = i === items.length - 1;
                  const itemWithComma = item + (isLast ? '' : ',');

                  if (!current) {
                    current = itemWithComma;
                  } else if ((itemIndent + current + ' ' + itemWithComma).length <= maxWidth) {
                    current += ' ' + itemWithComma;
                  } else {
                    packedLines.push(current);
                    current = itemWithComma;
                  }
                }
                if (current) packedLines.push(current);

                return `${prefix}(\n${packedLines.map((l) => itemIndent + l).join('\n')}\n${matchIndent})`;
              }
            );

            // 2. Custom clause line wrapping with baseIndent preservation, smartSplitByComma, and window function handling
            const clauseRegex =
              /(^|\n)(\s*)(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|CROSS JOIN|FULL JOIN|LEFT OUTER JOIN|RIGHT OUTER JOIN|FULL OUTER JOIN|ON|SET|VALUES|INSERT INTO|UPDATE|DELETE FROM|ARRAY JOIN|LEFT ARRAY JOIN|SETTINGS|FORMAT)\b([\s\S]+?)(?=\n\s*(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|CROSS JOIN|FULL JOIN|LEFT OUTER JOIN|RIGHT OUTER JOIN|FULL OUTER JOIN|ON|SET|VALUES|INSERT INTO|UPDATE|DELETE FROM|ARRAY JOIN|LEFT ARRAY JOIN|SETTINGS|FORMAT|WITH)|;|$)/gi;

            formatted = formatted.replace(
              clauseRegex,
              (match, prefix, baseIndent, keyword, items) => {
                if (/\bSELECT\b/i.test(items)) {
                  return match;
                }

                const lines = items.split('\n').filter((l) => l.trim() !== '');
                const chunks: Array<{ type: 'code' | 'comment'; text: string }> = [];
                let currentCodeLines: string[] = [];

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.startsWith('--')) {
                    if (currentCodeLines.length > 0) {
                      chunks.push({ type: 'code', text: currentCodeLines.join('\n') });
                      currentCodeLines = [];
                    }
                    chunks.push({ type: 'comment', text: trimmed });
                  } else {
                    currentCodeLines.push(line);
                  }
                }
                if (currentCodeLines.length > 0) {
                  chunks.push({ type: 'code', text: currentCodeLines.join('\n') });
                }

                const hasCommentChunks = chunks.some((c) => c.type === 'comment');
                const formattedLines: string[] = [];

                for (const chunk of chunks) {
                  if (chunk.type === 'comment') {
                    formattedLines.push(`${baseIndent}${indent}${chunk.text}`);
                  } else {
                    const rawItems = smartSplitByComma(chunk.text);
                    if (rawItems.length === 0) continue;

                    const processedItems = rawItems.map((item) => {
                      const collapsed = item.replace(/\s+/g, ' ').trim();
                      if (collapsed.length <= maxWidth && /\bOVER\s*\(/i.test(item)) {
                        return collapsed;
                      }
                      return item.trim();
                    });

                    let currentLine = `${baseIndent}${indent}`;
                    let firstInChunk = true;

                    for (let i = 0; i < processedItems.length; i++) {
                      const item = processedItems[i];
                      const isLast = i === processedItems.length - 1;
                      const itemWithComma = item + (isLast ? '' : ',');

                      if (firstInChunk) {
                        currentLine += itemWithComma;
                        firstInChunk = false;
                      } else if ((currentLine + ' ' + itemWithComma).length <= maxWidth) {
                        currentLine += ' ' + itemWithComma;
                      } else {
                        formattedLines.push(currentLine);
                        currentLine = `${baseIndent}${indent}${itemWithComma}`;
                      }
                    }
                    if (currentLine.trim()) {
                      formattedLines.push(currentLine);
                    }
                  }
                }

                if (formattedLines.length === 0) return match;

                if (!hasCommentChunks) {
                  const singleLine = `${baseIndent}${keyword} ${formattedLines
                    .map((l) => l.trim())
                    .join(' ')}`;
                  if (singleLine.length <= maxWidth) {
                    return prefix + singleLine;
                  }
                }

                return prefix + `${baseIndent}${keyword}\n${formattedLines.join('\n')}`;
              }
            );
          }
          return cleanFormattedSql(formatted);
        } catch (e) {
          // Ignore syntax errors, try next dialect
        }
      }
      throw new Error('Не удалось отформатировать (ошибка синтаксиса)');
    };

    if (sel && sel.text.trim()) {
      try {
        const formatted = doFormat(sel.text);
        sqlEditorRef.current?.replaceSelection(formatted);
      } catch (e) {
        console.warn('Format error', e);
      }
      return;
    }

    const currentSqlText = sqlRef.current;
    if (!currentSqlText.trim()) return;

    try {
      const formatted = doFormat(currentSqlText);
      sqlRef.current = formatted; setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: formatted } : t));
    } catch (e) {
      console.warn('Format error', e);
    }
  };

  const handleCompactSql = () => {
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
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: compacted } : t));
  };

  const handleNodeClick = (_event: any, node: any) => {
    setSelectedNode(node);
  };

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
        <aside id="control-panel" className={`w-[40%] min-w-[380px] max-w-[580px] border-r flex flex-col shrink-0 transition-colors ${
          theme === 'dark' ? 'bg-slate-750/50 border-slate-600' : 'bg-slate-200/80 border-slate-400/60'
        }`}>
          
          {/* LEFT PANEL TOP BAR */}
          <div className={`flex items-center justify-between px-4 h-[38px] border-b shrink-0 select-none transition-colors ${
            theme === 'dark' ? 'bg-slate-750 border-slate-600' : 'bg-slate-200/80 border-slate-400/60'
          }`}>
            <div className="flex items-center gap-2 max-w-[240px] truncate">
              <h3 className={`font-bold text-sm truncate ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                {tabs.find(t => t.id === activeTabId)?.title || 'SQL Query'}
              </h3>
              {tabs.find(t => t.id === activeTabId)?.isModified && (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" title="Файл изменен (не сохранен)" />
              )}
            </div>
              <div className="flex items-center gap-1.5 relative">
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
                  title="Открыть SQL файл с диска (UTF-8)"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                  <span>Открыть</span>
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
                  title="Сохранить SQL в .sql файл"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Сохранить</span>
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
                  title="Библиотека шаблонов"
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
                  title="Открыть SQL Query редактор"
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
              {/* SYNTAX HIGHLIGHTED SQL EDITOR */}
              <ErrorBoundary title="Ошибка редактора SQL" theme={theme}>
                {!isTabsLoaded ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Загрузка сессии...</span>
                  </div>
                ) : !isMaximizedSql ? (
                  <SqlEditor editorRef={sqlEditorRef}
                    value={getActiveTabSql()}
                    onChange={handleSqlChange}
                    isWrapSql={isWrapSql}
                    theme={theme}
                    onCompactSql={handleCompactSql}
                    onExecuteQuickAction={handleExecuteQuickAction}
                    extractedTableName={extractedTableName}
                    isQuickActionsEnabled={uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig}
                  />
                ) : (
                  <div className="flex-1" />
                )}
              </ErrorBoundary>
          </div>

          {/* VISUALIZE ACTION BAR */}
          <div className="flex items-center gap-1.5 relative">
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
                title="Готовые шаблоны и примеры SQL"
              >
                Пресеты
              </button>

              {/* PRESETS DROPDOWN POPOVER */}
              {showPresetsDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setShowPresetsDropdown(false)} 
                  />
                  <div className={`absolute bottom-full mb-1.5 left-0 z-40 rounded-lg border shadow-xl p-2 w-72 animate-in fade-in duration-150 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-600/40 mb-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Готовые SQL пресеты</span>
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
              title="Перенос строки"
            >
              <WrapText className="w-3 h-3" />
              <span>Перенос</span>
            </button>

            {/* FORMAT SQL BUTTON */}
            {uiVisibility.showFormatSql && (
            <button
              onClick={handleFormatSql}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-mono transition-all shrink-0 ${
                theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
              }`}
              title="Форматировать SQL (Ctrl+Shift+F)"
            >
              <AlignLeft className="w-3 h-3" />
              <span>Формат</span>
            </button>
            )}

            {/* COMPACT SQL BUTTON */}
            {uiVisibility.showCompactSql !== false && (
            <button
              onClick={handleCompactSql}
              className={`p-1.5 rounded-md transition-all shrink-0 ${
                theme === 'dark' ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/50' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              title="Формат в одну строку"
            >
              <Shrink className="w-3.5 h-3.5" />
            </button>
            )}

            {/* COPY SQL BUTTON */}
            {uiVisibility.showCopySql && (
            <button
              onClick={handleCopySql}
              className={`flex items-center gap-1 text-xs px-1.5 py-1.5 rounded-md transition-colors shrink-0 ${theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-600 hover:text-slate-900'}`}
              title="Copy SQL"
            >
              {copied === 'sql' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
            )}

            <button
              onClick={() => handleVisualize()}
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md shadow-md shadow-blue-900/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Visualize</span>
            </button>
          </div>
          </div>
        </aside>
        )}

        {/* RIGHT PANEL: INTERACTIVE CANVAS (70% WIDTH) */}
        <section className={`flex-1 flex flex-col h-full relative transition-colors ${
          theme === 'dark' ? 'bg-slate-850 text-slate-200' : 'bg-slate-200 text-slate-800'
        }`}>
          
          {/* CANVAS CONTROLS HEADER */}
          <div className={`flex items-center justify-between px-4 h-[38px] border-b z-10 select-none transition-colors ${
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

                <div className={`flex p-0.5 rounded-md border ${
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
                    title="Подсветка взаимосвязей (Data Lineage) выделенного узла"
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
              {uiVisibility.showEditorToggleBtn && (
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

              <button
                onClick={() => setShowSettingsModal(true)}
                className={`p-1.5 rounded-lg border transition-all ${
                  theme === 'dark' 
                    ? 'bg-slate-850 border-slate-600 text-slate-200 hover:text-slate-100' 
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900 shadow-sm'
                }`}
                title="Настройки и горячие клавиши"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              {/* EXPORT GRAPH DROPDOWN */}
              {uiVisibility.showExportButton && (
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={isExporting || nodes.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all bg-blue-600 hover:bg-blue-500 border-blue-500 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export entire graph as image/vector scheme"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Экспорт</span>
                  <ChevronDown className="w-3 h-3 opacity-80" />
                </button>

                {showExportMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setShowExportMenu(false)} 
                    />
                    <div className={`absolute right-0 mt-1 w-52 rounded-lg border shadow-xl z-30 overflow-hidden py-1 text-xs ${
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
                        onClick={() => exportGraph('png', true)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors border-t ${
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
                        onClick={() => exportGraph('svg', false)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors border-t ${
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
                        onClick={() => exportGraph('svg', true)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors border-t ${
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
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileJson className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-semibold">JSON Data</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => exportGraphText('json', true)}
                            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${copied === 'json' ? 'text-emerald-500' : theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Copy JSON to clipboard"
                          >
                            {copied === 'json' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
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
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileCode className="w-3.5 h-3.5 text-purple-400" />
                          <span className="font-semibold">XML Schema</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => exportGraphText('xml', true)}
                            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${copied === 'xml' ? 'text-emerald-500' : theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Copy XML to clipboard"
                          >
                            {copied === 'xml' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
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
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Workflow className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-semibold">Mermaid Diagram</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => exportGraphText('mermaid', true)}
                            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${copied === 'mermaid' ? 'text-emerald-500' : theme === 'dark' ? 'hover:bg-slate-600 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                            title="Copy Mermaid to clipboard"
                          >
                            {copied === 'mermaid' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
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
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Workflow className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="font-semibold">Draw.io Diagram</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
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
          <div className={`flex-1 w-full relative min-h-0 ${theme === 'dark' ? 'bg-slate-850' : 'bg-slate-200'}`} style={{ willChange: 'transform', transform: 'translateZ(0)', zoom: 1 / ((uiVisibility.uiScale ?? 100) / 100) }}>
            <ErrorBoundary title="Ошибка отображения графа" theme={theme}>
            {/* Grid Pattern Background styled specifically to match the design style */}
            <div className={`absolute inset-0 pointer-events-none opacity-[0.07] dark:opacity-10`} style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            
            {nodes.length > 0 ? (
              <ReactFlow
                nodes={processedNodes}
                edges={processedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={2}
                className="sql-flow-canvas"
                onlyRenderVisibleElements={true}
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
                  Введите SQL-запрос в редактор слева и нажмите <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}>Visualize</strong> для построения интерактивного логического графа.
                </div>
              </div>
            )}
              </ErrorBoundary>

            {/* RAW AST OVERLAY SIDEBAR */}
            {showAstPreview && (
              <div className={`absolute right-0 top-0 bottom-0 w-80 border-l z-20 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 ${
                theme === 'dark' ? 'bg-[#172033] border-slate-600 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
              }`}>
                <div className={`flex items-center justify-between p-3 border-b ${
                  theme === 'dark' ? 'border-slate-600 bg-slate-850/40' : 'border-slate-200 bg-slate-50'
                }`}>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-amber-500 font-bold">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Parsed AST Tree</span>
                  </div>
                  <button
                    onClick={() => setShowAstPreview(false)}
                    className={`p-1 rounded transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-600 text-slate-200' : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 p-3 overflow-y-auto text-[11px] font-mono select-text">
                  {astResult ? (
                    <pre className={`p-3 rounded-lg border overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-full ${
                      theme === 'dark' ? 'bg-[#172033] border-slate-750 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}>
                      {JSON.stringify(astResult, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-slate-400 italic text-center mt-10">
                      No AST available. Parse a valid query to inspect its syntax tree.
                    </div>
                  )}
                </div>
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
                  </div>
                </div>

                <button
                  onClick={() => setSelectedNode(null)}
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
            <div className={`flex flex-wrap items-center justify-between gap-2 px-4 h-[38px] border-b shrink-0 ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-200/90 border-slate-300'
            }`}>
              <div className="flex items-center gap-2.5">
                <Code className="w-4 h-4 text-blue-500" />
                <h3 className={`font-bold text-sm ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  Query Editor
                </h3>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                {uiVisibility.showOpenFile && (
                <button
                  onClick={() => isTauriEnvironment() || isTauriEnv ? openWithTauriAndDelegate(handleOpenFile) : fileInputRef.current?.click()}
                  className={`flex items-center gap-1 text-xs px-1.5 py-1 font-normal transition-colors ${
                    theme === 'dark' 
                      ? 'text-slate-300 hover:text-slate-100' 
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title="Открыть SQL файл с диска (UTF-8)"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                  <span>Открыть</span>
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
                  title="Сохранить SQL в .sql файл"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Сохранить</span>
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
                  title="Библиотека шаблонов"
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
                  title="История версий SQL"
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

                {(uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && (
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <button
                      onClick={() => setShowDuckDbConnMenu(!showDuckDbConnMenu)}
                    className={`flex items-center gap-1 text-xs px-2.5 h-[26px] rounded font-semibold transition-colors ${
                      clickhouseConfig
                        ? theme === 'dark' 
                          ? 'text-amber-300 hover:text-amber-100 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30' 
                          : 'text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 shadow-2xs'
                        : theme === 'dark' 
                          ? 'text-teal-300 hover:text-teal-100 bg-teal-950/40 hover:bg-teal-900/60 border border-teal-500/30' 
                          : 'text-teal-800 hover:text-teal-950 bg-teal-100 hover:bg-teal-200 border border-teal-300 shadow-2xs'
                    }`}
                    title="Настроить подключение DB"
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
                      <div className={`absolute top-full mt-1 right-0 z-40 rounded-lg border shadow-xl p-1.5 w-60 animate-in fade-in duration-150 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                      }`}>
                        {uiVisibility.showDuckDbConfig && (
                          <>
                            <button
                              onClick={() => {
                                setShowDuckDbConnMenu(false);
                                setClickhouseConfig(null);
                                setActiveEngine('duckdb');
                                handleConfigureDuckDb();
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Открыть файл DuckDB</span>
                            </button>
                            <button
                              onClick={() => {
                                setShowDuckDbConnMenu(false);
                                setClickhouseConfig(null);
                                setActiveEngine('duckdb');
                                handleCreateDuckDbFile();
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span>Создать новую БД (.duckdb)</span>
                            </button>
                            <button
                              onClick={() => {
                                setShowDuckDbConnMenu(false);
                                setClickhouseConfig(null);
                                setActiveEngine('duckdb');
                                handleConnectInMemory();
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <Cpu className="w-3.5 h-3.5 text-purple-500 shrink-0 opacity-80" />
                              <span>In-Memory БД (:memory:)</span>
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
                                if (duckDbConnectedPath) {
                                  handleDisconnectDuckDb();
                                }
                                setActiveEngine('clickhouse');
                                setShowClickhouseModal(true);
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <Database className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Подключить Clickhouse</span>
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
                          title="Показать схему DuckDB"
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
                        title="Отключить DuckDB"
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
                          title="Показать схему Clickhouse"
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
                        title="Отключить Clickhouse"
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
                    onClick={() => setIsMaximizedSql(false)}
                    className={`flex items-center justify-center gap-1.5 px-3 h-[26px] rounded-md text-xs font-semibold transition-colors ${
                      theme === 'dark' 
                        ? 'bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600' 
                        : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 shadow-2xs'
                    }`}
                    title="Вернуться к графу"
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
                <div className={`flex items-end gap-1.5 pl-0 pr-3 h-[37px] border-b overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0 select-none ${
                  theme === 'dark' ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-200/60 border-slate-300'
                }`}>
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
                        {tab.isModified ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" title="Файл изменен (не сохранен)" />
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
                            title="Двойной клик для переименования"
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
                            title="Закрыть вкладку"
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
                      className={`p-1 rounded-md self-end mb-1 text-xs transition-colors shrink-0 ${
                        theme === 'dark'
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/80'
                      }`}
                      title="Новая вкладка"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* BODY */}
                <div className="flex-1 p-0 flex flex-col min-h-0 relative">
                  {!isTabsLoaded ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
                      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                      <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Загрузка SQL сессии...</span>
                    </div>
                  ) : (
                    <ErrorBoundary title="Ошибка редактора SQL" theme={theme}>
                      <SqlEditor editorRef={sqlEditorRef}
                        value={getActiveTabSql()}
                        onChange={handleSqlChange}
                        isWrapSql={isWrapSql}
                        theme={theme}
                        onCompactSql={handleCompactSql}
                        onExecuteQuickAction={handleExecuteQuickAction}
                        extractedTableName={extractedTableName}
                        isQuickActionsEnabled={uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig}
                        isFullScreen={true}
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
                            Закрыть несохраненную вкладку?
                          </h3>
                          <p className={`text-xs mt-1 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                            Вкладка &quot;<span className={`font-medium ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>{tabToClosePendingConfirm.title}</span>&quot; содержит несохраненные изменения.
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
                          Отмена
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
                          Закрыть
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SCHEMA BROWSER */}
              {showDuckDbSchemaPanel && (duckDbConnectedPath || clickhouseConfig) && (
                <div 
                  className={`${isSchemaZoomed ? 'w-[50vw]' : 'w-[30vw] min-w-[220px]'} flex flex-col shrink-0 border-l ${theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-300'}`}
                >
                  <div className={`px-3 h-[37px] border-b flex items-center justify-between shrink-0 transition-colors ${theme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
                    <span className={`text-xs font-semibold flex items-center gap-2 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      <Database className="w-3.5 h-3.5 text-teal-500" />
                      <span>Schema Browser</span>
                      {isSchemaLoading && (
                        <span className="flex items-center gap-1 text-[10px] font-normal text-blue-400 animate-pulse ml-1">
                          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                          <span>Загрузка...</span>
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => fetchDuckDbSchema(true)}
                        className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                        title="Обновить схему (Ctrl+R)"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSchemaLoading ? 'animate-spin text-blue-400' : ''}`} />
                      </button>
                      <button 
                        onClick={() => setIsSchemaZoomed(!isSchemaZoomed)}
                        className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                        title={isSchemaZoomed ? "Стандартный размер" : "Увеличить в 2 раза"}
                      >
                        {isSchemaZoomed ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                      <button 
                        onClick={() => setShowDuckDbSchemaPanel(false)}
                        className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                        title="Закрыть"
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
                            placeholder="Поиск..." 
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
                              title="Очистить поиск"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <button 
                          onClick={handleExpandAllSchemaNodes}
                          className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                          title="Развернуть все"
                        >
                          <ChevronsUpDown className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setExpandedSchemaNodes({})}
                          className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`}
                          title="Свернуть все"
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
                            .map(([dbName, schemas]) => (
                          <div key={dbName} className="mb-1">
                            <div 
                              className={`text-xs font-bold px-2 py-1 flex items-center gap-1.5 rounded cursor-pointer select-none transition-colors ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-800'}`}
                              onClick={() => toggleSchemaNode(`db-${dbName}`)}
                            >
                              <Database className={`w-3.5 h-3.5 ${dbName.toLowerCase() === 'system' ? 'opacity-35' : 'opacity-70'}`} />
                              <span className="truncate">{dbName}</span>
                            </div>
                            {expandedSchemaNodes[`db-${dbName}`] && (
                              <div className="pl-2 border-l ml-2 border-slate-400/20 mt-1">
                                {Object.entries(schemas).map(([schemaName, types]) => (
                                  <div key={schemaName} className="mb-1">
                                    <div 
                                      className={`text-[11px] font-semibold px-2 py-1 flex items-center gap-1.5 rounded cursor-pointer select-none transition-colors ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-700'}`}
                                      onClick={() => toggleSchemaNode(`sch-${dbName}-${schemaName}`)}
                                    >
                                      <FileText className="w-3 h-3 opacity-70" />
                                      <span className="truncate">{schemaName}</span>
                                    </div>
                                    {expandedSchemaNodes[`sch-${dbName}-${schemaName}`] && (
                                      <div className="pl-2 border-l ml-2 border-slate-400/20 mt-1">
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
                                                  const tableKey = `${dbName}.${schemaName}.${tableName}`;
                                                  const sizeBadge = getTableSizeBadge([itemInfo]);
                                                  const isLoadingCols = !!loadingTableCols[tableKey];
                                                  const isExpanded = !!expandedSchemaNodes[`tbl-${dbName}-${schemaName}-${tableName}`];

                                                  return (
                                                    <div key={tableName} className="mb-1">
                                                      <div 
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
                                                        title="Нажмите, чтобы развернуть, или ПКМ для меню"
                                                      >
                                                        <div className={`flex items-center gap-1.5 truncate ${
                                                          theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
                                                        }`}>
                                                          {itemInfo.table_type === 'Macros' ? (
                                                            <span className="font-serif italic font-bold text-[11px] leading-none shrink-0 opacity-80 select-none pr-0.5" title="Нажмите, чтобы развернуть и скопировать название">
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
                                                              <span>Загрузка...</span>
                                                            </div>
                                                          ) : cols && cols.length > 0 ? (
                                                            cols.map((col: any, idx: number) => (
                                                              <div 
                                                                key={idx} 
                                                                className={`cursor-pointer text-[10px] flex items-center justify-between gap-2 px-1.5 py-0.5 rounded transition-colors ${theme === 'dark' ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-200'}`}
                                                                onClick={() => navigator.clipboard.writeText(col.column_name)}
                                                                title={`${col.column_name} (${col.data_type})\nНажмите, чтобы скопировать`}
                                                              >
                                                                <span className="font-mono truncate min-w-0 flex-1" title={col.column_name}>{col.column_name}</span>
                                                                <span className="text-[9px] opacity-60 shrink-0 font-mono max-w-[120px] truncate text-right" title={col.data_type}>
                                                                  {/^Enum(8|16)?\s*\(/i.test(col.data_type || '') 
                                                                    ? ((col.data_type || '').match(/^(Enum(?:8|16)?)/i)?.[1] || 'Enum') + '(...)' 
                                                                    : (col.data_type || '').length > 22 
                                                                      ? (col.data_type || '').slice(0, 20) + '…' 
                                                                      : col.data_type}
                                                                </span>
                                                              </div>
                                                            ))
                                                          ) : (
                                                            <div className="text-[10px] opacity-50 px-1 py-0.5 italic">
                                                              Данные отсутствуют
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
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                        ) : (
                          <div className="py-8 text-center opacity-70 flex flex-col items-center justify-center gap-1.5">
                            <Database className="w-5 h-5 opacity-40" />
                            <span>{schemaSearchTerm ? 'Ничего не найдено по запросу' : 'Таблицы не найдены (БД пуста)'}</span>
                            {schemaSearchTerm && (
                              <button 
                                onClick={() => setSchemaSearchTerm('')}
                                className="text-[11px] text-blue-400 hover:underline mt-1"
                              >
                                Сбросить фильтр
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  ) : isSchemaLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Загрузка схемы базы данных...</span>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-50">
                      <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Схема не загружена или пуста</span>
                    </div>
                  )}
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
                    <span>Показать</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSchemaContextAction('copySelect')}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Копировать Select</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSchemaContextAction('copyInsert')}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Копировать Insert</span>
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
                className={`flex flex-col min-h-0 overflow-hidden ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                } ${
                  isDuckDbResultExpanded 
                    ? 'border-t flex flex-col shrink-0 h-[70vh]' 
                    : 'border-t flex flex-col shrink-0 h-[35vh]'
                }`} 
              >
                <div className={`flex items-center justify-between px-3 py-1.5 border-b shrink-0 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
                }`}>
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className={`text-xs font-semibold flex items-center gap-2 shrink-0 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      <Database className="w-3.5 h-3.5 text-teal-500" />
                      Результат запроса
                    </span>

                    {duckDbResults && (
                      <div className="flex items-center gap-2 text-xs shrink-0">
                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded transition-all ${
                          theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          <span>(записей: {duckDbResults.length})</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            disabled={duckDbPage <= 1 || isDuckDbRunning}
                            onClick={() => handleExecuteCurrentEngineQuery(lastExecutedSql, duckDbPage - 1)}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all font-mono disabled:opacity-30 disabled:cursor-not-allowed ${
                              theme === 'dark' ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/40' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-400/30'
                            }`}
                            title="Предыдущая страница"
                          >
                            &lt;
                          </button>
                          <span className={`flex items-center text-xs px-2.5 py-1 rounded transition-all ${
                            theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                          }`}>
                            стр {duckDbPage}
                          </span>
                          <button
                            disabled={isDuckDbRunning || !duckDbResults || duckDbResults.length < effectiveMaxRows}
                            onClick={() => handleExecuteCurrentEngineQuery(lastExecutedSql, duckDbPage + 1)}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all font-mono disabled:opacity-30 disabled:cursor-not-allowed ${
                              theme === 'dark' ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/40' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-400/30'
                            }`}
                            title="Следующая страница"
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
                                placeholder="Столбец"
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
                                title="Быстрый поиск и переход к столбцу"
                              />
                              {columnSearchTerm && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setColumnSearchTerm('');
                                  }}
                                  className="absolute right-1.5 text-slate-400 hover:text-slate-200 text-xs font-bold px-0.5"
                                  title="Очистить"
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
                                    {Object.keys(duckDbResults[0])
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
                                    {Object.keys(duckDbResults[0]).filter(col => col.toLowerCase().includes(columnSearchTerm.toLowerCase())).length === 0 && (
                                      <div className="text-[11px] text-slate-400 p-2 text-center italic">
                                        Столбцы не найдены
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
                              placeholder="Значение"
                              value={valueSearchTerm}
                              onChange={(e) => setValueSearchTerm(e.target.value)}
                              className={`w-22 pl-2 pr-5 py-0.5 text-xs rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                theme === 'dark' 
                                  ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500 focus:bg-slate-900' 
                                  : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                              }`}
                              title="Быстрый поиск значения в результате"
                            />
                            {valueSearchTerm && (
                              <button
                                type="button"
                                onClick={() => setValueSearchTerm('')}
                                className="absolute right-1 text-slate-400 hover:text-slate-200 text-xs font-bold px-0.5"
                                title="Очистить"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* CANCEL QUERY BUTTON */}
                    {isDuckDbRunning && (
                      <button
                        onClick={handleCancelDuckDbQuery}
                        className="flex items-center justify-center gap-1 text-xs px-2 h-6 rounded font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors mr-1 shadow-2xs shrink-0"
                        title="Отменить выполнение текущего запроса"
                      >
                        <Square className="w-3 h-3 fill-white shrink-0" />
                        <span>Отменить</span>
                      </button>
                    )}

                    {/* QUICK ACTIONS BUTTON AND DROPDOWN */}
                    <div className="relative">
                      <button
                        onClick={() => setShowQuickActionsMenu(!showQuickActionsMenu)}
                        disabled={!duckDbResults || duckDbResults.length === 0 || isDuckDbRunning}
                        className={`h-6 w-6 flex items-center justify-center rounded transition-colors disabled:opacity-40 ${
                          theme === 'dark'
                            ? 'hover:bg-slate-700 text-slate-400'
                            : 'hover:bg-slate-200 text-slate-500'
                        }`}
                        title="Быстрые действия над результатами"
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
                                  title={action.name}
                                  className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors min-w-0 ${
                                    theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  <span className="truncate">{action.name}</span>
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

                          setIsDuckDbRunning(true);
                          setDuckDbError(null);

                          const handleExecuteRawQueryForStats = async (sqlToRun: string): Promise<any[]> => {
                            const isClickhouse = activeEngine === 'clickhouse' || (!duckDbConnectedPath && !!clickhouseConfig);
                            if (isClickhouse && clickhouseConfig) {
                              let queryWithFormat = sqlToRun.trim();
                              if (!/\bFORMAT\b/i.test(queryWithFormat) && !/^\s*(CREATE|INSERT|DELETE|ALTER|DROP|TRUNCATE|SET|USE|OPTIMIZE|SYSTEM)\b/i.test(queryWithFormat)) {
                                queryWithFormat += ' FORMAT JSON';
                              }
                              if (isTauriEnvironment()) {
                                const res = await executeClickhouseQueryTauri(clickhouseConfig, queryWithFormat);
                                return res?.data || [];
                              } else {
                                const data = await fetchApiJson('/api/clickhouse/query', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    ...clickhouseConfig,
                                    query: queryWithFormat,
                                  }),
                                });
                                if (data?.error) throw new Error(data.error);
                                return data?.data || [];
                              }
                            } else {
                              if (isTauriEnvironment() && !isWasmMode) {
                                const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', { sql: sqlToRun });
                                return (res?.rows || []).map(row => {
                                  const obj: Record<string, any> = {};
                                  (res.columns || []).forEach((col, idx) => {
                                    obj[col] = row[idx];
                                  });
                                  return obj;
                                });
                              } else if (isWasmMode) {
                                return await queryDuckDbWasm(sqlToRun);
                              } else {
                                const data = await fetchApiJson('/api/duckdb/query', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ query: sqlToRun })
                                });
                                if (data?.error) throw new Error(data.error);
                                return data?.data || [];
                              }
                            }
                          };

                          const runRawQuery = async (sqlToRun: string): Promise<any[]> => {
                            return await handleExecuteRawQueryForStats(sqlToRun);
                          };

                          try {
                            const strippedSql = (lastExecutedSql || '').trim().replace(/;+$/, '');
                            let targetTable = extractedTableName;
                            if (!targetTable || targetTable === 'table') {
                              targetTable = '';
                            }

                            let sqlToRun = targetTable ? `SUMMARIZE ${targetTable}` : (strippedSql ? `SUMMARIZE (${strippedSql})` : '');
                            if (!sqlToRun) {
                              throw new Error('Нет таблицы или SQL-запроса для выполнения SUMMARIZE');
                            }

                            let rows: any[] | null = null;
                            try {
                              rows = await runRawQuery(sqlToRun);
                            } catch (firstErr: any) {
                              if (targetTable && strippedSql) {
                                rows = await runRawQuery(`SUMMARIZE (${strippedSql})`);
                              } else {
                                throw firstErr;
                              }
                            }

                            if (rows && rows.length > 0) {
                              setSummarizeResults(rows);
                              setResultsViewMode('summarize');
                            } else {
                              throw new Error('База данных вернула пустой результат для SUMMARIZE');
                            }
                          } catch (err: any) {
                            console.error("SUMMARIZE execution error:", err);
                            setDuckDbError(err?.message || String(err));
                          } finally {
                            setIsDuckDbRunning(false);
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
                        title={resultsViewMode === 'summarize' ? "Вернуться к таблице" : "Экспресс-статистика по столбцам (SUMMARIZE)"}
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
                      title={resultsViewMode === 'chart' ? "Вернуться к таблице" : "Визуализировать результаты (Графики)"}
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
                      title={isTransposed ? "Обычный вид таблицы" : "Транспонировать таблицу (строки <-> столбцы)"}
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={handleCopyResultsToClipboard}
                      className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                      }`}
                      title={copied === 'tsv' ? "Скопировано!" : "Скопировать результаты (TSV)"}
                    >
                      {copied === 'tsv' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button 
                      onClick={handleCopyTableAsImage}
                      className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                        theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                      }`}
                      title={copiedTableImage ? "Скопировано!" : "Скопировать таблицу как картинку"}
                    >
                      {copiedTableImage ? <Check className="w-4 h-4 text-emerald-500" /> : <ImageIcon className="w-4 h-4" />}
                    </button>
                    {!isDuckDbResultExpanded && (
                      <button 
                        onClick={() => setIsDuckDbResultExpanded(true)}
                        className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                          theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                        }`}
                        title="Увеличить таблицу"
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
                      title={isDuckDbResultExpanded ? "Уменьшить таблицу" : "Свернуть таблицу"}
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
                        title="Закрыть результаты"
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
                        />
                      ) : resultsViewMode === 'chart' ? (
                        <DataStatsViewer
                          data={duckDbResults}
                          theme={theme}
                          initialChartType={statsInitialMode.chartType}
                          initialListSubMode={statsInitialMode.listSubMode}
                          onSubModeChange={(ct, sm) => {
                            activeStatsModeRef.current = { chartType: ct, listSubMode: sm };
                          }}
                          tableName={extractedTableName}
                          lastExecutedSql={lastExecutedSql || getActiveTabSql()}
                          activeEngine={activeEngine}
                          onExecuteQuery={handleExecuteRawQueryForStats}
                        />
                      ) : isTransposed ? (
                        <table className="w-full text-left border-separate border-spacing-0 text-xs">
                          <thead className="sticky top-0 z-20 [transform:translateZ(0)]">
                            <tr>
                              <th className={`sticky top-0 left-0 z-30 px-3 py-2 font-semibold border-b-[1.5px] border-r-[1.5px] whitespace-nowrap min-w-[140px] max-w-[200px] [transform:translateZ(0)] ${
                                theme === 'dark' ? 'border-b-slate-600 border-r-slate-600 text-slate-200 bg-slate-800' : 'border-b-slate-300 border-r-slate-300 text-slate-800 bg-slate-100'
                              }`}>
                                Поле \ №
                              </th>
                              {displayedResults.map((_, i) => {
                                const rowNum = (duckDbPage - 1) * (uiVisibility.duckDbMaxRows || 100) + i + 1;
                                const isRowSelected = selectedResultCell?.rowIndex === i;
                                return (
                                  <th
                                    key={i}
                                    className={`sticky top-0 z-20 px-3 py-2 font-semibold border-b-[1.5px] border-r whitespace-nowrap text-center min-w-[80px] max-w-[200px] [transform:translateZ(0)] ${
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
                            {displayedResults.length > 0 && Object.keys(displayedResults[0]).map((colKey) => {
                              const isColSelected = selectedResultCell?.colKey === colKey;
                              return (
                                <tr key={colKey}>
                                  <td 
                                    id={`th-col-${colKey}`}
                                    className={`sticky left-0 z-10 px-3 py-1.5 font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] cursor-pointer border-r-[1.5px] border-b [transform:translateZ(0)] ${
                                      isColSelected
                                        ? theme === 'dark' ? 'bg-blue-950 text-blue-200 border-r-blue-500 border-b-slate-700/80 font-bold' : 'bg-blue-100 text-blue-900 border-r-blue-500 border-b-slate-200 font-bold'
                                        : theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-r-slate-600 border-b-slate-700/80' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-r-slate-300 border-b-slate-200'
                                    }`}
                                    title={colKey}
                                    onClick={() => {
                                      setSelectedResultCell({ rowIndex: -1, colKey });
                                      setDuckDbSelectedCell({ title: `Столбец: ${colKey}`, content: computeColumnStats(colKey, displayedResults) });
                                    }}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSelectedResultCell({ rowIndex: -1, colKey });
                                      setResultTableContextMenu({ x: e.clientX, y: e.clientY, colKey });
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate">{colKey}</span>
                                      {activeSqlSorts.find(s => s.colKey === colKey) && (
                                        <span className="text-[10px] text-blue-400 font-bold shrink-0">
                                          {activeSqlSorts.find(s => s.colKey === colKey)?.dir === 'ASC' ? '▲' : '▼'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {displayedResults.map((row, i) => {
                                    const val = row[colKey];
                                    const isCellSelected = selectedResultCell?.rowIndex === i && selectedResultCell?.colKey === colKey;
                                    const isRowSelected = selectedResultCell?.rowIndex === i;

                                    let cellClasses = 'px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[288px] cursor-pointer border-r border-b ';
                                    if (isCellSelected) {
                                      cellClasses += theme === 'dark' ? 'bg-blue-600/40 text-blue-100 font-semibold border-r-slate-700/80 border-b-slate-700/80' : 'bg-blue-500/25 text-blue-950 font-semibold border-r-slate-200 border-b-slate-200';
                                    } else if (isRowSelected || isColSelected) {
                                      cellClasses += theme === 'dark' ? 'bg-blue-950/40 text-slate-300 border-slate-700/80' : 'bg-blue-50/70 text-slate-800 border-slate-200';
                                    } else {
                                      cellClasses += theme === 'dark' ? 'border-r-slate-700/80 border-b-slate-700/80 text-slate-400 hover:bg-slate-700/50' : 'border-r-slate-200 border-b-slate-200 text-slate-600 hover:bg-slate-200/50';
                                    }

                                    const valStr = val === null ? null : String(val);
                                    const displayVal = valStr === null ? null : (valStr.length > 200 ? valStr.substring(0, 200) + '…' : valStr);

                                    return (
                                      <td
                                        key={i}
                                        className={cellClasses}
                                        title={valStr === null ? 'null' : (valStr.length > 200 ? valStr.substring(0, 200) + '...' : valStr)}
                                        onClick={() => {
                                          setSelectedResultCell({ rowIndex: i, colKey });
                                          setDuckDbSelectedCell({ title: 'Значение', content: valStr === null ? 'null' : valStr });
                                        }}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setSelectedResultCell({ rowIndex: i, colKey });
                                          setResultTableContextMenu({ x: e.clientX, y: e.clientY, colKey, cellValue: val, rowIndex: i });
                                        }}
                                      >
                                        {displayVal === null ? <span className="opacity-50 italic">null</span> : displayVal}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-left border-separate border-spacing-0 text-xs">
                          <thead className="sticky top-0 z-20 [transform:translateZ(0)]">
                            <tr>
                              <th className={`sticky top-0 left-0 z-30 px-2 py-2 font-semibold border-b-[1.5px] border-r-[1.5px] text-center w-12 shrink-0 select-none [transform:translateZ(0)] ${
                                theme === 'dark' ? 'border-b-slate-600 border-r-slate-600 text-slate-200 bg-slate-800' : 'border-b-slate-300 border-r-slate-300 text-slate-800 bg-slate-100'
                              }`}>
                                #
                              </th>
                              {Object.keys(duckDbResults[0]).map((col) => {
                                const isColSelected = selectedResultCell?.colKey === col;
                                const sortInfo = activeSqlSorts.find(s => s.colKey === col);
                                const isFiltered = activeSqlFilters.some(f => f.colKey === col);
                                return (
                                  <th 
                                    key={col} 
                                    id={`th-col-${col}`}
                                    className={`sticky top-0 z-20 px-3 py-2 font-semibold border-b-[1.5px] border-r max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer [transform:translateZ(0)] ${
                                      isColSelected
                                        ? theme === 'dark'
                                          ? 'border-b-blue-500 border-r-slate-700/80 text-blue-300 bg-blue-950 font-bold'
                                          : 'border-b-blue-500 border-r-slate-200 text-blue-800 bg-blue-100 font-bold'
                                        : theme === 'dark' 
                                          ? 'border-b-slate-600 border-r-slate-700/80 text-slate-200 bg-slate-800 hover:bg-slate-700' 
                                          : 'border-b-slate-300 border-r-slate-200 text-slate-800 bg-slate-100 hover:bg-slate-200'
                                    }`}
                                    title={col.length > 200 ? col.substring(0, 200) + '...' : col}
                                    onClick={() => {
                                      setSelectedResultCell({ rowIndex: -1, colKey: col });
                                      setDuckDbSelectedCell({ title: `Столбец: ${col}`, content: computeColumnStats(col, displayedResults) });
                                    }}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSelectedResultCell({ rowIndex: -1, colKey: col });
                                      setResultTableContextMenu({ x: e.clientX, y: e.clientY, colKey: col });
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate">{col}</span>
                                      <div className="flex items-center gap-0.5 shrink-0">
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
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {displayedResults.map((row, i) => {
                              const rowNum = (duckDbPage - 1) * (uiVisibility.duckDbMaxRows || 100) + i + 1;
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
                                  {Object.entries(row).map(([colKey, val]: [string, any], j) => {
                                    const isCellSelected = selectedResultCell?.rowIndex === i && selectedResultCell?.colKey === colKey;
                                    const isColSelected = selectedResultCell?.colKey === colKey;

                                    let cellClasses = 'px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[288px] cursor-pointer border-r border-b ';

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

                                    const valStr = val === null ? null : String(val);
                                    const displayVal = valStr === null ? null : (valStr.length > 200 ? valStr.substring(0, 200) + '…' : valStr);

                                    return (
                                      <td 
                                        key={j} 
                                        className={cellClasses}
                                        title={valStr === null ? 'null' : (valStr.length > 200 ? valStr.substring(0, 200) + '...' : valStr)}
                                        onClick={() => {
                                          setSelectedResultCell({ rowIndex: i, colKey });
                                          setDuckDbSelectedCell({ title: 'Значение', content: valStr === null ? 'null' : valStr });
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
                                        {displayVal === null ? <span className="opacity-50 italic">null</span> : displayVal}
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
                        Запрос выполнен успешно. Данные отсутствуют.
                      </div>
                    ) : null}
                  </div>
                  {duckDbSelectedCell && resultsViewMode === 'table' && (
                    <div 
                      className={`${isCellZoomed ? 'w-[50vw]' : 'w-[30vw] min-w-[220px]'} border-l flex flex-col shrink-0 ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-slate-50'}`}
                    >
                      <div className={`flex items-center justify-between px-3 py-1.5 border-b shrink-0 ${theme === 'dark' ? 'border-slate-700' : 'border-slate-200'}`}>
                        <span className={`text-xs font-semibold truncate max-w-[180px] ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                          {duckDbSelectedCell.title}
                        </span>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => {
                              if ((selectedResultCell?.rowIndex === -1 && selectedResultCell?.colKey) || duckDbSelectedCell.title.startsWith('Столбец:')) {
                                const colKey = selectedResultCell?.colKey || duckDbSelectedCell.title.replace(/^Столбец:\s*/, '');
                                const rows = (displayedResults || []).map(r => {
                                  const v = r[colKey];
                                  return v === null || v === undefined ? 'null' : String(v);
                                });
                                navigator.clipboard.writeText([colKey, ...rows].join('\n'));
                              } else {
                                navigator.clipboard.writeText(duckDbSelectedCell.content);
                              }
                              setCopiedCellValue(true);
                              setTimeout(() => setCopiedCellValue(false), 2000);
                            }}
                            className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                            title={copiedCellValue ? "Скопировано!" : "Скопировать значение"}
                          >
                            {copiedCellValue ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            onClick={() => setIsCellZoomed(!isCellZoomed)}
                            className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                            title={isCellZoomed ? "Стандартный размер" : "Увеличить в 2 раза"}
                          >
                            {isCellZoomed ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            onClick={() => {
                              setDuckDbSelectedCell(null);
                              setSelectedResultCell(null);
                            }}
                            className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                            title="Закрыть"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className={`flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap select-text [word-break:break-word] ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                        {duckDbSelectedCell.content}
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
                  <span>Последовательное выполнение</span>
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
                  <span>Параллельное выполнение</span>
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
                    top: Math.max(8, Math.min(resultTableContextMenu.y / scale, (window.innerHeight / scale) - 280)),
                  };
                })()}
                onClick={(e) => e.stopPropagation()}
              >
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

                {/* HEADER-ONLY ACTIONS (GROUP BY & NULL/EMPTY FILTERS) */}
                {resultTableContextMenu.cellValue === undefined && (
                  <>
                    {/* GROUP BY */}
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyTableGroupBy(resultTableContextMenu.colKey);
                        setResultTableContextMenu(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors border-t ${
                        theme === 'dark' ? 'hover:bg-slate-700 border-slate-700/60' : 'hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="truncate">GROUP BY "{resultTableContextMenu.colKey}"</span>
                    </button>

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
            <div className={`px-4 py-2 border-t flex items-center justify-between shrink-0 relative z-40 ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-300/80 border-slate-400/60'
            }`}>
              <div className="flex items-center gap-3">
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
                    title="Готовые шаблоны и примеры SQL"
                  >
                    <span>Пресеты</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>

                  {showPresetsDropdown && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowPresetsDropdown(false)} 
                      />
                      <div className={`absolute bottom-full mb-2 left-0 z-50 rounded-lg border shadow-2xl p-2 w-80 animate-in fade-in duration-150 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                      }`}>
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-600/40 mb-1.5">
                          <span className="text-xs uppercase font-bold text-slate-400">Готовые SQL пресеты</span>
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
                    const modal = e.currentTarget.closest('.fixed');
                    const textarea = modal?.querySelector('textarea') || document.querySelector('textarea');
                    if (textarea) {
                      textarea.focus();
                      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', ctrlKey: true, metaKey: true, bubbles: true }));
                    }
                  }}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
                    theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title="Поиск и замена текста (Ctrl+F / Ctrl+H / Ctrl+R)"
                >
                  <Search className="w-3.5 h-3.5 text-blue-500" />
                  <span>Поиск</span>
                </button>
                )}

                <button
                  onClick={() => setIsWrapSql(!isWrapSql)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
                    isWrapSql
                      ? 'bg-blue-600 text-white font-bold'
                      : theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title="Перенос строки"
                >
                  <WrapText className="w-3.5 h-3.5" />
                  <span>Перенос</span>
                </button>

                {uiVisibility.showFormatSql && (
                <button
                  onClick={handleFormatSql}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
                    theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title="Форматировать SQL (Ctrl+Shift+F)"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span>Форматировать</span>
                </button>
                )}

                {uiVisibility.showCompactSql !== false && (
                <button
                  onClick={handleCompactSql}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
                    theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900'
                  }`}
                  title="Формат в одну строку (Ctrl+Shift+U)"
                >
                  <Shrink className="w-3.5 h-3.5" />
                </button>
                )}

                {uiVisibility.showCopySql && (
                <button
                  onClick={handleCopySql}
                  className={`flex items-center gap-1 text-xs px-2 py-1 transition-colors ${
                    theme === 'dark' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-800 hover:text-slate-950'
                  }`}
                  title="Скопировать SQL"
                >
                  {copied === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'sql' ? 'Copied!' : 'Copy SQL'}</span>
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
                  title="Открыть файл в кодировке Windows-1251"
                >
                  <span>Win-1251</span>
                </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {(uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && (duckDbResults !== null || duckDbError !== null) && !isDuckDbResultVisible && (
                  <button
                    onClick={() => setIsDuckDbResultVisible(true)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold text-xs shadow-sm transition-all ${
                      theme === 'dark'
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    }`}
                    title="Развернуть результат запроса"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Результат</span>
                  </button>
                )}
                {(uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && (
                <button
                  onClick={handleExecuteDuckDb}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isDuckDbRunning) return;
                    
                    let queryToExecute = sqlRef.current;
                    const textareas = document.querySelectorAll('textarea');
                    for (const textarea of Array.from(textareas)) {
                      if (textarea.offsetWidth > 0 && textarea.offsetHeight > 0 && textarea.selectionStart !== textarea.selectionEnd) {
                        queryToExecute = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
                        break;
                      }
                    }

                    setExecuteContextMenu({ x: e.clientX, y: e.clientY, text: queryToExecute });
                  }}
                  disabled={isDuckDbRunning}
                  className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg font-bold text-xs shadow-md transition-all ${
                    isDuckDbRunning
                      ? 'bg-slate-500 cursor-not-allowed text-white'
                      : theme === 'dark'
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-teal-500 hover:bg-teal-600 text-white'
                  }`}
                  title="Выполнить запрос в DB"
                >
                  {isDuckDbRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                  <span>Execute</span>
                </button>
                )}
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SQL SNIPPETS & BUILDER MODAL */}
      <SqlSnippetsManager
        isOpen={showSnippetsModal}
        onClose={() => setShowSnippetsModal(false)}
        onInsertSnippet={handleInsertSnippet}
        theme={theme}
        uiVisibility={uiVisibility}
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
      />

      {/* VERSION HISTORY MODAL */}
      <VersionHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        currentSql={getActiveTabSql()}
        currentDialect={dialect}
        onRestoreVersion={(restoredSql, restoredDialect) => {
          sqlRef.current = restoredSql; setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: restoredSql } : t));
          if (restoredDialect) {
            setDialect(restoredDialect as 'PostgreSQL' | 'Oracle' | 'Clickhouse');
          }
        }}
        theme={theme}
        uiVisibility={uiVisibility}
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
