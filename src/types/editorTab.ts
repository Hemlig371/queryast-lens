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
}
