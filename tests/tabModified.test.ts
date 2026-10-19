import { describe, it, expect } from 'vitest';
import { nextIsModified, setTabSql, formatWithFeedback, shouldConfirmClose } from '../src/utils/tabModified';
import type { EditorTab } from '../src/types/editorTab';

// п. 3.17 (C-06): одно правило isModified для ввода, вставки шаблона, форматирования, сжатия и восстановления версии.

const tab = (over: Partial<EditorTab> = {}): EditorTab => ({ id: '1', title: 'Вкладка 1', sql: 'SELECT 1', ...over });

describe('nextIsModified', () => {
  it('вкладка без сохранённого содержимого: любое изменение — «изменено»', () => {
    expect(nextIsModified(tab(), 'SELECT 2')).toBe(true);
  });
  it('вкладка из файла: изменено, только если текст отличается от сохранённого', () => {
    const t = tab({ sql: 'SELECT 1', savedContent: 'SELECT 1', filePath: 'a.sql' });
    expect(nextIsModified(t, 'SELECT 2')).toBe(true);
    expect(nextIsModified(t, 'SELECT 1')).toBe(false);
  });
});

describe('setTabSql', () => {
  it('меняет текст и флаг только у нужной вкладки', () => {
    const tabs = [tab({ id: '1' }), tab({ id: '2', sql: 'X' })];
    const next = setTabSql(tabs, '1', 'SELECT 5');
    expect(next[0]).toMatchObject({ id: '1', sql: 'SELECT 5', isModified: true });
    expect(next[1]).toBe(tabs[1]);
  });
  it('текст не изменился: вкладка возвращается как есть', () => {
    const tabs = [tab({ isModified: false })];
    expect(setTabSql(tabs, '1', 'SELECT 1')[0]).toBe(tabs[0]);
  });
  it('возврат к сохранённому тексту снимает флаг у вкладки из файла', () => {
    const tabs = [tab({ sql: 'SELECT 2', savedContent: 'SELECT 1', isModified: true, filePath: 'a.sql' })];
    expect(setTabSql(tabs, '1', 'SELECT 1')[0].isModified).toBe(false);
  });
  it('исходный массив не меняется', () => {
    const tabs = [tab()];
    const copy = JSON.parse(JSON.stringify(tabs));
    setTabSql(tabs, '1', 'другое');
    expect(tabs).toEqual(copy);
  });
});

describe('восстановление версии', () => {
  it('восстановленный текст ставит флаг «изменено», и закрытие требует подтверждения', () => {
    const tabs = [tab({ isModified: false })];
    const restored = setTabSql(tabs, '1', 'SELECT /* из истории */ 0')[0];
    expect(restored.isModified).toBe(true);
    expect(shouldConfirmClose(restored)).toBe(true);
  });
  it('восстановление текста, равного сохранённому в файле, флаг не ставит', () => {
    const tabs = [tab({ sql: 'SELECT 2', savedContent: 'SELECT 1', isModified: true, filePath: 'a.sql' })];
    expect(shouldConfirmClose(setTabSql(tabs, '1', 'SELECT 1')[0])).toBe(false);
  });
});

describe('shouldConfirmClose', () => {
  it('подтверждение только для изменённой вкладки', () => {
    expect(shouldConfirmClose(tab({ isModified: true }))).toBe(true);
    expect(shouldConfirmClose(tab({ isModified: false }))).toBe(false);
    expect(shouldConfirmClose(tab())).toBe(false);
    expect(shouldConfirmClose(undefined)).toBe(false);
  });
});

describe('formatWithFeedback', () => {
  it('успех: ok и отформатированный текст', async () => {
    const r = await formatWithFeedback('select 1', async (s) => s.toUpperCase());
    expect(r).toEqual({ ok: true, text: 'SELECT 1' });
  });
  it('сбой форматтера: ok=false, исходный текст не подменяется, ошибка возвращается', async () => {
    const r = await formatWithFeedback('select (', async () => { throw new Error('syntax error'); });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('syntax error');
  });
  it('форматтер бросил не Error — тоже сбой', async () => {
    const r = await formatWithFeedback('x', async () => { throw 'строка'; });
    expect(r.ok).toBe(false);
  });
  it('форматтер вернул не строку — сбой', async () => {
    const r = await formatWithFeedback('x', (async () => undefined) as any);
    expect(r.ok).toBe(false);
  });
});
