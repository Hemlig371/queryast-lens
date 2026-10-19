/** Свойства узла графа, важные для сравнения при мемоизации (подмножество props React Flow). */
export interface NodePropsLike {
  data: any;
  selected?: boolean;
  targetPosition?: unknown;
  sourcePosition?: unknown;
}

/** Сравнение props узла для React.memo: выделение, позиции точек подключения и поверхностное сравнение `data`. */
export function isNodePropsEqual(prevProps: NodePropsLike, nextProps: NodePropsLike): boolean {
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.targetPosition !== nextProps.targetPosition) return false;
  if (prevProps.sourcePosition !== nextProps.sourcePosition) return false;
  if (prevProps.data === nextProps.data) return true;
  if (!prevProps.data || !nextProps.data) return prevProps.data === nextProps.data;

  // Shallow compare data keys
  const keysA = Object.keys(prevProps.data);
  const keysB = Object.keys(nextProps.data);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (prevProps.data[key] !== nextProps.data[key]) return false;
  }
  return true;
}
