import { describe, it, expect } from 'vitest';
import { uniqueColumnNames, rowsFromColumns, getResultColumns, columnsFromMeta, setOwnKey } from '../src/utils/resultRows';

// строки результата — объекты; одинаковые имена не должны схлопываться, порядок — не зависеть от числовых имён.

describe('uniqueColumnNames', () => {
  it('уникальные имена остаются как есть', () => {
    expect(uniqueColumnNames(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(uniqueColumnNames([])).toEqual([]);
  });

  it('повторы получают суффикс _1, _2, … по порядку появления (как в обёртке DuckDB)', () => {
    expect(uniqueColumnNames(['a', 'a', 'b', 'a'])).toEqual(['a', 'a_1', 'b', 'a_2']);
  });

  it('суффикс не совпадает с настоящим именем другого столбца', () => {
    expect(uniqueColumnNames(['a', 'a', 'a_1'])).toEqual(['a', 'a_2', 'a_1']);
    expect(uniqueColumnNames(['a_1', 'a', 'a'])).toEqual(['a_1', 'a', 'a_2']);
  });

  it('регистр различает имена; пустое имя тоже уникализируется', () => {
    expect(uniqueColumnNames(['A', 'a'])).toEqual(['A', 'a']);
    expect(uniqueColumnNames(['', ''])).toEqual(['', '_1']);
  });

  it('три одинаковых имени дают a, a_1, a_2 — как DuckDB в SELECT * FROM (SELECT 1 a, 2 a, 3 a)', () => {
    expect(uniqueColumnNames(['a', 'a', 'a'])).toEqual(['a', 'a_1', 'a_2']);
  });

  it('не строки приводятся к строкам', () => {
    expect(uniqueColumnNames([1, 1, null as unknown as string])).toEqual(['1', '1_1', 'null']);
  });
});

describe('rowsFromColumns', () => {
  it('дубли имён не схлопываются, значения сохраняются по позициям', () => {
    const { columns, rows } = rowsFromColumns(['a', 'a', 'b'], [[1, 2, 3], [4, 5, 6]]);
    expect(columns).toEqual(['a', 'a_1', 'b']);
    expect(rows).toEqual([{ a: 1, a_1: 2, b: 3 }, { a: 4, a_1: 5, b: 6 }]);
  });

  it('числовые имена: порядок хранится в columns, а не в объекте', () => {
    const { columns, rows } = rowsFromColumns(['2', '1', 'b'], [['x', 'y', 'z']]);
    expect(columns).toEqual(['2', '1', 'b']);
    expect(rows[0]['2']).toBe('x');
    expect(rows[0]['1']).toBe('y');
    // сам объект перечисляет целочисленные ключи по возрастанию — поэтому порядок берём из columns
    expect(Object.keys(rows[0])).toEqual(['1', '2', 'b']);
    expect(getResultColumns(rows, columns)).toEqual(['2', '1', 'b']);
  });

  it('нет строк — columns всё равно возвращается; нет столбцов — пусто', () => {
    expect(rowsFromColumns(['a'], [])).toEqual({ columns: ['a'], rows: [] });
    expect(rowsFromColumns([], [])).toEqual({ columns: [], rows: [] });
  });

  it('значения bigint, null, вложенные не меняются', () => {
    const nested = { k: [1] };
    const { rows } = rowsFromColumns(['a', 'b', 'c'], [[10n, null, nested]]);
    expect(rows[0].a).toBe(10n);
    expect(rows[0].b).toBeNull();
    expect(rows[0].c).toBe(nested);
  });

  it('имя __proto__ становится обычным ключом и не меняет прототип', () => {
    const { rows } = rowsFromColumns(['__proto__', 'a'], [[1, 2]]);
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
    expect(Object.keys(rows[0])).toEqual(['__proto__', 'a']);
    expect(Object.getOwnPropertyDescriptor(rows[0], '__proto__')?.value).toBe(1);
  });
});

describe('getResultColumns', () => {
  it('нет columns — ключи первой строки', () => {
    expect(getResultColumns([{ a: 1, b: 2 }])).toEqual(['a', 'b']);
    expect(getResultColumns([{ a: 1, b: 2 }], null)).toEqual(['a', 'b']);
  });

  it('columns используются, если это те же имена, что и ключи строки', () => {
    expect(getResultColumns([{ a: 1, b: 2 }], ['b', 'a'])).toEqual(['b', 'a']);
  });

  it('columns от другого результата игнорируются', () => {
    expect(getResultColumns([{ a: 1, b: 2 }], ['b', 'c'])).toEqual(['a', 'b']);
    expect(getResultColumns([{ a: 1, b: 2 }], ['a'])).toEqual(['a', 'b']);
    expect(getResultColumns([{ a: 1 }], ['a', 'a'])).toEqual(['a']);
  });

  it('пустой или некорректный результат — пустой список', () => {
    expect(getResultColumns(null)).toEqual([]);
    expect(getResultColumns(undefined, ['a'])).toEqual([]);
    expect(getResultColumns([])).toEqual([]);
    expect(getResultColumns([null as unknown as object])).toEqual([]);
  });
});

describe('columnsFromMeta', () => {
  it('имена из meta ClickHouse / dev-сервера в порядке выдачи', () => {
    expect(columnsFromMeta([{ name: 'b', type: 'Int32' }, { name: 'a', type: 'String' }])).toEqual(['b', 'a']);
  });

  it('нет meta или в ней нет имён — null', () => {
    expect(columnsFromMeta(undefined)).toBeNull();
    expect(columnsFromMeta([])).toBeNull();
    expect(columnsFromMeta([{ type: 'x' }])).toBeNull();
    expect(columnsFromMeta('x')).toBeNull();
  });
});

describe('setOwnKey', () => {
  it('обычный ключ записывается как obj[key]', () => {
    const o: Record<string, string> = {};
    setOwnKey(o, 'a', 'Int32');
    expect(o).toEqual({ a: 'Int32' });
  });

  it('ключ __proto__ становится собственным свойством, а не теряется и не возвращает Object.prototype', () => {
    const o: Record<string, string> = {};
    setOwnKey(o, '__proto__', 'VARCHAR');
    expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
    expect(o['__proto__']).toBe('VARCHAR');
    expect(typeof o['__proto__'].trim).toBe('function');
    expect(Object.keys(o)).toEqual(['__proto__']);
  });

  it('rowsFromColumns по-прежнему кладёт значение в столбец __proto__', () => {
    const { columns, rows } = rowsFromColumns(['__proto__', 'x'], [['p', 1]]);
    expect(columns).toEqual(['__proto__', 'x']);
    expect(rows[0]['__proto__']).toBe('p');
  });
});
