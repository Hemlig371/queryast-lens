// Открытие файла SQL: что делать с выбранным файлом (чистая логика, без DOM).

/** Предельный размер открываемого файла: больше — редактор тормозит; такой файл не читаем. */
export const MAX_OPEN_FILE_BYTES = 20 * 1024 * 1024;

export type OpenFileDecision =
  | { kind: 'open' }
  | { kind: 'activate'; tabId: string }
  | { kind: 'tooLarge' };

/**
 * Файл с тем же путём уже открыт → переключиться на его вкладку (путь сравнивается точно, без приведения регистра:
 * на Windows `C:\a.sql` и `C:\A.sql` разные строки, их не смешиваем). Нет пути (браузер) — дубликаты не определить.
 * Слишком большой файл → отказ.
 */
export function decideOpenFile(
  file: { size: number },
  filePath: string | undefined,
  tabs: ReadonlyArray<{ id: string; filePath?: string }>,
  maxBytes: number = MAX_OPEN_FILE_BYTES,
): OpenFileDecision {
  if (filePath) {
    const existing = tabs.find(tab => tab.filePath === filePath);
    if (existing) return { kind: 'activate', tabId: existing.id };
  }
  if (file.size > maxBytes) return { kind: 'tooLarge' };
  return { kind: 'open' };
}
