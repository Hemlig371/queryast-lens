import { t } from './i18n';

/**
 * Разбор Mermaid flowchart/graph в промежуточную модель (IR).
 * Модуль чистый: без dagre и React Flow. Раскладка и конвертация в узлы React Flow —
 * в mermaidToGraph.ts, статичный SVG для Markdown — в utils/mermaidSvg.ts.
 *
 * Разбор — токенизатор по символам (а не набор регулярок по строке):
 *  комментарии `%%`, разделитель `;`, кавычки `"..."`, `&`, юникодные id, все виды стрелок,
 *  метки `-->|text|` и `-- text -->`, фигуры узлов и `@{ shape: ... }`.
 * Непонятное выражение целиком пропускается и попадает в `warnings` с номером строки.
 */

export type MermaidHead = 'arrow' | 'circle' | 'cross' | 'none';
export type MermaidLineType = 'solid' | 'dotted' | 'thick' | 'invisible';

export interface MermaidIssue {
  line: number;
  message: string;
  text: string;
}

export interface MermaidNodeIR {
  id: string;
  label: string;
  shape: string;
  /** id самого внутреннего подграфа, в котором узел встретился первым */
  subgraph?: string;
  classes: string[];
  /** стиль из `style id ...` */
  inlineStyle?: Record<string, any>;
  /** итоговый стиль: classDef (по порядку классов) + inlineStyle */
  style?: Record<string, any>;
}

export interface MermaidEdgeIR {
  id: string;
  index: number;
  source: string;
  target: string;
  label?: string;
  lineType: MermaidLineType;
  headStart: MermaidHead;
  headEnd: MermaidHead;
  style?: Record<string, any>;
}

export interface MermaidSubgraphIR {
  id: string;
  title: string;
  parent?: string;
  /** узлы, объявленные прямо в этом подграфе (без вложенных) */
  nodeIds: string[];
}

export interface MermaidIR {
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  /** направление задано в заголовке (flowchart LR) — иначе Mermaid использует TB */
  directionExplicit: boolean;
  hasHeader: boolean;
  nodes: MermaidNodeIR[];
  edges: MermaidEdgeIR[];
  subgraphs: MermaidSubgraphIR[];
  warnings: MermaidIssue[];
  /** фатальная ошибка (неподдерживаемый тип диаграммы) */
  fatal?: MermaidIssue;
}

class MermaidSyntaxError extends Error {}

const UNSUPPORTED_DIAGRAMS =
  /^(sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|xychart(?:-beta)?|block(?:-beta)?|sankey(?:-beta)?|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|architecture(?:-beta)?|packet(?:-beta)?|kanban|radar(?:-beta)?)\b/i;

const ID_CHAR = /[\p{L}\p{N}_]/u;
const LINK_TOKENS = /-->|---|==|-\.|~~~|&/;

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/** Делит строку стилей по `,` и `;` вне скобок: `fill:rgb(1,2,3),stroke:#333` -> 2 части. */
function splitStyleParts(styleStr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of styleStr) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** Разбирает `fill:#f9f,stroke:#333,stroke-width:4px` в CSS-свойства узла. */
export function parseStyleProperties(styleStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  if (!styleStr) return result;
  for (const part of splitStyleParts(styleStr)) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const key = part.substring(0, colonIdx).trim().toLowerCase();
    const val = part.substring(colonIdx + 1).trim();
    if (!key || !val) continue;
    if (key === 'fill' || key === 'background' || key === 'background-color') result.backgroundColor = val;
    else if (key === 'stroke' || key === 'border-color') result.borderColor = val;
    else if (key === 'stroke-width' || key === 'border-width') result.borderWidth = val;
    else if (key === 'stroke-dasharray') result.borderStyle = 'dashed';
    else if (key === 'color') result.color = val;
    else if (key === 'font-size') result.fontSize = val;
    else if (key === 'font-weight') result.fontWeight = val;
    else result[key.replace(/-([a-z])/g, (_g, c) => c.toUpperCase())] = val;
  }
  return result;
}

/** Стиль для `linkStyle`: stroke / stroke-width / stroke-dasharray -> SVG-свойства ребра. */
function parseEdgeStyleProperties(styleStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  for (const part of splitStyleParts(styleStr)) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const key = part.substring(0, colonIdx).trim().toLowerCase();
    const val = part.substring(colonIdx + 1).trim();
    if (!key || !val) continue;
    if (key === 'stroke') result.stroke = val;
    else if (key === 'stroke-width') result.strokeWidth = parseFloat(val) || val;
    else if (key === 'stroke-dasharray') result.strokeDasharray = val.replace(/\s+/g, ' ');
  }
  return result;
}

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' };

/** Убирает кавычки, markdown-обёртку "`...`", раскодирует #quot; и #59; (как Mermaid). */
function cleanLabel(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();
  if (str.length >= 2 && str.startsWith('"') && str.endsWith('"')) {
    str = str.substring(1, str.length - 1).trim();
    if (str.length >= 2 && str.startsWith('`') && str.endsWith('`')) str = str.substring(1, str.length - 1);
  }
  return str.replace(/#(?:([a-z]+)|(\d+));/gi, (m, name, num) => {
    if (name && ENTITIES[name.toLowerCase()] !== undefined) return ENTITIES[name.toLowerCase()];
    if (num) {
      const code = parseInt(num, 10);
      if (code > 0 && code < 0x110000) return String.fromCodePoint(code);
    }
    return m;
  });
}

/** Удаляет `%%` комментарий до конца строки (кроме `%%` внутри кавычек). */
function stripComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === '%' && line[i + 1] === '%') return line.substring(0, i);
  }
  return line;
}

/** Делит строку на выражения по `;` вне кавычек. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === ';') {
      out.push(line.substring(start, i));
      start = i + 1;
    }
  }
  out.push(line.substring(start));
  return out.map(s => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Разбор цепочки узлов и связей: A & B --> C -- text --> D
// ---------------------------------------------------------------------------

interface ParsedNode {
  id: string;
  label: string;
  shape: string;
  explicit: boolean;
  className?: string;
}

interface ParsedLink {
  lineType: MermaidLineType;
  headStart: MermaidHead;
  headEnd: MermaidHead;
  label?: string;
}

interface ParsedChain {
  groups: ParsedNode[][];
  links: ParsedLink[];
}

// [открывающая, закрывающие варианты -> фигура]
const SHAPE_OPENERS: Array<{ open: string; closers: Array<[string, string]> }> = [
  { open: '(((', closers: [[')))', 'double_circle']] },
  { open: '((', closers: [['))', 'circle']] },
  { open: '([', closers: [['])', 'stadium']] },
  { open: '[(', closers: [[')]', 'cylinder']] },
  { open: '[[', closers: [[']]', 'subroutine']] },
  { open: '{{', closers: [['}}', 'hexagon']] },
  { open: '[/', closers: [['/]', 'parallelogram'], ['\\]', 'trapezoid']] },
  { open: '[\\', closers: [['\\]', 'parallelogram_alt'], ['/]', 'trapezoid_alt']] },
  { open: '(', closers: [[')', 'rounded']] },
  { open: '[', closers: [[']', 'rectangle']] },
  { open: '{', closers: [['}', 'rhombus']] },
  { open: '>', closers: [[']', 'asymmetric']] },
];

// значения `@{ shape: ... }`
const NEW_SYNTAX_SHAPES: Record<string, string> = {
  rect: 'rectangle', rectangle: 'rectangle', proc: 'rectangle', process: 'rectangle',
  rounded: 'rounded', event: 'rounded',
  stadium: 'stadium', terminal: 'stadium', pill: 'stadium',
  circle: 'circle', circ: 'circle', 'sm-circ': 'circle', 'small-circle': 'circle', start: 'circle',
  'dbl-circ': 'double_circle', 'double-circle': 'double_circle', 'fr-circ': 'double_circle', stop: 'double_circle',
  diamond: 'rhombus', decision: 'rhombus', question: 'rhombus',
  hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon',
  cyl: 'cylinder', cylinder: 'cylinder', 'db': 'cylinder', database: 'cylinder', 'h-cyl': 'cylinder',
  subproc: 'subroutine', subprocess: 'subroutine', 'fr-rect': 'subroutine', 'framed-rectangle': 'subroutine',
  'lean-r': 'parallelogram', 'lean-right': 'parallelogram', 'in-out': 'parallelogram',
  'lean-l': 'parallelogram_alt', 'lean-left': 'parallelogram_alt', 'out-in': 'parallelogram_alt',
  'trap-b': 'trapezoid', 'priority': 'trapezoid', 'trap-t': 'trapezoid_alt', 'manual': 'trapezoid_alt',
  odd: 'asymmetric',
};

class Scanner {
  i = 0;
  s: string;
  constructor(s: string) { this.s = s; }
  get eof() { return this.i >= this.s.length; }
  skipWs() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  rest() { return this.s.substring(this.i); }
  startsWith(x: string) { return this.s.startsWith(x, this.i); }
}

/** Ищет закрывающую последовательность вне кавычек. Возвращает индекс или -1. */
function findCloser(s: string, from: number, closer: string): number {
  let inQuote = false;
  for (let j = from; j < s.length; j++) {
    if (s[j] === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && s.startsWith(closer, j)) return j;
  }
  return -1;
}

function parseNodeIdAt(sc: Scanner): string | null {
  const s = sc.s;
  let j = sc.i;
  while (j < s.length) {
    const ch = s[j];
    if (ID_CHAR.test(ch)) { j++; continue; }
    // дефис/точка внутри id допустимы, только если дальше снова символ id (иначе это начало стрелки)
    if ((ch === '-' || ch === '.') && j > sc.i && j + 1 < s.length && ID_CHAR.test(s[j + 1])) { j++; continue; }
    break;
  }
  if (j === sc.i) return null;
  const id = s.substring(sc.i, j);
  sc.i = j;
  return id;
}

function parseNewSyntaxBlock(body: string, id: string): { shape: string; label: string } {
  let shape = 'rectangle';
  let label = id;
  // key: value, ... (value может быть в кавычках и содержать запятые)
  const re = /([A-Za-z][\w-]*)\s*:\s*("(?:[^"]*)"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'shape') shape = NEW_SYNTAX_SHAPES[val.replace(/^"|"$/g, '').toLowerCase()] || 'rectangle';
    else if (key === 'label') label = cleanLabel(val);
  }
  return { shape, label };
}

function parseNode(sc: Scanner): ParsedNode {
  const id = parseNodeIdAt(sc);
  if (!id) {
    const near = sc.rest().slice(0, 20);
    throw new MermaidSyntaxError(t('ожидался идентификатор узла') + ` «${near}»`);
  }
  const node: ParsedNode = { id, label: id, shape: 'rectangle', explicit: false };
  const s = sc.s;

  // пробелы перед скобкой допускаем только для [ ( {
  let probe = sc.i;
  while (probe < s.length && (s[probe] === ' ' || s[probe] === '\t')) probe++;
  const afterWs = s[probe];
  const atOpenerPos = probe === sc.i ? true : afterWs === '[' || afterWs === '(' || afterWs === '{';

  if (atOpenerPos) {
    const from = probe;
    if (s.startsWith('@{', from)) {
      const end = findCloser(s, from + 2, '}');
      if (end === -1) throw new MermaidSyntaxError(t('не закрыта скобка') + ' «@{»');
      const { shape, label } = parseNewSyntaxBlock(s.substring(from + 2, end), id);
      node.shape = shape;
      node.label = label;
      node.explicit = true;
      sc.i = end + 1;
    } else {
      for (const cand of SHAPE_OPENERS) {
        if (!s.startsWith(cand.open, from)) continue;
        // из возможных закрывающих (`/]` и `\]` у `[/`) выбираем ближайшую, а не первую в списке
        let best: { end: number; closer: string; shape: string } | null = null;
        for (const [closer, shape] of cand.closers) {
          const end = findCloser(s, from + cand.open.length, closer);
          if (end !== -1 && (!best || end < best.end)) best = { end, closer, shape };
        }
        if (best) {
          node.shape = best.shape;
          node.label = cleanLabel(s.substring(from + cand.open.length, best.end));
          node.explicit = true;
          sc.i = best.end + best.closer.length;
          break;
        }
        // кандидат не закрылся — пробуем более короткий открыватель (например, `[/path]` как обычный `[`)
      }
      if (!node.explicit && /[\[({]/.test(s[from] || '')) {
        throw new MermaidSyntaxError(t('не закрыта скобка или кавычка') + ` «${s.substring(from, from + 20)}»`);
      }
    }
  }

  // :::className
  const cls = /^:::([\p{L}\p{N}_-]+)/u.exec(sc.rest());
  if (cls) {
    node.className = cls[1];
    sc.i += cls[0].length;
  }
  return node;
}

function parseNodeGroup(sc: Scanner): ParsedNode[] {
  const group: ParsedNode[] = [parseNode(sc)];
  for (;;) {
    const save = sc.i;
    sc.skipWs();
    if (sc.s[sc.i] === '&') {
      sc.i++;
      sc.skipWs();
      group.push(parseNode(sc));
    } else {
      sc.i = save;
      break;
    }
  }
  return group;
}

const HEAD_FROM_CHAR: Record<string, MermaidHead> = { '>': 'arrow', o: 'circle', x: 'cross' };

function readPipeLabel(sc: Scanner): string | undefined {
  const save = sc.i;
  sc.skipWs();
  if (sc.s[sc.i] !== '|') { sc.i = save; return undefined; }
  const end = findCloser(sc.s, sc.i + 1, '|');
  if (end === -1) throw new MermaidSyntaxError(t('не закрыта метка ребра') + ' «|»');
  const label = cleanLabel(sc.s.substring(sc.i + 1, end));
  sc.i = end + 1;
  return label || undefined;
}

function parseLink(sc: Scanner): ParsedLink {
  sc.skipWs();
  const rest = sc.rest();
  const m = /^([<ox])?(-{2,}|={2,}|-\.+|~{3,})/.exec(rest);
  if (!m) {
    throw new MermaidSyntaxError(t('ожидалась стрелка (-->, ---, -.->, ==>) вместо') + ` «${rest.slice(0, 20)}»`);
  }
  const link: ParsedLink = {
    lineType: 'solid',
    headStart: m[1] === '<' ? 'arrow' : m[1] ? HEAD_FROM_CHAR[m[1]] : 'none',
    headEnd: 'none',
  };
  // `o`/`x` как стартовый маркер имеет смысл только вместе с безголовой линией слева; допускаем как в Mermaid
  const op = m[2];
  sc.i += m[0].length;
  const s = sc.s;

  const readHead = (): MermaidHead => {
    const ch = s[sc.i];
    if (ch === '>' || ch === 'o' || ch === 'x') {
      // `o`/`x` считаем головой, только если дальше не продолжается идентификатор в том же слове при пробеле перед ним — как в Mermaid, без пробела это голова
      sc.i++;
      return HEAD_FROM_CHAR[ch];
    }
    return 'none';
  };

  if (op[0] === '~') {
    link.lineType = 'invisible';
    link.label = readPipeLabel(sc);
    return link;
  }

  if (op[0] === '-' && op[1] === '.') {
    link.lineType = 'dotted';
    if (s[sc.i] === '-') {
      sc.i++;
      link.headEnd = readHead();
    } else if (/\s/.test(s[sc.i] || '')) {
      const tail = /\.+-[>ox]?/.exec(s.substring(sc.i));
      if (!tail) throw new MermaidSyntaxError(t('не закрыта пунктирная стрелка с текстом') + ' «-. text .->»');
      link.label = cleanLabel(s.substring(sc.i, sc.i + tail.index)) || undefined;
      sc.i += tail.index + tail[0].length;
      link.headEnd = HEAD_FROM_CHAR[tail[0][tail[0].length - 1]] || 'none';
    } else {
      throw new MermaidSyntaxError(t('неверная пунктирная стрелка'));
    }
    link.label = readPipeLabel(sc) ?? link.label;
    return link;
  }

  const ch = op[0]; // '-' или '='
  link.lineType = ch === '=' ? 'thick' : 'solid';
  const head = readHead();
  if (head !== 'none') {
    link.headEnd = head;
  } else if (op.length === 2) {
    // `-- text -->` / `== text ==>`
    const closeRe = ch === '=' ? /={2,}[>ox]?/g : /-{2,}[>ox]?/g;
    const body = s.substring(sc.i);
    let found: RegExpExecArray | null = null;
    let c: RegExpExecArray | null;
    while ((c = closeRe.exec(body)) !== null) {
      if (c[0].length >= 3 || /[>ox]$/.test(c[0])) { found = c; break; }
    }
    if (!found) throw new MermaidSyntaxError(t('не закрыта стрелка с текстом') + ` «${ch}${ch} text ${ch}${ch}>»`);
    link.label = cleanLabel(body.substring(0, found.index)) || undefined;
    sc.i += found.index + found[0].length;
    const last = found[0][found[0].length - 1];
    link.headEnd = HEAD_FROM_CHAR[last] || 'none';
  }
  // иначе: `---` — линия без стрелки
  link.label = readPipeLabel(sc) ?? link.label;
  return link;
}

function parseChain(stmt: string): ParsedChain {
  const sc = new Scanner(stmt);
  sc.skipWs();
  const groups: ParsedNode[][] = [parseNodeGroup(sc)];
  const links: ParsedLink[] = [];
  for (;;) {
    sc.skipWs();
    if (sc.eof) break;
    links.push(parseLink(sc));
    sc.skipWs();
    if (sc.eof) throw new MermaidSyntaxError(t('после стрелки нет узла'));
    groups.push(parseNodeGroup(sc));
  }
  return { groups, links };
}

// ---------------------------------------------------------------------------
// Основной разбор
// ---------------------------------------------------------------------------

export function parseMermaidSource(
  mermaidText: string,
  preferredDirection?: 'TB' | 'LR'
): MermaidIR {
  const ir: MermaidIR = {
    direction: preferredDirection || 'LR',
    directionExplicit: false,
    hasHeader: false,
    nodes: [],
    edges: [],
    subgraphs: [],
    warnings: [],
  };
  if (!mermaidText || !mermaidText.trim()) return ir;

  const nodeMap = new Map<string, MermaidNodeIR>();
  const classDefs = new Map<string, Record<string, any>>();
  const linkStyles: Array<{ indexes: number[] | 'default'; style: Record<string, any> }> = [];
  const subStack: MermaidSubgraphIR[] = [];
  let edgeCounter = 0;
  let skipUntilBrace = false;
  let seenStatement = false;

  const lines = mermaidText.replace(/\r\n?/g, '\n').split('\n');

  // YAML frontmatter (--- ... ---) в начале текста пропускаем целиком
  let firstLine = 0;
  {
    let k = 0;
    while (k < lines.length && !lines[k].trim()) k++;
    if (lines[k]?.trim() === '---') {
      let end = k + 1;
      while (end < lines.length && lines[end].trim() !== '---') end++;
      firstLine = end + 1;
    }
  }

  const warn = (line: number, message: string, text: string) => {
    ir.warnings.push({ line, message, text: text.length > 80 ? text.slice(0, 80) + '…' : text });
  };

  const getOrCreate = (id: string): MermaidNodeIR => {
    let node = nodeMap.get(id);
    if (!node) {
      node = { id, label: id, shape: 'rectangle', classes: [] };
      nodeMap.set(id, node);
    }
    return node;
  };

  const registerNode = (p: ParsedNode) => {
    const node = getOrCreate(p.id);
    if (p.explicit) {
      node.label = p.label;
      node.shape = p.shape;
    }
    if (p.className) node.classes.push(p.className);
    if (subStack.length > 0) {
      const cur = subStack[subStack.length - 1];
      if (!cur.nodeIds.includes(p.id)) {
        cur.nodeIds.push(p.id);
        node.subgraph = cur.id;
      }
    }
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineNo = lineIndex + 1;
    const rawLine = lines[lineIndex];

    if (lineIndex < firstLine) continue;

    if (skipUntilBrace) {
      if (rawLine.includes('}')) skipUntilBrace = false;
      continue;
    }

    const line = stripComment(rawLine).trim();
    if (!line) continue;

    for (const stmt of splitStatements(line)) {
      // --- заголовок ---
      const header = /^(flowchart|graph)(?:-elk)?(?:\s+(TB|TD|BT|RL|LR))?$/i.exec(stmt);
      if (header) {
        ir.hasHeader = true;
        if (header[2]) ir.directionExplicit = true;
        if (!preferredDirection && header[2]) {
          const dir = header[2].toUpperCase();
          ir.direction = dir === 'TD' ? 'TB' : (dir as 'TB' | 'LR' | 'BT' | 'RL');
        }
        continue;
      }
      const unsupported = UNSUPPORTED_DIAGRAMS.exec(stmt);
      if (unsupported && !ir.hasHeader && !seenStatement && !LINK_TOKENS.test(stmt)) {
        ir.fatal = {
          line: lineNo,
          message: t('Тип диаграммы не поддерживается (только flowchart / graph)') + `: ${unsupported[1]}`,
          text: stmt,
        };
        return ir;
      }

      seenStatement = true;

      // --- директивы, которые не влияют на граф ---
      if (/^(click|direction|title|accTitle)\b/i.test(stmt)) continue;
      if (/^accDescr\b/i.test(stmt)) {
        if (stmt.includes('{') && !stmt.includes('}')) skipUntilBrace = true;
        continue;
      }

      // --- classDef a,b styles ---
      let m = /^classDef\s+([^\s]+)\s+(.+)$/i.exec(stmt);
      if (m) {
        const style = parseStyleProperties(m[2]);
        for (const name of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
          classDefs.set(name, { ...(classDefs.get(name) || {}), ...style });
        }
        continue;
      }

      // --- class A,B name ---
      m = LINK_TOKENS.test(stmt) ? null : /^class\s+(.+?)\s+([^\s,]+)$/i.exec(stmt);
      if (m) {
        for (const id of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
          getOrCreate(id).classes.push(m[2]);
        }
        continue;
      }

      // --- style id styles ---
      m = LINK_TOKENS.test(stmt) ? null : /^style\s+([^\s]+)\s+(.+)$/i.exec(stmt);
      if (m) {
        const node = getOrCreate(m[1]);
        node.inlineStyle = { ...(node.inlineStyle || {}), ...parseStyleProperties(m[2]) };
        continue;
      }

      // --- linkStyle 0,1 stroke:... / default ---
      m = /^linkStyle\s+(default|[\d\s,]+)\s+(.+)$/i.exec(stmt);
      if (m) {
        const indexes = m[1].toLowerCase() === 'default'
          ? 'default'
          : m[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        linkStyles.push({ indexes, style: parseEdgeStyleProperties(m[2]) });
        continue;
      }

      // --- subgraph ---
      m = /^subgraph(?:\s+(.*))?$/i.exec(stmt);
      if (m) {
        const rest = (m[1] || '').trim();
        let subId = '';
        let subTitle = '';
        const bracket = /^([^\s\[\]"]+)\s*\[(.*)\]$/s.exec(rest);
        if (bracket) {
          subId = bracket[1];
          subTitle = cleanLabel(bracket[2]);
        } else if (/^"[\s\S]*"$/.test(rest)) {
          subTitle = cleanLabel(rest);
          subId = `subgraph_${ir.subgraphs.length + 1}_${subTitle.replace(/[^\p{L}\p{N}_]/gu, '_')}`;
        } else if (rest && !/\s/.test(rest)) {
          subId = rest;
          subTitle = rest;
        } else {
          subTitle = cleanLabel(rest);
          subId = `subgraph_${ir.subgraphs.length + 1}_${subTitle.replace(/[^\p{L}\p{N}_]/gu, '_')}`;
        }
        const sub: MermaidSubgraphIR = {
          id: subId,
          title: subTitle || subId,
          parent: subStack.length > 0 ? subStack[subStack.length - 1].id : undefined,
          nodeIds: [],
        };
        ir.subgraphs.push(sub);
        subStack.push(sub);
        continue;
      }
      if (/^end$/i.test(stmt)) {
        if (subStack.length > 0) subStack.pop();
        else warn(lineNo, t('лишний end без subgraph'), stmt);
        continue;
      }

      // --- узлы и связи (транзакционно: при ошибке выражение пропускается целиком) ---
      let chain: ParsedChain;
      try {
        chain = parseChain(stmt);
      } catch (err) {
        if (err instanceof MermaidSyntaxError) {
          warn(lineNo, err.message, stmt);
          continue;
        }
        throw err;
      }
      for (const group of chain.groups) for (const p of group) registerNode(p);
      chain.links.forEach((link, i) => {
        for (const from of chain.groups[i]) {
          for (const to of chain.groups[i + 1]) {
            const index = edgeCounter++;
            ir.edges.push({
              id: `e_${from.id}_${to.id}_${index + 1}`,
              index,
              source: from.id,
              target: to.id,
              label: link.label,
              lineType: link.lineType,
              headStart: link.headStart,
              headEnd: link.headEnd,
            });
          }
        }
      });
    }
  }

  if (subStack.length > 0) {
    warn(lines.length, t('не закрыт subgraph (нужен end)') + `: ${subStack[subStack.length - 1].title}`, '');
  }

  // --- ссылки на подграф как на узел: заменяем на первый узел подграфа, «призрачный» узел убираем ---
  const subById = new Map(ir.subgraphs.map(s => [s.id, s]));
  const representative = (subId: string, seen = new Set<string>()): string | undefined => {
    if (seen.has(subId)) return undefined;
    seen.add(subId);
    const sub = subById.get(subId);
    if (!sub) return undefined;
    if (sub.nodeIds.length > 0) return sub.nodeIds[0];
    for (const child of ir.subgraphs) {
      if (child.parent === subId) {
        const r = representative(child.id, seen);
        if (r) return r;
      }
    }
    return undefined;
  };
  for (const sub of ir.subgraphs) {
    const ghost = nodeMap.get(sub.id);
    if (ghost && ghost.shape === 'rectangle' && ghost.label === ghost.id && !ghost.subgraph) nodeMap.delete(sub.id);
  }
  ir.edges = ir.edges.filter(e => {
    for (const end of ['source', 'target'] as const) {
      if (!nodeMap.has(e[end]) && subById.has(e[end])) {
        const rep = representative(e[end]);
        if (!rep) {
          warn(0, t('связь с пустым подграфом пропущена'), `${e.source} → ${e.target}`);
          return false;
        }
        e[end] = rep;
      }
    }
    return true;
  });

  // --- итоговые стили: classDef (по порядку) + style ---
  const defaultClass = classDefs.get('default');
  for (const node of nodeMap.values()) {
    let style: Record<string, any> = { ...(defaultClass || {}) };
    for (const cls of node.classes) if (classDefs.has(cls)) style = { ...style, ...classDefs.get(cls) };
    if (node.inlineStyle) style = { ...style, ...node.inlineStyle };
    node.style = Object.keys(style).length > 0 ? style : undefined;
  }
  for (const ls of linkStyles) {
    for (const e of ir.edges) {
      if (ls.indexes === 'default' || ls.indexes.includes(e.index)) e.style = { ...(e.style || {}), ...ls.style };
    }
  }

  ir.nodes = Array.from(nodeMap.values());
  return ir;
}

/** Формат сообщения для пользователя: «Строка 3: …». */
export function formatMermaidIssue(issue: MermaidIssue): string {
  const where = issue.line > 0 ? `${t('Строка')} ${issue.line}: ` : '';
  return `${where}${issue.message}`;
}

/** Похож ли текст на Mermaid-диаграмму (первая значимая строка — заголовок диаграммы). */
export function looksLikeMermaid(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trim() === '---') {
    i++;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++;
  }
  for (; i < lines.length; i++) {
    const l = stripComment(lines[i]).trim();
    if (!l) continue;
    return /^(flowchart|graph)(?:-elk)?\b/i.test(l) || UNSUPPORTED_DIAGRAMS.test(l);
  }
  return false;
}
