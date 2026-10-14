// Утилиты редактора SQL, не зависящие от DOM и CodeMirror.

export const processEscapeSequences = (str: string): string => {
  return str
    .replace(/\\\\/g, '\0ESC_BS\0')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\0ESC_BS\0/g, '\\');
};

const OPEN_BRACKETS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSE_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

export const findMatchingBrackets = (sql: string, cursorPos: number): [number, number] | null => {
  if (!sql || cursorPos < 0 || cursorPos > sql.length) return null;

  let targetIdx = -1;
  if (cursorPos > 0 && (OPEN_BRACKETS[sql[cursorPos - 1]] || CLOSE_BRACKETS[sql[cursorPos - 1]])) {
    targetIdx = cursorPos - 1;
  } else if (cursorPos < sql.length && (OPEN_BRACKETS[sql[cursorPos]] || CLOSE_BRACKETS[sql[cursorPos]])) {
    targetIdx = cursorPos;
  } else {
    return null;
  }

  const char = sql[targetIdx];
  if (OPEN_BRACKETS[char]) {
    const closeChar = OPEN_BRACKETS[char];
    let depth = 1;
    for (let i = targetIdx + 1; i < sql.length; i++) {
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

/** Смена регистра выделения или слова под курсором (Ctrl+Shift+U / L). */
export const computeChangeCase = (text: string, start: number, end: number, target: 'upper' | 'lower'): TextEdit | null => {
  const conv = (s: string) => (target === 'upper' ? s.toUpperCase() : s.toLowerCase());
  if (start !== end) {
    const converted = conv(text.slice(start, end));
    return { from: start, to: end, insert: converted, selStart: start, selEnd: start + converted.length };
  }
  let wordStart = start;
  let wordEnd = start;
  while (wordStart > 0 && /[\w$]/.test(text[wordStart - 1])) wordStart--;
  while (wordEnd < text.length && /[\w$]/.test(text[wordEnd])) wordEnd++;
  if (wordStart >= wordEnd) return null;
  const converted = conv(text.slice(wordStart, wordEnd));
  return { from: wordStart, to: wordEnd, insert: converted, selStart: start, selEnd: start };
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
  const source = useRegex ? processEscapeSequences(query) : escapeRegExp(query);
  return new RegExp(source, (global ? 'g' : '') + (matchCase ? '' : 'i'));
};

/** Все совпадения запроса в тексте (пустой список при ошибке regex / пустом запросе). */
export const findAllMatches = (text: string, query: string, matchCase: boolean, useRegex: boolean): TextMatch[] => {
  const result: TextMatch[] = [];
  if (!query) return result;
  if (useRegex) {
    try {
      const reg = buildSearchRegex(query, matchCase, true, true);
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
  }
  const q = matchCase ? query : query.toLowerCase();
  const src = matchCase ? text : text.toLowerCase();
  let pos = 0;
  while ((pos = src.indexOf(q, pos)) !== -1) {
    result.push({ start: pos, length: query.length });
    pos += Math.max(1, q.length);
  }
  return result;
};

/** Текст замены для одного совпадения (в regex-режиме поддерживаются $1 и \n, \t). */
export const computeReplacementText = (matched: string, query: string, replaceQuery: string, matchCase: boolean, useRegex: boolean): string => {
  if (!useRegex) return replaceQuery;
  const effectiveReplace = processEscapeSequences(replaceQuery);
  try {
    const reg = new RegExp(processEscapeSequences(query), matchCase ? '' : 'i');
    return matched.replace(reg, effectiveReplace);
  } catch {
    return effectiveReplace;
  }
};

/** Замена всех совпадений в строке. Бросает исключение при некорректном regex. */
export const replaceAllInText = (text: string, query: string, replaceQuery: string, matchCase: boolean, useRegex: boolean): string => {
  const effectiveReplace = useRegex ? processEscapeSequences(replaceQuery) : replaceQuery;
  const reg = buildSearchRegex(query, matchCase, useRegex, true);
  return text.replace(reg, effectiveReplace);
};
