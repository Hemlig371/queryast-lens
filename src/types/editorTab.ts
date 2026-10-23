import type { TableActionBlock } from '../utils/tableActionBlock';

// Вкладка SQL-редактора. Вынесено из App.tsx, чтобы утилиты и компоненты не импортировали App (циклические зависимости).
export interface EditorTab {
  id: string;
  title: string;
  sql: string;
  originalSql?: string;
  filePath?: string;
  savedContent?: string;
  isModified?: boolean;
  lastExecutedSql?: string;
  /** Последний блок, дописанный действием над таблицей (сортировка/фильтр заменяют друг друга, пока блок не тронут). */
  tableBlock?: TableActionBlock;
}
