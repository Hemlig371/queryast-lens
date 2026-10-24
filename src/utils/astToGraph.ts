import pkg from 'node-sql-parser';
const { Parser } = pkg;
import { getNodeDimensions } from './graphNodeSize';
import { layoutTreeBlock, shiftRoute } from './treeLayout';
import type { RoutedEdge } from './edgePath';
import {
  pickJoinParent,
  qualifiersIn,
  firstKnownQualifier,
  joinEdgeLabel,
  columnsByAlias,
  conditionChipTexts,
  countSources,
} from './joinTree';

export interface GraphNode {
  id: string;
  type: string;
  data: any;
  position: { x: number; y: number };
  // Заполняются раскладкой
  targetPosition?: 'left' | 'right' | 'top' | 'bottom';
  sourcePosition?: 'left' | 'right' | 'top' | 'bottom';
  className?: string;
  zIndex?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  label?: string;
  style?: any;
  type?: string;
  data?: any;
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

    // «#» — комментарий MySQL, но не начало операторов PostgreSQL «#>» и «#>>»
    if ((char === '-' && nextChar === '-') || (char === '#' && nextChar !== '>')) {
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

// --- Оконные функции: форма AST у node-sql-parser (over.as_window_specification.window_specification) и упрощённая (over.partitionby) ---

function formatFrameBody(e: any): string {
  if (e === null || e === undefined) return '';
  if (typeof e === 'string') return e.toUpperCase();
  if (typeof e === 'number') return String(e);
  if (e.type === 'origin') return String(e.value ?? '').toUpperCase();
  if (e.type === 'binary_expr' && /^between$/i.test(String(e.operator))) {
    const right = e.right && Array.isArray(e.right.value) ? e.right.value.map(formatFrameBody).join(' AND ') : formatFrameBody(e.right);
    return `BETWEEN ${formatFrameBody(e.left)} AND ${right}`;
  }
  if (e.type === 'expr_list' && Array.isArray(e.value)) return e.value.map(formatFrameBody).join(' AND ');
  if (e.type === 'binary_expr') return `${formatFrameBody(e.left)} ${String(e.operator ?? '').toUpperCase()} ${formatFrameBody(e.right)}`.trim();
  return formatExpr(e);
}

function formatFrame(f: any): string {
  if (!f) return '';
  if (typeof f === 'string') return f.toUpperCase();
  const kind = typeof f.type === 'string' && /^(rows|range|groups)$/i.test(f.type) ? `${f.type.toUpperCase()} ` : '';
  return `${kind}${formatFrameBody(f.expr !== undefined ? f.expr : f)}`.trim();
}

/** Текст « OVER (...)» или « OVER w» для окна любой из форм AST. */
function formatOver(over: any): string {
  if (!over) return '';
  if (typeof over === 'string') return ` OVER ${over}`;
  const spec0 = over.as_window_specification !== undefined ? over.as_window_specification : over;
  if (typeof spec0 === 'string') return ` OVER ${spec0}`;
  const spec = spec0 && spec0.window_specification ? spec0.window_specification : spec0;
  if (typeof spec === 'string') return ` OVER ${spec}`;
  const partitionby = spec?.partitionby ?? over.partitionby;
  const orderby = spec?.orderby ?? over.orderby;
  const frame = spec?.window_frame_clause ?? spec?.window_frame ?? over.window_frame_clause ?? over.window_frame;
  const name = typeof spec?.name === 'string' ? spec.name : '';
  const partitionStr = partitionby && (!Array.isArray(partitionby) || partitionby.length > 0)
    ? 'PARTITION BY ' + (Array.isArray(partitionby) ? partitionby.map(formatExpr).join(', ') : formatExpr(partitionby)) : '';
  const orderStr = orderby && (!Array.isArray(orderby) || orderby.length > 0)
    ? 'ORDER BY ' + (Array.isArray(orderby) ? orderby.map((o: any) => {
        const oExpr = formatExpr(o.expr !== undefined ? o.expr : o);
        const oType = typeof o.type === 'string' && /^(asc|desc)$/i.test(o.type) ? ` ${o.type.toUpperCase()}` : '';
        return oExpr + oType;
      }).join(', ') : formatExpr(orderby)) : '';
  const frameStr = formatFrame(frame);
  return ` OVER (${[name, partitionStr, orderStr, frameStr].filter(Boolean).join(' ')})`;
}

export function formatExpr(expr: any): string {
  if (expr === null || expr === undefined) return '';
  if (typeof expr === 'string') return expr;
  if (typeof expr === 'number') return String(expr);
  if (typeof expr === 'boolean') return expr ? 'TRUE' : 'FALSE';

  if (expr.ast !== undefined) return formatExpr(expr.ast);
  if (expr.expr !== undefined) return formatExpr(expr.expr);
  if (Array.isArray(expr)) return expr.map(formatExpr).join(', ');

  const overStr = expr && expr.over ? formatOver(expr.over) : '';

  let filterStr = '';
  if (expr && expr.filter) {
     filterStr = ` FILTER (WHERE ${formatExpr(expr.filter)})`;
  }

  if (expr.type === 'select' || expr.type === 'union') {
    try {
      // sqlify оборачивает имена в `…`; для чтения и повторного разбора кавычки не нужны
      return `(${parser.sqlify(expr).replace(/`([^`]+)`/g, (m: string, id: string) => (/^[\w$\u0400-\u04FF]+$/.test(id) ? id : m))})`;
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
    case 'window_func': {
      const wName = typeof expr.name === 'object' ? formatExpr(expr.name) : expr.name;
      const wArgs = expr.args ? formatExpr(expr.args) : '';
      const wNulls = typeof expr.consider_nulls === 'string' ? ` ${expr.consider_nulls.toUpperCase()}` : '';
      return `${wName}(${wArgs}${wNulls})${filterStr}${overStr}`;
    }
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
  let pendingBetween = false; // «x BETWEEN a AND b»: этот AND — часть условия, а не разделитель

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'symbol') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
    } else if (t.type === 'word' && parenDepth === 0) {
      const upper = String(t.value || '').toUpperCase();
      if (upper === 'BETWEEN') { pendingBetween = true; continue; }
      if (upper === 'AND' && pendingBetween) { pendingBetween = false; continue; }
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
    
    // «o.lvl + 1», «x AND y», «INTERVAL 7 DAY» — хвост выражения, а не алиас
    const endsInOperator = /[+\-*/%|&<>=!^~,(]\s*$/.test(potentialExpr) || /\b(AND|OR|NOT|IS|IN|LIKE|ILIKE|BETWEEN|THEN|ELSE|WHEN|CASE|DISTINCT|INTERVAL|ON)\s*$/i.test(potentialExpr) || /\bINTERVAL\s+\S+$/i.test(potentialExpr);
    const isNumber = /^\d+(\.\d+)?$/.test(potentialAlias);

    if ((isQuoted || isIdentifier) && !isNumber && !endsInOperator && potentialExpr && !potentialAlias.includes(')') && !potentialAlias.includes(']')) {
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
    const head = cleanSql.match(/^UPDATE\s+([A-Za-z0-9_".Ѐ-ӿёЁ]+)(?:\s+(?:AS\s+)?(?!SET\b)([A-Za-z0-9_"Ѐ-ӿёЁ]+))?\s+SET\b/i);
    const tableName = head ? head[1] : 'TARGET_TABLE';
    const alias = head && head[2] ? head[2] : undefined;
    const afterSet = head ? cleanSql.slice(head[0].length) : '';

    // FROM и WHERE ищем только на верхнем уровне: подзапросы в SET/WHERE их не ломают
    const fromKw = findTopLevelKeyword(afterSet, ['FROM']);
    const whereKw = findTopLevelKeyword(afterSet, ['WHERE']);
    const setEnd = fromKw ? fromKw.index : (whereKw ? whereKw.index : afterSet.length);
    const setStr = afterSet.slice(0, setEnd).trim();
    let fromSql = '';
    if (fromKw) {
      const fromEnd = whereKw && whereKw.index > fromKw.index ? whereKw.index : afterSet.length;
      fromSql = afterSet.slice(fromKw.index + fromKw.length, fromEnd).trim();
    }
    const whereStr = whereKw ? afterSet.slice(whereKw.index + whereKw.length).trim() : '';

    const setPairs: any[] = [];
    splitByTopLevelCommas(setStr).forEach(part => {
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        setPairs.push({
          column: part.substring(0, eqIdx).trim(),
          value: { type: 'column_ref', column: part.substring(eqIdx + 1).trim() }
        });
      }
    });

    return {
      type: 'update',
      table: { table: tableName, ...(alias ? { as: alias } : {}) },
      set: setPairs,
      fromSql: fromSql || undefined,
      where: whereStr ? { type: 'column_ref', column: whereStr } : null
    };
  }

  if (upperSql.startsWith('DELETE')) {
    const head = cleanSql.match(/^DELETE\s+FROM\s+([A-Za-z0-9_".Ѐ-ӿёЁ]+)(?:\s+(?:AS\s+)?(?!USING\b|WHERE\b)([A-Za-z0-9_"Ѐ-ӿёЁ]+))?/i);
    const tableName = head ? head[1] : 'TARGET_TABLE';
    const alias = head && head[2] ? head[2] : undefined;
    const rest = head ? cleanSql.slice(head[0].length) : '';
    const usingKw = findTopLevelKeyword(rest, ['USING']);
    const whereKw = findTopLevelKeyword(rest, ['WHERE']);
    let usingSql = '';
    if (usingKw) {
      const end = whereKw && whereKw.index > usingKw.index ? whereKw.index : rest.length;
      usingSql = rest.slice(usingKw.index + usingKw.length, end).trim();
    }
    const whereStr = whereKw ? rest.slice(whereKw.index + whereKw.length).trim() : '';

    return {
      type: 'delete',
      table: { table: tableName, ...(alias ? { as: alias } : {}) },
      fromSql: usingSql || undefined,
      where: whereStr ? { type: 'column_ref', column: whereStr } : null
    };
  }

  if (upperSql.startsWith('MERGE')) {
    const mergeMatch = cleanSql.match(/^MERGE\s+INTO\s+([A-Za-z0-9_".Ѐ-ӿёЁ]+)(?:\s+(?:AS\s+)?(?!USING\b)([A-Za-z0-9_"Ѐ-ӿёЁ]+))?/i);
    const tableName = mergeMatch ? mergeMatch[1] : 'TARGET_TABLE';
    const alias = mergeMatch && mergeMatch[2] ? mergeMatch[2] : undefined;
    const rest = mergeMatch ? cleanSql.slice(mergeMatch[0].length) : '';
    const out: any = { type: 'merge', table: { table: tableName, ...(alias ? { as: alias } : {}) }, text: cleanSql };

    const usingKw = findTopLevelKeyword(rest, ['USING']);
    if (usingKw) {
      const afterUsing = rest.slice(usingKw.index + usingKw.length);
      const onKw = findTopLevelKeyword(afterUsing, ['ON']);
      if (onKw) {
        out.usingSql = afterUsing.slice(0, onKw.index).trim();
        const afterOn = afterUsing.slice(onKw.index + onKw.length);
        // ветки WHEN … THEN … (верхний уровень)
        const starts: number[] = [];
        scanTopLevel(afterOn, (i) => {
          if (/^WHEN\b/i.test(afterOn.slice(i, i + 5))) { starts.push(i); return 4; }
          return 0;
        });
        out.onText = (starts.length ? afterOn.slice(0, starts[0]) : afterOn).trim();
        out.whens = starts.map((st, k) => {
          const chunk = afterOn.slice(st + 4, k + 1 < starts.length ? starts[k + 1] : afterOn.length).trim();
          const thenKw = findTopLevelKeyword(chunk, ['THEN']);
          const head2 = (thenKw ? chunk.slice(0, thenKw.index) : chunk).replace(/\s+/g, ' ').trim();
          const action = (thenKw ? chunk.slice(thenKw.index + thenKw.length) : '').replace(/\s+/g, ' ').trim();
          return { head: head2, action };
        });
      }
    }
    return out;
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
  // JOIN LATERAL (подзапрос) алиас — LATERAL относится к соединению
  const lat = str.trim().match(/^LATERAL\s+([\s\S]+)$/i);
  if (lat) {
    const r = parseTableOrSubquery(lat[1], dialect);
    if (r) r.lateral = true;
    return r;
  }
  // ClickHouse: «таблица [AS алиас] FINAL» — берётся актуальная версия строк
  const fin = str.trim().match(/^([\s\S]*?)\s+FINAL$/i);
  if (fin && fin[1].trim()) {
    const r = parseTableOrSubqueryCore(fin[1], dialect);
    if (r) r.final = true;
    return r;
  }
  return parseTableOrSubqueryCore(str, dialect);
}

function parseTableOrSubqueryCore(str: string, dialect: string): any {
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

// Ключевое слово соединения (с ClickHouse-модификаторами: GLOBAL, ANY/ALL/ASOF/SEMI/ANTI, ARRAY JOIN)
const JOIN_KEYWORD_RE = /(?:GLOBAL\s+)?(?:(?:ANY|ALL|ASOF|SEMI|ANTI)\s+)?(?:(?:LEFT|RIGHT|FULL)\s+(?:OUTER\s+)?(?:ARRAY\s+)?|INNER\s+|CROSS\s+|NATURAL\s+(?:(?:LEFT|RIGHT|FULL)\s+)?|LATERAL\s+|ARRAY\s+)?JOIN\b/iy;

/**
 * Обход текста только на верхнем уровне: вне скобок и кавычек. onWord вызывается в начале каждого слова
 * и возвращает длину найденного совпадения (тогда обход продолжается после него) или 0.
 */
function scanTopLevel(text: string, onWord: (i: number) => number): void {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) { if (text[i + 1] === quote) i++; else quote = ''; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth === 0 && /[A-Za-z]/.test(ch) && (i === 0 || !/[\w$.]/.test(text[i - 1]))) {
      const len = onWord(i);
      if (len > 0) i += len - 1;
    }
  }
}

/** Делит текст по ключевым словам JOIN верхнего уровня: [текст, JOIN, текст, JOIN, текст…]. JOIN внутри подзапросов не затрагивается. */
function splitTopLevelJoins(text: string): string[] {
  const out: string[] = [];
  let last = 0;
  scanTopLevel(text, (i) => {
    JOIN_KEYWORD_RE.lastIndex = i;
    const m = JOIN_KEYWORD_RE.exec(text);
    if (!m) return 0;
    out.push(text.slice(last, i), m[0].replace(/\s+/g, ' '));
    last = i + m[0].length;
    return m[0].length;
  });
  out.push(text.slice(last));
  return out;
}

/** Первое слово из списка (ON / USING) на верхнем уровне: позиция и длина слова. */
function findTopLevelKeyword(text: string, words: string[]): { index: number; length: number } | null {
  let found: { index: number; length: number } | null = null;
  scanTopLevel(text, (i) => {
    if (found) return 0;
    for (const w of words) {
      if (text.substr(i, w.length).toUpperCase() === w && !/[\w$]/.test(text[i + w.length] ?? '')) {
        found = { index: i, length: w.length };
        return w.length;
      }
    }
    return 0;
  });
  return found;
}

function parseHeuristicFromAndJoins(fromBlock: string, dialect: string): any[] {
  const fromList: any[] = [];
  if (!fromBlock) return fromList;

  const commaParts = splitByTopLevelCommas(fromBlock);
  
  commaParts.forEach((commaPart, commaIdx) => {
    const parts = splitTopLevelJoins(commaPart);
    
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

      let tablePart = tableAndCondition;
      let onCondition = '';
      // ON / USING ищем только на верхнем уровне: в подзапросе-источнике могут быть свои соединения
      const kw = findTopLevelKeyword(tableAndCondition, ['ON', 'USING']);
      if (kw) {
        tablePart = tableAndCondition.substring(0, kw.index).trim();
        onCondition = tableAndCondition.substring(kw.index + kw.length).trim();
      }

      const joinTable = parseTableOrSubquery(tablePart, dialect);
      if (joinTable) {
        joinTable.join = joinKeyword + (joinTable.lateral && !/\bLATERAL\b/i.test(joinKeyword) ? ' LATERAL' : '');
        joinTable.on = onCondition ? { type: 'column_ref', column: onCondition } : null;
        fromList.push(joinTable);
      }
    }
  });

  return fromList;
}

/** Упоминается ли имя CTE в тексте само по себе (не как часть схема.имя: `hr.salaries` — другая таблица). */
function mentionsName(text: string, name: string): boolean {
  const clean = String(text ?? '').replace(/'(?:[^']|'')*'/g, "''");
  const re = new RegExp(`(^|[^\\w$.])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`, 'i');
  return re.test(clean);
}

function extractCtes(sql: string, dialect: string): { ctes: any[], mainSql: string, withValues: string[] } {
  const ctes: any[] = [];
  const withValues: string[] = [];
  let workingSql = sql.trim();
  
  // Необязательное RECURSIVE после WITH (если за ним не сразу AS: так называется сам CTE)
  const withMatch = workingSql.match(/^\s*WITH\s+(?:RECURSIVE\s+(?!AS\b))?/i);
  if (!withMatch) {
    return { ctes, mainSql: workingSql, withValues };
  }

  workingSql = workingSql.substring(withMatch[0].length).trim();

  while (true) {
    const cteHeaderMatch = workingSql.match(/^([A-Za-z0-9_\u0400-\u04FFёЁ]+)(?:\s*\([^)]+\))?\s+AS\s*(?:((?:NOT\s+)?MATERIALIZED)\s*)?\(/i);
    if (!cteHeaderMatch) {
      // ClickHouse: в WITH бывают и «выражение AS псевдоним» (константы, скалярные подзапросы) — пропускаем такой элемент
      let itemEnd = -1;
      let hitSelect = false;
      scanTopLevel(workingSql, (i) => {
        if (itemEnd >= 0) return 0;
        if (/^SELECT\b/i.test(workingSql.substr(i, 7))) { itemEnd = i; hitSelect = true; return 6; }
        return 0;
      });
      let commaEnd = -1;
      {
        let depth = 0, quote = '';
        for (let i = 0; i < workingSql.length && (itemEnd < 0 || i < itemEnd); i++) {
          const ch = workingSql[i];
          if (quote) { if (ch === '\\') i++; else if (ch === quote) { if (workingSql[i + 1] === quote) i++; else quote = ''; } continue; }
          if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
          if (ch === '(' || ch === '[') depth++;
          else if (ch === ')' || ch === ']') depth--;
          else if (ch === ',' && depth === 0) { commaEnd = i; break; }
        }
      }
      const end = commaEnd >= 0 ? commaEnd : itemEnd;
      if (end < 0) break;
      const item = workingSql.substring(0, end).trim();
      if (!/\bAS\s+[A-Za-z_][\w$]*\s*$/i.test(item)) break;
      // «выражение AS имя» → «имя = выражение»
      withValues.push(item.replace(/^([\s\S]*?)\s+AS\s+([A-Za-z_][\w$]*)\s*$/i, '$2 = $1').replace(/\s+/g, ' '));
      workingSql = workingSql.substring(end + (commaEnd >= 0 ? 1 : 0)).trim();
      if (commaEnd < 0 && hitSelect) break;
      continue;
    }

    const cteName = cteHeaderMatch[1];
    const startIndex = cteHeaderMatch[0].length - 1;
    const closingIndex = findClosingParenthesis(workingSql, startIndex);
    
    if (closingIndex === -1) break;

    const cteBody = workingSql.substring(startIndex + 1, closingIndex).trim();
    const cteAst = parseSingleSqlToAst(cteBody, dialect).ast;
    // RECURSIVE относится ко всему WITH; на карточке он показывается у CTE, который обращается к самому себе
    const isRecursive = /\bRECURSIVE\b/i.test(withMatch[0]) && mentionsName(cteBody, cteName);
    const materialized = cteHeaderMatch[2] ? cteHeaderMatch[2].replace(/\s+/g, ' ').toUpperCase() : '';
    ctes.push({
      name: cteName,
      ast: cteAst,
      ...(isRecursive ? { recursive: true } : {}),
      ...(materialized ? { materialized } : {})
    });

    workingSql = workingSql.substring(closingIndex + 1).trim();

    if (workingSql.startsWith(',')) {
      workingSql = workingSql.substring(1).trim();
    } else {
      break;
    }
  }

  return { ctes, mainSql: workingSql, withValues };
}

function parseHeuristicSelect(sql: string, dialect: string): any {
  const ast: any = {
    type: 'select', ctes: [], columns: [], from: [], prewhere: null, where: null,
    start_with: null, connect_by: null, groupby: null, having: null, qualify: null, distinct: null, orderby: null, limit: null
  };

  const { ctes, mainSql, withValues } = extractCtes(sql, dialect);
  ast.ctes = ctes;
  if (withValues.length > 0) ast.withValues = withValues;

  let lowerSql = mainSql.trim();
  // ClickHouse: SETTINGS … и FORMAT … в конце запроса управляют выполнением, а не логикой — в разбор не берутся
  const settingsIdx = findTopLevelKeywordIndex(lowerSql, /^\bSETTINGS\b/i);
  if (settingsIdx > 0) lowerSql = lowerSql.substring(0, settingsIdx).trim();
  const formatIdx = findTopLevelKeywordIndex(lowerSql, /^\bFORMAT\s+[A-Za-z]\w*\s*$/i);
  if (formatIdx > 0) lowerSql = lowerSql.substring(0, formatIdx).trim();

  const selectIdx = findTopLevelKeywordIndex(lowerSql, /^\bSELECT\b/i);
  const fromIdx = findTopLevelKeywordIndex(lowerSql, /^\bFROM\b/i);
  const prewhereIdx = findTopLevelKeywordIndex(lowerSql, /^\bPREWHERE\b/i);
  const whereIdx = findTopLevelKeywordIndex(lowerSql, /^\bWHERE\b/i);
  const startWithIdx = findTopLevelKeywordIndex(lowerSql, /^\bSTART\s+WITH\b/i);
  const connectByIdx = findTopLevelKeywordIndex(lowerSql, /^\bCONNECT\s+BY\b/i);
  const groupbyIdx = findTopLevelKeywordIndex(lowerSql, /^\bGROUP\s+BY\b/i);
  const havingIdx = findTopLevelKeywordIndex(lowerSql, /^\bHAVING\b/i);
  const qualifyIdx = findTopLevelKeywordIndex(lowerSql, /^\bQUALIFY\b/i);
  const orderbyIdx = findTopLevelKeywordIndex(lowerSql, /^\bORDER\s+(?:SIBLINGS\s+)?BY\b/i); 
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
    { type: 'groupby', idx: groupbyIdx }, { type: 'having', idx: havingIdx }, { type: 'qualify', idx: qualifyIdx }, { type: 'orderby', idx: orderbyIdx },
    { type: 'limit', idx: limitIdx }
  ].filter(item => item.idx !== -1).sort((a, b) => a.idx - b.idx);

  const getNextIdx = (type: string) => {
    const currentPos = indices.findIndex(item => item.type === type);
    if (currentPos === -1 || currentPos === indices.length - 1) return -1;
    return indices[currentPos + 1].idx;
  };

  if (selectIdx !== -1) {
    let selectBlock = getBlock(selectIdx + 6, getNextIdx('select'));
    // SELECT DISTINCT [ON (...)] — убираем из списка столбцов и запоминаем отдельно
    const distinctMatch = selectBlock.match(/^DISTINCT\b(\s+ON\s*\()?/i);
    if (distinctMatch) {
      let consumed = 'DISTINCT'.length;
      ast.distinct = { type: 'DISTINCT' };
      if (distinctMatch[1]) {
        const openIdx = distinctMatch[0].length - 1;
        const closeIdx = findClosingParenthesis(selectBlock, openIdx);
        if (closeIdx !== -1) {
          ast.distinct = { type: 'DISTINCT ON', on: selectBlock.substring(openIdx + 1, closeIdx).trim() };
          consumed = closeIdx + 1;
        }
      }
      selectBlock = selectBlock.substring(consumed).trim();
    }
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

  if (qualifyIdx !== -1) {
    const qualifyBlock = getBlock(qualifyIdx + 7, getNextIdx('qualify'));
    ast.qualify = { type: 'column_ref', column: qualifyBlock };
  }

  if (orderbyIdx !== -1) {
    const orderbyHead = /^ORDER\s+(?:SIBLINGS\s+)?BY\b/i.exec(lowerSql.substring(orderbyIdx));
    const orderbyBlock = getBlock(orderbyIdx + (orderbyHead ? orderbyHead[0].length : 8), getNextIdx('orderby'));
    const cols = splitByTopLevelCommas(orderbyBlock);
    ast.orderby = cols.map(c => {
      // «выражение [ASC|DESC] [NULLS FIRST|LAST]»
      const m = c.trim().match(/^([\s\S]*?)(?:\s+(ASC|DESC))?(?:\s+(NULLS\s+(?:FIRST|LAST)))?$/i);
      const expr = m ? m[1] : c;
      const dir = (m && m[2] ? m[2] : 'ASC').toUpperCase();
      const nulls = m && m[3] ? ` ${m[3].replace(/\s+/g, ' ').toUpperCase()}` : '';
      return { expr: { type: 'column_ref', column: expr.trim() }, type: dir + nulls };
    });
  }

  if (limitIdx !== -1) {
    const limitBlock = getBlock(limitIdx + 5, getNextIdx('limit'));
    // ClickHouse: LIMIT [offset,] n BY выражение — ограничение по группам, а не по всему результату
    const limitBy = limitBlock.match(/^([\s\S]*?)\bBY\b([\s\S]*)$/i);
    const parts = limitBlock.split(/\s*,|\s+OFFSET\s+/i);
    const limitVal = parts[0]?.trim() || '10';
    const offsetVal = parts[1]?.trim() || '0';
    ast.limit = limitBy
      ? { raw: `LIMIT ${limitBy[1].trim()} BY ${limitBy[2].trim().replace(/\s+/g, ' ')}` }
      : { value: [ { type: 'number', value: parseInt(limitVal) || limitVal }, { type: 'number', value: parseInt(offsetVal) || offsetVal } ] };
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

// --- COPY / CREATE ... AS: обёртки вокруг запроса (источник -> файл / таблица) ---

function stripOuterParens(text: string): string {
  const t = text.trim();
  if (t.startsWith('(')) {
    const close = findClosingParenthesis(t, 0);
    if (close === t.length - 1 || (close !== -1 && t.substring(close + 1).trim().replace(/;+$/, '') === '')) {
      return t.substring(1, close).trim();
    }
  }
  return t;
}

function unquoteSqlName(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === "'" && t[t.length - 1] === "'") || (t[0] === '"' && t[t.length - 1] === '"'))) {
    return t.substring(1, t.length - 1);
  }
  return t;
}

/** COPY (SELECT ...) TO 'file' [(opts)]  |  COPY tbl TO 'file'  |  COPY tbl [(cols)] FROM 'file' [(opts)] */
function parseCopyStatement(sql: string, dialect: string): any | null {
  const head = sql.match(/^\s*COPY\s+/i);
  if (!head) return null;
  let rest = sql.substring(head[0].length);
  let query: any = null;
  let table: string | null = null;

  if (rest.startsWith('(')) {
    const close = findClosingParenthesis(rest, 0);
    if (close === -1) return null;
    const innerSql = rest.substring(1, close).trim();
    const inner = parseSingleSqlToAst(innerSql, dialect);
    query = inner.ast || { type: 'statement', text: innerSql };
    rest = rest.substring(close + 1);
  } else {
    const tm = rest.match(/^("(?:[^"]|"")+"(?:\."(?:[^"]|"")+")*|[^\s(]+)(\s*\([^)]*\))?/);
    if (!tm) return null;
    table = tm[1];
    rest = rest.substring(tm[0].length);
  }

  const dm = rest.match(/^\s*(TO|FROM)\s+('(?:[^']|'')*'|"(?:[^"]|"")*"|[^\s(;]+)\s*([\s\S]*)$/i);
  if (!dm) return null;
  const direction = dm[1].toUpperCase() === 'TO' ? 'to' : 'from';
  if (direction === 'from' && query) return null;
  const file = unquoteSqlName(dm[2]);
  const options = dm[3].replace(/;+\s*$/, '').trim();
  const fmtMatch = options.match(/\bFORMAT\s+['"]?([A-Za-z0-9_]+)/i) || file.match(/\.([A-Za-z0-9]+)$/);
  const format = fmtMatch ? fmtMatch[1].toUpperCase() : '';
  return { type: 'copy', direction, query, table, file, options, format };
}

/** CREATE [OR REPLACE] [TEMP|MATERIALIZED] TABLE|VIEW name [...] AS SELECT|WITH|FROM ... */
function parseCreateAsStatement(sql: string, dialect: string): any | null {
  const m = sql.match(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?((?:(?:GLOBAL\s+|LOCAL\s+)?(?:TEMP|TEMPORARY)\s+)|(?:MATERIALIZED\s+))?(TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?("(?:[^"]|"")+"(?:\."(?:[^"]|"")+")*|[^\s(]+)([\s\S]*?)\bAS\s+(\(?\s*(?:SELECT|WITH|FROM)\b[\s\S]*)$/i);
  if (!m) return null;
  const prefixWord = (m[1] || '').trim().toUpperCase();
  const kind = prefixWord === 'MATERIALIZED' ? 'MATERIALIZED VIEW' : m[2].toUpperCase();
  const bodySql = stripOuterParens(m[5].replace(/;+\s*$/, ''));
  const inner = parseSingleSqlToAst(bodySql, dialect);
  return {
    type: 'create_as',
    kind,
    name: m[3],
    query: inner.ast || { type: 'statement', text: bodySql },
  };
}

export function parseSingleSqlToAst(sql: string, dialect = 'PostgreSQL'): any {
  let cleanSql = sql.trim(); 
  const upperSql = cleanSql.toUpperCase();
  const isProcedure = /^\s*(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TYPE|TRIGGER)|PROCEDURE\b|FUNCTION\b|DECLARE\b|BEGIN\b)/i.test(upperSql);
  if (isProcedure) {
    return { ast: parseHeuristicProcedure(cleanSql, dialect), error: null };
  }
  // завершающая «;» не часть запроса (у процедур она нужна — END;)
  cleanSql = cleanSql.replace(/[;\s]+$/, '');

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

  const copyAst = parseCopyStatement(cleanSql, dialect);
  if (copyAst) {
    return { ast: copyAst, error: null };
  }

  const createAsAst = parseCreateAsStatement(cleanSql, dialect);
  if (createAsAst) {
    return { ast: createAsAst, error: null };
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
/** Рамка вокруг CTE / подзапроса / производной таблицы с несколькими источниками. */
export interface FrameInfo {
  id: string;
  kind: 'cte' | 'sub' | 'derived';
  name: string;
  /** все узлы блока, включая вложенные рамки (прямое членство считается при добавлении узлов-рамок) */
  nodeIds: string[];
}

export interface GraphContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cteOutputIds: Record<string, string>;
  options: { 
    collapsedQueries?: Set<string>; 
    onToggleExpand?: (id: string) => void;
  };
  frames?: FrameInfo[];
}

// Все стрелки идут по маршрутам раскладки (treeLayout.ts, MermaidEdge) и не анимируются:
// пунктир означает ссылку (на CTE, производную таблицу, подзапрос), сплошная линия — поток данных и соединение.
function addEdge(ctx: GraphContext, source: string, target: string, label?: string, style?: any, data?: any) {
  if (!source || !target) return;
  ctx.edges.push({
    id: `edge_${source}_to_${target}_${Math.random().toString(36).substring(2, 7)}`,
    source, target, label, animated: false, style,
    type: 'mermaidEdge',
    ...(data ? { data } : {}),
  });
}

/** Предупреждение на карточке: значок ⚠ в шапке, текст во всплывающей подсказке. key — фраза из словаря i18n, detail — фрагмент запроса. */
function addWarning(ctx: GraphContext, nodeId: string, key: string, detail?: string) {
  const node = nodeId ? findNode(ctx, nodeId) : undefined;
  if (!node) return;
  if (!Array.isArray(node.data.warnings)) node.data.warnings = [];
  const d = detail ? String(detail).replace(/\s+/g, ' ').trim().slice(0, 90) : undefined;
  if (node.data.warnings.some((w: any) => w.key === key && w.detail === d)) return;
  node.data.warnings.push(d ? { key, detail: d } : { key });
}

const WARN_CROSS_JOIN = 'Соединение без условия — каждая строка с каждой (декартово произведение)';
const WARN_LEFT_TO_INNER = 'LEFT JOIN работает как INNER: условие WHERE по этой таблице отбрасывает строки без пары';
const WARN_SELECT_STAR = 'SELECT * — состав колонок результата зависит от таблицы';
const WARN_WINDOW_IN_WHERE = 'Оконная функция в WHERE недопустима — используйте QUALIFY или подзапрос';
const WINDOW_TEXT_RE = /\bOVER\s*(\(|[A-Za-z_"`])/i;
const withoutLiterals = (t: string) => String(t ?? '').replace(/'(?:[^']|'')*'/g, "''");

/** Итоговая карточка запроса (результат основного SELECT, а не CTE или подзапроса) — на ней показывается метка RESULT. */
function markFinal(ctx: GraphContext, id: string) {
  const node = id ? findNode(ctx, id) : undefined;
  if (node && node.type === 'resultNode') {
    node.data.final = true;
    const cols: any[] = Array.isArray(node.data.columns) ? node.data.columns : [];
    if (cols.some(c => /^(?:[\w$"`]+\.)?\*$/.test(String(typeof c === 'string' ? c : c?.name ?? '').trim()))) {
      addWarning(ctx, id, WARN_SELECT_STAR);
    }
  }
}

function findNode(ctx: GraphContext, id: string): GraphNode | undefined {
  for (let i = ctx.nodes.length - 1; i >= 0; i--) if (ctx.nodes[i].id === id) return ctx.nodes[i];
  return undefined;
}

/** Чип на карточке: kind задаёт цвет, text — содержимое. */
function addChip(ctx: GraphContext, nodeId: string, kind: string, text: string) {
  const node = findNode(ctx, nodeId);
  if (!node) return;
  if (!Array.isArray(node.data.chips)) node.data.chips = [];
  node.data.chips.push({ kind, text });
}

/**
 * Строит конвейер вложенного SELECT. Если у блока ≥2 источников, регистрирует для него рамку.
 * Возвращает id выходного узла и признак, что рамка создана.
 */
function buildBlock(
  ast: any,
  prefix: string,
  dialect: string,
  ctx: GraphContext,
  frame: { kind: FrameInfo['kind']; name: string }
): { out: string; framed: boolean } {
  const start = ctx.nodes.length;
  const out = buildDataPipeline(ast, prefix, dialect, ctx);
  let framed = false;
  if (countSources(ast) >= 2) {
    const nodeIds = ctx.nodes.slice(start).map(n => n.id);
    if (nodeIds.length > 0) {
      if (!ctx.frames) ctx.frames = [];
      ctx.frames.push({ id: `${prefix}frame`, kind: frame.kind, name: frame.name, nodeIds });
      framed = true;
    }
  }
  return { out, framed };
}

function processNestedQueries(text: string, targetNodeId: string, prefix: string, dialect: string, ctx: GraphContext) {
  const nested = extractSubqueriesFromString(text);
  nested.forEach((item, idx) => {
    try {
      const subPrefix = `${prefix}subq_${idx}_`;
      const parsedSub = parseSingleSqlToAst(item.subquerySql, dialect).ast;
      const subOutputId = buildBlock(parsedSub, subPrefix, dialect, ctx, { kind: 'sub', name: '' }).out;
      if (subOutputId) {
        addEdge(ctx, subOutputId, targetNodeId, 'subquery', { strokeDasharray: '4 4' });
      }
    } catch (e) {}
  });
}

/**
 * Добавляет в граф узлы-рамки: у каждой рамки — прямые члены и внешняя рамка.
 * Размер и положение задаёт раскладка (treeLayout.ts).
 */
function appendFrameNodes(ctx: GraphContext) {
  const frames = ctx.frames;
  if (!frames || frames.length === 0) return;
  const sets = frames.map(f => new Set(f.nodeIds));
  // внешняя рамка — наименьшая из рамок, целиком содержащих эту
  const parentOf = (i: number): number => {
    let best = -1;
    for (let j = 0; j < frames.length; j++) {
      if (j === i || sets[j].size <= sets[i].size) continue;
      let all = true;
      for (const id of sets[i]) if (!sets[j].has(id)) { all = false; break; }
      if (all && (best === -1 || sets[j].size < sets[best].size)) best = j;
    }
    return best;
  };
  const parents = frames.map((_, i) => parentOf(i));
  const childIds = frames.map(() => new Set<string>());
  // узлы вложенных рамок не считаются прямыми членами внешней
  frames.forEach((_, i) => {
    const p = parents[i];
    if (p >= 0) for (const id of sets[i]) childIds[p].add(id);
  });
  frames.forEach((f, i) => {
    const members = f.nodeIds.filter(id => !childIds[i].has(id));
    ctx.nodes.push({
      id: f.id,
      type: 'frameNode',
      data: { kind: f.kind, name: f.name, members, parentFrame: parents[i] >= 0 ? frames[parents[i]].id : undefined },
      position: { x: 0, y: 0 },
      zIndex: -1,
    });
  });
}

function buildDataPipeline(ast: any, prefix: string, dialect: string, ctx: GraphContext): string {
  if (!ast) return '';
  if (Array.isArray(ast)) ast = ast[0];

  const queryType = ast.type || 'select';

  // 0. Константы из WITH (ClickHouse: `expr AS имя`) — отдельная карточка, чтобы имена в условиях были понятны
  if (Array.isArray(ast.withValues) && ast.withValues.length > 0) {
    const wvId = `${prefix}with_values`;
    ctx.nodes.push({ id: wvId, type: 'filterNode', data: { title: 'WITH', iconType: 'edit', condition: ast.withValues.join('; '), columns: ast.withValues }, position: { x: 0, y: 0 }});
    ast.withValues.forEach((txt: string, i: number) => processNestedQueries(txt, wvId, `${prefix}wv_${i}_`, dialect, ctx));
  }

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
        const { out: cteOutputId, framed: cteFramed } = buildBlock(cteAst, ctePrefix, dialect, ctx, { kind: 'cte', name: cteName });

        const cteOutNode = findNode(ctx, cteOutputId);
        if (cteOutNode && cteOutNode.type === 'resultNode') {
          // отдельной карточки-обёртки нет — на CTE ссылаются прямо от «Projection» его блока
          if (!cteFramed) cteOutNode.data.title = `CTE · ${cteName}`;
          const tags = [cte.recursive ? 'RECURSIVE' : '', cte.materialized || ''].filter(Boolean);
          if (tags.length > 0) cteOutNode.data.tags = tags;
          ctx.cteOutputIds[cteName.toLowerCase()] = cteOutputId;
        } else {
          const cteWrapId = `${prefix}cte_wrap_${cteName}`;
          const wrapTags = [cte.recursive ? 'RECURSIVE' : '', cte.materialized || ''].filter(Boolean);
          ctx.nodes.push({
            id: cteWrapId, type: 'tableNode',
            data: { label: cteName, title: 'CTE (With Statement)', isSubquery: true, ...(wrapTags.length > 0 ? { tags: wrapTags } : {}) }, position: { x: 0, y: 0 }
          });

          addEdge(ctx, cteOutputId, cteWrapId, 'defines CTE');

          ctx.cteOutputIds[cteName.toLowerCase()] = cteWrapId;
        }
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

  // 2.5 COPY ... TO/FROM и CREATE TABLE|VIEW ... AS
  if (queryType === 'copy') {
    const fmtSuffix = ast.format ? ` ${ast.format}` : '';
    const fileId = `${prefix}copy_file`;
    if (ast.direction === 'to') {
      let srcId = '';
      if (ast.query) {
        srcId = buildDataPipeline(ast.query, `${prefix}copy_src_`, dialect, ctx);
      } else {
        srcId = `${prefix}copy_table`;
        ctx.nodes.push({ id: srcId, type: 'tableNode', data: { label: ast.table || 'TABLE', title: 'Source table' }, position: { x: 0, y: 0 }});
      }
      ctx.nodes.push({ id: fileId, type: 'tableNode', data: { label: ast.file, title: `File (COPY TO${fmtSuffix})` }, position: { x: 0, y: 0 }});
      addEdge(ctx, srcId, fileId, `COPY TO${fmtSuffix}`);
      return fileId;
    }
    const tblId = `${prefix}copy_target`;
    ctx.nodes.push({ id: fileId, type: 'tableNode', data: { label: ast.file, title: `File (COPY FROM${fmtSuffix})` }, position: { x: 0, y: 0 }});
    ctx.nodes.push({ id: tblId, type: 'tableNode', data: { label: ast.table || 'TABLE', title: 'Target (COPY FROM)' }, position: { x: 0, y: 0 }});
    addEdge(ctx, fileId, tblId, `COPY FROM${fmtSuffix}`);
    return tblId;
  }

  if (queryType === 'create_as') {
    const tgtId = `${prefix}create_target`;
    const srcId = buildDataPipeline(ast.query, `${prefix}create_src_`, dialect, ctx);
    ctx.nodes.push({ id: tgtId, type: 'tableNode', data: { label: ast.name, title: `Target (CREATE ${ast.kind})` }, position: { x: 0, y: 0 }});
    addEdge(ctx, srcId, tgtId, `CREATE ${ast.kind} AS`);
    return tgtId;
  }

  // 3. DML / Procedures
  if (['insert', 'update', 'delete', 'merge', 'truncate', 'refresh_view'].includes(queryType)) {
    const opName = String(queryType || '').toUpperCase();
    // реальный разбор DELETE кладёт целевую таблицу в from, а не в table
    const rawTargets = ast.table ? (Array.isArray(ast.table) ? ast.table : [ast.table])
      : (queryType === 'delete' && Array.isArray(ast.from) && ast.from.length > 0 ? ast.from.slice(0, 1) : [{ table: 'TARGET_TABLE' }]);
    const targetIds: string[] = [];

    rawTargets.forEach((t: any, tIdx: number) => {
      const tId = `${prefix}target_${tIdx}`;
      const alias = t.as ? String(t.as) : undefined;
      const tData: any = { label: t.table || 'TARGET', title: `Target (${opName})`, ...(alias ? { alias } : {}) };
      // INSERT INTO t (a, b, c): список колонок показываем на карточке цели
      if (queryType === 'insert' && tIdx === 0 && Array.isArray(ast.columns) && ast.columns.length > 0) {
        tData.columns = ast.columns
          .map((c: any) => (typeof c === 'string' ? c : String(c?.column?.expr?.value ?? c?.column ?? c?.name ?? formatExpr(c))))
          .filter(Boolean)
          .map((name: string) => ({ name }));
      }
      ctx.nodes.push({ id: tId, type: 'tableNode', data: tData, position: { x: 0, y: 0 }});
      targetIds.push(tId);
    });

    let currentInputId = targetIds[0];

    // источники UPDATE ... FROM / DELETE ... USING / MERGE ... USING строим обычным конвейером SELECT * FROM …
    const buildDmlSources = (sqlText: string | undefined, realFrom: any, where: any, pfx: string): string | null => {
      let synthetic: any = null;
      if (sqlText) {
        synthetic = parseSingleSqlToAst(`SELECT * FROM ${sqlText}${where ? ` WHERE ${formatExpr(where)}` : ''}`, dialect).ast;
      } else if (Array.isArray(realFrom) && realFrom.length > 0 && queryType !== 'delete') {
        synthetic = { type: 'select', ctes: [], columns: '*', from: realFrom, prewhere: null, where: where || null,
          start_with: null, connect_by: null, groupby: null, having: null, qualify: null, distinct: null, orderby: null, limit: null };
      }
      if (!synthetic || synthetic.type !== 'select') return null;
      return buildDataPipeline(synthetic, pfx, dialect, ctx);
    };
    // служебная проекция «SELECT *» пуста: убираем её, стрелки источников идут прямо к получателю
    const absorbSources = (srcId: string, destId: string) => {
      ctx.edges.forEach((e: any) => { if (e.target === srcId) e.target = destId; });
      ctx.nodes = ctx.nodes.filter((n: any) => n.id !== srcId);
    };

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
      const srcId = buildDmlSources(ast.fromSql, ast.from, ast.where, `${prefix}dml_src_`);
      let setId = '';
      if (queryType === 'update') {
        const pairs: string[] = (Array.isArray(ast.set) ? ast.set : [])
          .map((it: any) => `${typeof it.column === 'string' ? it.column : formatExpr(it.column)} = ${formatExpr(it.value)}`);
        setId = `${prefix}update_action`;
        ctx.nodes.push({ id: setId, type: 'filterNode', data: { title: 'SET', iconType: 'edit', condition: pairs.join(', '), ...(pairs.length > 0 ? { columns: pairs } : {}) }, position: { x: 0, y: 0 }});
        pairs.forEach((pr, i) => processNestedQueries(pr, setId, `${prefix}set_${i}_`, dialect, ctx));
      }

      if (srcId) {
        // WHERE уже учтён внутри конвейера источников; цель участвует как читаемая таблица
        if (setId) {
          targetIds.forEach(tId => addEdge(ctx, tId, setId, 'target rows'));
          absorbSources(srcId, setId);
          currentInputId = setId;
        } else {
          // DELETE … USING: источники и целевая таблица сходятся в карточке результата
          const delId = `${prefix}dml_result`;
          absorbSources(srcId, delId);
          targetIds.forEach(tId => addEdge(ctx, tId, delId, 'target rows'));
          currentInputId = '';
        }
      } else {
        if (ast.where) {
          const filterId = `${prefix}dml_where`;
          const cond = formatExpr(ast.where);
          const condColumns = splitConditions(cond);
          ctx.nodes.push({ id: filterId, type: 'filterNode', data: { title: 'WHERE', condition: cond, columns: condColumns }, position: { x: 0, y: 0 }});
          targetIds.forEach(tId => addEdge(ctx, tId, filterId, 'reads from'));
          processNestedQueries(cond, filterId, `${prefix}dml_`, dialect, ctx);
          currentInputId = filterId;
        }
        if (setId) { addEdge(ctx, currentInputId, setId); currentInputId = setId; }
      }
    } else if (queryType === 'merge' && Array.isArray(ast.whens)) {
      const srcId = buildDmlSources(ast.usingSql, null, null, `${prefix}dml_src_`);
      const onId = `${prefix}merge_on`;
      const onText = String(ast.onText || '');
      ctx.nodes.push({ id: onId, type: 'filterNode', data: { title: 'ON', condition: onText, columns: splitConditions(onText) }, position: { x: 0, y: 0 }});
      targetIds.forEach(tId => addEdge(ctx, tId, onId, 'target'));
      if (srcId) absorbSources(srcId, onId);

      const whenId = `${prefix}merge_when`;
      const lines = ast.whens.map((w: any) => `${w.head}${w.action ? ` → ${w.action}` : ''}`);
      ctx.nodes.push({ id: whenId, type: 'filterNode', data: { title: 'WHEN', iconType: 'edit', condition: lines.join('; '), columns: lines }, position: { x: 0, y: 0 }});
      addEdge(ctx, onId, whenId);
      currentInputId = whenId;
    }

    const resId = `${prefix}dml_result`;
    const tLabel = rawTargets.map((t: any) => `${t.table || 'TARGET'}${t.as ? ` ${t.as}` : ''}`).join(', ');
    const summary = queryType === 'insert' ? `INSERT INTO ${tLabel}${Array.isArray(ast.columns) && ast.columns.length > 0 ? ` (${ast.columns.length} cols)` : ''}`
      : queryType === 'delete' ? `DELETE FROM ${tLabel}`
      : queryType === 'merge' ? `MERGE INTO ${tLabel}`
      : `${opName} ${tLabel}`;
    ctx.nodes.push({ id: resId, type: 'resultNode', data: { title: `Operation: ${opName}`, columns: [{ name: summary }] }, position: { x: 0, y: 0 }});
    if (currentInputId) addEdge(ctx, currentInputId, resId);
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
  // алиас (или имя) источника -> id его карточки; по нему JOIN находит, к чему присоединён, а условия — свою карточку
  const aliasNodes = new Map<string, string>();
  let rootId = '';
  // тексты, в которых ищутся колонки источников (alias.колонка)
  const usedTexts: string[] = [];
  // чипы для карточки «Projection» (GROUP BY, HAVING, QUALIFY, ORDER BY, LIMIT)
  const resultChips: { kind: string; text: string }[] = [];
  // LEFT JOIN-источники: если WHERE фильтрует только их, соединение фактически внутреннее
  const leftJoins: { key: string; id: string }[] = [];
  const whereTexts = [ast.prewhere, ast.where].filter(Boolean).map((w: any) => formatExpr(w));

  // 4.1 FROM & JOINS: JOIN — стрелка от присоединяемого источника к тому, к чему он присоединён (по алиасам из ON);
  // без ON, с USING или с неизвестным алиасом — к первому источнику FROM
  if (ast.from && ast.from.length > 0) {
    ast.from.forEach((fromItem: any, idx: number) => {
      let srcId = '';
      let aliasKey = '';
      
      let subqueryAst = null;
      if (fromItem.expr) {
        if (fromItem.expr.ast) {
          subqueryAst = fromItem.expr.ast;
        } else if (fromItem.expr.type === 'select' || fromItem.expr.type === 'union') {
          subqueryAst = fromItem.expr;
        }
      }
      
      if (subqueryAst) {
        srcId = buildBlock(subqueryAst, `${prefix}from_${idx}_`, dialect, ctx, { kind: 'derived', name: fromItem.as || '' }).out;
        const wrapperId = `${prefix}from_wrap_${idx}`;
        ctx.nodes.push({ id: wrapperId, type: 'tableNode', data: { label: fromItem.as || 'Subquery', isSubquery: true }, position: { x: 0, y: 0 }});
        // подписи нет: карточка-приёмник сама помечена «subquery»
        addEdge(ctx, srcId, wrapperId);
        srcId = wrapperId;
        aliasKey = fromItem.as ? String(fromItem.as) : '';
      } else {
        let tName = fromItem.table;
        if (tName && typeof tName === 'object' && tName.value) tName = tName.value;
        // источник без имени таблицы (read_parquet('…'), file(…), numbers(10), unnest(…)) — показываем его текст как написан
        if (!tName && fromItem.expr) tName = formatExpr(fromItem.expr);
        tName = String(tName || 'UNKNOWN').replace(/^["'`]|["'`]$/g, '').replace(/`/g, '').trim();
        aliasKey = fromItem.as ? String(fromItem.as) : tName;
        
        const cteId = ctx.cteOutputIds[tName.toLowerCase()];
        
        if (cteId) {
          // обращение к CTE — своя карточка: свой алиас и свои условия
          srcId = `${prefix}ref_${idx}`;
          ctx.nodes.push({ id: srcId, type: 'tableNode', data: { label: tName, alias: fromItem.as, title: 'CTE' }, position: { x: 0, y: 0 }});
          addEdge(ctx, cteId, srcId, undefined, { stroke: '#6366f1' });
        } else {
          srcId = `${prefix}base_table_${idx}`;
          ctx.nodes.push({ id: srcId, type: 'tableNode', data: { label: tName, alias: fromItem.as, ...(fromItem.final ? { tags: ['FINAL'] } : {}) }, position: { x: 0, y: 0 }});
        }
      }
      
      if (idx === 0) {
        currentOutputId = srcId;
        rootId = srcId;
      } else {
        let joinTypeStr = fromItem.join ? String(fromItem.join).toUpperCase() : 'COMMA JOIN';
        const usingCols = Array.isArray(fromItem.using) ? fromItem.using.map((u: any) => formatExpr(u)).join(', ') : '';
        
        if (joinTypeStr === 'INNER JOIN' && !fromItem.on && !usingCols) {
          joinTypeStr = 'COMMA JOIN';
        }
        if (joinTypeStr === 'JOIN') joinTypeStr = 'INNER JOIN';
        
        const onText = fromItem.on ? formatExpr(fromItem.on) : (usingCols ? `USING (${usingCols})` : '');
        let parentId = pickJoinParent(onText, [aliasKey], aliasNodes, rootId);
        if (parentId === srcId) parentId = rootId;
        if (parentId && parentId !== srcId) {
          addEdge(
            ctx, srcId, parentId,
            joinEdgeLabel(joinTypeStr, onText),
            { stroke: '#a855f7' },
            { join: true, joinType: joinTypeStr, condition: onText }
          );
        }
        if (onText) usedTexts.push(onText);
        // соединение без условия: запятая / CROSS JOIN (ARRAY JOIN и LATERAL — не соединения в этом смысле)
        if (!onText && !/ARRAY|LATERAL/.test(joinTypeStr) && (joinTypeStr === 'COMMA JOIN' || /\bCROSS\b/.test(joinTypeStr))) {
          // старый стиль «FROM a, b WHERE a.id = b.id» — условие связи стоит в WHERE
          const linkedInWhere = aliasKey && whereTexts.some(txt => {
            const q = qualifiersIn(txt).map(x => x.toLowerCase());
            return q.includes(aliasKey.toLowerCase()) && q.some(x => x !== aliasKey.toLowerCase() && aliasNodes.has(x));
          });
          if (!linkedInWhere) addWarning(ctx, srcId, WARN_CROSS_JOIN, aliasKey ? `${joinTypeStr} ${aliasKey}` : joinTypeStr);
        }
        if (/\bLEFT\b/.test(joinTypeStr) && !/ARRAY|ANTI|SEMI/.test(joinTypeStr) && aliasKey) leftJoins.push({ key: aliasKey.toLowerCase(), id: srcId });
      }
      if (aliasKey) aliasNodes.set(aliasKey.toLowerCase(), srcId);
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
      
      if (rootId) {
        // условие — чипы на карточке источника, чей алиас упомянут первым (без алиаса — на первом источнике FROM)
        usedTexts.push(condText);
        conditionChipTexts(condColumns, condText).forEach((chipText, pi) => {
          const owner = firstKnownQualifier(chipText, aliasNodes)?.nodeId || rootId;
          addChip(ctx, owner, f.t === 'PREWHERE' ? 'prewhere' : 'filter', chipText);
          if (WINDOW_TEXT_RE.test(withoutLiterals(chipText))) addWarning(ctx, owner, WARN_WINDOW_IN_WHERE, chipText);
          // условие только по правой таблице LEFT JOIN (кроме IS NULL — приём «нет пары» и COALESCE-подобных) делает соединение внутренним
          const qs = qualifiersIn(withoutLiterals(chipText)).map(x => x.toLowerCase());
          if (qs.length > 0 && !/\bIS\s+NULL\b|\bCOALESCE\b|\bIFNULL\b|\bNVL\b/i.test(chipText)) {
            const lj = leftJoins.find(j => qs.every(q => q === j.key));
            if (lj) addWarning(ctx, lj.id, WARN_LEFT_TO_INNER, chipText);
          }
          processNestedQueries(chipText, owner, `${prefix}${f.t}_p${pi}_`, dialect, ctx);
        });
        return;
      }
      
      // Запрос без FROM: чипу не на чем держаться — условие остаётся узлом
      ctx.nodes.push({ id: fId, type: 'filterNode', data: { title: f.t, condition: condText, columns: condColumns }, position: { x: 0, y: 0 }});
      addEdge(ctx, currentOutputId, fId);
      processNestedQueries(condText, fId, `${prefix}${f.t}_`, dialect, ctx);
      currentOutputId = fId;
    });
  }

  // 4.3 Hierarchical
  if (ast.start_with || ast.connect_by) {
    const hId = `${prefix}hierarchy`;
    const hierarchyParts = [
      ast.start_with ? `START WITH ${formatExpr(ast.start_with)}` : '',
      ast.connect_by ? `CONNECT BY ${formatExpr(ast.connect_by)}` : '',
    ].filter(Boolean);
    ctx.nodes.push({
      id: hId, type: 'filterNode',
      data: { title: 'Hierarchical Query', ...(hierarchyParts.length > 0 ? { condition: hierarchyParts.join(' '), columns: hierarchyParts.map(name => ({ name })) } : {}) },
      position: { x: 0, y: 0 }
    });
    addEdge(ctx, currentOutputId, hId);
    currentOutputId = hId;
  }

  const resId = `${prefix}projection`;

  // 4.4 GROUP BY
  // node-sql-parser 5.x отдаёт GROUP BY объектом { columns, modifiers }, встроенный разбор — массивом
  const groupCols: any[] = Array.isArray(ast.groupby) ? ast.groupby : (Array.isArray(ast.groupby?.columns) ? ast.groupby.columns : []);
  if (groupCols.length > 0) {
    const groupText = groupCols.map((c: any) => formatExpr(c)).join(', ');
    usedTexts.push(groupText);
    resultChips.push({ kind: 'group', text: `GROUP BY ${groupText}` });
  }

  // 4.5 HAVING
  if (ast.having) {
    const condText = formatExpr(ast.having);
    usedTexts.push(condText);
    conditionChipTexts(splitConditions(condText), condText).forEach((chipText, pi) => {
      resultChips.push({ kind: 'having', text: `HAVING ${chipText}` });
      processNestedQueries(chipText, resId, `${prefix}having_p${pi}_`, dialect, ctx);
    });
  }

  // 4.5.1 QUALIFY (DuckDB / ClickHouse: фильтр по результату оконных функций)
  if (ast.qualify) {
    const condText = formatExpr(ast.qualify);
    usedTexts.push(condText);
    resultChips.push({ kind: 'having', text: `QUALIFY ${condText}` });
    processNestedQueries(condText, resId, `${prefix}qualify_`, dialect, ctx);
  }

  // 4.6 ORDER BY & LIMIT
  if (ast.orderby) {
    const orderText = ast.orderby.map((i: any) => `${formatExpr(i.expr)} ${i.type || 'ASC'}`).join(', ');
    usedTexts.push(orderText);
    resultChips.push({ kind: 'order', text: `ORDER BY ${orderText}` });
  }
  // node-sql-parser для запроса без LIMIT отдаёт `limit: { value: [] }` — это не LIMIT 0
  if (ast.limit && (!Array.isArray(ast.limit.value) || ast.limit.value.length > 0)) {
    const lVal = ast.limit.value?.[0]?.value || '0';
    const oVal = ast.limit.value?.[1]?.value;
    const hasOffset = Array.isArray(ast.limit.value) && ast.limit.seperator !== ',' && oVal !== undefined && String(oVal) !== '0' && String(oVal) !== '';
    resultChips.push({ kind: 'limit', text: ast.limit.raw ? String(ast.limit.raw) : `LIMIT ${lVal}${hasOffset ? ` OFFSET ${oVal}` : ''}` });
  }

  // 4.7 PROJECTION (SELECT Columns)
  const resultCols = ast.columns === '*' ? [{ name: '*' }] : (Array.isArray(ast.columns) ? ast.columns.map((col: any) => {
    const name = formatExpr(col.expr);
    // у колонки результата — метка источника (первый известный алиас в выражении)
    const src = firstKnownQualifier(name, aliasNodes)?.alias;
    usedTexts.push(name);
    // оконная колонка: на карточке выделяется (полный текст с PARTITION BY / ORDER BY остаётся в имени)
    const isWindow = /\bOVER\s*(\(|[A-Za-z_"`])/i.test(name.replace(/'(?:[^']|'')*'/g, "''"));
    return { name, alias: col.as, ...(src ? { src } : {}), ...(isWindow ? { window: true } : {}) };
  }) : [{ name: '*' }]);
  
  const distinctText = distinctLabel(ast.distinct);
  const projectionTitle = distinctText ? `Projection (${distinctText})` : 'Projection';
  ctx.nodes.push({
    id: resId, type: 'resultNode',
    data: { title: projectionTitle, columns: resultCols, ...(resultChips.length > 0 ? { chips: resultChips } : {}) },
    position: { x: 0, y: 0 }
  });
  addEdge(ctx, currentOutputId, resId);

  if (Array.isArray(ast.columns)) {
    ast.columns.forEach((col: any, cIdx: number) => {
       const colText = formatExpr(col.expr);
       processNestedQueries(colText, resId, `${prefix}proj_${cIdx}_`, dialect, ctx);
    });
  }

  // колонки на карточках источников — те, что запрос упоминает как alias.колонка (схема не нужна)
  if (aliasNodes.size > 0) {
    columnsByAlias(usedTexts, aliasNodes).forEach((list, nodeId) => {
      const node = findNode(ctx, nodeId);
      if (node && node.type === 'tableNode') node.data.columns = list;
    });
  }

  return resId;
}

/**
 * Текст для заголовка проекции: 'DISTINCT' / 'DISTINCT ON (выражение)' или null.
 * node-sql-parser для запроса без DISTINCT может вернуть не null, а объект `{ type: null }` —
 * такой объект DISTINCT не означает.
 */
export function distinctLabel(d: any): string | null {
  if (!d) return null;
  const type = typeof d === 'string' ? d : d.type;
  if (typeof type !== 'string' || !/^DISTINCT/i.test(type.trim())) return null;
  const t = type.trim().toUpperCase();
  return d.on ? `${t} (${d.on})` : t;
}

export function astToGraph(
  ast: any,
  prefix = 'main_',
  dialect = 'PostgreSQL',
  cteTableNodeIds: Record<string, string> = {},
  options: { collapsedQueries?: Set<string>; onToggleExpand?: (id: string) => void } = {}
): { nodes: GraphNode[]; edges: GraphEdge[]; outputId: string } {
  
  const ctx: GraphContext = { nodes: [], edges: [], cteOutputIds: { ...cteTableNodeIds }, options };

  if (!ast) return { nodes: ctx.nodes, edges: ctx.edges, outputId: '' };

  if (ast.type === 'multi_query') {
    let lastId = '';
    ast.queries.forEach((qAst: any, qIdx: number) => {
      const qId = `${prefix}q_${qIdx}`;
      if (options.collapsedQueries?.has(qId)) {
        let snippet = qAst.type || 'STATEMENT';
        if (qAst.type === 'select') snippet = 'SELECT ...';
        if (qAst.type === 'update') snippet = 'UPDATE ...';
        if (qAst.type === 'copy') snippet = 'COPY ...';
        if (qAst.type === 'create_as') snippet = 'CREATE ... AS';
        
        ctx.nodes.push({
          id: qId, type: 'queryGroupNode',
          data: { title: `Query ${qIdx + 1}`, queryText: snippet, queryId: qId, onToggle: options.onToggleExpand },
          position: { x: 0, y: 0 }
        });
        lastId = qId;
      } else {
        // Запросы файла независимы: между ними нет рёбер (иначе подсветка lineage тянулась бы из одного запроса в другой); раскладка ставит блоки запросов друг под другом (getLayoutedElements).
        // CTE живёт только внутри своего запроса: не переносим их в следующие запросы файла
        ctx.cteOutputIds = { ...cteTableNodeIds };
        const outId = buildDataPipeline(qAst, `${prefix}q${qIdx}_`, dialect, ctx);
        markFinal(ctx, outId);
        
        const collapseId = `${qId}_collapse`;
        ctx.nodes.push({
          id: collapseId, type: 'collapseNode',
          data: { title: `Query ${qIdx + 1}`, queryId: qId, onToggle: options.onToggleExpand },
          position: { x: 0, y: 0 }
        });
        
        
        // Заголовок запроса — подпись с кнопкой «Collapse», а не часть графа данных: рёбер у него нет
        // (не попадает в подсветку lineage); раскладка ставит его над блоком запроса.
        
        lastId = outId || collapseId;
      }
    });
    appendFrameNodes(ctx);
    return { nodes: ctx.nodes, edges: ctx.edges, outputId: lastId };
  }

  if (ast.type === 'procedure') {
     const procId = `${prefix}proc`;
     ctx.nodes.push({ id: procId, type: 'tableNode', data: { label: ast.name, title: 'PROCEDURE' }, position: { x: 0, y: 0 }});
     let lastStepId = procId;
     
     ast.steps.forEach((step: any, sIdx: number) => {
        if (step.parsedQuery) {
           ctx.cteOutputIds = { ...cteTableNodeIds };
           const stepOut = buildDataPipeline(step.parsedQuery, `${prefix}pstep_${sIdx}_`, dialect, ctx);
           markFinal(ctx, stepOut);
           addEdge(ctx, lastStepId, stepOut, 'executes');
           lastStepId = stepOut;
        } else {
           const sId = `${prefix}pstep_${sIdx}`;
           ctx.nodes.push({ id: sId, type: 'filterNode', data: { title: step.title, condition: step.text }, position: { x: 0, y: 0 }});
           addEdge(ctx, lastStepId, sId, 'executes');
           lastStepId = sId;
        }
     });

     appendFrameNodes(ctx);
     const cleanNodes = ctx.nodes.map(n => {
       const data = n.data || {};
       return {
         id: n.id,
         type: n.type,
         position: n.position || { x: 0, y: 0 },
         ...(n.zIndex !== undefined ? { zIndex: n.zIndex } : {}),
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
           onToggle: data.onToggle,
           chips: data.chips,
           final: data.final,
           tags: data.tags,
           warnings: data.warnings,
           kind: data.kind,
           name: data.name,
           members: data.members,
           parentFrame: data.parentFrame
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
       style: e.style,
       ...(e.data ? { data: e.data } : {})
     }));

     return { nodes: cleanNodes, edges: cleanEdges, outputId: lastStepId };
  }

  const finalId = buildDataPipeline(ast, prefix, dialect, ctx);
  markFinal(ctx, finalId);
  appendFrameNodes(ctx);

  const cleanNodes = ctx.nodes.map(n => {
    const data = n.data || {};
    return {
      id: n.id,
      type: n.type,
      position: n.position || { x: 0, y: 0 },
      ...(n.zIndex !== undefined ? { zIndex: n.zIndex } : {}),
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
        onToggle: data.onToggle,
        chips: data.chips,
           final: data.final,
           tags: data.tags,
           warnings: data.warnings,
        kind: data.kind,
        name: data.name,
        members: data.members,
        parentFrame: data.parentFrame
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
    style: e.style,
    ...(e.data ? { data: e.data } : {})
  }));

  return { nodes: cleanNodes, edges: cleanEdges, outputId: finalId };
}

/**
 * Раскладка графа: составной dagre (рамки — кластеры) и ортогональные маршруты стрелок (treeLayout.ts).
 * Файл из нескольких запросов раскладывается по блокам: каждый запрос отдельно.
 */
export function getLayoutedElements(nodes: GraphNode[], edges: GraphEdge[], direction = 'LR') {
  const isHorizontal = direction === 'LR';
  const layoutBlockTree = (blockNodes: GraphNode[], blockEdges: GraphEdge[]) =>
    layoutTreeBlock(blockNodes, blockEdges, direction === 'TB' ? 'TB' : 'LR', n => getNodeDimensions(n));

  const treeRoutes = new Map<string, RoutedEdge>();
  const treeFrames: Record<string, { x: number; y: number; width: number; height: number }> = {};

  // Файл из нескольких запросов (есть узлы-заголовки запросов): каждый запрос раскладывается отдельно,
  // при LR блоки идут друг под другом (общий левый край), при TB — друг за другом вправо (общий верхний край).
  const isMultiQuery = nodes.some(n => n.type === 'collapseNode' || n.type === 'queryGroupNode');
  const queryIndexOf = (id: string): number => {
    const m = /^(?:[A-Za-z0-9]+_)*?q_?(\d+)(?:_|$)/.exec(id);
    return m ? Number(m[1]) : -1;
  };

  const newPositions: Record<string, { x: number; y: number }> = {};
  if (isMultiQuery) {
    const QUERY_GAP = 60;
    const blocks = new Map<number, GraphNode[]>();
    for (const n of nodes) {
      const k = queryIndexOf(n.id);
      if (!blocks.has(k)) blocks.set(k, []);
      blocks.get(k)!.push(n);
    }
    let cursorY = 0;
    let cursorX = 0;
    for (const k of [...blocks.keys()].sort((a, b) => a - b)) {
      const allBlockNodes = blocks.get(k)!;
      // заголовок «Query N» без рёбер: в раскладку dagre не входит, ставится над блоком у левого края
      const headers = allBlockNodes.filter(n => n.type === 'collapseNode');
      const blockNodes = allBlockNodes.filter(n => n.type !== 'collapseNode');
      const ids = new Set(blockNodes.map(n => n.id));
      const blockEdges = edges.filter(e => ids.has(e.source) && ids.has(e.target));
      const treeLay = layoutBlockTree(blockNodes, blockEdges);
      const pos = treeLay.positions;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of blockNodes) {
        if (n.type === 'frameNode') continue;
        const p = pos[n.id];
        if (!p) continue;
        const d = getNodeDimensions(n);
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + d.width);
        maxY = Math.max(maxY, p.y + d.height);
      }
      // рамки выступают за карточки: учитываем их в границах блока
      for (const r of Object.values(treeLay.frames)) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      }
      if (!Number.isFinite(minX)) continue;
      const HEADER_GAP = 12;
      let headerH = 0;
      let headerW = 0;
      const baseX = isHorizontal ? 0 : cursorX;
      const baseY = isHorizontal ? cursorY : 0;
      for (const h of headers) {
        newPositions[h.id] = { x: baseX, y: baseY + headerH };
        const hd = getNodeDimensions(h);
        headerH += hd.height + HEADER_GAP;
        headerW = Math.max(headerW, hd.width);
      }
      const dx = baseX - minX;
      const dy = baseY + headerH - minY;
      for (const n of blockNodes) {
        const p = pos[n.id];
        if (p) newPositions[n.id] = { x: p.x + dx, y: p.y + dy };
      }
      for (const [fid, r] of Object.entries(treeLay.frames)) treeFrames[fid] = { ...r, x: r.x + dx, y: r.y + dy };
      for (const [eid, route] of treeLay.routes) treeRoutes.set(eid, shiftRoute(route, dx, dy));
      if (isHorizontal) cursorY += headerH + (maxY - minY) + QUERY_GAP;
      else cursorX += Math.max(headerW, maxX - minX) + QUERY_GAP;
    }
  } else {
    const treeLay = layoutBlockTree(nodes, edges);
    Object.assign(newPositions, treeLay.positions);
    Object.assign(treeFrames, treeLay.frames);
    for (const [eid, route] of treeLay.routes) treeRoutes.set(eid, route);
  }

  const newNodes: any[] = [];
  for (const node of nodes) {
    if (node.type === 'frameNode') {
      const r = treeFrames[node.id];
      if (!r) continue; // пустая рамка не рисуется
      newNodes.push({
        ...node,
        position: { x: r.x, y: r.y },
        data: { ...node.data, width: r.width, height: r.height },
        zIndex: -1,
        selectable: false,
        draggable: false,
        focusable: false,
      });
      continue;
    }
    const pos = newPositions[node.id];
    if (!pos) { newNodes.push(node); continue; }
    newNodes.push({
      ...node,
      targetPosition: isHorizontal ? 'left' as const : 'top' as const,
      sourcePosition: isHorizontal ? 'right' as const : 'bottom' as const,
      position: pos,
      // стрелки сами выбирают точки на сторонах карточки: точки подключения прячутся (см. index.css)
      className: 'tree-node',
    });
  }

  const newEdges = edges.map(e => ({
    ...e,
    type: 'mermaidEdge',
    data: { ...(e.data || {}), route: treeRoutes.get(e.id) },
  }));
  return { nodes: newNodes, edges: newEdges };
}
