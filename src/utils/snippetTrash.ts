// «Корзина» библиотеки шаблонов: удалённый шаблон перемещается в категорию «Корзина», прежняя категория
// записывается первой строкой SQL (`-- trashedFrom: <категория>`), нового поля у шаблона нет.

export const TRASH_CATEGORY = 'Корзина';

const TRASHED_FROM_RE = /^-- trashedFrom: ?([^\r\n]*)(?:\r?\n|$)/;

interface SnippetLike {
  category: string;
  sql: string;
}

export const isTrashed = (s: { category: string }): boolean => s.category === TRASH_CATEGORY;

/** Прежняя категория из первой строки `-- trashedFrom: …` или null. */
export const getTrashedFrom = (sql: string): string | null => {
  const m = TRASHED_FROM_RE.exec(sql);
  if (!m) return null;
  const from = m[1].trim();
  return from === '' ? null : from;
};

/** Шаблон, перемещённый в «Корзину»: категория «Корзина», первой строкой SQL — прежняя категория. Уже лежащий в «Корзине» не меняется. */
export function trashSnippet<T extends SnippetLike>(s: T): T {
  if (isTrashed(s)) return s;
  return { ...s, category: TRASH_CATEGORY, sql: `-- trashedFrom: ${s.category}\n${s.sql}` };
}

/** Обратное действие: категория возвращается, первая строка `-- trashedFrom` убирается. Без такой строки шаблон не меняется. */
export function restoreFromTrash<T extends SnippetLike>(s: T): T {
  const from = getTrashedFrom(s.sql);
  if (!isTrashed(s) || from === null) return s;
  return { ...s, category: from, sql: s.sql.replace(TRASHED_FROM_RE, '') };
}

/** Список без шаблонов из «Корзины» (для любого экспорта: JSON, ZIP, файл настроек и синхронизации). */
export function withoutTrash<T extends { category: string }>(list: readonly T[]): T[] {
  return list.filter(s => !isTrashed(s));
}
