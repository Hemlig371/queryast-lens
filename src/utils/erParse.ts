import {
  parseMermaidSource,
  type ErAttribute,
  type ErHead,
  type MermaidEdgeIR,
  type MermaidIR,
  type MermaidNodeIR,
} from './mermaidParse';
import { t } from './i18n';

/**
 * Разбор Mermaid `erDiagram` в ту же промежуточную модель (IR), что и flowchart: сущность — узел формы `entity`
 * с атрибутами, связь — ребро с наконечниками «воронья лапка». Поэтому раскладка (dagre), порты рёбер,
 * статичный SVG и интерактивный граф работают для ER теми же функциями.
 *
 * Поддерживается: сущности с атрибутами (`тип имя PK, FK, UK "комментарий"`), связи `||--o{` (сплошные `--`
 * и пунктирные `..`) с подписью, имена в кавычках, алиасы `p[Person]`, `direction`, комментарии `%%`, фронтматтер.
 * Не поддерживается: текстовые обозначения мощности (`one or more to ...`), `classDef`/`style` (пропускаются молча).
 */

const ENT = String.raw`("[^"]+"|[\p{L}\p{N}_][\p{L}\p{N}_\-]*)(?:\[("[^"]*"|[^\]]*)\])?`;
const RE_REL = new RegExp(String.raw`^${ENT}\s+([|}][|o](?:--|\.\.)[|o][|{])\s+${ENT}\s*(?::\s*(.*?))?\s*$`, 'u');
const RE_BLOCK_OPEN = new RegExp(String.raw`^${ENT}\s*\{\s*(.*?)\s*(\})?\s*$`, 'u');
const RE_DECL = new RegExp(String.raw`^${ENT}$`, 'u');
const RE_ATTR = /^(\S+)\s+(\S+)((?:\s+(?:PK|FK|UK)\b,?)*)(?:\s+"([^"]*)")?\s*$/i;
const RE_IGNORED = /^(style|classDef|class|title|accTitle|accDescr)\b/i;

const CARD_LEFT: Record<string, ErHead> = { '||': 'er-one', '|o': 'er-zero-one', '}o': 'er-zero-many', '}|': 'er-one-many' };
const CARD_RIGHT: Record<string, ErHead> = { '||': 'er-one', 'o|': 'er-zero-one', 'o{': 'er-zero-many', '|{': 'er-one-many' };

function stripComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === '%' && line[i + 1] === '%') return line.substring(0, i);
  }
  return line;
}

const unquote = (s: string | undefined): string => (s ?? '').trim().replace(/^"(.*)"$/, '$1');

/** Номер первой значимой строки (после фронтматтера) или -1. */
function firstSignificantLine(lines: string[]): number {
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trim() === '---') {
    i++;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++;
  }
  for (; i < lines.length; i++) if (stripComment(lines[i]).trim()) return i;
  return -1;
}

/** Первая значимая строка текста — `erDiagram`. */
export function isErDiagram(text: string): boolean {
  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n');
  const i = firstSignificantLine(lines);
  return i >= 0 && /^erDiagram\b/i.test(stripComment(lines[i]).trim());
}

/** Единая точка входа: erDiagram или flowchart/graph. */
export function parseDiagram(text: string, preferredDirection?: 'TB' | 'LR'): MermaidIR {
  return isErDiagram(text) ? parseErSource(text, preferredDirection) : parseMermaidSource(text, preferredDirection);
}

export function parseErSource(text: string, preferredDirection?: 'TB' | 'LR'): MermaidIR {
  const ir: MermaidIR = {
    direction: preferredDirection || 'TB',
    directionExplicit: false,
    hasHeader: true,
    nodes: [],
    edges: [],
    subgraphs: [],
    warnings: [],
  };
  const entities = new Map<string, MermaidNodeIR>();
  const warn = (line: number, message: string, src: string) =>
    ir.warnings.push({ line, message, text: src.length > 80 ? src.slice(0, 80) + '…' : src });

  const entity = (rawName: string, rawAlias?: string): MermaidNodeIR => {
    const id = unquote(rawName);
    let node = entities.get(id);
    if (!node) {
      node = { id, label: id, shape: 'entity', classes: [], er: { attributes: [] } };
      entities.set(id, node);
      ir.nodes.push(node);
    }
    const alias = unquote(rawAlias);
    if (alias) node.label = alias;
    return node;
  };

  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n');
  const head = firstSignificantLine(lines);
  let edgeCounter = 0;
  let current: MermaidNodeIR | null = null;

  for (let i = head + 1; i < lines.length && head >= 0; i++) {
    const raw = stripComment(lines[i]).trim();
    if (!raw) continue;
    const lineNo = i + 1;

    if (current) {
      if (raw === '}') {
        current = null;
        continue;
      }
      const m = RE_ATTR.exec(raw);
      if (!m) {
        warn(lineNo, t('Mermaid: пропущено') + `: ${raw}`, raw);
        continue;
      }
      const keys = (m[3].match(/PK|FK|UK/gi) || []).map(k => k.toUpperCase() as 'PK' | 'FK' | 'UK');
      const attr: ErAttribute = { type: m[1], name: m[2], keys };
      if (m[4]) attr.comment = m[4];
      current.er!.attributes.push(attr);
      continue;
    }

    const dir = /^direction\s+(TB|TD|BT|LR|RL)\s*$/i.exec(raw);
    if (dir) {
      const d = dir[1].toUpperCase();
      ir.direction = (d === 'TD' ? 'TB' : d) as MermaidIR['direction'];
      ir.directionExplicit = true;
      continue;
    }
    if (RE_IGNORED.test(raw)) continue;

    const rel = RE_REL.exec(raw);
    if (rel) {
      const token = rel[3];
      const left = CARD_LEFT[token.slice(0, 2)];
      const right = CARD_RIGHT[token.slice(4, 6)];
      const a = entity(rel[1], rel[2]);
      const b = entity(rel[4], rel[5]);
      if (!left || !right) {
        warn(lineNo, t('Mermaid: пропущено') + `: ${raw}`, raw);
        continue;
      }
      const edge: MermaidEdgeIR = {
        id: `e_${a.id}_${b.id}_${++edgeCounter}`,
        index: edgeCounter - 1,
        source: a.id,
        target: b.id,
        label: unquote(rel[6]) || undefined,
        lineType: token.slice(2, 4) === '..' ? 'dotted' : 'solid',
        headStart: left,
        headEnd: right,
      };
      ir.edges.push(edge);
      continue;
    }

    const open = RE_BLOCK_OPEN.exec(raw);
    if (open) {
      const node = entity(open[1], open[2]);
      const inline = open[3];
      if (inline) {
        // `A { string x PK }` в одну строку
        const m = RE_ATTR.exec(inline);
        if (m) node.er!.attributes.push({ type: m[1], name: m[2], keys: (m[3].match(/PK|FK|UK/gi) || []).map(k => k.toUpperCase() as 'PK' | 'FK' | 'UK'), ...(m[4] ? { comment: m[4] } : {}) });
      }
      if (!open[4]) current = node; // не закрыт на этой же строке
      continue;
    }

    const decl = RE_DECL.exec(raw);
    if (decl) {
      entity(decl[1], decl[2]);
      continue;
    }

    warn(lineNo, t('Mermaid: пропущено') + `: ${raw}`, raw);
  }

  if (head < 0 || ir.nodes.length === 0) {
    ir.fatal = { line: 0, message: t('Диаграмма пустая'), text: '' };
  }
  return ir;
}

// ---------------------------------------------------------------------------
// Размеры узла-таблицы (общие для раскладки, SVG и компонента React Flow)
// ---------------------------------------------------------------------------

export const ER_HEADER_H = 32;
export const ER_ROW_H = 22;
export const ER_PAD_X = 12;
export const ER_GAP = 14;
const ER_CHAR_W = 7;
const ER_COMMENT_MAX = 28;

/** Комментарий к атрибуту, как он показывается в таблице (длинный обрезается, полный — во всплывающей подсказке). */
export function erCommentShown(comment: string | undefined): string {
  if (!comment) return '';
  return comment.length > ER_COMMENT_MAX ? comment.slice(0, ER_COMMENT_MAX - 1) + '…' : comment;
}

export interface ErMetrics {
  width: number;
  height: number;
  /** ширины колонок: тип | имя | ключи | комментарий (0 — колонки нет) */
  cols: [number, number, number, number];
  /** левые края колонок относительно левого края узла */
  colX: [number, number, number, number];
}

export function erEntityMetrics(label: string, attributes: ErAttribute[]): ErMetrics {
  const maxLen = (f: (a: ErAttribute) => string) => attributes.reduce((n, a) => Math.max(n, f(a).length), 0);
  const w = (chars: number) => Math.ceil(chars * ER_CHAR_W);
  const cols: ErMetrics['cols'] = [
    w(maxLen(a => a.type)),
    w(maxLen(a => a.name)),
    w(maxLen(a => a.keys.join(', '))),
    w(maxLen(a => erCommentShown(a.comment))),
  ];
  const used = cols.filter(c => c > 0).length;
  const natural = ER_PAD_X * 2 + cols.reduce((s, c) => s + c, 0) + Math.max(0, used - 1) * ER_GAP;
  const headerW = Math.ceil(label.length * 8.4) + 28;
  const width = Math.max(150, headerW, natural);
  // свободное место отдаём колонке имени
  const extra = width - natural;
  if (attributes.length > 0 && extra > 0) cols[1] += extra;
  const colX: ErMetrics['colX'] = [0, 0, 0, 0];
  let x = ER_PAD_X;
  cols.forEach((c, k) => {
    colX[k] = x;
    if (c > 0) x += c + ER_GAP;
  });
  const height = ER_HEADER_H + attributes.length * ER_ROW_H + (attributes.length > 0 ? 6 : 0);
  return { width, height, cols, colX };
}
