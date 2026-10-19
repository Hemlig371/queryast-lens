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
  isWordChar,
  wordOccurrenceRegExp,
  AUTOCOMPLETE_WORD_RE,
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
  it('ED-04: слово под курсором на кириллице меняет регистр целиком', () => {
    const text = 'select выбрать from';
    const up = apply(text, computeChangeCase(text, 10, 10, 'upper')!);
    expect(up.text).toBe('select ВЫБРАТЬ from');
    expect(up.sel).toEqual([10, 10]);
    const low = apply('SELECT ВЫБРАТЬ FROM', computeChangeCase('SELECT ВЫБРАТЬ FROM', 10, 10, 'lower')!);
    expect(low.text).toBe('SELECT выбрать FROM');
  });
  it('ED-04: имя_col и ёжик — одно слово', () => {
    expect(apply('имя_col', computeChangeCase('имя_col', 2, 2, 'upper')!).text).toBe('ИМЯ_COL');
    expect(apply('a ёжик b', computeChangeCase('a ёжик b', 3, 3, 'upper')!).text).toBe('a ЁЖИК b');
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
  it('ED-01: в regex-режиме \\\\. ищет обратный слэш и любой символ', () => {
    // текст: a\b.c ; запрос (4 символа в regex): \\.
    expect(findAllMatches('a\\b.c', '\\\\.', false, true)).toEqual([{ start: 1, length: 2 }]);
  });
  it('ED-01: \\n и \\t в regex-режиме по-прежнему означают перенос и табуляцию', () => {
    expect(findAllMatches('a\tb', '\\t', false, true)).toEqual([{ start: 1, length: 1 }]);
    expect(findAllMatches('a\nb', '\\n', false, true)).toEqual([{ start: 1, length: 1 }]);
  });
  it('ED-02: replaceAllInText без regex вставляет $$, $& и $1 буквально', () => {
    expect(replaceAllInText('a b', 'a', '$$x', false, false)).toBe('$$x b');
    expect(replaceAllInText('a b', 'a', '[$&]', false, false)).toBe('[$&] b');
    expect(replaceAllInText('a b', 'a', '$1', false, false)).toBe('$1 b');
  });
  it('ED-02: в regex-режиме $1 по-прежнему работает', () => {
    expect(replaceAllInText('a b', '(a)', '<$1>', false, true)).toBe('<a> b');
  });
  it('ED-03: Replace one в regex-режиме видит контекст (lookbehind)', () => {
    expect(computeReplacementText('b', '(?<=a)b', 'X', false, true, { text: 'ab', start: 1 })).toBe('X');
  });
  it('ED-03: Replace one в regex-режиме — группы и якоря с контекстом', () => {
    expect(computeReplacementText('1', '(?<==)(\\d)', '[$1]', false, true, { text: 'foo=1', start: 4 })).toBe('[1]');
    expect(computeReplacementText('b', '^b', 'X', false, true, { text: 'b b', start: 0 })).toBe('X');
  });
  it('ED-03: без контекста поведение прежнее', () => {
    expect(computeReplacementText('a1', '([a-z])(\\d)', '$2$1', false, true)).toBe('1a');
  });
  it('ED-05: поиск без учёта регистра не сдвигает позиции после İ', () => {
    // 'İ'.toLowerCase() занимает два символа и раньше сдвигал позиции
    expect(findAllMatches('İa a', 'a', false, false)).toEqual([{ start: 1, length: 1 }, { start: 3, length: 1 }]);
    expect(findAllMatches('İİ x', 'x', false, false)).toEqual([{ start: 3, length: 1 }]);
  });
  it('поиск без учёта регистра по-прежнему находит кириллицу и не пересекает совпадения', () => {
    expect(findAllMatches('Имя имя ИМЯ', 'имя', false, false).map(m => m.start)).toEqual([0, 4, 8]);
    expect(findAllMatches('aaaa', 'aa', false, false).map(m => m.start)).toEqual([0, 2]);
  });
});

describe('isWordChar / слова', () => {
  it('isWordChar: латиница, кириллица, _, $, цифры — да; пробел и пунктуация — нет', () => {
    for (const ch of ['a', 'Z', 'я', 'Ё', 'ё', '_', '$', '7']) expect(isWordChar(ch)).toBe(true);
    for (const ch of [' ', '\n', '.', ',', '(', "'", '-']) expect(isWordChar(ch)).toBe(false);
  });
  it('wordOccurrenceRegExp: целые слова на кириллице, не внутри других слов', () => {
    const re = wordOccurrenceRegExp('имя');
    const text = 'имя фамилия имя_клиента (имя) Имя';
    const starts = [...text.matchAll(re)].map(m => m.index);
    expect(starts).toEqual([0, 25, 30]);
  });
  it('wordOccurrenceRegExp: не-слово ищется как подстрока, спецсимволы экранируются', () => {
    const re = wordOccurrenceRegExp('a.b');
    expect([...'xa.by a.b'.matchAll(re)].map(m => m.index)).toEqual([1, 6]);
    expect([...'a-b'.matchAll(re)].length).toBe(0);
  });
  it('AUTOCOMPLETE_WORD_RE: слово перед курсором, включая кириллицу и точки', () => {
    const word = (s: string) => s.match(AUTOCOMPLETE_WORD_RE)?.[1] ?? null;
    expect(word('select sel')).toBe('sel');
    expect(word('select имя_т')).toBe('имя_т');
    expect(word('from main.таб')).toBe('main.таб');
    expect(word('select ')).toBeNull();
    expect(word('1abc')).toBe('abc');
  });
});

describe('findMatchingBrackets', () => {
  it('находит пару скобок рядом с курсором', () => {
    expect(findMatchingBrackets('f(a(b))', 2)).toEqual([1, 6]);
    expect(findMatchingBrackets('f(a(b))', 7)).toEqual([1, 6]);
    expect(findMatchingBrackets('abc', 1)).toBeNull();
  });
  it('ED-06: скобка внутри строкового литерала пропускается', () => {
    expect(findMatchingBrackets("f(')')", 2)).toEqual([1, 5]);
    expect(findMatchingBrackets("f(')')", 6)).toEqual([1, 5]);
    expect(findMatchingBrackets('f(")")', 2)).toEqual([1, 5]);
    expect(findMatchingBrackets("f('it''s )')", 2)).toEqual([1, 11]);
  });
  it('ED-06: курсор у скобки внутри строки или комментария пары не даёт', () => {
    expect(findMatchingBrackets("f(')')", 4)).toBeNull();
    expect(findMatchingBrackets('f(a -- )\n)', 7)).toBeNull();
  });
  it('ED-06: скобки в -- и /* */ комментариях не считаются', () => {
    const line = 'f(a -- )\n b)';
    expect(findMatchingBrackets(line, 2)).toEqual([1, line.length - 1]);
    const block = 'f(/* ) */ x)';
    expect(findMatchingBrackets(block, 2)).toEqual([1, block.length - 1]);
    expect(findMatchingBrackets(block, block.length)).toEqual([1, block.length - 1]);
  });
  it('ED-06: закрывающая скобка ищет открывающую, пропуская строки', () => {
    expect(findMatchingBrackets("f(a, ')', b)", 12)).toEqual([1, 11]);
  });
  it('ED-06: строка после $$ … $$ тоже пропускается', () => {
    expect(findMatchingBrackets('f($$ ) $$)', 2)).toEqual([1, 9]);
  });
  it('CM-02: документ 150 000 символов обрабатывается быстро', () => {
    const doc = '(' + ' x'.repeat(74_999) + ')';
    expect(doc.length).toBe(150_000);
    const t0 = performance.now();
    const r = findMatchingBrackets(doc, 1);
    const dt = performance.now() - t0;
    expect(r).toEqual([0, doc.length - 1]);
    expect(dt).toBeLessThan(250); // мягкий порог
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
