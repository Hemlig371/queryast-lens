import { describe, it, expect } from 'vitest';
import { parseExcelDate, extractExcelComments } from '../src/utils/excelParse';

describe('excelParse', () => {
  describe('parseExcelDate', () => {
    it('строка без пояса разбирается как UTC (время не сдвигается)', () => {
      expect(parseExcelDate('2024-05-01 14:30:00').toISOString()).toBe('2024-05-01T14:30:00.000Z');
      expect(parseExcelDate('2024-05-01T14:30:00').toISOString()).toBe('2024-05-01T14:30:00.000Z');
      expect(parseExcelDate('2024-05-01 14:30').toISOString()).toBe('2024-05-01T14:30:00.000Z');
    });

    it('доли секунды сохраняются', () => {
      expect(parseExcelDate('2024-05-01 14:30:00.123').toISOString()).toBe('2024-05-01T14:30:00.123Z');
    });

    it('строка только с датой остаётся полуночью UTC', () => {
      expect(parseExcelDate('2024-05-01').toISOString()).toBe('2024-05-01T00:00:00.000Z');
    });

    it('явный часовой пояс учитывается как раньше', () => {
      expect(parseExcelDate('2024-05-01 14:30:00+03:00').toISOString()).toBe('2024-05-01T11:30:00.000Z');
      expect(parseExcelDate('2024-05-01T14:30:00Z').toISOString()).toBe('2024-05-01T14:30:00.000Z');
    });

    it('число — миллисекунды эпохи', () => {
      expect(parseExcelDate(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });

    it('мусор даёт Invalid Date (вызывающий код оставит строку)', () => {
      expect(isNaN(parseExcelDate('не дата').getTime())).toBe(true);
    });
  });

  describe('extractExcelComments', () => {
    it('снимает ограничители /* и */', () => {
      const out = extractExcelComments('/* # Мой отчёт */ SELECT 1');
      expect(out).toContain('# Мой отчёт');
      expect(out).not.toContain('*/');
      expect(out).not.toContain('/*');
    });

    it('склеивает несколько комментариев и игнорирует код', () => {
      const out = extractExcelComments('/* @preset: A */ SELECT 1 /* ## Подзаголовок */');
      expect(out).toContain('@preset: A');
      expect(out).toContain('## Подзаголовок');
      expect(out).not.toContain('SELECT');
    });

    it('без комментариев — пустая строка', () => {
      expect(extractExcelComments('SELECT 1')).toBe('');
    });
  });
});
