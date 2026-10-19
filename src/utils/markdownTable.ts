// Таблица результата → таблица Markdown (GFM). Чистые функции без React.
// Используется кнопкой «Скопировать как Markdown»; TSV для Excel формируется отдельно и не меняется.
import { getResultColumns } from './resultRows';

/** Значение ячейки как текст: null → `null` (как в TSV), объекты и массивы → JSON. */
export function cellToText(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

/** Экранирование для ячейки: `|` не ломает таблицу, переводы строк → `<br>`. */
export function escapeMdCell(text: string): string {
  return text
    .replace(/\r\n|\r|\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

/** Столбец числовой, если все значения (кроме null/undefined) — number или bigint и такие значения есть. */
export function isNumericColumn(values: unknown[]): boolean {
  let seen = false;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v !== 'number' && typeof v !== 'bigint') return false;
    seen = true;
  }
  return seen;
}

/**
 * Собирает таблицу Markdown: строка заголовков, разделитель с выравниванием, строки данных.
 * `rightAlign[i]` — выровнять столбец вправо (`---:`). Нет столбцов — пустая строка.
 */
export function buildMarkdownTable(headers: string[], rows: string[][], rightAlign: boolean[] = []): string {
  if (headers.length === 0) return '';
  const line = (cells: string[]) => `| ${cells.map(escapeMdCell).join(' | ')} |`;
  const sep = `| ${headers.map((_, i) => (rightAlign[i] ? '---:' : '---')).join(' | ')} |`;
  return [line(headers), sep, ...rows.map(r => line(headers.map((_, i) => r[i] ?? '')))].join('\n');
}

/**
 * Таблица Markdown по строкам результата (как их видит таблица в приложении).
 * Обычный вид: столбцы результата без номера строки. Транспонированный: первый столбец — имя поля,
 * дальше по столбцу на строку результата (`#1`, `#2`, …; `firstRowNumber` — номер первой строки).
 */
export function resultRowsToMarkdown(
  rows: Record<string, unknown>[],
  opts: { transposed?: boolean; firstRowNumber?: number; fieldLabel?: string; columns?: readonly string[] | null } = {}
): string {
  if (!rows || rows.length === 0) return '';
  const cols = getResultColumns(rows, opts.columns);
  if (cols.length === 0) return '';
  if (opts.transposed) {
    const first = opts.firstRowNumber ?? 1;
    const headers = [opts.fieldLabel ?? 'Field', ...rows.map((_, i) => `#${first + i}`)];
    const body = cols.map(c => [c, ...rows.map(r => cellToText(r[c]))]);
    return buildMarkdownTable(headers, body);
  }
  const body = rows.map(r => cols.map(c => cellToText(r[c])));
  const align = cols.map(c => isNumericColumn(rows.map(r => r[c])));
  return buildMarkdownTable(cols, body, align);
}