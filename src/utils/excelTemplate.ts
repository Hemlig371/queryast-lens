/**
 * Экспорт в Excel по шаблону (`@template: путь`).
 *
 * В шаблоне (обычном .xlsx) в одной клетке стоит маркер начала области данных:
 *   [[table]] — вставляется результат целиком, первой строкой имена колонок из SQL;
 *   [[rows]]  — вставляются только строки данных (шапка уже есть в шаблоне).
 * Строка с маркером — «ведущая»: её оформление (формат чисел, шрифт, заливка, рамки, высота, объединения)
 * применяется ко всем вставляемым строкам. Всё, что ниже ведущей строки, сдвигается вниз;
 * область печати, объединённые ячейки, высоты строк, разрывы страниц и формулы на этом листе сдвигаются вместе с ним.
 *
 * Модуль не зависит от нативного экспорта (excelExporter.ts): подключается одним переходом в exportToExcel.
 * Лист передаётся как `any`: нужен только небольшой набор методов exceljs (проверяется в tests/excelTemplate*.test.ts).
 */

import { parseExcelDate } from './excelParse';
import { t } from './i18n';

export type TemplateMode = 'table' | 'rows';

export interface TemplateMarker {
  row: number;
  col: number;
  mode: TemplateMode;
}

const MARKER_RE = /^\s*\[\[\s*(table|rows)\s*\]\]\s*$/i;

export interface TemplateDirective {
  path: string;
  /** `@template_values`: только значения, без оформления и сдвига строк. */
  valuesOnly: boolean;
}

/**
 * Директива `@template: путь` (полный режим) или `@template_values: путь` (только значения)
 * из склеенных блочных комментариев. Берётся первая из найденных; null — директивы нет.
 */
export function parseTemplateDirective(comments: string): TemplateDirective | null {
  const re = /@template(_values)?:\s*([^@\r\n*]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(comments || '')) !== null) {
    const path = m[2].trim();
    if (path) return { path, valuesOnly: !!m[1] };
  }
  return null;
}

/** Путь шаблона берётся как есть — так же, как путь в @excel_save. */
export function resolveTemplatePath(path: string): string {
  return path.trim();
}

// ---------------------------------------------------------------------------------------------
// Сдвиг ссылок в формулах (как при вставке строк в Excel)
// ---------------------------------------------------------------------------------------------

/**
 * Пересчитывает ссылки на ячейки этого листа после вставки `shift` строк под ведущую строку `markerRow`:
 * - диапазон, который содержит ведущую строку (D7:D8 при ведущей 7), растягивается на вставленные строки;
 * - ссылка или диапазон целиком ниже ведущей строки сдвигается;
 * - ссылки на другие листы (`Лист!A1`), текст в кавычках и имена функций (`LOG10(`) не затрагиваются.
 */
export function shiftFormulaRefs(formula: string, markerRow: number, shift: number): string {
  if (shift <= 0 || !formula) return formula;
  // части вне двойных кавычек (внутри кавычек чётные/нечётные индексы)
  return formula
    .split('"')
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(
        /(?<![A-Za-z0-9_!'.$])(\$?[A-Z]{1,3})(\$?)(\d+)(?::(\$?[A-Z]{1,3})(\$?)(\d+))?(?![A-Za-z0-9_(!])/g,
        (_m, c1: string, d1: string, r1: string, c2?: string, d2?: string, r2?: string) => {
          let a = parseInt(r1, 10);
          if (c2 === undefined) {
            if (a > markerRow) a += shift;
            return `${c1}${d1}${a}`;
          }
          let b = parseInt(r2 as string, 10);
          if (a > markerRow) { a += shift; b += shift; }
          else if (b >= markerRow) b += shift;
          return `${c1}${d1}${a}:${c2}${d2}${b}`;
        }
      );
    })
    .join('"');
}

/** Область печати («A1:G412» или несколько через «&&») после вставки строк: конец, лежащий не выше ведущей строки, уезжает вниз. */
export function shiftPrintArea(area: string | undefined | null, markerRow: number, shift: number): string | undefined {
  if (!area || shift <= 0) return area || undefined;
  return area
    .split('&&')
    .map(range => range.replace(/^([^:]*?)(\d+)(:)([^:]*?)(\d+)$/, (_m, c1, r1, colon, c2, r2) => {
      const a = parseInt(r1, 10);
      let b = parseInt(r2, 10);
      let s = a;
      if (a > markerRow) { s = a + shift; b += shift; } else if (b >= markerRow) b += shift;
      return `${c1}${s}${colon}${c2}${b}`;
    }))
    .join('&&');
}

// ---------------------------------------------------------------------------------------------
// Поиск маркера
// ---------------------------------------------------------------------------------------------

function cellText(value: any): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && Array.isArray(value.richText)) {
    return value.richText.map((t: any) => t.text ?? '').join('');
  }
  return null;
}

/** Первый (по строкам, затем по столбцам) маркер [[table]] / [[rows]] на листе. */
export function findTemplateMarker(ws: any): TemplateMarker | null {
  const lastRow = ws.rowCount || 0;
  const lastCol = ws.columnCount || 0;
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const text = cellText(ws.getCell(r, c).value);
      if (text === null) continue;
      const m = MARKER_RE.exec(text);
      if (m) return { row: r, col: c, mode: m[1].toLowerCase() as TemplateMode };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Значения клеток
// ---------------------------------------------------------------------------------------------

/** Объединение без копирования стиля главной клетки на остальные: рамки по краям объединения сохраняются (exceljs ≥ 4.3). */
function mergeKeepStyles(ws: any, range: string): void {
  if (typeof ws.mergeCellsWithoutStyle === 'function') ws.mergeCellsWithoutStyle(range);
  else ws.mergeCells(range);
}

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const isNumericType = (t?: string): boolean => !!t && /INT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|NUMBER/i.test(t);
const isDateTimeType = (t?: string): boolean => !!t && /DATE|TIME/i.test(t);

/** Значение для клетки Excel: числа числами, даты датами, строка с «=» — формулой, NULL — пустой клеткой. */
export function toCellValue(val: any, type?: string): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (val instanceof Date) return val;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    if (val.startsWith('=') && val.length > 1) return { formula: val.slice(1) };
    if (isNumericType(type) && val.trim() !== '' && Number.isFinite(Number(val))) return Number(val);
    if (isDateTimeType(type) && val.trim() !== '') {
      const d = parseExcelDate(val);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return val;
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ---------------------------------------------------------------------------------------------
// Заполнение листа
// ---------------------------------------------------------------------------------------------

export interface FillOptions {
  /** Только значения: оформление шаблона не трогается, строки не вставляются и не сдвигаются. */
  valuesOnly?: boolean;
}

export interface FillResult {
  /** Сколько строк записано (с заголовком, если был [[table]]). */
  written: number;
  /** На сколько строк сдвинуто содержимое ниже ведущей. */
  shifted: number;
}

/**
 * Записывает результат в лист, начиная с клетки маркера. Лист меняется на месте.
 * `columns` — имена колонок результата, `rows` — строки (объекты по имени колонки).
 */
export function fillTemplateSheet(
  ws: any,
  marker: TemplateMarker,
  columns: readonly string[],
  rows: readonly any[],
  columnTypes: Record<string, string> = {},
  options: FillOptions = {}
): FillResult {
  const { row: m, col: mc, mode } = marker;
  const total = rows.length + (mode === 'table' ? 1 : 0);

  if (options.valuesOnly) return fillValuesOnly(ws, marker, columns, rows, columnTypes, total);

  const shift = Math.max(0, total - 1);
  const maxCol = Math.max(ws.columnCount || 0, mc + columns.length - 1);
  const lastRow = ws.rowCount || m;

  // 1. Снимок ведущей строки: оформление всех клеток, высота, объединения только внутри этой строки
  const leadStyles: any[] = [];
  for (let c = 1; c <= maxCol; c++) leadStyles[c] = clone(ws.getCell(m, c).style);
  const leadRow = ws.getRow(m);
  const leadHeight = leadRow.height;
  const markerStyle = leadStyles[mc];
  const leadMerges: string[] = (ws.model?.merges || []).filter((rg: string) => {
    const [a, b] = rg.split(':');
    const ra = parseInt(a.replace(/\D/g, ''), 10);
    const rb = parseInt((b || a).replace(/\D/g, ''), 10);
    return ra === m && rb === m;
  });

  // 2. Нет данных: убрать маркер, строку оставить как есть
  if (total === 0) {
    ws.getCell(m, mc).value = null;
    return { written: 0, shifted: 0 };
  }

  // 3. Сдвиг содержимого ниже ведущей строки
  if (shift > 0) {
    const mergesBelow: string[] = (ws.model?.merges || []).filter((rg: string) => {
      const a = parseInt(rg.split(':')[0].replace(/\D/g, ''), 10);
      return a > m;
    });
    // оформление снимается до разъединения: при unMergeCells exceljs может сбросить стиль клеток внутри объединения (рамки по краям)
    const styleBelow: any[][] = [];
    for (let r = m + 1; r <= lastRow; r++) {
      styleBelow[r] = [];
      for (let c = 1; c <= maxCol; c++) styleBelow[r][c] = clone(ws.getCell(r, c).style);
    }
    mergesBelow.forEach(rg => ws.unMergeCells(rg));

    for (let r = lastRow; r > m; r--) {
      const src = ws.getRow(r);
      const dst = ws.getRow(r + shift);
      for (let c = 1; c <= maxCol; c++) {
        const from = ws.getCell(r, c);
        const to = ws.getCell(r + shift, c);
        to.value = from.value;
        to.style = styleBelow[r][c] ?? {};
      }
      dst.height = src.height;
      dst.hidden = src.hidden;
      dst.outlineLevel = src.outlineLevel;
    }

    mergesBelow.forEach(rg => {
      const [a, b] = rg.split(':');
      const move = (ref: string) => ref.replace(/(\d+)$/, (_x, n) => String(parseInt(n, 10) + shift));
      mergeKeepStyles(ws, `${move(a)}:${move(b || a)}`);
    });

    // формулы листа, область печати, разрывы страниц
    ws.eachRow({ includeEmpty: false }, (row: any) => {
      row.eachCell({ includeEmpty: false }, (cell: any) => {
        const v = cell.value;
        if (v && typeof v === 'object' && typeof v.formula === 'string') {
          cell.value = { formula: shiftFormulaRefs(v.formula, m, shift) };
        }
      });
    });
    if (ws.pageSetup?.printArea) ws.pageSetup.printArea = shiftPrintArea(ws.pageSetup.printArea, m, shift);
    if (Array.isArray(ws.rowBreaks)) {
      ws.rowBreaks.forEach((b: any) => { if (typeof b.id === 'number' && b.id >= m) b.id += shift; });
    }
  }

  // 4. Освободить вставляемые строки (значения от сдвинутой копии/шаблона) и задать им оформление ведущей
  const hasStyle = (st: any) => !!st && Object.keys(st).length > 0;
  const lastDataCol = mc + columns.length - 1;
  for (let i = 0; i < total; i++) {
    const r = m + i;
    for (let c = 1; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      // текст ведущей строки вне колонок данных остаётся только в ней (значения в новые строки не копируются)
      if (!(i === 0 && (c < mc || c > lastDataCol))) cell.value = null;
      cell.style = clone(hasStyle(leadStyles[c]) ? leadStyles[c] : (markerStyle ?? {}));
    }
    if (leadHeight !== undefined) ws.getRow(r).height = leadHeight;
    if (i > 0) {
      ws.getRow(r).hidden = false;
      ws.getRow(r).outlineLevel = leadRow.outlineLevel;
      leadMerges.forEach(rg => {
        const [a, b] = rg.split(':');
        const to = (ref: string) => ref.replace(/(\d+)$/, String(r));
        mergeKeepStyles(ws, `${to(a)}:${to(b || a)}`);
      });
    }
  }

  // 5. Данные
  let r = m;
  if (mode === 'table') {
    columns.forEach((name, j) => { ws.getCell(r, mc + j).value = name; });
    r++;
  }
  const dateFmt = (type?: string) => (/TIME/i.test(type || '') ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd');
  for (const row of rows) {
    columns.forEach((name, j) => {
      const type = columnTypes[name];
      const v = toCellValue(row?.[name], type);
      const cell = ws.getCell(r, mc + j);
      cell.value = v;
      if (v instanceof Date && (!cell.numFmt || cell.numFmt === 'General')) cell.numFmt = dateFmt(type);
    });
    r++;
  }

  return { written: total, shifted: shift };
}

/** Режим @template_values: записать значения от клетки маркера, оформление и положение всего остального не менять. */
function fillValuesOnly(
  ws: any,
  marker: TemplateMarker,
  columns: readonly string[],
  rows: readonly any[],
  columnTypes: Record<string, string>,
  total: number
): FillResult {
  const { row: m, col: mc, mode } = marker;
  if (total === 0) {
    ws.getCell(m, mc).value = null;
    return { written: 0, shifted: 0 };
  }
  let r = m;
  if (mode === 'table') {
    columns.forEach((name, j) => { ws.getCell(r, mc + j).value = name; });
    r++;
  }
  for (const row of rows) {
    columns.forEach((name, j) => {
      const type = columnTypes[name];
      const v = toCellValue(row?.[name], type);
      const cell = ws.getCell(r, mc + j);
      cell.value = v;
      // формат даты — единственное, что задаётся: без него дата в клетке «Общий» показалась бы числом
      if (v instanceof Date && (!cell.numFmt || cell.numFmt === 'General')) cell.numFmt = /TIME/i.test(type || '') ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd';
    });
    r++;
  }
  return { written: total, shifted: 0 };
}

// ---------------------------------------------------------------------------------------------
// Чтение шаблона и сборка файла
// ---------------------------------------------------------------------------------------------

export interface TemplateExportInput {
  /** Значение @template (путь как есть, как в @excel_save). */
  path: string;
  /** @sheet — лист шаблона для заполнения (без него — первый лист с маркером). */
  sheetName?: string | null;
  columns: readonly string[];
  rows: readonly any[];
  columnTypes?: Record<string, string>;
  /** @template_values: без оформления и сдвига строк. */
  valuesOnly?: boolean;
}

async function readTemplateBytes(fullPath: string): Promise<Uint8Array> {
  const tauriFs = typeof window !== 'undefined' ? (window as any).__TAURI__?.fs : undefined;
  if (tauriFs?.readBinaryFile) return tauriFs.readBinaryFile(fullPath);
  const { readBinaryFile } = await import('@tauri-apps/api/fs');
  return readBinaryFile(fullPath);
}

/** Загружает шаблон, заполняет лист и возвращает содержимое готового .xlsx. */
export async function buildFromTemplate(input: TemplateExportInput, bytesOverride?: Uint8Array): Promise<ArrayBuffer> {
  const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_IPC__' in window);
  if (!bytesOverride && !isTauri) {
    throw new Error(t('Экспорт по шаблону (@template) работает только в десктопной версии приложения'));
  }
  const fullPath = resolveTemplatePath(input.path);
  let bytes: Uint8Array;
  try {
    bytes = bytesOverride ?? (await readTemplateBytes(fullPath));
  } catch (e: any) {
    throw new Error(t('Не удалось прочитать шаблон «{path}»: {msg}').replace('{path}', fullPath).replace('{msg}', e?.message || String(e)));
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as any);
  } catch (e: any) {
    throw new Error(t('Файл «{path}» не удалось открыть как .xlsx: {msg}').replace('{path}', fullPath).replace('{msg}', e?.message || String(e)));
  }

  let sheet: any = null;
  if (input.sheetName) {
    const want = input.sheetName.trim().toLowerCase();
    sheet = workbook.worksheets.find((w: any) => String(w.name).toLowerCase() === want) || null;
    if (!sheet) throw new Error(t('В шаблоне нет листа «{name}»').replace('{name}', input.sheetName.trim()));
  }
  let marker: TemplateMarker | null = null;
  if (sheet) marker = findTemplateMarker(sheet);
  else {
    for (const w of workbook.worksheets) {
      const mk = findTemplateMarker(w);
      if (mk) { sheet = w; marker = mk; break; }
    }
  }
  if (!sheet || !marker) {
    throw new Error(t('В шаблоне не найден маркер [[table]] или [[rows]] (в одной клетке, без другого текста)'));
  }

  fillTemplateSheet(sheet, marker, input.columns, input.rows, input.columnTypes || {}, { valuesOnly: !!input.valuesOnly });
  // значения формул пересчитает Excel при открытии
  (workbook as any).calcProperties = { ...((workbook as any).calcProperties || {}), fullCalcOnLoad: true };
  return workbook.xlsx.writeBuffer();
}
