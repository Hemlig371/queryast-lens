import './setupIndexedDB';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addSnippetToDB,
  updateSnippetInDB,
  deleteSnippetFromDB,
  saveSnippetsToDB,
  loadSnippetsFromDB
} from '../src/utils/snippetsStorage';
import { Snippet } from '../src/components/SqlSnippetsManager';

describe('snippetsStorage (IndexedDB storage)', () => {
  beforeEach(async () => {
    await saveSnippetsToDB([]);
  });

  it('should add a snippet and load it back', async () => {
    const snippet: Snippet = {
      id: 'snip_1',
      title: 'Get Active Users',
      sql: 'SELECT * FROM users WHERE active = true',
      category: 'Analytics',
      tags: ['users', 'active']
    };

    await addSnippetToDB(snippet);
    const snippets = await loadSnippetsFromDB();
    expect(snippets.length).toBe(1);
    expect(snippets[0].title).toBe('Get Active Users');
  });

  it('should update an existing snippet', async () => {
    const snippet: Snippet = {
      id: 'snip_1',
      title: 'Original Title',
      sql: 'SELECT 1',
      category: 'General'
    };

    await addSnippetToDB(snippet);

    const updated: Snippet = {
      ...snippet,
      title: 'Updated Title',
      sql: 'SELECT 100'
    };

    await updateSnippetInDB(updated);
    const snippets = await loadSnippetsFromDB();
    expect(snippets.length).toBe(1);
    expect(snippets[0].title).toBe('Updated Title');
    expect(snippets[0].sql).toBe('SELECT 100');
  });

  it('should delete snippet by id', async () => {
    const snippet: Snippet = {
      id: 'snip_1',
      title: 'To Delete',
      sql: 'SELECT 0'
    };

    await addSnippetToDB(snippet);
    let list = await loadSnippetsFromDB();
    expect(list.length).toBe(1);

    await deleteSnippetFromDB('snip_1');
    list = await loadSnippetsFromDB();
    expect(list.length).toBe(0);
  });

  it('should bulk save snippets to DB', async () => {
    const list: Snippet[] = [
      { id: '1', title: 'Template A', sql: 'SELECT A' },
      { id: '2', title: 'Template B', sql: 'SELECT B' }
    ];

    await saveSnippetsToDB(list);
    const loaded = await loadSnippetsFromDB();
    expect(loaded.length).toBe(2);
    expect(loaded.map(s => s.title)).toEqual(['Template A', 'Template B']);
  });
});
