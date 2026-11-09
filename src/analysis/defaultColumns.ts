/** Compatibility fixes scoped to the Lens handler, never to the shared DB or SDK sources. */
export function installDefaultColumns(handler: any) {
  const original = handler.tableMakeView;
  handler.tableMakeView = async function(tableId: string, viewId: string, config: any) {
    // The stock HTML exporter requests table.view() with no columns.
    const implicit = !config.columns?.length && !config.group_by?.length && !config.split_by?.length;
    const columns = implicit ? Object.keys(await this.tableSchema(tableId)) : undefined;
    return original.call(this, tableId, viewId, columns ? {...config, columns} : config);
  };
  if (handler.tableDescribe) {
    const describe = handler.tableDescribe;
    handler.tableDescribe = async function(tableId: string, config: any) {
      // Opening New Column validates a blank draft: this is an inline editor
      // validation, not an executable SELECT with an empty projection.
      const blank = Object.entries(config.expressions ?? {}).filter(([,value]) => typeof value === 'string' && !value.trim());
      if (blank.length) return {expression_schema: {}, expression_errors: Object.fromEntries(blank.map(([name]) =>
        [name, {error_message: 'Enter an expression', line: 0, column: 0}]))};
      return describe.call(this, tableId, config);
    };
  }
  if (handler.getFeatures) {
    const getFeatures = handler.getFeatures;
    handler.getFeatures = function() {
      const features = getFeatures.call(this);
      const aggregates = {...features.aggregates};
      // DuckDB countif accepts BOOLEAN, not VARCHAR or numeric arguments.
      for (const type of ['integer','float','string','date','datetime']) {
        if (aggregates[type]) aggregates[type] = aggregates[type].filter((name: string) => name !== 'countif');
      }
      return {...features, aggregates};
    };
  }
}
