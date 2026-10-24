// Текст значения ячейки результата для таблицы, копирования, поиска и статистики.
// Объекты и массивы показываются как JSON (а не «1,2» и «[object Object]»).

const bigintReplacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);

export function formatCellValue(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val === null || typeof val !== 'object') return String(val); // null, undefined, числа, bigint, boolean, функции
  if (val instanceof Date) return String(val); // дата не превращается в JSON-строку в кавычках
  try {
    // типизированные массивы (BLOB и т.п.) JSON.stringify превращает в объект с индексами; показываем как массив
    const json = ArrayBuffer.isView(val) && !(val instanceof DataView)
      ? JSON.stringify(Array.from(val as unknown as ArrayLike<number | bigint>), bigintReplacer)
      : JSON.stringify(val, bigintReplacer);
    return json === undefined ? String(val) : json;
  } catch {
    return String(val); // круговая ссылка и т.п.
  }
}
