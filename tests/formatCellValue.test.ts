import { describe, it, expect } from 'vitest';
import { formatCellValue } from '../src/utils/formatCellValue';
import { computeColumnStats } from '../src/utils/columnStats';

describe('formatCellValue (S-07)', () => {
  it('массив — JSON со скобками', () => {
    expect(formatCellValue([1, 2])).toBe('[1,2]');
    expect(formatCellValue([])).toBe('[]');
    expect(formatCellValue(['a', null, [3]])).toBe('["a",null,[3]]');
  });

  it('объект — JSON, а не [object Object]', () => {
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}');
    expect(formatCellValue({ a: { b: [1] } })).toBe('{"a":{"b":[1]}}');
  });

  it('bigint: само значение строкой, внутри структуры — строкой в JSON', () => {
    expect(formatCellValue(12345678901234567890n)).toBe('12345678901234567890');
    expect(formatCellValue({ id: 9007199254740993n })).toBe('{"id":"9007199254740993"}');
    expect(formatCellValue([1n, 2n])).toBe('["1","2"]');
  });

  it('примитивы — как раньше (String)', () => {
    expect(formatCellValue('текст')).toBe('текст');
    expect(formatCellValue('')).toBe('');
    expect(formatCellValue(42)).toBe('42');
    expect(formatCellValue(1.5)).toBe('1.5');
    expect(formatCellValue(true)).toBe('true');
    expect(formatCellValue(NaN)).toBe('NaN');
  });

  it('null и undefined — как String', () => {
    expect(formatCellValue(null)).toBe('null');
    expect(formatCellValue(undefined)).toBe('undefined');
  });

  it('Date — как раньше (String), не JSON-строка в кавычках', () => {
    const d = new Date(Date.UTC(2024, 4, 1, 10, 0, 0));
    expect(formatCellValue(d)).toBe(String(d));
    expect(formatCellValue(d).startsWith('"')).toBe(false);
  });

  it('круговая ссылка не бросает исключение', () => {
    const a: any = { name: 'a' };
    a.self = a;
    let out = '';
    expect(() => { out = formatCellValue(a); }).not.toThrow();
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('объект с toJSON, бросающим ошибку, не роняет вывод', () => {
    const bad = { toJSON() { throw new Error('boom'); } };
    expect(() => formatCellValue(bad)).not.toThrow();
  });

  it('типизированный массив (BLOB) — список чисел в скобках', () => {
    expect(formatCellValue(new Uint8Array([1, 2, 255]))).toBe('[1,2,255]');
  });

  it('функция не превращается в undefined', () => {
    expect(typeof formatCellValue(() => 1)).toBe('string');
  });
});

describe('computeColumnStats на вложенных значениях (S-07)', () => {
  it('одинаковые массивы считаются одним значением, разные — разными', () => {
    const rows = [{ v: [1, 2] }, { v: [1, 2] }, { v: [2, 1] }, { v: { a: 1 } }, { v: { a: 2 } }];
    const text = computeColumnStats('v', rows);
    // 3-я строка отчёта: количество, уникальных, пустых — по порядку; числовой блок не строится
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/: 5$/);
    expect(lines[1]).toMatch(/: 4$/); // [1,2], [2,1], {"a":1}, {"a":2}
    expect(lines[2]).toMatch(/: 0$/);
    expect(lines.length).toBe(3);
  });

  it('разные объекты не склеиваются в один «[object Object]»', () => {
    const lines = computeColumnStats('v', [{ v: { a: 1 } }, { v: { b: 2 } }]).split('\n');
    expect(lines[1]).toMatch(/: 2$/);
  });

  it('null среди объектов считается пустым', () => {
    const lines = computeColumnStats('v', [{ v: [1] }, { v: null }, { v: [1] }]).split('\n');
    expect(lines[1]).toMatch(/: 1$/);
    expect(lines[2]).toMatch(/: 1$/);
  });
});
