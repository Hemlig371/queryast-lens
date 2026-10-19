import { describe, it, expect } from 'vitest';
import { parseExcelDate, extractExcelComments, sanitizeExportFileBase } from '../src/utils/excelParse';

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

  // п. 2.19 (EP-01): короткое смещение часового пояса без минут
  describe('parseExcelDate: короткое смещение (+03)', () => {
    it('«+03» даёт валидную дату с учётом пояса', () => {
      const d = parseExcelDate('2024-05-01 10:00:00+03');
      expect(isNaN(d.getTime())).toBe(false);
      expect(d.toISOString()).toBe('2024-05-01T07:00:00.000Z');
    });

    it('отрицательное смещение и доли секунды', () => {
      expect(parseExcelDate('2024-05-01 10:00:00.500-05').toISOString()).toBe('2024-05-01T15:00:00.500Z');
    });

    it('вариант с T и без секунд', () => {
      expect(parseExcelDate('2024-05-01T10:00+03').toISOString()).toBe('2024-05-01T07:00:00.000Z');
    });
  });

  // п. 2.19 (E-02, XL-07): имя файла из @file
  describe('sanitizeExportFileBase', () => {
    it('расширение .xlsx убирается (без двойного расширения)', () => {
      expect(sanitizeExportFileBase('отчёт.xlsx', 'report')).toBe('отчёт');
      expect(sanitizeExportFileBase('Отчёт.XLSX', 'report')).toBe('Отчёт');
    });

    it('имя без расширения и точки внутри имени не меняются', () => {
      expect(sanitizeExportFileBase('sales_by_region', 'report')).toBe('sales_by_region');
      expect(sanitizeExportFileBase('отчёт v1.2', 'report')).toBe('отчёт v1.2');
    });

    it('недопустимые символы \\ / : * ? " < > | заменяются на _', () => {
      expect(sanitizeExportFileBase('a\\b/c:d*e?f"g<h>i|j', 'report')).toBe('a_b_c_d_e_f_g_h_i_j');
    });

    it('пустое имя или одно расширение — запасное имя', () => {
      expect(sanitizeExportFileBase('', 'report')).toBe('report');
      expect(sanitizeExportFileBase('   ', 'report')).toBe('report');
      expect(sanitizeExportFileBase('.xlsx', 'report')).toBe('report');
    });
  });
});
