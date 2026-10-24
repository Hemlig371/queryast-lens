// Раскладка графа в режимах tree/detail: составной dagre (рамки — кластеры) + ортогональные маршруты стрелок из edgePath.ts —
// тем же кодом, что строит линии Mermaid-графа. Модуль чистый (без React).

import dagre from 'dagre';
import { routeEdges, type RoutedEdge, type RouteNode } from './edgePath';

export interface TreeLayoutNode {
  id: string;
  type: string;
  data: any;
}

export interface TreeLayoutEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: any;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreeBlockLayout {
  /** левый верхний угол каждого обычного узла */
  positions: Record<string, { x: number; y: number }>;
  /** рамки (узлы frameNode): положение и размер */
  frames: Record<string, Rect>;
  /** маршруты стрелок по id ребра */
  routes: Map<string, RoutedEdge>;
}

// Отступы рамки вокруг содержимого и высота заголовка — как у рамок подграфов Mermaid
export const FRAME_PAD_X = 28;
export const FRAME_PAD_Y = 24;
export const FRAME_HEADER = 24;

const EDGE_LABEL_CHAR_W = 7;

export function shiftRoute(r: RoutedEdge, dx: number, dy: number): RoutedEdge {
  const mv = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy });
  return {
    ...r,
    start: mv(r.start),
    end: mv(r.end),
    inner: r.inner.map(mv),
    srcPos: mv(r.srcPos),
    dstPos: mv(r.dstPos),
    label: r.label ? { ...r.label, x: r.label.x + dx, y: r.label.y + dy } : undefined,
  };
}

/** Заголовок рамки: «CTE · имя» или «Subquery · алиас» (подзапрос и производная таблица — одно и то же). */
export function frameTitle(data: any): string {
  const kind = data?.kind === 'cte' ? 'CTE' : 'Subquery';
  return data?.name ? `${kind} · ${data.name}` : kind;
}

function finite(n: any): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

export function layoutTreeBlock(
  nodes: TreeLayoutNode[],
  edges: TreeLayoutEdge[],
  direction: 'LR' | 'TB',
  sizeOf: (n: TreeLayoutNode) => { width: number; height: number }
): TreeBlockLayout {
  const frameNodes = nodes.filter(n => n.type === 'frameNode');
  const plainNodes = nodes.filter(n => n.type !== 'frameNode');
  const plainIds = new Set(plainNodes.map(n => n.id));

  // рамка -> непустое ли содержимое (свои узлы или вложенные рамки)
  const frameById = new Map(frameNodes.map(f => [f.id, f]));
  const ownMembers = new Map<string, string[]>();
  for (const f of frameNodes) {
    ownMembers.set(f.id, (Array.isArray(f.data?.members) ? f.data.members : []).filter((id: string) => plainIds.has(id)));
  }
  const hasContent = new Map<string, boolean>();
  const contentOf = (id: string, seen = new Set<string>()): boolean => {
    if (hasContent.has(id)) return hasContent.get(id)!;
    if (seen.has(id)) return false;
    seen.add(id);
    let ok = (ownMembers.get(id) || []).length > 0;
    if (!ok) {
      for (const f of frameNodes) {
        if (f.data?.parentFrame === id && contentOf(f.id, seen)) { ok = true; break; }
      }
    }
    hasContent.set(id, ok);
    return ok;
  };
  const liveFrames = frameNodes.filter(f => contentOf(f.id));
  const liveIds = new Set(liveFrames.map(f => f.id));

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    // между колонками узлов — место для изломов стрелок и подписей
    ranksep: 84,
    ranker: 'tight-tree',
  });

  for (const f of liveFrames) g.setNode(f.id, { label: frameTitle(f.data), clusterNode: true });
  for (const f of liveFrames) {
    const p = f.data?.parentFrame;
    if (p && liveIds.has(p)) g.setParent(f.id, p);
  }
  const dims = new Map<string, { width: number; height: number }>();
  for (const n of plainNodes) {
    const d = sizeOf(n);
    dims.set(n.id, d);
    g.setNode(n.id, { width: d.width, height: d.height });
  }
  for (const f of liveFrames) {
    for (const id of ownMembers.get(f.id) || []) g.setParent(id, f.id);
  }

  const usable = edges.filter(e => plainIds.has(e.source) && plainIds.has(e.target) && e.source !== e.target);
  for (const e of usable) {
    // подпись стрелки занимает место в раскладке: иначе она ложится на короткую линию
    const label = e.label ? String(e.label) : '';
    g.setEdge(
      e.source,
      e.target,
      label ? { width: Math.min(420, Math.max(28, Math.ceil(label.length * EDGE_LABEL_CHAR_W) + 16)), height: 22, labelpos: 'c' } : {}
    );
  }

  try {
    dagre.layout(g);
  } catch (err) {
    console.warn('Dagre layout warning:', err);
  }

  const rects = new Map<string, Rect>();
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of plainNodes) {
    const d = dims.get(n.id)!;
    const l: any = g.node(n.id);
    const ok = l && finite(l.x) && finite(l.y);
    const x = ok ? l.x - d.width / 2 : 0;
    const y = ok ? l.y - d.height / 2 : 0;
    rects.set(n.id, { x, y, width: d.width, height: d.height });
    positions[n.id] = { x, y };
  }

  // рамки считаем снизу вверх: вложенная рамка лежит внутри внешней с отступом
  const depthOf = (id: string): number => {
    let d = 0;
    let cur: string | undefined = frameById.get(id)?.data?.parentFrame;
    while (cur && liveIds.has(cur) && d < 50) { d++; cur = frameById.get(cur)?.data?.parentFrame; }
    return d;
  };
  const frames: Record<string, Rect> = {};
  for (const f of [...liveFrames].sort((a, b) => depthOf(b.id) - depthOf(a.id))) {
    const inner: Rect[] = [];
    for (const id of ownMembers.get(f.id) || []) {
      const r = rects.get(id);
      if (r) inner.push(r);
    }
    for (const c of liveFrames) {
      if (c.data?.parentFrame === f.id && frames[c.id]) inner.push(frames[c.id]);
    }
    if (inner.length === 0) continue;
    const minX = Math.min(...inner.map(r => r.x));
    const minY = Math.min(...inner.map(r => r.y));
    const maxX = Math.max(...inner.map(r => r.x + r.width));
    const maxY = Math.max(...inner.map(r => r.y + r.height));
    frames[f.id] = {
      x: minX - FRAME_PAD_X,
      y: minY - FRAME_PAD_Y - FRAME_HEADER,
      width: maxX - minX + FRAME_PAD_X * 2,
      height: maxY - minY + FRAME_PAD_Y * 2 + FRAME_HEADER,
    };
  }

  const routeNodes: RouteNode[] = plainNodes.map(n => ({ id: n.id, ...rects.get(n.id)!, shape: 'rectangle' }));
  const routeInputs = usable.map(e => {
    let points: Array<{ x: number; y: number }> | undefined;
    try {
      const le: any = g.edge(e.source, e.target);
      if (le?.points?.length) points = le.points;
    } catch {
      /* ребро без раскладки — маршрут строится без подсказок dagre */
    }
    const dashed = !!(e.style && e.style.strokeDasharray);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      points,
      label: e.label ? String(e.label) : '',
      // обычные стрелки с одной целью и без подписи сливаются в одну линию на входе
      bus: !e.label && !dashed ? 'plain' : undefined,
    };
  });
  const boxes = liveFrames
    .filter(f => frames[f.id])
    .map(f => ({ ...frames[f.id], title: frameTitle(f.data) }));
  let routes = new Map<string, RoutedEdge>();
  try {
    routes = routeEdges(direction, routeNodes, routeInputs, boxes);
  } catch (err) {
    console.warn('Edge routing warning:', err);
  }

  return { positions, frames, routes };
}
