// Выбранный узел графа хранится как id: объект узла устаревал после перестроения графа.

interface HasId { id: string }

/** Узел по умолчанию: узел результата (id оканчивается на `result`), иначе первый. */
export function defaultSelectedNodeId(nodes: HasId[]): string | null {
  if (nodes.length === 0) return null;
  const result = nodes.find((n) => n.id.endsWith('result'));
  return (result ?? nodes[0]).id;
}

/** Выбор после перестроения графа: сохраняется, если такой узел остался, иначе — узел по умолчанию. */
export function reconcileSelectedNodeId(prevId: string | null, nodes: HasId[]): string | null {
  if (prevId !== null && nodes.some((n) => n.id === prevId)) return prevId;
  return defaultSelectedNodeId(nodes);
}

/** Актуальный объект выбранного узла из текущего списка узлов. */
export function findSelectedNode<T extends HasId>(nodes: T[], selectedId: string | null): T | null {
  if (selectedId === null) return null;
  return nodes.find((n) => n.id === selectedId) ?? null;
}
