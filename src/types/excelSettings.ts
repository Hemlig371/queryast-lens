export interface ExcelSettings {
  defaultFileName: string;
  fontFamily: string;
  headerFontSize: number;
  dataFontSize: number;
  dataTextColor: string;
  totalFontSize: number;
  headerBgColor: string;
  headerTextColor: string;
  headerBorderStyle?: 'thin' | 'medium' | 'dashed' | 'dotted' | 'horizontal_only' | 'none';
  enableFirstColumnStyle: boolean;
  categoryColumnsCount: number;
  categoryGroupColumn?: number;
  categoryGroupCleanDuplicates?: boolean;
  categoryGroupCollapse?: boolean;
  firstColumnBgColor: string;
  firstColumnTextColor: string;
  firstColumnBold: boolean;
  enableRowZebra: boolean;
  rowZebraBgColor: string;
  enableColumnZebra: boolean;
  columnZebraBgColor: string;
  borderStyle: 'none' | 'thin' | 'medium' | 'dashed' | 'dotted' | 'horizontal_only' | 'outer_only';
  borderColor: string;
  numberFormat: 'raw' | 'integer' | 'decimal2' | 'custom';
  customNumberFormat: string;
  dateFormat: 'DD.MM.YYYY' | 'DD.MM.YYYY HH:MM:SS' | 'YYYY-MM-DD';
  textAlignVertical: 'top' | 'middle' | 'bottom';
  textAlignHorizontal: 'left' | 'center' | 'right';
  numericAlignVertical: 'top' | 'middle' | 'bottom';
  numericAlignHorizontal: 'left' | 'center' | 'right';
  dateAlignVertical: 'top' | 'middle' | 'bottom';
  dateAlignHorizontal: 'left' | 'center' | 'right';
  autoColumnWidth: boolean;
  maxColumnWidth: number;
  fixedColumnWidth: number;
  wrapText: boolean;
  freezeHeaderRow: boolean;
  freezeFirstColumn: boolean;
  enableAutoFilter: boolean;
  showGridLines: boolean;
  showZeroValues: boolean;
  zoomScale: number;
  pageOrientation: 'portrait' | 'landscape';
  paperSize: number;
  fitToPageWidth: boolean;
  narrowMargins: boolean;
  printHorizontalCentered: boolean;
  printTitlesRow: boolean;
  addPageNumbers: boolean;
  pageNumberPosition: 'center' | 'right';
  pageNumberFormat: 'full' | 'simple';
  enableTotalsRow: boolean;
  totalsRowFunction: 'SUM' | 'AVERAGE' | 'COUNT';
  totalsRowPosition: 'bottom' | 'top';
  totalsRowBgColor: string;
  totalsRowTextColor: string;
  totalsRowBold: boolean;
  enableTotalsColumn: boolean;
  totalsColumnFunction: 'SUM' | 'AVERAGE' | 'COUNT';
  totalsColumnPosition: 'right' | 'left';
  totalsColumnBgColor: string;
  totalsColumnTextColor: string;
  totalsColumnBold: boolean;
  enableRowIndexColumn: boolean;
  enableColumnIndexRow: boolean;
  defaultSheetName: string;
  includeSqlSheet: boolean;
  sqlSheetName: string;
  hideSqlSheet: boolean;
  protectSheet: boolean;
  sheetPassword?: string;
  enableReportTitle: boolean;
  reportTitle: string;
  reportSubtitle: string;
  reportSubtitleFontSize: number;
  reportSubtitleColor: string;
  reportSubtitleBgColor: string;
  reportSubtitleBold: boolean;
  reportSubtitleItalic: boolean;
  reportTitleFontSize: number;
  reportTitleColor: string;
  reportTitleBgColor: string;
  reportTitleBold: boolean;
  reportTitleItalic: boolean;
  splitByColumnIndex?: number | null;
}

export const DEFAULT_EXCEL_SETTINGS: ExcelSettings = {
  defaultFileName: 'report',
  fontFamily: 'Segoe UI',
  headerFontSize: 11,
  dataFontSize: 10,
  dataTextColor: '000000',
  totalFontSize: 11,
  headerBgColor: '1E293B',
  headerTextColor: 'FFFFFF',
  headerBorderStyle: 'thin',
  enableFirstColumnStyle: false,
  categoryColumnsCount: 1,
  categoryGroupColumn: 0,
  categoryGroupCleanDuplicates: false,
  categoryGroupCollapse: false,
  firstColumnBgColor: 'F1F5F9',
  firstColumnTextColor: '0F172A',
  firstColumnBold: true,
  enableRowZebra: true,
  rowZebraBgColor: 'F8FAFC',
  enableColumnZebra: false,
  columnZebraBgColor: 'F1F5F9',
  borderStyle: 'thin',
  borderColor: 'CBD5E1',
  numberFormat: 'integer',
  customNumberFormat: '#,##0.00 ₽',
  dateFormat: 'DD.MM.YYYY',
  textAlignVertical: 'middle',
  textAlignHorizontal: 'left',
  numericAlignVertical: 'middle',
  numericAlignHorizontal: 'right',
  dateAlignVertical: 'middle',
  dateAlignHorizontal: 'center',
  autoColumnWidth: true,
  maxColumnWidth: 50,
  fixedColumnWidth: 18,
  wrapText: true,
  freezeHeaderRow: true,
  freezeFirstColumn: false,
  enableAutoFilter: true,
  showGridLines: true,
  showZeroValues: true,
  zoomScale: 100,
  pageOrientation: 'landscape',
  paperSize: 9,
  fitToPageWidth: true,
  narrowMargins: false,
  printHorizontalCentered: false,
  printTitlesRow: true,
  addPageNumbers: false,
  pageNumberPosition: 'center',
  pageNumberFormat: 'full',
  enableTotalsRow: true,
  totalsRowFunction: 'SUM',
  totalsRowPosition: 'bottom',
  totalsRowBgColor: 'F1F5F9',
  totalsRowTextColor: '0F172A',
  totalsRowBold: true,
  enableTotalsColumn: false,
  totalsColumnFunction: 'SUM',
  totalsColumnPosition: 'right',
  totalsColumnBgColor: 'F1F5F9',
  totalsColumnTextColor: '0F172A',
  totalsColumnBold: true,
  enableRowIndexColumn: false,
  enableColumnIndexRow: false,
  defaultSheetName: 'Отчет',
  includeSqlSheet: true,
  sqlSheetName: 'Метаданные',
  hideSqlSheet: false,
  protectSheet: false,
  sheetPassword: '',
  enableReportTitle: false,
  reportTitle: 'Заголовок',
  reportSubtitle: '',
  reportSubtitleFontSize: 11,
  reportSubtitleColor: '64748B',
  reportSubtitleBgColor: '',
  reportSubtitleBold: false,
  reportSubtitleItalic: true,
  reportTitleFontSize: 14,
  reportTitleColor: '000000',
  reportTitleBgColor: '',
  reportTitleBold: true,
  reportTitleItalic: false,
  splitByColumnIndex: null
};

export interface ExcelPreset {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  settings: ExcelSettings;
}
