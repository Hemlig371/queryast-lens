import { t } from '../utils/i18n';

export interface AutocompleteTemplate {
  id: string;
  keyword: string;
  insertion?: string;
  description?: string;
}

export const DEFAULT_AUTOCOMPLETE_TEMPLATES: AutocompleteTemplate[] = [
  { id: 'tpl-1', keyword: 'SELECT * FROM', insertion: 'SELECT * FROM ', description: t('Базовая выборка из таблицы') },
  { id: 'tpl-2', keyword: 'LEFT JOIN', insertion: 'LEFT JOIN ', description: t('Левое соединение таблиц') },
  { id: 'tpl-3', keyword: 'GROUP BY', insertion: 'GROUP BY ', description: t('Группировка по полю') },
  { id: 'tpl-4', keyword: 'ORDER BY', insertion: 'ORDER BY ', description: t('Сортировка по полю') },
  { id: 'tpl-5', keyword: 'COUNT(DISTINCT)', insertion: 'COUNT(DISTINCT )', description: t('Подсчет уникальных значений') },
];

export const getCustomAutocompleteTemplates = (): AutocompleteTemplate[] => {
  try {
    const raw = localStorage.getItem('sql_custom_autocomplete_templates');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((t: any) => t && typeof t.keyword === 'string');
      }
    }
  } catch (e) {
    console.error('Failed to load custom templates', e);
  }
  return DEFAULT_AUTOCOMPLETE_TEMPLATES;
};

// Common SQL Keywords and Functions for Autocomplete
export const SQL_KEYWORDS = [
  'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'INNER JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'LIKE', 'ILIKE', 'QUALIFY',
  'RETURNING', 'BETWEEN', 'EXISTS', 'RECURSIVE', 'UNION ALL', 'INSERT INTO',
  'VALUES', 'UPDATE', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
  'TRUNCATE TABLE', 'PARTITION BY', 'DENSE_RANK()', 'RANK()', 'COUNT(*)', 'SUM()',
  'AVG()', 'MIN()', 'MAX()', 'COALESCE()', 'DATE_TRUNC()', 'DISTINCT',
  'ENGINE', 'SETTINGS', 'BEGIN TRANSACTION', 'COMMIT', 'ROLLBACK', 'ABORT'
];
