import type {AsyncDuckDBConnection} from '@duckdb/duckdb-wasm';
import {quoteIdentifier} from './transport';

/** Perspective 5.8 asks for a base metric's range, while DuckDB PIVOT stores
 * split-value|metric columns. Resolve physical names only for split metrics.
 */
export function installPivotMinMax(handler: any, connection: Pick<AsyncDuckDBConnection, 'query'>) {
  const original = handler.viewGetMinMax;
  handler.viewGetMinMax = async function(viewId: string, column: string, config: any) {
    const metrics: string[] = config.columns ?? [];
    if (!config.split_by?.length || !metrics.includes(column)) {
      return original.call(this, viewId, column, config);
    }
    const schema: Record<string, string> = await this.tableSchema(viewId);
    const columns = Object.keys(schema).filter(name => {
      // Metric names can contain '|': prefer the longest matching base name.
      const candidates = metrics.filter(metric => name === metric || name.endsWith(`|${metric}`));
      return candidates.sort((a, b) => b.length - a.length)[0] === column;
    });
    if (!columns.length) return {min: null, max: null};
    const aggregate = (operation: 'MIN' | 'MAX', combine: 'LEAST' | 'GREATEST') => {
      const parts = columns.map(name => `${operation}(${quoteIdentifier(name)})`);
      const value = parts.length === 1 ? parts[0] : `${combine}(${parts.join(', ')})`;
      // Match Perspective's numeric representation, including DuckDB HUGEINT sums.
      return ['integer', 'float'].includes(schema[columns[0]]) ? `CAST(${value} AS DOUBLE)` : value;
    };
    const where = config.group_by?.length && config.group_rollup_mode !== 'flat'
      ? ' WHERE "__GROUPING_ID__" = 0' : '';
    const sql = `SELECT ${aggregate('MIN', 'LEAST')} AS min, ${aggregate('MAX', 'GREATEST')} AS max FROM ${quoteIdentifier(viewId)}${where}`;
    const row = (await connection.query(sql)).toArray()[0].toJSON();
    return {min: row.min ?? null, max: row.max ?? null};
  };
}
