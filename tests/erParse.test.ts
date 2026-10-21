import { describe, it, expect } from 'vitest';
import { isErDiagram, parseErSource, parseDiagram, erEntityMetrics, erCommentShown } from '../src/utils/erParse';
import { parseMermaidToGraph } from '../src/utils/mermaidToGraph';
import { mermaidToSvg, renderMermaidBlock } from '../src/utils/mermaidSvg';
import { looksLikeMermaid } from '../src/utils/mermaidParse';
import { renderMarkdown } from '../src/utils/markdown';

const SAMPLE = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER }o..o| REGION : "lives in"
    CUSTOMER {
        int id PK
        string email UK "login email"
        int region_id FK
        decimal(10,2) balance
    }
    LINE_ITEM {
        int order_id PK, FK
    }
    p[Product]
    "Order Archive" {
    }
`;

describe('erDiagram: распознавание', () => {
  it('isErDiagram: заголовок, фронтматтер, комментарии, регистр', () => {
    expect(isErDiagram('erDiagram\nA ||--o{ B : x')).toBe(true);
    expect(isErDiagram('---\ntitle: T\n---\n%% c\n\nERDIAGRAM\nA')).toBe(true);
    expect(isErDiagram('flowchart LR\nA-->B')).toBe(false);
    expect(isErDiagram('')).toBe(false);
    expect(looksLikeMermaid('erDiagram\nA')).toBe(true);
  });
  it('parseDiagram выбирает разбор по заголовку', () => {
    expect(parseDiagram('erDiagram\nA ||--o{ B : x').nodes[0].shape).toBe('entity');
    expect(parseDiagram('flowchart LR\nA-->B').nodes[0].shape).toBe('rectangle');
  });
});

describe('erDiagram: разбор', () => {
  const ir = parseErSource(SAMPLE);
  const byId = (id: string) => ir.nodes.find(n => n.id === id)!;

  it('сущности: из связей, блоков, алиасов и кавычек; порядок появления', () => {
    expect(ir.fatal).toBeUndefined();
    expect(ir.warnings).toEqual([]);
    expect(ir.nodes.map(n => n.id)).toEqual(['CUSTOMER', 'ORDER', 'LINE_ITEM', 'REGION', 'p', 'Order Archive']);
    expect(byId('p').label).toBe('Product');
    expect(byId('REGION').er!.attributes).toEqual([]);
    expect(byId('Order Archive').er!.attributes).toEqual([]);
    expect(ir.nodes.every(n => n.shape === 'entity')).toBe(true);
  });

  it('атрибуты: тип, имя, ключи, комментарий, тип со скобками и запятой', () => {
    const a = byId('CUSTOMER').er!.attributes;
    expect(a[0]).toEqual({ type: 'int', name: 'id', keys: ['PK'] });
    expect(a[1]).toEqual({ type: 'string', name: 'email', keys: ['UK'], comment: 'login email' });
    expect(a[2].keys).toEqual(['FK']);
    expect(a[3]).toEqual({ type: 'decimal(10,2)', name: 'balance', keys: [] });
    expect(byId('LINE_ITEM').er!.attributes[0].keys).toEqual(['PK', 'FK']);
  });

  it('связи: мощности с обеих сторон, сплошная и пунктирная линия, подпись', () => {
    expect(ir.edges.length).toBe(3);
    const [e1, e2, e3] = ir.edges;
    expect([e1.source, e1.target, e1.label]).toEqual(['CUSTOMER', 'ORDER', 'places']);
    expect([e1.headStart, e1.headEnd, e1.lineType]).toEqual(['er-one', 'er-zero-many', 'solid']);
    expect([e2.headStart, e2.headEnd]).toEqual(['er-one', 'er-one-many']);
    expect([e3.headStart, e3.headEnd, e3.lineType, e3.label]).toEqual(['er-zero-many', 'er-zero-one', 'dotted', 'lives in']);
    expect(new Set(ir.edges.map(e => e.id)).size).toBe(3);
  });

  it('все четыре мощности слева и справа', () => {
    const r = parseErSource('erDiagram\nA ||--|| B\nA |o--o| B\nA }o--o{ B\nA }|--|{ B');
    expect(r.edges.map(e => [e.headStart, e.headEnd])).toEqual([
      ['er-one', 'er-one'], ['er-zero-one', 'er-zero-one'], ['er-zero-many', 'er-zero-many'], ['er-one-many', 'er-one-many'],
    ]);
  });

  it('direction, комментарии %%, classDef/style пропускаются молча, связь без подписи', () => {
    const r = parseErSource('erDiagram\n%% комментарий\ndirection LR\nA ||--o{ B\nclassDef x fill:#f00\nstyle A fill:#fff');
    expect(r.direction).toBe('LR');
    expect(r.directionExplicit).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.edges[0].label).toBeUndefined();
  });

  it('непонятные строки — предупреждение с номером строки, остальное строится', () => {
    const r = parseErSource('erDiagram\nA ||--o{ B : x\nэто что-то странное ???\nC {\n  broken\n}');
    expect(r.nodes.map(n => n.id)).toEqual(['A', 'B', 'C']);
    expect(r.warnings.map(w => w.line)).toEqual([3, 5]);
  });

  it('пустая диаграмма — фатальная ошибка; имена по-русски', () => {
    expect(parseErSource('erDiagram').fatal).toBeDefined();
    const r = parseErSource('erDiagram\nКлиент ||--o{ Заказ : делает\nКлиент {\n  int код PK\n}');
    expect(r.nodes.map(n => n.id)).toEqual(['Клиент', 'Заказ']);
    expect(r.nodes[0].er!.attributes[0].name).toBe('код');
  });

  it('блок в одну строку', () => {
    const r = parseErSource('erDiagram\nA { int id PK }\nB { }');
    expect(r.nodes[0].er!.attributes.length).toBe(1);
    expect(r.nodes[1].er!.attributes.length).toBe(0);
  });
});

describe('erDiagram: размеры, граф, SVG', () => {
  it('метрики: высота по числу строк, ширина по самым длинным значениям, колонки не пересекаются', () => {
    const attrs = [
      { type: 'int', name: 'id', keys: ['PK' as const] },
      { type: 'varchar(255)', name: 'very_long_column_name', keys: ['FK' as const, 'UK' as const], comment: 'x'.repeat(60) },
    ];
    const m = erEntityMetrics('T', attrs);
    expect(m.height).toBe(32 + 2 * 22 + 6);
    expect(m.cols[3]).toBe(28 * 7);
    for (let k = 0; k < 3; k++) expect(m.colX[k] + m.cols[k] <= m.colX[k + 1]).toBe(true);
    expect(m.colX[3] + m.cols[3] <= m.width).toBe(true);
    expect(erEntityMetrics('Пусто', []).height).toBe(32);
    expect(erCommentShown('x'.repeat(60)).length).toBe(28);
    expect(erEntityMetrics('Очень_длинное_название_сущности', []).width).toBeGreaterThan(150);
  });

  it('parseMermaidToGraph: узлы-таблицы, рёбра с воронкой, маршруты без NaN', () => {
    const r = parseMermaidToGraph(SAMPLE, 'LR');
    expect(r.error).toBeUndefined();
    const ents = r.nodes.filter(n => n.type === 'mermaidEntityNode');
    expect(ents.length).toBe(6);
    expect(ents[0].data.entity.length).toBe(4);
    expect(ents[0].data.nodeHeight).toBe(32 + 4 * 22 + 6);
    expect(r.edges.length).toBe(3);
    expect(r.edges[0].data.headStart).toBe('er-one');
    expect(r.edges[0].data.headEnd).toBe('er-zero-many');
    expect(r.edges[2].style.strokeDasharray).toBe('5 5');
    for (const e of r.edges) for (const p of [e.data.route.start, e.data.route.end]) expect(Number.isFinite(p.x + p.y)).toBe(true);
    expect(r.direction).toBe('LR');
  });

  it('SVG: таблицы, ключи, воронка и кольцо, без NaN', () => {
    const res = mermaidToSvg(SAMPLE);
    expect(res.error).toBeUndefined();
    const svg = res.svg as string;
    expect((svg.match(/class="mm-node mm-entity"/g) || []).length).toBe(6);
    expect(svg).toContain('mm-ent-pk');
    expect(svg).toContain('mm-ent-fk');
    expect(svg).toContain('mm-ent-uk');
    expect(svg).toContain('>decimal(10,2)<');
    expect(svg).toContain('class="mm-er"');
    expect(svg).toContain('mm-head-open'); // кольцо «ноль»
    expect(svg).toContain('mm-dotted');
    expect(svg).toContain('>places<');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('SVG: имена и комментарии экранируются', () => {
    const svg = mermaidToSvg('erDiagram\n"A<script>" {\n  string x "<img onerror=1>"\n}').svg!;
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('Markdown: блок ```mermaid с erDiagram рисуется диаграммой, а не ошибкой', () => {
    const r = renderMarkdown('# ER\n\n```mermaid\nerDiagram\nA ||--o{ B : x\n```\n', { renderMermaid: (code, i) => renderMermaidBlock(code, i) });
    expect(r.html).toContain('mm-entity');
    expect(r.html).not.toContain('md-mermaid-error');
    expect(r.mermaidBlocks.length).toBe(1);
  });
});
