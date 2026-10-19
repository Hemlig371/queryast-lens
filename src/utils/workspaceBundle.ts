// Пакет настроек рабочего пространства (файл «Экспорт» в настройках и файл синхронизации).

export const WORKSPACE_BUNDLE_APP = 'QueryAST Lens Workspace Bundle';

/**
 * Файл — пакет настроек: объект (не массив) с `app` («… Workspace Bundle»), числовым `version` и объектом `data`.
 * Любой другой JSON (массив шаблонов, массив версий, null, число, чужой объект) пакетом не считается и не должен стирать настройки.
 */
export function isWorkspaceBundle(value: unknown): value is { app: string; version: number; data: Record<string, unknown> } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.app !== 'string' || !/workspace bundle/i.test(v.app)) return false;
  if (typeof v.version !== 'number' || !Number.isFinite(v.version)) return false;
  return typeof v.data === 'object' && v.data !== null && !Array.isArray(v.data);
}
