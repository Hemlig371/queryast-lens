// Признак «вкладка изменена»: одно правило для всех мест, где меняется текст вкладки.
import type { EditorTab } from '../types/editorTab';

/**
 * Вкладка из файла (есть savedContent): изменена, если текст отличается от сохранённого — возврат к сохранённому
 * тексту снимает флаг. Вкладка без файла: любое изменение текста считается изменением.
 */
export function nextIsModified(tab: Pick<EditorTab, 'savedContent'>, newSql: string): boolean {
  return tab.savedContent !== undefined ? tab.savedContent !== newSql : true;
}

/** Новый список вкладок с обновлённым текстом и признаком у одной вкладки; остальные объекты те же. */
export function setTabSql(tabs: EditorTab[], tabId: string, newSql: string): EditorTab[] {
  return tabs.map((t) => {
    if (t.id !== tabId || t.sql === newSql) return t;
    return { ...t, sql: newSql, isModified: nextIsModified(t, newSql) };
  });
}

/** При закрытии вкладки подтверждение нужно только для изменённой. */
export function shouldConfirmClose(tab: Pick<EditorTab, 'isModified'> | undefined | null): boolean {
  return !!tab?.isModified;
}

export type FormatOutcome = { ok: true; text: string } | { ok: false; error: Error };

/** Запуск форматтера с явным признаком успеха: «отформатировано» показывается только при ok. */
export async function formatWithFeedback(text: string, doFormat: (text: string) => Promise<string>): Promise<FormatOutcome> {
  try {
    const formatted = await doFormat(text);
    if (typeof formatted !== 'string') return { ok: false, error: new Error('Formatter returned no text') };
    return { ok: true, text: formatted };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
