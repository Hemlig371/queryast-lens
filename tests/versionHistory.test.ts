import 'fake-indexeddb/auto'; 
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { 
  saveVersion, 
  getVersions, 
  getLatestVersion, 
  deleteVersion, 
  clearAllVersions, 
  importVersions 
} from '../src/utils/versionHistory';

describe('versionHistory', () => {
  beforeAll(() => {
    (global as any).window = {
      indexedDB: (global as any).indexedDB
    };
  });

  afterAll(() => {
    delete (global as any).window;
  });

  beforeEach(async () => {
    await clearAllVersions();
  });

  it('saveVersion throws if SQL is empty', async () => {
    await expect(saveVersion('   ')).rejects.toThrow('SQL query is empty');
  });

  it('should save a version and retrieve it', async () => {
    const item = await saveVersion('SELECT 1;', 'Test Label');
    expect(item).not.toBeNull();
    expect(item.sql).toBe('SELECT 1;');
    expect(item.label).toBe('Test Label');
    expect(item.charCount).toBe(9);
    expect(item.lineCount).toBe(1);

    const versions = await getVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe(item.id);
  });

  it('should auto-generate label if not provided', async () => {
    const manualItem = await saveVersion('SELECT 2;');
    expect(manualItem.label).toBe('Ручной снимок');

    const autoItem = await saveVersion('SELECT 3;', undefined, true);
    expect(autoItem.label).toBe('Автосохранение');
  });

  it('should return latest version correctly', async () => {
    await saveVersion('SELECT 1;');
    await new Promise(r => setTimeout(r, 2)); 
    await saveVersion('SELECT 2;');
    
    const latest = await getLatestVersion();
    expect(latest?.sql).toBe('SELECT 2;');
  });

  it('should delete a specific version', async () => {
    const v1 = await saveVersion('SELECT 1;');
    await new Promise(r => setTimeout(r, 2)); 
    const v2 = await saveVersion('SELECT 2;');
    
    await deleteVersion(v1.id);
    const versions = await getVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe(v2.id);
  });

  it('should import versions correctly', async () => {
    const dummyVersions = [
      {
        id: 'imported_1',
        timestamp: 1000,
        formattedTime: '01.01.2023, 00:00:00',
        sql: 'SELECT * FROM test',
        label: 'Imported 1',
        isAutoSave: false,
        charCount: 18,
        lineCount: 1
      }
    ];

    await importVersions(dummyVersions);
    const versions = await getVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0].sql).toBe('SELECT * FROM test');
  });
});
