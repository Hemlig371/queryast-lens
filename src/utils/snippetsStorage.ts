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
  cachedSnippets = snippets;
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
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    clearReq.onerror = () => reject(clearReq.error);
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

  let safeBase = rawBase.replace(/[^a-zа-я0-9\s-_]/gi, '').trim().replace(/\s+/g, '_');
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

