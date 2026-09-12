import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/utils/exportUtils', () => ({
  downloadFileWithFallback: vi.fn().mockResolvedValue(undefined)
}));

describe('excelExporter utils', () => {
  describe('exportToExcel with formatting features', () => {
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

      await exportToExcel({
        data,
        columns,
        columnTypes,
        settings: {
          ...DEFAULT_EXCEL_SETTINGS,
          enableTotalsRow: false,
          formatExistingRowAsTotal: true,
          totalsRowPosition: 'bottom',
          formatExistingColumnAsTotal: true,
          totalsColumnPosition: 'right'
        }
      });
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

      await exportToExcel({
        data: dataGrade,
        columns: cols,
        columnTypes: colTypes,
        settings: {
          ...DEFAULT_EXCEL_SETTINGS,
          categoryGroupColumn: 1,
          categoryGroupCleanDuplicates: true,
          categoryGroupFormatSubtotals: true,
          categorySubtotalBgColor: 'E2E8F0',
          categorySubtotalTextColor: '0F172A',
          categorySubtotalBold: true
        }
      });
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

      await exportToExcel({
        data: dataGrade,
        columns: cols,
        columnTypes: colTypes,
        settings: {
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
        }
      });
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

      await exportToExcel({
        data: dataSample,
        columns: cols,
        columnTypes: colTypes,
        settings: {
          ...DEFAULT_EXCEL_SETTINGS,
          skipColumnIndex: 1,
          categoryGroupColumn: 1,
          categoryGroupFormatSubtotals: true
        }
      });

      await exportToExcel({
        data: dataSample,
        columns: cols,
        columnTypes: colTypes,
        settings: {
          ...DEFAULT_EXCEL_SETTINGS
        },
        sqlQuery: 'SELECT * FROM products -- @skip: hidden_group @group: 1'
      });
    });

    it('runs exportToExcel with hideColumnIndex and @hide directive', async () => {
      const { exportToExcel } = await import('../src/utils/excelExporter');
      const { DEFAULT_EXCEL_SETTINGS } = await import('../src/types/excelSettings');

      const dataSample = [
        { id: 1, name: 'Product 1', secret_code: 'X100', price: 100 },
        { id: 2, name: 'Product 2', secret_code: 'X200', price: 200 }
      ];
      const cols = ['id', 'name', 'secret_code', 'price'];
      const colTypes = { id: 'Int32', name: 'String', secret_code: 'String', price: 'Int32' };

      await exportToExcel({
        data: dataSample,
        columns: cols,
        columnTypes: colTypes,
        settings: {
          ...DEFAULT_EXCEL_SETTINGS,
          hideColumnIndex: 3
        }
      });

      await exportToExcel({
        data: dataSample,
        columns: cols,
        columnTypes: colTypes,
        settings: {
          ...DEFAULT_EXCEL_SETTINGS
        },
        sqlQuery: 'SELECT * FROM products -- @hide: secret_code'
      });
    });
  });
});

