// Выбор строк из таблицы Arrow (результат DuckDB-WASM) без материализации всей таблицы.

/** Минимальный вид таблицы Arrow: число строк и доступ по индексу. */
export interface RowSource<T = any> {
  numRows: number;
  get(index: number): T | null;
}

/** Первые `max` строк таблицы. В отличие от `table.toArray()` не создаёт объекты для остальных строк. */
export function takeTableRows<T>(table: RowSource<T>, max: number): T[] {
  const count = Math.min(table.numRows, max);
  const rows: T[] = [];
  for (let i = 0; i < count; i++) {
    const row = table.get(i);
    if (row !== null && row !== undefined) rows.push(row);
  }
  return rows;
}
