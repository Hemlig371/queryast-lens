import { formatMermaidIssue, type MermaidIssue, type MermaidEdgeIR } from './mermaidParse';
import { parseDiagram, erEntityMetrics, erCommentShown, ER_HEADER_H, ER_ROW_H } from './erParse';
import { layoutMermaid, describeMermaidIssues, type MermaidLayoutNode } from './mermaidToGraph';
import { escapeHtml } from './markdown';
import { t } from './i18n';
import { edgeGeometry, labelBeside, EDGE_LABEL_CHAR_W, type HeadShape, type Pt, type RoutedEdge } from './edgePath';

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

/** Сущность ER-диаграммы: таблица «заголовок + строки атрибутов» (тип | имя | ключи | комментарий). */
function entitySvg(ln: MermaidLayoutNode): string {
  const { node, x, y, width: w, height: h } = ln;
  const attrs = node.er?.attributes || [];
  const m = erEntityMetrics(node.label || node.id, attrs);
  let out =
    `<g class="mm-node mm-entity" data-id="${escapeHtml(node.id)}">` +
    `<rect class="mm-shape" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="6"/>` +
    `<rect class="mm-ent-head" x="${r1(x + 0.75)}" y="${r1(y + 0.75)}" width="${r1(w - 1.5)}" height="${ER_HEADER_H - 1.5}" rx="5.5"/>` +
    `<rect class="mm-ent-head" x="${r1(x + 0.75)}" y="${r1(y + ER_HEADER_H - 7)}" width="${r1(w - 1.5)}" height="6"/>` +
    `<text class="mm-label mm-ent-title" text-anchor="middle" dominant-baseline="central" font-size="13" x="${r1(x + w / 2)}" y="${r1(y + ER_HEADER_H / 2)}">${escapeHtml(node.label || node.id)}</text>`;
  if (attrs.length > 0) {
    out += `<line class="mm-ent-sep" x1="${r1(x)}" y1="${r1(y + ER_HEADER_H)}" x2="${r1(x + w)}" y2="${r1(y + ER_HEADER_H)}"/>`;
  }
  attrs.forEach((a, i) => {
    const top = y + ER_HEADER_H + i * ER_ROW_H;
    const cy = top + ER_ROW_H / 2;
    const text = (cls: string, col: number, value: string, extra = '') =>
      value ? `<text class="${cls}" x="${r1(x + m.colX[col])}" y="${r1(cy)}" dominant-baseline="central" font-size="12"${extra}>${escapeHtml(value)}</text>` : '';
    if (i % 2 === 1) out += `<rect class="mm-ent-alt" x="${r1(x + 1)}" y="${r1(top)}" width="${r1(w - 2)}" height="${ER_ROW_H}"/>`;
    const keyCls = a.keys.includes('PK') ? 'mm-ent-pk' : a.keys.includes('FK') ? 'mm-ent-fk' : 'mm-ent-uk';
    out +=
      text('mm-ent-type', 0, a.type) +
      text('mm-ent-name', 1, a.name) +
      text(`mm-ent-key ${keyCls}`, 2, a.keys.join(', ')) +
      (a.comment ? `<text class="mm-ent-muted" x="${r1(x + m.colX[3])}" y="${r1(cy)}" dominant-baseline="central" font-size="12">${escapeHtml(erCommentShown(a.comment))}<title>${escapeHtml(a.comment)}</title></text>` : '');
  });
  return out + `</g>`;
}

function nodeSvg(ln: MermaidLayoutNode): string {
  if (ln.node.shape === 'entity') return entitySvg(ln);
  const { node, x, y, width: w, height: h } = ln;
  const style = nodeInlineStyle(node.style);
  const textColor = safeColor(node.style?.color);
  const inner = node.shape === 'circle' || node.shape === 'double_circle' ? 0.6 : node.shape === 'rhombus' ? 0.7 : node.shape === 'hexagon' ? 0.8 : 0.9;
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


function headToSvg(h: HeadShape): string {
  const pt = (p: Pt) => `${r1(p.x)} ${r1(p.y)}`;
  let out = '';
  if (h.polygon) out += `<polygon class="mm-head" points="${h.polygon.map(p => `${r1(p.x)},${r1(p.y)}`).join(' ')}"/>`;
  if (h.lines) out += `<path class="mm-er" d="${h.lines.map(([a, b]) => `M${pt(a)}L${pt(b)}`).join('')}"/>`;
  if (h.circle) out += `<circle class="mm-head mm-head-open" cx="${r1(h.circle.c.x)}" cy="${r1(h.circle.c.y)}" r="${h.circle.r}"/>`;
  if (h.cross) {
    const [p, q, u, v] = h.cross;
    out += `<path class="mm-cross" d="M${pt(p)}L${pt(q)}M${pt(u)}L${pt(v)}"/>`;
  }
  return out;
}

function edgeSvg(edge: MermaidEdgeIR, route: RoutedEdge): { svg: string; sample: Pt[] } {
  if (edge.lineType === 'invisible') return { svg: '', sample: [] };
  const geo = edgeGeometry(
    { start: route.start, end: route.end, startDir: route.outDir, endDir: { x: -route.inDir.x, y: -route.inDir.y }, inner: route.inner },
    edge.headStart,
    edge.headEnd
  );
  const heads = (geo.endHead ? headToSvg(geo.endHead) : '') + (geo.startHead ? headToSvg(geo.startHead) : '');
  const cls = `mm-edge${edge.lineType === 'dotted' ? ' mm-dotted' : edge.lineType === 'thick' ? ' mm-thick' : ''}`;
  const stroke = safeColor(edge.style?.stroke);
  const sw = typeof edge.style?.strokeWidth === 'number' ? edge.style.strokeWidth : null;
  const inline = [stroke ? `stroke:${stroke}` : '', sw && sw > 0 && sw < 20 ? `stroke-width:${sw}` : ''].filter(Boolean).join(';');
  let out = `<path class="${cls}" d="${geo.d}"${inline ? ` style="${inline}"` : ''}/>${heads}`;
  const sample = geo.sample.slice();
  if (edge.label) {
    const text = edge.label.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '');
    const m = route.label ?? labelBeside([route.start, ...route.inner, route.end]);
    out += `<text class="mm-edge-label" x="${r1(m.x)}" y="${r1(m.y)}" text-anchor="${m.anchor}" dominant-baseline="central" font-size="12">${escapeHtml(text)}</text>`;
    const w = text.length * EDGE_LABEL_CHAR_W;
    sample.push({ x: m.anchor === 'middle' ? m.x - w / 2 : m.anchor === 'start' ? m.x : m.x - w, y: m.y }, { x: m.anchor === 'middle' ? m.x + w / 2 : m.anchor === 'start' ? m.x + w : m.x, y: m.y });
  }
  return { svg: out, sample };
}

export interface MermaidSvgResult {
  svg?: string;
  error?: string;
  warnings: MermaidIssue[];
}

/** Строит SVG для текста Mermaid (flowchart/graph). */
export function mermaidToSvg(code: string): MermaidSvgResult {
  const ir = parseDiagram(code);
  const issues = describeMermaidIssues(ir);
  if (issues.error) return { error: issues.error, warnings: ir.warnings };
  if (ir.nodes.length === 0) return { error: t('Диаграмма пустая'), warnings: ir.warnings };
  // в Mermaid направление по умолчанию — сверху вниз
  if (!ir.directionExplicit) ir.direction = 'TB';

  const layout = layoutMermaid(ir);
  
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
    const route = layout.edgeRoutes.get(edge.id);
    if (!route) continue;
    const res = edgeSvg(edge, route);
    for (const p of res.sample) grow(p.x - 20, p.y - 10, 40, 20);
    edgesSvg += res.svg;
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
    ? { fill: '#1e293b', stroke: '#64748b', text: '#e2e8f0', edge: '#94a3b8', halo: '#0f172a', group: 'rgba(148,163,184,0.08)', groupStroke: '#475569', groupTitle: '#94a3b8', entHead: '#334155', entAlt: 'rgba(255,255,255,0.035)', muted: '#94a3b8', pk: '#fbbf24', fk: '#60a5fa', uk: '#c4b5fd' }
    : { fill: '#f1f5f9', stroke: '#94a3b8', text: '#0f172a', edge: '#475569', halo: '#ffffff', group: 'rgba(100,116,139,0.06)', groupStroke: '#cbd5e1', groupTitle: '#475569', entHead: '#e2e8f0', entAlt: 'rgba(15,23,42,0.035)', muted: '#64748b', pk: '#b45309', fk: '#1d4ed8', uk: '#6d28d9' };
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
    `.mm-svg .mm-er{fill:none;stroke:${p.edge};stroke-width:1.8;stroke-linecap:round}` +
    `.mm-svg .mm-ent-head{fill:${p.entHead};stroke:none}` +
    `.mm-svg .mm-ent-sep{stroke:${p.stroke};stroke-width:1.2}` +
    `.mm-svg .mm-ent-alt{fill:${p.entAlt}}` +
    `.mm-svg .mm-ent-title{font-weight:700}` +
    `.mm-svg .mm-ent-name{fill:${p.text}}` +
    `.mm-svg .mm-ent-type,.mm-svg .mm-ent-muted{fill:${p.muted}}` +
    `.mm-svg .mm-ent-muted{font-style:italic}` +
    `.mm-svg .mm-ent-key{font-weight:700;font-size:11px}` +
    `.mm-svg .mm-ent-pk{fill:${p.pk}}.mm-svg .mm-ent-fk{fill:${p.fk}}.mm-svg .mm-ent-uk{fill:${p.uk}}` +
    `.mm-svg .mm-group{fill:${p.group};stroke:${p.groupStroke};stroke-dasharray:4 3}` +
    `.mm-svg .mm-group-title{fill:${p.groupTitle};font-weight:600}`
  );
}

/** Самодостаточный файл SVG: стили встроены, чтобы картинка выглядела так же вне приложения. */
export function svgToStandalone(svgMarkup: string, theme: 'dark' | 'light'): string {
  const withStyle = svgMarkup.replace(/<svg\b([^>]*)>/, (_m, attrs) => `<svg${attrs}><style>${mermaidSvgCss(theme)}</style>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${withStyle}`;
}
