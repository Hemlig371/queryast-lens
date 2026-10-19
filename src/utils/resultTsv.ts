// Копирование результата как TSV (вынесено из App.tsx без изменения формата; B-16 «TSV без кавычек» оставлен).
import { getResultColumns } from './resultRows';

export interface ResultTsvOptions {
  /** Транспонировать: строка на поле, столбец на строку результата. */
  transposed?: boolean;
  /** Номер первой строки результата (с учётом страницы). */
  firstRowNumber: number;
  /** Подпись первого столбца при транспонировании. */
  fieldLabel: string;
  /** Порядок столбцов (п. 3.2); не задан или не подходит — ключи первой строки. */
  columns?: readonly string[] | null;
}

const cell = (v: unknown): string => (v === null ? 'null' : String(v));

export function resultRowsToTsv(rows: Record<string, any>[], opts: ResultTsvOptions): string {
  if (!rows || rows.length === 0) return '';
  const cols = getResultColumns(rows, opts.columns);
  if (opts.transposed) {
    const headers = [opts.fieldLabel, ...rows.map((_, i) => `#${opts.firstRowNumber + i}`)];
    const body = cols.map((colKey) => [colKey, ...rows.map((r) => cell(r[colKey]))]);
    return [headers.join('\t'), ...body.map((r) => r.join('\t'))].join('\n');
  }
  const headers = ['#', ...cols];
  const body = rows.map((r, i) => [opts.firstRowNumber + i, ...cols.map((c) => cell(r[c]))]);
  return [headers.join('\t'), ...body.map((r) => r.join('\t'))].join('\n');
}
