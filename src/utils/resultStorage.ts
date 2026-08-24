export const DB_NAME = 'sql_visualizer_results';
export const STORE_NAME = 'tab_results';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        dbPromise = null; // Allow retry on failure
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }
  return dbPromise;
}

export interface TabResultData {
  duckDbResults: any[] | null;
  queryExecutionDuration: string | null;
  resultColumnTypes: Record<string, string>;
  isDuckDbResultVisible: boolean;
  duckDbPage: number;
  duckDbError?: string | null;
  lastExecutedSql?: string | null;
}

export const tabResultsCache = new Map<string, TabResultData>();
const MAX_CACHE_SIZE = 3;

function updateCache(tabId: string, data: TabResultData) {
  if (tabResultsCache.has(tabId)) {
    tabResultsCache.delete(tabId);
  }
  tabResultsCache.set(tabId, data);
  
  if (tabResultsCache.size > MAX_CACHE_SIZE) {
    const oldestKey = tabResultsCache.keys().next().value;
    if (oldestKey !== undefined) {
      tabResultsCache.delete(oldestKey);
    }
  }
}

export function getTabResultSync(tabId: string): TabResultData | null {
  if (tabResultsCache.has(tabId)) {
    const data = tabResultsCache.get(tabId)!;
    updateCache(tabId, data);
    return data;
  }
  return null;
}

export async function saveTabResult(tabId: string, data: TabResultData): Promise<void> {
  updateCache(tabId, data);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data, tabId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getTabResult(tabId: string): Promise<TabResultData | null> {
  if (tabResultsCache.has(tabId)) {
    const data = tabResultsCache.get(tabId)!;
    updateCache(tabId, data);
    return data;
  }
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(tabId);
    request.onsuccess = () => {
      const result = request.result || null;
      if (result) {
        updateCache(tabId, result);
      }
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function removeTabResult(tabId: string): Promise<void> {
  tabResultsCache.delete(tabId);
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(tabId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function cleanupOrphanedTabResults(activeTabIds: string[]): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      
      request.onsuccess = () => {
        const keys = request.result;
        const deletePromises: Promise<void>[] = [];
        
        for (const key of keys) {
          if (!activeTabIds.includes(String(key))) {
            const delReq = store.delete(key);
            deletePromises.push(new Promise((res) => {
              delReq.onsuccess = () => res();
              delReq.onerror = () => res(); // Ignore individual delete errors
            }));
          }
        }
        
        Promise.all(deletePromises).then(() => resolve());
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to cleanup orphaned tab results:', err);
  }
}
