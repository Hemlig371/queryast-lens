// HTML-подсветка SQL для статических представлений (просмотр ячейки, превью сниппетов).

export const getBaseHighlight = (sqlText: string, theme: 'dark' | 'light') => {
  if (!sqlText) return '';

  let html = sqlText
    .replace(/\r/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const isDark = theme === 'dark';
  const kwColor = isDark ? 'text-blue-400' : 'text-blue-700';
  const fnColor = isDark ? 'text-purple-400' : 'text-purple-700';
  const strColor = isDark ? 'text-emerald-400' : 'text-emerald-700';
  const identColor = isDark ? 'text-teal-500' : 'text-teal-800';
  const numColor = isDark ? 'text-orange-300' : 'text-orange-500';
  const engineColor = isDark ? 'text-amber-300' : 'text-amber-500'; 
  const commentColor = isDark ? 'text-slate-500' : 'text-slate-500';

  const highlightVariables = (text: string): string => {
    return text.replace(/(\{\{\$[a-zA-Z0-9_\u0400-\u04FF]+(?: [a-zA-Z0-9_\u0400-\u04FF]+)*(?:=(?:[^}\n]|\}(?!\}))*)?\}\}|\{\{[a-zA-Z0-9_]+\}\})/g, (match) => {
      const isParam = match.startsWith('{{$');
      const color = isParam
        ? (isDark ? 'text-red-400' : 'text-red-700')
        : (isDark ? 'text-purple-400' : 'text-purple-700');
      return `<span class="${color}">${match}</span>`;
    });
  };

  const tokenRegex = /(--.*$|\/\*[\s\S]*?\*\/)|('(?:''|[^'])*')|("(?:""|[^"])*"|`(?:``|[^`])*`)|(\{\{\$[a-zA-Z0-9_\u0400-\u04FF]+(?: [a-zA-Z0-9_\u0400-\u04FF]+)*(?:=(?:[^}\n]|\}(?!\}))*)?\}\}|\{\{[a-zA-Z0-9_]+\}\})|(\b\d+(?:\.\d+)?\b)|(\b(?:ENGINE|SETTINGS|DEFAULT)\b)|(\b(?:COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|NOW|CONCAT|DATE_TRUNC|DATE|INT|INTEGER|DOUBLE|VARCHAR|TEXT|DECIMAL|TIME|TIMESTAMP|BOOLEAN|BLOB|INTERVAL|UUID|Float(?:64|32|16|8)|Int(?:64|32|16|8)|UInt(?:64|32|16|8)|STRING|LOWER|UPPER|CAST|ROW_NUMBER|DENSE_RANK|RANK|LEAD|LAG|FIRST_VALUE|LAST_VALUE|LISTAGG|TO_CHAR|TO_DATE|NVL|DECODE|UNIQEXACT|UNIQCOMBINED|ARGMAX|ARGMIN|TOSTARTOFHOUR|TOSTARTOFDAY|QUANTILESEXACT|DICTGET|READ_CSV_AUTO|READ_PARQUET|READ_CSV|LIST_TRANSFORM|FILTER|JSON_EXTRACT|ARRAY_JOIN|ARRAYMAP|ARRAYFILTER)\b)|(\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|INSERT|INTO|UPDATE|SET|DELETE|CREATE|TABLE|AS|WITH|RECURSIVE|AND|OR|NOT|IN|IS|NULL|LIKE|ILIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|ASC|DESC|OVER|PARTITION|WINDOW|DISTINCT|VALUES|QUALIFY|PIVOT|UNPIVOT|COLUMNS|EXCLUDE|REPLACE|ATTACH|COPY|MERGE|MATCHED|USING|RETURNING|LATERAL|CONNECT|PRIOR|START|FINAL|UPSERT|CONFLICT|DO|RETURNING|BEGIN|TRANSACTION|COMMIT|ROLLBACK|ABORT)\b)/gim;

  html = html.replace(tokenRegex, (match, comment, str, ident, variable, num, engineKw, fn, kw) => {
    if (comment) {
      return `<span class="${commentColor}">${highlightVariables(comment)}</span>`;
    }
    if (str) {
      return `<span class="${strColor}">${highlightVariables(str)}</span>`;
    }
    if (ident) {
      return `<span class="${identColor}">${highlightVariables(ident)}</span>`;
    }
    if (variable) {
      return highlightVariables(variable);
    }
    if (num) {
      return `<span class="${numColor}">${num}</span>`;
    }
    if (engineKw) {
      return `<span class="${engineColor}">${engineKw}</span>`;
    }
    if (fn) {
      return `<span class="${fnColor}">${fn}</span>`;
    }
    if (kw) {
      return `<span class="${kwColor}">${kw}</span>`;
    }
    return match;
  });

  if (sqlText.endsWith('\n')) {
    html += ' ';
  }

  return html;
};

const chunkCache = new Map<string, string>();

interface LineState {
  inString: boolean;
  stringChar: string;
  inBlockComment: boolean;
}

function getLineEndState(line: string, startState: LineState): LineState {
  let { inString, stringChar, inBlockComment } = startState;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (!inBlockComment && !inString) {
      if (char === "'" || char === '"' || char === "`") {
        inString = true;
        stringChar = char;
      } else if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        i++;
      } else if (char === '-' && nextChar === '-') {
        break;
      }
    } else if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === stringChar) {
        if (nextChar === stringChar) {
          i++;
        } else {
          inString = false;
          stringChar = '';
        }
      }
    } else if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
      }
    }
  }
  return { inString, stringChar, inBlockComment };
}

export const getChunkedHighlight = (sqlText: string, theme: 'dark' | 'light') => {
  if (!sqlText) return '';

  const rawLines = sqlText.split('\n');

  // Fast plain-text path for large scripts (>= 3000 lines or >= 150 000 chars) to prevent freezing
  if (rawLines.length >= 3000 || sqlText.length >= 150_000) {
    let plain = sqlText
      .replace(/\r/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (sqlText.endsWith('\n')) {
      plain += ' ';
    }
    return plain;
  }

  const chunks: string[] = [];
  let currentChunkLines: string[] = [];
  let state: LineState = { inString: false, stringChar: '', inBlockComment: false };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    currentChunkLines.push(line);
    state = getLineEndState(line, state);

    if (currentChunkLines.length >= 50 && !state.inBlockComment && !state.inString) {
      chunks.push(currentChunkLines.join('\n'));
      currentChunkLines = [];
    }
  }

  if (currentChunkLines.length > 0) {
    chunks.push(currentChunkLines.join('\n'));
  }

  const htmlChunks = chunks.map(chunkText => {
    const cacheKey = `${theme}_${chunkText}`;
    let html = chunkCache.get(cacheKey);
    if (!html) {
      html = getBaseHighlight(chunkText, theme);
      chunkCache.set(cacheKey, html);
    }
    return html;
  });

  if (chunkCache.size > 1000) {
    chunkCache.clear();
  }

  return htmlChunks.join('\n');
};

export const applySelectionToHtml = (html: string, theme: 'dark' | 'light', selectedText: string) => {
  if (!selectedText || selectedText.trim().length === 0) return html;
  
  const trimmed = selectedText.trim();
  const escapedSearch = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const isWord = /^\w+$/.test(trimmed);
  const pattern = isWord ? `\\b${escapedSearch}\\b` : escapedSearch;
  const isDark = theme === 'dark';

  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const highlightClass = isDark
      ? 'bg-amber-400/25 ring-1 ring-amber-400/40 rounded-[2px]'
      : 'bg-yellow-200/90 ring-1 ring-yellow-400/60 rounded-[2px]';

    const parts = html.split(/(<[^>]+>)/g);
    return parts.map(part => {
      if (part.startsWith('<') && part.endsWith('>')) {
        return part;
      }
      return part.replace(regex, `<span class="${highlightClass}">${'$1'}</span>`);
    }).join('');
  } catch (e) {
    return html;
  }
};

export const highlightSqlHtml = (sqlText: string, theme: 'dark' | 'light', selectedText?: string) => {
  let html = getChunkedHighlight(sqlText, theme);
  if (selectedText) {
    html = applySelectionToHtml(html, theme, selectedText);
  }
  return html;
};