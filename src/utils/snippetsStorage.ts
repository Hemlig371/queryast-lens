import { Snippet } from '../components/SqlSnippetsManager';

const DB_NAME = 'SQL_Snippets_DB';
const STORE_NAME = 'snippets';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export let cachedSnippets: Snippet[] | null = null;

export async function addSnippetToDB(snippet: Snippet): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(snippet);
    tx.oncomplete = () => {
      if (cachedSnippets) {
        const index = cachedSnippets.findIndex(s => s.id === snippet.id);
        if (index !== -1) {
          cachedSnippets[index] = snippet;
        } else {
          cachedSnippets.push(snippet);
        }
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    req.onerror = () => reject(req.error);
  });
}

export async function updateSnippetInDB(snippet: Snippet): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(snippet);
    tx.oncomplete = () => {
      if (cachedSnippets) {
        const index = cachedSnippets.findIndex(s => s.id === snippet.id);
        if (index !== -1) {
          cachedSnippets[index] = snippet;
        } else {
          cachedSnippets.push(snippet);
        }
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSnippetFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    tx.oncomplete = () => {
      if (cachedSnippets) {
        cachedSnippets = cachedSnippets.filter(s => s.id !== id);
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSnippetsToDB(snippets: Snippet[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Clear old snippets to maintain the exact list
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      if (snippets.length === 0) {
         return;
      }
      for (const item of snippets) {
        store.put(item);
      }
    };
    
    // Кэш обновляется только после того, как запись в базу завершена
    tx.oncomplete = () => {
      cachedSnippets = snippets;
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    clearReq.onerror = () => reject(clearReq.error);
  });
}

/** Добавляет/обновляет записи, не удаляя остальные (в отличие от saveSnippetsToDB, которая заменяет весь список). */
export async function putSnippetsToDB(snippets: Snippet[]): Promise<void> {
  if (snippets.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const item of snippets) {
      const req = store.put(item);
      req.onerror = () => reject(req.error);
    }
    tx.oncomplete = () => {
      if (cachedSnippets) {
        const next = cachedSnippets.filter((c) => !snippets.some((s) => s.id === c.id));
        cachedSnippets = [...next, ...snippets];
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadSnippetsFromDB(): Promise<Snippet[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = req.result || [];
        cachedSnippets = result;
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to load snippets from IndexedDB', e);
    return [];
  }
}

/**
 * Чтение без подавления ошибок: если базу не удалось открыть или прочитать, промис отклоняется.
 * Пустой список от неё означает именно «шаблонов нет» (в отличие от loadSnippetsFromDB, которая при сбое тоже возвращает []).
 */
export async function loadSnippetsFromDBStrict(): Promise<Snippet[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const result = req.result || [];
      cachedSnippets = result;
      resolve(result);
    };
    req.onerror = () => reject(req.error);
  });
}

// ---- Перенос шаблонов из старого ключа localStorage ----

/** Старое место хранения пользовательских шаблонов (до перехода на IndexedDB). */
export const LEGACY_SNIPPETS_KEY = 'sql_custom_snippets_v2';
/** Отметка «перенос из старого ключа уже выполнялся»: после неё старый ключ больше не читается. */
export const LEGACY_MIGRATED_KEY = 'sql_custom_snippets_v2_migrated';

export type LegacyMigrationStatus =
  | 'read-failed'
  | 'skipped-already-migrated'
  | 'nothing-to-migrate'
  | 'legacy-invalid'
  | 'db-has-data'
  | 'migrated'
  | 'write-failed'
  | 'verify-failed';

export interface LegacyMigrationResult {
  status: LegacyMigrationStatus;
  /** Шаблоны, которые сейчас в базе (пусто, если базу не удалось прочитать). */
  snippets: Snippet[];
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface MigrationDeps {
  load: () => Promise<Snippet[]>;
  put: (snippets: Snippet[]) => Promise<void>;
}

const isSnippetLike = (x: unknown): x is Snippet =>
  !!x && typeof x === 'object' && typeof (x as any).id === 'string' && (x as any).id !== '';

/**
 * Переносит шаблоны из старого ключа localStorage в IndexedDB один раз.
 *
 * Правила (данные пользователя не теряются):
 * - база не читается → ничего не пишется и не удаляется (пустой ответ при сбое чтения не считается пустой базой);
 * - запись только добавляющая (без clear); старый ключ удаляется после того, как записанное прочитано обратно и совпало;
 * - отметка о переносе ставится до удаления ключа, поэтому удалённые позже шаблоны не возвращаются;
 * - если в базе уже есть шаблоны, старый ключ удаляется только когда все его шаблоны есть в базе, иначе остаётся как копия.
 */
export async function migrateLegacySnippets(
  storage: KeyValueStorage = localStorage,
  deps: MigrationDeps = { load: loadSnippetsFromDBStrict, put: putSnippetsToDB }
): Promise<LegacyMigrationResult> {
  let dbSnippets: Snippet[];
  try {
    dbSnippets = await deps.load();
  } catch (e) {
    console.warn('Snippets migration skipped: IndexedDB is not readable', e);
    return { status: 'read-failed', snippets: [] };
  }

  const safe = (fn: () => void) => { try { fn(); } catch (e) { console.warn('localStorage is not available for snippets migration', e); } };
  const markMigrated = () => safe(() => storage.setItem(LEGACY_MIGRATED_KEY, '1'));
  const dropLegacy = () => safe(() => storage.removeItem(LEGACY_SNIPPETS_KEY));

  let marker: string | null = null;
  let raw: string | null = null;
  try {
    marker = storage.getItem(LEGACY_MIGRATED_KEY);
    raw = storage.getItem(LEGACY_SNIPPETS_KEY);
  } catch {
    return { status: 'skipped-already-migrated', snippets: dbSnippets };
  }
  if (marker) return { status: 'skipped-already-migrated', snippets: dbSnippets };

  if (raw === null) {
    markMigrated();
    return { status: 'nothing-to-migrate', snippets: dbSnippets };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'legacy-invalid', snippets: dbSnippets };
  }
  if (!Array.isArray(parsed)) return { status: 'legacy-invalid', snippets: dbSnippets };
  if (parsed.length === 0) {
    markMigrated();
    dropLegacy();
    return { status: 'nothing-to-migrate', snippets: dbSnippets };
  }
  const legacy = parsed.filter(isSnippetLike);
  if (legacy.length === 0) return { status: 'legacy-invalid', snippets: dbSnippets };

  if (dbSnippets.length > 0) {
    const have = new Set(dbSnippets.map((s) => s.id));
    markMigrated();
    if (legacy.every((s) => have.has(s.id))) dropLegacy();
    return { status: 'db-has-data', snippets: dbSnippets };
  }

  try {
    await deps.put(legacy);
  } catch (e) {
    console.error('Failed to write migrated snippets to IndexedDB', e);
    return { status: 'write-failed', snippets: dbSnippets };
  }

  let after: Snippet[];
  try {
    after = await deps.load();
  } catch (e) {
    console.error('Failed to read back migrated snippets', e);
    return { status: 'verify-failed', snippets: dbSnippets };
  }
  const byId = new Map(after.map((s) => [s.id, s]));
  const same = legacy.every((s) => {
    const got = byId.get(s.id);
    return !!got && JSON.stringify(got) === JSON.stringify(s);
  });
  if (!same) return { status: 'verify-failed', snippets: after };

  markMigrated();
  dropLegacy();
  return { status: 'migrated', snippets: after };
}

/**
 * Returns safe filename and extension for exporting a snippet.
 * If title ends with a known extension like .md, .py, .sql, .json, .sh, etc.,
 * that extension is preserved and .sql is NOT appended.
 */
export function getSnippetExportFilename(title: string, fallbackId: string = ''): { baseName: string; extension: string; fileName: string } {
  const trimmed = title.trim();
  // Check if title has an explicit extension (1 to 10 alphanumeric chars after last dot)
  const extMatch = trimmed.match(/\.([a-z0-9]{1,10})$/i);
  
  let rawBase = trimmed;
  let ext = 'sql';
  
  if (extMatch) {
    ext = extMatch[1].toLowerCase();
    rawBase = trimmed.slice(0, extMatch.index);
  }

  let safeBase = rawBase.replace(/[^a-zа-яё0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
  if (!safeBase) {
    safeBase = fallbackId ? `snippet_${fallbackId.substring(0, 6)}` : 'snippet';
  }
  safeBase = safeBase.substring(0, 80);

  return {
    baseName: safeBase,
    extension: ext,
    fileName: `${safeBase}.${ext}`
  };
}

