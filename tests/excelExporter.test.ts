import { describe, it, expect } from 'vitest';
import { cleanHexColor, sanitizeSheetName, parsePotentialDate } from '../src/utils/excelExporter';

describe('excelExporter utils', () => {
  describe('cleanHexColor', () => {
    it('should strip # from color', () => {
      expect(cleanHexColor('#FF0000')).toBe('FF0000');
    });

    it('should expand 3-digit hex to 6 digits', () => {
      expect(cleanHexColor('#abc')).toBe('AABBCC');
      expect(cleanHexColor('fff')).toBe('FFFFFF');
    });

    it('should fallback to FFFFFF if empty', () => {
      expect(cleanHexColor('')).toBe('FFFFFF');
      expect(cleanHexColor(null as any)).toBe('FFFFFF');
    });
  });

  describe('sanitizeSheetName', () => {
    it('should remove invalid Excel sheet name characters', () => {
      expect(sanitizeSheetName('Data/Time', 'Fallback')).toBe('Data_Time');
      expect(sanitizeSheetName('Question?', 'Fallback')).toBe('Question_');
      expect(sanitizeSheetName('[Brackets]', 'Fallback')).toBe('_Brackets_');
    });

    it('should truncate to 31 characters', () => {
      const longName = 'ThisIsAVeryLongSheetNameThatExceedsTheExcelLimitOfThirtyOneCharacters';
      const sanitized = sanitizeSheetName(longName, 'Fallback');
      expect(sanitized.length).toBe(31);
      expect(sanitized).toBe('ThisIsAVeryLongSheetNameThatExc');
    });

    it('should use fallback if name becomes empty', () => {
      expect(sanitizeSheetName('///', 'DefaultSheet')).toBe('___');
      expect(sanitizeSheetName('', 'DefaultSheet')).toBe('DefaultSheet');
    });
  });

  describe('parsePotentialDate', () => {
    it('should return null for undefined/null/empty', () => {
      expect(parsePotentialDate(null)).toBeNull();
      expect(parsePotentialDate('')).toBeNull();
      expect(parsePotentialDate(undefined)).toBeNull();
    });

    it('should parse valid date strings', () => {
      const date = parsePotentialDate('2023-10-15');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2023);
    });

    it('should ignore random HTTP strings or IDs that look like dates', () => {
      expect(parsePotentialDate('https://google.com')).toBeNull();
      expect(parsePotentialDate('31724')).toBeNull(); // Years way in the future
      expect(parsePotentialDate('1000')).toBeNull(); // Years way in the past
    });
  });
});
