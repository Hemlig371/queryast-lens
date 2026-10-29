import { describe, it, expect } from 'vitest';
import { computeToggleComment } from '../src/editor/editorOps';

/** Применяет правку и возвращает итоговый текст и выделение. */
function apply(text: string, start: number, end: number) {
  const e = computeToggleComment(text, start, end);
  return { text: text.slice(0, e.from) + e.insert + text.slice(e.to), selStart: e.selStart, selEnd: e.selEnd };
}

/**
 * Прежний алгоритм сочетания «Комментирование выделения» (дословный порт блока commentBlock из App.tsx).
 * Меню редактора должно давать тот же результат.
 */
function legacy(full: string, start: number, end: number) {
  const text = full.slice(start, end);
  if (text === '') {
    const pos = start;
    const lineStart = full.lastIndexOf('\n', pos - 1) + 1;
    let lineEnd = full.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = full.length;
    const lineText = full.slice(lineStart, lineEnd);
    let newLineText = '';
    let diff = 0;
    if (lineText.startsWith('-- ')) { newLineText = lineText.slice(3); diff = -3; }
    else if (lineText.startsWith('--')) { newLineText = lineText.slice(2); diff = -2; }
    else { newLineText = '-- ' + lineText; diff = 3; }
    const newPos = Math.max(lineStart, pos + (pos > lineStart ? diff : 0));
    return { text: full.slice(0, lineStart) + newLineText + full.slice(lineEnd), selStart: newPos, selEnd: newPos };
  }
  const trimmed = text.trim();
  let newText: string;
  if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
    const firstIdx = text.indexOf('/*');
    const lastIdx = text.lastIndexOf('*/');
    newText = text.slice(0, firstIdx) + text.slice(firstIdx + 2, lastIdx) + text.slice(lastIdx + 2);
  } else {
    newText = `/*${text}*/`;
  }
  return { text: full.slice(0, start) + newText + full.slice(end), selStart: start, selEnd: start + newText.length };
}

describe('комментирование из меню редактора', () => {
  it('без выделения: «-- » добавляется и снимается в строке с курсором', () => {
    expect(apply('SELECT 1', 3, 3)).toEqual({ text: '-- SELECT 1', selStart: 6, selEnd: 6 });
    expect(apply('-- SELECT 1', 6, 6)).toEqual({ text: 'SELECT 1', selStart: 3, selEnd: 3 });
    expect(apply('--SELECT 1', 4, 4)).toEqual({ text: 'SELECT 1', selStart: 2, selEnd: 2 });
    expect(apply('a\nSELECT 1\nb', 5, 5).text).toBe('a\n-- SELECT 1\nb');
  });
  it('с выделением: обёртка в /* */ и снятие обёртки', () => {
    expect(apply('SELECT 1 FROM t', 7, 8)).toEqual({ text: 'SELECT /*1*/ FROM t', selStart: 7, selEnd: 12 });
    expect(apply('SELECT /*1*/ FROM t', 7, 12)).toEqual({ text: 'SELECT 1 FROM t', selStart: 7, selEnd: 8 });
  });
  it('результат совпадает с прежним сочетанием клавиш на наборе случаев', () => {
    const texts = ['', 'SELECT 1', '-- a', '--a\nb', 'a\n\nb', 'x /* y */ z', '/* a */', '  /* a */  ', 'a\r\nb', 'one\ntwo\nthree'];
    let checked = 0;
    for (const full of texts) {
      for (let s = 0; s <= full.length; s++) {
        for (let e = s; e <= full.length; e++) {
          // исключение: курсор в позиции 0 при тексте, начинающемся с «\n» (см. следующий тест)
          if (s === 0 && e === 0 && full.startsWith('\n')) continue;
          expect(apply(full, s, e), JSON.stringify({ full, s, e })).toEqual(legacy(full, s, e));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
  it('курсор в начале текста с пустой первой строкой: комментируется эта строка (прежний алгоритм портил текст)', () => {
    expect(apply('\nSELECT 1', 0, 0).text).toBe('-- \nSELECT 1');
    // lastIndexOf('\n', -1) находит перевод строки в позиции 0, и прежний алгоритм вставлял лишнюю строку
    expect(legacy('\nSELECT 1', 0, 0).text).toBe('\n-- \nSELECT 1');
  });
});
