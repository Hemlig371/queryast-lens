import dagre from 'dagre';
import {
  formatMermaidIssue,
  type MermaidIR,
  type MermaidIssue,
  type MermaidNodeIR,
  type MermaidEdgeIR,
  type MermaidSubgraphIR,
} from './mermaidParse';
import { t } from './i18n';
import { parseDiagram, erEntityMetrics } from './erParse';
import { routeEdges, flowSides, type RoutedEdge, type RouteNode } from './edgePath';

export interface MermaidParsedResult {
  nodes: any[];
  edges: any[];
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  error?: string;
  /** непонятые выражения, пропущенные при разборе (граф при этом построен) */
  warnings?: MermaidIssue[];
}

// ---------------------------------------------------------------------------
// Раскладка (общая для React Flow и статичного SVG в Markdown)
// ---------------------------------------------------------------------------

export interface MermaidLayoutNode {
  node: MermaidNodeIR;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MermaidLayoutGroup {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MermaidLayout {
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  nodes: MermaidLayoutNode[];
  groups: MermaidLayoutGroup[];
  /** итоговые маршруты рёбер: порты на сторонах узлов + сглаженная линия (см. edgePath.ts); без невидимых рёбер */
  edgeRoutes: Map<string, RoutedEdge>;
}

/** Строки подписи узла: `<br/>` и `\n` — переносы, остальные теги отбрасываются. */
function labelPlainLines(label: string): string[] {
  return label
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .split('\n');
}

const EST_CHAR_W = 7.6; // text-xs, полужирный: средняя ширина символа
const EST_LINE_H = 16;

/**
 * Размер узла для раскладки. Должен совпадать с тем, что рисует компонент (MermaidNodes.tsx):
 * ширина по самой длинной строке подписи (а не по всему тексту с тегами), высота — по числу строк
 * с учётом переносов длинных строк. Круг и ромб в компоненте фиксированного размера.
 */
export function getMermaidNodeDimensions(node: { label?: string; id: string; shape: string; er?: MermaidNodeIR['er'] }) {
  if (node.shape === 'entity') {
    const { width, height } = erEntityMetrics(node.label || node.id, node.er?.attributes || []);
    return { width, height };
  }
  const lines = labelPlainLines(node.label || node.id);
  const longest = Math.max(1, ...lines.map(l => l.length));

  // форма -> [мин. ширина, макс. ширина, горизонтальные поля, вертикальные поля, мин. высота]
  let minW = 140, maxW = 280, padX = 34, padY = 26, minH = 50;
  switch (node.shape) {
    case 'circle':
      return { width: 112, height: 112 };
    case 'double_circle':
      return { width: 128, height: 128 };
    case 'rhombus':
    case 'diamond':
      // в компоненте ромб — квадрат 120 px, повёрнутый на 45°: видимая ширина по диагонали ≈ 170 px
      return { width: 170, height: 170 };
    case 'hexagon':
      minW = 160; padX = 64; padY = 26; minH = 64;
      break;
    case 'cylinder':
    case 'database':
      minW = 150; maxW = 360; padX = 30; padY = 40; minH = 70;
      break;
    case 'stadium':
    case 'pill':
      minW = 140; padX = 54; padY = 26; minH = 48;
      break;
    case 'subroutine':
      minW = 150; padX = 54; padY = 26; minH = 50;
      break;
    default:
      break;
  }
  const width = Math.max(minW, Math.min(maxW, Math.ceil(longest * EST_CHAR_W + padX)));
  const perLine = Math.max(4, Math.floor((width - padX) / EST_CHAR_W));
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  const height = Math.max(minH, rows * EST_LINE_H + padY);
  return { width, height };
}

const PAD_X = 28;
const PAD_Y = 24;
const HEADER = 24;

interface Rect4 { x: number; y: number; width: number; height: number }

/** Подпись ребра без тегов (в подписи `<br/>` — пробел). */
function plainEdgeLabel(label: string | undefined): string {
  return label ? label.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '') : '';
}

/** Рёбра с одной целью, одним видом и без подписи сливаются в шину (см. routeEdges). ER и пунктир не сливаются. */
function busKeyOf(edge: MermaidEdgeIR): string | undefined {
  if (edge.label || edge.lineType === 'dotted' || edge.lineType === 'invisible') return undefined;
  if (edge.headStart !== 'none' || String(edge.headEnd).startsWith('er-')) return undefined;
  return `${edge.lineType}|${edge.headEnd}|${JSON.stringify(edge.style || {})}`;
}

function shiftRoute(r: RoutedEdge, dx: number, dy: number): RoutedEdge {
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

export function layoutMermaid(ir: MermaidIR): MermaidLayout {
  const subById = new Map(ir.subgraphs.map(s => [s.id, s]));
  // подграф попадает в раскладку, если в нём (или во вложенных) есть узлы
  const subHasNodes = new Map<string, boolean>();
  for (const sub of [...ir.subgraphs].reverse()) {
    const own = sub.nodeIds.length > 0;
    const child = ir.subgraphs.some(c => c.parent === sub.id && subHasNodes.get(c.id));
    subHasNodes.set(sub.id, own || child);
  }

  // --- подграфы с собственным direction: раскладываются отдельно (как в Mermaid — только если узлы не связаны с внешними) ---
  const descendants = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    for (const s of ir.subgraphs) if (s.parent && out.has(s.parent)) out.add(s.id); // подграфы идут «родитель раньше ребёнка»
    return out;
  };
  const nodesIn = new Map<string, Set<string>>();
  const effDir = new Map<string, MermaidIR['direction']>();
  const separate: MermaidSubgraphIR[] = [];
  const insideSeparate = new Set<string>();
  for (const sub of ir.subgraphs) {
    const parentDir = sub.parent ? effDir.get(sub.parent) ?? ir.direction : ir.direction;
    let dir = parentDir;
    if (sub.direction && sub.direction !== parentDir && subHasNodes.get(sub.id)) {
      const subs = descendants(sub.id);
      const ids = new Set(ir.nodes.filter(n => n.subgraph && subs.has(n.subgraph)).map(n => n.id));
      const isolated = ir.edges.every(e => ids.has(e.source) === ids.has(e.target));
      if (isolated && ids.size > 0) {
        dir = sub.direction;
        if (!(sub.parent && (insideSeparate.has(sub.parent) || separate.some(s => s.id === sub.parent)))) {
          separate.push(sub);
          nodesIn.set(sub.id, ids);
          for (const d of subs) insideSeparate.add(d);
        }
      }
    }
    effDir.set(sub.id, dir);
  }
  const sepNodeIds = new Set<string>();
  for (const ids of nodesIn.values()) for (const id of ids) sepNodeIds.add(id);

  // раскладка вложенных подграфов целиком (рекурсивно), размер рамки — по её содержимому
  interface Sliced { sub: MermaidSubgraphIR; layout: MermaidLayout; box: Rect4 }
  const sliced = new Map<string, Sliced>();
  for (const sub of separate) {
    const ids = nodesIn.get(sub.id)!;
    const subs = descendants(sub.id);
    const sliceIr: MermaidIR = {
      direction: sub.direction!,
      directionExplicit: true,
      hasHeader: true,
      nodes: ir.nodes.filter(n => ids.has(n.id)).map(n => (n.subgraph === sub.id ? { ...n, subgraph: undefined } : n)),
      edges: ir.edges.filter(e => ids.has(e.source) && ids.has(e.target)),
      subgraphs: ir.subgraphs.filter(s => subs.has(s.id) && s.id !== sub.id).map(s => (s.parent === sub.id ? { ...s, parent: undefined } : s)),
      warnings: [],
    };
    const layout = layoutMermaid(sliceIr);
    const rects: Rect4[] = [
      ...layout.nodes.map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height })),
      ...layout.groups.map(g => ({ x: g.x, y: g.y, width: g.width, height: g.height })),
    ];
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    const maxX = Math.max(...rects.map(r => r.x + r.width));
    const maxY = Math.max(...rects.map(r => r.y + r.height));
    sliced.set(sub.id, {
      sub,
      layout,
      box: { x: minX - PAD_X, y: minY - PAD_Y - HEADER, width: maxX - minX + PAD_X * 2, height: maxY - minY + PAD_Y * 2 + HEADER },
    });
  }

  const dagreGraph = new dagre.graphlib.Graph({ compound: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: ir.direction,
    nodesep: 40,
    // между колонками узлов — место для изломов рёбер (см. routeEdges): полосы + наконечники
    ranksep: 84,
    ranker: 'tight-tree',
  });

  for (const sub of ir.subgraphs) {
    if (insideSeparate.has(sub.id)) continue;
    if (subHasNodes.get(sub.id)) {
      dagreGraph.setNode(sub.id, { label: sub.title, clusterNode: true });
      if (sub.parent && subHasNodes.get(sub.parent)) dagreGraph.setParent(sub.id, sub.parent);
    }
  }
  for (const sl of sliced.values()) {
    dagreGraph.setNode(sl.sub.id, { width: sl.box.width, height: sl.box.height });
    if (sl.sub.parent && subHasNodes.get(sl.sub.parent)) dagreGraph.setParent(sl.sub.id, sl.sub.parent);
  }

  for (const node of ir.nodes) {
    if (sepNodeIds.has(node.id)) continue;
    const { width, height } = getMermaidNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
    if (node.subgraph && subById.has(node.subgraph) && subHasNodes.get(node.subgraph)) {
      dagreGraph.setParent(node.id, node.subgraph);
    }
  }

  const outerEdges = ir.edges.filter(e => !(sepNodeIds.has(e.source) && sepNodeIds.has(e.target)));
  for (const edge of outerEdges) {
    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
      // подписи ребра занимают место в раскладке: иначе подпись ложится на короткую линию
      const text = plainEdgeLabel(edge.label);
      dagreGraph.setEdge(
        edge.source,
        edge.target,
        text ? { width: Math.max(28, Math.ceil(text.length * 7) + 16), height: 22, labelpos: 'c' } : {}
      );
    }
  }

  try {
    dagre.layout(dagreGraph);
  } catch (err: any) {
    console.warn('Dagre layout warning:', err);
  }

  // положение вложенных раскладок: рамка по центру узла-заместителя
  const placed = new Map<string, { dx: number; dy: number; box: Rect4 }>();
  for (const [id, sl] of sliced) {
    const l = dagreGraph.node(id);
    const ok = l && Number.isFinite(l.x) && Number.isFinite(l.y);
    const ox = ok ? l.x - sl.box.width / 2 : 0;
    const oy = ok ? l.y - sl.box.height / 2 : 0;
    placed.set(id, { dx: ox - sl.box.x, dy: oy - sl.box.y, box: { x: ox, y: oy, width: sl.box.width, height: sl.box.height } });
  }
  const innerNodePos = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const [id, sl] of sliced) {
    const pl = placed.get(id)!;
    for (const n of sl.layout.nodes) innerNodePos.set(n.node.id, { x: n.x + pl.dx, y: n.y + pl.dy, width: n.width, height: n.height });
  }

  const nodes: MermaidLayoutNode[] = ir.nodes.map(node => {
    const { width, height } = getMermaidNodeDimensions(node);
    const inner = innerNodePos.get(node.id);
    if (inner) return { node, x: inner.x, y: inner.y, width, height };
    const l = dagreGraph.node(node.id);
    const ok = l && Number.isFinite(l.x) && Number.isFinite(l.y);
    return { node, x: ok ? l.x - width / 2 : 0, y: ok ? l.y - height / 2 : 0, width, height };
  });
  const nodeRect = new Map(nodes.map(n => [n.node.id, n]));

  // Рамки подграфов считаем снизу вверх: вложенные рамки лежат внутри родительской с отступом
  const boxes = new Map<string, MermaidLayoutGroup>();
  for (const [id, sl] of sliced) {
    const pl = placed.get(id)!;
    boxes.set(id, { id, title: sl.sub.title, ...pl.box });
    for (const g of sl.layout.groups) boxes.set(g.id, { ...g, x: g.x + pl.dx, y: g.y + pl.dy });
  }
  for (const sub of [...ir.subgraphs].reverse()) {
    if (insideSeparate.has(sub.id)) continue;
    const rects: Rect4[] = [];
    for (const id of sub.nodeIds) {
      const n = nodeRect.get(id);
      if (n) rects.push({ x: n.x, y: n.y, width: n.width, height: n.height });
    }
    for (const child of ir.subgraphs) {
      if (child.parent === sub.id) {
        const b = boxes.get(child.id);
        if (b) rects.push(b);
      }
    }
    if (rects.length === 0) continue;
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    const maxX = Math.max(...rects.map(r => r.x + r.width));
    const maxY = Math.max(...rects.map(r => r.y + r.height));
    boxes.set(sub.id, {
      id: sub.id,
      title: sub.title,
      x: minX - PAD_X,
      y: minY - PAD_Y - HEADER,
      width: maxX - minX + PAD_X * 2,
      height: maxY - minY + PAD_Y * 2 + HEADER,
    });
  }
  // порядок: родители раньше детей (рисуются под ними)
  const groups = ir.subgraphs.map(s => boxes.get(s.id)).filter((b): b is MermaidLayoutGroup => !!b);

  const edgePoints = new Map<string, Array<{ x: number; y: number }>>();
  for (const edge of outerEdges) {
    try {
      const e = dagreGraph.edge(edge.source, edge.target);
      if (e?.points?.length) edgePoints.set(edge.id, e.points);
    } catch {
      /* ребро без раскладки — маршрут строится без подсказок dagre */
    }
  }

  // внешний уровень: узлы вне вложенных раскладок + рамки-заместители
  const routeNodes: RouteNode[] = [
    ...nodes.filter(n => !sepNodeIds.has(n.node.id)).map(n => ({ id: n.node.id, x: n.x, y: n.y, width: n.width, height: n.height, shape: n.node.shape })),
    ...[...placed].map(([id, pl]) => ({ id, ...pl.box, shape: 'rectangle' })),
  ];
  const outerGroups = groups.filter(g => !insideSeparate.has(g.id) || sliced.has(g.id));
  const edgeRoutes = routeEdges(
    ir.direction,
    routeNodes,
    outerEdges
      .filter(e => e.lineType !== 'invisible')
      .map(e => ({ id: e.id, source: e.source, target: e.target, points: edgePoints.get(e.id), label: plainEdgeLabel(e.label), bus: busKeyOf(e) })),
    outerGroups.map(g => ({ x: g.x, y: g.y, width: g.width, height: g.height, title: g.title }))
  );
  for (const [id, sl] of sliced) {
    const pl = placed.get(id)!;
    for (const [eid, r] of sl.layout.edgeRoutes) edgeRoutes.set(eid, shiftRoute(r, pl.dx, pl.dy));
  }

  // узлы ссылаются на исходные объекты IR (в копиях для вложенных раскладок снят id подграфа)
  return { direction: ir.direction, nodes, groups, edgeRoutes };
}

// ---------------------------------------------------------------------------
// Конвертация в узлы/рёбра React Flow
// ---------------------------------------------------------------------------

function toRfEdge(edge: MermaidEdgeIR, route?: RoutedEdge) {
  const edgeStyle: any = { strokeWidth: 2 };
  if (edge.lineType === 'dotted') edgeStyle.strokeDasharray = '5 5';
  else if (edge.lineType === 'thick') edgeStyle.strokeWidth = 3.5;
  Object.assign(edgeStyle, edge.style || {});

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // в подписи ребра `<br/>` — пробел (перенос строки в маленькой плашке не нужен)
    label: edge.label ? edge.label.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '') : edge.label,
    // свой тип ребра идёт по маршруту раскладки (обходит узлы), см. MermaidEdge в MermaidNodes.tsx
    type: 'mermaidEdge',
    // маршрут и вид наконечников: линию и стрелки рисует MermaidEdge сам (RF-маркеры не используются)
    data: { route, headStart: edge.headStart, headEnd: edge.headEnd },
    animated: edge.lineType === 'dotted',
    style: edgeStyle,
  };
}

/** Результат разбора для пользователя: фатальная ошибка или «ничего не разобрано» — error, иначе warnings. */
export function describeMermaidIssues(ir: MermaidIR): { error?: string; warnings?: MermaidIssue[] } {
  if (ir.fatal) return { error: formatMermaidIssue(ir.fatal) };
  if (ir.warnings.length === 0) return {};
  if (ir.nodes.length === 0) {
    const more = ir.warnings.length > 1 ? ` (${t('и ещё')} ${ir.warnings.length - 1})` : '';
    return { error: formatMermaidIssue(ir.warnings[0]) + more, warnings: ir.warnings };
  }
  return { warnings: ir.warnings };
}

/**
 * Parses Mermaid flowchart/graph code into React Flow nodes and edges.
 */
export function parseMermaidToGraph(
  mermaidText: string,
  preferredDirection?: 'TB' | 'LR'
): MermaidParsedResult {
  if (!mermaidText || !mermaidText.trim()) {
    return { nodes: [], edges: [], direction: preferredDirection || 'LR' };
  }

  const ir = parseDiagram(mermaidText, preferredDirection);
  const issues = describeMermaidIssues(ir);
  if (ir.fatal || ir.nodes.length === 0) {
    return { nodes: [], edges: [], direction: ir.direction, ...issues };
  }

  const layout = layoutMermaid(ir);
  const subTitle = new Map(ir.subgraphs.map(s => [s.id, s.title || s.id]));

  const rfNodes: any[] = layout.nodes.map(({ node, x, y, width, height }) => ({
    id: node.id,
    type: node.shape === 'entity' ? 'mermaidEntityNode' : 'mermaidNode',
    data: {
      rawId: node.id,
      entity: node.er?.attributes,
      label: node.label,
      shape: node.shape,
      subgraph: node.subgraph ? subTitle.get(node.subgraph) : undefined,
      style: node.style,
      classes: node.classes.length > 0 ? node.classes : undefined,
      nodeWidth: width,
      nodeHeight: height,
    },
    position: { x, y },
    targetPosition: flowSides(ir.direction).in,
    sourcePosition: flowSides(ir.direction).out,
  }));

  // группы идут первыми, чтобы рисоваться под узлами
  const groupNodes: any[] = layout.groups.map(g => ({
    id: g.id,
    type: 'mermaidGroupNode',
    data: { label: g.title, width: g.width, height: g.height },
    position: { x: g.x, y: g.y },
    zIndex: -1,
  }));

  const rfEdges = ir.edges.filter(e => e.lineType !== 'invisible').map(e => toRfEdge(e, layout.edgeRoutes.get(e.id)));

  return {
    nodes: [...groupNodes, ...rfNodes],
    edges: rfEdges,
    direction: ir.direction,
    ...issues,
  };
}
