import ExcelJS from 'exceljs';
import { ExcelSettings } from '../types/excelSettings';
import { downloadFileWithFallback } from './exportUtils';

export interface ExportExcelOptions {
  data: any[];
  columnTypes?: Record<string, string>;
  sqlQuery?: string;
  filename?: string;
  settings: ExcelSettings;
}

function cleanHexColor(color: string): string {
  if (!color) return 'FFFFFF';
  let clean = color.replace(/^#/, '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  return clean.toUpperCase();
}

function sanitizeSheetName(name: string, fallback: string): string {
  if (!name) return fallback;
  let clean = name.replace(/[\\/?*:[\]]/g, '_').trim();
  if (!clean) clean = fallback;
  if (clean.length > 31) clean = clean.substring(0, 31);
  return clean;
}

function isNumericType(typeStr?: string, sampleVal?: any): boolean {
  if (sampleVal !== undefined && sampleVal !== null) {
    if (typeof sampleVal === 'number' || typeof sampleVal === 'bigint') return true;
  }
  if (!typeStr) return false;
  const t = typeStr.toUpperCase();
  return (
    t.includes('INT') ||
    t.includes('FLOAT') ||
    t.includes('DOUBLE') ||
    t.includes('DECIMAL') ||
    t.includes('NUMERIC') ||
    t.includes('REAL') ||
    t.includes('NUMBER')
  );
}

function isDateType(typeStr?: string, sampleVal?: any): boolean {
  if (sampleVal instanceof Date) return true;
  if (!typeStr) return false;
  const t = typeStr.toUpperCase();
  return t.includes('DATE') || t.includes('TIME') || t.includes('TIMESTAMP');
}

function parsePotentialDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'string') {
    if (val.includes('http://') || val.includes('https://')) return null;
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      // Prevent aggressive parsing of IDs/URLs as weird future/past years (e.g., "31724" -> Year 31724)
      const year = parsed.getFullYear();
      if (year >= 1900 && year <= 2100) return parsed;
    }
  } else if (typeof val === 'number') {
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function estimateStringExcelWidth(str: string, fontSize: number = 11): number {
  if (!str) return 0;
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    // Use a simpler, safer estimation based mostly on character count.
    // This ensures columns are wide enough to prevent premature wrapping.
    if (charCode >= 65 && charCode <= 90) { // A-Z (Uppercase)
      width += 1.25;
    } else if (charCode >= 1040 && charCode <= 1071) { // Cyrillic Uppercase
      width += 1.25;
    } else if (charCode === 1025) { // Ё
      width += 1.25;
    } else {
      width += 1.1; // Lowercase, numbers, punctuation
    }
  }
  
  // Scale width based on font size relative to standard 11pt font
  return width * (fontSize / 11);
}

function estimateCellLines(val: any, colWidth: number, wrapText: boolean, fontSize: number = 11): number {
  if (val === null || val === undefined) return 1;
  const str = String(val);
  if (!str) return 1;

  // Use a slightly smaller padding to prevent overly aggressive line wrapping estimation
  const usableWidth = Math.max(1, colWidth - 1);
  const rawLines = str.split(/\r?\n/);
  let totalLines = 0;

  for (const line of rawLines) {
    if (!wrapText) {
      totalLines += 1;
    } else {
      const len = estimateStringExcelWidth(line, fontSize);
      if (len === 0) {
        totalLines += 1;
      } else {
        totalLines += Math.ceil(len / usableWidth);
      }
    }
  }
  return Math.max(1, totalLines);
}

export async function exportToExcel({
  data,
  columnTypes = {},
  sqlQuery = '',
  filename,
  settings: initialSettings
}: ExportExcelOptions): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error('Нет данных для экспорта в Excel');
  }

  let settings = { ...initialSettings };
  
  let parsedFilename = settings.defaultFileName || '';

  const rawColumns = Object.keys(data[0] || {});
  if (rawColumns.length === 0) {
    throw new Error('Колонки таблицы не найдены');
  }

  // Parse SQL query for title/subtitle overrides and metadata tags
  if (sqlQuery) {
    const commentBlocks = sqlQuery.match(/\/\*[\s\S]*?\*\//g) || [];
    const combinedComments = commentBlocks.join('\n');

    if (combinedComments) {
      const titleMatch = combinedComments.match(/#\s*([^#\n@]+)/);
      if (titleMatch) {
        settings.reportTitle = titleMatch[1].trim();
        settings.enableReportTitle = true; // Force enable if specifically requested
      }
      
      const subtitleMatch = combinedComments.match(/##\s*([^#\n@]+)/);
      if (subtitleMatch) {
        settings.reportSubtitle = subtitleMatch[1].trim();
      }

      const fileMatch = combinedComments.match(/@file:\s*([^@\n*]+)/);
      if (fileMatch) {
        parsedFilename = fileMatch[1].trim();
      }

      const sheetMatch = combinedComments.match(/@sheet:\s*([^@\n*]+)/);
      if (sheetMatch) {
        settings.defaultSheetName = sheetMatch[1].trim();
      }

      const totalsMatch = combinedComments.match(/@totals:\s*(SUM|AVERAGE|AVG|COUNT|COUNTA)/i);
      if (totalsMatch) {
        let func = totalsMatch[1].toUpperCase();
        if (func === 'AVG') func = 'AVERAGE';
        if (func === 'COUNTA') func = 'COUNT'; // It gets mapped to COUNTA during export
        settings.totalsRowFunction = func as any;
        settings.totalsColumnFunction = func as any;
      }

      // @split: column index (1-based) or column name
      const splitMatch = combinedComments.match(/@split:\s*([^@\n*]+)/i);
      if (splitMatch) {
        const val = splitMatch[1].trim();
        const num = parseInt(val, 10);
        if (!isNaN(num)) {
          settings.splitByColumnIndex = num > 0 ? num : null;
        } else {
          const colIdx = rawColumns.findIndex(c => c.toLowerCase() === val.toLowerCase());
          if (colIdx !== -1) {
            settings.splitByColumnIndex = colIdx + 1;
          }
        }
      }

      // @group: column index (1-based) or column name
      const groupMatch = combinedComments.match(/@group:\s*([^@\n*]+)/i);
      if (groupMatch) {
        const val = groupMatch[1].trim();
        const num = parseInt(val, 10);
        if (!isNaN(num)) {
          settings.categoryGroupColumn = Math.max(0, num);
        } else {
          const colIdx = rawColumns.findIndex(c => c.toLowerCase() === val.toLowerCase());
          if (colIdx !== -1) {
            settings.categoryGroupColumn = colIdx + 1;
          }
        }
      }

      // @group_cols: count of category columns (1-based number)
      const groupColsMatch = combinedComments.match(/@group_cols:\s*(\d+)/i);
      if (groupColsMatch) {
        const count = parseInt(groupColsMatch[1], 10);
        if (!isNaN(count)) {
          settings.categoryColumnsCount = Math.max(0, count);
        }
      }

      // @group_hide: true/false for cleaning duplicate category values
      const groupHideMatch = combinedComments.match(/@group_hide:\s*(true|false|1|0)/i);
      if (groupHideMatch) {
        const hideVal = groupHideMatch[1].toLowerCase();
        settings.categoryGroupCleanDuplicates = hideVal === 'true' || hideVal === '1';
      }

      // @protect: password string for sheet protection
      const protectMatch = combinedComments.match(/@protect:\s*([^@\n*]+)/i);
      if (protectMatch) {
        const pwd = protectMatch[1].trim();
        settings.protectSheet = true;
        settings.sheetPassword = pwd;
      }
    }
  }

  const totalCells = data.length * rawColumns.length;
  if (totalCells > 1500000) {
    throw new Error(`Объем данных слишком велик для Excel-отчета (${totalCells.toLocaleString('ru-RU')} ячеек). Пожалуйста, используйте фильтры, чтобы уменьшить количество строк (максимум ~1.5 млн ячеек), или скопируйте/скачайте данные в другом формате.`);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QueryAST Lens';
  workbook.created = new Date();

  // Split Logic
  const splitIndex = settings.splitByColumnIndex;
  let sheetsData: Record<string, any[]> = {};
  let activeColumns = [...rawColumns];
  let splitColKey = null;

  if (splitIndex !== null && splitIndex !== undefined && splitIndex > 0 && splitIndex <= rawColumns.length) {
    splitColKey = rawColumns[splitIndex - 1];
    
    const rawValToSheetName = new Map<string, string>();
    const assignedLowerNames = new Set<string>();

    data.forEach(row => {
      const rawVal = String(row[splitColKey] ?? 'Пусто');
      
      let sheetName = rawValToSheetName.get(rawVal);
      if (!sheetName) {
        let baseName = rawVal.replace(/[\[\]\/\*\?\:\\]/g, '_').trim();
        if (!baseName) baseName = 'Sheet';
        
        let attempt = baseName;
        if (attempt.length > 31) attempt = attempt.substring(0, 31);
        
        let counter = 1;
        while (assignedLowerNames.has(attempt.toLowerCase())) {
          counter++;
          const suffix = ` (${counter})`;
          const maxBaseLen = 31 - suffix.length;
          attempt = baseName.substring(0, maxBaseLen) + suffix;
        }
        
        sheetName = attempt;
        rawValToSheetName.set(rawVal, sheetName);
        assignedLowerNames.add(sheetName.toLowerCase());
      }
      
      if (!sheetsData[sheetName]) sheetsData[sheetName] = [];
      sheetsData[sheetName].push(row);
    });
    activeColumns = rawColumns.filter(c => c !== splitColKey);
  } else {
    const primarySheetName = sanitizeSheetName(settings.defaultSheetName || 'Отчет', 'Отчет');
    sheetsData[primarySheetName] = data;
  }

  // Pre-calculate base colsMeta once
  interface ColMeta {
    key: string;
    header: string;
    isNumeric: boolean;
    isDate: boolean;
    isTotalCol?: boolean;
    isRowIndexCol?: boolean;
  }
  const typeSampleData = data.slice(0, 50);
  const baseColsMeta = activeColumns.map(colName => {
    const sampleVal = typeSampleData.find(r => r[colName] !== null && r[colName] !== undefined)?.[colName];
    return {
      key: colName,
      header: colName,
      isNumeric: isNumericType(columnTypes[colName], sampleVal),
      isDate: isDateType(columnTypes[colName], sampleVal)
    };
  });

  // Number Format String
  let numFormatStr: string | undefined = undefined;
  if (settings.numberFormat === 'integer') {
    numFormatStr = '#,##0';
  } else if (settings.numberFormat === 'decimal2') {
    numFormatStr = '#,##0.00';
  } else if (settings.numberFormat === 'custom') {
    numFormatStr = settings.customNumberFormat || '#,##0.00 ₽';
  }

  // BUGFIX: ExcelJS does not support the "showZeros" property in WorksheetView serialization.
  // The only way to native hide zeros in Excel while preserving mathematical values is via custom Number Formats.
  if (settings.showZeroValues === false) {
    if (numFormatStr && !numFormatStr.includes(';')) {
      numFormatStr = `${numFormatStr};-${numFormatStr};;@`;
    } else if (!numFormatStr) {
      numFormatStr = 'General;-General;;@';
    }
  }

  // Date Format String
  let dateFormatStr = 'dd.mm.yyyy';
  if (settings.dateFormat === 'DD.MM.YYYY HH:MM:SS') {
    dateFormatStr = 'dd.mm.yyyy hh:mm:ss';
  } else if (settings.dateFormat === 'YYYY-MM-DD') {
    dateFormatStr = 'yyyy-mm-dd';
  }

  // Border Style Object
  const borderColorArgb = cleanHexColor(settings.borderColor);
  const getBorderStyleDef = (styleName: string) => {
    switch (styleName) {
      case 'medium': return { style: 'medium' as const, color: { argb: borderColorArgb } };
      case 'dashed': return { style: 'dashed' as const, color: { argb: borderColorArgb } };
      case 'dotted': return { style: 'dotted' as const, color: { argb: borderColorArgb } };
      case 'none': return undefined;
      default: return { style: 'thin' as const, color: { argb: borderColorArgb } };
    }
  };
  
  const defaultBorder = getBorderStyleDef(settings.borderStyle);
  const thinBorder = { style: 'thin' as const, color: { argb: borderColorArgb } };
  const doubleBorder = { style: 'double' as const, color: { argb: borderColorArgb } };

  function getCellBorder(isTotalRowCell: boolean) {
    if (settings.borderStyle === 'none') return undefined;
    if (settings.borderStyle === 'horizontal_only' && defaultBorder) return { top: defaultBorder, bottom: defaultBorder };
    if (settings.borderStyle === 'outer_only') return undefined;
    
    if (defaultBorder) return { top: defaultBorder, bottom: defaultBorder, left: defaultBorder, right: defaultBorder };
    return undefined;
  }

  // Helper to estimate formatted string length for width calculation
  function formatSampleValue(val: any, col: ColMeta): string {
    if (val === null || val === undefined) return '';
    if (col.isDate || val instanceof Date) {
      return settings.dateFormat === 'DD.MM.YYYY HH:MM:SS' ? 'DD.MM.YYYY HH:MM:SS' : 'DD.MM.YYYY';
    }
    if ((col.isNumeric || col.isTotalCol) && numFormatStr) {
      const numVal = Number(val);
      if (!isNaN(numVal)) {
        let formattedStr = numVal.toLocaleString('ru-RU');
        if (settings.numberFormat === 'decimal2') {
          formattedStr = numVal.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (settings.numberFormat === 'custom' && settings.customNumberFormat) {
          if (settings.customNumberFormat.includes('₽')) formattedStr += ' ₽';
          else if (settings.customNumberFormat.includes('%')) formattedStr += ' %';
        }
        return formattedStr;
      }
    }
    return String(val);
  }

  for (const [primarySheetName, sheetData] of Object.entries(sheetsData)) {

  const hasColIndexRow = settings.enableColumnIndexRow;
  
  // Row Indices Mapping
  const hasTotalsRow = settings.enableTotalsRow;
  const totalsRowPos = settings.totalsRowPosition; // 'top' or 'bottom'
  const effectiveCatCols = settings.enableFirstColumnStyle 
    ? Math.max(0, settings.categoryColumnsCount ?? 1)
    : 0;
  const freezeColsCount = settings.freezeFirstColumn
    ? (effectiveCatCols > 0 ? effectiveCatCols : 1) + (settings.enableRowIndexColumn ? 1 : 0)
    : 0;
  
  let currentNextRow = 1;
  let reportTitleRowIdx = -1;
  let reportSubtitleRowIdx = -1;

  if (settings.enableReportTitle && settings.reportTitle) {
    reportTitleRowIdx = currentNextRow;
    currentNextRow++;
    if (settings.reportSubtitle) {
      reportSubtitleRowIdx = currentNextRow;
      currentNextRow++;
    }
  }

  const headerRowIdx = currentNextRow;
  currentNextRow++;

  let colIndexRowIdx = -1;
  let totalsRowIdx = -1;

  if (hasColIndexRow) {
    colIndexRowIdx = currentNextRow;
    currentNextRow++;
  }

  if (hasTotalsRow && totalsRowPos === 'top') {
    totalsRowIdx = currentNextRow;
    currentNextRow++;
  }

  const dataStartRowIdx = currentNextRow;
  const dataEndRowIdx = dataStartRowIdx + sheetData.length - 1;

  if (hasTotalsRow && totalsRowPos === 'bottom') {
    totalsRowIdx = dataEndRowIdx + 1;
  }

  // Primary Sheet
  const mainSheet = workbook.addWorksheet(primarySheetName, {
    properties: {
      defaultRowHeight: Math.max(20, Math.ceil(settings.dataFontSize * 1.6))
    },
    views: [
      {
        state: (settings.freezeHeaderRow || (settings.freezeFirstColumn && freezeColsCount > 0)) ? 'frozen' : 'normal',
        xSplit: freezeColsCount,
        ySplit: settings.freezeHeaderRow ? headerRowIdx + (hasColIndexRow ? 1 : 0) : 0,
        showGridLines: Boolean(settings.showGridLines),
        // @ts-expect-error - ExcelJS types may be incomplete for showZeroValues
        showZeroValues: settings.showZeroValues !== false,
        zoomScale: settings.zoomScale || 100
      }
    ],
    pageSetup: {
      orientation: settings.pageOrientation,
      paperSize: settings.paperSize || 9,
      fitToWidth: settings.fitToPageWidth ? 1 : 0,
      fitToHeight: 0,
      horizontalCentered: settings.printHorizontalCentered,
      margins: settings.narrowMargins ? { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } : undefined,
      printTitlesRow: settings.printTitlesRow ? `${headerRowIdx}:${headerRowIdx + (hasColIndexRow ? 1 : 0)}` : undefined
    },
    headerFooter: {
      oddFooter: settings.addPageNumbers ? (
        settings.pageNumberPosition === 'right' 
          ? `&R${settings.pageNumberFormat === 'simple' ? 'Стр. &P' : 'Страница &P из &N'}` 
          : `&C${settings.pageNumberFormat === 'simple' ? 'Стр. &P' : 'Страница &P из &N'}`
      ) : undefined,
      evenFooter: settings.addPageNumbers ? (
        settings.pageNumberPosition === 'right' 
          ? `&R${settings.pageNumberFormat === 'simple' ? 'Стр. &P' : 'Страница &P из &N'}` 
          : `&C${settings.pageNumberFormat === 'simple' ? 'Стр. &P' : 'Страница &P из &N'}`
      ) : undefined
    }
  });

  // Determine if Totals column is active
  const hasTotalsCol = settings.enableTotalsColumn;
  const totalsColPos = settings.totalsColumnPosition; // 'right' or 'left'

  // Build column metadata array

  const colsMeta: ColMeta[] = baseColsMeta.map(c => ({...c}));

  if (hasTotalsCol) {
    const totalColMeta: ColMeta = {
      key: '__TOTAL_COL__',
      header: 'Итого',
      isNumeric: true,
      isDate: false,
      isTotalCol: true
    };
    if (totalsColPos === 'left') {
      const insertIdx = Math.min(effectiveCatCols, colsMeta.length);
      colsMeta.splice(insertIdx, 0, totalColMeta);
    } else {
      colsMeta.push(totalColMeta);
    }
  }

  if (settings.enableRowIndexColumn) {
    colsMeta.unshift({
      key: '__ROW_INDEX_COL__',
      header: '#',
      isNumeric: false,
      isDate: false,
      isRowIndexCol: true
    });
  }

  // 1. Calculate Column Widths First (so usable width is known for row height estimation)
  // OPTIMIZATION: Only sample the first 50 rows to prevent massive CPU overhead on huge datasets
  const sampleData = sheetData.slice(0, 50);

  colsMeta.forEach((col, colIdx) => {
    if (col.isRowIndexCol) {
      const maxDigits = String(sheetData.length).length;
      mainSheet.getColumn(colIdx + 1).width = Math.max(maxDigits + 5, 7);
    } else if (settings.autoColumnWidth) {
      let maxLen = 10;

      // 1. Header length estimation (bold font + filter dropdown arrow)
      if (col.header) {
        const filterButtonWidth = settings.enableAutoFilter ? 6 : 2;
        const estimatedHeaderWidth = Math.ceil(estimateStringExcelWidth(String(col.header), settings.headerFontSize) * 1.1) + filterButtonWidth;
        if (estimatedHeaderWidth > maxLen) maxLen = estimatedHeaderWidth;
      }

      // 2. Data length estimation (accounting for proportional font width and padding)
      if (col.isTotalCol) {
        let grandTotal = 0;
        const dataCols = colsMeta.filter(cm => !cm.isRowIndexCol && !cm.isTotalCol);
        const colsToSum = dataCols.length > effectiveCatCols 
          ? dataCols.slice(effectiveCatCols) 
          : (effectiveCatCols === 0 ? dataCols : []);

        sampleData.forEach(row => {
          let rowSum = 0;
          colsToSum.forEach(cm => {
            const v = Number(row[cm.key]);
            if (!isNaN(v)) rowSum += v;
          });
          grandTotal += rowSum;
          const formattedSum = formatSampleValue(rowSum, col);
          const estimatedValWidth = Math.ceil(estimateStringExcelWidth(formattedSum, settings.dataFontSize)) + 3;
          if (estimatedValWidth > maxLen) maxLen = estimatedValWidth;
        });
        const formattedGrandTotal = formatSampleValue(grandTotal, col);
        const estimatedGrandTotalWidth = Math.ceil(estimateStringExcelWidth(formattedGrandTotal, settings.dataFontSize)) + 3;
        if (estimatedGrandTotalWidth > maxLen) maxLen = estimatedGrandTotalWidth;
      } else {
        sampleData.forEach(row => {
          const val = row[col.key];
          if (val !== null && val !== undefined) {
            const formattedVal = formatSampleValue(val, col);
            // We split by actual newlines \n. A multi-line string's width is dictated by its longest line.
            const lines = formattedVal.split(/\r?\n/);
            for (const line of lines) {
              const estimatedLineWidth = Math.ceil(estimateStringExcelWidth(line, settings.dataFontSize)) + 3;
              if (estimatedLineWidth > maxLen) maxLen = estimatedLineWidth;
            }
          }
        });
      }

      let calculatedWidth = maxLen;

      // Ensure dates and timestamps have enough width so Excel NEVER renders #####
      const sampleVal = sampleData.find(r => r[col.key] !== null && r[col.key] !== undefined)?.[col.key];
      const isDateCol = col.isDate || (typeof sampleVal === 'string' && parsePotentialDate(sampleVal) !== null) || sampleVal instanceof Date;
      if (isDateCol) {
        const minDateWidth = settings.dateFormat === 'DD.MM.YYYY HH:MM:SS' ? 25 : 17;
        if (calculatedWidth < minDateWidth) calculatedWidth = minDateWidth;
      } else if (col.isNumeric || col.isTotalCol) {
        if (calculatedWidth < 14) calculatedWidth = 14;
      }

      // Cap at maxColumnWidth if defined
      const maxCap = settings.maxColumnWidth || 50;
      calculatedWidth = Math.min(calculatedWidth, maxCap);

      mainSheet.getColumn(colIdx + 1).width = Math.max(12, calculatedWidth);
    } else {
      mainSheet.getColumn(colIdx + 1).width = settings.fixedColumnWidth || 18;
    }
  });

  // 1.5 Apply Base Formatting to Columns (Massive Performance Boost)
  // Instead of assigning these properties to 500,000 individual cells, we assign them to the 20 columns
  colsMeta.forEach((col, colIdx) => {
    const sheetCol = mainSheet.getColumn(colIdx + 1);

    // Formats
    if (col.isRowIndexCol) {
      sheetCol.numFmt = 'General';
    } else if (numFormatStr && (col.isNumeric || col.isTotalCol)) {
      sheetCol.numFmt = numFormatStr;
    } else if (col.isDate) {
      sheetCol.numFmt = dateFormatStr;
    }

    // Alignments
    if (col.isRowIndexCol) {
      sheetCol.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: false
      };
    } else {
      const isNum = col.isNumeric || col.isTotalCol;
      const isDate = col.isDate;
      sheetCol.alignment = {
        vertical: isDate ? (settings.dateAlignVertical || 'middle') : (isNum ? settings.numericAlignVertical : settings.textAlignVertical),
        horizontal: isDate ? (settings.dateAlignHorizontal || 'center') : (isNum ? settings.numericAlignHorizontal : settings.textAlignHorizontal),
        wrapText: settings.wrapText
      };
    }

    // Fonts
    const firstDataColIdx = settings.enableRowIndexColumn ? 1 : 0;
    const isCategoryCol = settings.enableFirstColumnStyle && effectiveCatCols > 0 && (colIdx >= firstDataColIdx && colIdx < firstDataColIdx + effectiveCatCols);
    const fontColor = isCategoryCol ? cleanHexColor(settings.firstColumnTextColor) : cleanHexColor(settings.dataTextColor || '000000');

    if (col.isRowIndexCol) {
      sheetCol.font = { name: settings.fontFamily, size: Math.max(6, settings.dataFontSize - 2), color: { argb: cleanHexColor(settings.dataTextColor || '000000') } };
    } else if (col.isTotalCol) {
      sheetCol.font = { name: settings.fontFamily, size: settings.dataFontSize, bold: settings.totalsColumnBold, color: { argb: cleanHexColor(settings.totalsColumnTextColor) } };
    } else {
      sheetCol.font = { name: settings.fontFamily, size: settings.dataFontSize, bold: isCategoryCol ? settings.firstColumnBold : false, color: { argb: fontColor } };
    }
  });

  // 2. Populate Header Row (Row 1)
  const headerRow = mainSheet.getRow(headerRowIdx);

  let maxHeaderLines = 1;
  colsMeta.forEach((col, colIdx) => {
    const colWidth = mainSheet.getColumn(colIdx + 1).width || 15;
    const padding = settings.enableAutoFilter ? 4 : 1;
    const lines = estimateCellLines(col.header, colWidth - padding, settings.wrapText, settings.headerFontSize);
    if (lines > maxHeaderLines) maxHeaderLines = lines;
  });
  headerRow.height = Math.max(28, Math.ceil(maxHeaderLines * (settings.headerFontSize * 1.4)));

  colsMeta.forEach((col, colIdx) => {
    const cell = headerRow.getCell(colIdx + 1);
    cell.value = col.header;
    cell.font = {
      name: settings.fontFamily,
      size: settings.headerFontSize,
      bold: true,
      color: { argb: cleanHexColor(settings.headerTextColor) }
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: cleanHexColor(settings.headerBgColor) }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: settings.wrapText
    };
    
    if (settings.headerBorderStyle && settings.headerBorderStyle !== 'none') {
      const hBorder = getBorderStyleDef(settings.headerBorderStyle);
      if (settings.headerBorderStyle === 'horizontal_only' && hBorder) {
        cell.border = { top: hBorder, bottom: hBorder };
      } else if (hBorder) {
        cell.border = { top: hBorder, bottom: hBorder, left: hBorder, right: hBorder };
      }
    }
  });

  // 2b. Populate Column Index Row (if enabled)
  if (hasColIndexRow && colIndexRowIdx > 0) {
    const colIndexRow = mainSheet.getRow(colIndexRowIdx);
    const indexFontSize = Math.max(6, settings.dataFontSize - 2);
    colIndexRow.height = Math.max(16, Math.ceil(indexFontSize * 1.5));

    colsMeta.forEach((col, colIdx) => {
      const cell = colIndexRow.getCell(colIdx + 1);
      if (col.isRowIndexCol) {
        cell.value = '';
      } else {
        const numVal = settings.enableRowIndexColumn ? colIdx : colIdx + 1;
        cell.value = numVal;
      }
      cell.font = {
        name: settings.fontFamily,
        size: indexFontSize,
        bold: false,
        color: { argb: cleanHexColor(settings.dataTextColor || '000000') }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
      // Reset number format to general so it doesn't pick up the column's numeric/date formatting
      cell.numFmt = 'General';

      if (settings.headerBorderStyle && settings.headerBorderStyle !== 'none') {
        const hBorder = getBorderStyleDef(settings.headerBorderStyle);
        if (settings.headerBorderStyle === 'horizontal_only' && hBorder) {
          cell.border = { top: hBorder, bottom: hBorder };
        } else if (hBorder) {
          cell.border = { top: hBorder, bottom: hBorder, left: hBorder, right: hBorder };
        }
      }
    });
  }

  // PRE-COMPUTE variables outside the data loop for MASSIVE performance boost
  const dataColsForTotals = colsMeta.filter(cm => !cm.isRowIndexCol && !cm.isTotalCol);
  const colsToSum = dataColsForTotals.length > effectiveCatCols 
    ? dataColsForTotals.slice(effectiveCatCols) 
    : (effectiveCatCols === 0 ? dataColsForTotals : []);
  let totalsFirstLetter = '';
  let totalsLastLetter = '';
  if (colsToSum.length > 0) {
    const firstColIdx = colsMeta.findIndex(cm => cm.key === colsToSum[0].key);
    const lastColIdx = colsMeta.findIndex(cm => cm.key === colsToSum[colsToSum.length - 1].key);
    totalsFirstLetter = mainSheet.getColumn(firstColIdx + 1).letter;
    totalsLastLetter = mainSheet.getColumn(lastColIdx + 1).letter;
  }

  // PRE-COMPUTE row patterns outside the loop (calling cleanHexColor inside a 500,000 cell loop causes lag)
  const totalsColBg = settings.totalsColumnBgColor ? cleanHexColor(settings.totalsColumnBgColor) : undefined;
  const firstColBg = settings.firstColumnBgColor ? cleanHexColor(settings.firstColumnBgColor) : undefined;
  const zebraRowBg = settings.rowZebraBgColor ? cleanHexColor(settings.rowZebraBgColor) : undefined;
  const zebraColBg = settings.columnZebraBgColor ? cleanHexColor(settings.columnZebraBgColor) : undefined;
  const dataBorder = getCellBorder(false);

  // 3. Populate Data Rows
  sheetData.forEach((rowObj, dataIndex) => {
    const currentExcelRowIdx = dataStartRowIdx + dataIndex;
    const excelRow = mainSheet.getRow(currentExcelRowIdx);

    const isZebraRow = settings.enableRowZebra && dataIndex % 2 === 1;

    colsMeta.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1);
      const isFirstCol = colIdx === 0;
      const isZebraCol = settings.enableColumnZebra && colIdx % 2 === 1;
      if (col.isRowIndexCol) {
        const rowNum = (hasTotalsRow && totalsRowPos === 'top') ? dataIndex + 2 : dataIndex + 1;
        cell.value = rowNum;
      } else if (col.isTotalCol) {
        // Horizontal Total Column Formula stretched across data columns (skipping category columns)
        if (colsToSum.length > 0) {
          const rawColFunc = settings.totalsColumnFunction || 'SUM';
          const totalsColFunc = rawColFunc === 'COUNT' ? 'COUNTA' : rawColFunc;
          cell.value = {
            formula: `IFERROR(${totalsColFunc}(${totalsFirstLetter}${currentExcelRowIdx}:${totalsLastLetter}${currentExcelRowIdx}), "")`
          };
        } else {
          cell.value = 0;
        }
      } else {
        const rawVal = rowObj[col.key];

        if (rawVal === null || rawVal === undefined || rawVal === '') {
          cell.value = '';
        } else if (typeof rawVal === 'boolean') {
          cell.value = rawVal;
        } else if (typeof rawVal === 'string' && rawVal.startsWith('=')) {
          // ExcelJS нативно поддерживает формулы
          cell.value = { formula: rawVal.substring(1), result: undefined };
        } else if (typeof rawVal === 'object' && !(rawVal instanceof Date)) {
          // Serialize objects and arrays to JSON to prevent "[object Object]" in Excel
          cell.value = JSON.stringify(rawVal);
        } else if (col.isNumeric && (typeof rawVal === 'number' || typeof rawVal === 'bigint' || (!isNaN(Number(rawVal)) && String(rawVal).trim() !== ''))) {
          // If it's a giant BigInt or string number (e.g., Snowflake IDs), it will lose precision in Excel if we write it as a Number.
          // Excel only supports 15 digits of precision.
          const strVal = String(rawVal);
          const rawDigits = strVal.replace(/[^0-9]/g, '');
          if (rawDigits.length > 15 && !strVal.includes('.')) {
             cell.value = strVal; // Export as string to preserve long IDs
          } else {
             cell.value = Number(rawVal);
          }
        } else if (col.isDate && rawVal) {
          // OPTIMIZATION: Only parse to Date object if it is not already a string, or if we know it's a date.
          // In reality, exceljs converts Date objects. To save CPU, if rawVal is already a string that Excel can understand
          // as a date, we could skip it, but Excel strictly requires standard JS Dates to apply Date formatting correctly.
          if (rawVal instanceof Date) {
            cell.value = rawVal;
          } else {
            const parsedDt = new Date(rawVal as string | number);
            if (!isNaN(parsedDt.getTime())) {
              cell.value = parsedDt;
            } else {
              cell.value = String(rawVal);
            }
          }
        } else {
          cell.value = String(rawVal);
        }
      }

      // Fills / Zebra
      const firstDataColIdx = settings.enableRowIndexColumn ? 1 : 0;
      const isCategoryCol = settings.enableFirstColumnStyle && effectiveCatCols > 0 && (colIdx >= firstDataColIdx && colIdx < firstDataColIdx + effectiveCatCols);
      
      if (col.isTotalCol && totalsColBg) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: totalsColBg }
        };
      } else if (isCategoryCol && firstColBg) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: firstColBg }
        };
      } else if (isZebraRow && zebraRowBg) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: zebraRowBg }
        };
      } else if (isZebraCol && zebraColBg) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: zebraColBg }
        };
      }

      if (dataBorder) {
        cell.border = dataBorder;
      }
    });
  });

  // 3.5 Apply Category Auto-Grouping and Pseudo-Merging (if enabled)
  if (
    settings.categoryGroupColumn &&
    settings.categoryGroupColumn > 0 &&
    rawColumns.length >= settings.categoryGroupColumn &&
    sheetData.length > 0
  ) {
    const groupColKey = rawColumns[settings.categoryGroupColumn - 1];
    const groupColMetaIdx = colsMeta.findIndex(cm => cm.key === groupColKey);

    if (groupColMetaIdx !== -1) {
      const sheetGroupColIdx = groupColMetaIdx + 1;

      for (let i = 0; i < sheetData.length; i++) {
        const currentExcelRowIdx = dataStartRowIdx + i;
        const row = mainSheet.getRow(currentExcelRowIdx);
        const cell = row.getCell(sheetGroupColIdx);
        const currentVal = sheetData[i] ? sheetData[i][groupColKey] : undefined;
        const prevVal = i > 0 && sheetData[i - 1] ? sheetData[i - 1][groupColKey] : undefined;
        const nextVal = i < sheetData.length - 1 && sheetData[i + 1] ? sheetData[i + 1][groupColKey] : undefined;

        const isNewGroup = i === 0 || currentVal !== prevVal;
        const isLastInGroup = i === sheetData.length - 1 || currentVal !== nextVal;

        if (!isNewGroup) {
          // Child row: assign outline level
          row.outlineLevel = 1;
          if (settings.categoryGroupCollapse) {
            row.hidden = true;
          }

          if (settings.categoryGroupCleanDuplicates) {
            cell.value = '';

            // Cleanly remove top border and keep bottom only on the last element of the group
            if (cell.border) {
              const existingBorder = cell.border;
              cell.border = {
                ...existingBorder,
                top: undefined,
                bottom: isLastInGroup ? existingBorder.bottom : undefined
              };
            }
          }
        } else if (settings.categoryGroupCleanDuplicates) {
          // Main / Parent row of the category: remove bottom border if group continues
          if (cell.border && !isLastInGroup) {
            cell.border = {
              ...cell.border,
              bottom: undefined
            };
          }
        }
      }
    }
  }

  // 4. Populate Totals Row (if enabled)
  if (hasTotalsRow && totalsRowIdx > 0) {
    const totalsRow = mainSheet.getRow(totalsRowIdx);
    totalsRow.height = Math.max(24, Math.ceil(settings.totalFontSize * 1.7));

    const funcName = settings.totalsRowFunction || 'SUM';
    const firstDataColIdx = settings.enableRowIndexColumn ? 1 : 0;

    colsMeta.forEach((col, colIdx) => {
      const cell = totalsRow.getCell(colIdx + 1);

      if (col.isRowIndexCol) {
        cell.value = (hasTotalsRow && totalsRowPos === 'top') ? 1 : sheetData.length + 1;
      } else if (col.isTotalCol) {
        const isCountFunc = funcName === 'COUNT' || (funcName as string) === 'COUNTA';
        const finalFunc = funcName === 'COUNT' ? 'COUNTA' : funcName;
        const colLetter = mainSheet.getColumn(colIdx + 1).letter;
        cell.value = {
          formula: `IFERROR(${finalFunc}(${colLetter}${dataStartRowIdx}:${colLetter}${dataEndRowIdx}), "")`
        };
      } else if (effectiveCatCols > 0 && colIdx === firstDataColIdx) {
        cell.value = 'Итого:';
      } else if (effectiveCatCols > 0 && colIdx > firstDataColIdx && colIdx < firstDataColIdx + effectiveCatCols) {
        cell.value = '';
      } else if (effectiveCatCols === 0 && colIdx === firstDataColIdx && !col.isNumeric) {
        cell.value = 'Итого:';
      } else {
        const isCountFunc = funcName === 'COUNT' || (funcName as string) === 'COUNTA';
        // Если это не формула подсчета, и столбец не является числовым (например, текст или дата), то пропускаем
        if (!isCountFunc && !col.isNumeric) {
          cell.value = '';
        } else {
          // В настройках у нас "COUNT" (Счет). Пользователь попросил всегда использовать COUNTA (СЧЕТЗ).
          const finalFunc = funcName === 'COUNT' ? 'COUNTA' : funcName;
          
          const colLetter = mainSheet.getColumn(colIdx + 1).letter;
          cell.value = {
            formula: `IFERROR(${finalFunc}(${colLetter}${dataStartRowIdx}:${colLetter}${dataEndRowIdx}), "")`
          };
        }
      }

      if (numFormatStr && !col.isRowIndexCol) {
        cell.numFmt = numFormatStr;
      }

      if (col.isRowIndexCol) {
        const indexFontSize = Math.max(6, settings.dataFontSize - 2);
        cell.font = {
          name: settings.fontFamily,
          size: indexFontSize,
          bold: false,
          color: { argb: '334155' }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: settings.wrapText
        };
      } else {
        // Totals Row styling has highest priority
        cell.font = {
          name: settings.fontFamily,
          size: settings.totalFontSize,
          bold: settings.totalsRowBold,
          color: { argb: cleanHexColor(settings.totalsRowTextColor) }
        };

        const isNum = col.isNumeric || col.isTotalCol;
        const isDate = col.isDate;
        cell.alignment = {
          vertical: isDate ? (settings.dateAlignVertical || 'middle') : (isNum ? settings.numericAlignVertical : settings.textAlignVertical),
          horizontal: isDate ? (settings.dateAlignHorizontal || 'center') : (isNum ? settings.numericAlignHorizontal : settings.textAlignHorizontal),
          wrapText: settings.wrapText
        };

        if (settings.totalsRowBgColor) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: cleanHexColor(settings.totalsRowBgColor) }
          };
        }
      }

      const border = getCellBorder(true);
      if (border) cell.border = border;
    });
  }

  // 5. Apply AutoFilter to Header Row
  if (settings.enableAutoFilter) {
    mainSheet.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to: { row: headerRowIdx, column: colsMeta.length }
    };
  }

  // 5.6 Protect Sheet
  if (settings.protectSheet) {
    // ВАЖНО: В браузере защита со стандартным хэшированием (spinCount = 100000) вызывает фриз на несколько секунд.
    // Снижаем spinCount до 100, так как защита листа от изменений — это не криптографическая защита от взлома.
    await mainSheet.protect(settings.sheetPassword || '', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      autoFilter: true,
      sort: true,
      formatCells: false,
      formatColumns: true,
      formatRows: true,
      spinCount: 100 
    });
  }

  // 5.7 Populate Report Title and Subtitle (After columns are formatted)
  if (settings.enableReportTitle && reportTitleRowIdx > 0) {
    const titleRow = mainSheet.getRow(reportTitleRowIdx);
    const firstDataColIdx = settings.enableRowIndexColumn ? 2 : 1;
    
    const titleCell = titleRow.getCell(firstDataColIdx);
    titleCell.value = settings.reportTitle;
    
    // Apply styling independently of column styles
    titleCell.font = {
      name: settings.fontFamily,
      size: settings.reportTitleFontSize,
      bold: settings.reportTitleBold,
      italic: settings.reportTitleItalic,
      color: { argb: cleanHexColor(settings.reportTitleColor) }
    };
    
    if (settings.reportTitleBgColor) {
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: cleanHexColor(settings.reportTitleBgColor) }
      };
    }
    
    titleCell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: false
    };
    // No borders for title
    titleRow.height = Math.max(25, Math.ceil(settings.reportTitleFontSize * 1.5));

    if (settings.reportSubtitle && reportSubtitleRowIdx > 0) {
      const subtitleRow = mainSheet.getRow(reportSubtitleRowIdx);
      
      const subCell = subtitleRow.getCell(firstDataColIdx);
      subCell.value = settings.reportSubtitle;
      subCell.font = {
        name: settings.fontFamily,
        size: settings.reportSubtitleFontSize || 11,
        bold: settings.reportSubtitleBold || false,
        italic: settings.reportSubtitleItalic || false,
        color: { argb: cleanHexColor(settings.reportSubtitleColor || '64748B') }
      };
      
      if (settings.reportSubtitleBgColor) {
         subCell.fill = {
           type: 'pattern',
           pattern: 'solid',
           fgColor: { argb: cleanHexColor(settings.reportSubtitleBgColor) }
         };
      }
      subCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
      subtitleRow.height = Math.max(20, Math.ceil((settings.reportSubtitleFontSize || 11) * 1.5));
    }
  }

  }

  // 6. Secondary Sheet (SQL Query & Metadata)
  if (settings.includeSqlSheet) {
    const rawMetaSheetName = settings.sqlSheetName || 'Метаданные';
    const metaSheetName = sanitizeSheetName(rawMetaSheetName, 'Метаданные');
    const metaSheet = workbook.addWorksheet(metaSheetName, {
      state: settings.hideSqlSheet ? 'hidden' : 'visible',
      views: [{ showGridLines: Boolean(settings.showGridLines), zoomScale: 100 }]
    });

    metaSheet.getColumn(1).width = 30;
    metaSheet.getColumn(2).width = 60;

    // Header Title
    const titleCell = metaSheet.getCell('A1');
    titleCell.value = 'Информация о выгрузке отчета     ';
    titleCell.font = { name: settings.fontFamily, size: 14, bold: true, color: { argb: cleanHexColor(settings.headerTextColor) } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cleanHexColor(settings.headerBgColor) } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    
    const titleCellB = metaSheet.getCell('B1');
    titleCellB.font = titleCell.font;
    titleCellB.fill = titleCell.fill;
    
    const headerBorder = getCellBorder(false);
    if (headerBorder) {
      titleCell.border = headerBorder;
      titleCellB.border = headerBorder;
    }
    
    metaSheet.getRow(1).height = 30;

    // Metadata Key/Value Rows
    const metaInfo = [
      ['Дата и время выгрузки', new Date().toLocaleString('ru-RU')],
      ['Количество строк', data.length],
      ['Количество столбцов', rawColumns.length]
    ];

    metaInfo.forEach((infoRow, idx) => {
      const rIdx = idx + 3;
      const r = metaSheet.getRow(rIdx);
      r.height = 20;

      const kCell = r.getCell(1);
      kCell.value = infoRow[0];
      kCell.font = { name: settings.fontFamily, size: 10, bold: true };
      kCell.alignment = { horizontal: 'left', vertical: 'middle' };
      const border = getCellBorder(false);
      if (border) kCell.border = border;
      
      const vCell = r.getCell(2);
      vCell.value = infoRow[1];
      vCell.font = { name: settings.fontFamily, size: 10 };
      vCell.alignment = { horizontal: 'left', vertical: 'middle' };
      if (border) vCell.border = border;
    });

    // SQL Section
    const sqlStartRow = metaInfo.length + 5;
    const sqlHeaderCell = metaSheet.getCell(`A${sqlStartRow}`);
    sqlHeaderCell.value = 'Исходный SQL-запрос                                   ';
    sqlHeaderCell.font = { name: settings.fontFamily, size: 12, bold: true, color: { argb: cleanHexColor(settings.headerTextColor) } };
    sqlHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cleanHexColor(settings.headerBgColor) } };
    sqlHeaderCell.alignment = { vertical: 'middle', horizontal: 'left' };
    
    const sqlHeaderCellB = metaSheet.getCell(`B${sqlStartRow}`);
    sqlHeaderCellB.font = sqlHeaderCell.font;
    sqlHeaderCellB.fill = sqlHeaderCell.fill;
    
    if (headerBorder) {
      sqlHeaderCell.border = headerBorder;
      sqlHeaderCellB.border = headerBorder;
    }
    
    metaSheet.getRow(sqlStartRow).height = 26;

    const sqlTextRow = sqlStartRow + 1;
    metaSheet.mergeCells(`A${sqlTextRow}:B${sqlTextRow}`);
    const sqlCell = metaSheet.getCell(`A${sqlTextRow}`);
    sqlCell.value = sqlQuery || '-- SQL Запрос не указан';
    sqlCell.font = { name: 'Consolas', size: 10 }; // Monospace font as requested
    sqlCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    sqlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
    const sqlBorder = getCellBorder(false);
    if (sqlBorder) {
      sqlCell.border = sqlBorder;
      metaSheet.getCell(`B${sqlTextRow}`).border = sqlBorder;
    }
    
    // Increase row height manually so we don't need mergeCells to show content vertically
    const lineCount = (sqlQuery || '').split('\n').length;
    metaSheet.getRow(sqlTextRow).height = Math.max(200, lineCount * 15);
  }

  // Write to Binary Buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Generate File Name
  const baseName = parsedFilename || sanitizeSheetName(settings.defaultFileName || 'report', 'report');
  const exportFileName = filename || `${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  // Download File (Web Blob or Tauri API)
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await downloadFileWithFallback(blob, exportFileName);
}
