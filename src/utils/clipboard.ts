// Запись в буфер обмена с запасным путём. Чистая логика с явными зависимостями (для тестов).

/** Способы записи в буфер: Tauri (если приложение запущено в нём) и обычный веб-путь. Явные зависимости — для тестов. */
export interface ClipboardDeps {
  isTauri: boolean;
  tauriWrite: (text: string) => Promise<void>;
  webWrite: (text: string) => Promise<void>;
}

/** Пишет текст в буфер: сначала Tauri (если есть), при сбое — веб-путь. true — записано, false — оба пути отказали. */
export async function copyTextWith(text: string, deps: ClipboardDeps): Promise<boolean> {
  if (deps.isTauri) {
    try {
      await deps.tauriWrite(text);
      return true;
    } catch (e) {
      console.warn("Tauri clipboard failed, falling back to web:", e);
    }
  }
  try {
    await deps.webWrite(text);
    return true;
  } catch (err) {
    console.error("Clipboard write failed:", err);
    return false;
  }
}
