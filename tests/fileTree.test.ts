import { describe, expect, test } from 'vitest';
import {
  sortEntries, quotePathForSql, dirnameOf, pickFileTreeRoot, shouldRefreshOnFocus,
  getDoubleClickAction, getExtension, joinPath, vfsToEntries, foldersToReload, type FileEntry,
  nextSort, normalizeFileSort, defaultSortDir, nameMatches, hasMatchingDescendant, filterEntries,
  detectPlatform, isSameOrInside, dropPathKeys, remapPath, validateNewName, renameSelectionEnd,
  planMove, nameTaken, TREE_DRAG_MIME,
} from '../src/utils/fileTree';

const e = (name: string, isDir = false): FileEntry => ({ name, path: name, isDir });
const f = (name: string, extra: Partial<FileEntry> = {}): FileEntry => ({ name, path: name, isDir: false, ...extra });

describe('sortEntries: дата и размер', () => {
  const list = [
    f('old.txt', { size: 5, modified: 100 }),
    f('big.txt', { size: 900, modified: 200 }),
    f('mid.txt', { size: 50, modified: 300 }),
    e('zdir', true),
    { ...e('adir', true), modified: 50 },
    f('nodata.txt'),
  ];
  test('по дате: новые сверху, без даты — в конце, папки первыми', () => {
    const r = sortEntries(list, { key: 'date', dir: 'desc' }).map(x => x.name);
    // у папок тоже сортировка по дате: adir (50) новее zdir (без даты)
    expect(r).toEqual(['adir', 'zdir', 'mid.txt', 'big.txt', 'old.txt', 'nodata.txt']);
  });
  test('по дате: старые сверху', () => {
    const r = sortEntries(list, { key: 'date', dir: 'asc' }).map(x => x.name);
    expect(r.slice(2)).toEqual(['nodata.txt', 'old.txt', 'big.txt', 'mid.txt']);
  });
  test('по размеру: крупные сверху; папки по имени А→Я при любом направлении', () => {
    expect(sortEntries(list, { key: 'size', dir: 'desc' }).map(x => x.name))
      .toEqual(['adir', 'zdir', 'big.txt', 'mid.txt', 'old.txt', 'nodata.txt']);
    expect(sortEntries(list, { key: 'size', dir: 'asc' }).map(x => x.name))
      .toEqual(['adir', 'zdir', 'nodata.txt', 'old.txt', 'mid.txt', 'big.txt']);
  });
  test('равные значения — по имени А→Я', () => {
    const r = sortEntries([f('b', { size: 1 }), f('a', { size: 1 })], { key: 'size', dir: 'desc' });
    expect(r.map(x => x.name)).toEqual(['a', 'b']);
  });
  test('по имени Я→А: папки всё равно первыми', () => {
    const r = sortEntries([e('a', true), f('b.sql'), f('c.sql'), e('b', true)], { key: 'name', dir: 'desc' });
    expect(r.map(x => x.name)).toEqual(['b', 'a', 'c.sql', 'b.sql']);
  });
});

describe('nextSort / normalizeFileSort', () => {
  test('другой ключ — направление по умолчанию, тот же — разворот', () => {
    expect(defaultSortDir('name')).toBe('asc');
    expect(defaultSortDir('date')).toBe('desc');
    expect(defaultSortDir('size')).toBe('desc');
    expect(nextSort({ key: 'name', dir: 'asc' }, 'date')).toEqual({ key: 'date', dir: 'desc' });
    expect(nextSort({ key: 'date', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' });
    expect(nextSort({ key: 'date', dir: 'asc' }, 'date')).toEqual({ key: 'date', dir: 'desc' });
  });
  test('мусор из сессии → по имени', () => {
    expect(normalizeFileSort(undefined)).toEqual({ key: 'name', dir: 'asc' });
    expect(normalizeFileSort({ key: 'x', dir: 'asc' })).toEqual({ key: 'name', dir: 'asc' });
    expect(normalizeFileSort({ key: 'size', dir: 'asc' })).toEqual({ key: 'size', dir: 'asc' });
  });
});

describe('поиск по загруженному дереву', () => {
  const tree: Record<string, FileEntry[]> = {
    '/r': [{ name: 'sub', path: '/r/sub', isDir: true }, f('Report.sql', { path: '/r/Report.sql' }), f('x.csv', { path: '/r/x.csv' })],
    '/r/sub': [{ name: 'deep', path: '/r/sub/deep', isDir: true }, f('notes.txt', { path: '/r/sub/notes.txt' })],
    '/r/sub/deep': [f('report_old.sql', { path: '/r/sub/deep/report_old.sql' })],
  };
  test('nameMatches: без регистра, пустой запрос подходит всем', () => {
    expect(nameMatches('Report.SQL', 'report')).toBe(true);
    expect(nameMatches('a', ' ')).toBe(true);
    expect(nameMatches('a', 'b')).toBe(false);
  });
  test('папка видна, если внутри (из загруженного) есть найденное, на любой глубине', () => {
    expect(hasMatchingDescendant(tree, '/r/sub', 'report')).toBe(true);
    expect(hasMatchingDescendant(tree, '/r/sub', 'notes')).toBe(true);
    expect(hasMatchingDescendant(tree, '/r/sub', 'zzz')).toBe(false);
  });
  test('filterEntries: совпадения и папки на пути к ним', () => {
    expect(filterEntries(tree['/r'], tree, 'report').map(x => x.name)).toEqual(['sub', 'Report.sql']);
    expect(filterEntries(tree['/r'], tree, 'csv').map(x => x.name)).toEqual(['x.csv']);
    expect(filterEntries(tree['/r'], tree, 'zzz')).toEqual([]);
    expect(filterEntries(tree['/r'], tree, '')).toBe(tree['/r']);
  });
  test('не загруженное не ищется: папка без списка не считается подходящей', () => {
    expect(filterEntries([{ name: 'unloaded', path: '/u', isDir: true }], {}, 'report')).toEqual([]);
  });
  test('цикл ссылок не вешает поиск', () => {
    const loop: Record<string, FileEntry[]> = { '/a': [{ name: 'b', path: '/b', isDir: true }], '/b': [{ name: 'a', path: '/a', isDir: true }] };
    expect(hasMatchingDescendant(loop, '/a', 'zzz')).toBe(false);
  });
});

describe('пути: платформа, вложенность, переименование', () => {
  test('detectPlatform', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit')).toBe('windows');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
  });
  test('isSameOrInside: оба разделителя, соседние имена не считаются вложенными', () => {
    expect(isSameOrInside('/a/b', '/a/b')).toBe(true);
    expect(isSameOrInside('/a/b/c.txt', '/a/b')).toBe(true);
    expect(isSameOrInside('C:\\a\\b\\c.txt', 'C:\\a\\b')).toBe(true);
    expect(isSameOrInside('./a\\b', './a')).toBe(true);
    expect(isSameOrInside('/a/bc', '/a/b')).toBe(false);
    expect(isSameOrInside('/a', '')).toBe(false);
  });
  test('dropPathKeys убирает папку и всё внутри', () => {
    expect(dropPathKeys({ '/r/a': 1, '/r/a/x': 2, '/r/ab': 3, '/r': 4 }, '/r/a')).toEqual({ '/r/ab': 3, '/r': 4 });
  });
  test('remapPath: сам путь, вложенный и чужой', () => {
    expect(remapPath('/r/a', '/r/a', '/r/b')).toBe('/r/b');
    expect(remapPath('/r/a/x.sql', '/r/a', '/r/b')).toBe('/r/b/x.sql');
    expect(remapPath('/r/ab/x.sql', '/r/a', '/r/b')).toBeNull();
  });
  test('validateNewName', () => {
    expect(validateNewName('  ', 'linux')).toBe('empty');
    expect(validateNewName('a/b', 'linux')).toBe('invalid');
    expect(validateNewName('a\\b', 'linux')).toBe('invalid');
    expect(validateNewName('..', 'linux')).toBe('invalid');
    expect(validateNewName('a:b', 'linux')).toBeNull();
    expect(validateNewName('a:b', 'windows')).toBe('invalid');
    expect(validateNewName('a.', 'windows')).toBe('invalid');
    expect(validateNewName('отчёт 1.sql', 'windows')).toBeNull();
  });
  test('renameSelectionEnd: без расширения; папки и скрытые файлы целиком', () => {
    expect(renameSelectionEnd('report.final.sql', false)).toBe('report.final'.length);
    expect(renameSelectionEnd('.gitignore', false)).toBe('.gitignore'.length);
    expect(renameSelectionEnd('dir.v2', true)).toBe('dir.v2'.length);
    expect(renameSelectionEnd('noext', false)).toBe(5);
  });
});

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
  test('корень диска Windows сохраняет разделитель', () => {
    expect(dirnameOf('C:\\db.duckdb')).toBe('C:\\');
    expect(dirnameOf('d:/db.duckdb')).toBe('d:/');
    expect(dirnameOf('C:\\data\\db.duckdb')).toBe('C:\\data');
    expect(joinPath(dirnameOf('C:\\db.duckdb'), 'a.csv')).toBe('C:\\a.csv');
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
  test('БД в корне диска: корень дерева — C:\\, а не C:', () => {
    expect(pickFileTreeRoot({ dbPath: 'C:\\db.duckdb', home: 'C:\\Users\\u' })).toBe('C:\\');
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

describe('перенос в папку: planMove и nameTaken', () => {
  test('та же папка — ничего не делать', () => {
    expect(planMove('/r/a/f.txt', '/r/a', '/r/a')).toBe('same');
    expect(planMove('/r/a/f.txt', '/r/a', '/r/a/')).toBe('same');
    expect(planMove('C:\\r\\a\\f.txt', 'C:\\r\\a', 'C:/r/a')).toBe('same');
  });
  test('папку нельзя бросить в себя и во вложенную', () => {
    expect(planMove('/r/a', '/r', '/r/a')).toBe('into_self');
    expect(planMove('/r/a', '/r', '/r/a/b/c')).toBe('into_self');
    expect(planMove('C:\\r\\a', 'C:\\r', 'C:\\r\\a\\b')).toBe('into_self');
  });
  test('соседняя папка с похожим именем — допустимо', () => {
    expect(planMove('/r/a', '/r', '/r/ab')).toBe('ok');
    expect(planMove('/r/a/f.txt', '/r/a', '/r')).toBe('ok');
    expect(planMove('/r/a/f.txt', '/r/a', '/r/b')).toBe('ok');
  });
  test('корень «/»: перенос из подпапки в корень', () => {
    expect(planMove('/a/f.txt', '/a', '/')).toBe('ok');
    expect(planMove('/f.txt', '/', '/')).toBe('same');
  });
  test('занятое имя: Windows/macOS без учёта регистра, Linux — с учётом', () => {
    const list = [f('Data.csv'), e('sub', true)];
    expect(nameTaken(list, 'Data.csv', false)).toBe(true);
    expect(nameTaken(list, 'data.csv', true)).toBe(true);
    expect(nameTaken(list, 'data.csv', false)).toBe(false);
    expect(nameTaken(list, 'new.csv', true)).toBe(false);
    expect(nameTaken(undefined, 'x', true)).toBe(false);
  });
  test('тип данных перетаскивания не совпадает с text/plain', () => {
    expect(TREE_DRAG_MIME).not.toBe('text/plain');
    expect(TREE_DRAG_MIME).toBe(TREE_DRAG_MIME.toLowerCase());
  });
});
