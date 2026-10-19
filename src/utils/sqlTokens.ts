// Лексический разбор SQL на «код», строки и комментарии без потери текста.
// Правила те же, что у stripCommentsAndLiterals (clickhouseFormat.ts): `--` до конца строки, `/* … */` без вложенности,
// строки и идентификаторы в '…', "…", `…`; удвоенная кавычка внутри не закрывает строку.
// Используется сжатием SQL (3.6) и построением страниц результата (3.1): там важно не трогать содержимое строк и комментариев.

export type SqlSegmentType = 'code' | 'line-comment' | 'block-comment' | 'string';

export interface SqlSegment {
  type: SqlSegmentType;
  text: string;
}

export interface SqlTokenOptions {
  /**
   * Обратная косая черта экранирует следующий символ внутри строки (ClickHouse, MySQL, прежнее поведение compactSql).
   * Для DuckDB/PostgreSQL обычная строка `'C:\data\'` заканчивается на последней кавычке — там передаётся false.
   * По умолчанию true.
   */
  backslashEscapes?: boolean;
}

/**
 * Делит текст на сегменты; конкатенация `text` всех сегментов равна исходному тексту.
 * Строчный комментарий не включает перевод строки (он остаётся в следующем сегменте кода).
 * Незакрытая строка или блочный комментарий тянутся до конца текста.
 */
export function splitSqlSegments(sql: string, opts: SqlTokenOptions = {}): SqlSegment[] {
  const backslash = opts.backslashEscapes !== false;
  const n = sql.length;
  const out: SqlSegment[] = [];
  let codeStart = 0;
  let i = 0;

  const flushCode = (end: number) => {
    if (end > codeStart) out.push({ type: 'code', text: sql.slice(codeStart, end) });
  };

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      flushCode(i);
      let j = i;
      while (j < n && sql[j] !== '\n') j++;
      out.push({ type: 'line-comment', text: sql.slice(i, j) });
      i = j;
      codeStart = i;
    } else if (c === '/' && next === '*') {
      flushCode(i);
      const end = sql.indexOf('*/', i + 2);
      const j = end < 0 ? n : end + 2;
      out.push({ type: 'block-comment', text: sql.slice(i, j) });
      i = j;
      codeStart = i;
    } else if (c === "'" || c === '"' || c === '`') {
      flushCode(i);
      let j = i + 1;
      while (j < n) {
        if (backslash && sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; } // удвоенная кавычка
          j++;
          break;
        }
        j++;
      }
      if (j > n) j = n;
      out.push({ type: 'string', text: sql.slice(i, j) });
      i = j;
      codeStart = i;
    } else {
      i++;
    }
  }
  flushCode(n);
  return out;
}

/**
 * Текст той же длины, где комментарии и строки (вместе с кавычками) заменены пробелами; переводы строк сохранены.
 * Индексы в результате совпадают с индексами в исходном тексте — можно искать ключевые слова вне строк и комментариев
 * и по найденной позиции резать исходный текст.
 */
export function maskSql(sql: string, opts: SqlTokenOptions = {}): string {
  let out = '';
  for (const seg of splitSqlSegments(sql, opts)) {
    if (seg.type === 'code') out += seg.text;
    else out += seg.text.replace(/[^\n]/g, ' ');
  }
  return out;
}
