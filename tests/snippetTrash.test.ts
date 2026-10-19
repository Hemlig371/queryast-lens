import { describe, it, expect } from 'vitest';
import { TRASH_CATEGORY, isTrashed, getTrashedFrom, trashSnippet, restoreFromTrash, withoutTrash } from '../src/utils/snippetTrash';
import { EN_DICT } from '../src/utils/i18n';

const snip = (over: Partial<{ id: string; category: string; sql: string; dialect: string; isCustom: boolean }> = {}) => ({
  id: 's1',
  title: 'Шаблон',
  category: 'Запросы',
  sql: 'SELECT 1',
  ...over,
});

describe('snippetTrash (SM-01)', () => {
  it('название категории и перевод', () => {
    expect(TRASH_CATEGORY).toBe('Корзина');
    expect(EN_DICT[TRASH_CATEGORY]).toBe('Trash');
  });

  it('trashSnippet: категория «Корзина», первой строкой SQL — прежняя категория, остальное без изменений', () => {
    const t = trashSnippet(snip({ category: 'Агрегаты', dialect: 'DuckDB' }));
    expect(t.category).toBe('Корзина');
    expect(t.sql).toBe('-- trashedFrom: Агрегаты\nSELECT 1');
    expect(t.id).toBe('s1');
    expect(t.title).toBe('Шаблон');
    expect(t.dialect).toBe('DuckDB');
  });

  it('исходный шаблон не изменяется', () => {
    const src = snip();
    trashSnippet(src);
    expect(src.category).toBe('Запросы');
    expect(src.sql).toBe('SELECT 1');
  });

  it('повторное «удаление» шаблона из «Корзины» его не меняет (строка не дублируется)', () => {
    const once = trashSnippet(snip());
    expect(trashSnippet(once)).toBe(once);
    expect(once.sql.match(/trashedFrom/g)?.length).toBe(1);
  });

  it('категория «Меню действий» и job-шаблон: после «удаления» -- @job больше не первая строка', () => {
    const job = trashSnippet(snip({ category: 'Меню действий', sql: '-- @job\nSELECT 1' }));
    expect(job.sql.trim().startsWith('-- @job')).toBe(false);
    expect(getTrashedFrom(job.sql)).toBe('Меню действий');
  });

  it('getTrashedFrom: читает только первую строку', () => {
    expect(getTrashedFrom('-- trashedFrom: Запросы\nSELECT 1')).toBe('Запросы');
    expect(getTrashedFrom('-- trashedFrom: Соединения (JOIN)\r\nSELECT 1')).toBe('Соединения (JOIN)');
    expect(getTrashedFrom('SELECT 1\n-- trashedFrom: Запросы')).toBeNull();
    expect(getTrashedFrom('-- trashedFrom:\nSELECT 1')).toBeNull();
    expect(getTrashedFrom('')).toBeNull();
  });

  it('restoreFromTrash: категория возвращается, строка убирается; round-trip даёт исходный шаблон', () => {
    const src = snip({ category: 'Схемы', sql: 'SELECT *\nFROM t' });
    expect(restoreFromTrash(trashSnippet(src))).toEqual(src);
  });

  it('restoreFromTrash без строки trashedFrom или вне «Корзины» не меняет шаблон', () => {
    const a = snip({ category: TRASH_CATEGORY, sql: 'SELECT 1' });
    expect(restoreFromTrash(a)).toBe(a);
    const b = snip({ category: 'Запросы', sql: '-- trashedFrom: Другая\nSELECT 1' });
    expect(restoreFromTrash(b)).toBe(b);
  });

  it('isTrashed', () => {
    expect(isTrashed({ category: 'Корзина' })).toBe(true);
    expect(isTrashed({ category: 'Запросы' })).toBe(false);
    expect(isTrashed({ category: 'корзина' })).toBe(false);
  });

  it('withoutTrash: экспорт и файл настроек без «Корзины», порядок сохранён', () => {
    const list = [snip({ id: 'a' }), trashSnippet(snip({ id: 'b' })), snip({ id: 'c', category: 'Схемы' })];
    expect(withoutTrash(list).map(s => s.id)).toEqual(['a', 'c']);
    expect(withoutTrash([])).toEqual([]);
    expect(list.length).toBe(3);
  });
});
