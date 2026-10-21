import { describe, it, expect } from 'vitest';
import { routeEdges, portPoint, portOffsets, edgeGeometry, headShape, flowSides, orthoFallback, placeLabels, type RouteNode, type Pt } from '../src/utils/edgePath';
import { parseMermaidSource } from '../src/utils/mermaidParse';
import { layoutMermaid } from '../src/utils/mermaidToGraph';

const rect = (id: string, x: number, y: number, w = 140, h = 50, shape = 'rectangle'): RouteNode => ({ id, x, y, width: w, height: h, shape });
const polyOf = (r: { start: Pt; end: Pt; inner: Pt[] }) => [r.start, ...r.inner, r.end];
const orthogonal = (pts: Pt[]) => pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) < 0.01 || Math.abs(p.y - pts[i - 1].y) < 0.01);
const inside = (p: Pt, n: RouteNode) => p.x > n.x + 1 && p.x < n.x + n.width - 1 && p.y > n.y + 1 && p.y < n.y + n.height - 1;
/** ломаная не заходит внутрь узлов (кроме концов) */
const avoids = (pts: Pt[], nodes: RouteNode[]) => {
  for (let i = 1; i < pts.length; i++) {
    for (let k = 0; k <= 20; k++) {
      const p = { x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / 20, y: pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / 20 };
      if (nodes.some(n => inside(p, n))) return false;
    }
  }
  return true;
};

describe('порты рёбер', () => {
  it('смещения портов: одна — по центру, несколько — симметрично и не теснее шага стрелки', () => {
    expect(portOffsets(1, 50, false)).toEqual([0]);
    const two = portOffsets(2, 50, false);
    expect(two[0]).toBe(-two[1]);
    expect(two[1] - two[0] >= 14).toBe(true);
    const many = portOffsets(5, 50, false);
    expect(many.every((v, i) => i === 0 || v > many[i - 1])).toBe(true);
    expect(Math.max(...many.map(Math.abs)) <= 25).toBe(true);
  });

  it('точка порта лежит на контуре ромба и круга', () => {
    const rh = rect('r', 0, 0, 144, 144, 'rhombus');
    const p = portPoint(rh, 'right', 20);
    expect(Math.abs(p.x - 72) / 72 + Math.abs(p.y - 72) / 72).toBeCloseTo(1, 5);
    const c = rect('c', 0, 0, 112, 112, 'circle');
    const q = portPoint(c, 'bottom', 15);
    expect(Math.hypot((q.x - 56) / 56, (q.y - 56) / 56)).toBeCloseTo(1, 5);
    expect(portPoint(rect('x', 10, 20, 100, 40), 'left', -7)).toEqual({ x: 10, y: 33 });
  });

  it('несколько входящих рёбер приходят в разные точки, исходящие тоже; порядок без пересечений у узла', () => {
    const nodes = [rect('a', 0, 0), rect('b', 0, 120), rect('c', 300, 0), rect('d', 300, 120)];
    const routes = routeEdges('LR', nodes, [
      { id: 'e1', source: 'a', target: 'c' }, { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'a', target: 'd' }, { id: 'e4', source: 'b', target: 'd' },
    ]);
    const r = ['e1', 'e2', 'e3', 'e4'].map(id => routes.get(id)!);
    expect(r[0].end.x).toBe(300);
    expect(r[0].end.y < r[1].end.y).toBe(true);
    expect(r[0].start.y < r[2].start.y).toBe(true);
    expect(r[0].start.x).toBe(140);
    expect(r[0].outDir).toEqual({ x: 1, y: 0 });
    expect(r[0].inDir).toEqual({ x: -1, y: 0 });
  });

  it('вертикальный поток: выход снизу, вход сверху; BT и RL зеркальны', () => {
    const r = routeEdges('TB', [rect('a', 0, 0), rect('b', 0, 200)], [{ id: 'e', source: 'a', target: 'b' }]).get('e')!;
    expect(r.start).toEqual({ x: 70, y: 50 });
    expect(r.end).toEqual({ x: 70, y: 200 });
    expect(flowSides('BT')).toEqual({ out: 'top', in: 'bottom' });
    const bt = routeEdges('BT', [rect('a', 0, 200), rect('b', 0, 0)], [{ id: 'e', source: 'a', target: 'b' }]).get('e')!;
    expect(bt.start.y).toBe(200);
    expect(bt.end.y).toBe(50);
    const rl = routeEdges('RL', [rect('a', 300, 0), rect('b', 0, 0)], [{ id: 'e', source: 'a', target: 'b' }]).get('e')!;
    expect(rl.start.x).toBe(300);
    expect(rl.end.x).toBe(140);
  });
});

describe('ортогональные маршруты', () => {
  const dirs = ['LR', 'RL', 'TB', 'BT'] as const;

  it('смена уровня — только прямыми углами, ровные рёбра без изломов', () => {
    const straight = routeEdges('LR', [rect('a', 0, 0), rect('b', 300, 0)], [{ id: 'e', source: 'a', target: 'b' }]).get('e')!;
    expect(straight.inner).toEqual([]);
    const jog = routeEdges('LR', [rect('a', 0, 0), rect('b', 300, 100)], [{ id: 'e', source: 'a', target: 'b' }]).get('e')!;
    expect(jog.inner.length).toBe(2);
    expect(orthogonal(polyOf(jog))).toBe(true);
    // излом — в зазоре между узлами
    expect(jog.inner.every(p => p.x > 140 && p.x < 300)).toBe(true);
  });

  it('любое направление: все углы прямые, линии не заходят в чужие узлы', () => {
    for (const d of dirs) {
      const nodes = [rect('a', 0, 0), rect('b', 0, 130), rect('m', 300, 60), rect('c', 600, 0), rect('d', 600, 130)];
      const swap = (n: RouteNode): RouteNode => (d === 'TB' || d === 'BT' ? { ...n, x: n.y, y: n.x, width: n.height, height: n.width } : n);
      const flip = (n: RouteNode): RouteNode => (d === 'RL' ? { ...n, x: 900 - n.x - n.width } : d === 'BT' ? { ...n, y: 900 - n.y - n.height } : n);
      const ns = nodes.map(n => flip(swap(n)));
      const edges = [
        { id: '1', source: 'a', target: 'm' }, { id: '2', source: 'b', target: 'm' },
        { id: '3', source: 'm', target: 'c' }, { id: '4', source: 'm', target: 'd' }, { id: '5', source: 'a', target: 'c' },
      ];
      const routes = routeEdges(d, ns, edges);
      for (const e of edges) {
        const r = routes.get(e.id)!;
        expect(orthogonal(polyOf(r))).toBe(true);
        expect(avoids(polyOf(r), ns.filter(n => n.id !== e.source && n.id !== e.target))).toBe(true);
      }
    }
  });

  it('шина: рёбра с одной целью и ключом сливаются в один вход; с подписью — не сливаются', () => {
    const nodes = [rect('a', 0, 0), rect('b', 0, 130), rect('c', 300, 65)];
    const bus = routeEdges('LR', nodes, [{ id: '1', source: 'a', target: 'c', bus: 'k' }, { id: '2', source: 'b', target: 'c', bus: 'k' }]);
    expect(bus.get('1')!.end).toEqual(bus.get('2')!.end);
    expect(bus.get('1')!.inner[bus.get('1')!.inner.length - 1].x).toBeCloseTo(bus.get('2')!.inner[bus.get('2')!.inner.length - 1].x, 5);
    const plain = routeEdges('LR', nodes, [{ id: '1', source: 'a', target: 'c' }, { id: '2', source: 'b', target: 'c' }]);
    expect(plain.get('1')!.end).not.toEqual(plain.get('2')!.end);
  });

  it('несколько изломов в одном зазоре идут по разным вертикалям', () => {
    const nodes = [rect('a', 0, 0), rect('b', 0, 100), rect('c', 300, 200), rect('d', 300, 300)];
    const routes = routeEdges('LR', nodes, [{ id: '1', source: 'a', target: 'd' }, { id: '2', source: 'b', target: 'c' }]);
    const x1 = routes.get('1')!.inner[0].x;
    const x2 = routes.get('2')!.inner[0].x;
    expect(Math.abs(x1 - x2)).toBeGreaterThanOrEqual(5);
  });

  it('обратное ребро идёт коридором вне узлов; петля — над узлом', () => {
    const nodes = [rect('a', 0, 0), rect('b', 300, 0)];
    const routes = routeEdges('LR', nodes, [{ id: 'back', source: 'b', target: 'a' }, { id: 'loop', source: 'a', target: 'a' }]);
    for (const id of ['back', 'loop']) {
      const r = routes.get(id)!;
      expect(orthogonal(polyOf(r))).toBe(true);
      expect(r.inner.length).toBeGreaterThan(0);
    }
    const back = routes.get('back')!;
    expect(avoids(polyOf(back), nodes.filter(n => false))).toBe(true);
    expect(back.inner.some(p => p.y < 0 || p.y > 50)).toBe(true);
    expect(back.inner.every(p => !inside(p, nodes[0]) && !inside(p, nodes[1]))).toBe(true);
  });

  it('orthoFallback: простой «Z» вперёд и объезд назад, только прямые углы', () => {
    const fwd = orthoFallback({ x: 0, y: 0 }, { x: 200, y: 80 }, { x: 1, y: 0 });
    expect(orthogonal([{ x: 0, y: 0 }, ...fwd, { x: 200, y: 80 }])).toBe(true);
    expect(orthoFallback({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 1, y: 0 })).toEqual([]);
    const back = orthoFallback({ x: 200, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(back.length).toBe(4);
    expect(orthogonal([{ x: 200, y: 0 }, ...back, { x: 0, y: 0 }])).toBe(true);
    const down = orthoFallback({ x: 0, y: 0 }, { x: 60, y: 200 }, { x: 0, y: 1 });
    expect(orthogonal([{ x: 0, y: 0 }, ...down, { x: 60, y: 200 }])).toBe(true);
  });

  it('подпись стоит рядом с линией и не на узле', () => {
    const nodes = [rect('a', 0, 0), rect('b', 300, 0)];
    const r = routeEdges('LR', nodes, [{ id: 'e', source: 'a', target: 'b', label: 'dbt run' }]).get('e')!;
    expect(r.label).toBeDefined();
    expect(Math.abs(r.label!.y - 25)).toBeGreaterThanOrEqual(7);
    expect(Math.abs(r.label!.y - 25)).toBeLessThanOrEqual(12);
    const placed = placeLabels([{ id: 'x', poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }], text: 'hello' }], [], [], [{ id: 'x', poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }]);
    expect(placed.get('x')!.anchor).toBe('middle');
  });
});

describe('линия и наконечники', () => {
  const spec = { start: { x: 0, y: 0 }, end: { x: 200, y: 100 }, startDir: { x: 1, y: 0 }, endDir: { x: 1, y: 0 }, inner: [{ x: 100, y: 0 }, { x: 100, y: 100 }] };

  it('стрелка: вершина в конце, линия укорочена; у <--> два наконечника; углы скруглены', () => {
    const g = edgeGeometry(spec, 'none', 'arrow');
    expect(g.endHead!.polygon![0]).toEqual({ x: 200, y: 100 });
    expect(g.startHead).toBeUndefined();
    expect(g.d.startsWith('M0 0L')).toBe(true);
    expect(g.d.includes('Q100 0')).toBe(true);
    expect(g.d.endsWith('191 100')).toBe(true);
    expect(edgeGeometry(spec, 'arrow', 'arrow').startHead!.polygon![0]).toEqual({ x: 0, y: 0 });
    expect(headShape('circle', { x: 10, y: 0 }, { x: 1, y: 0 }).circle!.c).toEqual({ x: 5.5, y: 0 });
    expect(headShape('cross', { x: 10, y: 0 }, { x: 1, y: 0 }).cross!.length).toBe(4);
  });

  it('рёбра встроенных схем: углы прямые, числа конечны, порты и наконечники не слипаются', () => {
    const codes = [
      'flowchart LR\nA[Источник 1] & B[Источник 2] --> C[Обработчик 1] & D[Обработчик 2]\nC & D --> E(((Результат)))',
      'flowchart TB\nS1 --> H{Хаб}\nS2 --> H\nS3 --> H\nS4 --> H\nH --> T1\nH --> T2\nH -->|м| T3',
      'flowchart LR\nA-->B-->C-->D\nA-->D\nD-->A\nC-->C',
      'flowchart RL\nA-->B\nA-->C\nB-->D\nC-->D',
      'flowchart BT\nA-->B\nA-->C\nB-->D\nC-->D',
      'flowchart LR\nsubgraph S [Группа]\ndirection TB\nX-->Y-->Z\nend\nA-->B',
    ];
    for (const code of codes) {
      const ir = parseMermaidSource(code);
      const layout = layoutMermaid(ir);
      const outs = new Map<string, Pt[]>();
      for (const e of ir.edges) {
        const r = layout.edgeRoutes.get(e.id)!;
        expect(r).toBeDefined();
        const poly = polyOf(r);
        for (const p of poly) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(orthogonal(poly)).toBe(true);
        const o = outs.get(e.source) || []; o.push(r.start); outs.set(e.source, o);
      }
      for (const [, pts] of outs) {
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= 10).toBe(true);
      }
    }
  });

  it('direction внутри подграфа работает, если узлы не связаны с внешними, и игнорируется иначе (как в Mermaid)', () => {
    const isolated = layoutMermaid(parseMermaidSource('flowchart LR\nsubgraph S [Группа]\ndirection TB\nX-->Y\nend\nA-->B'));
    const pos = (l: ReturnType<typeof layoutMermaid>, id: string) => l.nodes.find(n => n.node.id === id)!;
    expect(Math.abs(pos(isolated, 'X').x - pos(isolated, 'Y').x)).toBeLessThan(5); // вертикально
    expect(pos(isolated, 'Y').y).toBeGreaterThan(pos(isolated, 'X').y);
    expect(isolated.groups.some(g => g.id === 'S')).toBe(true);
    const linked = layoutMermaid(parseMermaidSource('flowchart LR\nsubgraph S [Группа]\ndirection TB\nX-->Y\nend\nA-->X'));
    expect(pos(linked, 'Y').x).toBeGreaterThan(pos(linked, 'X').x + 50); // слева направо: direction проигнорирован
  });
});
