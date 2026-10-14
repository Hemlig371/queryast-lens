import type { ClickhouseConfig } from '../lib/clickhouse';
import type { EditorTab } from '../types/editorTab';

// Снимок сессии в localStorage (ключ sql_visualizer_session_v2). Вынесено из App.tsx без изменений логики.
export const SESSION_STORAGE_KEY = 'sql_visualizer_session_v2';

export interface SavedSession {
  tabs?: EditorTab[];
  activeTabId?: string;
  sql?: string;
  dialect?: 'PostgreSQL' | 'Oracle' | 'Clickhouse' | 'DuckDB' | '';
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
