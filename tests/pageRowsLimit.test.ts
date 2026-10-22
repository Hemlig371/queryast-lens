import { describe, it, expect } from 'vitest';
import { clampPageRows, MAX_PAGE_ROWS, DEFAULT_PAGE_ROWS, MAX_RESULT_ROWS } from '../src/utils/rowLimit';

describe('clampPageRows: настройка Max rows', () => {
  it('нормальные значения не меняются', () => {
    expect(clampPageRows(1)).toBe(1);
    expect(clampPageRows(100)).toBe(100);
    expect(clampPageRows(MAX_PAGE_ROWS)).toBe(MAX_PAGE_ROWS);
  });
  it('больше предела обрезается до 50 000', () => {
    expect(clampPageRows(50001)).toBe(50000);
    expect(clampPageRows(500000)).toBe(50000);
    expect(clampPageRows('1000000')).toBe(50000);
  });
  it('0, отрицательное, пустое и нечисловое → значение по умолчанию', () => {
    for (const v of [0, -5, NaN, Infinity, undefined, null, '', 'abc']) {
      expect(clampPageRows(v)).toBe(DEFAULT_PAGE_ROWS);
    }
  });
  it('дробное округляется вниз', () => {
    expect(clampPageRows(10.9)).toBe(10);
  });
  it('защита бэкенда остаётся выше предела страницы', () => {
    expect(MAX_RESULT_ROWS).toBe(500000);
    expect(MAX_PAGE_ROWS).toBeLessThan(MAX_RESULT_ROWS);
  });
});
