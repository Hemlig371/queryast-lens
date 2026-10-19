export const formatColumnType = (type: string | undefined | null): string => {
  if (!type) return '';
  const t = type.trim();
  if (/Enum(8|16)?\s*\(/i.test(t)) {
    return t.replace(/(Enum(?:8|16)?)\s*\([\s\S]*?\)/gi, "$1(...)");
  }
  return t;
};

export const splitBySemicolonIgnoringQuotes = (str: string): string[] => {

  const statements: string[] = [];
  let current = '';
  let inString: string | null = null;
  let inSingleComment = false;
  let inMultiComment = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1] || '';
    if (inSingleComment) {
      current += char;
      if (char === '\n') {
        inSingleComment = false;
      }
    } else if (inMultiComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += nextChar;
        i++;
        inMultiComment = false;
      }
    } else if (inString) {
      current += char;
      if (char === inString && str[i - 1] !== '\\') {
        inString = null;
      }
    } else if (char === '-' && nextChar === '-') {
      inSingleComment = true;
      current += char + nextChar;
      i++;
    } else if (char === '/' && nextChar === '*') {
      inMultiComment = true;
      current += char + nextChar;
      i++;
    } else if (char === "'" || char === '"' || char === '`') {
      inString = char;
      current += char;
    } else if (char === ';') {
      statements.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) {
    statements.push(current);
  }
  return statements;
};

/**
 * Zero-overhead SQL variable replacer.
 * 
 * Extracts variable definitions in format {{$name=value}} or {{$name = value}}
 * (typically written in SQL comments like `-- {{$name=value}}` or `/* {{$name=value}} *\/`).
 * Replaces occurrences of {{$name}} and {{$name=value}} with their assigned values.
 *
 * If no '{{$' is present in sql, returns immediately with zero overhead.
 * Does NOT touch vault secrets (which use {{secret_name}} without '$').
 * 
 * @param sql The SQL string being executed (can be a selection or full script).
 * @param contextSql Optional broader SQL context (e.g. the full editor content)
 *                   to retrieve variable definitions if only a subquery was selected.
 */
export const replaceVariablesInSql = (sql: string, contextSql?: string): string => {
  if (!sql || !sql.includes('{{$')) {
    return sql;
  }

  const varDefs: Record<string, string> = {};
  const defRegex = /\{\{\$([a-zA-Z0-9_\u0400-\u04FF]+)\s*=\s*([^}\r\n]*)\}\}/g;

  // 1. Scan contextSql if provided (e.g. full tab script when user executed a selection)
  if (contextSql && contextSql.includes('{{$')) {
    let m: RegExpExecArray | null;
    while ((m = defRegex.exec(contextSql)) !== null) {
      const name = m[1].trim();
      const val = m[2].trim();
      varDefs[name] = val;
    }
  }

  // 2. Scan the current sql (overrides or provides definitions)
  let m: RegExpExecArray | null;
  defRegex.lastIndex = 0;
  while ((m = defRegex.exec(sql)) !== null) {
    const name = m[1].trim();
    const val = m[2].trim();
    varDefs[name] = val;
  }

  // 3. First, replace any inline definition macros {{$name=value}} with their value
  let result = sql.replace(/\{\{\$([a-zA-Z0-9_\u0400-\u04FF]+)\s*=\s*([^}\r\n]*)\}\}/g, (_match, _name, val) => {
    return val.trim();
  });

  // 4. Replace variable usages {{$name}}
  result = result.replace(/\{\{\$([a-zA-Z0-9_\u0400-\u04FF]+)\}\}/g, (match, name) => {
    const key = name.trim();
    if (Object.prototype.hasOwnProperty.call(varDefs, key)) {
      return varDefs[key]; // Пользовательское значение имеет приоритет
    }
    if (key === 'timestamp') {
      return Date.now().toString(); // Системное значение по умолчанию
    }
    return match;
  });

  return result;
};

// ---- Быстрые действия над результатом (Ctrl+Q и кнопка с молнией) ----

const LEADING_COMMENTS_RE = /^(\s*(--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/))*/;
const SELECT_LIKE_RE = /^\(?\s*(SELECT|WITH|FROM|VALUES|TABLE)\b/i;

/**
 * Последний запрос скрипта, который выдаёт строки: из нескольких операторов берётся последний SELECT-подобный
 * (иначе последний непустой); комментарии в начале и после последнего `;` не считаются оператором.
 * Завершающая `;` убирается. Пустой текст → ''.
 */
export const getLastSelectStatement = (sql: string): string => {
  const bodies = splitBySemicolonIgnoringQuotes(sql || '')
    .map(s => s.replace(LEADING_COMMENTS_RE, '').trim())
    .filter(Boolean);
  if (bodies.length === 0) return '';
  for (let i = bodies.length - 1; i >= 0; i--) {
    if (SELECT_LIKE_RE.test(bodies[i])) return bodies[i];
  }
  return bodies[bodies.length - 1];
};

/** Источник для `{table}` в шаблонах быстрых действий: `table` до первого запроса, иначе последний SELECT в подзапросе. */
export const buildQuickActionSource = (lastExecutedSql: string): string => {
  const last = getLastSelectStatement(lastExecutedSql);
  if (!last) return 'table';
  return `(\n${last}\n) AS _sub`;
};

/** Имена переменных `{{$имя}}`, которым не нашлось значения (ни в `sql`, ни в `contextSql`). Без повторов, в порядке появления. */
export const findUnresolvedVariables = (sql: string, contextSql?: string): string[] => {
  const resolved = replaceVariablesInSql(sql, contextSql);
  const names: string[] = [];
  const re = /\{\{\$([a-zA-Z0-9_Ѐ-ӿ]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(resolved)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
};
