import {splitSqlSegments} from '../utils/sqlTokens';

// DuckDB ignores whitespace and case in unquoted names. Everything else must
// retain the same lexical tokens, especially literals, quoted names and operators.
function tokens(sql: string) {
  return splitSqlSegments(sql,{backslashEscapes:false}).flatMap(segment => {
    if (segment.type.endsWith('comment')) return [];
    if (segment.type === 'string') return [segment.text];
    return (segment.text.match(/[A-Za-z_][A-Za-z_0-9$]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|->>|->|::|<=|>=|<>|!=|:=|\|\||\S/g) ?? []).map(token=>/^[A-Za-z_][A-Za-z_0-9$]*$/.test(token)?token.toLowerCase():token);
  });
}

/** Formatting is optional; any unexpected token change keeps the SDK script. */
export async function formatReplaySql(sql: string, format: (sql:string)=>Promise<string>) {
  try {
    const result = await format(sql);
    return JSON.stringify(tokens(sql)) === JSON.stringify(tokens(result)) ? result : sql;
  } catch { return sql; }
}
