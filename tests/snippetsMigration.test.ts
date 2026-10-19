import './setupIndexedDB';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as storage from '../src/utils/snippetsStorage';
import {
  saveSnippetsToDB,
  loadSnippetsFromDB,
  loadSnippetsFromDBStrict,
  deleteSnippetFromDB,
  migrateLegacySnippets,
  LEGACY_SNIPPETS_KEY,
  LEGACY_MIGRATED_KEY,
} from '../src/utils/snippetsStorage';
import type { Snippet } from '../src/components/SqlSnippetsManager';

// п. 3.16 (SN-02, SN-03): кэш не опережает базу, миграция из старого ключа localStorage не стирает и не воскрешает данные.
// Все сбои базы подставляются прямой заменой globalThis.indexedDB (восстанавливается в afterEach).

class MemoryStorage {
  store: Record<string, string> = {};
  getItem(k: string) { return k in this.store ? this.store[k] : null; }
  setItem(k: string, v: string) { this.store[k] = String(v); }
  removeItem(k: string) { delete this.store[k]; }
}

const snip = (id: string, over: Partial<Snippet> = {}): Snippet => ({ id, title: `T ${id}`, sql: `SELECT '${id}'`, category: 'Запросы', ...over });

const realIndexedDB = (globalThis as any).indexedDB;
const setIndexedDB = (value: any) => Object.defineProperty(globalThis, 'indexedDB', { value, configurable: true, writable: true });

const asyncError = (target: any, err: Error) => setTimeout(() => { target.error = err; target.onerror?.({ target }); }, 0);

/** База не открывается. */
const openFailsDb = () => ({ open: () => { const r: any = {}; asyncError(r, new Error('blocked')); return r; } });
/** База открывается, чтение (getAll) падает. */
const readFailsDb = () => ({
  open: () => {
    const r: any = {};
    setTimeout(() => {
      r.result = { transaction: () => ({ objectStore: () => ({ getAll: () => { const q: any = {}; asyncError(q, new Error('read failed')); return q; } }) }) };
      r.onsuccess?.({ target: r });
    }, 0);
    return r;
  },
});
/** База открывается, но транзакция записи не создаётся (квота, закрытое соединение). */
const writeFailsDb = () => ({
  open: () => {
    const r: any = {};
    setTimeout(() => { r.result = { transaction: () => { throw new Error('QuotaExceededError'); } }; r.onsuccess?.({ target: r }); }, 0);
    return r;
  },
});

const dbIds = async () => (await loadSnippetsFromDBStrict()).map((s) => s.id).sort();

beforeEach(async () => {
  setIndexedDB(realIndexedDB);
  await saveSnippetsToDB([]);
});
afterEach(() => { setIndexedDB(realIndexedDB); });

describe('saveSnippetsToDB: кэш (SN-02)', () => {
  it('после успешной записи кэш равен записанному списку', async () => {
    await saveSnippetsToDB([snip('a'), snip('b')]);
    expect(storage.cachedSnippets?.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('при сбое записи кэш остаётся прежним, а ошибка доходит до вызывающего', async () => {
    await saveSnippetsToDB([snip('old')]);
    setIndexedDB(writeFailsDb());
    await expect(saveSnippetsToDB([snip('new1'), snip('new2')])).rejects.toThrow();
    expect(storage.cachedSnippets?.map((s) => s.id)).toEqual(['old']);
    setIndexedDB(realIndexedDB);
    expect(await dbIds()).toEqual(['old']);
  });

  it('пока запись не завершена, кэш не меняется', async () => {
    await saveSnippetsToDB([snip('old')]);
    const pending = saveSnippetsToDB([snip('new')]);
    expect(storage.cachedSnippets?.map((s) => s.id)).toEqual(['old']);
    await pending;
    expect(storage.cachedSnippets?.map((s) => s.id)).toEqual(['new']);
  });
});

describe('loadSnippetsFromDBStrict', () => {
  it('возвращает записи и обновляет кэш', async () => {
    await saveSnippetsToDB([snip('a')]);
    const list = await loadSnippetsFromDBStrict();
    expect(list.map((s) => s.id)).toEqual(['a']);
  });

  it('не скрывает ошибку: база не открылась / чтение упало → отказ', async () => {
    setIndexedDB(openFailsDb());
    await expect(loadSnippetsFromDBStrict()).rejects.toThrow();
    setIndexedDB(readFailsDb());
    await expect(loadSnippetsFromDBStrict()).rejects.toThrow('read failed');
  });

  it('прежняя loadSnippetsFromDB при неоткрывшейся базе по-прежнему возвращает []', async () => {
    setIndexedDB(openFailsDb());
    expect(await loadSnippetsFromDB()).toEqual([]);
  });
});

describe('migrateLegacySnippets', () => {
  let ls: MemoryStorage;
  beforeEach(() => { ls = new MemoryStorage(); });
  const putLegacy = (list: unknown) => ls.setItem(LEGACY_SNIPPETS_KEY, typeof list === 'string' ? list : JSON.stringify(list));

  it('база пуста, старый ключ с шаблонами: записаны, прочитаны, затем ключ удалён и поставлена отметка', async () => {
    putLegacy([snip('a'), snip('b')]);
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('migrated');
    expect(r.snippets.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(await dbIds()).toEqual(['a', 'b']);
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).toBeNull();
    expect(ls.getItem(LEGACY_MIGRATED_KEY)).toBe('1');
  });

  it('сбой записи: старый ключ остаётся, отметки нет', async () => {
    putLegacy([snip('a')]);
    const r = await migrateLegacySnippets(ls, { load: loadSnippetsFromDBStrict, put: async () => { throw new Error('QuotaExceededError'); } });
    expect(r.status).toBe('write-failed');
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).not.toBeNull();
    expect(ls.getItem(LEGACY_MIGRATED_KEY)).toBeNull();
  });

  it('запись «прошла», но при чтении записей нет: ключ не удаляется (verify-failed)', async () => {
    putLegacy([snip('a'), snip('b')]);
    const r = await migrateLegacySnippets(ls, { load: loadSnippetsFromDBStrict, put: async () => { /* ничего не записали */ } });
    expect(r.status).toBe('verify-failed');
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).not.toBeNull();
    expect(ls.getItem(LEGACY_MIGRATED_KEY)).toBeNull();
  });

  it('запись с искажённым содержимым не считается успешной', async () => {
    putLegacy([snip('a', { sql: 'SELECT 1' })]);
    const r = await migrateLegacySnippets(ls, {
      load: loadSnippetsFromDBStrict,
      put: async (list) => { await storage.putSnippetsToDB(list.map((s) => ({ ...s, sql: 'SELECT 2' }))); },
    });
    expect(r.status).toBe('verify-failed');
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).not.toBeNull();
  });

  it('ошибка чтения базы не стирает данные: ничего не пишется, ключ остаётся', async () => {
    await saveSnippetsToDB([snip('keep1'), snip('keep2')]);
    putLegacy([snip('legacy')]);
    setIndexedDB(readFailsDb());
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('read-failed');
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).not.toBeNull();
    expect(ls.getItem(LEGACY_MIGRATED_KEY)).toBeNull();
    setIndexedDB(realIndexedDB);
    expect(await dbIds()).toEqual(['keep1', 'keep2']);
  });

  it('база не открылась: то же самое', async () => {
    await saveSnippetsToDB([snip('keep')]);
    putLegacy([snip('legacy')]);
    setIndexedDB(openFailsDb());
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('read-failed');
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).not.toBeNull();
    setIndexedDB(realIndexedDB);
    expect(await dbIds()).toEqual(['keep']);
  });

  it('повторный запуск не дублирует и не пишет заново', async () => {
    putLegacy([snip('a'), snip('b')]);
    await migrateLegacySnippets(ls);
    const second = await migrateLegacySnippets(ls);
    expect(second.status).toBe('skipped-already-migrated');
    expect(await dbIds()).toEqual(['a', 'b']);
  });

  it('удалённые после миграции шаблоны не воскресают, даже если старый ключ вернули', async () => {
    putLegacy([snip('a'), snip('b')]);
    await migrateLegacySnippets(ls);
    await deleteSnippetFromDB('a');
    await deleteSnippetFromDB('b');
    putLegacy([snip('a'), snip('b')]); // старый ключ снова появился (например, восстановлен из копии профиля)
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('skipped-already-migrated');
    expect(r.snippets).toEqual([]);
    expect(await dbIds()).toEqual([]);
  });

  it('база не пуста, все шаблоны старого ключа уже в базе: ключ удаляется, база не меняется', async () => {
    await saveSnippetsToDB([snip('a'), snip('b'), snip('c')]);
    putLegacy([snip('a'), snip('b')]);
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('db-has-data');
    expect(await dbIds()).toEqual(['a', 'b', 'c']);
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).toBeNull();
    expect(ls.getItem(LEGACY_MIGRATED_KEY)).toBe('1');
  });

  it('база не пуста, в старом ключе есть то, чего в базе нет: ключ сохраняется как копия, база не меняется, повторно не мигрирует', async () => {
    await saveSnippetsToDB([snip('a')]);
    putLegacy([snip('a'), snip('only-legacy')]);
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('db-has-data');
    expect(await dbIds()).toEqual(['a']);
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).not.toBeNull();
    expect((await migrateLegacySnippets(ls)).status).toBe('skipped-already-migrated');
    expect(await dbIds()).toEqual(['a']);
  });

  it('нет старого ключа: нечего переносить, отметка ставится', async () => {
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('nothing-to-migrate');
    expect(ls.getItem(LEGACY_MIGRATED_KEY)).toBe('1');
  });

  it('пустой массив в старом ключе: ключ удаляется', async () => {
    putLegacy([]);
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('nothing-to-migrate');
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).toBeNull();
  });

  it('нечитаемый старый ключ не трогается и базу не затрагивает', async () => {
    await saveSnippetsToDB([]);
    putLegacy('{не json');
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('legacy-invalid');
    expect(ls.getItem(LEGACY_SNIPPETS_KEY)).toBe('{не json');
    expect(ls.getItem(LEGACY_MIGRATED_KEY)).toBeNull();
    expect(await dbIds()).toEqual([]);
  });

  it('записи без id в старом ключе пропускаются, остальные переносятся', async () => {
    putLegacy([snip('a'), { title: 'без id', sql: 'SELECT 1' }, null, 5]);
    const r = await migrateLegacySnippets(ls);
    expect(r.status).toBe('migrated');
    expect(await dbIds()).toEqual(['a']);
  });
});

// Страховка от возврата прежней схемы: перенос идёт только через migrateLegacySnippets (путь от process.cwd())
import fs from 'node:fs';
import path from 'node:path';
describe('SqlSnippetsManager: перенос из старого ключа', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/components/SqlSnippetsManager.tsx'), 'utf8');
  it('использует migrateLegacySnippets и не читает старый ключ сам', () => {
    expect(src).toContain('migrateLegacySnippets()');
    expect(src).not.toContain("'sql_custom_snippets_v2'");
    expect(src).not.toMatch(/await saveSnippetsToDB\(snippets\)/);
  });
});
