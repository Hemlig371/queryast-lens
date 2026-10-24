import { describe, it, expect } from 'vitest';
import { normalizeWasmTable, normalizeWasmValue, describeArrowType, WASM_MAX_ROWS } from '../src/utils/wasmResult';

// значения результата DuckDB-WASM приводятся к виду Tauri.
// ВАЖНО: тесты идут на заглушках Arrow, собранных по описанию библиотеки; реальные значения WASM-сборки НЕ сняты
// (см. tools/wasm-diagnostics.html). Ожидаемый вид — по Rust-коду execute_query (main.rs).

const type = (text: string, extra: Record<string, unknown> = {}) => ({ toString: () => text, ...extra });
const field = (name: string, t: string, extra: Record<string, unknown> = {}) => ({ name, type: type(t, extra) });

/** Таблица-заглушка: колонки как массивы значений, доступ через getChildAt(i).get(r). */
function table(fields: ReturnType<typeof field>[], columns: unknown[][], opts: { numRows?: number } = {}) {
  const gets = fields.map(() => 0);
  const numRows = opts.numRows ?? (columns[0]?.length ?? 0);
  return {
    numRows,
    schema: { fields },
    getChildAt: (i: number) => ({ get: (r: number) => { gets[i]++; return columns[i][r % columns[i].length]; } }),
    gets,
  };
}

const MAY_1_2024_MS = Date.UTC(2024, 4, 1);
const T_14_30 = Date.UTC(2024, 4, 1, 14, 30, 0);

describe('describeArrowType', () => {
  it('классифицирует типы по строковому описанию', () => {
    expect(describeArrowType(type('Date32<DAY>')).kind).toBe('date');
    expect(describeArrowType(type('Timestamp<MICROSECOND>')).kind).toBe('timestamp');
    expect(describeArrowType(type('Timestamp<MICROSECOND, UTC>'))).toMatchObject({ kind: 'timestamp', unit: 'MICROSECOND', tz: true });
    expect(describeArrowType(type('Time64<MICROSECOND>'))).toMatchObject({ kind: 'time', unit: 'MICROSECOND' });
    expect(describeArrowType(type('Decimal[18e3]'))).toMatchObject({ kind: 'decimal', scale: 3 });
    expect(describeArrowType(type('Decimal', { scale: 2 }))).toMatchObject({ kind: 'decimal', scale: 2 });
    expect(describeArrowType(type('Interval<MONTH_DAY_NANO>'))).toMatchObject({ kind: 'interval', unit: 'MONTH_DAY_NANO' });
    expect(describeArrowType(type('Binary')).kind).toBe('binary');
    expect(describeArrowType(type('List<Int32>')).kind).toBe('nested');
    expect(describeArrowType(type('Struct<{a: Int32}>')).kind).toBe('nested');
    expect(describeArrowType(type('Map<Utf8, Int32>')).kind).toBe('nested');
    expect(describeArrowType(type('Int64')).kind).toBe('other');
    expect(describeArrowType(undefined).kind).toBe('other');
  });
});

describe('normalizeWasmValue: скаляры', () => {
  it('NULL, BOOLEAN, INTEGER, DOUBLE, VARCHAR остаются как есть', () => {
    expect(normalizeWasmValue(null, describeArrowType(type('Int32')))).toBeNull();
    expect(normalizeWasmValue(undefined, describeArrowType(type('Int32')))).toBeNull();
    expect(normalizeWasmValue(true, describeArrowType(type('Bool')))).toBe(true);
    expect(normalizeWasmValue(42, describeArrowType(type('Int32')))).toBe(42);
    expect(normalizeWasmValue(1.5, describeArrowType(type('Float64')))).toBe(1.5);
    expect(normalizeWasmValue('abc', describeArrowType(type('Utf8')))).toBe('abc');
  });

  it('BIGINT (bigint) → строка, в том числе за пределами безопасных целых', () => {
    expect(normalizeWasmValue(9007199254740993n, describeArrowType(type('Int64')))).toBe('9007199254740993');
    expect(normalizeWasmValue(-5n, describeArrowType(type('Int64')))).toBe('-5');
  });

  it('ENUM (словарь строк) — строка', () => {
    expect(normalizeWasmValue('red', describeArrowType(type('Dictionary<Uint8, Utf8>')))).toBe('red');
  });
});

describe('normalizeWasmValue: даты и время', () => {
  it('DATE: число миллисекунд и объект Date → YYYY-MM-DD', () => {
    const t = describeArrowType(type('Date32<DAY>'));
    expect(normalizeWasmValue(MAY_1_2024_MS, t)).toBe('2024-05-01');
    expect(normalizeWasmValue(new Date(MAY_1_2024_MS), t)).toBe('2024-05-01');
  });

  it('TIMESTAMP: без дробной части — как у Tauri (без .000); с миллисекундами — три знака', () => {
    const t = describeArrowType(type('Timestamp<MICROSECOND>'));
    expect(normalizeWasmValue(T_14_30, t)).toBe('2024-05-01 14:30:00');
    expect(normalizeWasmValue(T_14_30 + 123, t)).toBe('2024-05-01 14:30:00.123');
    expect(normalizeWasmValue(new Date(T_14_30), t)).toBe('2024-05-01 14:30:00');
  });

  it('TIMESTAMP в bigint: микросекунды дают шесть знаков, наносекунды — девять', () => {
    const us = describeArrowType(type('Timestamp<MICROSECOND>'));
    const ns = describeArrowType(type('Timestamp<NANOSECOND>'));
    const s = describeArrowType(type('Timestamp<SECOND>'));
    const baseUs = BigInt(T_14_30) * 1000n;
    expect(normalizeWasmValue(baseUs + 123456n, us)).toBe('2024-05-01 14:30:00.123456');
    expect(normalizeWasmValue(baseUs, us)).toBe('2024-05-01 14:30:00');
    expect(normalizeWasmValue(BigInt(T_14_30) * 1_000_000n + 123456789n, ns)).toBe('2024-05-01 14:30:00.123456789');
    expect(normalizeWasmValue(BigInt(T_14_30 / 1000), s)).toBe('2024-05-01 14:30:00');
  });

  it('TIMESTAMPTZ: с суффиксом UTC, как DateTime<Utc> в Tauri', () => {
    const t = describeArrowType(type('Timestamp<MICROSECOND, UTC>'));
    expect(normalizeWasmValue(T_14_30, t)).toBe('2024-05-01 14:30:00 UTC');
  });

  it('TIME: bigint микросекунд и число миллисекунд → HH:MM:SS[.дробь]', () => {
    const us = describeArrowType(type('Time64<MICROSECOND>'));
    const ms = describeArrowType(type('Time32<MILLISECOND>'));
    expect(normalizeWasmValue(52_200_000_000n, us)).toBe('14:30:00');
    expect(normalizeWasmValue(52_200_000_123n, us)).toBe('14:30:00.000123');
    expect(normalizeWasmValue(52_200_123, ms)).toBe('14:30:00.123');
  });

  it('строка, пришедшая вместо даты, не искажается', () => {
    expect(normalizeWasmValue('2024-05-01', describeArrowType(type('Date32<DAY>')))).toBe('2024-05-01');
  });
});

describe('normalizeWasmValue: DECIMAL, INTERVAL, BLOB', () => {
  const dec = (scale: number) => describeArrowType(type(`Decimal[38e${scale}]`));

  it('DECIMAL из четырёх 32-битных слов: масштаб сохраняется, как в rust_decimal', () => {
    expect(normalizeWasmValue(new Uint32Array([12345, 0, 0, 0]), dec(2))).toBe('123.45');
    expect(normalizeWasmValue(new Uint32Array([123450, 0, 0, 0]), dec(3))).toBe('123.450');
    expect(normalizeWasmValue(new Uint32Array([5, 0, 0, 0]), dec(3))).toBe('0.005');
    expect(normalizeWasmValue(new Uint32Array([7, 0, 0, 0]), dec(0))).toBe('7');
  });

  it('DECIMAL: отрицательное значение (дополнительный код) и значение больше 64 бит (HUGEINT)', () => {
    // -12345 в 128-битном дополнительном коде
    expect(normalizeWasmValue(new Uint32Array([0xffffcfc7, 0xffffffff, 0xffffffff, 0xffffffff]), dec(2))).toBe('-123.45');
    const big = (1n << 100n) + 1n;
    const words = [0, 1, 2, 3].map((i) => Number((big >> BigInt(32 * i)) & 0xffffffffn));
    expect(normalizeWasmValue(new Uint32Array(words), dec(0))).toBe(big.toString());
  });

  it('DECIMAL: bigint как неотмасштабированное целое; число и строка', () => {
    expect(normalizeWasmValue(12345n, dec(2))).toBe('123.45');
    expect(normalizeWasmValue('123.45', dec(2))).toBe('123.45');
    expect(normalizeWasmValue(123.45, dec(2))).toBe('123.45');
  });

  it('INTERVAL (месяцы, дни, наносекунды): вид «Nm Nd Nns» как у Tauri', () => {
    const t = describeArrowType(type('Interval<MONTH_DAY_NANO>'));
    const nanos = 3_000_000_000n;
    const lo = Number(nanos & 0xffffffffn) | 0;
    const hi = Number((nanos >> 32n) & 0xffffffffn) | 0;
    expect(normalizeWasmValue(new Int32Array([1, 2, lo, hi]), t)).toBe('1m 2d 3000000000ns');
  });

  it('INTERVAL других единиц arrow: DAY_TIME и YEAR_MONTH', () => {
    expect(normalizeWasmValue(new Int32Array([3, 1500]), describeArrowType(type('Interval<DAY_TIME>')))).toBe('0m 3d 1500000000ns');
    expect(normalizeWasmValue(14, describeArrowType(type('Interval<YEAR_MONTH>')))).toBe('14m 0d 0ns');
  });

  it('BLOB → «<blob N bytes>»', () => {
    expect(normalizeWasmValue(new Uint8Array([1, 2, 3]), describeArrowType(type('Binary')))).toBe('<blob 3 bytes>');
    expect(normalizeWasmValue(new Uint8Array(0), describeArrowType(type('Binary')))).toBe('<blob 0 bytes>');
  });
});

describe('normalizeWasmValue: вложенные значения → JSON-строка', () => {
  const nested = describeArrowType(type('List<Int32>'));
  it('LIST: объект с toJSON, обычный массив и типизированный массив', () => {
    expect(normalizeWasmValue({ toJSON: () => [1, 2] }, nested)).toBe('[1,2]');
    expect(normalizeWasmValue([1, 2, 3], nested)).toBe('[1,2,3]');
    expect(normalizeWasmValue(new Int32Array([4, 5]), nested)).toBe('[4,5]');
  });
  it('STRUCT / MAP: объект, вложенные bigint — строками', () => {
    const st = describeArrowType(type('Struct<{a: Int64}>'));
    expect(normalizeWasmValue({ toJSON: () => ({ a: 1n, b: 'x' }) }, st)).toBe('{"a":"1","b":"x"}');
    expect(normalizeWasmValue({ a: [1n, 2n] }, st)).toBe('{"a":["1","2"]}');
  });
  it('вложенные Date, Uint8Array и null внутри', () => {
    expect(normalizeWasmValue([new Date(MAY_1_2024_MS), null], nested)).toBe('["2024-05-01T00:00:00.000Z",null]');
  });
  it('null вместо вложенного значения остаётся null', () => {
    expect(normalizeWasmValue(null, nested)).toBeNull();
  });
  it('цикличная структура не вешает и не бросает', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect(typeof normalizeWasmValue(a, nested)).toBe('string');
  });
});

describe('normalizeWasmTable', () => {
  it('строки по индексам столбцов, нормализация по типам, типы по именам', () => {
    const t = table(
      [field('id', 'Int64'), field('d', 'Date32<DAY>'), field('ts', 'Timestamp<MICROSECOND>'), field('price', 'Decimal[18e2]'), field('tags', 'List<Utf8>')],
      [[1n, 2n], [MAY_1_2024_MS, MAY_1_2024_MS], [T_14_30, T_14_30 + 5], [new Uint32Array([12345, 0, 0, 0]), new Uint32Array([5, 0, 0, 0])], [['a', 'b'], []]]
    );
    const r = normalizeWasmTable(t);
    expect(r.columns).toEqual(['id', 'd', 'ts', 'price', 'tags']);
    expect(r.rows).toEqual([
      { id: '1', d: '2024-05-01', ts: '2024-05-01 14:30:00', price: '123.45', tags: '["a","b"]' },
      { id: '2', d: '2024-05-01', ts: '2024-05-01 14:30:00.005', price: '0.05', tags: '[]' },
    ]);
    expect(r.columnTypes).toEqual({ id: 'Int64', d: 'Date32<DAY>', ts: 'Timestamp<MICROSECOND>', price: 'Decimal[18e2]', tags: 'List<Utf8>' });
    expect(r.truncated).toBe(false);
  });

  it('одинаковые имена столбцов не схлопываются: a, a_1; типы по уникальным именам', () => {
    const t = table([field('a', 'Int32'), field('a', 'Utf8'), field('b', 'Int32')], [[1, 2], ['x', 'y'], [10, 20]]);
    const r = normalizeWasmTable(t);
    expect(r.columns).toEqual(['a', 'a_1', 'b']);
    expect(r.rows).toEqual([{ a: 1, a_1: 'x', b: 10 }, { a: 2, a_1: 'y', b: 20 }]);
    expect(r.columnTypes).toEqual({ a: 'Int32', a_1: 'Utf8', b: 'Int32' });
  });

  it('числовые имена: порядок столбцов хранится в columns, а не в объекте', () => {
    const t = table([field('2', 'Int32'), field('1', 'Int32')], [[20], [10]]);
    const r = normalizeWasmTable(t);
    expect(r.columns).toEqual(['2', '1']);
    expect(r.rows).toEqual([{ '1': 10, '2': 20 }]);
  });

  it('усечение до 500 000 строк без обращения к остальным', () => {
    const t = table([field('x', 'Int32')], [[1]], { numRows: 600000 });
    const r = normalizeWasmTable(t);
    expect(WASM_MAX_ROWS).toBe(500000);
    expect(r.rows.length).toBe(500000);
    expect(r.truncated).toBe(true);
    expect(t.gets[0]).toBe(500000);
  });

  it('свой предел строк', () => {
    const t = table([field('x', 'Int32')], [[1, 2, 3, 4]]);
    const r = normalizeWasmTable(t, 2);
    expect(r.rows).toEqual([{ x: 1 }, { x: 2 }]);
    expect(r.truncated).toBe(true);
  });

  it('пустая таблица и таблица без схемы', () => {
    expect(normalizeWasmTable(table([field('x', 'Int32')], [[]], { numRows: 0 })).rows).toEqual([]);
    const r = normalizeWasmTable({ numRows: 0 });
    expect(r.rows).toEqual([]);
    expect(r.columns).toBeNull();
  });

  it('запасной путь без getChildAt: строки через toJSON(), значения всё равно нормализуются по типам', () => {
    const fields = [field('id', 'Int64'), field('d', 'Date32<DAY>')];
    const rowsData = [{ id: 7n, d: MAY_1_2024_MS }];
    const t = { numRows: 1, schema: { fields }, get: (i: number) => ({ toJSON: () => rowsData[i] }) };
    const r = normalizeWasmTable(t);
    expect(r.rows).toEqual([{ id: '7', d: '2024-05-01' }]);
    expect(r.columns).toEqual(['id', 'd']);
  });

  it('значение, которое не удалось привести, не роняет весь результат', () => {
    const bad = { toString() { throw new Error('boom'); }, toJSON() { throw new Error('boom'); } };
    const t = table([field('x', 'List<Int32>')], [[bad]]);
    const r = normalizeWasmTable(t);
    expect(r.rows.length).toBe(1);
  });
});
