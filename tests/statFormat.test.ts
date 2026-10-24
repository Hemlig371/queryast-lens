import { describe, it, expect } from 'vitest';
import { formatStatVal, toChartNumber, selectTopN, sortStatItems } from '../src/utils/statFormat';

describe('formatStatVal', () => {
  it('числа форматируются: целые с разрядами, дробные до 2 знаков', () => {
    expect(formatStatVal(1234567, 'en-US')).toBe('1,234,567');
    expect(formatStatVal(3.14159, 'en-US')).toBe('3.14');
    expect(formatStatVal(0, 'en-US')).toBe('0');
    expect(formatStatVal(-5, 'en-US')).toBe('-5');
  });
  it('строки, похожие на числа, не превращаются в числа', () => {
    expect(formatStatVal('00123', 'en-US')).toBe('00123');
    expect(formatStatVal('12345678901234567890', 'en-US')).toBe('12345678901234567890');
    expect(formatStatVal('0x10', 'en-US')).toBe('0x10');
    expect(formatStatVal('2024', 'en-US')).toBe('2024');
    expect(formatStatVal('1e3', 'en-US')).toBe('1e3');
  });
  it('пустое и NaN — null', () => {
    expect(formatStatVal(null)).toBeNull();
    expect(formatStatVal(undefined)).toBeNull();
    expect(formatStatVal('')).toBeNull();
    expect(formatStatVal(NaN)).toBeNull();
  });
  it('текст, boolean и bigint — как String', () => {
    expect(formatStatVal('abc')).toBe('abc');
    expect(formatStatVal(true)).toBe('true');
    expect(formatStatVal(12345678901234567890n)).toBe('12345678901234567890');
  });
});

describe('toChartNumber', () => {
  it('числа и числовые строки (ClickHouse UInt64/Decimal)', () => {
    expect(toChartNumber(5)).toBe(5);
    expect(toChartNumber(-1.5)).toBe(-1.5);
    expect(toChartNumber('42')).toBe(42);
    expect(toChartNumber(' 7.5 ')).toBe(7.5);
    expect(toChartNumber(10n)).toBe(10);
    expect(toChartNumber(0)).toBe(0);
  });
  it('нечисловое — null, а не 0', () => {
    expect(toChartNumber(null)).toBeNull();
    expect(toChartNumber(undefined)).toBeNull();
    expect(toChartNumber('')).toBeNull();
    expect(toChartNumber('   ')).toBeNull();
    expect(toChartNumber('abc')).toBeNull();
    expect(toChartNumber(true)).toBeNull();
    expect(toChartNumber({})).toBeNull();
    expect(toChartNumber(NaN)).toBeNull();
    expect(toChartNumber(Infinity)).toBeNull();
  });
});

describe('selectTopN', () => {
  const items = [
    { name: 'a', value: 1 },
    { name: 'b', value: 50 },
    { name: 'c', value: 3 },
    { name: 'd', value: 40 },
    { name: 'e', value: 2 },
  ];

  it('по алфавиту: берутся самые крупные по значению, затем порядок по алфавиту', () => {
    expect(selectTopN(items, 2, 'alphabet').map(i => i.name)).toEqual(['b', 'd']);
    expect(selectTopN(items, 3, 'alphabet').map(i => i.name)).toEqual(['b', 'c', 'd']);
  });
  it('раньше брались первые N по алфавиту (a, b)', () => {
    expect(selectTopN(items, 2, 'alphabet').map(i => i.name)).not.toEqual(['a', 'b']);
  });
  it('лимит не меньше размера: все элементы по алфавиту', () => {
    expect(selectTopN(items, 5, 'alphabet').map(i => i.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(selectTopN(items, 60, 'alphabet').map(i => i.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('desc и asc обрезают список, отсортированный по значению', () => {
    expect(selectTopN(items, 2, 'desc').map(i => i.name)).toEqual(['b', 'd']);
    expect(selectTopN(items, 2, 'asc').map(i => i.name)).toEqual(['a', 'e']);
  });
  it('равные значения — по имени (стабильно)', () => {
    const tie = [{ name: 'z', value: 5 }, { name: 'y', value: 5 }, { name: 'x', value: 5 }];
    expect(selectTopN(tie, 2, 'alphabet').map(i => i.name)).toEqual(['x', 'y']);
    expect(sortStatItems(tie, 'desc').map(i => i.name)).toEqual(['x', 'y', 'z']);
  });
  it('исходный массив не меняется; числа в именах сравниваются как числа', () => {
    const src = [{ name: '10', value: 1 }, { name: '9', value: 1 }];
    const copy = [...src];
    expect(sortStatItems(src, 'alphabet').map(i => i.name)).toEqual(['9', '10']);
    expect(src).toEqual(copy);
  });
  it('пустой список', () => {
    expect(selectTopN([], 5, 'alphabet')).toEqual([]);
  });
});
