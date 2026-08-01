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
const DB_VERSION = 3;

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
          db.createObjectStore(STORE_NAME, { keyPath: 'dbKey' });
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

export async function getSchemaCache(dbKey: string): Promise<SchemaCacheEntry | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(dbKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getSchemaCache error:', e);
    return null;
  }
}

export async function saveSchemaCache(entry: SchemaCacheEntry): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(tx.error || e);
    });
  } catch (e) {
    console.error('saveSchemaCache error:', e);
  }
}

export async function getAllSchemaCacheEntries(): Promise<SchemaCacheEntry[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getAllSchemaCacheEntries error:', e);
    return [];
  }
}

export async function importSchemaCacheEntries(entries: SchemaCacheEntry[]): Promise<void> {
  if (!Array.isArray(entries)) return;
  try {
    const db = await getDb();
    if (!db) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      entries.forEach((entry) => {
        if (entry && entry.dbKey) {
          store.put(entry);
        }
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('importSchemaCacheEntries error:', e);
  }
}
