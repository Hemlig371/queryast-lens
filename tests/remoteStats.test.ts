import { describe, it, expect } from 'vitest';
import { buildRemoteStatsQuery, parseRemoteStatsRows } from '../src/utils/remoteStats';

describe('E-01: «Обновить по БД» — число строк с учётом NULL', () => {
  it('DuckDB: total_count не считает только значения без NULL', () => {
    const q = buildRemoteStatsQuery('t', '', false);
    expect(q).not.toContain('count(COLUMNS(*))');
    expect(q).toMatch(/'total_count' AS metric, count\(CASE WHEN COLUMNS\(\*\) IS NULL OR TRUE THEN 1 END\)/);
  });
  it('ClickHouse: имена столбцов задаёт первый SELECT (non_null_count), total_count считает все строки', () => {
    const q = buildRemoteStatsQuery('t', '', true);
    expect(q.indexOf("'non_null_count'")).toBeLessThan(q.indexOf("'total_count'"));
    expect(q).toContain('toFloat64(countIf(isNull(x) OR NOT isNull(x)))');
  });

  // столбец v: 10 строк, 4 NULL, сумма непустых = 60 → среднее 10
  const rows = [
    { metric: 'total_count', id: 10, v: 10 },
    { metric: 'null_count', id: 0, v: 4 },
    { metric: 'null_percent', id: 0, v: 40 },
    { metric: 'unique_count', id: 10, v: 3 },
    { metric: 'sum', id: 55, v: 60 },
  ];
  it('строк — total_count, среднее = сумма / (строки − null_count)', () => {
    const { parsed, totalRows } = parseRemoteStatsRows(rows, false);
    expect(totalRows).toBe(10);
    expect(parsed.v.count).toBe(10);
    expect(parsed.v.nullPct).toBe(40);
    expect(parsed.v.avg).toBe(10);
    expect(parsed.id.avg).toBe(5.5);
  });
  it('ClickHouse: имена столбцов восстанавливаются из toFloat64(count(<имя>))', () => {
    const ch = [
      { metric: 'non_null_count', 'toFloat64(count(v))': 6 },
      { metric: 'total_count', 'toFloat64(count(v))': 10 },
      { metric: 'null_count', 'toFloat64(count(v))': 4 },
      { metric: 'sum', 'toFloat64(count(v))': 60 },
    ];
    const { parsed, totalRows } = parseRemoteStatsRows(ch, true);
    expect(totalRows).toBe(10);
    expect(parsed.v.avg).toBe(10);
  });
});
