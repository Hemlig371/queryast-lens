import { describe, it, expect } from 'vitest';
import { hasExcelSaveDirective } from '../src/utils/excelParse';

// Автоэкспорт включается только директивой в блочном комментарии (п. 3.5, B-11).
describe('hasExcelSaveDirective', () => {
  it('директива в блочном комментарии с путём', () => {
    expect(hasExcelSaveDirective('/* @excel_save: /tmp/report.xlsx */ SELECT 1')).toBe(true);
    expect(hasExcelSaveDirective('SELECT 1 /* #Заголовок @excel_save:C:\\out\\r.xlsx @sheet:A */')).toBe(true);
  });

  it('нет директивы или нет пути', () => {
    expect(hasExcelSaveDirective('SELECT 1')).toBe(false);
    expect(hasExcelSaveDirective('')).toBe(false);
    expect(hasExcelSaveDirective('/* @excel_save: */ SELECT 1')).toBe(false);
    expect(hasExcelSaveDirective('/* @excel_save */ SELECT 1')).toBe(false);
  });

  it('упоминание в строке не включает автоэкспорт', () => {
    expect(hasExcelSaveDirective("SELECT '@excel_save: x.xlsx'")).toBe(false);
    expect(hasExcelSaveDirective("SELECT * FROM t WHERE note = '@excel_save'")).toBe(false);
    expect(hasExcelSaveDirective('SELECT "@excel_save: a" FROM t')).toBe(false);
  });

  it('строчный комментарий -- не включает автоэкспорт', () => {
    expect(hasExcelSaveDirective('-- @excel_save: x.xlsx\nSELECT 1')).toBe(false);
  });

  it('незакрытый блочный комментарий не включает автоэкспорт', () => {
    expect(hasExcelSaveDirective('/* @excel_save: x.xlsx\nSELECT 1')).toBe(false);
  });

  it('блочный комментарий внутри строки не считается', () => {
    expect(hasExcelSaveDirective("SELECT '/* @excel_save: x.xlsx */'")).toBe(false);
  });

  it('директива после строки с апострофом-литералом всё ещё находится', () => {
    expect(hasExcelSaveDirective("SELECT 'a' /* @excel_save: x.xlsx */")).toBe(true);
  });
});
