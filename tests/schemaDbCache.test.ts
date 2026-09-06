import './setupIndexedDB';
import { describe, it, expect } from 'vitest';
import {
  saveSchemaCache,
  getSchemaCache,
  getAllSchemaCacheEntries,
  importSchemaCacheEntries,
  cleanupOldSchemaCaches,
  SchemaCacheEntry
} from '../src/utils/schemaDbCache';

describe('schemaDbCache (IndexedDB database schema cache)', () => {
  it('should save and get schema cache entry', async () => {
    const entry: SchemaCacheEntry = {
      dbKey: 'clickhouse_prod_db',
      timestamp: Date.now(),
      tables: [
        {
          database_name: 'default',
          schema_name: 'default',
          table_name: 'users',
          table_type: 'Tables',
          estimated_rows: 1000
        }
      ],
      tableColumnsMap: {
        'default.users': [
          { column_name: 'id', data_type: 'UInt64' },
          { column_name: 'email', data_type: 'String' }
        ]
      }
    };

    await saveSchemaCache(entry);

    const loaded = await getSchemaCache('clickhouse_prod_db');
    expect(loaded).not.toBeNull();
    expect(loaded?.tables.length).toBe(1);
    expect(loaded?.tables[0].table_name).toBe('users');
    expect(loaded?.tableColumnsMap['default.users'].length).toBe(2);
  });

  it('should get all schema cache entries', async () => {
    const entry1: SchemaCacheEntry = {
      dbKey: 'db_1',
      timestamp: Date.now(),
      tables: [],
      tableColumnsMap: {}
    };
    const entry2: SchemaCacheEntry = {
      dbKey: 'db_2',
      timestamp: Date.now(),
      tables: [],
      tableColumnsMap: {}
    };

    await saveSchemaCache(entry1);
    await saveSchemaCache(entry2);

    const all = await getAllSchemaCacheEntries();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const keys = all.map(e => e.dbKey);
    expect(keys).toContain('db_1');
    expect(keys).toContain('db_2');
  });

  it('should import schema cache entries', async () => {
    const entries: SchemaCacheEntry[] = [
      {
        dbKey: 'imp_1',
        timestamp: Date.now(),
        tables: [{ database_name: 'd', schema_name: 's', table_name: 't1', table_type: 'Tables' }],
        tableColumnsMap: {}
      }
    ];

    await importSchemaCacheEntries(entries);
    const loaded = await getSchemaCache('imp_1');
    expect(loaded).not.toBeNull();
    expect(loaded?.tables[0].table_name).toBe('t1');
  });

  it('should cleanup stale schema cache entries older than threshold', async () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    const freshEntry: SchemaCacheEntry = {
      dbKey: 'fresh_db',
      timestamp: now,
      tables: [],
      tableColumnsMap: {}
    };

    const staleEntry: SchemaCacheEntry = {
      dbKey: 'stale_db',
      timestamp: tenDaysAgo,
      tables: [],
      tableColumnsMap: {}
    };

    await saveSchemaCache(freshEntry);
    await saveSchemaCache(staleEntry);

    await cleanupOldSchemaCaches(7); // Clean older than 7 days

    const fresh = await getSchemaCache('fresh_db');
    expect(fresh).not.toBeNull();

    const stale = await getSchemaCache('stale_db');
    expect(stale).toBeNull();
  });
});
