// Ключи кэша схемы: одинаковые имена в разных движках не смешиваются.

export type SchemaEngine = 'clickhouse' | 'duckdb';

export interface SchemaDbKeyParams {
  engine: SchemaEngine;
  clickhouse?: { host: string; user: string; database?: string } | null;
  duckDbPath?: string | null;
  isWasm?: boolean;
}

/** Ключ записи кэша схемы одного подключения (движок, подключение, БД). */
export function buildSchemaDbKey({ engine, clickhouse, duckDbPath, isWasm }: SchemaDbKeyParams): string {
  if (engine === 'clickhouse' && clickhouse) {
    return `clickhouse:${clickhouse.host}:${clickhouse.user}:${clickhouse.database || 'default'}`;
  }
  return `duckdb:${duckDbPath || (isWasm ? 'wasm' : 'local')}`;
}

/** Ключ таблицы в карте столбцов: движок + база.схема.таблица (в DuckDB и ClickHouse имена могут совпадать). */
export function buildTableColumnsKey(engine: SchemaEngine, dbName: string, schemaName: string, tableName: string): string {
  return `${engine}:${dbName}.${schemaName}.${tableName}`;
}
