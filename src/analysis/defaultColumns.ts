/** Perspective 5.8's native HTML exporter requests table.view() with no columns.
 * Its DuckDB SQL builder needs an explicit projection for that default view.
 * Keep this compatibility fix scoped to the Lens handler, not the shared DB.
 */
export function installDefaultColumns(handler: any) {
  const original = handler.tableMakeView;
  handler.tableMakeView = async function(tableId: string, viewId: string, config: any) {
    const implicit = !config.columns?.length && !config.group_by?.length && !config.split_by?.length;
    const columns = implicit ? Object.keys(await this.tableSchema(tableId)) : undefined;
    return original.call(this, tableId, viewId, columns ? {...config, columns} : config);
  };
}
