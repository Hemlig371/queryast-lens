import { describe, it, expect } from 'vitest';
import { linesSuffix } from '../src/utils/i18n';

// Склонение «строка» для RU (VersionHistoryModal); EN без изменений.
describe('linesSuffix', () => {
  it('RU: строка / строки / строк', () => {
    const word = (n: number) => `${n}${linesSuffix(n, 'ru')}`;
    expect(word(1)).toBe('1 строка');
    expect(word(2)).toBe('2 строки');
    expect(word(4)).toBe('4 строки');
    expect(word(5)).toBe('5 строк');
    expect(word(0)).toBe('0 строк');
    expect(word(11)).toBe('11 строк');
    expect(word(12)).toBe('12 строк');
    expect(word(14)).toBe('14 строк');
    expect(word(21)).toBe('21 строка');
    expect(word(22)).toBe('22 строки');
    expect(word(101)).toBe('101 строка');
    expect(word(111)).toBe('111 строк');
    expect(word(112)).toBe('112 строк');
    expect(word(1000)).toBe('1000 строк');
  });

  it('EN: lines без изменений', () => {
    expect(`${1}${linesSuffix(1, 'en')}`).toBe('1 lines');
    expect(`${5}${linesSuffix(5, 'en')}`).toBe('5 lines');
  });
});
