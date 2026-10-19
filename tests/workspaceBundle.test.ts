import { describe, it, expect } from 'vitest';
import { isWorkspaceBundle, WORKSPACE_BUNDLE_APP } from '../src/utils/workspaceBundle';
import fs from 'node:fs';
import path from 'node:path';

const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));

describe('isWorkspaceBundle (ST-01, SM-02)', () => {
  it('пакет в том виде, в каком его создаёт generateWorkspaceBundleObject', () => {
    expect(isWorkspaceBundle({
      version: 1,
      app: WORKSPACE_BUNDLE_APP,
      exportedAt: '2026-10-18T00:00:00.000Z',
      data: { sql_favorite_snippets_ids_v1: [] },
    })).toBe(true);
  });

  it('готовые конфигурации из docs/ принимаются (онбординг через default_config.json не ломается)', () => {
    expect(isWorkspaceBundle(readJson('docs/default_config.json'))).toBe(true);
    expect(isWorkspaceBundle(readJson('docs/default_config_en.json'))).toBe(true);
  });

  it('пустой data допустим', () => {
    expect(isWorkspaceBundle({ version: 1, app: WORKSPACE_BUNDLE_APP, data: {} })).toBe(true);
  });

  it('массив шаблонов (экспорт sql_snippets_*.json) — не пакет', () => {
    expect(isWorkspaceBundle([{ id: 'a', title: 'T', category: 'Запросы', sql: 'SELECT 1' }])).toBe(false);
    expect(isWorkspaceBundle([])).toBe(false);
  });

  it('массив версий (экспорт истории) — не пакет', () => {
    expect(isWorkspaceBundle([{ id: 1, timestamp: 1, sql: 'SELECT 1', tabId: 'x' }])).toBe(false);
  });

  it('null, число, строка, boolean, undefined — не пакет', () => {
    for (const v of [null, 42, 'text', true, undefined]) expect(isWorkspaceBundle(v)).toBe(false);
  });

  it('объект без app / version / data — не пакет', () => {
    expect(isWorkspaceBundle({})).toBe(false);
    expect(isWorkspaceBundle({ sql_visualizer_session_v2: {} })).toBe(false);
    expect(isWorkspaceBundle({ version: 1, data: {} })).toBe(false);
    expect(isWorkspaceBundle({ app: WORKSPACE_BUNDLE_APP, data: {} })).toBe(false);
    expect(isWorkspaceBundle({ app: WORKSPACE_BUNDLE_APP, version: 1 })).toBe(false);
  });

  it('data не объект (массив, null, строка) — не пакет', () => {
    for (const data of [[], null, 'x', 5]) {
      expect(isWorkspaceBundle({ app: WORKSPACE_BUNDLE_APP, version: 1, data })).toBe(false);
    }
  });

  it('чужое приложение или нечисловая версия — не пакет', () => {
    expect(isWorkspaceBundle({ app: 'Other App', version: 1, data: {} })).toBe(false);
    expect(isWorkspaceBundle({ app: WORKSPACE_BUNDLE_APP, version: '1', data: {} })).toBe(false);
    expect(isWorkspaceBundle({ app: 5, version: 1, data: {} })).toBe(false);
  });
});
