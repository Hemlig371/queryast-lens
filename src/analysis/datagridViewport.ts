import {installDatagridLabels} from './datagridLabels';

/** Seed normal resizable widths using regular-table's public sizing API.
 * Never replace an existing override, including a user's wider column.
 */
export function installInitialColumnWidths(grid: any) {
  if (typeof grid.addStyleListener !== 'function') return () => {};
  const win = grid.ownerDocument.defaultView;
  let frame = 0, disposed = false;
  const pending = new Map<number,number>();
  const unsubscribe = grid.addStyleListener(() => {
    if (!grid.clientWidth) return;
    const sizes = grid.saveColumnSizes();
    const maximum = Math.min(480, Math.max(80, grid.clientWidth * 0.675));
    for (const cell of grid.querySelectorAll('th,td')) {
      const meta = grid.getMeta(cell);
      const key = meta?.size_key;
      if (key === undefined || cell.colSpan > 1 || sizes[key] !== undefined) continue;
      // Tree labels may have max-width:0 while their content sizes the column.
      if (Math.max(cell.offsetWidth, cell.scrollWidth) > maximum) pending.set(key, maximum);
    }
    if (!pending.size || frame) return;
    frame = win.requestAnimationFrame(async () => {
      try {
        // The SDK reconciles persisted widths during draw. Apply defaults only
        // AFTER that draw, so it cannot discard them as stale projection widths.
        await grid.flush();
        if (disposed) return;
        const current = grid.saveColumnSizes();
        let changed = false;
        for (const [key, width] of pending) if (current[key] === undefined) {
          current[key] = width;
          changed = true;
        }
        pending.clear();
        if (changed) {
          grid.restoreColumnSizes(current);
          await grid.draw({invalid_viewport:true});
          // Replan horizontal virtualization with the newly measured widths.
          if (!disposed) await grid.draw({invalid_viewport:true});
        }
      } catch (error) {
        pending.clear();
        if (!disposed) console.warn('Analysis column sizing', error);
      } finally {
        // A failed/replaced View must not lock all future sizing passes.
        frame = 0;
      }
    });
  });
  return () => { disposed = true; pending.clear(); win.cancelAnimationFrame(frame); unsubscribe(); };
}

export function installDatagridViewport(viewer: HTMLElement, language = 'en') {
  const installed = new Map<any, () => void>();
  const refresh = () => {
    const current = new Set<any>();
    for (const child of viewer.children) {
      if (child.tagName !== 'PERSPECTIVE-VIEWER-DATAGRID') continue;
      const grid = (child as any).regular_table;
      if (!grid) continue;
      current.add(grid);
      if (!installed.has(grid)) {
        const widths = installInitialColumnWidths(grid);
        const labels = installDatagridLabels(grid, language);
        installed.set(grid, () => { labels(); widths(); });
      }
    }
    for (const [grid, dispose] of installed) if (!current.has(grid)) { dispose(); installed.delete(grid); }
  };
  const observer = new viewer.ownerDocument.defaultView!.MutationObserver(refresh);
  observer.observe(viewer, {childList: true});
  refresh();
  return () => { observer.disconnect(); for (const dispose of installed.values()) dispose(); installed.clear(); };
}
