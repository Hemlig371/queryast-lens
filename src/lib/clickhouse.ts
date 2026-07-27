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
