// @ts-nocheck
import pkg from 'node-sql-parser';
const { Parser } = pkg;
import dagre from 'dagre';

export interface GraphNode {
  id: string;
  type: string;
  data: any;
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  label?: string;
  style?: any;
}

const parser = new Parser();

// --- 1. CORE LEXER (STATE MACHINE) ---

export interface Token {
  type: 'word' | 'string' | 'comment' | 'symbol' | 'whitespace';
  value: string;
  start: number;
  end: number;
}

export function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const char = sql[i];
    const nextChar = sql[i + 1] || '';

    if (/\s/.test(char)) {
      const start = i;
      while (i < len && /\s/.test(sql[i])) i++;
      tokens.push({ type: 'whitespace', value: sql.substring(start, i), start, end: i });
      continue;
    }

    if ((char === '-' && nextChar === '-') || char === '#') {
      const start = i;
      while (i < len && sql[i] !== '\n' && sql[i] !== '\r') i++;
      tokens.push({ type: 'comment', value: sql.substring(start, i), start, end: i });
      continue;
    }

    if (char === '/' && nextChar === '*') {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < len && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      tokens.push({ type: 'comment', value: sql.substring(start, i), start, end: i });
      continue;
    }

    if (char === '$' && (nextChar === '$' || /[a-zA-Z0-9_]/.test(nextChar))) {
      const match = sql.substring(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        const tag = match[1];
        const start = i;
        i += tag.length;
        const endTagIdx = sql.indexOf(tag, i);
        if (endTagIdx !== -1) {
          i = endTagIdx + tag.length;
        } else {
          i = len;
        }
        tokens.push({ type: 'string', value: sql.substring(start, i), start, end: i });
        continue;
      }
    }

    if ((char === 'q' || char === 'Q') && nextChar === "'") {
      const quoteChar = sql[i + 2];
      if (quoteChar) {
        let closeChar = quoteChar;
        if (quoteChar === '[') closeChar = ']';
        else if (quoteChar === '{') closeChar = '}';
        else if (quoteChar === '<') closeChar = '>';
        else if (quoteChar === '(') closeChar = ')';

        const start = i;
        i += 3;
        while (i < len) {
          if (sql[i] === closeChar && sql[i + 1] === "'") {
            i += 2;
            break;
          }
          i++;
        }
        tokens.push({ type: 'string', value: sql.substring(start, i), start, end: i });
        continue;
      }
    }

    if (char === "'" || char === '"' || char === '`') {
      const start = i;
      const quote = char;
      i++;
      while (i < len) {
        if (sql[i] === '\\') { 
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { 
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      tokens.push({ type: 'string', value: sql.substring(start, i), start, end: i });
      continue;
    }

    if (/[a-zA-Z0-9_\u0400-\u04FFёЁ]/.test(char)) {
      const start = i;
      while (i < len && /[a-zA-Z0-9_\u0400-\u04FFёЁ.$]/.test(sql[i])) i++;
      tokens.push({ type: 'word', value: sql.substring(start, i), start, end: i });
      continue;
    }

    const start = i;
    tokens.push({ type: 'symbol', value: char, start, end: i + 1 });
    i++;
  }
  return tokens;
}

export function stripCommentsSafely(sql: string): string {
  return tokenizeSql(sql)
    .filter(t => t.type !== 'comment')
    .map(t => t.value)
    .join('');
}

// --- 2. EXPRESSION FORMATTER ---

export function formatExpr(expr: any): string {
  if (expr === null || expr === undefined) return '';
  if (typeof expr === 'string') return expr;
  if (typeof expr === 'number') return String(expr);
  if (typeof expr === 'boolean') return expr ? 'TRUE' : 'FALSE';

  if (expr.ast !== undefined) return formatExpr(expr.ast);
  if (expr.expr !== undefined) return formatExpr(expr.expr);
  if (Array.isArray(expr)) return expr.map(formatExpr).join(', ');

  let overStr = '';
  if (expr && expr.over) {
    let partitionStr = '';
    if (expr.over.partitionby) {
      partitionStr = 'PARTITION BY ' + (Array.isArray(expr.over.partitionby) ? expr.over.partitionby.map(formatExpr).join(', ') : formatExpr(expr.over.partitionby));
    }
    let orderStr = '';
    if (expr.over.orderby) {
      orderStr = 'ORDER BY ' + (Array.isArray(expr.over.orderby) ? expr.over.orderby.map((o: any) => {
        const oExpr = formatExpr(o.expr || o);
        const oType = o.type ? ` ${o.type.toUpperCase()}` : '';
        return oExpr + oType;
      }).join(', ') : formatExpr(expr.over.orderby));
    }
    let frameStr = '';
    if (expr.over.window_frame) {
      frameStr = 'ROWS/RANGE BETWEEN ...';
    }
    const innerOver = [partitionStr, orderStr, frameStr].filter(Boolean).join(' ');
    overStr = ` OVER (${innerOver})`;
  }

  let filterStr = '';
  if (expr && expr.filter) {
     filterStr = ` FILTER (WHERE ${formatExpr(expr.filter)})`;
  }

  if (expr.type === 'select' || expr.type === 'union') {
    try {
      return `(${parser.sqlify(expr)})`;
    } catch (e) {
      const tables = expr.from ? (Array.isArray(expr.from) ? expr.from.map((f: any) => {
        if (typeof f === 'string') return f;
        return f.table || formatExpr(f);
      }).join(', ') : '') : '';
      return `(SELECT ... FROM ${tables || '...'})`;
    }
  }

  let prefix = '';
  if (expr.distinct) prefix = 'DISTINCT ';

  switch (expr.type) {
    case 'column_ref':
      const colVal = typeof expr.column === 'object' ? formatExpr(expr.column) : expr.column;
      const tblVal = expr.table ? (typeof expr.table === 'object' ? formatExpr(expr.table) : expr.table) : '';
      return prefix + (tblVal ? `${tblVal}.${colVal}` : colVal);
    case 'unary_expr':
      const uOp = expr.operator || '';
      const uExpr = formatExpr(expr.expr);
      return `${uOp} ${uExpr}`.trim();
      
    case 'binary_expr':
      const left = formatExpr(expr.left);
      const op = typeof expr.operator === 'object' ? formatExpr(expr.operator) : (expr.operator || '');
      
      let right = '';
      const upperOp = op.toUpperCase();
      
      if (upperOp === 'BETWEEN' || upperOp === 'NOT BETWEEN') {
         if (Array.isArray(expr.right)) {
             right = expr.right.map(formatExpr).join(' AND ');
         } else {
             right = formatExpr(expr.right);
         }
      } else if (upperOp === 'IN' || upperOp === 'NOT IN') {
         const rightFormatted = formatExpr(expr.right);
         right = `(${rightFormatted})`; 
      } else if (upperOp === 'IS NULL' || upperOp === 'IS NOT NULL') {
         return `${left} ${op}`;
      } else {
         right = formatExpr(expr.right);
      }
      
      return `${left} ${op} ${right}`;
    case 'number':
    case 'string':
    case 'single_quote_string':
      return typeof expr.value === 'string' ? `'${expr.value}'` : String(expr.value);
    case 'double_quote_string':
      return `"${expr.value}"`;
    case 'aggr_func':
      const aggrName = typeof expr.name === 'object' ? formatExpr(expr.name) : expr.name;
      const aggrArgs = expr.args?.expr ? formatExpr(expr.args.expr) : (expr.args ? formatExpr(expr.args) : '*');
      return `${aggrName}(${prefix}${aggrArgs})${filterStr}${overStr}`;
    case 'function':
      const funcName = typeof expr.name === 'object' ? formatExpr(expr.name) : expr.name;
      const funcArgs = Array.isArray(expr.args) ? expr.args.map(formatExpr).join(', ') : (expr.args ? formatExpr(expr.args) : '');
      return `${funcName}(${funcArgs})${filterStr}${overStr}`;
    case 'expr_list':
      if (Array.isArray(expr.value)) return expr.value.map(formatExpr).join(', ');
      return formatExpr(expr.value);
    case 'star':
      return '*';
    case 'interval':
      return `INTERVAL ${expr.value} ${expr.unit}`;
    case 'case':
      const cases = expr.args?.map((arg: any) => {
        if (!arg) return '';
        if (arg.type === 'when') return `WHEN ${formatExpr(arg.cond)} THEN ${formatExpr(arg.result)}`;
        if (arg.type === 'else') return `ELSE ${formatExpr(arg.result)}`;
        return '';
      }).filter(Boolean).join(' ');
      return `CASE ${cases} END`;
    default:
      if (expr.value !== undefined) {
        if (typeof expr.value === 'object' && expr.value !== null) return formatExpr(expr.value);
        return String(expr.value);
      }
      if (expr.column !== undefined) {
        return typeof expr.column === 'object' ? formatExpr(expr.column) : String(expr.column);
      }
      if (expr.name !== undefined) {
        return typeof expr.name === 'object' ? formatExpr(expr.name) : String(expr.name);
      }
      if (expr.from !== undefined || expr.columns !== undefined) return '(SELECT ...)';
      return '';
  }
}

// --- 3. TOKENS-BASED UTILITIES ---

function findClosingParenthesis(text: string, openIndex: number): number {
  const tokens = tokenizeSql(text);
  let depth = 0;
  let foundOpen = false;

  for (const t of tokens) {
    if (t.start >= openIndex && t.type === 'symbol') {
      if (t.value === '(') {
        depth++;
        foundOpen = true;
      } else if (t.value === ')') {
        depth--;
        if (foundOpen && depth === 0) return t.start;
      }
    }
  }
  return -1;
}

function extractCleanSubquerySql(tableStr: string): { sql: string; alias: string | null } {
  let str = tableStr.trim();
  let alias: string | null = null;
  
  if (str.startsWith('(')) {
    const closingIdx = findClosingParenthesis(str, 0);
    if (closingIdx !== -1) {
      const subquerySql = str.substring(1, closingIdx).trim();
      const remaining = str.substring(closingIdx + 1).trim();
      if (remaining) {
        const aliasMatch = remaining.match(/^(?:AS\s+)?([A-Za-z0-9_\u0400-\u04FFёЁ]+)/i);
        if (aliasMatch) {
          alias = aliasMatch[1];
        }
      }
      return { sql: subquerySql, alias };
    }
  }
  
  return { sql: str, alias: null };
}

function extractSubqueriesFromString(text: string): { subquerySql: string; startIndex: number; endIndex: number }[] {
  const tokens = tokenizeSql(text);
  const results: { subquerySql: string; startIndex: number; endIndex: number }[] = [];
  let i = 0;

  while (i < tokens.length) {
    if (tokens[i].type === 'symbol' && tokens[i].value === '(') {
      let j = i + 1;
      while (j < tokens.length && (tokens[j].type === 'whitespace' || tokens[j].type === 'comment')) j++;
      
      if (j < tokens.length && tokens[j].type === 'word') {
        const nextWord = String(tokens[j].value || '').toUpperCase();
        if (nextWord === 'SELECT' || nextWord === 'WITH') {
          let depth = 1;
          let k = i + 1;
          while (k < tokens.length && depth > 0) {
            if (tokens[k].type === 'symbol') {
              if (tokens[k].value === '(') depth++;
              else if (tokens[k].value === ')') depth--;
            }
            k++;
          }
          if (depth === 0) {
            const startOffset = tokens[i].start;
            const endOffset = tokens[k - 1].start;
            results.push({
              subquerySql: text.substring(startOffset + 1, endOffset).trim(),
              startIndex: startOffset,
              endIndex: endOffset
            });
            i = k - 1; 
          }
        }
      }
    }
    i++;
  }
  return results;
}

function splitByTopLevelCommas(text: string): string[] {
  const tokens = tokenizeSql(text);
  const parts: string[] = [];
  let currentStart = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'symbol') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (t.value === '[') bracketDepth++;
      else if (t.value === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (t.value === ',' && parenDepth === 0 && bracketDepth === 0) {
        parts.push(text.substring(currentStart, t.start).trim());
        currentStart = t.end;
      }
    }
  }
  if (currentStart < text.length) {
    parts.push(text.substring(currentStart).trim());
  }
  return parts.filter(Boolean);
}

// Новая утилита для разбиения длинных условий WHERE/HAVING на строки
function splitConditions(text: string): { name: string }[] {
  const tokens = tokenizeSql(text);
  const parts: { name: string }[] = [];
  let currentStart = 0;
  let parenDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'symbol') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
    } else if (t.type === 'word' && parenDepth === 0) {
      const upper = String(t.value || '').toUpperCase();
      if (upper === 'AND' || upper === 'OR') {
        const chunk = text.substring(currentStart, t.start).trim();
        if (chunk) {
          parts.push({ name: chunk });
          currentStart = t.start;
        }
      }
    }
  }
  const finalChunk = text.substring(currentStart).trim();
  if (finalChunk) {
    parts.push({ name: finalChunk });
  }
  return parts.length > 0 ? parts : [{ name: text }];
}

function parseHeuristicColumn(colStr: string): any {
  const cleanCol = colStr.trim();
  const tokens = tokenizeSql(cleanCol);
  
  let parenDepth = 0;
  let bracketDepth = 0;
  let lastAsIndex = -1;
  let lastSpaceIndex = -1;
  
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'symbol') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (t.value === '[') bracketDepth++;
      else if (t.value === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (parenDepth === 0 && bracketDepth === 0) {
      if (t.type === 'word' && String(t.value || '').toUpperCase() === 'AS') {
        lastAsIndex = t.start;
      } else if (t.type === 'whitespace') {
        lastSpaceIndex = t.start;
      }
    }
  }
  
  let exprStr = cleanCol;
  let alias: string | null = null;
  
  if (lastAsIndex !== -1) {
    exprStr = cleanCol.substring(0, lastAsIndex).trim();
    const afterAs = cleanCol.substring(lastAsIndex).trim();
    const aliasPart = afterAs.replace(/^AS\s+/i, '').trim();
    if (aliasPart) {
      alias = aliasPart.replace(/^["'`]|["'`]$/g, '').trim();
    }
  } else if (lastSpaceIndex !== -1) {
    const potentialAlias = cleanCol.substring(lastSpaceIndex).trim();
    const potentialExpr = cleanCol.substring(0, lastSpaceIndex).trim();
    
    const isQuoted = /^["'`].*["'`]$/.test(potentialAlias);
    const isIdentifier = /^[A-Za-z0-9_\u0400-\u04FFёЁ]+$/.test(potentialAlias);
    
    if ((isQuoted || isIdentifier) && potentialExpr && !potentialAlias.includes(')') && !potentialAlias.includes(']')) {
      exprStr = potentialExpr;
      alias = potentialAlias.replace(/^["'`]|["'`]$/g, '').trim();
    }
  }
  
  return {
    expr: { type: 'column_ref', column: exprStr },
    as: alias
  };
}

function findTopLevelKeywordIndex(sql: string, keywordRegex: RegExp): number {
  const tokens = tokenizeSql(sql);
  let parenDepth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'symbol') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
    }
    if (parenDepth === 0 && t.type === 'word') {
      const match = sql.substring(t.start).match(keywordRegex);
      if (match && match.index === 0) {
        return t.start;
      }
    }
  }
  return -1;
}

// --- 4. PROCEDURES AND DML SPLITTERS ---

function splitProcedureStatements(bodyStr: string): string[] {
  const tokens = tokenizeSql(bodyStr);
  const statements: string[] = [];
  let currentStart = 0;
  let parenDepth = 0;
  let lastWord = '';

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'symbol') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (t.value === ';' && parenDepth === 0) {
        const stmt = bodyStr.substring(currentStart, t.start).trim();
        if (stmt) statements.push(stmt);
        currentStart = t.end;
        lastWord = ''; 
      }
    } else if (t.type === 'word') {
      const upper = String(t.value || '').toUpperCase();
      
      if (parenDepth === 0) {
        if (upper === 'THEN' || upper === 'ELSE' || upper === 'BEGIN' || (upper === 'LOOP' && lastWord !== 'END')) {
          const stmt = bodyStr.substring(currentStart, t.end).trim();
          if (stmt) statements.push(stmt);
          currentStart = t.end;
        }
      }
      lastWord = upper;
    }
  }

  const finalStmt = bodyStr.substring(currentStart).trim();
  if (finalStmt) statements.push(finalStmt);
  return statements;
}

export function splitQueries(sql: string): string[] {
  const tokens = tokenizeSql(sql);
  const queries: string[] = [];
  let currentStart = 0;
  let parenDepth = 0;
  let blockDepth = 0;
  let lastWord = '';
  let isProc = false;
  let hasSeenBegin = false;

  const getNextSignificantToken = (startIndex: number) => {
    for (let i = startIndex + 1; i < tokens.length; i++) {
      if (tokens[i].type !== 'whitespace' && tokens[i].type !== 'comment') {
        return tokens[i];
      }
    }
    return null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    
    if (t.type === 'symbol') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
      
      else if (t.value === ';' || (t.value === '/' && parenDepth === 0 && blockDepth === 0)) {
        const isDivision = t.value === '/' && lastWord !== 'END' && !isProc && currentStart !== t.start;
        
        if (parenDepth === 0 && !isDivision) {
          if (!isProc || (isProc && blockDepth === 0 && hasSeenBegin)) {
            const stmt = sql.substring(currentStart, t.start).trim();
            if (stmt) queries.push(stmt);
            currentStart = t.end;
            lastWord = '';
            isProc = false;
            hasSeenBegin = false;
            blockDepth = 0;
          }
        }
      }
    } else if (t.type === 'word') {
      const upper = String(t.value || '').toUpperCase();
      
      if (upper === 'PROCEDURE' || upper === 'FUNCTION' || upper === 'TRIGGER' || upper === 'PACKAGE' || upper === 'DECLARE') {
        isProc = true;
      }
      
      if (upper === 'BEGIN') {
        const nextToken = getNextSignificantToken(i);
        const isTransaction = nextToken && (nextToken.value === ';' || String(nextToken.value || '').toUpperCase() === 'TRANSACTION' || String(nextToken.value || '').toUpperCase() === 'WORK');
        
        if (!isTransaction) {
          blockDepth++;
          hasSeenBegin = true;
        }
      } else if (upper === 'CASE' || upper === 'LOOP' || upper === 'IF') {
        if (lastWord !== 'END') blockDepth++;
      } else if (upper === 'END') {
        blockDepth = Math.max(0, blockDepth - 1);
      }
      lastWord = upper;
    }
  }

  const finalQ = sql.substring(currentStart).trim();
  if (finalQ && finalQ !== '/') queries.push(finalQ);
  return queries;
}

function splitTopLevelUnion(sql: string): { parts: string[], ops: string[] } | null {
  const tokens = tokenizeSql(sql);
  const parts: string[] = [];
  const ops: string[] = [];
  let currentStart = 0;
  let parenDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'symbol') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
    } else if (t.type === 'word' && parenDepth === 0) {
      const upper = String(t.value || '').toUpperCase();
      if (upper === 'UNION' || upper === 'INTERSECT' || upper === 'EXCEPT') {
        let nextIdx = i + 1;
        while (nextIdx < tokens.length && (tokens[nextIdx].type === 'whitespace' || tokens[nextIdx].type === 'comment')) {
           nextIdx++;
        }

        let op = upper;
        let splitEnd = t.end;

        if (nextIdx < tokens.length && tokens[nextIdx].type === 'word' && String(tokens[nextIdx].value || '').toUpperCase() === 'ALL') {
          op += ' ALL';
          splitEnd = tokens[nextIdx].end;
          i = nextIdx; 
        }

        parts.push(sql.substring(currentStart, t.start).trim());
        ops.push(op);
        currentStart = splitEnd;
      }
    }
  }

  if (parts.length > 0) {
    parts.push(sql.substring(currentStart).trim());
    return { parts, ops };
  }
  return null;
}

// --- 5. PARSERS & AST GENERATORS ---

export function extractTablesFromAst(ast: any): string[] {
  if (!ast) return [];
  const tables: string[] = [];

  if (Array.isArray(ast)) {
    ast.forEach(item => { tables.push(...extractTablesFromAst(item)); });
    return Array.from(new Set(tables));
  }

  if (ast.type === 'select') {
    if (ast.from && Array.isArray(ast.from)) {
      ast.from.forEach((item: any) => {
        if (item.table) tables.push(item.table);
        if (item.expr && item.expr.ast) tables.push(...extractTablesFromAst(item.expr.ast));
      });
    }
    if (ast.ctes && Array.isArray(ast.ctes)) {
      ast.ctes.forEach((cte: any) => { tables.push(...extractTablesFromAst(cte.ast)); });
    }
  } else if (ast.type === 'union' && Array.isArray(ast.queries)) {
    ast.queries.forEach((q: any) => { tables.push(...extractTablesFromAst(q)); });
  } else if (ast.table) {
    tables.push(ast.table);
  }

  return Array.from(new Set(tables));
}

export function parseHeuristicDml(sql: string, dialect: string): any {
  const cleanSql = sql.trim();
  const upperSql = cleanSql.toUpperCase();
  
  if (upperSql.startsWith('INSERT')) {
    const selectOrValuesMatch = cleanSql.match(/\b(SELECT|VALUES|UNION|WITH)\b/i);
    const beforeSelectOrValues = selectOrValuesMatch ? cleanSql.substring(0, selectOrValuesMatch.index) : cleanSql;
    
    const insertIntoIndex = upperSql.indexOf('INSERT INTO');
    let tableName = 'TARGET_TABLE';
    let columns: string[] = [];
    
    if (insertIntoIndex !== -1) {
      const afterInsertInto = beforeSelectOrValues.substring(insertIntoIndex + 11).trim();
      const firstParen = afterInsertInto.indexOf('(');
      let rawTableName = '';
      if (firstParen !== -1) {
        rawTableName = afterInsertInto.substring(0, firstParen).trim();
        const lastParen = afterInsertInto.lastIndexOf(')');
        if (lastParen !== -1 && firstParen < lastParen) {
          const colStr = afterInsertInto.substring(firstParen + 1, lastParen);
          columns = colStr.split(',').map(c => c.trim()).filter(Boolean);
        }
      } else {
        rawTableName = afterInsertInto.trim();
      }
      if (rawTableName) tableName = rawTableName;
    } else {
      const tableMatch = cleanSql.match(/INSERT\s+INTO\s+([A-Za-z0-9_".\u0400-\u04FFёЁ]+)/i);
      tableName = tableMatch ? tableMatch[1] : 'TARGET_TABLE';
    }
    
    let onConflictStr = '';
    const onConflictMatch = upperSql.indexOf('ON CONFLICT');
    if (onConflictMatch !== -1) {
      onConflictStr = cleanSql.substring(onConflictMatch).trim();
    }

    let selectAst: any = null;
    if (selectOrValuesMatch && selectOrValuesMatch[1] && ['SELECT', 'UNION', 'WITH'].includes(selectOrValuesMatch[1].toUpperCase())) {
      let selectSql = cleanSql.substring(selectOrValuesMatch.index).trim();
      if (onConflictMatch !== -1 && onConflictMatch > selectOrValuesMatch.index) {
          selectSql = cleanSql.substring(selectOrValuesMatch.index, onConflictMatch).trim();
      }
      const parsedSelect = parseSingleSqlToAst(selectSql, dialect);
      if (parsedSelect && parsedSelect.ast) {
        selectAst = parsedSelect.ast;
      }
    }

    let valuesCount = 1;
    const valuesIdx = upperSql.indexOf('VALUES');
    if (valuesIdx !== -1) {
      const afterValues = cleanSql.substring(valuesIdx + 6).trim();
      const matches = afterValues.match(/\(([^)]+)\)/g);
      if (matches) valuesCount = matches.length;
    }
    
    return {
      type: 'insert',
      table: { table: tableName },
      columns: columns,
      values: selectAst ? selectAst : Array(valuesCount).fill({ value: 'val' }),
      on_conflict: onConflictStr
    };
  }
  
  if (upperSql.startsWith('UPDATE')) {
    const tableMatch = cleanSql.match(/UPDATE\s+([A-Za-z0-9_".\u0400-\u04FFёЁ]+)/i);
    const tableName = tableMatch ? tableMatch[1] : 'TARGET_TABLE';
    
    const setIdx = upperSql.indexOf('SET');
    const whereIdx = upperSql.indexOf('WHERE');
    
    let setStr = '';
    let whereStr = '';
    
    if (setIdx !== -1) {
      const setEnd = whereIdx !== -1 ? whereIdx : cleanSql.length;
      setStr = cleanSql.substring(setIdx + 3, setEnd).trim();
    }
    if (whereIdx !== -1) {
      whereStr = cleanSql.substring(whereIdx + 5).trim();
    }
    
    const setPairs: any[] = [];
    if (setStr) {
      const parts = splitByTopLevelCommas(setStr);
      parts.forEach(part => {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
          const colName = part.substring(0, eqIdx).trim();
          const valExpr = part.substring(eqIdx + 1).trim();
          setPairs.push({
            column: colName,
            value: { type: 'column_ref', column: valExpr }
          });
        }
      });
    }
    
    return {
      type: 'update',
      table: { table: tableName },
      set: setPairs,
      where: whereStr ? { type: 'column_ref', column: whereStr } : null
    };
  }
  
  if (upperSql.startsWith('DELETE')) {
    const tableMatch = cleanSql.match(/DELETE\s+FROM\s+([A-Za-z0-9_".\u0400-\u04FFёЁ]+)/i);
    const tableName = tableMatch ? tableMatch[1] : 'TARGET_TABLE';
    
    const whereIdx = upperSql.indexOf('WHERE');
    let whereStr = '';
    if (whereIdx !== -1) {
      whereStr = cleanSql.substring(whereIdx + 5).trim();
    }
    
    return {
      type: 'delete',
      table: { table: tableName },
      where: whereStr ? { type: 'column_ref', column: whereStr } : null
    };
  }

  if (upperSql.startsWith('MERGE')) {
      const mergeMatch = cleanSql.match(/MERGE\s+INTO\s+([A-Za-z0-9_".\u0400-\u04FFёЁ]+)/i);
      const tableName = mergeMatch ? mergeMatch[1] : 'TARGET_TABLE';
      return {
          type: 'merge',
          table: { table: tableName },
          text: cleanSql
      };
  }
  
  return null;
}

export function transformNodeSqlParserUnion(ast: any): any {
  if (!ast) return ast;
  if (Array.isArray(ast)) return ast.map(transformNodeSqlParserUnion);
  
  // Добавлена поддержка ast.set_op (в нем хранится UNION ALL)
  if (ast.type === 'select' && (ast._next || ast.union || ast.set_op)) {
    const queries: any[] = [];
    const ops: string[] = [];
    
    let current = ast;
    while (current) {
      const { _next, union, set_op, ...rest } = current;
      queries.push(rest);
      
      if (set_op) {
        ops.push(String(set_op).toUpperCase());
      } else if (union) {
        const opType = typeof union === 'string' ? `UNION ${union.toUpperCase()}` : 'UNION';
        ops.push(opType);
      } else if (_next) {
        ops.push('UNION');
      }
      current = _next;
    }
    
    return {
      type: 'union',
      queries: queries.map(transformNodeSqlParserUnion),
      ops: ops
    };
  }
  
  if (ast.from && Array.isArray(ast.from)) {
    ast.from = ast.from.map((item: any) => {
      if (item.expr) {
        if (item.expr.ast) {
          item.expr.ast = transformNodeSqlParserUnion(item.expr.ast);
        } else if (item.expr.type === 'select' || item.expr.type === 'union') {
          item.expr = transformNodeSqlParserUnion(item.expr);
        }
      }
      return item;
    });
  }
  
  return ast;
}

function parseTableOrSubquery(str: string, dialect: string): any {
  str = str.trim();
  if (!str) return null;

  if (/^TABLE\s*\(/i.test(str)) {
    const openIdx = str.indexOf('(');
    const closeIdx = findClosingParenthesis(str, openIdx);
    
    if (closeIdx !== -1) {
      const innerCode = str.substring(openIdx + 1, closeIdx).trim();
      const remainder = str.substring(closeIdx + 1).trim();
      
      let alias: string | null = null;
      if (remainder) {
        const aliasMatch = remainder.match(/^(?:AS\s+)?(["'`]?[A-Za-z0-9_\u0400-\u04FFёЁ]+["'`]?)/i);
        if (aliasMatch) {
          alias = aliasMatch[1].replace(/^["'`]|["'`]$/g, '');
        }
      }
      
      return {
        table: innerCode, 
        as: alias,
        isTableFunction: true
      };
    }
  }

  if (str.startsWith('(')) {
    const closingIdx = findClosingParenthesis(str, 0);
    if (closingIdx !== -1) {
      const subquerySql = str.substring(1, closingIdx).trim();
      const afterSubquery = str.substring(closingIdx + 1).trim();

      const aliasMatch = afterSubquery.match(/^(?:AS\s+)?(["'`]?[A-Za-z0-9_\u0400-\u04FFёЁ]+["'`]?)/i);
      const alias = aliasMatch ? aliasMatch[1].replace(/^["'`]|["'`]$/g, '') : `subquery`;

      return {
        expr: {
          ast: parseSingleSqlToAst(subquerySql, dialect).ast
        },
        as: alias
      };
    }
  }

  const asRegex = /\s+AS\s+(["'`]?[A-Za-z0-9_\u0400-\u04FFёЁ]+["'`]?)/i;
  const match = str.match(asRegex);
  if (match) {
    const tableName = str.substring(0, match.index).trim();
    return {
      table: tableName,
      as: match[1].replace(/^["'`]|["'`]$/g, '')
    };
  }

  const spaceParts = str.split(/\s+/);
  if (spaceParts.length > 1) {
    const lastPart = spaceParts[spaceParts.length - 1];
    if (/^["'`]?[A-Za-z0-9_\u0400-\u04FFёЁ]+["'`]?$/.test(lastPart)) {
      const tableName = str.substring(0, str.lastIndexOf(lastPart)).trim();
      return {
        table: tableName,
        as: lastPart.replace(/^["'`]|["'`]$/g, '')
      };
    }
  }

  return { table: str, as: null };
}

function parseHeuristicFromAndJoins(fromBlock: string, dialect: string): any[] {
  const fromList: any[] = [];
  if (!fromBlock) return fromList;

  const commaParts = splitByTopLevelCommas(fromBlock);
  
  commaParts.forEach((commaPart, commaIdx) => {
    const joinRegex = /\b((?:GLOBAL\s+)?(?:LEFT\s+ARRAY\s+JOIN|ARRAY\s+JOIN|LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|LATERAL\s+JOIN|JOIN))\b/i;
    const parts = commaPart.split(joinRegex);
    
    const firstPart = parts[0].trim();
    const baseTable = parseTableOrSubquery(firstPart, dialect);
    
    if (baseTable) {
      if (commaIdx > 0) {
        baseTable.join = 'COMMA JOIN';
      }
      fromList.push(baseTable);
    }

    for (let i = 1; i < parts.length; i += 2) {
      const joinKeyword = String(parts[i] || '').trim().toUpperCase();
      const tableAndCondition = parts[i + 1]?.trim() || '';

      const onIndex = tableAndCondition.search(/\bON\b/i);
      const usingIndex = tableAndCondition.search(/\bUSING\b/i);

      let tablePart = tableAndCondition;
      let onCondition = '';

      let splitIndex = -1;
      let splitOffset = 0;
      if (onIndex !== -1 && (usingIndex === -1 || onIndex < usingIndex)) {
        splitIndex = onIndex;
        splitOffset = 2;
      } else if (usingIndex !== -1) {
        splitIndex = usingIndex;
        splitOffset = 5;
      }

      if (splitIndex !== -1) {
        tablePart = tableAndCondition.substring(0, splitIndex).trim();
        onCondition = tableAndCondition.substring(splitIndex + splitOffset).trim();
      }

      const joinTable = parseTableOrSubquery(tablePart, dialect);
      if (joinTable) {
        joinTable.join = joinKeyword;
        joinTable.on = onCondition ? { type: 'column_ref', column: onCondition } : null;
        fromList.push(joinTable);
      }
    }
  });

  return fromList;
}

function extractCtes(sql: string, dialect: string): { ctes: any[], mainSql: string } {
  const ctes: any[] = [];
  let workingSql = sql.trim();
  
  const withMatch = workingSql.match(/^\s*WITH\s+/i);
  if (!withMatch) {
    return { ctes, mainSql: workingSql };
  }

  workingSql = workingSql.substring(withMatch[0].length).trim();

  while (true) {
    const cteHeaderMatch = workingSql.match(/^([A-Za-z0-9_\u0400-\u04FFёЁ]+)(?:\s*\([^)]+\))?\s+AS\s*\(/i);
    if (!cteHeaderMatch) break;

    const cteName = cteHeaderMatch[1];
    const startIndex = cteHeaderMatch[0].length - 1;
    const closingIndex = findClosingParenthesis(workingSql, startIndex);
    
    if (closingIndex === -1) break;

    const cteBody = workingSql.substring(startIndex + 1, closingIndex).trim();
    const cteAst = parseSingleSqlToAst(cteBody, dialect).ast;
    ctes.push({
      name: cteName,
      ast: cteAst
    });

    workingSql = workingSql.substring(closingIndex + 1).trim();

    if (workingSql.startsWith(',')) {
      workingSql = workingSql.substring(1).trim();
    } else {
      break;
    }
  }

  return { ctes, mainSql: workingSql };
}

function parseHeuristicSelect(sql: string, dialect: string): any {
  const ast: any = {
    type: 'select', ctes: [], columns: [], from: [], prewhere: null, where: null,
    start_with: null, connect_by: null, groupby: null, having: null, orderby: null, limit: null
  };

  const { ctes, mainSql } = extractCtes(sql, dialect);
  ast.ctes = ctes;

  const lowerSql = mainSql.trim();

  const selectIdx = findTopLevelKeywordIndex(lowerSql, /^\bSELECT\b/i);
  const fromIdx = findTopLevelKeywordIndex(lowerSql, /^\bFROM\b/i);
  const prewhereIdx = findTopLevelKeywordIndex(lowerSql, /^\bPREWHERE\b/i);
  const whereIdx = findTopLevelKeywordIndex(lowerSql, /^\bWHERE\b/i);
  const startWithIdx = findTopLevelKeywordIndex(lowerSql, /^\bSTART\s+WITH\b/i);
  const connectByIdx = findTopLevelKeywordIndex(lowerSql, /^\bCONNECT\s+BY\b/i);
  const groupbyIdx = findTopLevelKeywordIndex(lowerSql, /^\bGROUP\s+BY\b/i);
  const havingIdx = findTopLevelKeywordIndex(lowerSql, /^\bHAVING\b/i);
  const orderbyIdx = findTopLevelKeywordIndex(lowerSql, /^\bORDER\s+BY\b/i); 
  const limitIdx = findTopLevelKeywordIndex(lowerSql, /^\bLIMIT\b/i);

  if (selectIdx === -1 && fromIdx === -1 && ctes.length === 0) {
    throw new Error("Not a SELECT query");
  }

  const getBlock = (start: number, end: number) => {
    if (start === -1) return '';
    const actualEnd = end === -1 ? lowerSql.length : end;
    return lowerSql.substring(start, actualEnd).trim();
  };

  const indices = [
    { type: 'select', idx: selectIdx }, { type: 'from', idx: fromIdx }, { type: 'prewhere', idx: prewhereIdx },
    { type: 'where', idx: whereIdx }, { type: 'start_with', idx: startWithIdx }, { type: 'connect_by', idx: connectByIdx },
    { type: 'groupby', idx: groupbyIdx }, { type: 'having', idx: havingIdx }, { type: 'orderby', idx: orderbyIdx },
    { type: 'limit', idx: limitIdx }
  ].filter(item => item.idx !== -1).sort((a, b) => a.idx - b.idx);

  const getNextIdx = (type: string) => {
    const currentPos = indices.findIndex(item => item.type === type);
    if (currentPos === -1 || currentPos === indices.length - 1) return -1;
    return indices[currentPos + 1].idx;
  };

  if (selectIdx !== -1) {
    const selectBlock = getBlock(selectIdx + 6, getNextIdx('select'));
    if (selectBlock.trim() === '*') {
      ast.columns = '*';
    } else {
      const colParts = splitByTopLevelCommas(selectBlock);
      ast.columns = colParts.map(parseHeuristicColumn);
    }
  }

  if (fromIdx !== -1) {
    const fromBlock = getBlock(fromIdx + 4, getNextIdx('from'));
    ast.from = parseHeuristicFromAndJoins(fromBlock, dialect);
  }

  if (prewhereIdx !== -1) {
    const prewhereBlock = getBlock(prewhereIdx + 8, getNextIdx('prewhere'));
    ast.prewhere = { type: 'column_ref', column: prewhereBlock };
  }

  if (whereIdx !== -1) {
    const whereBlock = getBlock(whereIdx + 5, getNextIdx('where'));
    ast.where = { type: 'column_ref', column: whereBlock };
  }

  if (startWithIdx !== -1) {
      const startWithBlock = getBlock(startWithIdx + 10, getNextIdx('start_with'));
      ast.start_with = { type: 'column_ref', column: startWithBlock };
  }

  if (connectByIdx !== -1) {
      const connectByBlock = getBlock(connectByIdx + 10, getNextIdx('connect_by'));
      ast.connect_by = { type: 'column_ref', column: connectByBlock };
  }

  if (groupbyIdx !== -1) {
    const groupbyBlock = getBlock(groupbyIdx + 8, getNextIdx('groupby'));
    const cols = splitByTopLevelCommas(groupbyBlock);
    ast.groupby = cols.map(c => ({ type: 'column_ref', column: c }));
  }

  if (havingIdx !== -1) {
    const havingBlock = getBlock(havingIdx + 6, getNextIdx('having'));
    ast.having = { type: 'column_ref', column: havingBlock };
  }

  if (orderbyIdx !== -1) {
    const orderbyBlock = getBlock(orderbyIdx + 8, getNextIdx('orderby'));
    const cols = splitByTopLevelCommas(orderbyBlock);
    ast.orderby = cols.map(c => {
      const parts = c.split(/\s+/);
      const isDesc = parts[parts.length - 1]?.toUpperCase() === 'DESC';
      const expr = isDesc ? c.replace(/\s+DESC/i, '') : c.replace(/\s+ASC/i, '');
      return { expr: { type: 'column_ref', column: expr.trim() }, type: isDesc ? 'DESC' : 'ASC' };
    });
  }

  if (limitIdx !== -1) {
    const limitBlock = getBlock(limitIdx + 5, getNextIdx('limit'));
    const parts = limitBlock.split(/\s*,|\s+OFFSET\s+/i);
    const limitVal = parts[0]?.trim() || '10';
    const offsetVal = parts[1]?.trim() || '0';
    ast.limit = {
      value: [ { type: 'number', value: parseInt(limitVal) || limitVal }, { type: 'number', value: parseInt(offsetVal) || offsetVal } ]
    };
  }

  return ast;
}

function parseHeuristicProcedure(sql: string, dialect: string): any {
  const ast: any = {
    type: 'procedure',
    name: 'Stored Procedure / Block',
    dialect: dialect,
    parameters: [],
    variables: [],
    steps: []
  };

  const nameMatch = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TYPE|TRIGGER)\s+(?:BODY\s+)?([A-Za-z0-9_.\u0400-\u04FFёЁ]+)/i);
  let headerEndIdx = 0;
  
  if (nameMatch) {
    ast.name = nameMatch[1];
    const firstParen = sql.indexOf('(');
    if (firstParen !== -1 && firstParen < sql.search(/\b(?:IS|AS|BEGIN|DECLARE)\b/i)) {
      const closingParen = findClosingParenthesis(sql, firstParen);
      if (closingParen !== -1) {
        const paramsStr = sql.substring(firstParen + 1, closingParen).trim();
        ast.parameters = paramsStr.split(',').map(p => p.trim()).filter(Boolean);
        headerEndIdx = closingParen + 1;
      }
    } else {
      headerEndIdx = nameMatch.index! + nameMatch[0].length;
    }
  }

  const tokens = tokenizeSql(sql);
  let declareStart = -1;
  let beginStart = -1;
  let endStart = -1;
  let blockDepth = 0;
  let lastWord = '';

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'word' && t.start >= headerEndIdx) {
      const upper = t.value.toUpperCase();
      
      if ((upper === 'IS' || upper === 'AS' || upper === 'DECLARE') && declareStart === -1 && beginStart === -1) {
        declareStart = t.end;
      } else if (upper === 'BEGIN') {
        if (beginStart === -1) beginStart = t.end;
        blockDepth++;
      } else if (upper === 'CASE' || upper === 'LOOP' || upper === 'IF') {
        if (lastWord !== 'END') blockDepth++; 
      } else if (upper === 'END') {
        blockDepth = Math.max(0, blockDepth - 1);
        if (blockDepth === 0 && beginStart !== -1) {
          endStart = t.start;
        }
      }
      lastWord = upper;
    }
  }

  let varsSection = '';
  let bodyStr = sql;

  if (beginStart !== -1) {
    if (declareStart !== -1) {
      varsSection = sql.substring(declareStart, beginStart - 5).trim(); 
    }
    bodyStr = sql.substring(beginStart, endStart !== -1 ? endStart : sql.length).trim();
  } else if (declareStart !== -1) {
    varsSection = sql.substring(declareStart).trim();
    bodyStr = '';
  }

  let rawSteps: string[] = [];

  if (varsSection) {
    const varStatements = splitQueries(varsSection);
    varStatements.forEach(v => {
      const vTokens = tokenizeSql(v);
      const firstWord = vTokens.find(t => t.type === 'word')?.value?.toUpperCase();
      
      if (firstWord === 'CURSOR') {
        rawSteps.push(v);
      } else if (v && !v.toUpperCase().includes('BEGIN') && !v.toUpperCase().includes('PROCEDURE')) {
        ast.variables.push(v);
      }
    });
  }

  rawSteps.push(...splitProcedureStatements(bodyStr));
  
  ast.steps = rawSteps
    .map((step, idx) => {
      const text = step.trim();
      if (!text) return null;

      let stepType = 'statement';
      let parsedQuery: any = null;
      let title = `Step ${idx + 1}`;

      const stepTokens = tokenizeSql(text);
      const firstWord = stepTokens.find(t => t.type === 'word')?.value?.toUpperCase();

      if (firstWord === 'SELECT' || firstWord === 'WITH') {
        stepType = 'select_step';
        parsedQuery = parseSingleSqlToAst(text, dialect).ast;
      } else if (firstWord === 'UPDATE') {
        stepType = 'update_step';
        parsedQuery = parseSingleSqlToAst(text, dialect).ast;
      } else if (firstWord === 'INSERT') {
        stepType = 'insert_step';
        parsedQuery = parseSingleSqlToAst(text, dialect).ast;
      } else if (firstWord === 'DELETE') {
        stepType = 'delete_step';
        parsedQuery = parseSingleSqlToAst(text, dialect).ast;
      } else if (firstWord === 'MERGE') {
        stepType = 'merge_step';
        parsedQuery = parseSingleSqlToAst(text, dialect).ast;
      } else if (firstWord === 'CURSOR') {
        stepType = 'select_step';
        title = 'CURSOR Declaration';
        const isOrForToken = stepTokens.find(t => t.type === 'word' && (String(t.value || '').toUpperCase() === 'IS' || String(t.value || '').toUpperCase() === 'FOR'));
        if (isOrForToken) {
           const queryPart = text.substring(isOrForToken.end).trim();
           parsedQuery = parseSingleSqlToAst(queryPart, dialect).ast;
        }
      } else if (firstWord === 'IF' || firstWord === 'ELSIF') {
        stepType = 'conditional_step';
        title = 'IF Condition';
      } else if (firstWord === 'FOR' || firstWord === 'WHILE' || firstWord === 'LOOP') {
        stepType = 'loop_step';
        title = 'Loop / Iteration';
      } else if (firstWord === 'EXCEPTION') {
        stepType = 'exception_block';
        title = 'Exception Handling';
      } else if (firstWord === 'EXECUTE') {
        stepType = 'statement';
        title = 'Execute Immediate';
      } else if (firstWord === 'FUNCTION' || firstWord === 'PROCEDURE') {
        stepType = 'procedure_step';
        title = `${firstWord} Block`;
        parsedQuery = parseSingleSqlToAst(text, dialect).ast;
      } else if (firstWord === 'RETURN' || firstWord === 'END' || firstWord === 'PIPE' || firstWord === 'EXIT' || firstWord === 'CONTINUE') {
        stepType = 'control_step';
        title = `Control Flow: ${firstWord}`;
      } else {
        const hasAssignment = stepTokens.some(t => t.type === 'symbol' && (t.value === '=' || t.value === ':'));
        if (hasAssignment) {
           stepType = 'assignment_step';
           title = 'Variable Assignment';
        }
      }

      return {
        id: `step_${idx}`,
        title: title,
        type: stepType,
        text: text,
        parsedQuery: parsedQuery
      };
    })
    .filter(Boolean);

  return ast;
}

export function parseSingleSqlToAst(sql: string, dialect = 'PostgreSQL'): any {
  const cleanSql = sql.trim(); 
  const upperSql = cleanSql.toUpperCase();
  const isProcedure = /^\s*(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TYPE|TRIGGER)|PROCEDURE\b|FUNCTION\b|DECLARE\b|BEGIN\b)/i.test(upperSql);
  if (isProcedure) {
    return { ast: parseHeuristicProcedure(cleanSql, dialect), error: null };
  }

  const truncateMatch = cleanSql.match(/^\s*TRUNCATE\s+(?:TABLE\s+)?([A-Za-z0-9_".\u0400-\u04FFёЁ\s,]+)/i);
  if (truncateMatch) {
    const rawTables = truncateMatch[1].split(',').map(t => t.trim()).filter(Boolean);
    const tables = rawTables.map(tableName => ({ table: tableName }));
    return {
      ast: { type: 'truncate', table: tables }, error: null
    };
  }

  const refreshMatch = cleanSql.match(/^\s*REFRESH\s+MATERIALIZED\s+VIEW\s+(?:CONCURRENTLY\s+)?([A-Za-z0-9_".\u0400-\u04FFёЁ\s]+)/i);
  if (refreshMatch) {
    return {
      ast: { type: 'refresh_view', table: [{ table: refreshMatch[1].trim() }] }, error: null
    };
  }

  const unionResult = splitTopLevelUnion(cleanSql);
  if (unionResult) {
    const asts = unionResult.parts.map(part => {
      const res = parseSingleSqlToAst(part, dialect);
      return res.ast;
    }).filter(Boolean);

    return {
      ast: { type: 'union', queries: asts, ops: unionResult.ops }, error: null
    };
  }

  const hasCte = /^\s*WITH\b/i.test(cleanSql);
  if (hasCte) {
    try {
      return { ast: parseHeuristicSelect(cleanSql, dialect), error: null };
    } catch (e: any) {
      return { ast: null, error: e.message || String(e) };
    }
  }

  const isDml = /^\s*(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|MERGE\s+INTO)\b/i.test(cleanSql);

  let parserDialect = 'postgresql';
  const lowerDialect = (dialect || 'PostgreSQL').toLowerCase();
  if (lowerDialect.includes('postgres')) {
    parserDialect = 'postgresql';
  } else if (lowerDialect.includes('oracle') || lowerDialect.includes('pl') || lowerDialect.includes('clickhouse') || lowerDialect.includes('duckdb')) {
    parserDialect = 'postgresql';
  } else {
    parserDialect = lowerDialect;
  }

  try {
    let ast = parser.astify(cleanSql, { database: parserDialect });
    if (ast) {
      ast = transformNodeSqlParserUnion(ast);
      return { ast, error: null };
    }
  } catch (err: any) {}

  if (isDml) {
    try {
      const ast = parseHeuristicDml(cleanSql, dialect);
      if (ast) return { ast, error: null };
    } catch (err: any) {}
  }

  try {
    const ast = parseHeuristicSelect(cleanSql, dialect);
    return { ast, error: null };
  } catch (err: any) {
    return { ast: { type: 'statement', text: cleanSql }, error: err.message || String(err) };
  }
}

export function parseSqlToAst(sql: string, dialect = 'PostgreSQL'): any {
  const cleanSql = stripCommentsSafely(sql).trim();

  const queries = splitQueries(cleanSql);

  if (queries.length > 1) {
    const asts: any[] = [];
    for (const q of queries) {
      const res = parseSingleSqlToAst(q, dialect);
      if (res.ast) {
        asts.push(res.ast);
      }
    }
    return {
      ast: { type: 'multi_query', queries: asts },
      error: null
    };
  }

  return parseSingleSqlToAst(cleanSql, dialect);
}

// --- 6. GRAPH VISUALIZATION ENGINE ---
export interface GraphContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cteOutputIds: Record<string, string>;
  options: { 
    showSort?: boolean; 
    showLimit?: boolean; 
    expandedQueries?: Set<string>; 
    onToggleExpand?: (id: string) => void;
  };
}

function addEdge(ctx: GraphContext, source: string, target: string, label?: string, style?: any) {
  if (!source || !target) return;
  ctx.edges.push({
    id: `edge_${source}_to_${target}_${Math.random().toString(36).substring(2, 7)}`,
    source, target, label, animated: true, style
  });
}

function processNestedQueries(text: string, targetNodeId: string, prefix: string, dialect: string, ctx: GraphContext) {
  const nested = extractSubqueriesFromString(text);
  nested.forEach((item, idx) => {
    try {
      const subPrefix = `${prefix}subq_${idx}_`;
      const parsedSub = parseSingleSqlToAst(item.subquerySql, dialect).ast;
      const subOutputId = buildDataPipeline(parsedSub, subPrefix, dialect, ctx);
      if (subOutputId) {
        addEdge(ctx, subOutputId, targetNodeId, 'scalar / constraint', { strokeDasharray: '4 4' });
      }
    } catch (e) {}
  });
}

function buildDataPipeline(ast: any, prefix: string, dialect: string, ctx: GraphContext): string {
  if (!ast) return '';
  if (Array.isArray(ast)) ast = ast[0];

  const queryType = ast.type || 'select';

  // 1. CTEs (Common Table Expressions)
  const ctesList = ast.ctes || ast.with || [];
  if (ctesList.length > 0) {
    ctesList.forEach((cte: any) => {
      let cteName = cte.name;
      if (cteName && typeof cteName === 'object' && cteName.value) {
        cteName = cteName.value;
      }
      cteName = String(cteName || `CTE_${Math.random().toString(36).substring(2, 7)}`).replace(/^["'`]|["'`]$/g, '').trim();
      
      const cteAst = cte.ast || cte.stmt; 
      
      if (cteAst) {
        const ctePrefix = `${prefix}cte_${cteName}_`;
        const cteOutputId = buildDataPipeline(cteAst, ctePrefix, dialect, ctx);
        
        const cteWrapId = `${prefix}cte_wrap_${cteName}`;
        ctx.nodes.push({
          id: cteWrapId, type: 'tableNode',
          data: { label: cteName, title: 'CTE (With Statement)', isSubquery: true }, position: { x: 0, y: 0 }
        });
        
        addEdge(ctx, cteOutputId, cteWrapId, 'defines CTE', { strokeDasharray: '4 4' });
        
        ctx.cteOutputIds[cteName.toLowerCase()] = cteWrapId;
      }
    });
  }

// 2. UNION Processing
  if (queryType === 'union') {
    let currentUnionOutputId = '';
    
    ast.queries.forEach((qAst: any, qIdx: number) => {
      const subOut = buildDataPipeline(qAst, `${prefix}union_q${qIdx}_`, dialect, ctx);
      
      if (qIdx === 0) {
        currentUnionOutputId = subOut;
      } else {
        const op = ast.ops[qIdx - 1] || 'UNION';
        const unionStepId = `${prefix}union_step_${qIdx}`;
        
        // Оставляем тип joinNode, но передаем пустую строку в condition
        // Это скроет или сделает блок "ON" пустым, сохранив родной компонент
        ctx.nodes.push({ 
          id: unionStepId, 
          type: 'joinNode', 
          data: { 
            joinType: String(op || 'UNION').toUpperCase(), 
            condition: '' 
          }, 
          position: { x: 0, y: 0 }
        });
        
        addEdge(ctx, currentUnionOutputId, unionStepId, 'top set');
        addEdge(ctx, subOut, unionStepId, 'bottom set');
        
        currentUnionOutputId = unionStepId;
      }
    });
    return currentUnionOutputId;
  }

  // 3. DML / Procedures
  if (['insert', 'update', 'delete', 'merge', 'truncate', 'refresh_view'].includes(queryType)) {
    const targetTables = ast.table ? (Array.isArray(ast.table) ? ast.table : [ast.table]) : [{ table: 'TARGET_TABLE' }];
    const targetIds: string[] = [];
    
    targetTables.forEach((t: any, tIdx: number) => {
      const tId = `${prefix}target_${tIdx}`;
      ctx.nodes.push({ id: tId, type: 'tableNode', data: { label: t.table || 'TARGET', title: `Target (${String(queryType || '').toUpperCase()})` }, position: { x: 0, y: 0 }});
      targetIds.push(tId);
    });

    let currentInputId = targetIds[0];

    if (queryType === 'insert') {
      if (ast.values && (ast.values.type === 'select' || ast.values.type === 'union')) {
        const srcId = buildDataPipeline(ast.values, `${prefix}ins_src_`, dialect, ctx);
        targetIds.forEach(tId => addEdge(ctx, srcId, tId, 'INSERT INTO'));
      } else {
        const srcId = `${prefix}values_src`;
        ctx.nodes.push({ id: srcId, type: 'constantNode', data: { title: 'VALUES Source' }, position: { x: 0, y: 0 }});
        targetIds.forEach(tId => addEdge(ctx, srcId, tId, 'INSERT INTO'));
      }
    } else if (queryType === 'update' || queryType === 'delete') {
       if (ast.where) {
          const filterId = `${prefix}dml_where`;
          const cond = formatExpr(ast.where);
          const condColumns = splitConditions(cond); // Передача строк

          ctx.nodes.push({ id: filterId, type: 'filterNode', data: { title: 'WHERE', condition: cond, columns: condColumns }, position: { x: 0, y: 0 }});
          targetIds.forEach(tId => addEdge(ctx, tId, filterId, 'reads from'));
          processNestedQueries(cond, filterId, `${prefix}dml_`, dialect, ctx);
          currentInputId = filterId;
          
          if (queryType === 'update') {
            const updateActionId = `${prefix}update_action`;
            ctx.nodes.push({ id: updateActionId, type: 'filterNode', data: { title: 'SET', iconType: 'edit' }, position: { x: 0, y: 0 }});
            addEdge(ctx, currentInputId, updateActionId);
            currentInputId = updateActionId;
          }
       }
    }

    const resId = `${prefix}dml_result`;
    ctx.nodes.push({ id: resId, type: 'resultNode', data: { title: `Operation: ${String(queryType || '').toUpperCase()}` }, position: { x: 0, y: 0 }});
    addEdge(ctx, currentInputId, resId);
    return resId;
  }

  // 3.5 Fallback for Raw Statements & Unparsed Blocks
  if (['statement', 'conditional_step', 'assignment_step', 'loop_step', 'exception_block'].includes(queryType)) {
    const stmtId = `${prefix}${queryType}`;
    ctx.nodes.push({ 
      id: stmtId, 
      type: 'filterNode', 
      data: { 
        title: String(queryType || '').toUpperCase().replace('_', ' '), 
        condition: ast.text || 'Raw Query Block' 
      }, 
      position: { x: 0, y: 0 }
    });
    return stmtId;
  }
  
  // 4. MAIN SELECT PIPELINE
  let currentOutputId = '';

  // 4.1 FROM & JOINS
  if (ast.from && ast.from.length > 0) {
    const fromIds: string[] = [];
    
    ast.from.forEach((fromItem: any, idx: number) => {
      let srcId = '';
      
      let subqueryAst = null;
      if (fromItem.expr) {
        if (fromItem.expr.ast) {
          subqueryAst = fromItem.expr.ast;
        } else if (fromItem.expr.type === 'select' || fromItem.expr.type === 'union') {
          subqueryAst = fromItem.expr;
        }
      }
      
      if (subqueryAst) {
        srcId = buildDataPipeline(subqueryAst, `${prefix}from_${idx}_`, dialect, ctx);
        const wrapperId = `${prefix}from_wrap_${idx}`;
        ctx.nodes.push({ id: wrapperId, type: 'tableNode', data: { label: fromItem.as || 'Subquery', isSubquery: true }, position: { x: 0, y: 0 }});
        addEdge(ctx, srcId, wrapperId, 'derived table', { strokeDasharray: '4 4' });
        srcId = wrapperId;
      } else {
        let tName = fromItem.table;
        if (tName && typeof tName === 'object' && tName.value) tName = tName.value;
        tName = String(tName || 'UNKNOWN').replace(/^["'`]|["'`]$/g, '').trim();
        
        const cteId = ctx.cteOutputIds[tName.toLowerCase()];
        
        if (cteId) {
          srcId = cteId;
        } else {
          srcId = `${prefix}base_table_${idx}`;
          ctx.nodes.push({ id: srcId, type: 'tableNode', data: { label: tName, alias: fromItem.as }, position: { x: 0, y: 0 }});
        }
      }
      
      if (idx === 0) {
        fromIds.push(srcId);
        currentOutputId = srcId;
      } else {
        const joinId = `${prefix}join_${idx}`;
        
        let joinTypeStr = fromItem.join ? String(fromItem.join).toUpperCase() : 'COMMA JOIN';
        
        if (joinTypeStr === 'INNER JOIN' && !fromItem.on) {
          joinTypeStr = 'COMMA JOIN';
        }
        
        const conditionStr = fromItem.on ? formatExpr(fromItem.on) : 'NO CONDITION (CROSS)';
        
        ctx.nodes.push({ 
          id: joinId, 
          type: 'joinNode', 
          data: { 
            joinType: joinTypeStr, 
            condition: conditionStr 
          }, 
          position: { x: 0, y: 0 }
        });
        
        addEdge(ctx, currentOutputId, joinId, 'left');
        addEdge(ctx, srcId, joinId, 'right');
        currentOutputId = joinId;
      }
    });
  } else {
    currentOutputId = `${prefix}const_src`;
    ctx.nodes.push({ id: currentOutputId, type: 'constantNode', data: { title: 'Constant Source' }, position: { x: 0, y: 0 }});
  }

  // 4.2 WHERE / PREWHERE Filters
  if (ast.prewhere || ast.where) {
    const filters = [ { t: 'PREWHERE', val: ast.prewhere }, { t: 'WHERE', val: ast.where }].filter(f => f.val);
    filters.forEach(f => {
      const fId = `${prefix}filter_${f.t.toLowerCase()}`;
      const condText = formatExpr(f.val);
      const condColumns = splitConditions(condText); // Передаем разбитый массив в свойство columns
      
      // Тип остается filterNode, но передаются columns для вашего UI
      ctx.nodes.push({ id: fId, type: 'filterNode', data: { title: f.t, condition: condText, columns: condColumns }, position: { x: 0, y: 0 }});
      addEdge(ctx, currentOutputId, fId);
      processNestedQueries(condText, fId, `${prefix}${f.t}_`, dialect, ctx);
      currentOutputId = fId;
    });
  }

  // 4.3 Hierarchical
  if (ast.start_with || ast.connect_by) {
    const hId = `${prefix}hierarchy`;
    ctx.nodes.push({ id: hId, type: 'filterNode', data: { title: 'Hierarchical Query' }, position: { x: 0, y: 0 }});
    addEdge(ctx, currentOutputId, hId);
    currentOutputId = hId;
  }

  // 4.4 GROUP BY
  if (ast.groupby && ast.groupby.length > 0) {
    const gId = `${prefix}groupby`;
    ctx.nodes.push({ id: gId, type: 'groupByNode', data: { columns: ast.groupby.map((c: any) => formatExpr(c)).join(', ') }, position: { x: 0, y: 0 }});
    addEdge(ctx, currentOutputId, gId);
    currentOutputId = gId;
  }

  // 4.5 HAVING
  if (ast.having) {
    const hId = `${prefix}having`;
    const condText = formatExpr(ast.having);
    const condColumns = splitConditions(condText); // Передача строк

    ctx.nodes.push({ id: hId, type: 'havingNode', data: { condition: condText, columns: condColumns }, position: { x: 0, y: 0 }});
    addEdge(ctx, currentOutputId, hId);
    processNestedQueries(condText, hId, `${prefix}having_`, dialect, ctx);
    currentOutputId = hId;
  }

  // 4.6 ORDER BY & LIMIT
  if (ast.orderby && ctx.options.showSort !== false) {
    const oId = `${prefix}orderby`;
    ctx.nodes.push({ id: oId, type: 'sortNode', data: { details: ast.orderby.map((i: any) => `${formatExpr(i.expr)} ${i.type || 'ASC'}`).join(', ') }, position: { x: 0, y: 0 }});
    addEdge(ctx, currentOutputId, oId);
    currentOutputId = oId;
  }
  if (ast.limit && ctx.options.showLimit !== false) {
    const lId = `${prefix}limit`;
    const lVal = ast.limit.value?.[0]?.value || '0';
    ctx.nodes.push({ id: lId, type: 'limitNode', data: { details: `Limit: ${lVal}` }, position: { x: 0, y: 0 }});
    addEdge(ctx, currentOutputId, lId);
    currentOutputId = lId;
  }

  // 4.7 PROJECTION (SELECT Columns)
  const resId = `${prefix}projection`;
  const resultCols = ast.columns === '*' ? [{ name: '*' }] : (Array.isArray(ast.columns) ? ast.columns.map((col: any) => ({ name: formatExpr(col.expr), alias: col.as })) : [{ name: '*' }]);
  
  ctx.nodes.push({ id: resId, type: 'resultNode', data: { title: 'Projection', columns: resultCols }, position: { x: 0, y: 0 }});
  addEdge(ctx, currentOutputId, resId);

  if (Array.isArray(ast.columns)) {
    ast.columns.forEach((col: any, cIdx: number) => {
       const colText = formatExpr(col.expr);
       processNestedQueries(colText, resId, `${prefix}proj_${cIdx}_`, dialect, ctx);
    });
  }

  return resId;
}

export function astToGraph(
  ast: any,
  prefix = 'main_',
  dialect = 'PostgreSQL',
  cteTableNodeIds: Record<string, string> = {},
  options: { showSort?: boolean; showLimit?: boolean; expandedQueries?: Set<string>; onToggleExpand?: (id: string) => void } = { showSort: true, showLimit: true }
): { nodes: GraphNode[]; edges: GraphEdge[]; outputId: string } {
  
  const ctx: GraphContext = { nodes: [], edges: [], cteOutputIds: { ...cteTableNodeIds }, options };

  if (!ast) return { nodes: ctx.nodes, edges: ctx.edges, outputId: '' };

  if (ast.type === 'multi_query') {
    let lastId = '';
    ast.queries.forEach((qAst: any, qIdx: number) => {
      const qId = `${prefix}q_${qIdx}`;
      if (!options.expandedQueries?.has(qId)) {
        let snippet = qAst.type || 'STATEMENT';
        if (qAst.type === 'select') snippet = 'SELECT ...';
        if (qAst.type === 'update') snippet = 'UPDATE ...';
        
        ctx.nodes.push({
          id: qId, type: 'queryGroupNode',
          data: { title: `Query ${qIdx + 1}`, queryText: snippet, queryId: qId, onToggle: options.onToggleExpand },
          position: { x: 0, y: 0 }
        });
        if (lastId) addEdge(ctx, lastId, qId, 'Next', { strokeDasharray: '5 5' });
        lastId = qId;
      } else {
        const outId = buildDataPipeline(qAst, `${prefix}q${qIdx}_`, dialect, ctx);
        
        const collapseId = `${qId}_collapse`;
        ctx.nodes.push({
          id: collapseId, type: 'collapseNode',
          data: { title: `Hide Query ${qIdx + 1}`, queryId: qId, onToggle: options.onToggleExpand },
          position: { x: 0, y: 0 }
        });
        
        if (lastId) addEdge(ctx, lastId, collapseId, 'Next', { strokeDasharray: '5 5' });
        
        const firstNode = ctx.nodes.find(n => n.id.startsWith(`${prefix}q${qIdx}_`));
        if (firstNode) addEdge(ctx, collapseId, firstNode.id);
        
        lastId = outId || collapseId;
      }
    });
    return { nodes: ctx.nodes, edges: ctx.edges, outputId: lastId };
  }

  if (ast.type === 'procedure') {
     const procId = `${prefix}proc`;
     ctx.nodes.push({ id: procId, type: 'tableNode', data: { label: ast.name, title: 'PROCEDURE' }, position: { x: 0, y: 0 }});
     let lastStepId = procId;
     
     ast.steps.forEach((step: any, sIdx: number) => {
        if (step.parsedQuery) {
           const stepOut = buildDataPipeline(step.parsedQuery, `${prefix}pstep_${sIdx}_`, dialect, ctx);
           addEdge(ctx, lastStepId, stepOut, 'executes');
           lastStepId = stepOut;
        } else {
           const sId = `${prefix}pstep_${sIdx}`;
           ctx.nodes.push({ id: sId, type: 'filterNode', data: { title: step.title, condition: step.text }, position: { x: 0, y: 0 }});
           addEdge(ctx, lastStepId, sId, 'executes');
           lastStepId = sId;
        }
     });

     const cleanNodes = ctx.nodes.map(n => {
       const data = n.data || {};
       return {
         id: n.id,
         type: n.type,
         position: n.position || { x: 0, y: 0 },
         data: {
           label: data.label,
           title: data.title,
           tableName: data.tableName,
           alias: data.alias,
           condition: data.condition,
           joinType: data.joinType,
           columns: data.columns,
           details: data.details,
           queryText: data.queryText,
           queryId: data.queryId,
           isSubquery: data.isSubquery,
           subqueryTables: data.subqueryTables,
           onToggle: data.onToggle
         }
       };
     });

     const cleanEdges = ctx.edges.map(e => ({
       id: e.id,
       source: e.source,
       target: e.target,
       label: e.label,
       type: e.type,
       animated: e.animated,
       style: e.style
     }));

     return { nodes: cleanNodes, edges: cleanEdges, outputId: lastStepId };
  }

  const finalId = buildDataPipeline(ast, prefix, dialect, ctx);

  const cleanNodes = ctx.nodes.map(n => {
    const data = n.data || {};
    return {
      id: n.id,
      type: n.type,
      position: n.position || { x: 0, y: 0 },
      data: {
        label: data.label,
        title: data.title,
        tableName: data.tableName,
        alias: data.alias,
        condition: data.condition,
        joinType: data.joinType,
        columns: data.columns,
        details: data.details,
        queryText: data.queryText,
        queryId: data.queryId,
        isSubquery: data.isSubquery,
        subqueryTables: data.subqueryTables,
        onToggle: data.onToggle
      }
    };
  });

  const cleanEdges = ctx.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: e.type,
    animated: e.animated,
    style: e.style
  }));

  return { nodes: cleanNodes, edges: cleanEdges, outputId: finalId };
}

// Dagre layout cache to prevent recalculations when topology hasn't changed
const layoutPositionCache = new Map<string, Record<string, { x: number; y: number }>>();
const MAX_LAYOUT_CACHE_SIZE = 50;

export function getLayoutedElements(nodes: GraphNode[], edges: GraphEdge[], direction = 'LR') {
  const isHorizontal = direction === 'LR';

  // Build topology key based on node IDs, types, edges, and direction
  const nodeKey = nodes.map(n => `${n.id}:${n.type}`).join('|');
  const edgeKey = edges.map(e => `${e.source}->${e.target}`).join('|');
  const topologyKey = `${direction}_${nodeKey}_${edgeKey}`;

  const cachedPositions = layoutPositionCache.get(topologyKey);

  const getNodeDimensions = (node: GraphNode) => {
    let width = 256; // Tailwind w-64
    let height = 90;

    if (['resultNode', 'filterNode', 'havingNode'].includes(node.type)) {
      const rows = node.data?.columns?.length || 1;
      height = Math.min(280, 70 + rows * 45); 
    } else if (node.type === 'tableNode') {
      const rows = node.data?.columns?.length || 1;
      height = Math.min(250, 90 + rows * 30);
    } else if (['limitNode', 'sortNode'].includes(node.type)) {
      height = 70;
    } else if (node.type === 'joinNode') {
      height = 100;
    }
    
    return { width, height };
  };

  if (cachedPositions) {
    const newNodes = nodes.map((node) => {
      const pos = cachedPositions[node.id] || node.position || { x: 0, y: 0 };
      return {
        ...node,
        targetPosition: isHorizontal ? 'left' as const : 'top' as const,
        sourcePosition: isHorizontal ? 'right' as const : 'bottom' as const,
        position: pos
      };
    });
    return { nodes: newNodes, edges };
  }
  
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({ 
    rankdir: direction, 
    nodesep: 30,
    ranksep: 80, 
    ranker: 'tight-tree' 
  });

  nodes.forEach((node) => {
    const { width, height } = getNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newPositions: Record<string, { x: number; y: number }> = {};

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) return node;

    const { width, height } = getNodeDimensions(node);
    const pos = {
      x: nodeWithPosition.x - width / 2,
      y: nodeWithPosition.y - height / 2,
    };
    newPositions[node.id] = pos;
    
    return {
      ...node,
      targetPosition: isHorizontal ? 'left' as const : 'top' as const,
      sourcePosition: isHorizontal ? 'right' as const : 'bottom' as const,
      position: pos,
    };
  });

  if (layoutPositionCache.size >= MAX_LAYOUT_CACHE_SIZE) {
    const firstKey = layoutPositionCache.keys().next().value;
    if (firstKey) layoutPositionCache.delete(firstKey);
  }
  layoutPositionCache.set(topologyKey, newPositions);

  return { nodes: newNodes, edges };
}
