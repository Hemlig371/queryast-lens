/** Compatibility for Perspective 5.8.0 DuckDB virtual date pivot headers.
 * DuckDB emits ISO dates in column paths; Datagrid's date formatter expects epoch ms.
 * Keep column identities and export data unchanged; normalize only typed header values.
 */
export function normalizeDateSplitPaths(
  paths: (string | number | boolean | null)[][],
  splitBy: string[],
  schema: Record<string, string>,
) {
  return paths.map((level, index) => schema[splitBy[index]] === 'date'
    ? level.map(value => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const epoch = Date.parse(`${value}T00:00:00Z`);
      return Number.isFinite(epoch) ? epoch : value;
    })
    : level);
}

/** Scoped to the loaded runtime and restored when its owning Viewer is disposed. */
export function installDateSplitPathCompatibility(View: any, schema: Record<string, string>) {
  const original = View.prototype.column_paths;
  const wrapped = async function(this: any, ...args: unknown[]) {
    const [paths, config] = await Promise.all([
      original.apply(this, args), this.get_config(),
    ]);
    return normalizeDateSplitPaths(paths, config.split_by, schema);
  };
  View.prototype.column_paths = wrapped;
  return () => {
    if (View.prototype.column_paths === wrapped) View.prototype.column_paths = original;
  };
}
