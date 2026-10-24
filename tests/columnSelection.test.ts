import { describe, it, expect } from 'vitest';
import {
  quoteIdent,
  buildGroupBySql,
  buildKeepColumnsSql,
  buildRemoveColumnsSql,
  buildDistinctSql,
} from '../src/utils/columnActionsSql';

// Эталонный шаблон GROUP BY для одного столбца.
const legacyGroupBy = (colKey: string, baseFilteredSql: string) =>
  `SELECT "${colKey.replace(/"/g, '""')}", COUNT(*) AS count\nFROM (\n  ${baseFilteredSql}\n) AS _sub\nGROUP BY 1\nORDER BY 2 DESC`;

const BASE = 'SELECT * FROM t';

describe('quoteIdent', () => {
  it('оборачивает в двойные кавычки и удваивает внутренние', () => {
    expect(quoteIdent('a')).toBe('"a"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
    expect(quoteIdent('Период с')).toBe('"Период с"');
  });
});

describe('buildGroupBySql', () => {
  it('для одного столбца совпадает с прежним SQL', () => {
    expect(buildGroupBySql(BASE, ['region'])).toBe(legacyGroupBy('region', BASE));
    expect(buildGroupBySql(BASE, ['a"b'])).toBe(legacyGroupBy('a"b', BASE));
  });

  it('для нескольких столбцов нумерует GROUP BY и ORDER BY по счётчику', () => {
    const sql = buildGroupBySql(BASE, ['a', 'b', 'c']);
    expect(sql).toBe('SELECT "a", "b", "c", COUNT(*) AS count\nFROM (\n  SELECT * FROM t\n) AS _sub\nGROUP BY 1, 2, 3\nORDER BY 4 DESC');
  });

  it('убирает повторы столбцов и сохраняет порядок', () => {
    expect(buildGroupBySql(BASE, ['b', 'a', 'b'])).toContain('SELECT "b", "a", COUNT(*)');
    expect(buildGroupBySql(BASE, ['b', 'a', 'b'])).toContain('GROUP BY 1, 2\nORDER BY 3 DESC');
  });

  it('пустой SQL или пустой список → пустая строка', () => {
    expect(buildGroupBySql('  ', ['a'])).toBe('');
    expect(buildGroupBySql(BASE, [])).toBe('');
  });
});

describe('buildKeepColumnsSql', () => {
  it('оставляет только выбранные столбцы', () => {
    expect(buildKeepColumnsSql(BASE, ['a', 'c'])).toBe('SELECT "a", "c"\nFROM (\n  SELECT * FROM t\n) AS _sub');
  });
  it('пустые входные данные → пустая строка', () => {
    expect(buildKeepColumnsSql('', ['a'])).toBe('');
    expect(buildKeepColumnsSql(BASE, [])).toBe('');
  });
});

describe('buildRemoveColumnsSql', () => {
  const all = ['a', 'b', 'c', 'd'];
  it('оставляет остальные столбцы в порядке результата', () => {
    expect(buildRemoveColumnsSql(BASE, all, ['d', 'b'])).toBe('SELECT "a", "c"\nFROM (\n  SELECT * FROM t\n) AS _sub');
  });
  it('исключены все столбцы → пустая строка', () => {
    expect(buildRemoveColumnsSql(BASE, all, ['a', 'b', 'c', 'd'])).toBe('');
  });
  it('нечего исключать (имён нет в результате) → пустая строка', () => {
    expect(buildRemoveColumnsSql(BASE, all, [])).toBe('');
    expect(buildRemoveColumnsSql(BASE, all, ['zzz'])).toBe('');
  });
  it('экранирует кавычки в именах', () => {
    expect(buildRemoveColumnsSql(BASE, ['x"y', 'z'], ['z'])).toContain('SELECT "x""y"');
  });
  it('пустой SQL → пустая строка', () => {
    expect(buildRemoveColumnsSql(' ', all, ['a'])).toBe('');
  });
});

describe('buildDistinctSql', () => {
  it('SELECT DISTINCT по выбранным столбцам', () => {
    expect(buildDistinctSql(BASE, ['a'])).toBe('SELECT DISTINCT "a"\nFROM (\n  SELECT * FROM t\n) AS _sub');
    expect(buildDistinctSql(BASE, ['a', 'b'])).toContain('SELECT DISTINCT "a", "b"');
  });
  it('пустые входные данные → пустая строка', () => {
    expect(buildDistinctSql('', ['a'])).toBe('');
    expect(buildDistinctSql(BASE, [])).toBe('');
  });
});