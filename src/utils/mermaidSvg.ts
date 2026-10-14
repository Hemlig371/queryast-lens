import { parseMermaidSource, formatMermaidIssue, type MermaidIssue, type MermaidEdgeIR } from './mermaidParse';
import { layoutMermaid, describeMermaidIssues, type MermaidLayoutNode } from './mermaidToGraph';
import { escapeHtml } from './markdown';
import { t } from './i18n';
import { roundedPath, pathMidpoint, type Pt } from './edgePath';

/**
 * Статичный SVG для Mermaid-блоков внутри Markdown. Без React Flow и без анимаций:
 * раскладка та же, что у интерактивного графа (layoutMermaid), результат — строка SVG,
 * которая вставляется в предпросмотр. Цвета задаются CSS-переменными (index.css, .md-preview),
 * поэтому светлая/тёмная темы переключаются без перерисовки.
 */

const FONT = 13;
const LINE_H = 16;
const CHAR_W = 7.3;

const r1 = (n: number) => Math.round(n * 10) / 10;

function safeColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 40 || /url\s*\(|expression|[;{}<>"']/.test(s)) return null;
  return /^[#\w(),.%\s-]+$/.test(s) ? s : null;
}

function nodeInlineStyle(style: Record<string, any> | undefined): string {
  if (!style) return '';
  const parts: string[] = [];
  const fill = safeColor(style.backgroundColor);
  const stroke = safeColor(style.borderColor);
  if (fill) parts.push(`fill:${fill}`);
  if (stroke) parts.push(`stroke:${stroke}`);
  const bw = typeof style.borderWidth === 'string' ? parseFloat(style.borderWidth) : NaN;
  if (Number.isFinite(bw) && bw > 0 && bw < 20) parts.push(`stroke-width:${bw}`);
  if (style.borderStyle === 'dashed') parts.push('stroke-dasharray:5 4');
  return parts.length ? ` style="${parts.join(';')}"` : '';
}

/** Текст подписи: <br> -> перенос, остальные теги убираем, переносим по ширине. */
function labelLines(label: string, maxChars: number): string[] {
  const plain = label
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ');
  const out: string[] = [];
  for (const rawLine of plain.split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let cur = '';
    for (let w of words) {
      while (w.length > maxChars) {
        if (cur) { out.push(cur); cur = ''; }
        out.push(w.slice(0, maxChars));
        w = w.slice(maxChars);
      }
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
      else { out.push(cur); cur = w; }
    }
    out.push(cur);
  }
  return out.length ? out : [''];
}

function shapeSvg(shape: string, x: number, y: number, w: number, h: number, style: string): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const k = 14;
  const poly = (pts: Array<[number, number]>) =>
    `<polygon class="mm-shape" points="${pts.map(p => `${r1(p[0])},${r1(p[1])}`).join(' ')}"${style}/>`;
  switch (shape) {
    case 'rounded':
      return `<rect class="mm-shape" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="14"${style}/>`;
    case 'stadium':
      return `<rect class="mm-shape" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h / 2)}"${style}/>`;
    case 'circle':
      return `<ellipse class="mm-shape" cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}"${style}/>`;
    case 'double_circle':
      return (
        `<ellipse class="mm-shape" cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}"${style}/>` +
        `<ellipse class="mm-shape mm-inner" cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(w / 2 - 6)}" ry="${r1(h / 2 - 6)}"${style}/>`
      );
    case 'rhombus':
    case 'diamond':
      return poly([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]);
    case 'hexagon':
      return poly([[x + k, y], [x + w - k, y], [x + w, cy], [x + w - k, y + h], [x + k, y + h], [x, cy]]);
    case 'cylinder':
    case 'database': {
      const ry = 8;
      const d1 = `M${r1(x)} ${r1(y + ry)}A${r1(w / 2)} ${ry} 0 0 1 ${r1(x + w)} ${r1(y + ry)}L${r1(x + w)} ${r1(y + h - ry)}A${r1(w / 2)} ${ry} 0 0 1 ${r1(x)} ${r1(y + h - ry)}Z`;
      const d2 = `M${r1(x)} ${r1(y + ry)}A${r1(w / 2)} ${ry} 0 0 0 ${r1(x + w)} ${r1(y + ry)}`;
      return `<path class="mm-shape" d="${d1}"${style}/><path class="mm-shape mm-rim" d="${d2}"${style}/>`;
    }
    case 'subroutine':
      return (
        `<rect class="mm-shape" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="3"${style}/>` +
        `<line class="mm-rim" x1="${r1(x + 8)}" y1="${r1(y)}" x2="${r1(x + 8)}" y2="${r1(y + h)}"/>` +
        `<line class="mm-rim" x1="${r1(x + w - 8)}" y1="${r1(y)}" x2="${r1(x + w - 8)}" y2="${r1(y + h)}"/>`
      );
    case 'parallelogram':
      return poly([[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]]);
    case 'parallelogram_alt':
      return poly([[x, y], [x + w - k, y], [x + w, y + h], [x + k, y + h]]);
    case 'trapezoid':
      return poly([[x + k, y], [x + w - k, y], [x + w, y + h], [x, y + h]]);
    case 'trapezoid_alt':
      return poly([[x, y], [x + w, y], [x + w - k, y + h], [x + k, y + h]]);
    case 'asymmetric':
      return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x + k, cy]]);
    default:
      return `<rect class="mm-shape" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="4"${style}/>`;
  }
}

function nodeSvg(ln: MermaidLayoutNode): string {
  const { node, x, y, width: w, height: h } = ln;
  const style = nodeInlineStyle(node.style);
  const textColor = safeColor(node.style?.color);
  const inner = node.shape === 'circle' || node.shape === 'double_circle' ? 0.6 : node.shape === 'rhombus' ? 0.55 : node.shape === 'hexagon' ? 0.8 : 0.9;
  const maxChars = Math.max(6, Math.floor((w * inner - 8) / CHAR_W));
  const lines = labelLines(node.label || node.id, maxChars);
  const fs = Math.max(10, Math.min(FONT, (h * 0.8) / (lines.length * 1.25)));
  const lh = fs * 1.25;
  const startY = y + h / 2 - ((lines.length - 1) * lh) / 2;
  const tspans = lines
    .map((l, i) => `<tspan x="${r1(x + w / 2)}" y="${r1(startY + i * lh)}">${escapeHtml(l)}</tspan>`)
    .join('');
  return (
    `<g class="mm-node" data-id="${escapeHtml(node.id)}">` +
    shapeSvg(node.shape, x, y, w, h, style) +
    `<text class="mm-label" text-anchor="middle" dominant-baseline="central" font-size="${r1(fs)}"${textColor ? ` style="fill:${textColor}"` : ''}>${tspans}</text>` +
    `</g>`
  );
}


function clipToRect(from: Pt, to: Pt, rect: { x: number; y: number; width: number; height: number }): Pt {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = from.x - cx;
  const dy = from.y - cy;
  if (dx === 0 && dy === 0) return to;
  const sx = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Точка на контуре узла на луче от центра к `toward` (ромб, круг/эллипс); для остальных форм — прямоугольник. */
function clipToShape(node: { node: { shape: string }; x: number; y: number; width: number; height: number }, toward: Pt): Pt {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = node.width / 2;
  const hh = node.height / 2;
  const shape = node.node.shape;
  let s: number;
  if (shape === 'rhombus' || shape === 'diamond') {
    s = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  } else if (shape === 'circle' || shape === 'double_circle') {
    s = 1 / Math.hypot(dx / hw, dy / hh);
  } else {
    return clipToRect(toward, { x: cx, y: cy }, node);
  }
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Голова стрелки в точке `tip`, направленная от `from` к `tip`; линия укорачивается на `inset`. */
function headSvg(kind: 'arrow' | 'circle' | 'cross', tip: Pt, from: Pt): { svg: string; inset: number } {
  const len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / len;
  const uy = (tip.y - from.y) / len;
  const nx = -uy;
  const ny = ux;
  if (kind === 'arrow') {
    const L = 10;
    const W = 5;
    const bx = tip.x - ux * L;
    const by = tip.y - uy * L;
    return {
      svg: `<polygon class="mm-head" points="${r1(tip.x)},${r1(tip.y)} ${r1(bx + nx * W)},${r1(by + ny * W)} ${r1(bx - nx * W)},${r1(by - ny * W)}"/>`,
      inset: L - 1,
    };
  }
  if (kind === 'circle') {
    const R = 4.5;
    return { svg: `<circle class="mm-head mm-head-open" cx="${r1(tip.x - ux * R)}" cy="${r1(tip.y - uy * R)}" r="${R}"/>`, inset: R * 2 };
  }
  const s = 5;
  const c = { x: tip.x - ux * s, y: tip.y - uy * s };
  return {
    svg: `<path class="mm-cross" d="M${r1(c.x - s)} ${r1(c.y - s)}L${r1(c.x + s)} ${r1(c.y + s)}M${r1(c.x + s)} ${r1(c.y - s)}L${r1(c.x - s)} ${r1(c.y + s)}"/>`,
    inset: s * 2,
  };
}

function shorten(pts: Pt[], atEnd: boolean, by: number): Pt[] {
  if (pts.length < 2 || by <= 0) return pts;
  const out = pts.map(p => ({ ...p }));
  const i = atEnd ? out.length - 1 : 0;
  const j = atEnd ? out.length - 2 : 1;
  const len = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y);
  if (len <= by + 1) return out;
  out[i] = { x: out[i].x - ((out[i].x - out[j].x) / len) * by, y: out[i].y - ((out[i].y - out[j].y) / len) * by };
  return out;
}

function edgeSvg(edge: MermaidEdgeIR, pts: Pt[]): string {
  if (edge.lineType === 'invisible' || pts.length < 2) return '';
  let line = pts;
  let heads = '';
  if (edge.headEnd !== 'none') {
    const h = headSvg(edge.headEnd, pts[pts.length - 1], pts[pts.length - 2]);
    heads += h.svg;
    line = shorten(line, true, h.inset);
  }
  if (edge.headStart !== 'none') {
    const h = headSvg(edge.headStart, pts[0], pts[1]);
    heads += h.svg;
    line = shorten(line, false, h.inset);
  }
  const cls = `mm-edge${edge.lineType === 'dotted' ? ' mm-dotted' : edge.lineType === 'thick' ? ' mm-thick' : ''}`;
  const stroke = safeColor(edge.style?.stroke);
  const sw = typeof edge.style?.strokeWidth === 'number' ? edge.style.strokeWidth : null;
  const inline = [stroke ? `stroke:${stroke}` : '', sw && sw > 0 && sw < 20 ? `stroke-width:${sw}` : ''].filter(Boolean).join(';');
  let out = `<path class="${cls}" d="${roundedPath(line)}"${inline ? ` style="${inline}"` : ''}/>${heads}`;
  if (edge.label) {
    const m = pathMidpoint(pts);
    out += `<text class="mm-edge-label" x="${r1(m.x)}" y="${r1(m.y)}" text-anchor="middle" dominant-baseline="central" font-size="12">${escapeHtml(edge.label.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))}</text>`;
  }
  return out;
}

export interface MermaidSvgResult {
  svg?: string;
  error?: string;
  warnings: MermaidIssue[];
}

/** Строит SVG для текста Mermaid (flowchart/graph). */
export function mermaidToSvg(code: string): MermaidSvgResult {
  const ir = parseMermaidSource(code);
  const issues = describeMermaidIssues(ir);
  if (issues.error) return { error: issues.error, warnings: ir.warnings };
  if (ir.nodes.length === 0) return { error: t('Диаграмма пустая'), warnings: ir.warnings };
  // в Mermaid направление по умолчанию — сверху вниз
  if (!ir.directionExplicit) ir.direction = 'TB';

  const layout = layoutMermaid(ir);
  const byId = new Map(layout.nodes.map(n => [n.node.id, n]));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number, w = 0, h = 0) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  };
  for (const n of layout.nodes) grow(n.x, n.y, n.width, n.height);
  for (const g of layout.groups) grow(g.x, g.y, g.width, g.height);

  const groupsSvg = layout.groups
    .map(g =>
      `<g class="mm-group-wrap"><rect class="mm-group" x="${r1(g.x)}" y="${r1(g.y)}" width="${r1(g.width)}" height="${r1(g.height)}" rx="8"/>` +
      `<text class="mm-group-title" x="${r1(g.x + 12)}" y="${r1(g.y + 16)}" font-size="12">${escapeHtml(g.title)}</text></g>`
    )
    .join('');

  let edgesSvg = '';
  for (const edge of ir.edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;
    let pts: Pt[] | undefined = layout.edgePoints.get(edge.id);
    if (!pts || pts.length < 2 || pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
      const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      pts = [clipToRect(bc, ac, a), clipToRect(ac, bc, b)];
    }
    // концы ребра — на контуре самой фигуры (dagre считает по прямоугольнику узла)
    if (pts.length >= 2) {
      pts = pts.slice();
      pts[0] = clipToShape(a, pts[1]);
      pts[pts.length - 1] = clipToShape(b, pts[pts.length - 2]);
    }
    for (const p of pts) grow(p.x - 20, p.y - 10, 40, 20);
    edgesSvg += edgeSvg(edge, pts);
  }

  const nodesSvg = layout.nodes.map(nodeSvg).join('');

  const m = 16;
  const vx = minX - m;
  const vy = minY - m;
  const vw = maxX - minX + m * 2;
  const vh = maxY - minY + m * 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="mm-svg" viewBox="${r1(vx)} ${r1(vy)} ${r1(vw)} ${r1(vh)}" ` +
    `width="${Math.ceil(vw)}" height="${Math.ceil(vh)}" role="img" font-family="inherit">` +
    groupsSvg + edgesSvg + nodesSvg + `</svg>`;
  return { svg, warnings: ir.warnings };
}

/** HTML-блок для Markdown: диаграмма + панель действий, либо сообщение об ошибке и исходник. */
export function renderMermaidBlock(code: string, index: number): string {
  const res = mermaidToSvg(code);
  if (!res.svg) {
    return (
      `<figure class="md-mermaid md-mermaid-failed">` +
      `<div class="md-mermaid-error">Mermaid: ${escapeHtml(res.error || t('не удалось построить диаграмму'))}</div>` +
      `<pre><code>${escapeHtml(code)}</code></pre></figure>`
    );
  }
  const warn = res.warnings.length
    ? `<div class="md-mermaid-warn">${res.warnings.slice(0, 5).map(w => escapeHtml(formatMermaidIssue(w))).join('<br>')}${res.warnings.length > 5 ? `<br>… ${t('и ещё')} ${res.warnings.length - 5}` : ''}</div>`
    : '';
  return (
    `<figure class="md-mermaid" data-mermaid-index="${index}">` +
    `<button type="button" class="md-mermaid-open" data-md-ui data-md-action="open-graph" data-md-index="${index}">${escapeHtml(t('Открыть как граф'))}</button>` +
    `<div class="md-mermaid-body" style="--mm-w:${Number(/ width="(\d+)"/.exec(res.svg)?.[1]) || 0}">${res.svg}</div>${warn}</figure>`
  );
}

// ---------------------------------------------------------------------------
// Стили (один источник для предпросмотра и для сохраняемого SVG)
// ---------------------------------------------------------------------------

export function mermaidSvgCss(theme: 'dark' | 'light'): string {
  const p = theme === 'dark'
    ? { fill: '#1e293b', stroke: '#64748b', text: '#e2e8f0', edge: '#94a3b8', halo: '#0f172a', group: 'rgba(148,163,184,0.08)', groupStroke: '#475569', groupTitle: '#94a3b8' }
    : { fill: '#f1f5f9', stroke: '#94a3b8', text: '#0f172a', edge: '#475569', halo: '#ffffff', group: 'rgba(100,116,139,0.06)', groupStroke: '#cbd5e1', groupTitle: '#475569' };
  return (
    `.mm-svg{max-width:100%;height:auto}` +
    `.mm-svg .mm-shape{fill:${p.fill};stroke:${p.stroke};stroke-width:1.5}` +
    `.mm-svg .mm-inner{fill:none}` +
    `.mm-svg .mm-rim{fill:none;stroke:${p.stroke};stroke-width:1.5}` +
    `.mm-svg .mm-label{fill:${p.text}}` +
    `.mm-svg .mm-edge{fill:none;stroke:${p.edge};stroke-width:2}` +
    `.mm-svg .mm-dotted{stroke-dasharray:5 5}` +
    `.mm-svg .mm-thick{stroke-width:3.5}` +
    `.mm-svg .mm-head{fill:${p.edge};stroke:none}` +
    `.mm-svg .mm-head-open{fill:${p.halo};stroke:${p.edge};stroke-width:1.5}` +
    `.mm-svg .mm-cross{fill:none;stroke:${p.edge};stroke-width:2}` +
    `.mm-svg .mm-edge-label{fill:${p.text};paint-order:stroke;stroke:${p.halo};stroke-width:4px;stroke-linejoin:round}` +
    `.mm-svg .mm-group{fill:${p.group};stroke:${p.groupStroke};stroke-dasharray:4 3}` +
    `.mm-svg .mm-group-title{fill:${p.groupTitle};font-weight:600}`
  );
}

/** Самодостаточный файл SVG: стили встроены, чтобы картинка выглядела так же вне приложения. */
export function svgToStandalone(svgMarkup: string, theme: 'dark' | 'light'): string {
  const withStyle = svgMarkup.replace(/<svg\b([^>]*)>/, (_m, attrs) => `<svg${attrs}><style>${mermaidSvgCss(theme)}</style>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${withStyle}`;
}
