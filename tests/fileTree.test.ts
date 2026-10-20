import { describe, expect, test } from 'vitest';
import {
  sortEntries, quotePathForSql, dirnameOf, pickFileTreeRoot, shouldRefreshOnFocus,
  getDoubleClickAction, getExtension, joinPath, vfsToEntries, foldersToReload, type FileEntry,
} from '../src/utils/fileTree';

const e = (name: string, isDir = false): FileEntry => ({ name, path: name, isDir });

describe('sortEntries', () => {
  test('папки первыми, затем по имени', () => {
    const r = sortEntries([e('b.sql'), e('Zdir', true), e('a.sql'), e('adir', true)]);
    expect(r.map(x => x.name)).toEqual(['adir', 'Zdir', 'a.sql', 'b.sql']);
  });
  test('числа сортируются естественно и вход не меняется', () => {
    const src = [e('f10.txt'), e('f2.txt')];
    expect(sortEntries(src).map(x => x.name)).toEqual(['f2.txt', 'f10.txt']);
    expect(src[0].name).toBe('f10.txt');
  });
});

describe('quotePathForSql', () => {
  test('обратные слэши и кавычки', () => {
    expect(quotePathForSql('C:\\data\\o\'brien.csv')).toBe("'C:/data/o''brien.csv'");
  });
  test('обычный путь', () => {
    expect(quotePathForSql('/home/u/a.parquet')).toBe("'/home/u/a.parquet'");
  });
});

describe('dirnameOf / joinPath', () => {
  test('разные стили путей', () => {
    expect(dirnameOf('/home/u/db.duckdb')).toBe('/home/u');
    expect(dirnameOf('C:\\data\\db.duckdb')).toBe('C:\\data');
    expect(dirnameOf('/db.duckdb')).toBe('/');
    expect(dirnameOf('db.duckdb')).toBe('');
  });
  test('joinPath сохраняет стиль', () => {
    expect(joinPath('C:\\data', 'a.csv')).toBe('C:\\data\\a.csv');
    expect(joinPath('/home/u/', 'a.csv')).toBe('/home/u/a.csv');
    expect(joinPath('/home/u', 'a.csv')).toBe('/home/u/a.csv');
  });
});

describe('pickFileTreeRoot', () => {
  test('настройка важнее всего', () => {
    expect(pickFileTreeRoot({ configured: ' /x ', dbPath: '/a/b.db', home: '/h' })).toBe('/x');
  });
  test('папка БД, затем домашняя', () => {
    expect(pickFileTreeRoot({ dbPath: '/a/b.db', home: '/h' })).toBe('/a');
    expect(pickFileTreeRoot({ dbPath: ':memory:', home: '/h' })).toBe('/h');
    expect(pickFileTreeRoot({ home: '/h' })).toBe('/h');
    expect(pickFileTreeRoot({})).toBe('');
  });
});

describe('shouldRefreshOnFocus', () => {
  test('не чаще раза в 10 секунд', () => {
    expect(shouldRefreshOnFocus(10_000, 1_000)).toBe(false);
    expect(shouldRefreshOnFocus(11_000, 1_000)).toBe(true);
    expect(shouldRefreshOnFocus(5_000, 0, 5_000)).toBe(true);
  });
});

describe('getDoubleClickAction', () => {
  test('текст — вкладка, офис — внешняя программа, остальное — ничего', () => {
    expect(getDoubleClickAction(e('q.SQL'))).toBe('tab');
    expect(getDoubleClickAction(e('r.xlsb'))).toBe('external');
    expect(getDoubleClickAction(e('r.xls'))).toBe('external');
    expect(getDoubleClickAction(e('d.csv'))).toBe('none');
    expect(getDoubleClickAction(e('d.json'))).toBe('none');
    expect(getDoubleClickAction(e('dir.sql', true))).toBe('none');
    expect(getDoubleClickAction(e('noext'))).toBe('none');
  });
  test('getExtension', () => {
    expect(getExtension('a.b.TXT')).toBe('txt');
    expect(getExtension('.gitignore')).toBe('');
  });
});

describe('vfsToEntries / foldersToReload', () => {
  test('VFS: плоский список, дата из loadedAt', () => {
    const d = new Date(1000);
    const r = vfsToEntries([{ name: 'a.csv', size: 5, loadedAt: d }, { name: 'b.csv' }]);
    expect(r[0]).toMatchObject({ name: 'a.csv', path: 'a.csv', isDir: false, size: 5, modified: 1000 });
    expect(r[1].modified).toBeUndefined();
  });
  test('обновление читает только раскрытые папки', () => {
    expect(foldersToReload('/r', { '/r/a': true, '/r/b': false })).toEqual(['/r', '/r/a']);
  });
});
