import { describe, it, expect } from 'vitest';
import {
  parseTemplateDirective,
  resolveTemplatePath,
  shiftFormulaRefs,
  shiftPrintArea,
  findTemplateMarker,
  fillTemplateSheet,
  toCellValue,
} from '../src/utils/excelTemplate';

/** Минимальная имитация листа exceljs (только то, что использует excelTemplate.ts). Поведение настоящего exceljs проверяет excelTemplate.exceljs.test.ts. */
class FakeSheet {
  cells = new Map<string, any>();
  rows = new Map<number, any>();
  merges: string[] = [];
  pageSetup: any = {};
  rowBreaks: any[] = [];
  get model() { return { merges: [...this.merges] }; }
  get rowCount() { return Math.max(0, ...[...this.cells.keys()].map(k => +k.split(',')[0])); }
  get columnCount() { return Math.max(0, ...[...this.cells.keys()].map(k => +k.split(',')[1])); }
  getCell(r: number, c: number) {
    const k = `${r},${c}`;
    if (!this.cells.has(k)) this.cells.set(k, { value: null, style: {}, numFmt: undefined });
    const cell = this.cells.get(k);
    // numFmt живёт внутри style, как в exceljs
    Object.defineProperty(cell, 'numFmt', { get() { return this.style?.numFmt; }, set(v) { this.style = { ...this.style, numFmt: v }; }, configurable: true });
    return cell;
  }
  getRow(r: number) {
    if (!this.rows.has(r)) this.rows.set(r, { height: undefined, hidden: false, outlineLevel: 0 });
    const row = this.rows.get(r);
    const self = this;
    row.eachCell = (_o: any, fn: any) => {
      for (const [k, cell] of self.cells) { const [rr, cc] = k.split(',').map(Number); if (rr === r) fn(cell, cc); }
    };
    return row;
  }
  eachRow(_o: any, fn: any) {
    const nums = new Set([...this.cells.keys()].map(k => +k.split(',')[0]));
    [...nums].sort((a, b) => a - b).forEach(r => fn(this.getRow(r), r));
  }
  mergeCells(rg: string) { this.merges.push(rg); }
  unMergeCells(rg: string) { this.merges = this.merges.filter(x => x !== rg); }
}

const val = (ws: FakeSheet, r: number, c: number) => ws.getCell(r, c).value;

/** Шаблон: 1 заголовок, 2 шапка, 3 ведущая строка с маркером (в A — категория), 4 пустая, 5 итог формулой, 6 подпись (merge). */
function makeTemplate(markerText = '[[rows]]') {
  const ws = new FakeSheet();
  ws.getCell(1, 1).value = 'Отчёт';
  ws.getCell(2, 1).value = 'Категория'; ws.getCell(2, 2).value = 'Имя'; ws.getCell(2, 3).value = 'Сумма';
  ws.getCell(3, 1).value = 'Прочее'; ws.getCell(3, 1).style = { font: { bold: true } };
  ws.getCell(3, 2).value = markerText; ws.getCell(3, 2).style = { border: { top: { style: 'thin' } } };
  ws.getCell(3, 3).style = { numFmt: '#,##0.00' };
  ws.getRow(3).height = 24;
  ws.getCell(5, 3).value = { formula: 'SUM(C3:C3)' };
  ws.getCell(6, 1).value = 'Подпись'; ws.merges.push('A6:C6');
  ws.pageSetup.printArea = 'A1:C6';
  ws.rowBreaks = [{ id: 4, max: 16383, man: true }];
  return ws;
}

describe('директива @template', () => {
  it('читает путь из блочных комментариев и не берёт @ и * в значение', () => {
    expect(parseTemplateDirective('# T\n@template: C:\\forms\\1nm.xlsx\n@file: x')).toEqual({ path: 'C:\\forms\\1nm.xlsx', valuesOnly: false });
    expect(parseTemplateDirective('@TEMPLATE: ./a.xlsx @sheet: S')).toEqual({ path: './a.xlsx', valuesOnly: false });
    expect(parseTemplateDirective('@template:   \n')).toBeNull();
    expect(parseTemplateDirective('без директив')).toBeNull();
  });
  it('@template_values — режим «только значения»', () => {
    expect(parseTemplateDirective('@template_values: forms/a.xlsx')).toEqual({ path: 'forms/a.xlsx', valuesOnly: true });
    expect(parseTemplateDirective('@template_values:\n@template: b.xlsx')).toEqual({ path: 'b.xlsx', valuesOnly: false });
  });
  it('путь шаблона берётся как есть (как @excel_save)', () => {
    expect(resolveTemplatePath('D:\\f\\a.xlsx')).toBe('D:\\f\\a.xlsx');
    expect(resolveTemplatePath('  /srv/a.xlsx ')).toBe('/srv/a.xlsx');
  });
});

describe('сдвиг формул и области печати', () => {
  it('диапазон с ведущей строкой растягивается, ниже — сдвигается, выше и «чужое» не трогается', () => {
    expect(shiftFormulaRefs('SUM(C3:C3)', 3, 10)).toBe('SUM(C3:C13)');
    expect(shiftFormulaRefs('SUM(C3:C4)', 3, 10)).toBe('SUM(C3:C14)');
    expect(shiftFormulaRefs('SUM(C1:C2)', 3, 10)).toBe('SUM(C1:C2)');
    expect(shiftFormulaRefs('C5*2+C3', 3, 10)).toBe('C15*2+C3');
    expect(shiftFormulaRefs('SUM(C5:C6)', 3, 10)).toBe('SUM(C15:C16)');
    expect(shiftFormulaRefs('SUM($C$3:$C$5)', 3, 2)).toBe('SUM($C$3:$C$7)');
  });
  it('не трогает другие листы, текст в кавычках и имена функций', () => {
    expect(shiftFormulaRefs("Лист2!A5+'Мой лист'!B7", 3, 4)).toBe("Лист2!A5+'Мой лист'!B7");
    expect(shiftFormulaRefs('"A5 и B7"&A5', 3, 4)).toBe('"A5 и B7"&A9');
    expect(shiftFormulaRefs('LOG10(A5)', 3, 4)).toBe('LOG10(A9)');
    expect(shiftFormulaRefs('A5', 3, 0)).toBe('A5');
  });
  it('область печати растягивается', () => {
    expect(shiftPrintArea('A1:C6', 3, 10)).toBe('A1:C16');
    expect(shiftPrintArea('A1:C3', 3, 10)).toBe('A1:C13');
    expect(shiftPrintArea('A1:C2', 3, 10)).toBe('A1:C2');
    expect(shiftPrintArea('A1:C6&&A9:C12', 3, 2)).toBe('A1:C8&&A11:C14');
    expect(shiftPrintArea(undefined, 3, 2)).toBeUndefined();
  });
});

describe('значения клеток', () => {
  it('числа, даты, формулы, NULL', () => {
    expect(toCellValue(5n)).toBe(5);
    expect(toCellValue(null)).toBeNull();
    expect(toCellValue('12.5', 'Decimal(10,2)')).toBe(12.5);
    expect(toCellValue('12.5', 'String')).toBe('12.5');
    expect(toCellValue('=SUM(A1:A2)')).toEqual({ formula: 'SUM(A1:A2)' });
    expect(toCellValue('2024-05-01 14:30:00', 'TIMESTAMP') instanceof Date).toBe(true);
    expect(toCellValue('просто текст', 'TIMESTAMP')).toBe('просто текст');
  });
});

describe('поиск маркера', () => {
  it('находит [[table]] / [[rows]] только как единственный текст клетки', () => {
    expect(findTemplateMarker(makeTemplate('[[rows]]'))).toEqual({ row: 3, col: 2, mode: 'rows' });
    expect(findTemplateMarker(makeTemplate(' [[ TABLE ]] '))).toEqual({ row: 3, col: 2, mode: 'table' });
    expect(findTemplateMarker(makeTemplate('текст [[rows]]'))).toBeNull();
  });
});

describe('заполнение листа', () => {
  const columns = ['name', 'sum'];
  const rows = [{ name: 'A', sum: 10 }, { name: 'B', sum: 20.5 }, { name: 'C', sum: null }];

  it('[[rows]]: строки с маркера, ведущее оформление копируется, всё ниже сдвигается', () => {
    const ws = makeTemplate('[[rows]]');
    const res = fillTemplateSheet(ws, findTemplateMarker(ws)!, columns, rows, { sum: 'Float64' });
    expect(res).toEqual({ written: 3, shifted: 2 });
    // данные
    expect([val(ws, 3, 2), val(ws, 4, 2), val(ws, 5, 2)]).toEqual(['A', 'B', 'C']);
    expect([val(ws, 3, 3), val(ws, 4, 3), val(ws, 5, 3)]).toEqual([10, 20.5, null]);
    // оформление ведущей строки: у всех трёх строк, включая колонку категорий слева
    for (const r of [3, 4, 5]) {
      expect(ws.getCell(r, 1).style).toEqual({ font: { bold: true } });
      expect(ws.getCell(r, 2).style).toEqual({ border: { top: { style: 'thin' } } });
      expect(ws.getCell(r, 3).style.numFmt).toBe('#,##0.00');
      expect(ws.getRow(r).height).toBe(24);
    }
    // текст категории остался только в ведущей (значения не копируются)
    expect(val(ws, 3, 1)).toBe('Прочее');
    expect(val(ws, 4, 1)).toBeNull();
    // сдвиг: итог был в строке 5 → 7, подпись 6 → 8, шапка и заголовок на месте
    expect(val(ws, 7, 3)).toEqual({ formula: 'SUM(C3:C5)' });
    expect(val(ws, 8, 1)).toBe('Подпись');
    expect(val(ws, 2, 2)).toBe('Имя');
    expect(val(ws, 1, 1)).toBe('Отчёт');
    expect(ws.merges).toEqual(['A8:C8']);
    expect(ws.pageSetup.printArea).toBe('A1:C8');
    expect(ws.rowBreaks[0].id).toBe(6);
  });

  it('[[table]]: первая строка — имена колонок', () => {
    const ws = makeTemplate('[[table]]');
    const res = fillTemplateSheet(ws, findTemplateMarker(ws)!, columns, rows);
    expect(res).toEqual({ written: 4, shifted: 3 });
    expect([val(ws, 3, 2), val(ws, 3, 3)]).toEqual(['name', 'sum']);
    expect([val(ws, 6, 2), val(ws, 6, 3)]).toEqual(['C', null]);
    expect(val(ws, 8, 3)).toEqual({ formula: 'SUM(C3:C6)' });
    expect(ws.pageSetup.printArea).toBe('A1:C9');
  });

  it('одна строка результата: ничего не сдвигается', () => {
    const ws = makeTemplate('[[rows]]');
    const res = fillTemplateSheet(ws, findTemplateMarker(ws)!, columns, [{ name: 'X', sum: 1 }]);
    expect(res).toEqual({ written: 1, shifted: 0 });
    expect(val(ws, 5, 3)).toEqual({ formula: 'SUM(C3:C3)' });
    expect(ws.merges).toEqual(['A6:C6']);
    expect(ws.pageSetup.printArea).toBe('A1:C6');
  });

  it('пустой результат: [[rows]] убирает маркер, [[table]] пишет только шапку', () => {
    const a = makeTemplate('[[rows]]');
    expect(fillTemplateSheet(a, findTemplateMarker(a)!, columns, [])).toEqual({ written: 0, shifted: 0 });
    expect(val(a, 3, 2)).toBeNull();
    const b = makeTemplate('[[table]]');
    expect(fillTemplateSheet(b, findTemplateMarker(b)!, columns, [])).toEqual({ written: 1, shifted: 0 });
    expect([val(b, 3, 2), val(b, 3, 3)]).toEqual(['name', 'sum']);
  });

  it('колонок больше, чем размечено в шаблоне: стиль берётся с клетки маркера', () => {
    const ws = makeTemplate('[[rows]]');
    fillTemplateSheet(ws, findTemplateMarker(ws)!, ['a', 'b', 'c', 'd'], [{ a: 1, b: 2, c: 3, d: 4 }, { a: 5, b: 6, c: 7, d: 8 }]);
    expect(ws.getCell(4, 5).style).toEqual({ border: { top: { style: 'thin' } } });
    expect(val(ws, 4, 5)).toBe(8);
  });

  it('объединение внутри ведущей строки повторяется в новых строках', () => {
    const ws = makeTemplate('[[rows]]');
    ws.merges.push('D3:E3');
    fillTemplateSheet(ws, findTemplateMarker(ws)!, columns, rows);
    expect(['D3:E3', 'D4:E4', 'D5:E5'].every(x => ws.merges.includes(x))).toBe(true);
  });

  it('только значения: оформление, положение и остальное содержимое не меняются, строки не вставляются', () => {
    const ws = makeTemplate('[[rows]]');
    const res = fillTemplateSheet(ws, findTemplateMarker(ws)!, columns, rows, { sum: 'Float64' }, { valuesOnly: true });
    expect(res).toEqual({ written: 3, shifted: 0 });
    expect([val(ws, 3, 2), val(ws, 4, 2), val(ws, 5, 2)]).toEqual(['A', 'B', 'C']);
    expect([val(ws, 3, 3), val(ws, 4, 3)]).toEqual([10, 20.5]);
    // оформление и высота ведущей строки не размножались
    expect(ws.getCell(4, 2).style).toEqual({});
    expect(ws.getRow(4).height).toBeUndefined();
    // подпись, объединение, печать и формула остались на своих местах
    expect(val(ws, 6, 1)).toBe('Подпись');
    expect(ws.merges).toEqual(['A6:C6']);
    expect(ws.pageSetup.printArea).toBe('A1:C6');
    expect(val(ws, 5, 3)).toBe(null); // в этой строке данные (клетка C5 с формулой перезаписана результатом)
    // стиль ведущей строки на своём месте
    expect(ws.getCell(3, 3).style.numFmt).toBe('#,##0.00');
  });

  it('только значения и [[table]]: шапка пишется в строку маркера', () => {
    const ws = makeTemplate('[[table]]');
    fillTemplateSheet(ws, findTemplateMarker(ws)!, columns, [{ name: 'A', sum: 1 }], {}, { valuesOnly: true });
    expect([val(ws, 3, 2), val(ws, 3, 3), val(ws, 4, 2), val(ws, 4, 3)]).toEqual(['name', 'sum', 'A', 1]);
  });
});
