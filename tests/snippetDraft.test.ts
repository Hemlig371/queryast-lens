import { describe, it, expect } from 'vitest';
import { firstLine, limitDescription, dialectForConnection, buildSnippetDraft, DRAFT_DESCRIPTION_MAX } from '../src/utils/snippetDraft';

const none = { activeEngine: 'duckdb' as const, duckDbConnectedPath: null, clickhouseConfig: null };

describe('черновик шаблона из вкладки', () => {
  it('первая непустая строка', () => {
    expect(firstLine('\n\n  -- отчёт по продажам  \nSELECT 1')).toBe('-- отчёт по продажам');
    expect(firstLine('SELECT 1\nFROM t')).toBe('SELECT 1');
    expect(firstLine('  \n ')).toBe('');
    expect(firstLine('')).toBe('');
  });

  it('диалект по активному подключению; без подключения — General', () => {
    expect(dialectForConnection(none)).toBe('General');
    expect(dialectForConnection({ ...none, duckDbConnectedPath: ':memory:' })).toBe('DuckDB');
    expect(dialectForConnection({ ...none, duckDbConnectedPath: 'C:/db/a.duckdb' })).toBe('DuckDB');
    expect(dialectForConnection({ activeEngine: 'clickhouse', duckDbConnectedPath: null, clickhouseConfig: { host: 'h' } })).toBe('Clickhouse');
    // выбран ClickHouse, но настроек нет — подключения нет
    expect(dialectForConnection({ activeEngine: 'clickhouse', duckDbConnectedPath: ':memory:', clickhouseConfig: null })).toBe('General');
    // оба подключения: решает выбранный движок
    expect(dialectForConnection({ activeEngine: 'duckdb', duckDbConnectedPath: ':memory:', clickhouseConfig: { host: 'h' } })).toBe('DuckDB');
    expect(dialectForConnection({ activeEngine: 'clickhouse', duckDbConnectedPath: ':memory:', clickhouseConfig: { host: 'h' } })).toBe('Clickhouse');
    // DuckDB не подключён, ClickHouse настроен — как isCH в App
    expect(dialectForConnection({ activeEngine: 'duckdb', duckDbConnectedPath: null, clickhouseConfig: { host: 'h' } })).toBe('Clickhouse');
  });

  it('черновик: название — имя вкладки как есть, описание — первая строка, текст — всё содержимое', () => {
    const sql = '\n-- Продажи\nSELECT 1\n';
    expect(buildSnippetDraft({ title: 'Запрос 3', sql }, { ...none, duckDbConnectedPath: ':memory:' })).toEqual({
      title: 'Запрос 3',
      description: '-- Продажи',
      sql,
      dialect: 'DuckDB',
    });
  });

  it('пустая вкладка — черновика нет', () => {
    expect(buildSnippetDraft({ title: 'Запрос 1', sql: '' }, none)).toBeNull();
    expect(buildSnippetDraft({ title: 'Запрос 1', sql: '  \n\t' }, none)).toBeNull();
  });

  it('описание при автозаполнении ограничено 400 символами, текст шаблона — нет', () => {
    expect(DRAFT_DESCRIPTION_MAX).toBe(400);
    const exactly = 'a'.repeat(400);
    expect(limitDescription(exactly)).toBe(exactly);
    const long = 'SELECT ' + 'x, '.repeat(300) + 'y FROM t';
    const cut = limitDescription(long);
    expect(Array.from(cut).length).toBeLessThanOrEqual(400);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    // суррогатные пары не разрезаются
    const emoji = '😀'.repeat(500);
    expect(Array.from(limitDescription(emoji)).length).toBe(400);
    const draft = buildSnippetDraft({ title: 'Q', sql: long }, none)!;
    expect(Array.from(draft.description).length).toBeLessThanOrEqual(400);
    expect(draft.sql).toBe(long);
  });
});
