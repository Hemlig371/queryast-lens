import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { StringStream } from '@codemirror/language';
import { Tag } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

// Токенизатор SQL для CodeMirror 6. Словари и правила повторяют прежнюю regex-подсветку
// (utils/sqlHighlight.ts), но работают инкрементально: многострочные комментарии и строки
// корректно переносятся между строками, без хаков с «чанками» и отключением подсветки на больших файлах.

export const lensTags = {
  comment: Tag.define(),
  string: Tag.define(),
  ident: Tag.define(),
  number: Tag.define(),
  engine: Tag.define(),
  fn: Tag.define(),
  keyword: Tag.define(),
};

const ENGINE_WORDS = new Set(['ENGINE', 'SETTINGS', 'DEFAULT']);

const FN_WORDS = new Set((
  'COUNT SUM AVG MIN MAX ROUND COALESCE NOW CONCAT DATE_TRUNC DATE INT INTEGER DOUBLE VARCHAR TEXT DECIMAL TIME TIMESTAMP ' +
  'BOOLEAN BLOB INTERVAL UUID FLOAT64 FLOAT32 FLOAT16 FLOAT8 INT64 INT32 INT16 INT8 UINT64 UINT32 UINT16 UINT8 STRING ' +
  'LOWER UPPER CAST ROW_NUMBER DENSE_RANK RANK LEAD LAG FIRST_VALUE LAST_VALUE LISTAGG TO_CHAR TO_DATE NVL DECODE ' +
  'UNIQEXACT UNIQCOMBINED ARGMAX ARGMIN TOSTARTOFHOUR TOSTARTOFDAY QUANTILESEXACT DICTGET READ_CSV_AUTO READ_PARQUET ' +
  'READ_CSV LIST_TRANSFORM FILTER JSON_EXTRACT ARRAY_JOIN ARRAYMAP ARRAYFILTER'
).split(' '));

const KEYWORD_WORDS = new Set((
  'SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER HAVING LIMIT OFFSET UNION ALL INSERT INTO ' +
  'UPDATE SET DELETE CREATE TABLE AS WITH RECURSIVE AND OR NOT IN IS NULL LIKE ILIKE BETWEEN EXISTS CASE WHEN THEN ELSE ' +
  'END ASC DESC OVER PARTITION WINDOW DISTINCT VALUES QUALIFY PIVOT UNPIVOT COLUMNS EXCLUDE REPLACE ATTACH COPY MERGE ' +
  'MATCHED USING RETURNING LATERAL CONNECT PRIOR START FINAL UPSERT CONFLICT DO BEGIN TRANSACTION COMMIT ROLLBACK ABORT'
).split(' '));

/** Классификация слова: engine > function/type > keyword (порядок как в прежней regex). */
export const classifyWord = (word: string): 'engine' | 'fn' | 'keyword' | null => {
  const up = word.toUpperCase();
  if (ENGINE_WORDS.has(up)) return 'engine';
  if (FN_WORDS.has(up)) return 'fn';
  if (KEYWORD_WORDS.has(up)) return 'keyword';
  return null;
};

/** Переменные и секреты: {{$name}}, {{$name=значение}}, {{$имя с пробелами=значение}}, {{SECRET_NAME}}.
 *  Значение — цепочка взаимоисключающих односимвольных альтернатив: нет вложенных квантификаторов,
 *  поэтому незакрытая «{{$q=...» не вызывает экспоненциального отката (раньше висло на ~30+ символах). */
export const VARIABLE_PATTERN =
  "\\{\\{\\$[a-zA-Z0-9_\\u0400-\\u04FF]+(?: [a-zA-Z0-9_\\u0400-\\u04FF]+)*(?:=(?:[^}\\n]|\\}(?!\\}))*)?\\}\\}|\\{\\{[a-zA-Z0-9_]+\\}\\}";
const VARIABLE_AT_START = new RegExp('^(?:' + VARIABLE_PATTERN + ')');

interface SqlState {
  inBlock: boolean;
  inDollar: boolean;
  /** Внутри многострочного `$$ … $$`: зелёная подсветка строки отключена, текст подсвечивается как обычный SQL. */
  inDollarBody: boolean;
  quote: "'" | '"' | '`' | null;
}

/** Внутри тела многострочного `$$ … $$` первая же пара `$$` закрывает его — и внутри комментария, и внутри кавычек. */
const atBodyEnd = (stream: StringStream, state: SqlState): boolean => state.inDollarBody && Boolean(stream.match('$$', false));

const readBlockComment = (stream: StringStream, state: SqlState): string => {
  while (!stream.eol()) {
    if (atBodyEnd(stream, state)) {
      state.inBlock = false;
      break;
    }
    if (stream.match('*/')) {
      state.inBlock = false;
      break;
    }
    stream.next();
  }
  return 'lensComment';
};

/** Однострочная строка в долларовых кавычках: $$ … $$ (закрывающая пара на той же строке). */
const readDollarString = (stream: StringStream, state: SqlState): string => {
  while (!stream.eol()) {
    if (stream.match('$$')) {
      state.inDollar = false;
      break;
    }
    stream.next();
  }
  return 'lensString';
};

const readQuoted = (stream: StringStream, state: SqlState): string => {
  const q = state.quote as string;
  while (!stream.eol()) {
    if (atBodyEnd(stream, state)) {
      state.quote = null;
      break;
    }
    const ch = stream.next();
    // ClickHouse/MySQL: \' и \\ внутри одинарных кавычек; обратная косая перед другим символом — обычный символ
    if (ch === '\\' && q === "'" && (stream.peek() === "'" || stream.peek() === '\\')) {
      stream.next();
      continue;
    }
    if (ch === q) {
      if (stream.peek() === q) {
        stream.next(); // удвоенная кавычка = экранирование
        continue;
      }
      state.quote = null;
      break;
    }
  }
  return q === "'" ? 'lensString' : 'lensIdent';
};

const sqlParser = {
  name: 'sql-lens',
  startState: (): SqlState => ({ inBlock: false, inDollar: false, inDollarBody: false, quote: null }),
  copyState: (s: SqlState): SqlState => ({ inBlock: s.inBlock, inDollar: s.inDollar, inDollarBody: s.inDollarBody, quote: s.quote }),
  token(stream: StringStream, state: SqlState): string | null {
    if (state.inDollarBody && stream.match('$$')) {
      state.inDollarBody = false; // закрытие многострочного $$ … $$: границы без цвета строки
      state.inBlock = false;
      state.quote = null;
      return null;
    }
    if (state.inBlock) return readBlockComment(stream, state);
    if (state.inDollar) return readDollarString(stream, state);
    if (state.quote) return readQuoted(stream, state);

    if (stream.eatSpace()) return null;

    if (stream.match('--')) {
      if (state.inDollarBody) {
        while (!stream.eol() && !stream.match('$$', false)) stream.next();
      } else {
        stream.skipToEnd();
      }
      return 'lensComment';
    }
    if (stream.match('/*')) {
      state.inBlock = true;
      return readBlockComment(stream, state);
    }

    if (stream.match('$$')) {
      if (stream.string.indexOf('$$', stream.pos) >= 0) {
        // закрывающая пара на этой же строке: однострочный литерал, строка как раньше
        state.inDollar = true;
        return readDollarString(stream, state);
      }
      // закрытие на следующих строках (или нет вовсе): многострочный литерал подсвечивается как обычный SQL
      state.inDollarBody = true;
      return null;
    }

    const ch = stream.peek();
    if (ch === "'" || ch === '"' || ch === '`') {
      stream.next();
      state.quote = ch as SqlState['quote'];
      return readQuoted(stream, state);
    }

    if (ch === '{' && stream.match(VARIABLE_AT_START)) {
      return null; // цвет переменной задаёт декоратор variableDecorations
    }

    // Числа: 0xFF, 42, 3.14, 1e5, 2.5E-3, .5 (слово, начинающееся с цифры, числом не считается)
    if (stream.match(/^0[xX][0-9a-fA-F]+\b/) || stream.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b/)) return 'lensNumber';

    if (stream.match(/^\w+/)) {
      const kind = classifyWord(stream.current());
      if (kind === 'engine') return 'lensEngine';
      if (kind === 'fn') return 'lensFn';
      if (kind === 'keyword') return 'lensKeyword';
      return null;
    }

    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: '--', block: { open: '/*', close: '*/' } },
  },
  tokenTable: {
    lensComment: lensTags.comment,
    lensString: lensTags.string,
    lensIdent: lensTags.ident,
    lensNumber: lensTags.number,
    lensEngine: lensTags.engine,
    lensFn: lensTags.fn,
    lensKeyword: lensTags.keyword,
  },
};

export const sqlLanguage = StreamLanguage.define<SqlState>(sqlParser);

/** Цвета — те же Tailwind-оттенки, что использовались в HTML-подсветке. */
export const SQL_COLORS = {
  dark: {
    keyword: '#60a5fa', // blue-400
    fn: '#c084fc', // purple-400
    string: '#34d399', // emerald-400
    ident: '#14b8a6', // teal-500
    number: '#fdba74', // orange-300
    engine: '#fcd34d', // amber-300
    comment: '#64748b', // slate-500
    varParam: '#f87171', // red-400
    varSecret: '#c084fc', // purple-400
  },
  light: {
    keyword: '#1d4ed8', // blue-700
    fn: '#7e22ce', // purple-700
    string: '#047857', // emerald-700
    ident: '#115e59', // teal-800
    number: '#f97316', // orange-500
    engine: '#f59e0b', // amber-500
    comment: '#64748b',
    varParam: '#b91c1c', // red-700
    varSecret: '#7e22ce', // purple-700
  },
} as const;

export const sqlHighlighting = (theme: 'dark' | 'light'): Extension => {
  const c = SQL_COLORS[theme];
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: lensTags.keyword, color: c.keyword },
      { tag: lensTags.fn, color: c.fn },
      { tag: lensTags.string, color: c.string },
      { tag: lensTags.ident, color: c.ident },
      { tag: lensTags.number, color: c.number },
      { tag: lensTags.engine, color: c.engine },
      { tag: lensTags.comment, color: c.comment },
    ])
  );
};