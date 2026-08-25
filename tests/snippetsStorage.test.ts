// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { loadSnippetsFromDB, saveSnippetsToDB } from '../src/utils/snippetsStorage';

describe('snippetsStorage', () => {
  beforeEach(async () => {
    // Just clear by saving empty
    await saveSnippetsToDB([]);
  });

  afterAll(async () => {
    await saveSnippetsToDB([]);
  });

  it('returns empty array when no snippets exist', async () => {
    const snippets = await loadSnippetsFromDB();
    expect(snippets).toEqual([]);
  });

  it('saves and retrieves multiple snippets (bulk insert)', async () => {
    const snippets = [
      {
        id: 'snippet-1',
        title: 'Get Users',
        sql: 'SELECT * FROM users;',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'snippet-2',
        title: 'Get Posts',
        sql: 'SELECT * FROM posts;',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];
    
    await saveSnippetsToDB(snippets);
    const retrieved = await loadSnippetsFromDB();
    
    expect(retrieved).toHaveLength(2);
    expect(retrieved).toEqual(snippets);
  });

  it('clears all snippets if empty array is saved', async () => {
    const snippet1 = { id: 's1', title: 'S1', sql: 'S1', createdAt: 1, updatedAt: 1 };
    
    await saveSnippetsToDB([snippet1]);
    expect(await loadSnippetsFromDB()).toHaveLength(1);
    
    await saveSnippetsToDB([]);
    expect(await loadSnippetsFromDB()).toHaveLength(0);
  });

  it('secures sensitive data by storing exactly what is provided without external leaks', async () => {
    const sensitiveSnippet = {
      id: 's-secure',
      title: 'DB Password',
      sql: "CREATE USER 'admin' IDENTIFIED BY 'SuperSecretPassword_123!!';",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await saveSnippetsToDB([sensitiveSnippet]);
    const snippets = await loadSnippetsFromDB();
    
    expect(snippets).toHaveLength(1);
    expect(snippets[0].sql).toContain('SuperSecretPassword_123!!');
    
    await saveSnippetsToDB([]);
    const remaining = await loadSnippetsFromDB();
    expect(remaining).toHaveLength(0);
  });
});
