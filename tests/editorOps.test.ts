import { describe, it, expect } from 'vitest';
import {
  computeMoveLines,
  computeChangeCase,
  computePasteLines,
  computeIndent,
  computeWrapSelection,
  diffReplace,
  findAllMatches,
  computeReplacementText,
  replaceAllInText,
  findMatchingBrackets,
  processEscapeSequences,
  type TextEdit,
} from '../src/editor/editorOps';
import { classifyWord } from '../src/editor/sqlLanguage';

/** Применяет правку к тексту и возвращает новый текст + выделение. */
const apply = (text: string, e: TextEdit) => ({
  text: text.slice(0, e.from) + e.insert + text.slice(e.to),
  sel: [e.selStart, e.selEnd] as [number, number],
});

describe('computeMoveLines', () => {
  const text = 'aaa\nbbb\nccc';
  it('двигает строку вверх и сдвигает выделение', () => {
    const r = apply(text, computeMoveLines(text, 5, 5, 'up')!); // курсор в bbb
    expect(r.text).toBe('bbb\naaa\nccc');
    expect(r.sel).toEqual([1, 1]);
  });
  it('двигает строку вниз', () => {
    const r = apply(text, computeMoveLines(text, 1, 1, 'down')!); // курсор в aaa
    expect(r.text).toBe('bbb\naaa\nccc');
    expect(r.sel).toEqual([5, 5]);
  });
  it('не двигает за границы', () => {
    expect(computeMoveLines(text, 0, 0, 'up')).toBeNull();
    expect(computeMoveLines(text, 9, 9, 'down')).toBeNull();
  });
  it('двигает блок из нескольких строк', () => {
    const t = 'a\nb\nc\nd';
    const r = apply(t, computeMoveLines(t, 2, 5, 'down')!); // выделены b и c
    expect(r.text).toBe('a\nd\nb\nc');
  });
  it('корректно поднимает строку под пустой первой строкой', () => {
    const t = '\nbbb';
    const r = apply(t, computeMoveLines(t, 1, 1, 'up')!);
    expect(r.text).toBe('bbb\n');
  });
});

describe('computeChangeCase', () => {
  it('меняет регистр выделения и выделяет результат', () => {
    const r = apply('select 1', computeChangeCase('select 1', 0, 6, 'upper')!);
    expect(r.text).toBe('SELECT 1');
    expect(r.sel).toEqual([0, 6]);
  });
  it('меняет регистр слова под курсором, курсор остаётся', () => {
    const r = apply('select col', computeChangeCase('select col', 8, 8, 'upper')!);
    expect(r.text).toBe('select COL');
    expect(r.sel).toEqual([8, 8]);
  });
  it('ничего не делает вне слова', () => {
    expect(computeChangeCase('a  b', 2, 2, 'upper')).toBeNull();
  });
});

describe('computePasteLines', () => {
  it('добавляет текст в конец каждой выбранной строки', () => {
    const t = 'a\nb\nc';
    const r = apply(t, computePasteLines(t, 0, 3, ',', true)!);
    expect(r.text).toBe('a,\nb,\nc');
  });
  it('добавляет текст в начало строк', () => {
    const t = 'a\nb';
    const r = apply(t, computePasteLines(t, 0, 3, '-- ', false)!);
    expect(r.text).toBe('-- a\n-- b');
  });
  it('пустой буфер — ничего', () => {
    expect(computePasteLines('a', 0, 0, '', true)).toBeNull();
  });
});

describe('computeIndent', () => {
  it('Tab без выделения вставляет два пробела', () => {
    const r = apply('ab', computeIndent('ab', 1, 1, false)!);
    expect(r.text).toBe('a  b');
    expect(r.sel).toEqual([3, 3]);
  });
  it('Shift+Tab убирает отступ в начале строки', () => {
    const r = apply('  ab', computeIndent('  ab', 3, 3, true)!);
    expect(r.text).toBe('ab');
    expect(r.sel).toEqual([1, 1]);
  });
  it('Tab с выделением сдвигает все строки', () => {
    const t = 'a\nb';
    const r = apply(t, computeIndent(t, 0, 3, false)!);
    expect(r.text).toBe('  a\n  b');
  });
  it('Shift+Tab с выделением снимает отступ', () => {
    const t = '  a\n b';
    const r = apply(t, computeIndent(t, 0, 6, true)!);
    expect(r.text).toBe('a\nb');
  });
  it('Shift+Tab без отступа — ничего', () => {
    expect(computeIndent('ab', 1, 1, true)).toBeNull();
  });
});

describe('computeWrapSelection', () => {
  it('оборачивает выделение в скобки и сохраняет выделение внутри', () => {
    const r = apply('x abc y', computeWrapSelection('x abc y', 2, 5, '(')!);
    expect(r.text).toBe('x (abc) y');
    expect(r.sel).toEqual([3, 6]);
  });
  it('игнорирует обычные символы и пустое выделение', () => {
    expect(computeWrapSelection('abc', 0, 2, 'a')).toBeNull();
    expect(computeWrapSelection('abc', 1, 1, '(')).toBeNull();
  });
});

describe('diffReplace', () => {
  it('возвращает минимальную правку', () => {
    expect(diffReplace('hello world', 'hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' });
    expect(diffReplace('abc', 'abc')).toBeNull();
    expect(diffReplace('abc', '')).toEqual({ from: 0, to: 3, insert: '' });
  });
  it('результат применения равен новому тексту', () => {
    const a = 'SELECT a FROM t WHERE x = 1';
    const b = 'SELECT a, b FROM t WHERE x = 2';
    const d = diffReplace(a, b)!;
    expect(a.slice(0, d.from) + d.insert + a.slice(d.to)).toBe(b);
  });
});

describe('поиск и замена', () => {
  it('ищет без учёта регистра по умолчанию', () => {
    expect(findAllMatches('Foo foo FOO', 'foo', false, false).length).toBe(3);
    expect(findAllMatches('Foo foo FOO', 'foo', true, false).length).toBe(1);
  });
  it('поддерживает regex и \\n', () => {
    expect(findAllMatches('a1 b22', '\\d+', false, true).map(m => m.length)).toEqual([1, 2]);
    expect(findAllMatches('a\nb', '\\n', false, true).length).toBe(1);
  });
  it('некорректный regex даёт пустой результат', () => {
    expect(findAllMatches('abc', '(', false, true)).toEqual([]);
  });
  it('replaceAllInText экранирует спецсимволы в обычном режиме', () => {
    expect(replaceAllInText('a.b.c', '.', '-', false, false)).toBe('a-b-c');
  });
  it('replaceAllInText в regex-режиме поддерживает группы', () => {
    expect(replaceAllInText('a1 b2', '([a-z])(\\d)', '$2$1', false, true)).toBe('1a 2b');
  });
  it('computeReplacementText для одного совпадения', () => {
    expect(computeReplacementText('a1', '([a-z])(\\d)', '$2$1', false, true)).toBe('1a');
    expect(computeReplacementText('a1', 'a', 'X', false, false)).toBe('X');
  });
  it('processEscapeSequences', () => {
    expect(processEscapeSequences('a\\nb\\\\n')).toBe('a\nb\\n');
  });
});

describe('findMatchingBrackets', () => {
  it('находит пару скобок рядом с курсором', () => {
    expect(findMatchingBrackets('f(a(b))', 2)).toEqual([1, 6]);
    expect(findMatchingBrackets('f(a(b))', 7)).toEqual([1, 6]);
    expect(findMatchingBrackets('abc', 1)).toBeNull();
  });
});

describe('classifyWord', () => {
  it('классифицирует слова как в прежней подсветке', () => {
    expect(classifyWord('select')).toBe('keyword');
    expect(classifyWord('COUNT')).toBe('fn');
    expect(classifyWord('Float64')).toBe('fn');
    expect(classifyWord('ENGINE')).toBe('engine');
    expect(classifyWord('my_col')).toBeNull();
  });
});
