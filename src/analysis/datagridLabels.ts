/** Display-only label for the SDK's synthetic rollup root, never source values.
 * regular-table recycles cells, so restore translated text when a cell changes role.
 */
export function installDatagridLabels(grid: any, language: string) {
  if (language !== 'ru' || typeof grid.addStyleListener !== 'function') return () => {};
  const translated = new Map<Text, HTMLElement>();
  const isTotal = (cell: HTMLElement) => {
    if (grid.classList.contains('flat-group-rollup-mode')) return false;
    const meta = grid.getMeta(cell);
    return meta?.type === 'row_header' && meta.row_header_x === 0 &&
      String(meta.row_header?.[0]) === 'TOTAL' &&
      meta.row_header.slice(1).every((value: unknown) => value === undefined);
  };
  const restore = (node: Text) => { if (node.data === 'Итого') node.data = 'TOTAL'; };
  const unsubscribe = grid.addStyleListener(() => {
    for (const [node, cell] of translated) {
      if (!grid.contains(node) || !isTotal(cell) || node.data !== 'Итого') {
        restore(node); translated.delete(node);
      }
    }
    for (const cell of grid.querySelectorAll('tbody th')) {
      if (!isTotal(cell)) continue;
      const walker = grid.ownerDocument.createTreeWalker(cell, 4 /* SHOW_TEXT */);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) if (node.data === 'TOTAL') {
        node.data = 'Итого'; translated.set(node, cell);
      }
    }
  });
  return () => { unsubscribe(); for (const node of translated.keys()) restore(node); translated.clear(); };
}
