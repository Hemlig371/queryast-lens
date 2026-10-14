import { describe, it, expect } from 'vitest';
import { generateFilteredSortedSql } from '../src/utils/filteredSql';

describe('generateFilteredSortedSql', () => {
  it('возвращает исходный SQL без ; если нет фильтров и сортировок', () => {
    expect(generateFilteredSortedSql('duckdb', 'SELECT 1;', [], [])).toBe('SELECT 1');
  });

  it('пустой SQL -> пустая строка', () => {
    expect(generateFilteredSortedSql('duckdb', '  ;  ', [], [])).toBe('');
  });

  it('строит WHERE и ORDER BY с экранированием кавычек', () => {
    const sql = generateFilteredSortedSql(
      'duckdb',
      'SELECT * FROM t',
      [{ colKey: 'a"b', op: '=', val: "o'k" }],
      [{ colKey: 'x', dir: 'DESC' }]
    );
    expect(sql).toContain('SELECT * FROM (\nSELECT * FROM t\n) AS _filtered_query');
    expect(sql).toContain(`WHERE "a""b" = 'o''k'`);
    expect(sql).toContain('ORDER BY "x" DESC');
  });

  it('использует String для ClickHouse и VARCHAR для DuckDB в IS NULL', () => {
    const f = [{ colKey: 'c', op: 'IS NULL' as const, val: null }];
    expect(generateFilteredSortedSql('clickhouse', 'SELECT 1', f, [])).toContain('AS String');
    expect(generateFilteredSortedSql('duckdb', 'SELECT 1', f, [])).toContain('AS VARCHAR');
  });

  it('не вкладывает обёртку повторно (lazy unboxing)', () => {
    const first = generateFilteredSortedSql('duckdb', 'SELECT * FROM t', [{ colKey: 'a', op: '=', val: 1 }], []);
    const second = generateFilteredSortedSql('duckdb', first, [{ colKey: 'a', op: '=', val: 2 }], []);
    expect(second.match(/_filtered_query/g)?.length).toBe(1);
    expect(second).toContain('"a" = 2');
  });
});
