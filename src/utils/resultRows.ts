// Строки результата как объекты.
//
// Приложение держит результат как массив объектов `{имя_столбца: значение}`. У такого представления два изъяна:
//  1. одинаковые имена (`SELECT 1 AS a, 2 AS a`) схлопываются в один ключ — значения пропадают;
//  2. JS перечисляет целочисленные ключи ('1', '2') по возрастанию и раньше остальных, порядок столбцов теряется.
// Компромисс: имена столбцов делаются уникальными (`a`, `a_1`, …), а настоящий порядок передаётся отдельным списком `columns`.
// Потребители (таблица, TSV, Markdown, Excel, статистика) берут порядок через `getResultColumns`.

/** Делает имена уникальными: повтор получает суффикс `_1`, `_2`, … (не совпадающий ни с одним настоящим именем). */
export function uniqueColumnNames(names: readonly unknown[]): string[] {
  const original = names.map((n) => String(n));
  const reserved = new Set(original);
  const used = new Set<string>();
  return original.map((name) => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    // нумерация с `_1`, как в DuckDB для `SELECT * FROM (SELECT 1 a, 2 a)` (`a, a_1`): иначе после сортировки/фильтра имена столбцов меняются
    let k = 1;
    let candidate = `${name}_${k}`;
    while (reserved.has(candidate) || used.has(candidate)) {
      k++;
      candidate = `${name}_${k}`;
    }
    used.add(candidate);
    return candidate;
  });
}

/**
 * Запись `obj[key] = value`, безопасная для ключа `__proto__`: обычное присваивание ему не создаёт свойство,
 * и потом `obj['__proto__']` возвращает Object.prototype вместо значения.
 */
export function setOwnKey<T>(obj: Record<string, T>, key: string, value: T): void {
  if (key === '__proto__') Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
  else obj[key] = value;
}

/** Строки-массивы (Tauri: `columns` + `rows`) → объекты с уникальными ключами и список столбцов в порядке выдачи. */
export function rowsFromColumns(
  columnNames: readonly unknown[],
  rows: readonly (readonly unknown[])[]
): { columns: string[]; rows: Record<string, any>[] } {
  const columns = uniqueColumnNames(columnNames);
  const out = rows.map((row) => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < columns.length; i++) {
      const key = columns[i];
      setOwnKey(obj, key, row[i]);
    }
    return obj;
  });
  return { columns, rows: out };
}

/**
 * Столбцы результата в порядке выдачи. `columns` принимаются, только если это ровно те же имена, что и ключи первой строки
 * (иначе список мог остаться от другого результата) — тогда берутся ключи первой строки.
 */
export function getResultColumns(rows: readonly unknown[] | null | undefined, columns?: readonly string[] | null): string[] {
  const first = rows && rows.length > 0 ? rows[0] : null;
  if (!first || typeof first !== 'object') return [];
  const keys = Object.keys(first as object);
  if (columns && columns.length === keys.length) {
    const keySet = new Set(keys);
    if (columns.every((c) => keySet.has(c)) && new Set(columns).size === columns.length) return columns.slice();
  }
  return keys;
}

/** Имена столбцов из `meta` ответа ClickHouse / dev-сервера (`[{name, type}]`) или null, если их нет. */
export function columnsFromMeta(meta: unknown): string[] | null {
  if (!Array.isArray(meta) || meta.length === 0) return null;
  const names: string[] = [];
  for (const col of meta) {
    if (!col || typeof col !== 'object' || typeof (col as any).name !== 'string') return null;
    names.push((col as any).name);
  }
  return names;
}
