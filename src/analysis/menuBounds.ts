/** Keep SDK popovers inside the visible Viewer, including when Lens uses CSS zoom. */
export function installMenuBounds(viewer: HTMLElement) {
  const win = viewer.ownerDocument.defaultView!;
  const offsets = new WeakMap<HTMLElement, {x: number; y: number}>();
  const observed = new Set<HTMLElement>();
  let frame = 0;
  let disposed = false;
  const set = (node: HTMLElement, key: string, value: string) => {
    if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
  };
  const update = () => {
    frame = 0;
    const bounds = viewer.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const top = Math.max(8, bounds.top + 8);
    const bottom = Math.min(win.innerHeight - 8, bounds.bottom - 8);
    const left = Math.max(8, bounds.left + 8);
    const right = Math.min(win.innerWidth - 8, bounds.right - 8);
    for (const node of viewer.querySelectorAll<HTMLElement>('perspective-export-menu,perspective-copy-menu')) {
      if (!observed.has(node)) { observed.add(node); resize?.observe(node); }
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const scale = node.offsetWidth ? rect.width / node.offsetWidth : 1;
      set(node, 'max-height', `${Math.max(1, bottom - top) / scale}px`);
      set(node, 'max-width', `${Math.max(1, right - left) / scale}px`);
      set(node, 'overflow', 'auto');
      const current = node.getBoundingClientRect();
      const old = offsets.get(node) ?? {x: 0, y: 0};
      const x = Math.max(left, Math.min(current.left - old.x, right - current.width)) - (current.left - old.x);
      const y = Math.max(top, Math.min(current.top - old.y, bottom - current.height)) - (current.top - old.y);
      offsets.set(node, {x, y});
      set(node, 'translate', `${x / scale}px ${y / scale}px`);
    }
    for (const node of observed) if (!viewer.contains(node)) { resize?.unobserve(node); observed.delete(node); }
  };
  const schedule = () => { if (!disposed && !frame) frame = win.requestAnimationFrame(update); };
  const resize = win.ResizeObserver ? new win.ResizeObserver(schedule) : undefined;
  const selector = 'perspective-export-menu,perspective-copy-menu';
  const changes = new win.MutationObserver(records => {
    const isMenu = (node: Node) => node instanceof win.Element && (node.matches(selector) || !!node.querySelector(selector));
    if (records.some(record => record.type === 'attributes'
      ? (record.target as Element).matches(selector)
      : [...record.addedNodes, ...record.removedNodes].some(isMenu))) schedule();
  });
  changes.observe(viewer, {childList: true, subtree: true, attributes: true, attributeFilter: ['style']});
  win.addEventListener('resize', schedule);
  viewer.addEventListener('mousedown', schedule, true);
  schedule();
  return () => {
    disposed = true;
    win.cancelAnimationFrame(frame);
    changes.disconnect(); resize?.disconnect(); observed.clear();
    win.removeEventListener('resize', schedule);
    viewer.removeEventListener('mousedown', schedule, true);
  };
}
