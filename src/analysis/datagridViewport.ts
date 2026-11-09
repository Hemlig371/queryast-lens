/** regular-table 0.9.2 can plan an empty data window when row headers exceed
 * the viewport width. Keep one real data column so the grid still fetches rows.
 * Instance-only: no global prototype changes, truncation or virtualization reset.
 */
export function keepDataColumn(grid: any) {
  const original = grid._plan_column_extent;
  if (typeof original !== 'function') return () => {};
  const wrapped = function(this: any, viewport: any, columns: number) {
    const end = original.call(this, viewport, columns);
    const start = Math.floor(viewport.start_col);
    return this._virtual_mode !== 'none' && this._virtual_mode !== 'vertical' &&
      end === start && start >= 0 && start < columns ? start + 1 : end;
  };
  grid._plan_column_extent = wrapped;
  return () => { if (grid._plan_column_extent === wrapped) grid._plan_column_extent = original; };
}

/** Seed an ordinary resizable width only when automatic sizing is excessive.
 * Existing/user overrides always win, including widths larger than this default.
 */
export function installInitialColumnWidths(grid: any) {
  let model: any, original: any, wrapped: any;
  const attach = () => {
    if(model===grid.table_model)return;
    if(model && model.autosize_cells===wrapped)model.autosize_cells=original;
    model=grid.table_model;
    original=model?.autosize_cells;
    if(typeof original!=='function')return;
    const autosize=original;
    wrapped = function(this: any, ...args: any[]) {
      const result = autosize.apply(this,args);
      const sizes = grid._column_sizes;
      const maximum = Math.min(320,Math.max(80,(grid.clientWidth||720)*0.45));
      for (const key of Object.keys(sizes.auto)) {
        if (sizes.override[key] === undefined && sizes.auto[key] > maximum) {
          sizes.override[key] = maximum;
          sizes.indices[key] = maximum;
        }
      }
      return result;
    };
    model.autosize_cells = wrapped;
  };
  const create=grid._create_table_model;
  const recreate=function(this:any,...args:any[]) {const result=create.apply(this,args);attach();return result;};
  if(typeof create==='function')grid._create_table_model=recreate;
  attach();
  return () => {
    if(model && model.autosize_cells===wrapped)model.autosize_cells=original;
    if(grid._create_table_model===recreate)grid._create_table_model=create;
  };
}

export function installDatagridViewport(viewer: HTMLElement) {
  const installed = new Map<any, () => void>();
  const refresh = () => {
    const current = new Set<any>();
    for (const child of viewer.children) {
      if (child.tagName !== 'PERSPECTIVE-VIEWER-DATAGRID') continue;
      const grid = (child as any).regular_table;
      if (!grid) continue;
      current.add(grid);
      if (!installed.has(grid)) {
        const viewport = keepDataColumn(grid);
        const widths = installInitialColumnWidths(grid);
        installed.set(grid,()=>{widths();viewport();});
      }
    }
    for (const [grid, dispose] of installed) if (!current.has(grid)) { dispose(); installed.delete(grid); }
  };
  const observer = new viewer.ownerDocument.defaultView!.MutationObserver(refresh);
  observer.observe(viewer, {childList: true});
  refresh();
  return () => { observer.disconnect(); for (const dispose of installed.values()) dispose(); installed.clear(); };
}
