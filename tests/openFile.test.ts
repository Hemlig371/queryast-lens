import { describe, it, expect } from 'vitest';
import { decideOpenFile, MAX_OPEN_FILE_BYTES } from '../src/utils/openFile';

const tabs = [
  { id: '1', filePath: 'C:\\sql\\a.sql' },
  { id: '2' },
  { id: '3', filePath: '/home/u/b.sql' },
];

describe('decideOpenFile (C-07)', () => {
  it('новый файл — открыть', () => {
    expect(decideOpenFile({ size: 100 }, 'C:\\sql\\new.sql', tabs)).toEqual({ kind: 'open' });
  });
  it('тот же путь — переключиться на вкладку, не дублировать', () => {
    expect(decideOpenFile({ size: 100 }, 'C:\\sql\\a.sql', tabs)).toEqual({ kind: 'activate', tabId: '1' });
    expect(decideOpenFile({ size: 100 }, '/home/u/b.sql', tabs)).toEqual({ kind: 'activate', tabId: '3' });
  });
  it('путь другого регистра — другой файл (регистр не приводим)', () => {
    expect(decideOpenFile({ size: 100 }, 'C:\\SQL\\A.sql', tabs)).toEqual({ kind: 'open' });
  });
  it('без пути (браузер) дубликаты не определяются, вкладки без пути не совпадают', () => {
    expect(decideOpenFile({ size: 100 }, undefined, tabs)).toEqual({ kind: 'open' });
    expect(decideOpenFile({ size: 100 }, '', tabs)).toEqual({ kind: 'open' });
  });
  it('слишком большой файл — отказ; ровно предел — можно', () => {
    expect(decideOpenFile({ size: MAX_OPEN_FILE_BYTES + 1 }, 'C:\\x.sql', tabs)).toEqual({ kind: 'tooLarge' });
    expect(decideOpenFile({ size: MAX_OPEN_FILE_BYTES }, 'C:\\x.sql', tabs)).toEqual({ kind: 'open' });
  });
  it('уже открытый файл переключается, даже если он вырос сверх предела', () => {
    expect(decideOpenFile({ size: MAX_OPEN_FILE_BYTES * 2 }, 'C:\\sql\\a.sql', tabs)).toEqual({ kind: 'activate', tabId: '1' });
  });
  it('свой предел', () => {
    expect(decideOpenFile({ size: 11 }, undefined, [], 10)).toEqual({ kind: 'tooLarge' });
  });
  it('нет вкладок', () => {
    expect(decideOpenFile({ size: 1 }, 'x', [])).toEqual({ kind: 'open' });
  });
});
