import './setupIndexedDB';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveVersion,
  getVersions,
  getLatestVersion,
  getVersionById,
  deleteVersion,
  clearAllVersions,
  importVersions,
  cleanupOldVersions
} from '../src/utils/versionHistory';

describe('versionHistory (IndexedDB storage)', () => {
  beforeEach(async () => {
    await clearAllVersions();
  });

  it('should save a version and retrieve it', async () => {
    const item = await saveVersion('SELECT 1 FROM test', 'Manual Snapshot', false);
    expect(item).toBeDefined();
    expect(item.sql).toBe('SELECT 1 FROM test');
    expect(item.label).toBe('Manual Snapshot');
    expect(item.isAutoSave).toBe(false);

    const versions = await getVersions();
    expect(versions.length).toBe(1);
    expect(versions[0].id).toBe(item.id);
  });

  it('should retrieve latest version', async () => {
    await saveVersion('SELECT 1', 'Ver 1', true);
    // Small pause to ensure timestamp order
    await new Promise(r => setTimeout(r, 10));
    const v2 = await saveVersion('SELECT 2', 'Ver 2', true);

    const latest = await getLatestVersion();
    expect(latest).not.toBeNull();
    expect(latest?.sql).toBe('SELECT 2');
  });

  it('should delete a version by id', async () => {
    const item = await saveVersion('SELECT 1', 'To Delete', false);
    let versions = await getVersions();
    expect(versions.length).toBe(1);

    await deleteVersion(item.id);
    versions = await getVersions();
    expect(versions.length).toBe(0);
  });

  it('should get version by id', async () => {
    const item = await saveVersion('SELECT * FROM users', 'User Query', false);
    const fetched = await getVersionById(item.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.sql).toBe('SELECT * FROM users');
  });

  it('should import multiple versions', async () => {
    const items = [
      {
        id: 'ver_1',
        timestamp: 1000,
        formattedTime: '01.01.2025',
        sql: 'SELECT 10',
        isAutoSave: false,
        charCount: 9,
        lineCount: 1
      },
      {
        id: 'ver_2',
        timestamp: 2000,
        formattedTime: '01.01.2025',
        sql: 'SELECT 20',
        isAutoSave: true,
        charCount: 9,
        lineCount: 1
      }
    ];

    await importVersions(items);
    const loaded = await getVersions();
    expect(loaded.length).toBe(2);
  });

  it('should throw error when saving empty query', async () => {
    await expect(saveVersion('   ')).rejects.toThrow('SQL query is empty');
  });
});
