// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { saveTabResult, getTabResult, removeTabResult, cleanupOrphanedTabResults, getTabResultSync, tabResultsCache } from '../src/utils/resultStorage';

describe('resultStorage', () => {
  beforeEach(async () => {
    // Clean up
    tabResultsCache.clear();
    await cleanupOrphanedTabResults([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for non-existent tab', async () => {
    const res = await getTabResult('tab-does-not-exist');
    expect(res).toBeNull();
  });

  it('saves and retrieves a tab result', async () => {
    const data = {
      duckDbResults: [{ id: 1, val: 'test' }],
      queryExecutionDuration: '10ms',
      resultColumnTypes: { id: 'number', val: 'string' },
      isDuckDbResultVisible: true,
      duckDbPage: 1
    };
    
    await saveTabResult('tab-1', data);
    const retrieved = await getTabResult('tab-1');
    expect(retrieved).toEqual(data);
  });

  it('removes a tab result', async () => {
    const data = {
      duckDbResults: [],
      queryExecutionDuration: null,
      resultColumnTypes: {},
      isDuckDbResultVisible: false,
      duckDbPage: 1
    };
    
    await saveTabResult('tab-2', data);
    expect(await getTabResult('tab-2')).toBeTruthy();
    
    await removeTabResult('tab-2');
    expect(await getTabResult('tab-2')).toBeNull();
  });

  it('cleans up orphaned tab results', async () => {
    const data = {
      duckDbResults: [],
      queryExecutionDuration: null,
      resultColumnTypes: {},
      isDuckDbResultVisible: false,
      duckDbPage: 1
    };
    
    await saveTabResult('tab-active', data);
    await saveTabResult('tab-orphan', data);
    
    // Cleanup everything except tab-active
    await cleanupOrphanedTabResults(['tab-active']);
    
    // The cleanup only touches IndexedDB, not the memory cache
    tabResultsCache.clear();
    
    expect(await getTabResult('tab-active')).toBeTruthy();
    expect(await getTabResult('tab-orphan')).toBeNull();
  });

  it('uses synchronous memory cache correctly', async () => {
    const data = {
      duckDbResults: [],
      queryExecutionDuration: '99ms',
      resultColumnTypes: {},
      isDuckDbResultVisible: false,
      duckDbPage: 5
    };
    
    await saveTabResult('tab-cache', data);
    
    // It should now be in the memory cache
    const syncRes = getTabResultSync('tab-cache');
    expect(syncRes).toEqual(data);
    
    // Check missing
    expect(getTabResultSync('tab-missing')).toBeNull();
  });

  it('does not leak sensitive tab results', async () => {
    const sensitiveData = {
      duckDbResults: [{ password: 'very_secret_password_here' }],
      queryExecutionDuration: '10ms',
      resultColumnTypes: { password: 'string' },
      isDuckDbResultVisible: true,
      duckDbPage: 1
    };
    
    await saveTabResult('tab-sensitive', sensitiveData);
    
    const retrieved = await getTabResult('tab-sensitive');
    expect(retrieved?.duckDbResults?.[0].password).toBe('very_secret_password_here');
    
    // Explicitly delete it
    await removeTabResult('tab-sensitive');
    const remaining = await getTabResult('tab-sensitive');
    expect(remaining).toBeNull();
  });
});
