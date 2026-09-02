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

  describe('exportToExcel with new formatting features', () => {
    it('runs exportToExcel without crashing when formatExistingRowAsTotal and formatExistingColumnAsTotal are enabled', async () => {
      const { exportToExcel } = await import('../src/utils/excelExporter');
      const { DEFAULT_EXCEL_SETTINGS } = await import('../src/types/excelSettings');

      const data = [
        { category: 'A', value: 10 },
        { category: 'A', value: 20 },
        { category: 'Итого', value: 30 }
      ];
      const columns = ['category', 'value'];
      const columnTypes = { category: 'String', value: 'Int32' };

      const blob = await exportToExcel(data, columns, columnTypes, {
        ...DEFAULT_EXCEL_SETTINGS,
        enableTotalsRow: false,
        formatExistingRowAsTotal: true,
        totalsRowPosition: 'bottom',
        formatExistingColumnAsTotal: true,
        totalsColumnPosition: 'right'
      });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('runs exportToExcel with categoryGroupFormatSubtotals', async () => {
      const { exportToExcel } = await import('../src/utils/excelExporter');
      const { DEFAULT_EXCEL_SETTINGS } = await import('../src/types/excelSettings');

      const dataGrade = [
        { department: 'Sales', employee: 'Alice', salary: 50000 },
        { department: 'Sales', employee: 'Bob', salary: 60000 },
        { department: 'IT', employee: 'Charlie', salary: 80000 }
      ];
      const cols = ['department', 'employee', 'salary'];
      const colTypes = { department: 'String', employee: 'String', salary: 'Int32' };

      const blob = await exportToExcel(dataGrade, cols, colTypes, {
        ...DEFAULT_EXCEL_SETTINGS,
        categoryGroupColumn: 1,
        categoryGroupCleanDuplicates: true,
        categoryGroupFormatSubtotals: true,
        categorySubtotalBgColor: 'E2E8F0',
        categorySubtotalTextColor: '0F172A',
        categorySubtotalBold: true
      });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('runs exportToExcel with both categoryGroupFormatSubtotals and formatExistingRowAsTotal', async () => {
      const { exportToExcel } = await import('../src/utils/excelExporter');
      const { DEFAULT_EXCEL_SETTINGS } = await import('../src/types/excelSettings');

      const dataGrade = [
        { department: 'Sales', employee: 'Alice', salary: 50000 },
        { department: 'Sales', employee: 'Bob', salary: 60000 },
        { department: 'IT', employee: 'Charlie', salary: 80000 },
        { department: 'Итого', employee: '', salary: 190000 }
      ];
      const cols = ['department', 'employee', 'salary'];
      const colTypes = { department: 'String', employee: 'String', salary: 'Int32' };

      const blob = await exportToExcel(dataGrade, cols, colTypes, {
        ...DEFAULT_EXCEL_SETTINGS,
        categoryGroupColumn: 1,
        categoryGroupCleanDuplicates: true,
        categoryGroupFormatSubtotals: true,
        categorySubtotalBgColor: 'E2E8F0',
        categorySubtotalTextColor: '0F172A',
        categorySubtotalBold: true,
        formatExistingRowAsTotal: true,
        totalsRowPosition: 'bottom',
        totalsRowBgColor: 'CBD5E1',
        totalsRowTextColor: '000000',
        totalsRowBold: true
      });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
    it('runs exportToExcel with skipColumnIndex and @skip directive', async () => {
      const { exportToExcel } = await import('../src/utils/excelExporter');
      const { DEFAULT_EXCEL_SETTINGS } = await import('../src/types/excelSettings');

      const dataSample = [
        { hidden_group: 'A', name: 'Product 1', price: 100 },
        { hidden_group: 'A', name: 'Product 2', price: 200 },
        { hidden_group: 'B', name: 'Product 3', price: 300 }
      ];
      const cols = ['hidden_group', 'name', 'price'];
      const colTypes = { hidden_group: 'String', name: 'String', price: 'Int32' };

      // Test with settings.skipColumnIndex = 1 and categoryGroupColumn = 1
      const blob1 = await exportToExcel(dataSample, cols, colTypes, {
        ...DEFAULT_EXCEL_SETTINGS,
        skipColumnIndex: 1,
        categoryGroupColumn: 1,
        categoryGroupFormatSubtotals: true
      });
      expect(blob1).toBeInstanceOf(Blob);
      expect(blob1.size).toBeGreaterThan(0);

      // Test with @skip: hidden_group SQL comment directive
      const blob2 = await exportToExcel(dataSample, cols, colTypes, {
        ...DEFAULT_EXCEL_SETTINGS
      }, 'SELECT * FROM products -- @skip: hidden_group @group: 1');
      expect(blob2).toBeInstanceOf(Blob);
      expect(blob2.size).toBeGreaterThan(0);
    });
  });
});
