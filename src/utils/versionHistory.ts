export interface SqlVersionItem {
  id: string;
  timestamp: number;
  formattedTime: string;
  sql: string;
  label?: string;
  isAutoSave: boolean;
  charCount: number;
  lineCount: number;
}

const DB_NAME = 'SQL_VersionHistory_DB';
const STORE_NAME = 'versions';
const MAX_AUTO_VERSIONS = 300;
const MAX_MANUAL_VERSIONS = 200;

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
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVersion(
  sql: string,
  label?: string,
  isAutoSave: boolean = false
): Promise<SqlVersionItem> {
  if (!sql.trim()) throw new Error('SQL query is empty');
  const db = await openDB();

  await cleanupOldVersions(db);

  const timestamp = Date.now();
  const dateObj = new Date(timestamp);
  const formattedTime = dateObj.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const lines = sql.split('\n').length;
  const item: SqlVersionItem = {
    id: `ver_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp,
    formattedTime,
    sql,
    label: label || (isAutoSave ? 'Автосохранение' : 'Ручной снимок'),
    isAutoSave,
    charCount: sql.length,
    lineCount: lines
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

export async function getVersions(): Promise<SqlVersionItem[]> {
  try {
    const db = await openDB();
    await cleanupOldVersions(db);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items: SqlVersionItem[] = req.result || [];
        items.sort((a, b) => b.timestamp - a.timestamp);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to load versions from IndexedDB', e);
    return [];
  }
}

export async function deleteVersion(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllVersions(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function importVersions(versions: SqlVersionItem[]): Promise<void> {
  if (!Array.isArray(versions) || versions.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const item of versions) {
      if (item && item.id && item.sql) {
        store.put(item);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVersionById(id: string): Promise<SqlVersionItem | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn(`Failed to load version ${id} from IndexedDB`, e);
    return null;
  }
}

async function cleanupOldVersions(db: IDBDatabase): Promise<void> {
  // Get all items to check their categories and timestamps
  const allItems = await new Promise<SqlVersionItem[]>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  // Separate auto and manual versions
  const autoVersions = allItems.filter(item => item.isAutoSave);
  const manualVersions = allItems.filter(item => !item.isAutoSave);

  // Sort both arrays by timestamp descending (newest first)
  autoVersions.sort((a, b) => b.timestamp - a.timestamp);
  manualVersions.sort((a, b) => b.timestamp - a.timestamp);

  const toDeleteIds: string[] = [];

  // If auto versions exceed 300, delete the oldest ones
  if (autoVersions.length > MAX_AUTO_VERSIONS) {
    const excess = autoVersions.slice(MAX_AUTO_VERSIONS);
    for (const item of excess) {
      toDeleteIds.push(item.id);
    }
  }

  // If manual versions exceed 100, delete the oldest ones
  if (manualVersions.length > MAX_MANUAL_VERSIONS) {
    const excess = manualVersions.slice(MAX_MANUAL_VERSIONS);
    for (const item of excess) {
      toDeleteIds.push(item.id);
    }
  }

  if (toDeleteIds.length > 0) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let completed = 0;
      for (const id of toDeleteIds) {
        const req = store.delete(id);
        req.onsuccess = req.onerror = () => {
          completed++;
          if (completed === toDeleteIds.length) {
            resolve();
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}
