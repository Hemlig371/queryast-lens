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

/**
 * Промежуточные точки маршрута, которые почти лежат на прямой «начало — конец», только портят линию:
 * размеры узлов в раскладке и на экране различаются на несколько px, и ребро получается волнистым.
 * Если все такие точки отклоняются от прямой не больше tol px, маршрут не нужен — рисуем прямую.
 * Точки, которые реально обходят узлы (отклонение больше tol), остаются.
 */
export function dropNearStraightRoute(from: Pt, inner: Pt[], to: Pt, tol = 16): Pt[] {
  if (inner.length === 0) return inner;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return inner;
  for (const p of inner) {
    const dist = Math.abs(dx * (from.y - p.y) - (from.x - p.x) * dy) / len;
    if (dist > tol) return inner;
  }
  return [];
}
