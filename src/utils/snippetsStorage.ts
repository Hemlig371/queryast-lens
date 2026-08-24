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
