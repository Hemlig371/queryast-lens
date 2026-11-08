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

export function installDatagridViewport(viewer: HTMLElement) {
  const installed = new Map<any, () => void>();
  const refresh = () => {
    const current = new Set<any>();
    for (const child of viewer.children) {
      if (child.tagName !== 'PERSPECTIVE-VIEWER-DATAGRID') continue;
      const grid = (child as any).regular_table;
      if (!grid) continue;
      current.add(grid);
      if (!installed.has(grid)) installed.set(grid, keepDataColumn(grid));
    }
    for (const [grid, dispose] of installed) if (!current.has(grid)) { dispose(); installed.delete(grid); }
  };
  const observer = new viewer.ownerDocument.defaultView!.MutationObserver(refresh);
  observer.observe(viewer, {childList: true});
  refresh();
  return () => { observer.disconnect(); for (const dispose of installed.values()) dispose(); installed.clear(); };
}
