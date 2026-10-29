import { describe, it, expect } from 'vitest';
import { buildGraphTextExport, type GraphTextExportInput } from '../src/utils/graphTextExport';
import { scopedHideScrollbarsCss } from '../src/utils/graphExportStyle';

const input = (over: Partial<GraphTextExportInput> = {}): GraphTextExportInput => ({
  nodes: [],
  edges: [],
  direction: 'LR',
  sql: '',
  ...over,
});

/** Разбирает содержимое <query>…</query>: только CDATA-секции; возвращает склеенный текст или бросает при «мусоре». */
const readQueryCdata = (xml: string): string => {
  const m = xml.match(/<query>([\s\S]*?)<\/query>/);
  if (!m) throw new Error('нет <query>');
  const body = m[1];
  let pos = 0;
  let out = '';
  while (pos < body.length) {
    if (!body.startsWith('<![CDATA[', pos)) throw new Error(`вне CDATA на позиции ${pos}: ${body.slice(pos, pos + 20)}`);
    const end = body.indexOf(']]>', pos + 9);
    if (end === -1) throw new Error('CDATA не закрыта');
    out += body.slice(pos + 9, end);
    pos = end + 3;
  }
  return out;
};

/** Правило XML: «]]>» не может встречаться в тексте вне CDATA. */
const hasStrayCdataEnd = (xml: string): boolean => xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').includes(']]>');

describe('buildGraphTextExport: xml', () => {
  it('обычный SQL лежит в CDATA как есть', () => {
    const { content, filename } = buildGraphTextExport('xml', input({ sql: 'select 1 from t' }));
    expect(filename).toBe('sql-graph-export.xml');
    expect(readQueryCdata(content)).toBe('select 1 from t');
  });

  it('индекс вложенного массива a[b[1]]>0 не ломает CDATA', () => {
    const sql = 'select a[b[1]]>0 from t';
    const { content } = buildGraphTextExport('xml', input({ sql }));
    expect(hasStrayCdataEnd(content)).toBe(false);
    expect(readQueryCdata(content)).toBe(sql);
  });

  it(']]> в комментарии, в начале и в конце SQL', () => {
    for (const sql of ['select 1 -- конец ]]> тут', ']]>select 1', 'select 1]]>', ']]>]]>', 'a]]>b]]>c']) {
      const { content } = buildGraphTextExport('xml', input({ sql }));
      expect(hasStrayCdataEnd(content)).toBe(false);
      expect(readQueryCdata(content)).toBe(sql);
    }
  });

  it('кириллица и пустой SQL', () => {
    const sql = 'select "Имя" from "Таблица" -- заметка';
    expect(readQueryCdata(buildGraphTextExport('xml', input({ sql })).content)).toBe(sql);
    expect(readQueryCdata(buildGraphTextExport('xml', input({ sql: '' })).content)).toBe('');
  });

  it('атрибуты и текст узлов экранируются', () => {
    const { content } = buildGraphTextExport('xml', input({
      nodes: [{ id: 'a&b', type: 'tableNode', data: { title: 'x<y', columns: ['c"1'] }, position: { x: 0, y: 0 } }],
    }));
    expect(content).toContain('id="a&amp;b"');
    expect(content).toContain('<title>x&lt;y</title>');
    expect(content).toContain('<column>c&quot;1</column>');
  });
});

describe('buildGraphTextExport: json', () => {
  const nodes = [
    { id: 'n1', type: 'collapseNode', data: { label: 'Q1', onToggle: () => 1, nested: { cb() { return 1; }, ok: 2 } }, position: { x: 1, y: 2 } },
  ];

  it('метаданные и число узлов', () => {
    const { content, filename } = buildGraphTextExport('json', input({ nodes, edges: [{ id: 'e1', source: 'n1', target: 'n1' }] }));
    const json = JSON.parse(content);
    expect(filename).toBe('sql-graph-export.json');
    expect(json.metadata.nodeCount).toBe(1);
    expect(json.metadata.edgeCount).toBe(1);
    expect(json.nodes[0]).toMatchObject({ id: 'n1', type: 'collapseNode', label: 'Q1', position: { x: 1, y: 2 } });
  });

  it('в JSON нет функций (onToggle и подобных)', () => {
    const { content } = buildGraphTextExport('json', input({ nodes }));
    expect(content).not.toContain('onToggle');
    expect(content).not.toContain('"cb"');
    expect(JSON.parse(content).nodes[0].data.nested).toEqual({ ok: 2 });
  });

  it('bigint в данных узла не роняет экспорт', () => {
    const big = [{ id: 'n1', type: 'tableNode', data: { label: 't', rows: 12345678901234567890n } }];
    expect(() => buildGraphTextExport('json', input({ nodes: big }))).not.toThrow();
    expect(JSON.parse(buildGraphTextExport('json', input({ nodes: big })).content).nodes[0].data.rows).toBe('12345678901234567890');
  });
});

describe('buildGraphTextExport: mermaid', () => {
  const idsOf = (content: string) => [...content.matchAll(/^ {2}(\S+?)\["/gm)].map(m => m[1]);

  it('идентификаторы a-b и a_b различаются, рёбра ведут к своим узлам', () => {
    const { content, filename } = buildGraphTextExport('mermaid', input({
      nodes: [
        { id: 'a-b', type: 'tableNode', data: { label: 'first' } },
        { id: 'a_b', type: 'tableNode', data: { label: 'second' } },
      ],
      edges: [{ id: 'e', source: 'a-b', target: 'a_b' }],
    }));
    expect(filename).toBe('sql-graph-export.mmd');
    const ids = idsOf(content);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
    expect(content).toContain(`  ${ids[0]} --> ${ids[1]}`);
  });

  it('кириллические id не склеиваются', () => {
    const { content } = buildGraphTextExport('mermaid', input({
      nodes: [
        { id: 'main_cte_wrap_отчёт', type: 'tableNode', data: { label: 'x' } },
        { id: 'main_cte_wrap_итог', type: 'tableNode', data: { label: 'y' } },
      ],
    }));
    expect(new Set(idsOf(content)).size).toBe(2);
  });

  it('обычные id остаются без изменений, допустимы только [A-Za-z0-9_]', () => {
    const { content } = buildGraphTextExport('mermaid', input({
      nodes: [
        { id: 'main_q1_result', type: 'resultNode', data: { label: 'r' } },
        { id: 'a.b c', type: 'tableNode', data: { label: 't' } },
      ],
      edges: [{ id: 'e', source: 'a.b c', target: 'main_q1_result' }],
    }));
    const ids = idsOf(content);
    expect(ids[0]).toBe('main_q1_result');
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_]+$/);
    expect(content).toContain(`  ${ids[1]} --> main_q1_result`);
  });

  it('направление и подписи', () => {
    const lr = buildGraphTextExport('mermaid', input({ direction: 'LR', nodes: [{ id: 'n', data: { label: 'say "hi"' } }] })).content;
    expect(lr.split('\n')[0]).toBe('graph LR');
    expect(lr).toContain(`["say 'hi'"]`);
    expect(buildGraphTextExport('mermaid', input({ direction: 'TB' })).content.split('\n')[0]).toBe('graph TD');
  });
});

describe('buildGraphTextExport: drawio', () => {
  const cells = (content: string) =>
    [...content.matchAll(/<mxCell id="([^"]*)" value="[^"]*" style="([^"]*)" vertex="1" parent="1">\s*<mxGeometry x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g)].map(m => ({
      id: m[1], style: m[2], x: Number(m[3]), y: Number(m[4]), width: Number(m[5]), height: Number(m[6]),
    }));
  const cols = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `c${i}` }));

  it('размеры ячеек совпадают с размерами узлов раскладки', () => {
    const { content, filename } = buildGraphTextExport('drawio', input({
      nodes: [
        { id: 't', type: 'tableNode', data: { columns: cols(3) }, position: { x: 10, y: 20 } },
        { id: 'r', type: 'resultNode', data: { columns: cols(2) }, position: { x: 400, y: 20 } },
        { id: 'l', type: 'constantNode', data: {}, position: { x: 800, y: 20 } },
        { id: 'j', type: 'joinNode', data: {}, position: { x: 1200, y: 20 } },
        { id: 'c', type: 'collapseNode', data: {}, position: { x: 1600, y: 20 } },
      ],
    }));
    expect(filename).toBe('sql-graph-export.drawio.xml');
    const bySize = Object.fromEntries(cells(content).map(c => [c.id, [c.width, c.height]]));
    expect(bySize).toEqual({
      t: [256, 188],
      r: [256, 120],
      l: [256, 89],
      j: [256, 112],
      c: [220, 32],
    });
  });

  it('измеренный размер узла (React Flow) важнее расчётного', () => {
    const { content } = buildGraphTextExport('drawio', input({
      nodes: [{ id: 't', type: 'tableNode', data: { columns: cols(3) }, position: { x: 0, y: 0 }, measured: { width: 300.4, height: 123.6 } }],
    }));
    const [c] = cells(content);
    expect([c.width, c.height]).toEqual([300, 124]);
  });

  it('позиции округляются и сохраняются', () => {
    const { content } = buildGraphTextExport('drawio', input({
      nodes: [{ id: 't', type: 'tableNode', data: {}, position: { x: 10.4, y: -20.6 } }],
    }));
    const [c] = cells(content);
    expect([c.x, c.y]).toEqual([10, -21]);
  });

  it('цвета зависят от типа узла', () => {
    const { content } = buildGraphTextExport('drawio', input({
      nodes: [
        { id: 't', type: 'tableNode', data: {}, position: { x: 0, y: 0 } },
        { id: 'r', type: 'resultNode', data: {}, position: { x: 0, y: 0 } },
        { id: 'j', type: 'joinNode', data: {}, position: { x: 0, y: 0 } },
        { id: 'm', type: 'mermaidNode', data: {}, position: { x: 0, y: 0 } },
      ],
    }));
    const style = Object.fromEntries(cells(content).map(c => [c.id, c.style]));
    expect(style.t).toContain('strokeColor=#3b82f6');
    expect(style.r).toContain('strokeColor=#10b981');
    expect(style.j).toContain('strokeColor=#a855f7');
    expect(style.m).toContain('strokeColor=#94a3b8'); // неизвестный тип — цвета по умолчанию
    expect(new Set([style.t, style.r, style.j, style.m]).size).toBe(4);
  });

  it('подписи и рёбра экранируются, рёбра ссылаются на узлы', () => {
    const { content } = buildGraphTextExport('drawio', input({
      nodes: [
        { id: 'a', type: 'tableNode', data: { title: 'T <1> & co', tableName: 'x"y' }, position: { x: 0, y: 0 } },
        { id: 'b', type: 'resultNode', data: {}, position: { x: 0, y: 0 } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', label: 'x<y' }],
    }));
    expect(content).toContain('&lt;b&gt;T &amp;lt;1&amp;gt; &amp;amp; co&lt;/b&gt;');
    expect(content).toContain('source="a" target="b"');
    expect(content).toContain('value="x&lt;y"');
  });
});

describe('scopedHideScrollbarsCss', () => {
  const scope = '.react-flow__viewport';

  it('все правила действуют только внутри заданной области', () => {
    const css = scopedHideScrollbarsCss(scope);
    const selectors = css
      .split('}')
      .map(chunk => chunk.split('{')[0].trim())
      .filter(Boolean)
      .flatMap(sel => sel.split(',').map(p => p.trim()));
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) expect(sel.startsWith(scope)).toBe(true);
  });

  it('скрывает полосы прокрутки (webkit и scrollbar-width)', () => {
    const css = scopedHideScrollbarsCss(scope);
    expect(css).toContain('::-webkit-scrollbar');
    expect(css).toContain('scrollbar-width: none');
  });
});
