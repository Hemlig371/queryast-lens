import { describe, it, expect } from 'vitest';
import { clampPage } from '../src/utils/pagination';

describe('clampPage (C-10: страница после удаления шаблона)', () => {
  it('страница в пределах — без изменений', () => {
    expect(clampPage(1, 45, 20)).toBe(1);
    expect(clampPage(2, 45, 20)).toBe(2);
    expect(clampPage(3, 45, 20)).toBe(3);
  });
  it('удалили единственный шаблон на последней странице: 21 → 20 элементов, страница 2 → 1', () => {
    expect(clampPage(2, 20, 20)).toBe(1);
  });
  it('удалили последний на странице 3 из 3: 41 → 40 элементов, страница 3 → 2', () => {
    expect(clampPage(3, 40, 20)).toBe(2);
  });
  it('пустой список — страница 1', () => {
    expect(clampPage(5, 0, 20)).toBe(1);
  });
  it('нулевая, отрицательная и дробная страница', () => {
    expect(clampPage(0, 100, 20)).toBe(1);
    expect(clampPage(-3, 100, 20)).toBe(1);
    expect(clampPage(2.7, 100, 20)).toBe(2);
    expect(clampPage(NaN, 100, 20)).toBe(1);
  });
  it('нулевой размер страницы не ломает расчёт', () => {
    expect(clampPage(2, 10, 0)).toBe(2);
  });
});
