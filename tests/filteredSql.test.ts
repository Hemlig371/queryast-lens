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

  it('F-05: из скрипта в обёртку берётся только последний оператор', () => {
    const sql = 'CREATE TABLE t AS SELECT 1 a;\nINSERT INTO t VALUES (2);\nSELECT * FROM t;';
    expect(generateFilteredSortedSql('duckdb', sql, [], [])).toBe('SELECT * FROM t');
    expect(generateFilteredSortedSql('duckdb', sql, [{ colKey: 'a', op: '=', val: 1 }], [{ colKey: 'a', dir: 'DESC' }])).toBe(
      'SELECT * FROM (\nSELECT * FROM t\n) AS _filtered_query\nWHERE "a" = 1\nORDER BY "a" DESC'
    );
  });

  it('F-05: комментарий после последней ; не становится оператором и не прячет скобку', () => {
    const sql = 'SELECT * FROM t; -- итог';
    const out = generateFilteredSortedSql('duckdb', sql, [], [{ colKey: 'a', dir: 'ASC' }]);
    expect(out).toBe('SELECT * FROM (\nSELECT * FROM t\n) AS _filtered_query\nORDER BY "a" ASC');
    expect(generateFilteredSortedSql('duckdb', '-- только комментарий\n;', [], [{ colKey: 'a', dir: 'ASC' }])).toBe('');
  });

  it('F-05: ; внутри строки не делит оператор, а хвостовой -- комментарий внутри оператора остаётся (скобка на новой строке)', () => {
    const out = generateFilteredSortedSql('duckdb', "SELECT ';' AS a -- c", [], [{ colKey: 'a', dir: 'ASC' }]);
    expect(out).toBe("SELECT * FROM (\nSELECT ';' AS a -- c\n) AS _filtered_query\nORDER BY \"a\" ASC");
  });
});
