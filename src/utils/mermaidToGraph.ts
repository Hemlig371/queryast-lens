import dagre from 'dagre';
import {
  parseMermaidSource,
  formatMermaidIssue,
  type MermaidIR,
  type MermaidIssue,
  type MermaidNodeIR,
  type MermaidEdgeIR,
} from './mermaidParse';
import { t } from './i18n';

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
  /** ломаные линии рёбер по данным dagre: edge.id -> точки (могут отсутствовать) */
  edgePoints: Map<string, Array<{ x: number; y: number }>>;
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
export function getMermaidNodeDimensions(node: { label?: string; id: string; shape: string }) {
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
      return { width: 144, height: 144 };
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

export function layoutMermaid(ir: MermaidIR): MermaidLayout {
  const dagreGraph = new dagre.graphlib.Graph({ compound: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: ir.direction,
    nodesep: 40,
    ranksep: 70,
    ranker: 'tight-tree',
  });

  const subById = new Map(ir.subgraphs.map(s => [s.id, s]));
  // подграф попадает в раскладку, если в нём (или во вложенных) есть узлы
  const subHasNodes = new Map<string, boolean>();
  for (const sub of [...ir.subgraphs].reverse()) {
    const own = sub.nodeIds.length > 0;
    const child = ir.subgraphs.some(c => c.parent === sub.id && subHasNodes.get(c.id));
    subHasNodes.set(sub.id, own || child);
  }

  for (const sub of ir.subgraphs) {
    if (subHasNodes.get(sub.id)) {
      dagreGraph.setNode(sub.id, { label: sub.title, clusterNode: true });
      if (sub.parent && subHasNodes.get(sub.parent)) dagreGraph.setParent(sub.id, sub.parent);
    }
  }

  for (const node of ir.nodes) {
    const { width, height } = getMermaidNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
    if (node.subgraph && subById.has(node.subgraph) && subHasNodes.get(node.subgraph)) {
      dagreGraph.setParent(node.id, node.subgraph);
    }
  }

  for (const edge of ir.edges) {
    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
      // подписи ребра занимают место в раскладке: иначе подпись ложится на короткую линию
      const text = edge.label ? edge.label.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '') : '';
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

  const nodes: MermaidLayoutNode[] = ir.nodes.map(node => {
    const { width, height } = getMermaidNodeDimensions(node);
    const l = dagreGraph.node(node.id);
    const ok = l && Number.isFinite(l.x) && Number.isFinite(l.y);
    return { node, x: ok ? l.x - width / 2 : 0, y: ok ? l.y - height / 2 : 0, width, height };
  });
  const nodeRect = new Map(nodes.map(n => [n.node.id, n]));

  // Рамки подграфов считаем снизу вверх: вложенные рамки лежат внутри родительской с отступом
  const paddingX = 28;
  const paddingY = 24;
  const headerSpace = 24;
  const boxes = new Map<string, MermaidLayoutGroup>();
  for (const sub of [...ir.subgraphs].reverse()) {
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const id of sub.nodeIds) {
      const n = nodeRect.get(id);
      if (n) rects.push({ x: n.x, y: n.y, w: n.width, h: n.height });
    }
    for (const child of ir.subgraphs) {
      if (child.parent === sub.id) {
        const b = boxes.get(child.id);
        if (b) rects.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      }
    }
    if (rects.length === 0) continue;
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    const maxX = Math.max(...rects.map(r => r.x + r.w));
    const maxY = Math.max(...rects.map(r => r.y + r.h));
    boxes.set(sub.id, {
      id: sub.id,
      title: sub.title,
      x: minX - paddingX,
      y: minY - paddingY - headerSpace,
      width: maxX - minX + paddingX * 2,
      height: maxY - minY + paddingY * 2 + headerSpace,
    });
  }
  // порядок: родители раньше детей (рисуются под ними)
  const groups = ir.subgraphs.map(s => boxes.get(s.id)).filter((b): b is MermaidLayoutGroup => !!b);

  const edgePoints = new Map<string, Array<{ x: number; y: number }>>();
  for (const edge of ir.edges) {
    try {
      const e = dagreGraph.edge(edge.source, edge.target);
      if (e?.points?.length) edgePoints.set(edge.id, e.points);
    } catch {
      /* ребро без раскладки — рисуем прямой линией */
    }
  }

  return { direction: ir.direction, nodes, groups, edgePoints };
}

// ---------------------------------------------------------------------------
// Конвертация в узлы/рёбра React Flow
// ---------------------------------------------------------------------------

function toRfEdge(edge: MermaidEdgeIR, points?: Array<{ x: number; y: number }>) {
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
    data: points && points.length >= 2 ? { points } : undefined,
    animated: edge.lineType === 'dotted',
    style: edgeStyle,
    markerEnd: edge.headEnd !== 'none' ? { type: 'arrowclosed', width: 15, height: 15 } : undefined,
    markerStart: edge.headStart !== 'none' ? { type: 'arrowclosed', width: 15, height: 15 } : undefined,
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

  const ir = parseMermaidSource(mermaidText, preferredDirection);
  const issues = describeMermaidIssues(ir);
  if (ir.fatal || ir.nodes.length === 0) {
    return { nodes: [], edges: [], direction: ir.direction, ...issues };
  }

  const layout = layoutMermaid(ir);
  const isHorizontal = ir.direction === 'LR' || ir.direction === 'RL';
  const subTitle = new Map(ir.subgraphs.map(s => [s.id, s.title || s.id]));

  const rfNodes: any[] = layout.nodes.map(({ node, x, y, width, height }) => ({
    id: node.id,
    type: 'mermaidNode',
    data: {
      rawId: node.id,
      label: node.label,
      shape: node.shape,
      subgraph: node.subgraph ? subTitle.get(node.subgraph) : undefined,
      style: node.style,
      classes: node.classes.length > 0 ? node.classes : undefined,
      nodeWidth: width,
      nodeHeight: height,
    },
    position: { x, y },
    targetPosition: isHorizontal ? 'left' : 'top',
    sourcePosition: isHorizontal ? 'right' : 'bottom',
  }));

  // группы идут первыми, чтобы рисоваться под узлами
  const groupNodes: any[] = layout.groups.map(g => ({
    id: g.id,
    type: 'mermaidGroupNode',
    data: { label: g.title, width: g.width, height: g.height },
    position: { x: g.x, y: g.y },
    zIndex: -1,
  }));

  const rfEdges = ir.edges.filter(e => e.lineType !== 'invisible').map(e => toRfEdge(e, layout.edgePoints.get(e.id)));

  return {
    nodes: [...groupNodes, ...rfNodes],
    edges: rfEdges,
    direction: ir.direction,
    ...issues,
  };
}
