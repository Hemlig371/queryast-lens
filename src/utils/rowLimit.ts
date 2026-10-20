// Предел строк результата, который приложение готово держать в памяти. Одно значение для Tauri, WASM, ClickHouse и dev-сервера.
// Если строк больше, запрос заканчивается ошибкой (а не молча усечённым результатом).
export const MAX_RESULT_ROWS = 500000;

// Текст должен совпадать с ROW_LIMIT_ERROR в src-tauri/src/main.rs и ключом в EN_DICT (i18n.ts): ошибка переводится по точному совпадению.
export const ROW_LIMIT_MESSAGE = 'Результат больше 500 000 строк. Добавьте LIMIT или сохраните результат в файл через COPY.';

export function rowLimitMessage(): string {
  return ROW_LIMIT_MESSAGE;
}
