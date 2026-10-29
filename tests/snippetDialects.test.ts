import { describe, it, expect } from 'vitest';
import { canonicalDialect, uniqueDialects } from '../src/utils/snippetDialects';

describe('диалекты шаблонов', () => {
  it('известные названия приводятся к каноническому написанию, прочие остаются как есть', () => {
    expect(canonicalDialect('ClickHouse')).toBe('Clickhouse');
    expect(canonicalDialect(' clickhouse ')).toBe('Clickhouse');
    expect(canonicalDialect('postgresql')).toBe('PostgreSQL');
    expect(canonicalDialect('general')).toBe('General');
    expect(canonicalDialect('Мой диалект')).toBe('Мой диалект');
    expect(canonicalDialect(undefined)).toBe('');
  });
  it('повторы, различающиеся регистром, схлопываются; порядок сохраняется', () => {
    expect(uniqueDialects(['PostgreSQL', 'ClickHouse', 'DuckDB', 'Clickhouse', 'clickhouse'])).toEqual(['PostgreSQL', 'Clickhouse', 'DuckDB']);
    expect(uniqueDialects(['Мой', 'мой', '', '  '])).toEqual(['Мой']);
  });
});
