export interface ConnectorxConfig {
  uri: string;
  partitionNum?: number;
  partitionOn?: string;
  partitionRangeMin?: number;
  partitionRangeMax?: number;
}

export interface ConnectorxCopyCommand {
  type: 'COPY_TO';
  innerSql: string;
  filePath: string;
}

/**
 * Checks if the application is running in Tauri environment.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_IPC__' in window);
}

/**
 * Sanitizes connection string URI by removing or masking password for safe exports.
 */
export function sanitizeConnectorxUri(uri: string): string {
  if (!uri) return '';
  try {
    // Match scheme://user:password@host...
    return uri.replace(/(:\/\/[^:@]+):([^@]+)@/, '$1:***@');
  } catch {
    return uri;
  }
}

/**
 * Parses COPY (...) TO 'path' and COPY select_query TO 'path' commands for ConnectorX.
 */
export function parseConnectorxCopy(sql: string): ConnectorxCopyCommand | null {
  const cleanSql = sql.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/g, '').trim();

  // Match COPY (...) TO 'file_path' or COPY select_query TO 'file_path'
  const copyToRegex = /^\s*COPY\s+(?:\(([\s\S]+)\)|([\s\S]+?))\s+TO\s+['"]([^'"]+)['"]\s*;?$/i;
  const matchTo = cleanSql.match(copyToRegex);
  if (matchTo) {
    const inner = (matchTo[1] || matchTo[2]).trim();
    const filePath = matchTo[3].trim();
    return {
      type: 'COPY_TO',
      innerSql: inner,
      filePath
    };
  }

  return null;
}

/**
 * Executes a ConnectorX query natively in Tauri.
 */
export async function executeConnectorxQueryTauri(config: ConnectorxConfig, query: string): Promise<{ columns: string[]; rows: any[][] }> {
  if (!isTauriEnvironment()) {
    throw new Error('ConnectorX доступен в десктопной версии приложения (Tauri). В веб-версии переключитесь на DuckDB или ClickHouse.');
  }
  const { invoke } = await import('@tauri-apps/api/tauri');
  return await invoke('query_connectorx_preview', {
    connStr: config.uri,
    query
  });
}

/**
 * Executes ConnectorX COPY TO query and exports data directly into a Parquet file in Tauri.
 */
export async function executeConnectorxCopyToTauri(
  config: ConnectorxConfig, 
  innerSql: string, 
  filePath: string
): Promise<{ success: boolean; message: string; bytes: number }> {
  if (!isTauriEnvironment()) {
    throw new Error('Выгрузка через ConnectorX доступна в десктопной версии приложения (Tauri).');
  }
  const { invoke } = await import('@tauri-apps/api/tauri');
  return await invoke('connectorx_copy_to', {
    connStr: config.uri,
    query: innerSql,
    filePath,
    partitionNum: config.partitionNum && config.partitionNum > 0 ? config.partitionNum : undefined,
    partitionOn: config.partitionOn ? config.partitionOn.trim() : undefined,
    partitionRangeMin: config.partitionRangeMin !== undefined ? config.partitionRangeMin : undefined,
    partitionRangeMax: config.partitionRangeMax !== undefined ? config.partitionRangeMax : undefined,
  });
}
