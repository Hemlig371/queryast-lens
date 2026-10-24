import { describe, it, expect } from 'vitest';
import { cellToText, escapeMdCell, isNumericColumn, buildMarkdownTable, resultRowsToMarkdown } from '../src/utils/markdownTable';

describe('cellToText', () => {
  it('null и undefined → null; числа и строки как есть; объекты → JSON', () => {
    expect(cellToText(null)).toBe('null');
    expect(cellToText(undefined)).toBe('null');
    expect(cellToText(5)).toBe('5');
    expect(cellToText(10n)).toBe('10');
    expect(cellToText('a')).toBe('a');
    expect(cellToText({ a: 1 })).toBe('{"a":1}');
    expect(cellToText([1, 2])).toBe('[1,2]');
  });
});

describe('escapeMdCell', () => {
  it('экранирует | и заменяет переводы строк на <br>', () => {
    expect(escapeMdCell('a|b')).toBe('a\\|b');
    expect(escapeMdCell('a\nb\r\nc\rd')).toBe('a<br>b<br>c<br>d');
  });
});

describe('isNumericColumn', () => {
  it('числа и bigint с пропусками — да; строки или только null — нет', () => {
    expect(isNumericColumn([1, null, 2n])).toBe(true);
    expect(isNumericColumn([1, '2'])).toBe(false);
    expect(isNumericColumn([null, undefined])).toBe(false);
    expect(isNumericColumn([])).toBe(false);
  });
});

describe('buildMarkdownTable', () => {
  it('заголовок, разделитель с выравниванием и строки', () => {
    expect(buildMarkdownTable(['a', 'b'], [['x', '1'], ['y', '2']], [false, true]))
      .toBe('| a | b |\n| --- | ---: |\n| x | 1 |\n| y | 2 |');
  });
  it('экранирует и заголовки, и значения; короткие строки дополняет пустыми', () => {
    expect(buildMarkdownTable(['a|b', 'c'], [['x|y']])).toBe('| a\\|b | c |\n| --- | --- |\n| x\\|y |  |');
  });
  it('нет столбцов → пустая строка', () => {
    expect(buildMarkdownTable([], [])).toBe('');
  });
});

describe('resultRowsToMarkdown', () => {
  const rows = [
    { login: 'a', count: 2, note: null },
    { login: 'b|c', count: 10n, note: 'x\ny' },
  ];
  it('обычный вид: без номера строки, числовые столбцы вправо', () => {
    expect(resultRowsToMarkdown(rows)).toBe(
      '| login | count | note |\n| --- | ---: | --- |\n| a | 2 | null |\n| b\\|c | 10 | x<br>y |'
    );
  });
  it('транспонированный вид: поле + столбец на строку, нумерация с firstRowNumber', () => {
    expect(resultRowsToMarkdown(rows, { transposed: true, firstRowNumber: 101, fieldLabel: 'Поле' })).toBe(
      '| Поле | #101 | #102 |\n| --- | --- | --- |\n| login | a | b\\|c |\n| count | 2 | 10 |\n| note | null | x<br>y |'
    );
  });
  it('пустой результат → пустая строка', () => {
    expect(resultRowsToMarkdown([])).toBe('');
    expect(resultRowsToMarkdown([{}])).toBe('');
  });

  // порядок столбцов из отдельного списка columns (числовые имена, уникализированные дубли)
  it('columns задают порядок столбцов: числовые имена не переставляются по возрастанию', () => {
    const numeric = [{ '1': 'y', '2': 'x', b: 'z' }];
    expect(resultRowsToMarkdown(numeric)).toBe('| 1 | 2 | b |\n| --- | --- | --- |\n| y | x | z |');
    expect(resultRowsToMarkdown(numeric, { columns: ['2', '1', 'b'] })).toBe('| 2 | 1 | b |\n| --- | --- | --- |\n| x | y | z |');
    expect(resultRowsToMarkdown(numeric, { columns: ['2', '1', 'b'], transposed: true, fieldLabel: 'F' })).toBe(
      '| F | #1 |\n| --- | --- |\n| 2 | x |\n| 1 | y |\n| b | z |'
    );
  });
  it('столбцы с уникализированными именами выводятся отдельными столбцами', () => {
    expect(resultRowsToMarkdown([{ a: 1, a_2: 2 }], { columns: ['a', 'a_2'] })).toBe('| a | a_2 |\n| ---: | ---: |\n| 1 | 2 |');
  });
  it('columns от другого результата игнорируются', () => {
    expect(resultRowsToMarkdown([{ a: 1 }], { columns: ['x'] })).toBe('| a |\n| ---: |\n| 1 |');
  });
});
