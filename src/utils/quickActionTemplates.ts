// Шаблоны быстрых действий (Ctrl+Q). Вынесено из SettingsModal.tsx без изменений логики,
// чтобы функцию можно было импортировать и проверять без компонентов и DOM.

export interface QuickActionTemplate {
  id: string;
  name: string;
  template: string;
}

export const DEFAULT_QUICK_ACTIONS: QuickActionTemplate[] = [
  {
    id: 'qa-1',
    name: 'Количество строк',
    template: 'SELECT COUNT(*) FROM {table};',
  },
  {
    id: 'qa-2',
    name: 'Структура таблицы',
    // DESCRIBE (SELECT …) допускает подзапрос, а `DESCRIBE (…) AS _sub` — нет (источник {table} приходит как `(…) AS _sub`)
    template: 'DESCRIBE (SELECT * FROM {table})',
  },
];

export function getQuickActionTemplates(): QuickActionTemplate[] {
  try {
    const raw = localStorage.getItem('sql_quick_action_templates');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load quick action templates', e);
  }
  return DEFAULT_QUICK_ACTIONS;
}
