// Защита строковых литералов от форматтера.
//
// sql-formatter и его последующие регулярные подстановки в `formatSqlText` работают не по токенам: они схлопывают пустые строки
// внутри многострочных литералов, добавляют отступы, превращают `//` (целочисленное деление DuckDB) в `/ /`, а `$$…$$` и
// `'…'` с `--` или `'` внутри ломают разбор комментариев. Здесь литералы заменяются короткими плейсхолдерами-строками
// `'__qsN__'`, а после форматирования возвращаются точным исходным текстом.
//
// Токены: `--` до конца строки, `/* … */`, `'…'` (удвоенная кавычка внутри; `\'` — только если включено backslashEscapes
// или перед кавычкой стоит E), `"…"` и `` `…` `` (идентификаторы, копируются как есть), `$$…$$` и `$тег$…$тег$`.

/** Позиция сразу после закрывающей границы dollar-quoted строки, начинающейся в `pos`; -1 — здесь такой строки нет или она не закрыта. */
export function dollarQuoteEnd(text: string, pos: number): number {
  if (text[pos] !== '$') return -1;
  // граница не может быть продолжением идентификатора (`a$$`, `x$tag$`) и параметром (`$1`)
  const prev = pos > 0 ? text[pos - 1] : '';
  if (prev && /[A-Za-z0-9_$\u0080-￿]/.test(prev)) return -1;
  const open = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(text.slice(pos, pos + 256));
  if (!open) return -1;
  const delimiter = open[0];
  const close = text.indexOf(delimiter, pos + delimiter.length);
  return close < 0 ? -1 : close + delimiter.length;
}

export interface ProtectOptions {
  /** Обратная косая черта экранирует кавычку внутри строки (ClickHouse). */
  backslashEscapes?: boolean;
  /** Защищать только `$$…$$` (строки в апострофах остаются на месте; нужны лишь как границы). */
  dollarOnly?: boolean;
  /** Заменять `//` (вне строк и комментариев) на идентификатор-заглушку: sql-formatter читает его как два деления. */
  protectDivision?: boolean;
}

export interface ProtectedSql {
  /** Текст, в котором защищаемые литералы заменены плейсхолдерами. */
  text: string;
  /** Возвращает исходные литералы (и `//`) на место плейсхолдеров. */
  restore: (formatted: string) => string;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Имя, которого нет в тексте (плейсхолдер не должен совпасть с чем-то, что пользователь уже написал). */
function uniqueToken(text: string, base: string): string {
  let token = base;
  while (text.includes(token)) token += 'x';
  return token;
}

/** Позиция сразу после закрывающей кавычки; -1 — строка не закрыта. */
function quotedEnd(text: string, start: number, backslash: boolean): number {
  const quote = text[start];
  let j = start + 1;
  while (j < text.length) {
    if (backslash && text[j] === '\\') { j += 2; continue; }
    if (text[j] === quote) {
      if (text[j + 1] === quote) { j += 2; continue; } // удвоенная кавычка
      return j + 1;
    }
    j++;
  }
  return -1;
}

export function protectLiterals(sql: string, opts: ProtectOptions = {}): ProtectedSql {
  const backslash = Boolean(opts.backslashEscapes);
  const literals: string[] = [];
  const base = uniqueToken(sql, '__qs');
  const divToken = uniqueToken(sql, '__qdiv__');
  const n = sql.length;
  let out = '';
  let i = 0;

  const placeholder = (literal: string): string => {
    const idx = literals.length;
    literals.push(literal);
    const core = `${base}${idx}__`;
    // однострочный литерал сохраняет длину: решения форматтера о переносах строк (expressionWidth) не меняются
    const innerLength = literal.length - 2;
    const pad = !literal.includes('\n') && innerLength > core.length ? '_'.repeat(innerLength - core.length) : '';
    return `'${core}${pad}'`;
  };

  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === '-' && d === '-') {
      let j = sql.indexOf('\n', i);
      if (j < 0) j = n;
      out += sql.slice(i, j);
      i = j;
    } else if (c === '/' && d === '*') {
      const end = sql.indexOf('*/', i + 2);
      const j = end < 0 ? n : end + 2;
      out += sql.slice(i, j);
      i = j;
    } else if (c === '"' || c === '`') {
      const end = quotedEnd(sql, i, backslash);
      const j = end < 0 ? n : end;
      out += sql.slice(i, j);
      i = j;
    } else if (c === "'") {
      // E'…': обратная косая черта экранирует и в диалектах, где обычные строки её не знают
      const prev = i > 0 ? sql[i - 1] : '';
      const isEscapeString = (prev === 'E' || prev === 'e') && (i < 2 || !/[A-Za-z0-9_$\u0080-￿]/.test(sql[i - 2]));
      const end = quotedEnd(sql, i, backslash || isEscapeString);
      if (end < 0) {
        // незакрытая строка остаётся как есть: форматтер сообщит об ошибке
        out += sql.slice(i);
        i = n;
      } else {
        out += opts.dollarOnly ? sql.slice(i, end) : placeholder(sql.slice(i, end));
        i = end;
      }
    } else if (c === '$') {
      const end = dollarQuoteEnd(sql, i);
      if (end < 0) {
        out += c;
        i++;
      } else {
        out += placeholder(sql.slice(i, end));
        i = end;
      }
    } else if (opts.protectDivision && c === '/' && d === '/') {
      out += ` ${divToken} `;
      i += 2;
    } else {
      out += c;
      i++;
    }
  }

  const placeholderRe = new RegExp(`'${escapeRegExp(base)}(\\d+)__+'`, 'g');
  return {
    text: out,
    restore: (formatted: string): string => {
      let restored = literals.length > 0 ? formatted.replace(placeholderRe, (match, k: string) => literals[Number(k)] ?? match) : formatted;
      if (opts.protectDivision) restored = restored.split(divToken).join('//');
      return restored;
    },
  };
}
