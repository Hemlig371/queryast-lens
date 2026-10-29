import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildFromTemplate } from '../src/utils/excelTemplate';

/**
 * Проверка на настоящем exceljs: шаблон собирается в памяти, заполняется и перечитывается.
 * Файл без внешних данных; сохранность оформления реальных форм нужно смотреть глазами (предпросмотр печати).
 */
async function makeTemplateBuffer(marker: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Отчет');
  ws.getCell('A1').value = 'Отчёт';
  ws.getCell('A2').value = 'Категория'; ws.getCell('B2').value = 'Имя'; ws.getCell('C2').value = 'Сумма';
  ws.getCell('A3').value = 'Прочее'; ws.getCell('A3').font = { bold: true };
  ws.getCell('B3').value = marker; ws.getCell('B3').border = { top: { style: 'thin' } };
  ws.getCell('C3').numFmt = '#,##0.00';
  ws.getRow(3).height = 24;
  ws.getCell('C5').value = { formula: 'SUM(C3:C3)' };
  ws.getCell('A6').value = 'Подпись';
  ws.mergeCells('A6:C6');
  ws.pageSetup.printArea = 'A1:C6';
  ws.pageSetup.orientation = 'landscape';
  wb.addWorksheet('Другой').getCell('A1').value = 'остаётся как есть';
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const columns = ['name', 'sum'];
const rows = [{ name: 'A', sum: 10 }, { name: 'B', sum: 20.5 }, { name: 'C', sum: null }];
const input = { path: '/tmp/template.xlsx', columns, rows, columnTypes: { sum: 'Float64' } };

describe('экспорт по шаблону на настоящем exceljs', () => {
  it('[[rows]]: данные, оформление ведущей строки, сдвиг подписи, область печати, формула', async () => {
    const out = await buildFromTemplate(input, await makeTemplateBuffer('[[rows]]'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out as any);
    const ws = wb.getWorksheet('Отчет')!;

    expect([ws.getCell('B3').value, ws.getCell('B4').value, ws.getCell('B5').value]).toEqual(['A', 'B', 'C']);
    expect([ws.getCell('C3').value, ws.getCell('C4').value]).toEqual([10, 20.5]);
    for (const r of [3, 4, 5]) {
      expect(ws.getCell(`B${r}`).border?.top?.style).toBe('thin');
      expect(ws.getCell(`C${r}`).numFmt).toBe('#,##0.00');
      expect(ws.getRow(r).height).toBe(24);
    }
    expect(ws.getCell('A3').font?.bold).toBe(true);
    expect(ws.getCell('A4').font?.bold).toBe(true);

    expect(ws.getCell('A8').value).toBe('Подпись');
    expect(ws.model.merges).toContain('A8:C8');
    expect((ws.getCell('C7').value as any).formula).toBe('SUM(C3:C5)');
    expect(ws.pageSetup.printArea).toBe('A1:C8');
    expect(ws.pageSetup.orientation).toBe('landscape');

    expect(wb.getWorksheet('Другой')!.getCell('A1').value).toBe('остаётся как есть');
  });

  it('[[table]]: первой строкой имена колонок', async () => {
    const out = await buildFromTemplate(input, await makeTemplateBuffer('[[table]]'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out as any);
    const ws = wb.getWorksheet('Отчет')!;
    expect([ws.getCell('B3').value, ws.getCell('C3').value]).toEqual(['name', 'sum']);
    expect(ws.getCell('B6').value).toBe('C');
    expect(ws.pageSetup.printArea).toBe('A1:C9');
  });

  it('@template_values: данные записаны, оформление и положение остального не тронуты', async () => {
    const out = await buildFromTemplate({ ...input, valuesOnly: true }, await makeTemplateBuffer('[[rows]]'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out as any);
    const ws = wb.getWorksheet('Отчет')!;
    expect([ws.getCell('B3').value, ws.getCell('B4').value, ws.getCell('B5').value]).toEqual(['A', 'B', 'C']);
    expect(ws.getCell('B4').border?.top?.style).toBeUndefined();
    expect(ws.getCell('A6').value).toBe('Подпись');
    expect(ws.model.merges).toContain('A6:C6');
    expect(ws.pageSetup.printArea).toBe('A1:C6');
  });

  it('рамки по краям объединения ниже маркера сохраняются при сдвиге', async () => {
    const wb0 = new ExcelJS.Workbook();
    const w0 = wb0.addWorksheet('Отчет');
    w0.getCell('B3').value = '[[rows]]';
    w0.getCell('A6').value = 'Подпись';
    w0.getCell('A6').border = { left: { style: 'thin' }, top: { style: 'thin' }, bottom: { style: 'thin' } };
    w0.getCell('B6').border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
    w0.getCell('C6').border = { right: { style: 'thick' }, top: { style: 'thin' }, bottom: { style: 'thin' } };
    // mergeCells копирует стиль главной клетки на остальные, поэтому шаблон объединяется без копирования стиля
    w0.mergeCellsWithoutStyle('A6:C6');
    const src = new Uint8Array(await wb0.xlsx.writeBuffer());

    // исходный файл: рамки по краям объединения на месте (иначе тест проверял бы не код, а построение шаблона)
    const wbSrc = new ExcelJS.Workbook();
    await wbSrc.xlsx.load(src as any);
    const wsSrc = wbSrc.getWorksheet('Отчет')!;
    expect(wsSrc.getCell('A6').border?.left?.style).toBe('thin');
    expect(wsSrc.getCell('C6').border?.right?.style).toBe('thick');

    const out = await buildFromTemplate(input, src);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out as any);
    const ws = wb.getWorksheet('Отчет')!;
    expect(ws.model.merges).toContain('A8:C8');
    expect(ws.getCell('A8').border?.left?.style).toBe('thin');
    expect(ws.getCell('C8').border?.right?.style).toBe('thick');
    expect(ws.getCell('C8').border?.top?.style).toBe('thin');
  });

  it('понятные ошибки: нет маркера, нет листа', async () => {
    await expect(buildFromTemplate(input, await makeTemplateBuffer('без маркера'))).rejects.toThrow(/маркер/);
    await expect(buildFromTemplate({ ...input, sheetName: 'Нет такого' }, await makeTemplateBuffer('[[rows]]'))).rejects.toThrow(/нет листа/);
  });
});

describe('[[header]], [[title]], [[subtitle]] и пустой результат на настоящем exceljs', () => {
  async function makeBuffer(rowsMarker = '[[rows]]', headerRow = 4, rowsCell = 'B5'): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Отчет');
    ws.getCell('A1').value = 'Отчёт: [[title]]';
    ws.getCell('A2').value = '[[subtitle]]';
    ws.mergeCells('A2:C2');
    ws.getCell(`B${headerRow}`).value = '[[header]]';
    ws.getCell(`B${headerRow}`).font = { bold: true };
    ws.getCell(`C${headerRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    ws.getCell(rowsCell).value = rowsMarker;
    ws.getCell('A7').value = 'Подпись';
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }
  const base = { path: '/tmp/template.xlsx', columns, columnTypes: { sum: 'Float64' }, title: 'Продажи', subtitle: '2026' };

  it('шапка на месте, данные от [[rows]], заголовки подставлены, подпись сдвинута', async () => {
    const out = await buildFromTemplate({ ...base, rows }, await makeBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out as any);
    const ws = wb.getWorksheet('Отчет')!;
    expect(ws.getCell('A1').value).toBe('Отчёт: Продажи');
    expect(ws.getCell('A2').value).toBe('2026');
    expect(ws.model.merges).toContain('A2:C2');
    expect([ws.getCell('B4').value, ws.getCell('C4').value]).toEqual(['name', 'sum']);
    expect(ws.getCell('B4').font?.bold).toBe(true);
    expect(ws.getCell('C4').fill).toBeTruthy();
    expect([ws.getCell('B5').value, ws.getCell('B6').value, ws.getCell('B7').value]).toEqual(['A', 'B', 'C']);
    expect(ws.getCell('A9').value).toBe('Подпись');
  });

  it('пустой результат: имена колонок записаны, маркер [[rows]] убран, подпись на месте', async () => {
    const out = await buildFromTemplate({ ...base, rows: [] }, await makeBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out as any);
    const ws = wb.getWorksheet('Отчет')!;
    expect([ws.getCell('B4').value, ws.getCell('C4').value]).toEqual(['name', 'sum']);
    expect(ws.getCell('B5').value).toBeNull();
    expect(ws.getCell('A7').value).toBe('Подпись');
  });

  it('[[header]] вместе с [[table]] и в одной строке с [[rows]] — ошибка', async () => {
    await expect(buildFromTemplate({ ...base, rows }, await makeBuffer('[[table]]'))).rejects.toThrow('[[table]]');
    await expect(buildFromTemplate({ ...base, rows }, await makeBuffer('[[rows]]', 5, 'C5'))).rejects.toThrow('в одной строке');
  });
});
