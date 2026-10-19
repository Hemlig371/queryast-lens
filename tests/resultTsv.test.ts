import { describe, it, expect } from 'vitest';
import { resultRowsToTsv } from '../src/utils/resultTsv';

// Копирование результата как TSV для Excel (кнопка «Копировать»). Формат не менялся (B-16 оставлен): null → `null`, без кавычек.
// Первая группа — как было до п. 3.2 (имена столбцов из ключей первой строки); вторая — с явным списком columns.

const opts = { firstRowNumber: 1, fieldLabel: 'Field' };

describe('resultRowsToTsv: прежнее поведение', () => {
  const rows = [{ a: 1, b: null, c: 'x y' }, { a: 2, b: 'q', c: true }];

  it('обычный вид: # и столбцы, номера строк с firstRowNumber', () => {
    expect(resultRowsToTsv(rows, { ...opts, firstRowNumber: 11 })).toBe('#\ta\tb\tc\n11\t1\tnull\tx y\n12\t2\tq\ttrue');
  });

  it('транспонированный вид: строка на поле, столбец на строку результата', () => {
    expect(resultRowsToTsv(rows, { ...opts, transposed: true, firstRowNumber: 5 })).toBe('Field\t#5\t#6\na\t1\t2\nb\tnull\tq\nc\tx y\ttrue');
  });

  it('значения приводятся через String (вложенное — без JSON, как раньше)', () => {
    expect(resultRowsToTsv([{ a: [1, 2], b: 10n }], opts)).toBe('#\ta\tb\n1\t1,2\t10');
  });

  it('нет строк — пустая строка', () => {
    expect(resultRowsToTsv([], opts)).toBe('');
  });
});

describe('resultRowsToTsv: порядок из columns (п. 3.2)', () => {
  const rows = [{ '1': 'y', '2': 'x', b: 'z' }];

  it('числовые имена идут в порядке выдачи, а не по возрастанию ключей', () => {
    expect(resultRowsToTsv(rows, { ...opts, columns: ['2', '1', 'b'] })).toBe('#\t2\t1\tb\n1\tx\ty\tz');
    expect(resultRowsToTsv(rows, { ...opts, columns: ['2', '1', 'b'], transposed: true })).toBe('Field\t#1\n2\tx\n1\ty\nb\tz');
  });

  it('уникализированные дубли выводятся двумя столбцами', () => {
    expect(resultRowsToTsv([{ a: 1, a_2: 2 }], { ...opts, columns: ['a', 'a_2'] })).toBe('#\ta\ta_2\n1\t1\t2');
  });

  it('columns от другого результата игнорируются, берутся ключи строки', () => {
    expect(resultRowsToTsv([{ a: 1 }], { ...opts, columns: ['x', 'y'] })).toBe('#\ta\n1\t1');
  });
});
