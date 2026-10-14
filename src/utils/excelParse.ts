/**
 * Разбор строк для Excel-экспорта (вынесено из excelExporter.ts, чтобы тестировать без exceljs).
 */

// Дата-время без часового пояса: 2024-05-01 14:30:00, 2024-05-01T14:30, 2024-05-01 14:30:00.123
const DATETIME_NO_TZ = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const DATETIME_PREFIX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

/**
 * Превращает значение столбца даты/времени в Date для exceljs.
 * exceljs записывает Date в файл как UTC, поэтому строка без часового пояса (DuckDB TIMESTAMP)
 * разбирается как UTC — иначе в Excel время сдвигается на часовой пояс браузера
 * (в Москве 14:30 превращалось в 11:30). Строки с явным поясом (Z, +03:00) разбираются как есть.
 */
export function parseExcelDate(val: string | number): Date {
  if (typeof val === 'string') {
    const s = val.trim();
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
