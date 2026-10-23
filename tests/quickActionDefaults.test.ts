import { describe, it, expect } from 'vitest';
import { DEFAULT_QUICK_ACTIONS } from '../src/utils/quickActionTemplates';
import { buildQuickActionSource } from '../src/lib/sqlUtils';

// F-25: «Структура таблицы» после запроса падала: `DESCRIBE (…) AS _sub` недопустим в DuckDB.
describe('шаблоны быстрых действий по умолчанию', () => {
  const describeTpl = DEFAULT_QUICK_ACTIONS.find((a) => a.id === 'qa-2')!.template;

  it('«Структура таблицы» оборачивает источник в SELECT * FROM, а не ставит алиас после DESCRIBE', () => {
    expect(describeTpl).toBe('DESCRIBE (SELECT * FROM {table})');
    const sql = describeTpl.replace(/\{table\}/g, buildQuickActionSource('SELECT 1 AS a'));
    expect(sql).toBe('DESCRIBE (SELECT * FROM (\nSELECT 1 AS a\n) AS _sub)');
  });

  it('до первого запроса {table} остаётся именем таблицы', () => {
    expect(describeTpl.replace(/\{table\}/g, buildQuickActionSource(''))).toBe('DESCRIBE (SELECT * FROM table)');
  });

  it('«Количество строк» не менялось', () => {
    expect(DEFAULT_QUICK_ACTIONS.find((a) => a.id === 'qa-1')!.template).toBe('SELECT COUNT(*) FROM {table};');
  });
});
