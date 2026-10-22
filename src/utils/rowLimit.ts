// Предел строк результата, который приложение готово держать в памяти. Одно значение для Tauri, WASM, ClickHouse и dev-сервера.
// Если строк больше, запрос заканчивается ошибкой (а не молча усечённым результатом).
export const MAX_RESULT_ROWS = 500000;

// Текст должен совпадать с ROW_LIMIT_ERROR в src-tauri/src/main.rs и ключом в EN_DICT (i18n.ts): ошибка переводится по точному совпадению.
export const MAX_PAGE_ROWS = 50000;
export const DEFAULT_PAGE_ROWS = 100;

export function clampPageRows(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_ROWS;
  return Math.min(Math.floor(n), MAX_PAGE_ROWS);
}

export const ROW_LIMIT_MESSAGE = 'Результат больше 500 000 строк. Добавьте LIMIT или сохраните результат в файл через COPY.';

export function rowLimitMessage(): string {
  return ROW_LIMIT_MESSAGE;
}
