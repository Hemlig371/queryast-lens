// Построение SQL-обёртки с фильтрами/сортировкой для таблицы результатов.
// Вынесено из App.tsx (этап A2) без изменения логики; activeEngine передаётся параметром.

export type SqlFilterOp = '=' | 'IS' | 'LIKE' | '!=' | '<>' | 'IS NULL' | 'IS NOT NULL';
export interface SqlFilter { colKey: string; op: SqlFilterOp; val: any }
export interface SqlSort { colKey: string; dir: 'ASC' | 'DESC' }

export function generateFilteredSortedSql(
  activeEngine: 'duckdb' | 'clickhouse',
  baseSql: string,
  filters: SqlFilter[],
  sorts: SqlSort[]
): string {
  let cleanSql = baseSql.trim().replace(/;+$/, '');
  if (!cleanSql) return '';

  // --- LAZY UNBOXING ---
  // If the query was already wrapped by a previous filter action, unwrap it to prevent nesting (matryoshka)
  const prefix = 'SELECT * FROM (\n';
  const suffixMarker = '\n) AS _filtered_query';
  if (cleanSql.toUpperCase().startsWith(prefix)) {
    const suffixIndex = cleanSql.lastIndexOf(suffixMarker);
    if (suffixIndex !== -1) {
      // Extract the inner original query. We can safely discard the old WHERE/ORDER BY 
      // because the 'filters' and 'sorts' arrays contain the complete updated state.
      cleanSql = cleanSql.substring(prefix.length, suffixIndex);
    }
  }
  // ----------------------

  if (filters.length === 0 && sorts.length === 0) return cleanSql;

  const whereClauses = filters.map(f => {
    const safeCol = f.colKey.replace(/"/g, '""');
    if (f.op === 'IS NULL') {
      return `("${safeCol}" IS NULL OR CAST("${safeCol}" AS ${activeEngine === 'clickhouse' ? 'String' : 'VARCHAR'}) = '')`;
    }
    if (f.op === 'IS NOT NULL') {
      return `("${safeCol}" IS NOT NULL AND CAST("${safeCol}" AS ${activeEngine === 'clickhouse' ? 'String' : 'VARCHAR'}) <> '')`;
    }
    if (f.op === '<>') {
      if (f.val === null || f.val === undefined) {
        return `"${safeCol}" IS NOT NULL`;
      }
      if (typeof f.val === 'number' || typeof f.val === 'boolean') {
        return `"${safeCol}" <> ${f.val}`;
      }
      const escapedVal = String(f.val).replace(/'/g, "''");
      return `"${safeCol}" <> '${escapedVal}'`;
    }
    if (f.op === 'LIKE') {
      if (f.val === null || f.val === undefined) {
        return `"${safeCol}" IS NOT NULL`;
      }
      const escapedVal = String(f.val).replace(/'/g, "''");
      return `LOWER(CAST("${safeCol}" AS ${activeEngine === 'clickhouse' ? 'String' : 'VARCHAR'})) LIKE LOWER('%${escapedVal}%')`;
    }
    if (f.val === null || f.val === undefined) {
      return f.op === '!=' ? `"${safeCol}" IS NOT NULL` : `"${safeCol}" IS NULL`;
    }
    if (typeof f.val === 'number' || typeof f.val === 'boolean') {
      return `"${safeCol}" ${f.op} ${f.val}`;
    }
    const escapedVal = String(f.val).replace(/'/g, "''");
    return `"${safeCol}" ${f.op} '${escapedVal}'`;
  });

  const orderClauses = sorts.map(s => `"${s.colKey.replace(/"/g, '""')}" ${s.dir}`);

  let wrappedSql = `SELECT * FROM (\n${cleanSql}\n) AS _filtered_query`;
  if (whereClauses.length > 0) {
    wrappedSql += `\nWHERE ${whereClauses.join(' AND ')}`;
  }
  if (orderClauses.length > 0) {
    wrappedSql += `\nORDER BY ${orderClauses.join(', ')}`;
  }

  return wrappedSql;
}
