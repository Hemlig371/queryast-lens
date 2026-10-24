// Действия над столбцами результата (пункты контекстного меню шапки таблицы).
// Чистые функции: на входе уже готовый SQL (после фильтров таблицы) и список столбцов,
// на выходе SQL, который оборачивает исходный запрос подзапросом `_sub`.
// Синтаксис стандартный и одинаковый для DuckDB и ClickHouse: имена в двойных кавычках,
// явный список столбцов (без EXCLUDE/EXCEPT, которые различаются между движками).
// Пустая строка в ответе = «делать нечего» (вызывающий код ничего не выполняет).

/** Имя столбца в двойных кавычках (внутренние `"` удваиваются). */
export const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/** Убирает повторы, сохраняя порядок первого вхождения. */
const uniq = (cols: string[]): string[] => Array.from(new Set(cols));

const wrapSub = (selectPart: string, baseSql: string): string =>
  `${selectPart}\nFROM (\n  ${baseSql}\n) AS _sub`;

/**
 * GROUP BY по выбранным столбцам со счётчиком строк.
 * Для одного столбца:
 * `SELECT "x", COUNT(*) AS count FROM (...) AS _sub GROUP BY 1 ORDER BY 2 DESC`.
 */
export function buildGroupBySql(baseSql: string, cols: string[]): string {
  const list = uniq(cols);
  if (!baseSql.trim() || list.length === 0) return '';
  const select = `SELECT ${list.map(quoteIdent).join(', ')}, COUNT(*) AS count`;
  const positions = list.map((_, i) => i + 1).join(', ');
  return `${wrapSub(select, baseSql)}\nGROUP BY ${positions}\nORDER BY ${list.length + 1} DESC`;
}

/** Оставить только выбранные столбцы. */
export function buildKeepColumnsSql(baseSql: string, cols: string[]): string {
  const list = uniq(cols);
  if (!baseSql.trim() || list.length === 0) return '';
  return wrapSub(`SELECT ${list.map(quoteIdent).join(', ')}`, baseSql);
}

/**
 * Исключить выбранные столбцы: остаются все остальные из `allCols` (в их порядке).
 * Пустая строка, если нечего исключать или исключены все столбцы.
 */
export function buildRemoveColumnsSql(baseSql: string, allCols: string[], removeCols: string[]): string {
  if (!baseSql.trim()) return '';
  const all = uniq(allCols);
  const remove = new Set(removeCols);
  const rest = all.filter(c => !remove.has(c));
  if (rest.length === 0 || rest.length === all.length) return '';
  return wrapSub(`SELECT ${rest.map(quoteIdent).join(', ')}`, baseSql);
}

/** Уникальные значения (комбинации значений) по выбранным столбцам. */
export function buildDistinctSql(baseSql: string, cols: string[]): string {
  const list = uniq(cols);
  if (!baseSql.trim() || list.length === 0) return '';
  return wrapSub(`SELECT DISTINCT ${list.map(quoteIdent).join(', ')}`, baseSql);
}