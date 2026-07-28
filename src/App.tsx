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
import { toPng, toSvg, toJpeg } from 'html-to-image';
import { 
  Play, 
  Code, 
  Database, 
  FileText, 
  Terminal, 
  Copy, 
  Check, 
  X, 
  Plus,
  HelpCircle, 
  Layout, 
  Layers, 
  Settings, 
  ChevronRight, 
  Activity,
  Maximize2,
  Minimize2,
  RefreshCw,
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
  ArrowLeftRight
} from 'lucide-react';

import { parseSqlToAst, astToGraph, getLayoutedElements } from './utils/astToGraph';
import { nodeTypes } from './components/CustomNodes';
import { sqlPresets, SQLPreset } from './components/SQLPresets';
import { SqlSnippetsManager } from './components/SqlSnippetsManager';
import { SqlEditor, SqlEditorRef, highlightSqlHtml } from './components/SqlEditor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsModal, getSavedHotkeys, getSavedFormatterSettings, FormatterSettings, getSavedUiVisibilitySettings, UiVisibilitySettings, QuickActionTemplate, getQuickActionTemplates } from './components/SettingsModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { saveVersion, getVersions } from './utils/versionHistory';
import { format as formatSql } from 'sql-formatter';
import { connectDuckDbWasmFile, queryDuckDbWasm, disconnectDuckDbWasm, exportDuckDbFile } from './lib/duckdbWasm';
import { ClickhouseModal } from './components/ClickhouseModal';
import { ClickhouseConfig, parseClickhouseCopy, getClickhouseUrl, getClickhouseHeaders, isTauriEnvironment, executeClickhouseQueryTauri, executeClickhouseCopyToTauri, executeClickhouseCopyFromTauri } from './lib/clickhouse';

export interface EditorTab {
  id: string;
  title: string;
  sql: string;
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
  const [isWasmMode, setIsWasmMode] = useState<boolean>(false);
  const [showDuckDbConnMenu, setShowDuckDbConnMenu] = useState<boolean>(false);
  const [duckDbResults, setDuckDbResults] = useState<any[] | null>(null);
  const [duckDbError, setDuckDbError] = useState<string | null>(null);
  const [isDuckDbRunning, setIsDuckDbRunning] = useState<boolean>(false);
  const [isDuckDbResultVisible, setIsDuckDbResultVisible] = useState<boolean>(false);
  const [isDuckDbResultExpanded, setIsDuckDbResultExpanded] = useState<boolean>(false);
  const [duckDbSelectedCell, setDuckDbSelectedCell] = useState<{ title: string; content: string } | null>(null);
  const [isTransposed, setIsTransposed] = useState<boolean>(false);
  const [duckDbSchema, setDuckDbSchema] = useState<any[] | null>(null);
  const [schemaSearchTerm, setSchemaSearchTerm] = useState<string>(() => savedSession?.schemaSearchTerm || '');
  const [showDuckDbSchemaPanel, setShowDuckDbSchemaPanel] = useState<boolean>(() => savedSession?.showDuckDbSchemaPanel ?? true);
  const [expandedSchemaNodes, setExpandedSchemaNodes] = useState<Record<string, boolean>>(() => savedSession?.expandedSchemaNodes || {});

  // Clickhouse Integration State
  const [clickhouseConfig, setClickhouseConfig] = useState<ClickhouseConfig | null>(() => savedSession?.clickhouseConfig || null);
  const [showClickhouseModal, setShowClickhouseModal] = useState<boolean>(false);
  const [activeEngine, setActiveEngine] = useState<'duckdb' | 'clickhouse'>(() => savedSession?.activeEngine || 'duckdb');

  // Quick Actions & Pagination State
  const [lastExecutedSql, setLastExecutedSql] = useState<string>('');
  const [duckDbPage, setDuckDbPage] = useState<number>(1);
  const [duckDbPageSize, setDuckDbPageSize] = useState<number>(50);
  const [showQuickActionsMenu, setShowQuickActionsMenu] = useState<boolean>(false);
  const [quickActions, setQuickActions] = useState<QuickActionTemplate[]>(getQuickActionTemplates);

  useEffect(() => {
    const updateQuickActions = () => {
      setQuickActions(getQuickActionTemplates());
    };
    window.addEventListener('sql_quick_actions_updated', updateQuickActions);
    return () => {
      window.removeEventListener('sql_quick_actions_updated', updateQuickActions);
    };
  }, []);

  const extractedTableName = useMemo(() => {
    if (!lastExecutedSql.trim()) return 'table';
    const cleanSql = lastExecutedSql.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/g, '').trim();
    const match = cleanSql.match(/\bFROM\s+([^\s;(),]+)/i);
    if (match && match[1]) {
      const rawTable = match[1].trim();
      if (rawTable.startsWith('(')) {
        return `(${cleanSql.replace(/;+$/, '')}) AS _sub`;
      }
      return rawTable;
    }
    return `(${cleanSql.replace(/;+$/, '')}) AS _sub`;
  }, [lastExecutedSql]);

  const pagedResults = useMemo(() => {
    return duckDbResults || [];
  }, [duckDbResults]);

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

  const handleExpandAllSchemaNodes = () => {
    if (!groupedDuckDbSchema) return;
    const nextState: Record<string, boolean> = {};
    Object.entries(groupedDuckDbSchema).forEach(([dbName, schemas]: any) => {
      nextState[`db-${dbName}`] = true;
      Object.entries(schemas).forEach(([schemaName, types]: any) => {
        nextState[`sch-${dbName}-${schemaName}`] = true;
        Object.entries(types).forEach(([typeName, tables]: any) => {
          nextState[`type-${dbName}-${schemaName}-${typeName}`] = true;
          Object.entries(tables).forEach(([tableName, cols]: any) => {
            nextState[`tbl-${dbName}-${schemaName}-${tableName}`] = true;
          });
        });
      });
    });
    setExpandedSchemaNodes(nextState);
  };

  const groupedDuckDbSchema = useMemo(() => {
    if (!duckDbSchema) return null;
    const tree: Record<string, Record<string, Record<string, Record<string, any[]>>>> = {};
    const term = schemaSearchTerm.toLowerCase();
    
    duckDbSchema.forEach(col => {
      const tblMatch = col.table_name.toLowerCase().includes(term);
      const colMatch = col.column_name.toLowerCase().includes(term);
      if (term && !tblMatch && !colMatch) return;
      
      const db = col.database_name;
      const sch = col.schema_name;
      const type = col.table_type === 'Views' ? 'Views' : 'Tables';
      const tbl = col.table_name;
      
      if (!tree[db]) tree[db] = {};
      if (!tree[db][sch]) tree[db][sch] = {};
      if (!tree[db][sch][type]) tree[db][sch][type] = {};
      if (!tree[db][sch][type][tbl]) tree[db][sch][type][tbl] = [];
      
      tree[db][sch][type][tbl].push(col);
    });
    return tree;
  }, [duckDbSchema, schemaSearchTerm]);

  const [showSnippetsModal, setShowSnippetsModal] = useState<boolean>(false);
  const [showPresetsDropdown, setShowPresetsDropdown] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [lineageHighlightMode, setLineageHighlightMode] = useState<boolean>(false);
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(() => getSavedHotkeys());
  const [formatterSettings, setFormatterSettings] = useState<FormatterSettings>(() => getSavedFormatterSettings());
  const [uiVisibility, setUiVisibility] = useState<UiVisibilitySettings>(() => getSavedUiVisibilitySettings());
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



  const sqlRef = useRef<string>('');
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
            const path = await tauriInvoke<string>('connect_db', { path: dbPath });
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

  const saveSessionToStorage = useCallback(() => {
    // If we just imported local storage, do not overwrite the imported session on page reload/unload
    if (sessionStorage.getItem('sql_is_importing_session') === 'true') {
      return;
    }
    try {
      const sessionData = { 
        ...latestSessionRef.current,
        sql: sqlRef.current,
        tabs: latestSessionRef.current.tabs.map(t => t.id === latestSessionRef.current.activeTabId ? { ...t, sql: sqlRef.current } : t)
      };
      
      // Не сохранять пароль Clickhouse в локальное хранилище в целях безопасности
      if (sessionData.clickhouseConfig) {
        sessionData.clickhouseConfig = { ...sessionData.clickhouseConfig, key: '' };
      }
      
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.error('Failed to save session to localStorage', e);
    }
  }, []);

  // Listen for explicit session save requests (e.g. before exporting workspace)
  useEffect(() => {
    const handleSaveNow = () => {
      saveSessionToStorage();
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
          const dbPath = selected;
          setIsDuckDbRunning(true);
          try {
            const path = await tauriInvoke<string>('connect_db', { path: dbPath });
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
          const dbPath = selected;
          setIsDuckDbRunning(true);
          try {
            const path = await tauriInvoke<string>('connect_db', { path: dbPath });
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

  const handleDuckDbFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // @ts-ignore - access non-standard path property for desktop environments
      const dbPath = file.path || file.name;
      
      try {
        setIsDuckDbRunning(true);
        let connectedSuccessfully = false;

        // 1. Try Tauri native Rust command first if in Tauri environment
        if (isTauriEnv) {
          try {
            const path = await tauriInvoke<string>('connect_db', { path: dbPath });
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
              body: JSON.stringify({ dbPath })
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
        if (!connectedSuccessfully) {
          const fileName = await connectDuckDbWasmFile(file);
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

  const fetchDuckDbSchema = async () => {
    if (activeEngine === 'clickhouse' || (!duckDbConnectedPath && clickhouseConfig)) {
      if (!clickhouseConfig) return;
      const schemaQuery = "SELECT c.database AS database_name, c.database AS schema_name, c.table AS table_name, c.name AS column_name, c.type AS data_type, CASE WHEN t.engine LIKE '%View%' THEN 'Views' ELSE 'Tables' END AS table_type, t.total_bytes AS table_bytes FROM system.columns AS c LEFT JOIN system.tables AS t ON c.database = t.database AND c.table = t.name WHERE c.database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA') ORDER BY c.database, table_type, c.table, c.position FORMAT JSON";
      try {
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
        }
      } catch (e: any) {
        console.warn("Failed to fetch ClickHouse schema:", e?.message || e);
      }
      return;
    }

    const schemaQuery = "SELECT c.database_name, c.schema_name, c.table_name, c.column_name, c.data_type, CASE WHEN v.view_name IS NOT NULL THEN 'Views' ELSE 'Tables' END as table_type, t.estimated_size as estimated_rows FROM duckdb_columns() c LEFT JOIN duckdb_views() v ON c.table_name = v.view_name AND c.schema_name = v.schema_name AND c.database_name = v.database_name LEFT JOIN duckdb_tables() t ON c.table_name = t.table_name AND c.schema_name = t.schema_name AND c.database_name = t.database_name ORDER BY c.database_name, c.schema_name, table_type, c.table_name, c.column_index";
    try {
      if (isTauriEnv && !isWasmMode) {
        try {
          const res = await tauriInvoke<{ columns: string[]; rows: any[][] }>('execute_query', {
            sql: schemaQuery
          });
          const parsed = (res?.rows || []).map(row => {
            const obj: Record<string, any> = {};
            (res.columns || []).forEach((col, idx) => {
              obj[col] = row[idx];
            });
            return obj;
          });
          setDuckDbSchema(parsed);
          return;
        } catch (tauriErr) {
          console.warn("Tauri schema query failed, trying backend/wasm:", tauriErr);
        }
      }

      if (isWasmMode) {
        const rows = await queryDuckDbWasm(schemaQuery);
        setDuckDbSchema(rows);
      } else {
        const data = await fetchApiJson("/api/duckdb/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: schemaQuery })
        });
        if (data.data) {
          setDuckDbSchema(data.data);
        }
      }
    } catch (e: any) {
      console.warn("Failed to fetch schema:", e?.message || e);
    }
  };

  useEffect(() => {
    if ((duckDbConnectedPath || clickhouseConfig) && showDuckDbSchemaPanel) {
      fetchDuckDbSchema();
    } else if (!duckDbConnectedPath && !clickhouseConfig) {
      setDuckDbSchema(null);
    }
  }, [duckDbConnectedPath, clickhouseConfig, activeEngine, showDuckDbSchemaPanel, isWasmMode]);

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

  const executeDuckDbQueryWithPagination = async (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean) => {
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
      setDuckDbSelectedCell(null);

      const maxRows = pageSizeToUse ?? uiVisibility.duckDbMaxRows ?? 100;
      let finalQuery = queryToExec.trim();
      let queryWithLimit = finalQuery;
      const cleanSqlHead = finalQuery
        .replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/g, '')
        .trim();

      if (maxRows > 0 && /^(SELECT|WITH)\b/i.test(cleanSqlHead)) {
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
          setDuckDbResults(parsed.slice(0, maxRows));
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
        setDuckDbResults(rows.slice(0, maxRows));
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
          setDuckDbResults((data.data || []).slice(0, maxRows));
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

  const executeClickhouseQueryWithPagination = async (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean) => {
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

      const cleanSqlHead = queryToExec
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
      const maxRows = pageSizeToUse ?? uiVisibility.clickhouseMaxRows ?? uiVisibility.duckDbMaxRows ?? 100;
      let queryWithLimit = queryToExec.trim();

      if (maxRows > 0 && /^(SELECT|WITH)\b/i.test(cleanSqlHead)) {
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

      if (!/\bFORMAT\b/i.test(queryWithLimit)) {
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
        if (Array.isArray(data.data)) {
          setDuckDbResults(data.data.slice(0, maxRows));
        } else if (typeof data.text === 'string') {
          setDuckDbResults([{ Response: data.text || 'OK' }]);
        } else {
          setDuckDbResults([data.data || { Status: 'OK' }]);
        }
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

  const handleExecuteCurrentEngineQuery = (queryToExec: string, page: number = 1, pageSizeToUse?: number, isQuickAction?: boolean) => {
    let finalQuery = queryToExec;
    if (formatterSettings.autoEscapeWindowsPaths ?? true) {
      finalQuery = finalQuery.replace(/\b(FROM|TO)\s+(['"])(.*?)(['"])/gi, (match, keyword, quote1, innerPath, quote2) => {
        if (innerPath.includes('\\')) {
          const escapedPath = innerPath.replace(/\\/g, '/');
          return `${keyword} ${quote1}${escapedPath}${quote2}`;
        }
        return match;
      });
    }

    if (activeEngine === 'clickhouse' || (!duckDbConnectedPath && clickhouseConfig)) {
      executeClickhouseQueryWithPagination(finalQuery, page, pageSizeToUse, isQuickAction);
    } else {
      executeDuckDbQueryWithPagination(finalQuery, page, pageSizeToUse, isQuickAction);
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
    handleExecuteCurrentEngineQuery(queryToExecute, 1);
  };

  const executeSpecificDuckDbQuery = async (queryToExec: string, isQuickAction?: boolean) => {
    if (!queryToExec.trim()) return;
    handleExecuteCurrentEngineQuery(queryToExec, 1, undefined, isQuickAction);
  };

  const handleExecuteQuickAction = (qa: QuickActionTemplate) => {
    setShowQuickActionsMenu(false);
    const targetQuery = qa.template.replace(/\{table\}/g, extractedTableName);
    executeSpecificDuckDbQuery(targetQuery, true);
  };

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

  const handleCloseTab = (e: React.MouseEvent, idToClose: string) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;

    const nextTabs = tabs.filter(t => t.id !== idToClose);
    if (activeTabId === idToClose) {
      const closedIndex = tabs.findIndex(t => t.id === idToClose);
      const nextActive = nextTabs[Math.max(0, closedIndex - 1)];
      setActiveTabId(nextActive.id);
      sqlRef.current = nextActive.sql;
    }
    setTabs(nextTabs);
  };

  const handleRenameTab = (id: string, newTitle: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title: newTitle } : t));
  };
  const sqlEditorRef = useRef<SqlEditorRef>(null);
  
  const handleSqlChange = useCallback((newSql: string) => {
    sqlRef.current = newSql;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: newSql } : t));
  }, [activeTabId]);

  // Auto-save version into IndexedDB every 5 minutes if current tab SQL differs from the existing latest snapshot
  useEffect(() => {
    const INTERVAL_5_MIN = 5 * 60 * 1000;
    const intervalId = setInterval(async () => {
      const currentSql = sqlRef.current;
      if (!currentSql.trim()) return;

      try {
        const existingVersions = await getVersions();
        const latestSql = existingVersions.length > 0 ? existingVersions[0].sql : null;

        if (latestSql !== currentSql) {
          await saveVersion(currentSql, 'Автосохранение', true);
        }
      } catch (err) {
        console.warn('Auto-save interval error:', err);
      }
    }, INTERVAL_5_MIN);

    return () => clearInterval(intervalId);
  }, []);

  const handleOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (tabs.length >= 9) {
        alert('Достигнуто максимальное количество вкладок (9). Закройте одну из вкладок, чтобы открыть новый файл.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (typeof content === 'string') {
          const newId = Date.now().toString();
          const newTab: EditorTab = {
            id: newId,
            title: file.name,
            sql: content
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
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (typeof content === 'string') {
          const newId = Date.now().toString();
          const newTab: EditorTab = {
            id: newId,
            title: file.name,
            sql: content
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
    if (!sqlRef.current.trim()) return;

    const activeTab = tabs.find(t => t.id === activeTabId);
    let suggestedName = activeTab ? activeTab.title : 'query.sql';
    if (suggestedName && !suggestedName.toLowerCase().endsWith('.sql')) {
      suggestedName += '.sql';
    }

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
        await writable.write(sqlRef.current);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        console.warn('File System Access API failed, falling back to anchor download:', err);
      }
    }

    const blob = new Blob([sqlRef.current], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleInsertSnippet = (snippetSql: string, replaceMode?: boolean) => {
    const currentSql = sqlRef.current || '';
    if (replaceMode || !currentSql.trim()) {
      sqlRef.current = snippetSql;
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: snippetSql } : t));
    } else {
      const newSql = currentSql + '\n\n' + snippetSql;
      sqlRef.current = newSql;
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: newSql } : t));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteDuckDb();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duckDbConnectedPath, clickhouseConfig, isDuckDbRunning, activeEngine]);

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
  }, []);

  
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
  }, []);

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
      handleCopySql,
      handleFormatSql,
      handleSelectTab,
      isDuckDbRunning,
      showSettingsModal,
      showSnippetsModal,
      setShowSettingsModal,
      setShowSnippetsModal,
      handleCancelDuckDbQuery,
      handleCopyResultsToClipboard,
      fetchDuckDbSchema,
      setShowDuckDbSchemaPanel,
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
        handleCopySql: currentHandleCopySql,
        handleFormatSql: currentHandleFormatSql,
        handleSelectTab: currentHandleSelectTab,
        isDuckDbRunning: currentIsDuckDbRunning,
        showSettingsModal: currentShowSettingsModal,
        showSnippetsModal: currentShowSnippetsModal,
        setShowSettingsModal: currentSetShowSettingsModal,
        setShowSnippetsModal: currentSetShowSnippetsModal,
        handleCancelDuckDbQuery: currentHandleCancelDuckDbQuery,
        handleCopyResultsToClipboard: currentHandleCopyResultsToClipboard,
        fetchDuckDbSchema: currentFetchDuckDbSchema,
        setShowDuckDbSchemaPanel: currentSetShowDuckDbSchemaPanel,
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
        currentHandleVisualize();
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
        fileInputRef.current?.click();
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
        if (currentIsMaximizedSql && currentIsDuckDbRunning) {
          currentHandleCancelDuckDbQuery();
          acted = true;
        }
        if (currentShowSettingsModal) {
          currentSetShowSettingsModal(false);
          acted = true;
        }
        if (currentShowSnippetsModal) {
          currentSetShowSnippetsModal(false);
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
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);

  const debounceTimerRef = useRef<any>(null);

  // Initial load
  useEffect(() => {
    handleVisualize(sqlPresets[0].sql, 'PostgreSQL', 'LR');
  }, []);

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

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
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
      handleVisualize(preset.sql, preset.dialect, direction);
    }
  };

  const handleDialectChange = (newDialect: 'PostgreSQL' | 'Oracle' | 'Clickhouse') => {
    setDialect(newDialect);
    handleVisualize(sqlRef.current, newDialect, direction);
  };

  const handleSortToggle = () => {
    const newVal = !showSortNodes;
    setShowSortNodes(newVal);
    handleVisualize(sqlRef.current, dialect, direction, newVal, showLimitNodes);
  };

  const handleLimitToggle = () => {
    const newVal = !showLimitNodes;
    setShowLimitNodes(newVal);
    handleVisualize(sqlRef.current, dialect, direction, showSortNodes, newVal);
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
    } else if (duckDbResults && duckDbResults.length > 0) {
      if (isTransposed) {
        const headers = ['Поле \\ №', ...pagedResults.map((_, i) => `#${(duckDbPage - 1) * (uiVisibility.duckDbMaxRows || 100) + i + 1}`)];
        const rows = Object.keys(duckDbResults[0]).map(colKey => [
          colKey,
          ...pagedResults.map(r => r[colKey] === null ? 'null' : String(r[colKey]))
        ]);
        const csv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(csv);
      } else {
        const headers = ['#', ...Object.keys(duckDbResults[0])];
        const rows = pagedResults.map((r, i) => [
          (duckDbPage - 1) * (uiVisibility.duckDbMaxRows || 100) + i + 1,
          ...Object.values(r).map(v => v === null ? 'null' : String(v))
        ]);
        const csv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(csv);
      }
    }
  };

  const handleFormatSql = () => {
    const cfg = formatterSettingsRef.current || formatterSettings;
    const sel = sqlEditorRef.current?.getSelection();

    const doFormat = (text: string) => {
      const primaryLang =
        dialect === 'PostgreSQL' ? 'postgresql' :
        dialect === 'MySQL' ? 'mysql' :
        dialect === 'SQLite' ? 'sqlite' : 'sql';

      const fallbackLangs = [primaryLang, 'mysql', 'sqlite', 'sql'].filter(
        (lang, index, self) => self.indexOf(lang) === index
      );

      for (const lang of fallbackLangs) {
        try {
          let formatted = formatSql(text, {
            language: lang as any,
            keywordCase: cfg.keywordCase,
            tabWidth: cfg.tabWidth,
            useTabs: cfg.useTabs,
            expressionWidth: cfg.expressionWidth,
            denseOperators: cfg.denseOperators,
          });

          // Apply custom column line wrapping if expressionWidth >= 0
          if (cfg.expressionWidth >= 0) {
            const maxWidth = cfg.expressionWidth;
            const indent = cfg.useTabs ? '\t' : ' '.repeat(cfg.tabWidth || 2);

            formatted = formatted.replace(
              /(SELECT|GROUP BY|ORDER BY|INSERT INTO|VALUES)\s+([\s\S]+?)(?=\n\s*(?:FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|UNION|RETURNING|WINDOW|SET|VALUES|;|$))/gi,
              (match, keyword, items) => {
                if (items.includes('--') || items.includes('/*') || /\bSELECT\b/i.test(items)) {
                  return match;
                }
                const rawLines = items
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (rawLines.length === 0) return match;

                const lines: string[] = [];
                let currentLine = keyword;
                for (let i = 0; i < rawLines.length; i++) {
                  const item = rawLines[i];
                  if (currentLine === keyword) {
                    if ((currentLine + ' ' + item).length <= maxWidth || rawLines.length === 1) {
                      currentLine += ' ' + item;
                    } else {
                      lines.push(currentLine);
                      currentLine = indent + item;
                    }
                  } else {
                    if ((currentLine + ' ' + item).length <= maxWidth) {
                      currentLine += ' ' + item;
                    } else {
                      lines.push(currentLine);
                      currentLine = indent + item;
                    }
                  }
                }
                lines.push(currentLine);
                return lines.join('\n');
              }
            );
          }
          return formatted;
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
      const compacted = sel.text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
      sqlEditorRef.current?.replaceSelection(compacted);
      return;
    }

    const currentSqlText = sqlRef.current;
    if (!currentSqlText) return;
    const compacted = currentSqlText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    sqlRef.current = compacted; setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: compacted } : t));
  };

  const handleNodeClick = (_event: any, node: any) => {
    setSelectedNode(node);
  };

  return (
    <div className={`flex flex-col h-screen ${theme === 'dark' ? 'dark bg-slate-850 text-slate-200' : 'bg-slate-200 text-slate-800'} font-sans select-none overflow-hidden`}>
      
      {/* CORE WORKSPACE */}
      <main className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT PANEL: INPUT & CONFIG (40% WIDTH) */}
        {showLeftPanel && (
        <aside id="control-panel" className={`w-[40%] min-w-[380px] max-w-[580px] border-r flex flex-col shrink-0 transition-colors ${
          theme === 'dark' ? 'bg-slate-750/50 border-slate-600' : 'bg-slate-300/80 border-slate-400/60'
        }`}>
          
          {/* LEFT PANEL TOP BAR */}
          <div className={`flex items-center justify-between px-4 h-11 border-b shrink-0 select-none transition-colors ${
            theme === 'dark' ? 'bg-slate-750 border-slate-600' : 'bg-slate-300/80 border-slate-400/60'
          }`}>
            <div className="flex items-center gap-2.5">
              <h3 className={`font-bold text-sm ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                SQL Query
              </h3>
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
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center justify-center gap-1 text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'text-amber-300 hover:text-amber-100 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30' 
                      : 'text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 shadow-2xs'
                  }`}
                  title="Открыть SQL файл с диска (UTF-8)"
                >
                  <FolderOpen className="w-3 h-3 text-amber-500" />
                  <span>Открыть</span>
                </button>
                )}

                {/* SAVE FILE BUTTON */}
                {uiVisibility.showSaveFile && (
                <button
                  onClick={handleSaveSqlFile}
                  className={`flex items-center justify-center gap-1 text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'text-emerald-300 hover:text-emerald-100 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30' 
                      : 'text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-2xs'
                  }`}
                  title="Сохранить SQL в .sql файл"
                >
                  <FileDown className="w-3 h-3 text-emerald-500" />
                  <span>Сохранить</span>
                </button>
                )}

                {uiVisibility.showSnippets && (
                <button
                  onClick={() => setShowSnippetsModal(true)}
                  className={`flex items-center justify-center gap-1 text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'text-blue-300 hover:text-blue-100 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-500/40' 
                      : 'text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-2xs'
                  }`}
                  title="Библиотека шаблонов SQL"
                >
                  <Layers className="w-3 h-3 text-blue-500" />
                </button>
                )}

                {uiVisibility.showMaximizeButton && (
                <button
                  onClick={() => setIsMaximizedSql(true)}
                  className={`flex items-center justify-center gap-1 text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'text-slate-300 hover:text-slate-100 bg-slate-700/60 hover:bg-slate-700 border border-slate-600' 
                      : 'text-slate-700 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-300 border border-slate-300'
                  }`}
                  title="Открыть SQL Query редактор"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Editor</span>
                </button>
                )}
              </div>
            </div>

          {/* LEFT PANEL CONTENT */}
          <div className="flex-1 flex flex-col p-4 space-y-4 min-h-0 overflow-y-auto">
            {/* CODE EDITOR WORKSPACE */}
            <div className="flex-1 flex flex-col min-h-0 relative">
              {/* SYNTAX HIGHLIGHTED SQL EDITOR */}
              <ErrorBoundary title="Ошибка редактора SQL" theme={theme}>
                {!isMaximizedSql ? (
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
          <div className={`flex items-center justify-between px-4 h-11 border-b z-10 select-none transition-colors ${
            theme === 'dark' ? 'bg-slate-750 border-slate-600 text-slate-200' : 'bg-slate-300/80 border-slate-400/60 text-slate-800'
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
                  <span>Export</span>
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
          <div className={`flex-1 w-full relative min-h-0 ${theme === 'dark' ? 'bg-slate-850' : 'bg-slate-200'}`} style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
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
          <div className={`w-full h-full flex flex-col overflow-hidden transition-colors ${
            theme === 'dark' ? 'bg-slate-850 text-slate-200' : 'bg-slate-100 text-slate-900'
          }`}>
            {/* HEADER */}
            <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b shrink-0 ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-200/90 border-slate-300'
            }`}>
              <div className="flex items-center gap-2.5">
                <Code className="w-4 h-4 text-blue-500" />
                <h3 className={`font-bold text-sm ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  SQL Query Editor
                </h3>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                {uiVisibility.showOpenFile && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'text-amber-300 hover:text-amber-100 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30' 
                      : 'text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 shadow-2xs'
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
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'text-emerald-300 hover:text-emerald-100 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30' 
                      : 'text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 shadow-2xs'
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
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'text-blue-300 hover:text-blue-100 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-500/40' 
                      : 'text-blue-800 hover:text-blue-950 bg-blue-50 hover:bg-blue-100 border border-blue-300 shadow-2xs'
                  }`}
                  title="Библиотека шаблонов SQL"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                </button>
                )}

                {uiVisibility.showHistory && (
                <button
                  onClick={() => setShowHistoryModal(true)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                    theme === 'dark' 
                      ? 'text-purple-300 hover:text-purple-100 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30' 
                      : 'text-purple-800 hover:text-purple-950 bg-purple-100 hover:bg-purple-200 border border-purple-300 shadow-2xs'
                  }`}
                  title="История версий SQL"
                >
                  <History className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
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
                    <Database className={`w-3.5 h-3.5 ${clickhouseConfig ? 'text-amber-500' : duckDbConnectedPath ? 'text-teal-500' : 'text-slate-400'}`} />
                    <span>{duckDbConnectedPath ? 'DuckDB (Connected)' : clickhouseConfig ? 'Clickhouse (Connected)' : 'Connect DB'}</span>
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
                                theme === 'dark' ? 'hover:bg-slate-700 text-emerald-300' : 'hover:bg-slate-100 text-emerald-700'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span>Создать новую БД (.duckdb)</span>
                            </button>
                          </>
                        )}

                        {uiVisibility.showDuckDbConfig && uiVisibility.showClickhouseConfig && (
                          <div className={`my-1 border-t ${theme === 'dark' ? 'border-slate-700/60' : 'border-slate-200'}`} />
                        )}

                        {uiVisibility.showClickhouseConfig && (
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
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border transition-all ${
                      theme === 'dark' 
                        ? 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600' 
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 shadow-2xs'
                    }`}
                    title="Вернуться к графу"
                  >
                    <Workflow className="w-3 h-3" />
                    <span>Graph</span>
                  </button>
                </>
                )}
              </div>
            </div>

            {/* CONTENT AREA WITH TAB BAR, BODY & SCHEMA BROWSER */}
            <div className="flex-1 flex flex-row min-h-0 min-w-0">
              {/* LEFT COLUMN: TAB BAR & EDITOR */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {/* TAB BAR (Fullscreen Only) */}
                <div className={`flex items-end gap-1.5 px-3 h-[37px] border-b overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0 select-none ${
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
                        <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
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
                      className={`p-1.5 rounded-md mb-1 text-xs transition-colors shrink-0 ${
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
                <div className="flex-1 p-3.5 flex flex-col min-h-0 relative">
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
                    />
                  </ErrorBoundary>
                </div>
              </div>

              {/* SCHEMA BROWSER */}
              {showDuckDbSchemaPanel && duckDbSchema && groupedDuckDbSchema && (
                <div className={`w-72 flex flex-col shrink-0 border-l transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-300'}`}>
                  <div className={`px-3 h-[37px] border-b flex items-center justify-between shrink-0 transition-colors ${theme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
                    <span className={`text-xs font-semibold flex items-center gap-2 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      <Database className="w-3.5 h-3.5 text-teal-500" />
                      Schema Browser
                    </span>
                    <button 
                      onClick={() => setShowDuckDbSchemaPanel(false)}
                      className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                      title="Закрыть"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className={`p-2 border-b flex items-center gap-1 shrink-0 transition-colors ${theme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-300 bg-slate-100/50'}`}>
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 opacity-50" />
                      <input 
                        type="text" 
                        placeholder="Поиск..." 
                        value={schemaSearchTerm}
                        onChange={(e) => setSchemaSearchTerm(e.target.value)}
                        className={`w-full pl-7 pr-2 py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-300 placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-700 placeholder-slate-400'}`}
                      />
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
                  <div className="flex-1 overflow-y-auto p-2">
                    {Object.entries(groupedDuckDbSchema).map(([dbName, schemas]) => (
                      <div key={dbName} className="mb-1">
                        <div 
                          className={`text-xs font-bold px-2 py-1 flex items-center gap-1.5 rounded cursor-pointer select-none transition-colors ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-800'}`}
                          onClick={() => toggleSchemaNode(`db-${dbName}`)}
                        >
                          <Database className="w-3.5 h-3.5 opacity-70" />
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
                                    {Object.entries(types).map(([typeName, tables]) => (
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
                                            {Object.entries(tables).map(([tableName, columns]) => {
                                              const sizeBadge = getTableSizeBadge(columns as any[]);
                                              return (
                                                <div key={tableName} className="mb-1">
                                                  <div 
                                                    className={`group text-[11px] font-medium px-2 py-1 flex items-center justify-between gap-1 rounded cursor-pointer select-none transition-colors ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                                                    onClick={() => {
                                                      toggleSchemaNode(`tbl-${dbName}-${schemaName}-${tableName}`);
                                                      const tablePath = dbName === schemaName ? `${dbName}.${tableName}` : `${dbName}.${schemaName}.${tableName}`;
                                                      navigator.clipboard.writeText(tablePath);
                                                    }}
                                                    title="Нажмите, чтобы развернуть и скопировать название таблицы"
                                                  >
                                                    <div className={`flex items-center gap-1.5 truncate ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>
                                                      <Layout className="w-3 h-3 opacity-70 shrink-0" />
                                                      <span className="truncate" title={tableName}>{tableName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                      {sizeBadge && (
                                                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-500/15 text-slate-400 font-mono">
                                                          {sizeBadge}
                                                        </span>
                                                      )}
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          const cols = (columns as any[]).map(c => `"${c.column_name}"`).join(', ');
                                                          const sel = dbName === schemaName
                                                            ? `SELECT ${cols} FROM "${dbName}"."${tableName}"`
                                                            : `SELECT ${cols} FROM "${dbName}"."${schemaName}"."${tableName}"`;
                                                          navigator.clipboard.writeText(sel);
                                                        }}
                                                        className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-500 hover:text-slate-800'}`}
                                                        title="Копировать SELECT"
                                                      >
                                                        <Copy className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                {expandedSchemaNodes[`tbl-${dbName}-${schemaName}-${tableName}`] && (
                                                  <div className="pl-4 mt-0.5 space-y-0.5">
                                                    {(columns as any[]).map((col: any, idx: number) => (
                                                      <div 
                                                        key={idx} 
                                                        className={`cursor-pointer text-[10px] flex items-center justify-between gap-2 px-1.5 py-0.5 rounded transition-colors ${theme === 'dark' ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-200'}`}
                                                        onClick={() => navigator.clipboard.writeText(col.column_name)}
                                                        title="Нажмите, чтобы скопировать название поля"
                                                      >
                                                        <span className="font-mono truncate" title={col.column_name}>{col.column_name}</span>
                                                        <span className="text-[9px] opacity-60 shrink-0 font-mono">{col.data_type}</span>
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
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* DUCKDB / CLICKHOUSE RESULTS PANEL */}
            {isMaximizedSql && (uiVisibility.showDuckDbConfig || uiVisibility.showClickhouseConfig) && isDuckDbResultVisible && (
              <div className={`border-t flex flex-col shrink-0 transition-colors ${
                theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
              }`} style={{ height: isDuckDbResultExpanded ? '70vh' : '35vh' }}>
                <div className={`flex items-center justify-between px-3 py-1.5 border-b shrink-0 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
                }`}>
                  <div className="flex items-center gap-2 overflow-x-auto min-w-0 pr-2">
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
                            disabled={isDuckDbRunning || !duckDbResults || duckDbResults.length < (uiVisibility.duckDbMaxRows ?? 100)}
                            onClick={() => handleExecuteCurrentEngineQuery(lastExecutedSql, duckDbPage + 1)}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all font-mono disabled:opacity-30 disabled:cursor-not-allowed ${
                              theme === 'dark' ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700/40' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-400/30'
                            }`}
                            title="Следующая страница"
                          >
                            &gt;
                          </button>
                        </div>
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

                    {/* TRANSPOSE BUTTON */}
                    <button
                      type="button"
                      onClick={() => setIsTransposed(!isTransposed)}
                      disabled={!duckDbResults || duckDbResults.length === 0}
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
                      title="Скопировать"
                    >
                      <Copy className="w-4 h-4" />
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
                  </div>
                </div>
                
                <div className="flex-1 overflow-hidden relative flex flex-row">
                  <div className="flex-1 overflow-auto p-0 relative">
                    {isDuckDbRunning ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20 backdrop-blur-sm z-10">
                        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                      </div>
                    ) : duckDbError ? (
                      <div className="p-4 text-red-500 font-mono text-xs whitespace-pre-wrap">
                        Error: {duckDbError}
                      </div>
                    ) : duckDbResults && duckDbResults.length > 0 ? (
                      isTransposed ? (
                        <table className="w-full text-left border-separate border-spacing-0 text-xs">
                          <thead className="sticky top-0 z-20">
                            <tr>
                              <th className={`sticky top-0 left-0 z-30 px-3 py-2 font-semibold border-b-[1.5px] border-r-[1.5px] whitespace-nowrap min-w-[140px] max-w-[200px] ${
                                theme === 'dark' ? 'border-b-slate-600 border-r-slate-600 text-slate-200 bg-slate-800' : 'border-b-slate-300 border-r-slate-300 text-slate-800 bg-slate-100'
                              }`}>
                                Поле \ №
                              </th>
                              {pagedResults.map((_, i) => {
                                const rowNum = (duckDbPage - 1) * (uiVisibility.duckDbMaxRows || 100) + i + 1;
                                return (
                                  <th
                                    key={i}
                                    className={`sticky top-0 z-20 px-3 py-2 font-semibold border-b-[1.5px] border-r whitespace-nowrap text-center min-w-[80px] max-w-[200px] ${
                                      theme === 'dark' ? 'border-b-slate-600 border-r-slate-700/80 text-slate-200 bg-slate-800' : 'border-b-slate-300 border-r-slate-200 text-slate-800 bg-slate-100'
                                    }`}
                                  >
                                    #{rowNum}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(pagedResults[0]).map((colKey) => (
                              <tr key={colKey}>
                                <td 
                                  className={`sticky left-0 z-10 px-3 py-1.5 font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] cursor-pointer transition-colors border-r-[1.5px] border-b ${
                                    theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-r-slate-600 border-b-slate-700/80' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-r-slate-300 border-b-slate-200'
                                  }`}
                                  title={colKey}
                                  onClick={() => setDuckDbSelectedCell({ title: 'Столбец', content: colKey })}
                                >
                                  {colKey}
                                </td>
                                {pagedResults.map((row, i) => {
                                  const val = row[colKey];
                                  return (
                                    <td
                                      key={i}
                                      className={`px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[288px] cursor-pointer transition-colors border-r border-b ${
                                        theme === 'dark' ? 'border-r-slate-700/80 border-b-slate-700/80 text-slate-400 hover:bg-slate-700' : 'border-r-slate-200 border-b-slate-200 text-slate-600 hover:bg-slate-200'
                                      }`}
                                      title={val === null ? 'null' : String(val).length > 200 ? String(val).substring(0, 200) + '...' : String(val)}
                                      onClick={() => setDuckDbSelectedCell({ title: 'Значение', content: val === null ? 'null' : String(val) })}
                                    >
                                      {val === null ? <span className="opacity-50 italic">null</span> : String(val)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-left border-separate border-spacing-0 text-xs">
                          <thead className="sticky top-0 z-20">
                            <tr>
                              <th className={`sticky top-0 left-0 z-30 px-2 py-2 font-semibold border-b-[1.5px] border-r-[1.5px] text-center w-12 shrink-0 select-none ${
                                theme === 'dark' ? 'border-b-slate-600 border-r-slate-600 text-slate-200 bg-slate-800' : 'border-b-slate-300 border-r-slate-300 text-slate-800 bg-slate-100'
                              }`}>
                                #
                              </th>
                              {Object.keys(duckDbResults[0]).map((col) => (
                                <th 
                                  key={col} 
                                  className={`sticky top-0 z-20 px-3 py-2 font-semibold border-b-[1.5px] border-r max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer transition-colors ${
                                    theme === 'dark' ? 'border-b-slate-600 border-r-slate-700/80 text-slate-200 bg-slate-800 hover:bg-slate-700' : 'border-b-slate-300 border-r-slate-200 text-slate-800 bg-slate-100 hover:bg-slate-200'
                                  }`}
                                  title={col.length > 200 ? col.substring(0, 200) + '...' : col}
                                  onClick={() => setDuckDbSelectedCell({ title: 'Столбец', content: col })}
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pagedResults.map((row, i) => {
                              const rowNum = (duckDbPage - 1) * (uiVisibility.duckDbMaxRows || 100) + i + 1;
                              return (
                                <tr key={i}>
                                  <td className={`sticky left-0 z-10 px-2 py-1.5 text-center font-mono text-[11px] select-none shrink-0 border-r-[1.5px] border-b ${
                                    theme === 'dark' ? 'text-slate-300 bg-slate-900 border-r-slate-600 border-b-slate-700/80' : 'text-slate-600 bg-slate-100 border-r-slate-300 border-b-slate-200'
                                  }`}>
                                    {rowNum}
                                  </td>
                                  {Object.values(row).map((val: any, j) => (
                                    <td 
                                      key={j} 
                                      className={`px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[288px] cursor-pointer transition-colors border-r border-b ${
                                        theme === 'dark' ? 'border-r-slate-700/80 border-b-slate-700/80 text-slate-400 hover:bg-slate-700' : 'border-r-slate-200 border-b-slate-200 text-slate-600 hover:bg-slate-200'
                                      }`}
                                      title={val === null ? 'null' : String(val).length > 200 ? String(val).substring(0, 200) + '...' : String(val)}
                                      onClick={() => setDuckDbSelectedCell({ title: 'Значение', content: val === null ? 'null' : String(val) })}
                                    >
                                      {val === null ? <span className="opacity-50 italic">null</span> : String(val)}
                                    </td>
                                  ))}
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
                  {duckDbSelectedCell && (
                    <div className={`w-72 border-l flex flex-col shrink-0 ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-slate-50'}`}>
                      <div className={`flex items-center justify-between px-3 py-1.5 border-b shrink-0 ${theme === 'dark' ? 'border-slate-700' : 'border-slate-200'}`}>
                        <span className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                          {duckDbSelectedCell.title}
                        </span>
                        <button 
                          onClick={() => setDuckDbSelectedCell(null)}
                          className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                          title="Закрыть"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className={`flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap select-text [word-break:break-word] ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                        {duckDbSelectedCell.content}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* FOOTER */}
            <div className={`p-3 px-5 border-t flex items-center justify-between shrink-0 relative ${
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
                  onClick={() => win1251FileInputRef.current?.click()}
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs shadow-sm transition-all ${
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
                  disabled={isDuckDbRunning}
                  className={`flex items-center justify-center gap-2 px-5 py-2 rounded-lg font-bold text-xs shadow-md transition-all ${
                    isDuckDbRunning
                      ? 'bg-slate-500 cursor-not-allowed text-white'
                      : theme === 'dark'
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-teal-500 hover:bg-teal-600 text-white'
                  }`}
                  title="Выполнить запрос в DB"
                >
                  {isDuckDbRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                  <span>Execute</span>
                </button>
                )}
                <button
                  onClick={() => {
                    handleVisualize();
                    setIsMaximizedSql(false);
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
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
          handleVisualize(restoredSql, restoredDialect || dialect, direction);
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

