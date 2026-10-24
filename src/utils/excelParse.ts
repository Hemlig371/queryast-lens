/**
 * Разбор строк для Excel-экспорта (отдельно от excelExporter.ts, чтобы тестировать без exceljs).
 */

import { splitSqlSegments } from './sqlTokens';

// Дата-время без часового пояса: 2024-05-01 14:30:00, 2024-05-01T14:30, 2024-05-01 14:30:00.123
const DATETIME_NO_TZ = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const DATETIME_PREFIX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
// Дата-время с коротким смещением без минут (DuckDB TIMESTAMPTZ): 2024-05-01 10:00:00+03, 2024-05-01 10:00:00.5-05
const DATETIME_SHORT_OFFSET = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/;

/**
 * Превращает значение столбца даты/времени в Date для exceljs.
 * exceljs записывает Date в файл как UTC, поэтому строка без часового пояса (DuckDB TIMESTAMP)
 * разбирается как UTC — иначе в Excel время сдвигается на часовой пояс браузера
 * (в Москве 14:30 превращалось в 11:30). Строки с явным поясом (Z, +03:00) разбираются как есть.
 */
export function parseExcelDate(val: string | number): Date {
  if (typeof val === 'string') {
    const s = val.trim();
    const shortOffset = DATETIME_SHORT_OFFSET.exec(s);
    if (shortOffset) {
      // «+03» не понимает Date.parse: приводим к «+03:00»
      return new Date(`${shortOffset[1]}T${shortOffset[2]}${shortOffset[3]}:00`);
    }
    if (DATETIME_NO_TZ.test(s)) {
      return new Date(s.replace(' ', 'T') + 'Z');
    }
    if (DATETIME_PREFIX.test(s)) {
      return new Date(s.replace(' ', 'T'));
    }
  }
  return new Date(val);
}

/**
 * Склеивает блочные комментарии /* ... *\/ SQL-запроса для разбора директив (@preset, # Заголовок и т.д.),
 * снимая ограничители комментария — иначе "*\/" остаётся в тексте заголовка.
 */
export function extractExcelComments(sqlQuery: string): string {
  const blocks = sqlQuery.match(/\/\*[\s\S]*?\*\//g) || [];
  return blocks.map(b => b.slice(2, -2)).join('\n');
}

/**
 * Имя файла экспорта из директивы @file (или настройки): без расширения .xlsx (его добавляет экспорт)
 * и без символов, недопустимых в именах файлов (\\ / : * ? " < > |). Пустой результат заменяется на fallback.
 */
export function sanitizeExportFileBase(name: string, fallback: string): string {
  const withoutExt = (name || '').trim().replace(/\.xlsx$/i, '');
  const clean = withoutExt.replace(/[\\/:*?"<>|]/g, '_').trim();
  return clean || fallback;
}

/**
 * В запросе есть директива автоэкспорта `@excel_save: <путь>` в блочном комментарии.
 * Упоминание в строке (`WHERE x = '@excel_save'`), в `-- комментарии` или директива без пути не считаются.
 */
export function hasExcelSaveDirective(sqlQuery: string): boolean {
  if (!sqlQuery || !sqlQuery.includes('@excel_save')) return false;
  const blocks = splitSqlSegments(sqlQuery, { backslashEscapes: false })
    .filter((seg) => seg.type === 'block-comment' && seg.text.endsWith('*/') && seg.text.length >= 4)
    .map((seg) => seg.text.slice(2, -2));
  const m = blocks.join('\n').match(/@excel_save:\s*([^@\r\n*]+)/i);
  return !!m && m[1].trim() !== '';
}
