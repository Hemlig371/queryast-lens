// Утилиты редактора SQL, не зависящие от DOM и CodeMirror.

export const processEscapeSequences = (str: string): string => {
  return str
    .replace(/\\\\/g, '\0ESC_BS\0')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\0ESC_BS\0/g, '\\');
};

/** Символ слова: буква (в том числе кириллица), цифра, `_` или `$`. */
export const isWordChar = (ch: string): boolean => /^[\p{L}\p{N}\p{M}_$]$/u.test(ch);

/** Класс символов слова для регулярных выражений с флагом `u` (см. `isWordChar`). */
const WORD_CHAR_CLASS = '[\\p{L}\\p{N}\\p{M}_$]';

/** Регулярное выражение вхождений выделенного текста: слово ищется целиком (с Unicode-границами), остальное — как подстрока. */
export const wordOccurrenceRegExp = (raw: string): RegExp => {
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isWord = raw.length > 0 && Array.from(raw).every(isWordChar);
  const pattern = isWord ? `(?<!${WORD_CHAR_CLASS})${escaped}(?!${WORD_CHAR_CLASS})` : escaped;
  return new RegExp(pattern, 'giu');
};

/** Слово перед курсором для автокомплита (имя может содержать точки; начинается с буквы или `_`). */
export const AUTOCOMPLETE_WORD_RE = /([\p{L}_][\p{L}\p{N}_.]*)$/u;

const OPEN_BRACKETS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSE_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** Маска «внутри строки или комментария» (1 — символ пропускается при поиске скобок). Правила те же, что у подсветки (sqlLanguage). */
const buildSkipMask = (sql: string): Uint8Array => {
  const mask = new Uint8Array(sql.length);
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      let j = sql.indexOf('\n', i);
      if (j === -1) j = n;
      mask.fill(1, i, j);
      i = j;
    } else if (c === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2);
      const j = close === -1 ? n : close + 2;
      mask.fill(1, i, j);
      i = j;
    } else if (c === '$' && sql[i + 1] === '$') {
      const close = sql.indexOf('$$', i + 2);
      const j = close === -1 ? n : close + 2;
      mask.fill(1, i, j);
      i = j;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (c === "'" && sql[j] === '\\' && (sql[j + 1] === "'" || sql[j + 1] === '\\')) { j += 2; continue; }
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; } // удвоенная кавычка = экранирование
          j++;
          break;
        }
        j++;
      }
      mask.fill(1, i, Math.min(j, n));
      i = j;
    } else {
      i++;
    }
  }
  return mask;
};

export const findMatchingBrackets = (sql: string, cursorPos: number): [number, number] | null => {
  if (!sql || cursorPos < 0 || cursorPos > sql.length) return null;

  const mask = buildSkipMask(sql);
  const isBracketAt = (idx: number) => !mask[idx] && !!(OPEN_BRACKETS[sql[idx]] || CLOSE_BRACKETS[sql[idx]]);

  let targetIdx = -1;
  if (cursorPos > 0 && isBracketAt(cursorPos - 1)) {
    targetIdx = cursorPos - 1;
  } else if (cursorPos < sql.length && isBracketAt(cursorPos)) {
    targetIdx = cursorPos;
  } else {
    return null;
  }

  const char = sql[targetIdx];
  if (OPEN_BRACKETS[char]) {
    const closeChar = OPEN_BRACKETS[char];
    let depth = 1;
    for (let i = targetIdx + 1; i < sql.length; i++) {
      if (mask[i]) continue;
      const c = sql[i];
      if (c === char) depth++;
      else if (c === closeChar) {
        depth--;
        if (depth === 0) return [targetIdx, i];
      }
    }
  } else if (CLOSE_BRACKETS[char]) {
    const openChar = CLOSE_BRACKETS[char];
    let depth = 1;
    for (let i = targetIdx - 1; i >= 0; i--) {
      if (mask[i]) continue;
      const c = sql[i];
      if (c === char) depth++;
      else if (c === openChar) {
        depth--;
        if (depth === 0) return [i, targetIdx];
      }
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Чистые операции над текстом редактора. Не зависят от CodeMirror и DOM,
// поэтому покрываются юнит-тестами (tests/editorOps.test.ts).
// Редактор применяет результат одной транзакцией => один шаг в undo-истории.
// ---------------------------------------------------------------------------

export interface TextEdit {
  /** Заменяемый диапазон [from, to) в исходном тексте. */
  from: number;
  to: number;
  insert: string;
  /** Выделение ПОСЛЕ применения правки (в координатах нового текста). */
  selStart: number;
  selEnd: number;
}

/** Начало строки, в которой находится позиция pos. */
export const lineStartOf = (text: string, pos: number): number =>
  pos <= 0 ? 0 : text.lastIndexOf('\n', pos - 1) + 1;

/** Диапазон строк, покрываемых выделением [start, end]. Выделение, заканчивающееся сразу после \n, не захватывает следующую строку. */
export const selectedLinesRange = (text: string, start: number, end: number): { lineStart: number; lineEnd: number; effectiveEnd: number } => {
  const lineStart = lineStartOf(text, start);
  const effectiveEnd = end > start && text[end - 1] === '\n' ? end - 1 : end;
  let lineEnd = text.indexOf('\n', effectiveEnd);
  if (lineEnd === -1) lineEnd = text.length;
  return { lineStart, lineEnd, effectiveEnd };
};

/** Перемещение выбранных строк вверх/вниз (Alt+Up / Alt+Down). */
export const computeMoveLines = (text: string, start: number, end: number, dir: 'up' | 'down'): TextEdit | null => {
  const { lineStart, lineEnd } = selectedLinesRange(text, start, end);
  const block = text.slice(lineStart, lineEnd);

  if (dir === 'up') {
    if (lineStart === 0) return null;
    const prevStart = lineStartOf(text, lineStart - 1);
    const prevLine = text.slice(prevStart, lineStart - 1);
    const shift = prevLine.length + 1;
    return {
      from: prevStart,
      to: lineEnd,
      insert: block + '\n' + prevLine,
      selStart: start - shift,
      selEnd: end - shift,
    };
  }

  if (lineEnd >= text.length) return null;
  const nextStart = lineEnd + 1;
  let nextEnd = text.indexOf('\n', nextStart);
  if (nextEnd === -1) nextEnd = text.length;
  const nextLine = text.slice(nextStart, nextEnd);
  const shift = nextLine.length + 1;
  return {
    from: lineStart,
    to: nextEnd,
    insert: nextLine + '\n' + block,
    selStart: start + shift,
    selEnd: end + shift,
  };
};

/** Смена регистра выделения или слова под курсором (Alt+Shift+U / Ctrl+Shift+L). */
export const computeChangeCase = (text: string, start: number, end: number, target: 'upper' | 'lower'): TextEdit | null => {
  const conv = (s: string) => (target === 'upper' ? s.toUpperCase() : s.toLowerCase());
  if (start !== end) {
    const converted = conv(text.slice(start, end));
    return { from: start, to: end, insert: converted, selStart: start, selEnd: start + converted.length };
  }
  let wordStart = start;
  let wordEnd = start;
  while (wordStart > 0 && isWordChar(text[wordStart - 1])) wordStart--;
  while (wordEnd < text.length && isWordChar(text[wordEnd])) wordEnd++;
  if (wordStart >= wordEnd) return null;
  const converted = conv(text.slice(wordStart, wordEnd));
  return { from: wordStart, to: wordEnd, insert: converted, selStart: start, selEnd: start };
};

/**
 * Комментирование (пункт меню редактора; то же, что делает сочетание «Комментирование выделения»):
 * - без выделения — переключает `-- ` в начале строки с курсором;
 * - с выделением — оборачивает его в блочный комментарий или снимает обёртку, если выделение уже целиком в блочном комментарии.
 */
export const computeToggleComment = (text: string, start: number, end: number): TextEdit => {
  if (start === end) {
    const lineStart = lineStartOf(text, start);
    let lineEnd = text.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = text.length;
    const lineText = text.slice(lineStart, lineEnd);
    let insert: string;
    let diff: number;
    if (lineText.startsWith('-- ')) { insert = lineText.slice(3); diff = -3; }
    else if (lineText.startsWith('--')) { insert = lineText.slice(2); diff = -2; }
    else { insert = '-- ' + lineText; diff = 3; }
    const pos = Math.max(lineStart, start + (start > lineStart ? diff : 0));
    return { from: lineStart, to: lineEnd, insert, selStart: pos, selEnd: pos };
  }
  const selected = text.slice(start, end);
  const trimmed = selected.trim();
  let insert: string;
  if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
    const firstIdx = selected.indexOf('/*');
    const lastIdx = selected.lastIndexOf('*/');
    insert = selected.slice(0, firstIdx) + selected.slice(firstIdx + 2, lastIdx) + selected.slice(lastIdx + 2);
  } else {
    insert = `/*${selected}*/`;
  }
  return { from: start, to: end, insert, selStart: start, selEnd: start + insert.length };
};

/** Вставка текста буфера в начало/конец каждой выбранной строки (Ctrl+Alt+V / Ctrl+Shift+V). */
export const computePasteLines = (text: string, start: number, end: number, clip: string, atEnd: boolean): TextEdit | null => {
  if (!clip) return null;
  const { lineStart, lineEnd } = selectedLinesRange(text, start, end);
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const newBlock = lines.map(line => (atEnd ? line + clip : clip + line)).join('\n');
  return { from: lineStart, to: lineEnd, insert: newBlock, selStart: lineStart, selEnd: lineStart + newBlock.length };
};

/** Tab / Shift+Tab: отступ в позиции курсора или у всех выбранных строк. */
export const computeIndent = (text: string, start: number, end: number, shift: boolean, tabStr: string = '  '): TextEdit | null => {
  const removeCountFor = (line: string) => (line.startsWith('  ') ? 2 : line.startsWith(' ') || line.startsWith('\t') ? 1 : 0);

  if (start === end) {
    if (!shift) {
      return { from: start, to: start, insert: tabStr, selStart: start + tabStr.length, selEnd: start + tabStr.length };
    }
    const lineStart = lineStartOf(text, start);
    const removeCount = removeCountFor(text.slice(lineStart));
    if (removeCount === 0) return null;
    const caret = Math.max(lineStart, start - removeCount);
    return { from: lineStart, to: lineStart + removeCount, insert: '', selStart: caret, selEnd: caret };
  }

  const { lineStart, lineEnd } = selectedLinesRange(text, start, end);
  const lines = text.slice(lineStart, lineEnd).split('\n');
  let startOffsetDelta = 0;
  let totalLengthDelta = 0;
  const newLines = lines.map((line, idx) => {
    if (!shift) {
      if (idx === 0) startOffsetDelta = tabStr.length;
      totalLengthDelta += tabStr.length;
      return tabStr + line;
    }
    const rem = removeCountFor(line);
    if (idx === 0) startOffsetDelta = -rem;
    totalLengthDelta -= rem;
    return line.slice(rem);
  });
  const selStart = Math.max(lineStart, start + startOffsetDelta);
  const selEnd = Math.max(selStart, end + totalLengthDelta);
  return { from: lineStart, to: lineEnd, insert: newLines.join('\n'), selStart, selEnd };
};

const QUOTE_PAIRS: Record<string, string> = { "'": "'", '"': '"', '`': '`', '(': ')', '[': ']', '{': '}' };

/** Обрамление выделения парными символами при вводе ' " ` ( [ { (только при непустом выделении). */
export const computeWrapSelection = (text: string, start: number, end: number, openChar: string): TextEdit | null => {
  const closeChar = QUOTE_PAIRS[openChar];
  if (!closeChar || start >= end) return null;
  const wrapped = openChar + text.slice(start, end) + closeChar;
  return { from: start, to: end, insert: wrapped, selStart: start + 1, selEnd: end + 1 };
};

/** Минимальная правка old -> next (общий префикс/суффикс), чтобы сохранить курсор и undo-историю. */
export const diffReplace = (oldText: string, newText: string): { from: number; to: number; insert: string } | null => {
  if (oldText === newText) return null;
  const minLen = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < minLen && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) suffix++;
  return { from: prefix, to: oldText.length - suffix, insert: newText.slice(prefix, newText.length - suffix) };
};

// --------------------------- поиск / замена ---------------------------------

export interface TextMatch { start: number; length: number }

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Регулярное выражение поиска. Бросает исключение при некорректном regex (если useRegex). */
export const buildSearchRegex = (query: string, matchCase: boolean, useRegex: boolean, global: boolean = true): RegExp => {
  // В regex-режиме запрос передаётся как есть: \n, \t, \r и \\ движок regex понимает сам
  const source = useRegex ? query : escapeRegExp(query);
  return new RegExp(source, (global ? 'g' : '') + (matchCase ? '' : 'i'));
};

/** Все совпадения запроса в тексте (пустой список при ошибке regex / пустом запросе). */
export const findAllMatches = (text: string, query: string, matchCase: boolean, useRegex: boolean): TextMatch[] => {
  const result: TextMatch[] = [];
  if (!query) return result;
  try {
    // Один путь для обычного и regex-режима: toLowerCase() менял длину строки (İ) и сдвигал позиции
    const reg = buildSearchRegex(query, matchCase, useRegex, true);
    let m: RegExpExecArray | null;
    let lastIndex = -1;
    while ((m = reg.exec(text)) !== null) {
      result.push({ start: m.index, length: m[0].length });
      if (reg.lastIndex === lastIndex) reg.lastIndex++;
      lastIndex = reg.lastIndex;
    }
  } catch {
    // некорректный regex во время набора
  }
  return result;
};

/**
 * Текст замены для одного совпадения (в regex-режиме поддерживаются $1 и \n, \t).
 * `context` — весь текст и позиция совпадения: нужен, чтобы lookbehind и якоря работали как при поиске.
 */
export const computeReplacementText = (
  matched: string,
  query: string,
  replaceQuery: string,
  matchCase: boolean,
  useRegex: boolean,
  context?: { text: string; start: number },
): string => {
  if (!useRegex) return replaceQuery;
  const effectiveReplace = processEscapeSequences(replaceQuery);
  try {
    if (context) {
      // Sticky-regex заменяет ровно одно совпадение, начинающееся в позиции start, с учётом окружающего текста
      const sticky = new RegExp(query, (matchCase ? '' : 'i') + 'y');
      sticky.lastIndex = context.start;
      const replaced = context.text.replace(sticky, effectiveReplace);
      const tail = context.text.length - (context.start + matched.length);
      if (replaced !== context.text || matched.length === 0) {
        return replaced.slice(context.start, replaced.length - tail);
      }
    }
    const reg = new RegExp(query, matchCase ? '' : 'i');
    return matched.replace(reg, effectiveReplace);
  } catch {
    return effectiveReplace;
  }
};

/** Замена всех совпадений в строке. Бросает исключение при некорректном regex. */
export const replaceAllInText = (text: string, query: string, replaceQuery: string, matchCase: boolean, useRegex: boolean): string => {
  const reg = buildSearchRegex(query, matchCase, useRegex, true);
  // Обычный режим: замена вставляется буквально ($$, $&, $1 без подстановок)
  if (!useRegex) return text.replace(reg, () => replaceQuery);
  return text.replace(reg, processEscapeSequences(replaceQuery));
};
