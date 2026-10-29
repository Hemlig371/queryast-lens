// Построение запроса для страницы результата.
//
// Чистая функция: строки и комментарии маскируются (sqlTokens), LIMIT и служебные слова ищутся только вне скобок,
// LIMIT вставляется перед `;`, SETTINGS и FORMAT, подготовительные операторы выполняются только на странице 1.

import { splitBySemicolonIgnoringQuotes } from '../lib/sqlUtils';
import { maskSql, splitSqlSegments } from './sqlTokens';

export type SqlDialect = 'duckdb' | 'clickhouse';
export type ExecutionMode = 'sequential' | 'parallel';

export interface BuildPagedSqlOptions {
  /** Номер страницы, с 1. */
  page: number;
  /** Размер страницы (Max rows). 0 и меньше — без ограничения, листание недоступно. */
  pageSize: number;
  dialect: SqlDialect;
  /** Режим, в котором скрипт был запущен на странице 1. Не задан — обычный запуск. */
  mode?: ExecutionMode;
}

export interface PagedSql {
  /** Операторы, которые нужно выполнить по одному до основного (только режим sequential, только страница 1). */
  setup: string[];
  /** Основной запрос страницы. Пустой, если `skip`. */
  main: string;
  /** Последний оператор — запрос на чтение (SELECT / WITH / FROM), его можно листать. */
  pageable: boolean;
  /** Страницу ≥ 2 выполнять нельзя (нечего листать): вызывающий не должен ничего запускать. */
  skip: boolean;
}

const maskFor = (sql: string, dialect: SqlDialect): string => maskSql(sql, { backslashEscapes: dialect === 'clickhouse' });

const isBlankMask = (piece: string): boolean => maskSql(piece).trim() === '';

/** Операторы скрипта по `;` (вне строк и комментариев); куски из одних комментариев и пробелов отбрасываются. */
export function splitStatements(sql: string): string[] {
  return splitBySemicolonIgnoringQuotes(sql || '')
    .filter((piece) => !isBlankMask(piece))
    .map((piece) => piece.trim());
}

// То же правило, что FORMAT_AT_END в clickhouseFormat.ts: `FORMAT <имя>` в конце оператора (после него допускается хвост SETTINGS).
const FORMAT_AT_END = /\bFORMAT\s+(?!(?:ASC|DESC|ASCENDING|DESCENDING)\b)([A-Za-z_]\w*)(?:\s+SETTINGS\b[\s\S]*)?$/i;
const SETTINGS_CLAUSE = /\bSETTINGS\s+[A-Za-z_]\w*\s*=/i;
const PAGEABLE_HEAD = /^\s*\(?\s*(SELECT|WITH|FROM)\b/i;
// в DuckDB `TABLE t`, `VALUES (…)` и `PIVOT …` тоже запросы на чтение. Дописанный в конец LIMIT они принимают не везде
// (после PIVOT … GROUP BY, внутри VALUES со скобками), поэтому такие запросы всегда оборачиваются в подзапрос (проверено в DuckDB 1.5.5).
const DUCKDB_EXTRA_HEAD = /^\s*\(?\s*(TABLE|VALUES|PIVOT)\b/i;
// оператор начинается с WITH — после списка CTE (в `topLevelOnly` скобки уже пусты) идёт `[имя] AS [NOT] [MATERIALIZED] [,]`,
// затем ключевое слово основного оператора.
const WITH_CTE_LIST = /^\s*WITH\b\s*(?:RECURSIVE\b\s*)?(?:(?:[A-Za-z_]\w*\s+)?AS\b\s*(?:NOT\b\s*)?(?:MATERIALIZED\b\s*)?,?\s*)*/i;
const WITH_WRITE_KEYWORD = /^(INSERT|UPDATE|DELETE|MERGE|COPY|CREATE)\b/i;
// `FETCH FIRST n ROWS ONLY` / `FETCH NEXT …` — собственное ограничение числа строк, как LIMIT.
const FETCH_LIMIT = /\bFETCH\s+(?:FIRST|NEXT)\b/i;
const LIMIT_BY_TAIL = /^\s*(?:\d+\s*)?(?:(?:,|OFFSET)\s*\d+\s*)?BY\b/i;

interface StatementInfo {
  pageable: boolean;
  /** Запрос всегда оборачивается в подзапрос (TABLE / VALUES / PIVOT в DuckDB). */
  alwaysWrap: boolean;
  hasLimit: boolean;
  hasOffset: boolean;
  hasSetOp: boolean;
  /** Конец кода: дальше только пробелы и комментарии. */
  codeEnd: number;
  /** Начало хвоста SETTINGS/FORMAT (ClickHouse) или -1. */
  clauseTail: number;
}

/** Текст той же длины, где всё внутри скобок (вместе со скобками) заменено пробелами: остаётся верхний уровень запроса. */
function topLevelOnly(masked: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(') { depth++; out += ' '; }
    else if (c === ')') { depth = Math.max(0, depth - 1); out += ' '; }
    else out += depth > 0 && c !== '\n' ? ' ' : c;
  }
  return out;
}

/** Позиция сразу после последнего значимого символа: код или строка (строка в маске — пробелы, поэтому маска не годится). */
function codeEndIndex(sql: string, dialect: SqlDialect): number {
  let pos = 0;
  let end = 0;
  for (const seg of splitSqlSegments(sql, { backslashEscapes: dialect === 'clickhouse' })) {
    if (seg.type === 'string') end = pos + seg.text.length;
    else if (seg.type === 'code') {
      const trimmed = seg.text.trimEnd();
      if (trimmed.trim() !== '') end = pos + trimmed.length;
    }
    pos += seg.text.length;
  }
  return end;
}

function analyzeStatement(stmt: string, dialect: SqlDialect): StatementInfo {
  const masked = maskFor(stmt, dialect);
  const flat = topLevelOnly(masked);
  const codeEnd = codeEndIndex(stmt, dialect);
  const code = flat.slice(0, codeEnd);

  // `WITH … INSERT/UPDATE/DELETE/…` читает не данные, а меняет их; дописанный LIMIT здесь недопустим или обрезает вставку
  const afterWith = WITH_CTE_LIST.exec(flat);
  const withWrites = afterWith !== null && WITH_WRITE_KEYWORD.test(flat.slice(afterWith[0].length));

  let hasLimit = FETCH_LIMIT.test(code);
  const limitRe = /\bLIMIT\b/gi;
  let m: RegExpExecArray | null;
  while (!hasLimit && (m = limitRe.exec(code)) !== null) {
    // ClickHouse: `LIMIT n BY col` — не ограничение числа строк
    if (dialect === 'clickhouse' && LIMIT_BY_TAIL.test(code.slice(m.index + m[0].length))) continue;
    hasLimit = true;
    break;
  }

  let clauseTail = -1;
  if (dialect === 'clickhouse') {
    const settings = SETTINGS_CLAUSE.exec(code);
    const format = FORMAT_AT_END.exec(code);
    const candidates = [settings?.index ?? -1, format?.index ?? -1].filter((x) => x >= 0);
    if (candidates.length > 0) clauseTail = Math.min(...candidates);
  }

  const extraHead = dialect === 'duckdb' && DUCKDB_EXTRA_HEAD.test(masked);
  return {
    pageable: (PAGEABLE_HEAD.test(masked) || extraHead) && !withWrites,
    alwaysWrap: extraHead,
    hasLimit,
    hasOffset: /\bOFFSET\b/i.test(code),
    hasSetOp: /\b(UNION|EXCEPT|INTERSECT)\b/i.test(code),
    codeEnd,
    clauseTail,
  };
}

/** У последнего оператора есть собственный LIMIT верхнего уровня (LIMIT внутри подзапросов, CTE, строк и комментариев не считается). */
export function hasOwnRowLimit(sql: string, dialect: SqlDialect): boolean {
  const statements = splitStatements(sql);
  if (statements.length === 0) return false;
  return analyzeStatement(statements[statements.length - 1], dialect).hasLimit;
}

/** Оператор, превращённый в запрос страницы. Для страницы 1 с собственным LIMIT возвращается без изменений. */
function pageStatement(stmt: string, info: StatementInfo, page: number, pageSize: number): string {
  if (info.hasLimit && page === 1) return stmt;

  const wrap = info.alwaysWrap || info.hasSetOp || (page > 1 && (info.hasLimit || info.hasOffset));
  const code = stmt.slice(0, info.codeEnd);
  const trailing = stmt.slice(info.codeEnd); // пробелы и комментарии после кода
  const inner = info.clauseTail >= 0 ? code.slice(0, info.clauseTail).trimEnd() : code;
  const outerTail = info.clauseTail >= 0 ? code.slice(info.clauseTail) : '';
  const limitClause = `LIMIT ${pageSize}${page > 1 ? ` OFFSET ${(page - 1) * pageSize}` : ''}`;
  const body = wrap
    ? `SELECT * FROM (\n${inner}\n) AS _limited_subquery ${limitClause}`
    : `${inner}\n${limitClause}`;
  return body + (outerTail ? `\n${outerTail}` : '') + trailing;
}

/**
 * Запрос для страницы `page`.
 *
 * - Листается только ПОСЛЕДНИЙ оператор скрипта (SELECT / WITH / FROM). Комментарии после последней `;` оператором не считаются.
 * - Страница ≥ 2: подготовительные операторы (CREATE, INSERT, SET …) не выполняются повторно; если последний оператор не листается,
 *   возвращается `skip: true` и ничего выполнять не нужно (иначе INSERT выполнился бы второй раз).
 * - Обычный запуск, страница 1: весь текст, у последнего оператора добавлен LIMIT.
 * - Режим sequential, страница 1: подготовительные операторы отдельно в `setup`, в `main` — последний оператор.
 * - Режим parallel: листания нет.
 */
export function buildPagedSql(sql: string, opts: BuildPagedSqlOptions): PagedSql {
  const page = Number.isFinite(opts.page) ? Math.max(1, Math.floor(opts.page)) : 1;
  const pageSize = Number.isFinite(opts.pageSize) ? Math.max(0, Math.floor(opts.pageSize)) : 0;
  const text = (sql || '').trim();
  const nothing = (): PagedSql => ({ setup: [], main: '', pageable: false, skip: true });

  if (opts.mode === 'parallel') {
    return page > 1 ? nothing() : { setup: [], main: text, pageable: false, skip: false };
  }

  const pieces = splitBySemicolonIgnoringQuotes(text);
  let lastIdx = -1;
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (!isBlankMask(pieces[i])) { lastIdx = i; break; }
  }
  if (lastIdx < 0) {
    return page > 1 ? nothing() : { setup: [], main: text, pageable: false, skip: false };
  }

  const statements = splitStatements(text);
  const last = statements[statements.length - 1];
  const setupStatements = statements.slice(0, -1);
  const info = analyzeStatement(last, opts.dialect);
  const pageable = info.pageable && pageSize > 0;

  if (page > 1 && !pageable) return nothing();

  const paged = pageable ? pageStatement(last, info, page, pageSize) : last;

  if (opts.mode === 'sequential') {
    return { setup: page === 1 ? setupStatements : [], main: paged, pageable, skip: false };
  }

  // обычный запуск
  if (page > 1) return { setup: [], main: paged, pageable, skip: false };
  if (paged === last) return { setup: [], main: text, pageable, skip: false };
  if (statements.length === 1) return { setup: [], main: paged, pageable, skip: false };
  const prefix = `${pieces.slice(0, lastIdx).join(';')};`;
  return { setup: [], main: `${prefix}\n${paged}`, pageable, skip: false };
}
