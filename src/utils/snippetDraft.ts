// Черновик шаблона из вкладки редактора: заполненная форма «Новый собственный шаблон» (ПКМ по вкладке, сочетание клавиш).
import { canonicalDialect } from './snippetDialects';

/** Предел длины описания при автозаполнении (само поле формы не ограничено). */
export const DRAFT_DESCRIPTION_MAX = 400;

export interface SnippetDraft {
  title: string;
  description: string;
  sql: string;
  dialect: string;
}

export interface ConnectionState {
  activeEngine: 'duckdb' | 'clickhouse';
  /** Путь подключённой базы DuckDB (`:memory:` в браузере), null — не подключена. */
  duckDbConnectedPath: string | null;
  clickhouseConfig: unknown | null;
}

/** Первая непустая строка текста (без пробелов по краям); пустая строка, если текст пуст. */
export function firstLine(text: string): string {
  for (const line of (text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Обрезает автозаполняемое описание до DRAFT_DESCRIPTION_MAX символов (вместе с «…»); более короткий текст не меняется. */
export function limitDescription(text: string, max = DRAFT_DESCRIPTION_MAX): string {
  const chars = Array.from(text); // по символам, а не по парам суррогатов
  if (chars.length <= max) return text;
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

/**
 * Диалект по активному подключению: ClickHouse или DuckDB, без подключения — General.
 * Правило выбора движка то же, что у `isCH` в App: явно выбранный движок, а без подключения DuckDB — настроенный ClickHouse.
 */
export function dialectForConnection(c: ConnectionState): string {
  if (c.activeEngine === 'clickhouse') return c.clickhouseConfig ? canonicalDialect('Clickhouse') : 'General';
  if (c.duckDbConnectedPath) return canonicalDialect('DuckDB');
  return c.clickhouseConfig ? canonicalDialect('Clickhouse') : 'General';
}

/** Черновик из вкладки: название — имя вкладки, описание — первая строка, текст — всё содержимое. Пустая вкладка — null. */
export function buildSnippetDraft(tab: { title: string; sql: string }, connection: ConnectionState): SnippetDraft | null {
  if (!tab.sql || !tab.sql.trim()) return null;
  return {
    title: tab.title,
    description: limitDescription(firstLine(tab.sql)),
    sql: tab.sql,
    dialect: dialectForConnection(connection),
  };
}
