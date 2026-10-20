// Выбор формата ответа ClickHouse для запросов, результат которых показывается в таблице.
// Приложение читает ответ как JSON, поэтому к SELECT/SHOW/DESCRIBE/EXPLAIN/WITH добавляется `FORMAT JSON`,
// если формат не задан пользователем. Комментарии и строки при проверке не учитываются.

// Текст без комментариев (строчных и блочных) и без содержимого строк и идентификаторов в кавычках.
export function stripCommentsAndLiterals(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      out += ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < n) {
        if (sql[i] === '\\') { i += 2; continue; } // в ClickHouse обратная косая черта экранирует
        if (sql[i] === q) {
          if (sql[i + 1] === q) { i += 2; continue; } // удвоенная кавычка
          break;
        }
        i++;
      }
      i++;
      out += q + q;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// `FORMAT <имя>` в конце оператора (после него допускается только хвост `SETTINGS …`).
// ASC/DESC исключены: `ORDER BY format DESC` — это столбец с именем format, а не формат вывода.
const FORMAT_AT_END = /\bFORMAT\s+(?!(?:ASC|DESC|ASCENDING|DESCENDING)\b)([A-Za-z_]\w*)(?:\s+SETTINGS\b[\s\S]*)?$/i;

/** Имя формата из `FORMAT <имя>` в конце оператора или null. Комментарии, строки и столбец `format` не учитываются. */
export function getFormatClause(sql: string): string | null {
  const code = stripCommentsAndLiterals(sql).replace(/[\s;]+$/, '');
  const m = FORMAT_AT_END.exec(code);
  return m ? m[1] : null;
}

/** Единый признак «в конце оператора задан FORMAT» для запросов, COPY и dev-сервера. */
export function hasFormatClause(sql: string): boolean {
  return getFormatClause(sql) !== null;
}

/** Нужно ли добавить `FORMAT JSON`: запрос возвращает строки, и формат не задан. */
export function needsJsonFormat(sql: string): boolean {
  const code = stripCommentsAndLiterals(sql);
  if (!/^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i.test(code)) return false;
  return !hasFormatClause(sql);
}

/** Ответ на этот запрос должен быть JSON: запрос возвращает строки и формат — именно JSON. */
export function isJsonResponseExpected(sql: string): boolean {
  const code = stripCommentsAndLiterals(sql);
  if (!/^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i.test(code)) return false;
  return (getFormatClause(sql) || '').toUpperCase() === 'JSON';
}

/** Формат файла для COPY по расширению пути (неизвестное расширение — CSV). */
export function copyFormatForPath(filePath: string): string {
  const ext = (filePath.split(/[\\/]/).pop() || '').split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'CSVWithNames';
  if (ext === 'tsv' || ext === 'tab') return 'TSVWithNames';
  if (ext === 'json') return 'JSONEachRow';
  if (ext === 'parquet') return 'Parquet';
  return 'CSVWithNames';
}

/** Дописывает формат по расширению файла с новой строки (хвостовой `--` комментарий его не съедает), если формат не задан. */
export function appendCopyFormat(sql: string, filePath: string): string {
  const base = sql.trim().replace(/[\s;]+$/, '');
  if (hasFormatClause(base)) return base;
  return `${base}\nFORMAT ${copyFormatForPath(filePath)}`;
}

// Убирает в конце текста пробелы, `;` и комментарии (строчные и блочные), не трогая кавычки внутри.
export function stripTrailingNoise(sql: string): string {
  const n = sql.length;
  let i = 0;
  let end = 0;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2);
      i = close < 0 ? n : close + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < n) {
        if (sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === q) {
          if (sql[i + 1] === q) { i += 2; continue; }
          break;
        }
        i++;
      }
      i = Math.min(i + 1, n);
      end = i;
    } else {
      if (!/\s/.test(c) && c !== ';') end = i + 1;
      i++;
    }
  }
  return sql.slice(0, end);
}

/** Добавляет `FORMAT JSON` с новой строки (чтобы не попасть в хвостовой `--` комментарий), убирая `;` в конце. */
export function appendJsonFormat(sql: string): string {
  return `${sql.replace(/[;\s]+$/, '')}\nFORMAT JSON`;
}
