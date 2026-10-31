// Имя категории при создании/правке шаблона: служебные имена запрещены, английские названия встроенных категорий
// приводятся к хранимому русскому ключу (UI показывает перевод через t()).

const RESERVED = ['корзина', 'избранное', 'jobs', 'trash', 'favorites'];

const BUILTIN_EN_TO_KEY: Record<string, string> = {
  'queries': 'Запросы',
  'schemas': 'Схемы',
  'aggregates': 'Агрегаты',
  'joins (join)': 'Соединения (JOIN)',
  'joins': 'Соединения (JOIN)',
  'transactions': 'Транзакции',
  'general': 'Общие',
  'action menu': 'Меню действий',
};

export const isReservedCategoryName = (name: string): boolean => RESERVED.includes(name.trim().toLowerCase());

/**
 * Итоговая категория из введённого текста. `blocked` — имя служебное (Корзина, Избранное, Jobs, Trash, Favorites).
 * Пусто → «Общие». Английское имя встроенной категории заменяется русским ключом, только если категории
 * с точно таким же именем ещё нет (пользовательская `Queries` остаётся как есть).
 * `keepCategory` — прежняя категория редактируемого шаблона: её сохранение не блокируется.
 */
export function normalizeCategoryInput(
  input: string,
  existing: readonly string[],
  keepCategory?: string
): { category: string; blocked: boolean } {
  const name = input.trim();
  if (!name) return { category: 'Общие', blocked: false };
  if (keepCategory !== undefined && name === keepCategory) return { category: name, blocked: false };
  if (isReservedCategoryName(name)) return { category: name, blocked: true };
  if (existing.includes(name)) return { category: name, blocked: false };
  const key = BUILTIN_EN_TO_KEY[name.toLowerCase()];
  return { category: key ?? name, blocked: false };
}
