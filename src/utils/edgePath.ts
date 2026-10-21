// Геометрия рёбер, общая для статичного SVG (mermaidSvg.ts) и интерактивного графа (MermaidNodes.tsx).
// Отдельный маленький модуль: интерактивный граф не должен тянуть за собой Markdown-рендерер.

export type Pt = { x: number; y: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Ломаная с закруглёнными углами (радиус до 8 px). */
export function roundedPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  const R = 8;
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const ra = Math.min(R, la / 2);
    const rb = Math.min(R, lb / 2);
    if (la === 0 || lb === 0) continue;
    const p1 = { x: p.x - ((p.x - a.x) / la) * ra, y: p.y - ((p.y - a.y) / la) * ra };
    const p2 = { x: p.x + ((b.x - p.x) / lb) * rb, y: p.y + ((b.y - p.y) / lb) * rb };
    d += `L${r1(p1.x)} ${r1(p1.y)}Q${r1(p.x)} ${r1(p.y)} ${r1(p2.x)} ${r1(p2.y)}`;
  }
  const last = pts[pts.length - 1];
  d += `L${r1(last.x)} ${r1(last.y)}`;
  return d;
}

/** Середина ломаной по длине. */
export function pathMidpoint(pts: Pt[]): Pt {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= total / 2 && seg > 0) {
      const f = (total / 2 - acc) / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    }
    acc += seg;
  }
  return pts[0];
}

// ---------------------------------------------------------------------------
// Порты и ортогональные маршруты рёбер
//
// Линии строгие: только горизонтальные и вертикальные отрезки со слегка скруглёнными углами.
//  • Порты: входящие и выходящие рёбра раскладываются по стороне узла (на контуре ромба/круга), порядок — по
//    положению «соседа» поперёк потока, поэтому у узла линии не пересекаются.
//  • Рёбра идут «колонками»: узлы раскладки стоят в рангах (колонках), между колонками — зазоры. Смена уровня
//    («излом») делается только в зазоре, на своей «полосе»: несколько изломов в одном зазоре не накладываются,
//    порядок полос подбирается так, чтобы линии пересекались как можно реже.
//  • Слияния: рёбра с одной целью, одинаковым видом и без подписей сходятся в «шину» — общую вертикаль и
//    один вход в узел с одной стрелкой.
//  • Обратные рёбра (цель «позади» источника) идут по свободному коридору рядом с узлами, а не по краю схемы.
//  • Подписи ставятся рядом с линией (не на ней), в свободное место: не на узлы, заголовки подграфов и чужие линии.
// Всё считается в «нормализованной» системе (поток слева направо), затем переводится обратно — поэтому код один
// для LR/RL/TB/BT. Модуль чистый: им пользуются и интерактивный граф (MermaidNodes.tsx), и статичный SVG (mermaidSvg.ts).
// ---------------------------------------------------------------------------

export type Side = 'left' | 'right' | 'top' | 'bottom';
export type FlowDirection = 'TB' | 'LR' | 'BT' | 'RL';

export interface RouteNode {
  id: string;
  /** левый верхний угол */
  x: number;
  y: number;
  width: number;
  height: number;
  shape: string;
}

/** Рамка подграфа: заголовок (левый верхний угол) для линий — запретная зона. */
export interface RouteBox {
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
}

export interface RouteEdgeInput {
  id: string;
  source: string;
  target: string;
  /** точки маршрута dagre (первая и последняя — на рамке узлов): из них берутся «полосы» дальних рёбер */
  points?: Pt[];
  /** текст подписи (для подбора места) */
  label?: string;
  /** рёбра с одной целью и одинаковым ключом шины (и без подписи) сливаются в одну линию на входе */
  bus?: string;
}

export interface LabelPlacement {
  /** центр текста по вертикали, по горизонтали — по `anchor` */
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface RoutedEdge {
  start: Pt;
  end: Pt;
  /** единичный вектор «наружу» из исходного узла в точке start */
  outDir: Pt;
  /** единичный вектор «наружу» из целевого узла в точке end (движение в конце — противоположное) */
  inDir: Pt;
  /** изломы маршрута (между start и end), углы всегда прямые; возможно пусто */
  inner: Pt[];
  /** смещение портов от левого верхнего угла узлов — чтобы ребро следовало за перетащенным узлом */
  srcOffset: Pt;
  dstOffset: Pt;
  /** позиции узлов на момент раскладки: пока узлы на месте, изломы действительны */
  srcPos: Pt;
  dstPos: Pt;
  /** место подписи рядом с линией */
  label?: LabelPlacement;
}

const SIDE_VEC: Record<Side, Pt> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** Стороны, с которых рёбра выходят и на которые входят, для направления раскладки. */
export function flowSides(direction: FlowDirection): { out: Side; in: Side } {
  switch (direction) {
    case 'RL': return { out: 'left', in: 'right' };
    case 'TB': return { out: 'bottom', in: 'top' };
    case 'BT': return { out: 'top', in: 'bottom' };
    default: return { out: 'right', in: 'left' };
  }
}

/** Расстояние между соседними портами на одной стороне (px): шире наконечника стрелки. */
export const PORT_STEP = 16;
/** Расстояние между соседними «полосами» изломов в зазоре. */
const LANE_STEP = 10;
/** Зазор между колонками: полоса излома не ближе к узлу-источнику и к узлу-цели (там наконечник). */
const ZONE_NEAR_SRC = 22;
const ZONE_NEAR_DST = 34;
/** Шрифт и размеры подписи. */
export const EDGE_LABEL_CHAR_W = 7;
const LABEL_H = 14;
const LABEL_GAP = 9;

function isContourShape(shape: string): boolean {
  return shape === 'rhombus' || shape === 'diamond' || shape === 'circle' || shape === 'double_circle';
}

/** Смещения портов вдоль стороны длиной `len` для n рёбер (симметрично относительно середины). */
export function portOffsets(n: number, len: number, contour: boolean): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const half = (len / 2) * (contour ? 0.5 : 0.78);
  const step = Math.min(PORT_STEP, (2 * half) / (n - 1));
  return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * step);
}

/** Точка на контуре узла: сторона `side`, смещение `d` вдоль стороны от её середины. */
export function portPoint(n: RouteNode, side: Side, d: number): Pt {
  const cx = n.x + n.width / 2;
  const cy = n.y + n.height / 2;
  const hw = n.width / 2;
  const hh = n.height / 2;
  const horizontal = side === 'left' || side === 'right';
  const sign = side === 'right' || side === 'bottom' ? 1 : -1;
  const rhombus = n.shape === 'rhombus' || n.shape === 'diamond';
  const circle = n.shape === 'circle' || n.shape === 'double_circle';
  if (horizontal) {
    const c = Math.max(-hh, Math.min(hh, d));
    const dx = rhombus ? hw * (1 - Math.abs(c) / hh) : circle ? hw * Math.sqrt(Math.max(0, 1 - (c / hh) ** 2)) : hw;
    return { x: cx + sign * dx, y: cy + c };
  }
  const c = Math.max(-hw, Math.min(hw, d));
  const dy = rhombus ? hh * (1 - Math.abs(c) / hw) : circle ? hh * Math.sqrt(Math.max(0, 1 - (c / hw) ** 2)) : hh;
  return { x: cx + c, y: cy + sign * dy };
}

// --- Нормализованная система: поток слева направо ---------------------------

const toLR = (d: FlowDirection, p: Pt): Pt =>
  d === 'LR' ? p : d === 'RL' ? { x: -p.x, y: p.y } : d === 'TB' ? { x: p.y, y: p.x } : { x: -p.y, y: p.x };
const fromLR = (d: FlowDirection, q: Pt): Pt =>
  d === 'LR' ? q : d === 'RL' ? { x: -q.x, y: q.y } : d === 'TB' ? { x: q.y, y: q.x } : { x: q.y, y: -q.x };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectToLR(d: FlowDirection, r: Rect): Rect {
  const p = toLR(d, { x: r.x, y: r.y });
  const q = toLR(d, { x: r.x + r.width, y: r.y + r.height });
  return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), width: Math.abs(q.x - p.x), height: Math.abs(q.y - p.y) };
}

const finite = (p: Pt | undefined): p is Pt => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const hitsRect = (c: number, r: Rect, margin: number) => c > r.y - margin && c < r.y + r.height + margin;

type Seg = [Pt, Pt];

function segmentsOf(poly: Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 1; i < poly.length; i++) if (Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y) > 0.01) out.push([poly[i - 1], poly[i]]);
  return out;
}

/** Убирает совпадающие и лежащие на одной прямой промежуточные точки. */
function cleanPolyline(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const sameX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
    const sameY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
    if (sameX || sameY) out.splice(i, 1);
  }
  return out;
}

const isHoriz = (s: Seg) => Math.abs(s[0].y - s[1].y) < 0.01;

/** Число пересечений ломаной (с прямыми углами) с набором отрезков. */
function crossings(poly: Pt[], others: Seg[]): number {
  let n = 0;
  for (const a of segmentsOf(poly)) {
    for (const b of others) {
      const ah = isHoriz(a);
      const bh = isHoriz(b);
      if (ah === bh) continue;
      const h = ah ? a : b;
      const v = ah ? b : a;
      const hx1 = Math.min(h[0].x, h[1].x);
      const hx2 = Math.max(h[0].x, h[1].x);
      const vy1 = Math.min(v[0].y, v[1].y);
      const vy2 = Math.max(v[0].y, v[1].y);
      if (v[0].x > hx1 + 1 && v[0].x < hx2 - 1 && h[0].y > vy1 + 1 && h[0].y < vy2 - 1) n++;
    }
  }
  return n;
}

/** Отрезок (горизонтальный/вертикальный) задевает прямоугольник. */
function segHitsRect(s: Seg, r: Rect, pad: number): boolean {
  const x1 = Math.min(s[0].x, s[1].x);
  const x2 = Math.max(s[0].x, s[1].x);
  const y1 = Math.min(s[0].y, s[1].y);
  const y2 = Math.max(s[0].y, s[1].y);
  return x2 > r.x - pad && x1 < r.x + r.width + pad && y2 > r.y - pad && y1 < r.y + r.height + pad;
}

// --- Колонки (ранги) --------------------------------------------------------

interface Column {
  lo: number;
  hi: number;
  center: number;
}

function buildColumns(nodes: RouteNode[]): { cols: Column[]; colOf: Map<string, number> } {
  const sorted = nodes.slice().sort((a, b) => a.x + a.width / 2 - (b.x + b.width / 2));
  const cols: Column[] = [];
  const members: RouteNode[][] = [];
  for (const n of sorted) {
    const cx = n.x + n.width / 2;
    const last = cols[cols.length - 1];
    if (last && Math.abs(cx - last.center) <= 3) {
      const list = members[members.length - 1];
      list.push(n);
      last.lo = Math.min(last.lo, n.x);
      last.hi = Math.max(last.hi, n.x + n.width);
      last.center = list.reduce((s, m) => s + m.x + m.width / 2, 0) / list.length;
    } else {
      cols.push({ lo: n.x, hi: n.x + n.width, center: cx });
      members.push([n]);
    }
  }
  const colOf = new Map<string, number>();
  members.forEach((list, i) => list.forEach(n => colOf.set(n.id, i)));
  return { cols, colOf };
}

// --- Полосы изломов в зазорах ------------------------------------------------

interface Jog {
  edge: string;
  /** зазор: между колонкой k и k+1 (−1 — перед первой, последняя — после последней колонки) */
  gap: number;
  /** уровни, с которых линии приходят в излом (слева) и на которые уходят (справа) */
  lefts: number[];
  rights: number[];
  /** изломы одной группы (шины) используют одну вертикаль */
  group?: string;
  x?: number;
}

interface LaneItem {
  jogs: Jog[];
  lefts: number[];
  rights: number[];
  lo: number;
  hi: number;
}

function allocateLanes(jogs: Jog[], zoneOf: (gap: number) => [number, number]): void {
  const byGap = new Map<number, Jog[]>();
  for (const j of jogs) {
    const list = byGap.get(j.gap);
    if (list) list.push(j);
    else byGap.set(j.gap, [j]);
  }
  for (const [gap, list] of byGap) {
    const groups = new Map<string, LaneItem>();
    const items: LaneItem[] = [];
    for (const j of list) {
      let item = j.group ? groups.get(j.group) : undefined;
      if (!item) {
        item = { jogs: [], lefts: [], rights: [], lo: Infinity, hi: -Infinity };
        items.push(item);
        if (j.group) groups.set(j.group, item);
      }
      item.jogs.push(j);
      item.lefts.push(...j.lefts);
      item.rights.push(...j.rights);
    }
    for (const it of items) {
      const all = [...it.lefts, ...it.rights];
      it.lo = Math.min(...all);
      it.hi = Math.max(...all);
    }
    const overlap = (a: LaneItem, b: LaneItem) => a.hi > b.lo - 3 && b.hi > a.lo - 3;
    const inside = (v: number, it: LaneItem) => v > it.lo + 1 && v < it.hi - 1;
    // сколько пересечений даст порядок «a левее b»: левые горизонтали b пересекают вертикаль a, правые горизонтали a — вертикаль b
    const cost = (a: LaneItem, b: LaneItem) => b.lefts.filter(v => inside(v, a)).length + a.rights.filter(v => inside(v, b)).length;
    items.sort((a, b) => a.lo + a.hi - (b.lo + b.hi));
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          if (overlap(items[i], items[j]) && cost(items[j], items[i]) < cost(items[i], items[j])) {
            const [moved] = items.splice(j, 1);
            items.splice(i, 0, moved);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    const lane: number[] = [];
    items.forEach((it, i) => {
      let l = 0;
      for (let k = 0; k < i; k++) if (overlap(items[k], it)) l = Math.max(l, lane[k] + 1);
      lane.push(l);
    });
    const K = Math.max(...lane) + 1;
    const [zlo, zhi] = zoneOf(gap);
    const mid = (zlo + zhi) / 2;
    const step = K > 1 ? Math.min(LANE_STEP, Math.max(5, (zhi - zlo) / (K - 1))) : 0;
    items.forEach((it, i) => {
      const x = mid + (lane[i] - (K - 1) / 2) * step;
      for (const j of it.jogs) j.x = x;
    });
  }
}

interface EndRef {
  ids: string[];
  key: number;
  order: number;
}

const BIG = 1e8;

/**
 * Маршруты рёбер: порты на сторонах узлов + ортогональная линия с изломами в зазорах между колонками.
 * `groups` — рамки подграфов (заголовки обходятся), `points` рёбер — маршруты dagre (полосы дальних рёбер).
 */
export function routeEdges(
  direction: FlowDirection,
  nodesIn: RouteNode[],
  edgesIn: RouteEdgeInput[],
  groupsIn: RouteBox[] = []
): Map<string, RoutedEdge> {
  const result = new Map<string, RoutedEdge>();
  const nodes: RouteNode[] = nodesIn.map(n => ({ ...n, ...rectToLR(direction, n) }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const origById = new Map(nodesIn.map(n => [n.id, n]));
  const edges = edgesIn.filter(e => byId.has(e.source) && byId.has(e.target));
  if (edges.length === 0) return result;

  const sides = flowSides(direction);
  const toL = (p: Pt) => toLR(direction, p);
  const fromL = (q: Pt) => fromLR(direction, q);
  const { cols, colOf } = buildColumns(nodes);
  const nCols = cols.length;
  const centerOf = (n: RouteNode): Pt => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

  // рамки подграфов: заголовок — запретная зона, сама рамка — «мягкое» препятствие для коридора
  const groups = groupsIn.map(g => ({
    box: rectToLR(direction, g),
    title: rectToLR(direction, { x: g.x, y: g.y, width: Math.min(g.width, (g.title?.length ?? 0) * 9 + 30), height: 30 }),
  }));
  const inBox = (box: Rect, n: RouteNode) => {
    const c = centerOf(n);
    return c.x > box.x && c.x < box.x + box.width && c.y > box.y && c.y < box.y + box.height;
  };

  // зазоры между колонками
  const gapRange = (k: number): [number, number] => {
    if (k < 0) return [cols[0].lo - 70, cols[0].lo];
    if (k >= nCols - 1) return [cols[nCols - 1].hi, cols[nCols - 1].hi + 70];
    return [cols[k].hi, cols[k + 1].lo];
  };
  const zoneOf = (k: number): [number, number] => {
    const [lo, hi] = gapRange(k);
    const a = lo + ZONE_NEAR_SRC;
    const b = hi - ZONE_NEAR_DST;
    if (b < a) {
      const m = (lo + hi) / 2 - (ZONE_NEAR_DST - ZONE_NEAR_SRC) / 2;
      return [m, m];
    }
    return [a, b];
  };
  const zoneMid = (k: number) => {
    const [a, b] = zoneOf(k);
    return (a + b) / 2;
  };

  // --- разбор рёбер ---
  type Kind = 'forward' | 'back' | 'self';
  interface Plan {
    e: RouteEdgeInput;
    order: number;
    a: RouteNode;
    b: RouteNode;
    ca: number;
    cb: number;
    kind: Kind;
    inner: Pt[];
    side: -1 | 1; // обратные рёбра: коридор выше (−1) или ниже (+1) узлов
    start: Pt;
    end: Pt;
    busKey?: string;
    levels: number[];
    jogs: Jog[];
    poly: Pt[];
  }
  const plans: Plan[] = edges.map((e, order) => {
    const a = byId.get(e.source)!;
    const b = byId.get(e.target)!;
    const pts = (e.points || []).filter(finite).map(toL);
    const ca = colOf.get(a.id)!;
    const cb = colOf.get(b.id)!;
    return {
      e, order, a, b, ca, cb,
      kind: (a === b ? 'self' : cb > ca ? 'forward' : 'back') as Kind,
      inner: pts.length > 2 ? pts.slice(1, -1) : [],
      side: -1 as -1 | 1,
      start: { x: 0, y: 0 }, end: { x: 0, y: 0 },
      levels: [], jogs: [], poly: [],
    };
  });

  // шина: ≥2 прямых ребра с одной целью и одним ключом
  const busGroups = new Map<string, Plan[]>();
  for (const p of plans) {
    if (p.kind !== 'forward' || !p.e.bus) continue;
    const key = `${p.b.id}|${p.e.bus}`;
    const list = busGroups.get(key);
    if (list) list.push(p);
    else busGroups.set(key, [p]);
  }
  for (const [key, list] of busGroups) if (list.length >= 2) for (const p of list) p.busKey = key;

  // --- коридоры обратных рёбер: выше или ниже (по свободному месту рядом с узлами) ---
  const corridorLevels = (p: Plan, runLo: number, runHi: number): number[] => {
    const hard: Rect[] = [
      ...nodes.filter(n => n.x < runHi && n.x + n.width > runLo),
      ...groups.map(g => g.title).filter(t => t.x < runHi && t.x + t.width > runLo),
    ];
    const cands = new Set<number>();
    for (const r of hard) { cands.add(r.y - 18); cands.add(r.y + r.height + 18); }
    return [...cands].filter(c => !hard.some(r => hitsRect(c, r, 12))).sort((u, v) => u - v);
  };
  for (const p of plans) {
    if (p.kind !== 'back') continue;
    const ya = centerOf(p.a).y;
    const yb = centerOf(p.b).y;
    const lv = corridorLevels(p, zoneMid(p.cb - 1), zoneMid(p.ca));
    if (lv.length === 0) continue;
    const best = lv.reduce((m, c) => (Math.abs(c - ya) + Math.abs(c - yb) < Math.abs(m - ya) + Math.abs(m - yb) ? c : m), lv[0]);
    p.side = best <= (ya + yb) / 2 ? -1 : 1;
  }

  // --- порты ---
  const outs = new Map<string, EndRef[]>();
  const ins = new Map<string, EndRef[]>();
  const push = (m: Map<string, EndRef[]>, id: string, ref: EndRef) => {
    const list = m.get(id);
    if (list) list.push(ref);
    else m.set(id, [ref]);
  };
  const busDone = new Set<string>();
  for (const p of plans) {
    const outKey = p.kind === 'forward' ? (p.inner[0]?.y ?? centerOf(p.b).y) : p.kind === 'self' ? -BIG : p.side * BIG;
    push(outs, p.a.id, { ids: [p.e.id], key: outKey, order: p.order });
    if (p.busKey) {
      if (busDone.has(p.busKey)) continue;
      busDone.add(p.busKey);
      const members = busGroups.get(p.busKey)!;
      const key = members.reduce((s, m) => s + (m.inner[m.inner.length - 1]?.y ?? centerOf(m.a).y), 0) / members.length;
      push(ins, p.b.id, { ids: members.map(m => m.e.id), key, order: p.order });
    } else {
      const inKey = p.kind === 'forward' ? (p.inner[p.inner.length - 1]?.y ?? centerOf(p.a).y) : p.kind === 'self' ? -BIG : p.side * BIG;
      push(ins, p.b.id, { ids: [p.e.id], key: inKey, order: p.order });
    }
  }
  const assign = (m: Map<string, EndRef[]>, side: Side) => {
    const ports = new Map<string, Pt>();
    for (const [nodeId, list] of m) {
      const n = byId.get(nodeId)!;
      const sorted = list.slice().sort((u, v) => u.key - v.key || u.order - v.order);
      const offs = portOffsets(sorted.length, n.height, isContourShape(n.shape));
      sorted.forEach((ref, k) => {
        const pt = portPoint(n, side, offs[k]);
        for (const id of ref.ids) ports.set(id, pt);
      });
    }
    return ports;
  };
  const outPorts = assign(outs, 'right');
  const inPorts = assign(ins, 'left');
  for (const p of plans) {
    p.start = outPorts.get(p.e.id)!;
    p.end = inPorts.get(p.e.id)!;
  }

  // почти ровные прямые рёбра выравниваем (разница в 1–5 px от округления размеров выглядит как «ступенька»)
  for (const p of plans) {
    if (p.kind === 'forward' && !p.busKey && p.cb === p.ca + 1 && Math.abs(p.start.y - p.end.y) <= 5 && Math.abs(p.start.y - p.end.y) > 0) {
      const y = (p.start.y + p.end.y) / 2;
      p.start = { x: p.start.x, y };
      p.end = { x: p.end.x, y };
    }
  }

  // --- уровни прямых рёбер: порт → полосы в промежуточных колонках → порт ---
  const colBlockers = (k: number) => nodes.filter(n => n.x < cols[k].hi && n.x + n.width > cols[k].lo);
  const freeLane = (k: number, want: number): number => {
    const bl = colBlockers(k);
    if (!bl.some(r => hitsRect(want, r, 10))) return want;
    const cands: number[] = [];
    for (const r of bl) { cands.push(r.y - 14, r.y + r.height + 14); }
    const free = cands.filter(c => !bl.some(r => hitsRect(c, r, 10)));
    return free.length ? free.reduce((m, c) => (Math.abs(c - want) < Math.abs(m - want) ? c : m), free[0]) : want;
  };
  for (const p of plans) {
    if (p.kind !== 'forward') continue;
    const levels = [p.start.y];
    for (let k = p.ca + 1; k < p.cb; k++) {
      const dummy = p.inner.find(q => Math.abs(q.x - cols[k].center) <= 6);
      const t = (cols[k].center - p.start.x) / Math.max(1, p.end.x - p.start.x);
      const want = dummy ? dummy.y : p.start.y + (p.end.y - p.start.y) * Math.max(0, Math.min(1, t));
      let c = freeLane(k, want);
      const prev = levels[levels.length - 1];
      if (Math.abs(c - prev) < 6 && !colBlockers(k).some(r => hitsRect(prev, r, 10))) c = prev;
      levels.push(c);
    }
    levels.push(p.end.y);
    p.levels = levels;
    for (let m = 0; m + 1 < levels.length; m++) {
      if (Math.abs(levels[m] - levels[m + 1]) < 0.5) continue;
      const gap = p.ca + m;
      p.jogs.push({ edge: p.e.id, gap, lefts: [levels[m]], rights: [levels[m + 1]], group: m + 1 === levels.length - 1 && p.busKey ? p.busKey : undefined });
    }
  }

  const buildForward = (p: Plan): Pt[] => {
    const pts: Pt[] = [p.start];
    for (let m = 0; m + 1 < p.levels.length; m++) {
      const jog = p.jogs.find(j => j.gap === p.ca + m);
      if (jog && jog.x !== undefined) pts.push({ x: jog.x, y: p.levels[m] }, { x: jog.x, y: p.levels[m + 1] });
    }
    pts.push(p.end);
    return pts;
  };

  // предварительные полосы только для прямых рёбер — по ним выбираем коридоры обратных
  const forwardPlans = plans.filter(p => p.kind === 'forward');
  allocateLanes(forwardPlans.flatMap(p => p.jogs), zoneOf);
  const others: Seg[] = [];
  for (const p of forwardPlans) {
    p.poly = cleanPolyline(buildForward(p));
    others.push(...segmentsOf(p.poly));
  }

  // --- обратные рёбра и петли ---
  const usedRuns: Array<{ c: number; lo: number; hi: number }> = [];
  for (const p of plans) {
    if (p.kind === 'self') {
      const n = p.a;
      const span = nodes.filter(m => m !== n && m.x < n.x + n.width + 24 && m.x + m.width > n.x - 24);
      const topLevel = n.y - 22;
      const botLevel = n.y + n.height + 22;
      const clash = (c: number) => span.some(r => hitsRect(c, r, 8));
      const c = !clash(topLevel) || clash(botLevel) ? topLevel : botLevel;
      const xr = n.x + n.width + 18;
      const xl = n.x - 18;
      p.poly = cleanPolyline([p.start, { x: xr, y: p.start.y }, { x: xr, y: c }, { x: xl, y: c }, { x: xl, y: p.end.y }, p.end]);
      others.push(...segmentsOf(p.poly));
      continue;
    }
    if (p.kind !== 'back') continue;
    const x1 = zoneMid(p.ca);
    const x2 = zoneMid(p.cb - 1);
    const meanC = (p.start.y + p.end.y) / 2;
    let cands = corridorLevels(p, x2, x1).filter(c => (p.side < 0 ? c <= meanC : c > meanC));
    if (cands.length === 0) {
      const spanNodes = nodes.filter(n => n.x < x1 && n.x + n.width > x2);
      cands = [p.side < 0 ? Math.min(...spanNodes.map(n => n.y)) - 18 : Math.max(...spanNodes.map(n => n.y + n.height)) + 18];
    }
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    let best = cands[0];
    let bestCost = Infinity;
    for (const c of cands) {
      const poly = [p.start, { x: x1, y: p.start.y }, { x: x1, y: c }, { x: x2, y: c }, { x: x2, y: p.end.y }, p.end];
      let cost = Math.abs(c - p.start.y) + Math.abs(c - p.end.y) + 30 * crossings(poly, others);
      for (const g of groups) {
        const holds = inBox(g.box, p.a) || inBox(g.box, p.b);
        if (!holds && c > g.box.y && c < g.box.y + g.box.height && g.box.x < hi && g.box.x + g.box.width > lo) cost += 60;
      }
      if (usedRuns.some(u => Math.abs(u.c - c) < 8 && u.hi > lo && u.lo < hi)) cost += 80;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    usedRuns.push({ c: best, lo, hi });
    p.levels = [p.start.y, best, p.end.y];
    p.jogs = [
      { edge: p.e.id, gap: p.ca, lefts: [p.start.y], rights: [best] },
      { edge: p.e.id, gap: p.cb - 1, lefts: [best], rights: [p.end.y] },
    ];
    p.poly = cleanPolyline([p.start, { x: x1, y: p.start.y }, { x: x1, y: best }, { x: x2, y: best }, { x: x2, y: p.end.y }, p.end]);
    others.push(...segmentsOf(p.poly));
  }

  // --- итоговые полосы для всех рёбер ---
  allocateLanes(plans.flatMap(p => p.jogs), zoneOf);
  for (const p of plans) {
    if (p.kind === 'forward') p.poly = cleanPolyline(buildForward(p));
    else if (p.kind === 'back') {
      const j1 = p.jogs[0];
      const j2 = p.jogs[1];
      const c = p.levels[1];
      p.poly = cleanPolyline([p.start, { x: j1.x!, y: p.start.y }, { x: j1.x!, y: c }, { x: j2.x!, y: c }, { x: j2.x!, y: p.end.y }, p.end]);
    }
  }

  // --- в исходную систему координат ---
  const polysOrig = new Map<string, Pt[]>();
  for (const p of plans) polysOrig.set(p.e.id, p.poly.map(fromL));

  const labelItems = plans.filter(p => p.e.label).map(p => ({ id: p.e.id, poly: polysOrig.get(p.e.id)!, text: p.e.label! }));
  const titleRects = groupsIn.map(g => ({ x: g.x, y: g.y, width: Math.min(g.width, (g.title?.length ?? 0) * 9 + 30), height: 30 }));
  const labels = placeLabels(labelItems, nodesIn, titleRects, [...polysOrig].map(([id, poly]) => ({ id, poly })));

  for (const p of plans) {
    const poly = polysOrig.get(p.e.id)!;
    const a0 = origById.get(p.a.id)!;
    const b0 = origById.get(p.b.id)!;
    const start = poly[0];
    const end = poly[poly.length - 1];
    result.set(p.e.id, {
      start,
      end,
      outDir: SIDE_VEC[sides.out],
      inDir: SIDE_VEC[sides.in],
      inner: poly.slice(1, -1),
      srcOffset: { x: start.x - a0.x, y: start.y - a0.y },
      dstOffset: { x: end.x - b0.x, y: end.y - b0.y },
      srcPos: { x: a0.x, y: a0.y },
      dstPos: { x: b0.x, y: b0.y },
      label: labels.get(p.e.id),
    });
  }
  return result;
}

/**
 * Маршрут для перетащенных узлов (прежний маршрут уже неверен): простой ортогональный путь «Z» или,
 * если цель позади источника, объезд. `out` — направление выхода из источника (единичный вектор потока).
 */
export function orthoFallback(start: Pt, end: Pt, out: Pt): Pt[] {
  const n = { x: -out.y, y: out.x };
  const a = (p: Pt) => p.x * out.x + p.y * out.y;
  const c = (p: Pt) => p.x * n.x + p.y * n.y;
  const back = (av: number, cv: number): Pt => ({ x: out.x * av + n.x * cv, y: out.y * av + n.y * cv });
  const aS = a(start);
  const aE = a(end);
  const cS = c(start);
  const cE = c(end);
  if (aE - aS >= 44) {
    if (Math.abs(cS - cE) < 0.5) return [];
    const am = (aS + aE) / 2;
    return [back(am, cS), back(am, cE)];
  }
  const a1 = aS + 24;
  const a2 = aE - 24;
  const cm = Math.abs(cS - cE) < 40 ? Math.max(cS, cE) + 70 : (cS + cE) / 2;
  return [back(a1, cS), back(a1, cm), back(a2, cm), back(a2, cE)];
}

// --- Подписи рядом с линией ----------------------------------------------------

interface LabelCand {
  x: number;
  y: number;
  anchor: LabelPlacement['anchor'];
  rect: Rect;
  host: number;
  cost: number;
}

/**
 * Места подписей рёбер. Подпись стоит рядом с отрезком линии (над горизонтальным, сбоку от вертикального),
 * в свободном месте: не на узлах и заголовках подграфов, не на чужих линиях и других подписях.
 */
export function placeLabels(
  items: Array<{ id: string; poly: Pt[]; text: string }>,
  nodes: Rect[],
  titles: Rect[],
  allPolys: Array<{ id: string; poly: Pt[] }>
): Map<string, LabelPlacement> {
  const out = new Map<string, LabelPlacement>();
  const segsByEdge = new Map<string, Seg[]>();
  for (const e of allPolys) segsByEdge.set(e.id, segmentsOf(e.poly));
  const placed: Rect[] = [];
  const obstacles = [...nodes, ...titles];
  for (const it of items) {
    const w = Math.max(10, it.text.length * EDGE_LABEL_CHAR_W);
    const own = segsByEdge.get(it.id) || [];
    const total = own.reduce((s, g) => s + Math.hypot(g[1].x - g[0].x, g[1].y - g[0].y), 0);
    const foreign: Seg[] = [];
    for (const [id, segs] of segsByEdge) if (id !== it.id) foreign.push(...segs);
    let best: LabelCand | undefined;
    let before = 0;
    own.forEach((s, si) => {
      const len = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
      const horiz = isHoriz(s);
      if (len >= 12) {
        for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          for (const side of [-1, 1]) {
            let x: number, y: number, anchor: LabelPlacement['anchor'], rect: Rect;
            if (horiz) {
              x = s[0].x + (s[1].x - s[0].x) * t;
              y = s[0].y + side * LABEL_GAP;
              anchor = 'middle';
              rect = { x: x - w / 2, y: y - LABEL_H / 2, width: w, height: LABEL_H };
            } else {
              const cy = s[0].y + (s[1].y - s[0].y) * t;
              x = s[0].x + side * 8;
              y = cy;
              anchor = side > 0 ? 'start' : 'end';
              rect = { x: side > 0 ? x : x - w, y: y - LABEL_H / 2, width: w, height: LABEL_H };
            }
            let cost = Math.abs(before + len * t - total / 2) * 0.15 + (horiz ? 0 : 20) + (side > 0 ? 1 : 0);
            if (horiz) cost += Math.max(0, w + 4 - len) * 3;
            else cost += Math.max(0, LABEL_H - len) * 3;
            for (const r of obstacles) if (rect.x < r.x + r.width + 3 && rect.x + rect.width > r.x - 3 && rect.y < r.y + r.height + 3 && rect.y + rect.height > r.y - 3) cost += 5000;
            for (const r of placed) if (rect.x < r.x + r.width + 4 && rect.x + rect.width > r.x - 4 && rect.y < r.y + r.height + 3 && rect.y + rect.height > r.y - 3) cost += 3000;
            own.forEach((g, gi) => { if (gi !== si && segHitsRect(g, rect, 1)) cost += 400; });
            for (const g of foreign) if (segHitsRect(g, rect, 1)) cost += 400;
            if (!best || cost < best.cost) best = { x, y, anchor, rect, host: si, cost };
          }
        }
      }
      before += len;
    });
    if (!best) {
      const m = pathMidpoint(it.poly);
      best = { x: m.x, y: m.y - LABEL_GAP, anchor: 'middle', rect: { x: m.x - w / 2, y: m.y - LABEL_GAP - LABEL_H / 2, width: w, height: LABEL_H }, host: -1, cost: 0 };
    }
    placed.push(best.rect);
    out.set(it.id, { x: best.x, y: best.y, anchor: best.anchor });
  }
  return out;
}

/** Подпись для перетащенного ребра: над самым длинным горизонтальным отрезком (иначе — сбоку от вертикального). */
export function labelBeside(poly: Pt[]): LabelPlacement {
  const segs = segmentsOf(poly);
  if (segs.length === 0) return { x: poly[0]?.x ?? 0, y: (poly[0]?.y ?? 0) - LABEL_GAP, anchor: 'middle' };
  const len = (s: Seg) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
  const horizontals = segs.filter(isHoriz);
  const pool = horizontals.length ? horizontals : segs;
  const s = pool.reduce((m, g) => (len(g) > len(m) ? g : m), pool[0]);
  if (isHoriz(s)) return { x: (s[0].x + s[1].x) / 2, y: s[0].y - LABEL_GAP, anchor: 'middle' };
  return { x: s[0].x + 8, y: (s[0].y + s[1].y) / 2, anchor: 'start' };
}

// --- Наконечники ------------------------------------------------------------

export type HeadKind = 'arrow' | 'circle' | 'cross' | 'er-one' | 'er-zero-one' | 'er-one-many' | 'er-zero-many';

export interface HeadShape {
  kind: HeadKind;
  /** замкнутая стрелка: вершины треугольника */
  polygon?: Pt[];
  /** круг на конце */
  circle?: { c: Pt; r: number };
  /** крест: четыре точки (две линии) */
  cross?: [Pt, Pt, Pt, Pt];
  /** отрезки (ER: засечки «один» и «лапка» «много») */
  lines?: Array<[Pt, Pt]>;
  /** на сколько линия должна быть короче, чтобы не заходить под наконечник */
  inset: number;
}

/** Наконечник в точке `tip`; `dir` — единичный вектор движения линии в сторону `tip`. */
export function headShape(kind: HeadKind, tip: Pt, dir: Pt): HeadShape {
  const nx = -dir.y;
  const ny = dir.x;
  if (kind.startsWith('er-')) {
    // нотация «воронья лапка»: tip — на границе сущности, dir — движение линии к ней
    const at = (d: number): Pt => ({ x: tip.x - dir.x * d, y: tip.y - dir.y * d });
    const bar = (d: number): [Pt, Pt] => {
      const c = at(d);
      return [{ x: c.x + nx * 7, y: c.y + ny * 7 }, { x: c.x - nx * 7, y: c.y - ny * 7 }];
    };
    const foot = (): Array<[Pt, Pt]> => {
      const apex = at(12);
      return [[apex, { x: tip.x + nx * 7, y: tip.y + ny * 7 }], [apex, tip], [apex, { x: tip.x - nx * 7, y: tip.y - ny * 7 }]];
    };
    const ring = (d: number) => ({ c: at(d), r: 4.5 });
    switch (kind) {
      case 'er-one':
        return { kind, lines: [bar(5), bar(10)], inset: 10 };
      case 'er-zero-one':
        return { kind, lines: [bar(6)], circle: ring(15), inset: 19.5 };
      case 'er-one-many':
        return { kind, lines: [...foot(), bar(17)], inset: 17 };
      default:
        return { kind, lines: foot(), circle: ring(18), inset: 22.5 };
    }
  }
  if (kind === 'arrow') {
    const L = 10;
    const W = 5;
    const bx = tip.x - dir.x * L;
    const by = tip.y - dir.y * L;
    return {
      kind,
      polygon: [tip, { x: bx + nx * W, y: by + ny * W }, { x: bx - nx * W, y: by - ny * W }],
      inset: L - 1,
    };
  }
  if (kind === 'circle') {
    const R = 4.5;
    return { kind, circle: { c: { x: tip.x - dir.x * R, y: tip.y - dir.y * R }, r: R }, inset: R * 2 };
  }
  const s = 5;
  const c = { x: tip.x - dir.x * s, y: tip.y - dir.y * s };
  return {
    kind,
    cross: [{ x: c.x - s, y: c.y - s }, { x: c.x + s, y: c.y + s }, { x: c.x + s, y: c.y - s }, { x: c.x - s, y: c.y + s }],
    inset: s * 2,
  };
}

export interface PathSpec {
  start: Pt;
  end: Pt;
  /** единичный вектор движения в начале линии */
  startDir: Pt;
  /** единичный вектор движения в конце линии */
  endDir: Pt;
  /** изломы между start и end */
  inner: Pt[];
}

export interface EdgeGeometry {
  /** путь линии SVG (уже укорочен под наконечники, углы скруглены) */
  d: string;
  /** вершины ломаной (для габаритов) */
  sample: Pt[];
  midpoint: Pt;
  startHead?: HeadShape;
  endHead?: HeadShape;
}

/** Линия с наконечниками по итоговой геометрии ребра. */
export function edgeGeometry(spec: PathSpec, headStart: HeadKind | 'none', headEnd: HeadKind | 'none'): EdgeGeometry {
  const full = [spec.start, ...spec.inner, spec.end];
  const endHead = headEnd !== 'none' ? headShape(headEnd, spec.end, spec.endDir) : undefined;
  // в начале линия идёт «от узла»: направление к кончику — противоположное движению
  const startHead = headStart !== 'none' ? headShape(headStart, spec.start, { x: -spec.startDir.x, y: -spec.startDir.y }) : undefined;
  const line = full.slice();
  // первый и последний отрезки осевые: укорачиваем их вдоль направления порта (но не больше длины отрезка)
  const shorten = (i: number, j: number, dir: Pt, inset: number) => {
    const len = Math.hypot(line[j].x - line[i].x, line[j].y - line[i].y);
    const k = Math.min(inset, Math.max(0, len - 1));
    line[i] = { x: line[i].x + dir.x * k, y: line[i].y + dir.y * k };
  };
  if (startHead) shorten(0, 1, spec.startDir, startHead.inset);
  if (endHead) shorten(line.length - 1, line.length - 2, { x: -spec.endDir.x, y: -spec.endDir.y }, endHead.inset);
  return { d: roundedPath(line), sample: full, midpoint: pathMidpoint(full), startHead, endHead };
}
