export interface SchemaTableItem {
  database_name: string;
  schema_name: string;
  table_name: string;
  table_type: 'Tables' | 'Views' | 'Macros';
  estimated_rows?: number;
  table_bytes?: number;
}

export interface SchemaColumnItem {
  column_name: string;
  data_type: string;
}

export interface SchemaCacheEntry {
  dbKey: string;
  timestamp: number;
  tables: SchemaTableItem[];
  tableColumnsMap: Record<string, SchemaColumnItem[]>;
}

const DB_NAME = 'sql_visualizer_schema_cache';
const STORE_NAME = 'schemas';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        resolve(null);
        return;
      }
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event: any) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'dbKey' });
          }
        };
        request.onsuccess = (event: any) => {
          resolve(event.target.result);
        };
        request.onerror = (err) => {
          console.warn('IndexedDB open error:', err);
          dbPromise = null;
          resolve(null);
        };
      } catch (e) {
        console.warn('IndexedDB exception:', e);
        dbPromise = null;
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function getSchemaCache(dbKey: string): Promise<SchemaCacheEntry | null> {
  const db = await getDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(dbKey);
      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => {
        resolve(null);
      };
    } catch (e) {
      console.warn('getSchemaCache error:', e);
      resolve(null);
    }
  });
}

export async function saveSchemaCache(entry: SchemaCacheEntry): Promise<void> {
  const db = await getDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => {
        console.warn('saveSchemaCache error:', e);
        resolve();
      };
    } catch (e) {
      console.warn('saveSchemaCache exception:', e);
      resolve();
    }
  });
}

export async function getAllSchemaCacheEntries(): Promise<SchemaCacheEntry[]> {
  const db = await getDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      console.warn('getAllSchemaCacheEntries error:', e);
      resolve([]);
    }
  });
}

export async function importSchemaCacheEntries(entries: SchemaCacheEntry[]): Promise<void> {
  const db = await getDb();
  if (!db || !Array.isArray(entries)) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      entries.forEach((entry) => {
        if (entry && entry.dbKey) {
          store.put(entry);
        }
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      console.warn('importSchemaCacheEntries error:', e);
      resolve();
    }
  });
}
