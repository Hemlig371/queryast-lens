import './setupIndexedDB';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveSessionTabs } from '../src/utils/sessionStorage';

const KEY = 'sql_visualizer_tabs_session';
const tab = (id: string) => ({ id, title: id, sql: 'select 1', originalSql: 'select 1', filePath: null, savedContent: '', isModified: false } as any);

describe('saveSessionTabs: переполнение localStorage', () => {
  const realIdb = (globalThis as any).indexedDB;
  const realWinIdb = (globalThis as any).window?.indexedDB;

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).indexedDB = realIdb;
    if ((globalThis as any).window) (globalThis as any).window.indexedDB = realWinIdb;
  });

  const quota = () => vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    const e: any = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
  });
  const failingIdb = () => {
    const open = () => {
      const req: any = {};
      setTimeout(() => req.onerror?.(), 0);
      Object.defineProperty(req, 'error', { value: new Error('idb failed') });
      return req;
    };
    const fake = { open };
    (globalThis as any).indexedDB = fake;
    if ((globalThis as any).window) (globalThis as any).window.indexedDB = fake;
  };

  it('если запись в IndexedDB не удалась, прежняя сессия в localStorage остаётся', async () => {
    const old = JSON.stringify([{ id: 'old' }]);
    localStorage.setItem(KEY, old);
    quota();
    failingIdb();
    await saveSessionTabs([tab('new')]);
    expect(localStorage.getItem(KEY)).toBe(old);
  });
});
