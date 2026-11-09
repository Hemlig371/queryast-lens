/** Seed normal resizable widths using regular-table's public sizing API.
 * Never replace an existing override, including a user's wider column.
 */
export function installInitialColumnWidths(grid: any) {
  if (typeof grid.addStyleListener !== 'function') return () => {};
  const win = grid.ownerDocument.defaultView;
  let frame = 0, disposed = false;
  const unsubscribe = grid.addStyleListener(() => {
    const sizes = grid.saveColumnSizes();
    const maximum = Math.min(320, Math.max(80, grid.clientWidth * 0.45));
    let changed = false;
    for (const cell of grid.querySelectorAll('th,td')) {
      const key = grid.getMeta(cell)?.size_key;
      if (key === undefined || cell.colSpan > 1 || sizes[key] !== undefined) continue;
      if (cell.offsetWidth > maximum) {
        sizes[key] = maximum;
        changed = true;
      }
    }
    if (!changed) return;
    grid.restoreColumnSizes(sizes);
    if (!frame) frame = win.requestAnimationFrame(async () => {
      frame = 0;
      if (disposed) return;
      // First apply widths, then replan the data window using measured widths.
      await grid.draw({invalid_viewport:true});
      if (!disposed) await grid.draw({invalid_viewport:true});
    });
  });
  return () => { disposed = true; win.cancelAnimationFrame(frame); unsubscribe(); };
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
      if (!installed.has(grid)) installed.set(grid, installInitialColumnWidths(grid));
    }
    for (const [grid, dispose] of installed) if (!current.has(grid)) { dispose(); installed.delete(grid); }
  };
  const observer = new viewer.ownerDocument.defaultView!.MutationObserver(refresh);
  observer.observe(viewer, {childList: true});
  refresh();
  return () => { observer.disconnect(); for (const dispose of installed.values()) dispose(); installed.clear(); };
}
