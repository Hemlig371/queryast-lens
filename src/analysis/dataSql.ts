import {quoteIdentifier} from './transport';
import {splitSqlSegments} from '../utils/sqlTokens';

function projectedColumns(query: string) {
  let head = '';
  for (const segment of splitSqlSegments(query, {backslashEscapes:false})) {
    const from = segment.type==='code' ? /\bFROM\b/i.exec(segment.text) : null;
    if (from) { head += segment.text.slice(0,from.index); break; }
    head += segment.text;
  }
  if (!/^\s*SELECT\s+/i.test(head)) throw new Error('projection');
  const names: string[] = [];
  for (const segment of splitSqlSegments(head.replace(/^\s*SELECT\s+/i,''),{backslashEscapes:false})) {
    if (segment.type==='string' && /^"(?:""|[^"])*"$/.test(segment.text)) names.push(segment.text.slice(1,-1).replaceAll('""','"'));
    else if (segment.type!=='code' || !/^[\s,]*$/.test(segment.text)) throw new Error('projection');
  }
  return names;
}

/** A read-only CTE over the SDK's original construction, before tree visibility
 * UPDATEs. Deliberately refuse derived-table chains with physical row identities.
 */
export function buildDataSql(statements: string[], config: any, schema: Record<string,string>, query: string) {
  const creates = statements.filter(sql => /^\s*CREATE\b/i.test(sql));
  if (creates.length !== 1) throw new Error('derived');
  const match = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TEMP(?:ORARY)?\s+TABLE\s+(?:"(?:""|[^"])+"|[A-Za-z_][A-Za-z_0-9$]*)\s+AS\s*\(([\s\S]*)\)\s*;?\s*$/i.exec(creates[0]);
  if (!match) throw new Error('template');
  const prefix = 'SELECT *, FALSE AS "__HIDDEN__" FROM (';
  const suffix = ') AS __PSP_EXPAND_SRC__';
  const wrapped = match[1];
  if (!wrapped.startsWith(prefix) || !wrapped.endsWith(suffix)) throw new Error('template');
  const body = wrapped.slice(prefix.length, -suffix.length);
  const metrics = projectedColumns(query).filter(name => !name.startsWith('__'));
  if (metrics.some(name=>!Object.hasOwn(schema,name))) throw new Error('projection');
  const used = new Set(metrics);
  const alias = (name: string) => {
    let result = name;
    for (let n=2; used.has(result); n++) result = `${name}_${n}`;
    used.add(result); return result;
  };
  const groups: string[] = config.group_by ?? [];
  const projection = groups.map((name,index) => `${quoteIdentifier(`__ROW_PATH_${index}__`)} AS ${quoteIdentifier(alias(name))}`);
  if (groups.length && config.group_rollup_mode !== 'flat') {
    projection.push(`"__GROUPING_ID__" AS ${quoteIdentifier(alias('grouping_id'))}`);
  }
  projection.push(...metrics.map(quoteIdentifier));
  if (!projection.length) throw new Error('projection');
  const stage = groups.length || config.split_by?.length ? 'aggregated_data' : 'prepared_data';
  return `WITH ${stage} AS (\n${body}\n)\nSELECT\n${projection.join(',\n')}\nFROM ${stage};`;
}
