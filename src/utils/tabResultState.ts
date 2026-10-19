// Обновление записи результата вкладки (вынесено из updateEngineState, ветка «вкладка не активна»; п. 3.4, B-08).
import type { TabResultData } from './resultStorage';

export interface EngineUpdates {
  results?: any[] | null;
  error?: string | null;
  duration?: string | null;
  colTypes?: any;
  /** Порядок столбцов результата (п. 3.2). Относится к results: пришли результаты без columns — прежний порядок сбрасывается. */
  columns?: string[] | null;
}

/** Запись нужно сохранить, только если менялся результат или ошибка (одно только время выполнения не сохраняется). */
export function shouldPersistTabResult(updates: EngineUpdates): boolean {
  return updates.results !== undefined || updates.error !== undefined;
}

/** Новая запись результата вкладки; исходная запись не меняется. */
export function mergeTabResult(
  existing: TabResultData | null,
  updates: EngineUpdates,
  ctx: { queryToExec: string; page: number }
): TabResultData {
  const next: TabResultData = existing
    ? { ...existing }
    : {
        duckDbResults: null,
        queryExecutionDuration: null,
        resultColumnTypes: {},
        resultColumns: null,
        isDuckDbResultVisible: false,
        duckDbPage: 1,
        duckDbError: null,
        lastExecutedSql: ctx.queryToExec,
      };
  if (updates.results !== undefined) {
    next.duckDbResults = updates.results;
    next.resultColumns = updates.columns ?? null;
  }
  if (updates.error !== undefined) next.duckDbError = updates.error;
  if (updates.duration !== undefined) next.queryExecutionDuration = updates.duration;
  if (updates.colTypes !== undefined) next.resultColumnTypes = updates.colTypes;
  next.lastExecutedSql = ctx.queryToExec;
  next.duckDbPage = ctx.page;
  if (shouldPersistTabResult(updates) && updates.results !== null && updates.error !== null) {
    next.isDuckDbResultVisible = true;
  }
  return next;
}
