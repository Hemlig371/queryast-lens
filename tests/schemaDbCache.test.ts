// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { getSchemaCache, saveSchemaCache, getAllSchemaCacheEntries, importSchemaCacheEntries } from '../src/utils/schemaDbCache';

describe('schemaDbCache', () => {
  beforeEach(async () => {
    // We clear by replacing with nothing or deleting the DB, but IndexedDB delete in fake-indexeddb can hang.
    // Instead, let's just make sure we overwrite or test uniquely.
    // Actually we can't easily clear the object store unless we expose a clear method.
    // So let's just use unique dbKeys per test.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for a non-existent dbKey', async () => {
    const res = await getSchemaCache('does-not-exist');
    expect(res).toBeNull();
  });

  it('saves and retrieves schema cache entry', async () => {
    const entry = {
      dbKey: 'test-db-1',
      timestamp: Date.now(),
      tables: [{ database_name: 'db', schema_name: 'public', table_name: 'users', table_type: 'Tables' as const }],
      tableColumnsMap: { 'public.users': [{ column_name: 'id', data_type: 'INT' }] }
    };
    
    await saveSchemaCache(entry);
    const retrieved = await getSchemaCache('test-db-1');
    expect(retrieved).toEqual(entry);
  });

  it('handles invalid imports gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Should not throw, should just fail gracefully
    await importSchemaCacheEntries(null as any);
    expect(consoleSpy).not.toHaveBeenCalled(); // Actually the code just returns if not Array
  });

  it('imports multiple entries securely', async () => {
    const entries = [
      {
        dbKey: 'import-db-1',
        timestamp: Date.now(),
        tables: [],
        tableColumnsMap: {}
      },
      {
        dbKey: 'import-db-2',
        timestamp: Date.now(),
        tables: [{ database_name: 'secret', schema_name: 'secret', table_name: 'passwords', table_type: 'Tables' as const }],
        tableColumnsMap: {}
      }
    ];
    
    await importSchemaCacheEntries(entries);
    
    const all = await getAllSchemaCacheEntries();
    expect(all.length).toBeGreaterThanOrEqual(2);
    
    const retrieved = await getSchemaCache('import-db-2');
    expect(retrieved).toEqual(entries[1]);
  });
});
