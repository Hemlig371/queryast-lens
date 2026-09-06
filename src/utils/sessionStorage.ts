import { EditorTab } from '../App';

const LOCAL_STORAGE_KEY = 'sql_visualizer_tabs_session';

// Legacy IndexedDB constants for backward compatibility
const DB_NAME = 'sql_visualizer_tabs_db';
const STORE_NAME = 'tabs_session';
const DB_VERSION = 1;

function saveToIndexedDb(tabs: any[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) return resolve();
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tabs.forEach((tab, index) => {
        store.put({ ...tab, _order: index });
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveSessionTabs(tabs: EditorTab[]): Promise<void> {
  try {
    const sanitizedTabs = tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      sql: tab.sql,
      originalSql: tab.originalSql,
      filePath: tab.filePath,
      savedContent: tab.savedContent,
      isModified: tab.isModified,
      lastExecutedSql: tab.lastExecutedSql
    }));
    
    try {
      // Synchronously save to localStorage
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitizedTabs));
    } catch (e: any) {
      if (e.name === 'QuotaExceededError' || e.code === 22 || (e.message && e.message.includes('quota'))) {
        console.warn('LocalStorage quota exceeded. Falling back to IndexedDB for tabs session.');
        // Обязательно удаляем ключ из localStorage, чтобы при следующей загрузке 
        // fallback в getSessionTabs переключился на чтение из IndexedDB.
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        await saveToIndexedDb(sanitizedTabs);
      } else {
        throw e;
      }
    }
  } catch (e) {
    console.error('saveSessionTabs error:', e);
  }
}

export async function getSessionTabs(): Promise<EditorTab[] | null> {
  try {
    // 1. Try reading from localStorage first (new method)
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as EditorTab[];
        }
      } catch (e) {
        console.error('Failed to parse localStorage tabs:', e);
      }
    }

    // 2. Fallback to IndexedDB (old method) for backward compatibility migration
    if (typeof window !== 'undefined' && window.indexedDB) {
      return await new Promise((resolve) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onsuccess = (event: any) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            resolve(null);
            return;
          }
          
          try {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            
            req.onsuccess = () => {
              if (req.result && req.result.length > 0) {
                // Sort by the old _order field
                const sorted = req.result.sort((a: any, b: any) => (a._order || 0) - (b._order || 0));
                
                // Remove the _order property
                const cleaned = sorted.map((t: any) => {
                  const { _order, ...rest } = t;
                  return rest as EditorTab;
                });
                
                // Immediately migrate to localStorage so we don't need IndexedDB next time
                saveSessionTabs(cleaned);
                
                resolve(cleaned);
              } else {
                resolve(null);
              }
            };
            req.onerror = () => resolve(null);
          } catch (e) {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
    }
  } catch (e) {
    console.error('getSessionTabs error:', e);
  }
  return null;
}
