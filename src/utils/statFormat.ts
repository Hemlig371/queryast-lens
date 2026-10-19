// Чистые функции графиков статистики (DataStatsViewer): формат чисел, значение для графика, выбор «Топ-N».

export type StatSortMode = 'alphabet' | 'desc' | 'asc';

/**
 * Текст значения в карточках статистики. Форматируются только настоящие числа (`typeof number`):
 * строки вроде "00123", "0x10" или "12345678901234567890" остаются как есть (раньше приводились к Number и портились).
 * Пусто / NaN → null.
 */
export function formatStatVal(val: unknown, locale?: string): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') {
    if (isNaN(val)) return null;
    if (Number.isInteger(val)) return val.toLocaleString(locale);
    return Number(val.toFixed(2)).toLocaleString(locale);
  }
  return String(val);
}

/**
 * Число для оси значений графика или null, если значение не число (null, '', текст, boolean).
 * Числовые строки принимаются: ClickHouse отдаёт UInt64 и Decimal строками.
 */
export function toChartNumber(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** Новый массив, упорядоченный по режиму: алфавит, значение по убыванию или по возрастанию (при равенстве — по имени). */
export function sortStatItems<T extends { name: string; value: number }>(items: readonly T[], sortMode: StatSortMode): T[] {
  const out = [...items];
  out.sort((a, b) => {
    if (sortMode === 'desc') return b.value - a.value || byName(a, b);
    if (sortMode === 'asc') return a.value - b.value || byName(a, b);
    return byName(a, b);
  });
  return out;
}

/**
 * «Топ-N»: при режиме «по алфавиту» берутся N крупнейших по значению (а не первые N по алфавиту),
 * затем они упорядочиваются по алфавиту. Режимы desc/asc обрезают уже отсортированный по значению список.
 */
export function selectTopN<T extends { name: string; value: number }>(items: readonly T[], limit: number, sortMode: StatSortMode): T[] {
  if (sortMode === 'alphabet' && items.length > limit) {
    const largest = sortStatItems(items, 'desc').slice(0, limit);
    return sortStatItems(largest, 'alphabet');
  }
  return sortStatItems(items, sortMode).slice(0, limit);
}
