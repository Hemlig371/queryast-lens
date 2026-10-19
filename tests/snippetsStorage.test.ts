import './setupIndexedDB';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addSnippetToDB,
  updateSnippetInDB,
  deleteSnippetFromDB,
  saveSnippetsToDB,
  loadSnippetsFromDB,
  getSnippetExportFilename
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

  describe('getSnippetExportFilename', () => {
    it('defaults to .sql when title has no extension', () => {
      const res = getSnippetExportFilename('Daily Sales Report', 'snip123');
      expect(res.extension).toBe('sql');
      expect(res.baseName).toBe('Daily_Sales_Report');
      expect(res.fileName).toBe('Daily_Sales_Report.sql');
    });

    it('preserves .md extension when title ends with .md', () => {
      const res = getSnippetExportFilename('README.md', 'snip123');
      expect(res.extension).toBe('md');
      expect(res.baseName).toBe('README');
      expect(res.fileName).toBe('README.md');
    });

    it('preserves .py extension when title ends with .py', () => {
      const res = getSnippetExportFilename('etl_transform.py', 'snip123');
      expect(res.extension).toBe('py');
      expect(res.baseName).toBe('etl_transform');
      expect(res.fileName).toBe('etl_transform.py');
    });

    it('preserves other explicit extensions like .json, .sh, .txt, .yaml', () => {
      const resJson = getSnippetExportFilename('config.json', 'snip123');
      expect(resJson.extension).toBe('json');
      expect(resJson.fileName).toBe('config.json');

      const resSh = getSnippetExportFilename('run_pipeline.sh', 'snip123');
      expect(resSh.extension).toBe('sh');
      expect(resSh.fileName).toBe('run_pipeline.sh');
    });

    it('handles fallback id when title base becomes empty', () => {
      const res = getSnippetExportFilename('???!!!.py', 'abcdef123456');
      expect(res.extension).toBe('py');
      expect(res.baseName).toBe('snippet_abcdef');
      expect(res.fileName).toBe('snippet_abcdef.py');
    });

    // Характеризующие: расширение берётся по последней точке (так задумано, п. 1.7 это не меняет)
    it('takes the extension after the last dot', () => {
      const v = getSnippetExportFilename('v1.2', 'snip123');
      expect(v.baseName).toBe('v1');
      expect(v.extension).toBe('2');
      expect(v.fileName).toBe('v1.2');

      const q = getSnippetExportFilename('My.Query.Final', 'snip123');
      expect(q.baseName).toBe('MyQuery');
      expect(q.extension).toBe('final');
      expect(q.fileName).toBe('MyQuery.final');
    });

    it('keeps other Cyrillic letters and drops punctuation', () => {
      const res = getSnippetExportFilename('Отчет по объему!', 'snip123');
      expect(res.fileName).toBe('Отчет_по_объему.sql');
    });

    // Новое поведение (п. 1.7): буква «ё» не вырезается
    it('keeps the letter ё in the file name', () => {
      const res = getSnippetExportFilename('Отчёт по объёму', 'snip123');
      expect(res.baseName).toBe('Отчёт_по_объёму');
      expect(res.extension).toBe('sql');
      expect(res.fileName).toBe('Отчёт_по_объёму.sql');
    });

    it('keeps the capital letter Ё', () => {
      const res = getSnippetExportFilename('Ёлка', 'snip123');
      expect(res.fileName).toBe('Ёлка.sql');
    });

    it('keeps ё together with an explicit extension', () => {
      const res = getSnippetExportFilename('ёж.md', 'snip123');
      expect(res.baseName).toBe('ёж');
      expect(res.extension).toBe('md');
      expect(res.fileName).toBe('ёж.md');
    });
  });
});
