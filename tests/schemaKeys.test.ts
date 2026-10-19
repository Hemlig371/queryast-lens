import { describe, it, expect } from 'vitest';
import { buildSchemaDbKey, buildTableColumnsKey } from '../src/utils/schemaKeys';

describe('buildSchemaDbKey', () => {
  it('формат ключей прежний (чтобы сохранённый кэш схемы подхватывался)', () => {
    expect(buildSchemaDbKey({ engine: 'duckdb', duckDbPath: '/data/a.duckdb' })).toBe('duckdb:/data/a.duckdb');
    expect(buildSchemaDbKey({ engine: 'duckdb', duckDbPath: null, isWasm: true })).toBe('duckdb:wasm');
    expect(buildSchemaDbKey({ engine: 'duckdb', duckDbPath: null })).toBe('duckdb:local');
    expect(buildSchemaDbKey({ engine: 'clickhouse', clickhouse: { host: 'h:8123', user: 'u', database: 'db' } })).toBe('clickhouse:h:8123:u:db');
  });
  it('ClickHouse без БД — default', () => {
    expect(buildSchemaDbKey({ engine: 'clickhouse', clickhouse: { host: 'h', user: 'u', database: '' } })).toBe('clickhouse:h:u:default');
  });
  it('разные движки дают разные ключи', () => {
    const ch = buildSchemaDbKey({ engine: 'clickhouse', clickhouse: { host: 'h', user: 'u', database: 'default' } });
    const dd = buildSchemaDbKey({ engine: 'duckdb', duckDbPath: 'default' });
    expect(ch).not.toBe(dd);
  });
});

describe('buildTableColumnsKey', () => {
  it('одинаковое имя таблицы в DuckDB и ClickHouse — разные ключи (A-07)', () => {
    const duck = buildTableColumnsKey('duckdb', 'default', 'default', 'events');
    const ch = buildTableColumnsKey('clickhouse', 'default', 'default', 'events');
    expect(duck).not.toBe(ch);
  });
  it('один движок — один и тот же ключ', () => {
    expect(buildTableColumnsKey('duckdb', 'a', 'main', 't')).toBe(buildTableColumnsKey('duckdb', 'a', 'main', 't'));
    expect(buildTableColumnsKey('duckdb', 'a', 'main', 't')).toBe('duckdb:a.main.t');
  });
  it('карта столбцов двух движков не пересекается', () => {
    const map: Record<string, string[]> = {};
    map[buildTableColumnsKey('duckdb', 'd', 'd', 't')] = ['duck_col'];
    expect(map[buildTableColumnsKey('clickhouse', 'd', 'd', 't')]).toBeUndefined();
  });
});
