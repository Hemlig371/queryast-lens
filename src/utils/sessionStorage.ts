import { EditorTab } from '../App';

const DB_NAME = 'sql_visualizer_tabs_db';
const STORE_NAME = 'tabs_session';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };
      request.onerror = (err: any) => {
        dbPromise = null;
        reject(err.target?.error || err);
      };
    });
  }
  return dbPromise as Promise<IDBDatabase>;
}

export async function saveSessionTabs(tabs: EditorTab[]): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      const clearReq = store.clear();
      
      clearReq.onsuccess = () => {
        let count = 0;
        if (tabs.length === 0) {
           resolve();
           return;
        }
        tabs.forEach((tab, index) => {
          const req = store.put({ ...tab, _order: index });
          req.onsuccess = () => {
            count++;
            if (count === tabs.length) {
              resolve();
            }
          };
          req.onerror = (e) => reject(req.error || e);
        });
      };
      clearReq.onerror = (e) => reject(clearReq.error || e);
    });
  } catch (e) {
    console.error('saveSessionTabs error:', e);
  }
}

export async function getSessionTabs(): Promise<EditorTab[] | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          const sorted = req.result.sort((a, b) => (a._order || 0) - (b._order || 0));
          // Remove the _order property
          const cleaned = sorted.map(t => {
            const { _order, ...rest } = t;
            return rest as EditorTab;
          });
          resolve(cleaned);
        } else {
          resolve(null);
        }
      }
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getSessionTabs error:', e);
    return null;
  }
}
