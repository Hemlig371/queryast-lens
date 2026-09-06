import './setupIndexedDB';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveTabResult,
  getTabResult,
  removeTabResult,
  cleanupOrphanedTabResults,
  TabResultData,
  tabResultsCache
} from '../src/utils/resultStorage';

describe('resultStorage (IndexedDB query results cache)', () => {
  beforeEach(() => {
    tabResultsCache.clear();
  });

  it('should save tab result and retrieve it from cache or DB', async () => {
    const data: TabResultData = {
      duckDbResults: [{ id: 1, name: 'Alice' }],
      queryExecutionDuration: '12ms',
      resultColumnTypes: { id: 'Int32', name: 'Utf8' },
      isDuckDbResultVisible: true,
      duckDbPage: 1,
      duckDbError: null,
      lastExecutedSql: 'SELECT * FROM users'
    };

    await saveTabResult('tab-1', data);

    const retrieved = await getTabResult('tab-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.duckDbResults).toEqual([{ id: 1, name: 'Alice' }]);
    expect(retrieved?.queryExecutionDuration).toBe('12ms');
  });

  it('should remove tab result by id', async () => {
    const data: TabResultData = {
      duckDbResults: [1, 2, 3],
      queryExecutionDuration: '5ms',
      resultColumnTypes: {},
      isDuckDbResultVisible: true,
      duckDbPage: 1
    };

    await saveTabResult('tab-del', data);
    await removeTabResult('tab-del');

    const result = await getTabResult('tab-del');
    expect(result).toBeNull();
  });

  it('should cleanup orphaned tab results', async () => {
    const data: TabResultData = {
      duckDbResults: [],
      queryExecutionDuration: '1ms',
      resultColumnTypes: {},
      isDuckDbResultVisible: false,
      duckDbPage: 1
    };

    await saveTabResult('tab-active', data);
    await saveTabResult('tab-old-1', data);
    await saveTabResult('tab-old-2', data);

    await cleanupOrphanedTabResults(['tab-active']);

    tabResultsCache.clear(); // Clear cache to force DB lookup

    const activeRes = await getTabResult('tab-active');
    expect(activeRes).not.toBeNull();

    const old1Res = await getTabResult('tab-old-1');
    expect(old1Res).toBeNull();

    const old2Res = await getTabResult('tab-old-2');
    expect(old2Res).toBeNull();
  });
});
