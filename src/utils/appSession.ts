import type { ClickhouseConfig } from '../lib/clickhouse';
import type { EditorTab } from '../types/editorTab';

// Снимок сессии в localStorage (ключ sql_visualizer_session_v2).
export const SESSION_STORAGE_KEY = 'sql_visualizer_session_v2';

export interface SavedSession {
  tabs?: EditorTab[];
  activeTabId?: string;
  sql?: string;
  direction?: 'LR' | 'TB';
  theme?: 'dark' | 'light';
  isWrapSql?: boolean;
  isMaximizedSql?: boolean;
  duckDbConnectedPath?: string | null;
  schemaSearchTerm?: string;
  expandedSchemaNodes?: Record<string, boolean>;
  showDuckDbSchemaPanel?: boolean;
  /** Секция «Файлы» в панели схемы; в старых сессиях поля нет — тогда 'split'. */
  filesSectionMode?: 'split' | 'collapsed' | 'max';
  /** Порядок записей в дереве файлов; в старых сессиях поля нет — по имени (А→Я). */
  filesSort?: { key: 'name' | 'date' | 'size'; dir: 'asc' | 'desc' };
  clickhouseConfig?: ClickhouseConfig | null;
  activeEngine?: 'duckdb' | 'clickhouse' | null;
}

export const getSavedSession = (): SavedSession | null => {
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
