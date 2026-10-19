// Выбор нескольких столбцов в шапке таблицы результата (Shift — диапазон, Ctrl/Cmd — добавить/убрать).
// Чистая логика без React: порядок столбцов всегда как в результате, а не в порядке кликов.

/** Все столбцы от якоря до цели включительно (в порядке `allCols`). Нет якоря/цели в списке — только цель, если она есть. */
export function selectRange(allCols: string[], anchor: string | null, target: string): string[] {
  const t = allCols.indexOf(target);
  if (t < 0) return [];
  const a = anchor === null ? -1 : allCols.indexOf(anchor);
  if (a < 0) return [target];
  const from = Math.min(a, t);
  const to = Math.max(a, t);
  return allCols.slice(from, to + 1);
}

/**
 * Добавляет столбец к текущему выбору или убирает, если он уже выбран
 * (в том числе из середины диапазона). Результат — в порядке `allCols`.
 * `current` — действующий выбор (для одиночного выбора передайте `[столбец]`).
 */
export function toggleColumn(allCols: string[], current: string[], col: string): string[] {
  if (!allCols.includes(col)) return allCols.filter(c => current.includes(c));
  const set = new Set(current);
  if (set.has(col)) set.delete(col);
  else set.add(col);
  return allCols.filter(c => set.has(c));
}

/** Текст для Ctrl+C при выборе нескольких столбцов: имена через запятую (как в панели статистики). */
export function formatSelectedColumns(cols: string[]): string {
  return cols.join(', ');
}

export interface ColumnClickModifiers { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }

/**
 * Переход выбора столбцов по клику на шапку.
 * - обычный клик: выбран один столбец, он же якорь;
 * - Shift: диапазон от якоря до столбца (якорь не меняется; если якорь уже не в выборе — берётся первый выбранный);
 * - Ctrl/Cmd: добавить столбец или убрать (в том числе из середины диапазона), якорь = этот столбец.
 * Возвращает новый выбор (в порядке `allCols`) и новый якорь.
 */
export function reduceColumnClick(
  allCols: string[],
  current: string[],
  storedAnchor: string | null,
  mods: ColumnClickModifiers,
  col: string
): { selection: string[]; anchor: string | null } {
  if (mods.shiftKey) {
    const anchor = storedAnchor !== null && current.includes(storedAnchor) ? storedAnchor : (current[0] ?? null);
    return { selection: selectRange(allCols, anchor, col), anchor: anchor ?? col };
  }
  if (mods.ctrlKey || mods.metaKey) {
    return { selection: toggleColumn(allCols, current, col), anchor: col };
  }
  return { selection: [col], anchor: col };
}