import { describe, it, expect } from 'vitest';
import { mergeTabResult, shouldPersistTabResult } from '../src/utils/tabResultState';
import { copyResultRows } from '../src/utils/copyResult';
import type { TabResultData } from '../src/utils/resultStorage';

// Обновление результата вкладки, которая не активна (executeX → updateEngineState, ветка «другая вкладка»).
// Первая группа — обычное обновление, вторая — COPY ClickHouse в исходную вкладку.

const baseTab = (over: Partial<TabResultData> = {}): TabResultData => ({
  duckDbResults: [{ old: 1 }],
  queryExecutionDuration: '0.10',
  resultColumnTypes: { old: 'INT' },
  isDuckDbResultVisible: true,
  duckDbPage: 1,
  duckDbError: null,
  lastExecutedSql: 'SELECT 1',
  ...over,
});

describe('mergeTabResult: прежнее поведение', () => {
  it('нет записи: создаётся пустая запись и применяются обновления', () => {
    const r = mergeTabResult(null, { results: [{ a: 1 }], duration: '0.5', colTypes: { a: 'INT' } }, { queryToExec: 'SELECT a', page: 2 });
    expect(r.duckDbResults).toEqual([{ a: 1 }]);
    expect(r.queryExecutionDuration).toBe('0.5');
    expect(r.resultColumnTypes).toEqual({ a: 'INT' });
    expect(r.isDuckDbResultVisible).toBe(true);
    expect(r.duckDbPage).toBe(2);
    expect(r.lastExecutedSql).toBe('SELECT a');
    expect(r.duckDbError).toBeNull();
  });

  it('не переданные поля остаются как были; страница и запрос обновляются всегда', () => {
    const r = mergeTabResult(baseTab(), { duration: '0.9' }, { queryToExec: 'SELECT 2', page: 3 });
    expect(r.duckDbResults).toEqual([{ old: 1 }]);
    expect(r.queryExecutionDuration).toBe('0.9');
    expect(r.resultColumnTypes).toEqual({ old: 'INT' });
    expect(r.duckDbPage).toBe(3);
    expect(r.lastExecutedSql).toBe('SELECT 2');
  });

  it('исходная запись не изменяется', () => {
    const src = baseTab();
    const snapshot = JSON.parse(JSON.stringify(src));
    mergeTabResult(src, { results: [{ z: 9 }], error: 'boom' }, { queryToExec: 'q', page: 5 });
    expect(src).toEqual(snapshot);
  });

  it('видимость результата: ошибка делает видимым, сброс (results: null) и очистка ошибки — нет', () => {
    const hidden = baseTab({ isDuckDbResultVisible: false });
    expect(mergeTabResult(hidden, { error: 'boom' }, { queryToExec: 'q', page: 1 }).isDuckDbResultVisible).toBe(true);
    expect(mergeTabResult(hidden, { results: null, duration: null }, { queryToExec: 'q', page: 1 }).isDuckDbResultVisible).toBe(false);
    expect(mergeTabResult(hidden, { error: null }, { queryToExec: 'q', page: 1 }).isDuckDbResultVisible).toBe(false);
  });

  it('shouldPersistTabResult: запись сохраняется только при изменении results или error', () => {
    expect(shouldPersistTabResult({ results: [] })).toBe(true);
    expect(shouldPersistTabResult({ results: null })).toBe(true);
    expect(shouldPersistTabResult({ error: 'x' })).toBe(true);
    expect(shouldPersistTabResult({ duration: '1' })).toBe(false);
    expect(shouldPersistTabResult({})).toBe(false);
  });
});

describe('mergeTabResult: порядок столбцов', () => {
  it('columns сохраняются вместе с результатом и сбрасываются, если новый результат пришёл без них', () => {
    const withCols = mergeTabResult(baseTab(), { results: [{ b: 1, a: 2 }], columns: ['b', 'a'] }, { queryToExec: 'q', page: 1 });
    expect(withCols.resultColumns).toEqual(['b', 'a']);
    const without = mergeTabResult(withCols, { results: [{ c: 1 }] }, { queryToExec: 'q2', page: 1 });
    expect(without.resultColumns).toBeNull();
    const keep = mergeTabResult(withCols, { duration: '2' }, { queryToExec: 'q', page: 1 });
    expect(keep.resultColumns).toEqual(['b', 'a']);
  });
});

describe('COPY ClickHouse пишет результат в исходную вкладку', () => {
  it('строки результата COPY TO / FROM (форма как раньше)', () => {
    expect(copyResultRows({ kind: 'TO', filePath: 'out.csv', message: 'ok', bytes: 12 })).toEqual([
      { Status: 'Success (COPY TO)', File: 'out.csv', Message: 'ok', Bytes: '12 bytes' },
    ]);
    expect(copyResultRows({ kind: 'TO', filePath: 'out.csv', message: 'File saved (0 bytes)' })).toEqual([
      { Status: 'Success (COPY TO)', File: 'out.csv', Message: 'File saved (0 bytes)' },
    ]);
    expect(copyResultRows({ kind: 'FROM', filePath: 'in.csv', message: 'loaded', response: '' })).toEqual([
      { Status: 'Success (COPY FROM)', File: 'in.csv', Message: 'loaded', Response: 'OK' },
    ]);
    expect(copyResultRows({ kind: 'FROM', filePath: 'in.csv', message: 'loaded', response: 'Ok.' })[0].Response).toBe('Ok.');
  });

  it('результат COPY попадает в запись исходной вкладки, а запись другой вкладки не меняется', () => {
    const originTab = baseTab({ duckDbResults: null, lastExecutedSql: "COPY (SELECT 1) TO 'x.csv'" });
    const otherTab = baseTab();
    const rows = copyResultRows({ kind: 'TO', filePath: 'x.csv', message: 'saved', bytes: 5 });
    const saved = mergeTabResult(originTab, { results: rows, duration: '0.20', colTypes: {}, columns: Object.keys(rows[0]) }, {
      queryToExec: "COPY (SELECT 1) TO 'x.csv'",
      page: 1,
    });
    expect(saved.duckDbResults).toEqual(rows);
    expect(saved.resultColumns).toEqual(['Status', 'File', 'Message', 'Bytes']);
    expect(saved.isDuckDbResultVisible).toBe(true);
    expect(saved.queryExecutionDuration).toBe('0.20');
    expect(otherTab.duckDbResults).toEqual([{ old: 1 }]);
  });
});
