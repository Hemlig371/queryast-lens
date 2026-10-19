// Размеры узлов графа. Раскладка (getLayoutedElements) и экспорт Draw.io используют одну функцию.

export interface SizedNodeLike {
  type?: string;
  data?: any;
}

export const getNodeDimensions = (node: SizedNodeLike): { width: number; height: number } => {
  let width = 256; // Tailwind w-64
  let height = 90;

  if (['resultNode', 'filterNode', 'havingNode'].includes(node.type ?? '')) {
    const rows = node.data?.columns?.length || 1;
    height = Math.min(280, 70 + rows * 45);
  } else if (node.type === 'tableNode') {
    const rows = node.data?.columns?.length || 1;
    height = Math.min(250, 90 + rows * 30);
  } else if (['limitNode', 'sortNode'].includes(node.type ?? '')) {
    height = 70;
  } else if (node.type === 'joinNode') {
    height = 100;
  } else if (node.type === 'collapseNode') {
    width = 220; // компактный заголовок запроса
    height = 32;
  }

  return { width, height };
};
