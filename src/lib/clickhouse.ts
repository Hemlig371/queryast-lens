export interface ClickhouseConfig {
  protocol: 'http' | 'https';
  host: string;
  user: string;
  key: string;
  database: string;
}

export interface ClickhouseCopyCommand {
  type: 'COPY_TO' | 'COPY_FROM';
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
 * Parses COPY (...) TO 'path' and COPY (...) FROM 'path' commands.
 * Handles both parentheses COPY (SELECT ...) and raw COPY SELECT ...
 */
export function parseClickhouseCopy(sql: string): ClickhouseCopyCommand | null {
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

  // Match COPY (...) FROM 'file_path' or COPY table_name FROM 'file_path'
  const copyFromRegex = /^\s*COPY\s+(?:\(([\s\S]+)\)|([\s\S]+?))\s+FROM\s+['"]([^'"]+)['"]\s*;?$/i;
  const matchFrom = cleanSql.match(copyFromRegex);
  if (matchFrom) {
    const inner = (matchFrom[1] || matchFrom[2]).trim();
    const filePath = matchFrom[3].trim();
    return {
      type: 'COPY_FROM',
      innerSql: inner,
      filePath
    };
  }

  return null;
}

/**
 * Builds the Clickhouse HTTP URL for a given config.
 */
export function getClickhouseUrl(config: ClickhouseConfig, queryParams?: Record<string, string>): string {
  const cleanHost = config.host.replace(/^https?:\/\//i, '');
  const params = new URLSearchParams();
  if (config.database) {
    params.set('database', config.database);
  }
  if (queryParams) {
    Object.entries(queryParams).forEach(([k, v]) => params.set(k, v));
  }
  
  // Добавляем безопасный параметр, чтобы избежать маршрутизации на статический сайт (как на play.clickhouse.com) 
  // когда база данных не указана и строка параметров пустая.
  if (params.toString() === '') {
    params.set('default_format', 'JSON');
  }

  const queryString = params.toString();
  return `${config.protocol || 'http'}://${cleanHost}/${queryString ? '?' + queryString : ''}`;
}

/**
 * Common headers for Clickhouse HTTP requests.
 */
export function getClickhouseHeaders(config: ClickhouseConfig, contentType: string = 'text/plain;charset=utf-8'): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };
  if (config.user) {
    headers['X-ClickHouse-User'] = config.user;
  }
  if (config.key) {
    headers['X-ClickHouse-Key'] = config.key;
  }
  return headers;
}

/**
 * Executes a Clickhouse query natively in Tauri, bypassing browser CORS/Mixed Content.
 */
export async function executeClickhouseQueryTauri(config: ClickhouseConfig, query: string): Promise<any> {
  const { fetch: tauriFetch, ResponseType, Body } = await import('@tauri-apps/api/http');

  const url = getClickhouseUrl(config);
  const originalHeaders = getClickhouseHeaders(config, 'text/plain;charset=utf-8');

  const response = await tauriFetch(url, {
    method: 'POST',
    headers: originalHeaders,
    body: Body.text(query),
    responseType: ResponseType.Text
  });

  const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  if (!response.ok) {
    throw new Error(responseText || `HTTP status ${response.status}`);
  }

  try {
    const parsed = JSON.parse(responseText);
    return { success: true, data: parsed.data || parsed };
  } catch {
    return { success: true, text: responseText.trim() };
  }
}

/**
 * Executes Clickhouse COPY TO query and writes the resulting data as a file to local disk in Tauri.
 */
export async function executeClickhouseCopyToTauri(config: ClickhouseConfig, innerSql: string, filePath: string): Promise<{ success: boolean; message: string; bytes: number }> {
  const { fetch: tauriFetch, ResponseType, Body } = await import('@tauri-apps/api/http');
  const { writeBinaryFile } = await import('@tauri-apps/api/fs');

  let sqlToExec = innerSql.trim().replace(/;+$/, '');
  if (!/\bFORMAT\b/i.test(sqlToExec)) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      sqlToExec += ' FORMAT CSVWithNames';
    } else if (ext === 'tsv' || ext === 'tab') {
      sqlToExec += ' FORMAT TSVWithNames';
    } else if (ext === 'json') {
      sqlToExec += ' FORMAT JSONEachRow';
    } else {
      sqlToExec += ' FORMAT Parquet';
    }
  }

  const url = getClickhouseUrl(config);
  const originalHeaders = getClickhouseHeaders(config, 'text/plain;charset=utf-8');

  const response = await tauriFetch(url, {
    method: 'POST',
    headers: originalHeaders,
    body: Body.text(sqlToExec),
    responseType: ResponseType.Binary
  });

  if (!response.ok) {
    const errorText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    throw new Error(errorText || `HTTP status ${response.status}`);
  }

  const rawData = response.data;
  let bytes: Uint8Array;
  if (rawData instanceof Uint8Array) {
    bytes = rawData;
  } else if (Array.isArray(rawData)) {
    bytes = new Uint8Array(rawData);
  } else {
    throw new Error("Invalid binary response received from Clickhouse");
  }

  await writeBinaryFile(filePath, bytes);

  return {
    success: true,
    message: `Файл успешно сохранен на локальный диск: ${filePath}`,
    bytes: bytes.length
  };
}

/**
 * Reads a local file from disk in Tauri and streams it into a Clickhouse table (COPY FROM).
 */
export async function executeClickhouseCopyFromTauri(config: ClickhouseConfig, innerSql: string, filePath: string): Promise<{ success: boolean; message: string; response: string }> {
  const { fetch: tauriFetch, ResponseType, Body } = await import('@tauri-apps/api/http');
  const { readBinaryFile } = await import('@tauri-apps/api/fs');

  const fileData = await readBinaryFile(filePath);

  let target = innerSql.trim();
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!/^INSERT INTO/i.test(target)) {
    target = `INSERT INTO ${target}`;
  }
  if (!/\bFORMAT\b/i.test(target)) {
    if (ext === 'csv') {
      target += ' FORMAT CSVWithNames';
    } else if (ext === 'tsv' || ext === 'tab') {
      target += ' FORMAT TSVWithNames';
    } else if (ext === 'json') {
      target += ' FORMAT JSONEachRow';
    } else {
      target += ' FORMAT Parquet';
    }
  }

  const url = getClickhouseUrl(config, { query: target });
  const originalHeaders = getClickhouseHeaders(config, 'application/octet-stream');

  const response = await tauriFetch(url, {
    method: 'POST',
    headers: originalHeaders,
    body: Body.bytes(fileData),
    responseType: ResponseType.Text
  });

  if (!response.ok) {
    const errorText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    throw new Error(errorText || `HTTP status ${response.status}`);
  }

  return {
    success: true,
    message: `Данные из локального файла ${filePath} успешно загружены в Clickhouse`,
    response: typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
  };
}
