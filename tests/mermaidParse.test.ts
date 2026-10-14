import { describe, it, expect } from 'vitest';
import { parseMermaidSource, looksLikeMermaid, formatMermaidIssue } from '../src/utils/mermaidParse';

const edges = (code: string) =>
  parseMermaidSource(code).edges.map(e => `${e.source}>${e.target}${e.label ? `[${e.label}]` : ''}`);
const ids = (code: string) => parseMermaidSource(code).nodes.map(n => n.id);

describe('mermaidParse: метки рёбер', () => {
  it('-->|text|', () => {
    expect(edges('graph TD\nA -->|yes| B')).toEqual(['A>B[yes]']);
    expect(edges('graph TD\nA-->|yes|B')).toEqual(['A>B[yes]']);
    expect(edges('graph TD\nA --> |yes| B')).toEqual(['A>B[yes]']);
  });
  it('-- text -->, == text ==>, -. text .->', () => {
    expect(edges('graph TD\nA -- да --> B')).toEqual(['A>B[да]']);
    expect(edges('graph TD\nA == три ==> B')).toEqual(['A>B[три]']);
    expect(edges('graph TD\nA -. пунктир .-> B')).toEqual(['A>B[пунктир]']);
  });
  it('---|text| (линия без стрелки)', () => {
    const ir = parseMermaidSource('graph TD\nA ---|t| B');
    expect(ir.edges[0].label).toBe('t');
    expect(ir.edges[0].headEnd).toBe('none');
  });
});

describe('mermaidParse: разделители и комментарии', () => {
  it('точка с запятой в конце и несколько выражений в строке', () => {
    expect(edges('graph TD\nA-->B;\nB-->C;')).toEqual(['A>B', 'B>C']);
    expect(edges('graph TD\nA-->B; B-->C')).toEqual(['A>B', 'B>C']);
  });
  it('%% комментарии: целая строка и в конце строки', () => {
    expect(edges('graph TD\n%% заметка\nA --> B %% хвост')).toEqual(['A>B']);
  });
  it('%% внутри кавычек не комментарий', () => {
    expect(parseMermaidSource('graph TD\nA["100%% ok"] --> B').nodes[0].label).toBe('100%% ok');
  });
  it('%%{init}%% и frontmatter пропускаются', () => {
    const ir = parseMermaidSource('---\ntitle: X\n---\n%%{init: {"theme":"dark"}}%%\nflowchart LR\nA-->B');
    expect(ir.direction).toBe('LR');
    expect(ir.edges).toHaveLength(1);
    expect(ir.warnings).toHaveLength(0);
  });
});

describe('mermaidParse: узлы и идентификаторы', () => {
  it('& внутри подписи в кавычках и как разделитель', () => {
    const ir = parseMermaidSource('graph LR\nA["R&D"] --> B');
    expect(ir.nodes.find(n => n.id === 'A')?.label).toBe('R&D');
    expect(edges('graph LR\nA & B --> C & D')).toEqual(['A>C', 'A>D', 'B>C', 'B>D']);
  });
  it('кириллица в id', () => {
    expect(edges('graph LR\nТаблица1 --> Таблица2')).toEqual(['Таблица1>Таблица2']);
  });
  it('дефисы в id не ломают стрелки', () => {
    expect(ids('graph LR\nnode-a-b --> node-c')).toEqual(['node-a-b', 'node-c']);
    expect(edges('graph LR\na-b-c --> d')).toEqual(['a-b-c>d']);
    expect(edges('graph LR\nA-->B-->C')).toEqual(['A>B', 'B>C']);
  });
  it('апостроф в подписи не считается кавычкой', () => {
    const ir = parseMermaidSource("graph LR\nA[it's] --> B[that's]");
    expect(ir.nodes.map(n => n.label)).toEqual(["it's", "that's"]);
  });
  it('фигуры', () => {
    const shapes = (code: string) => parseMermaidSource(code).nodes[0].shape;
    expect(shapes('graph TD\nA[x]')).toBe('rectangle');
    expect(shapes('graph TD\nA(x)')).toBe('rounded');
    expect(shapes('graph TD\nA([x])')).toBe('stadium');
    expect(shapes('graph TD\nA[(x)]')).toBe('cylinder');
    expect(shapes('graph TD\nA[[x]]')).toBe('subroutine');
    expect(shapes('graph TD\nA((x))')).toBe('circle');
    expect(shapes('graph TD\nA(((x)))')).toBe('double_circle');
    expect(shapes('graph TD\nA{x}')).toBe('rhombus');
    expect(shapes('graph TD\nA{{x}}')).toBe('hexagon');
    expect(shapes('graph TD\nA>x]')).toBe('asymmetric');
    expect(shapes('graph TD\nA[/x/]')).toBe('parallelogram');
    expect(shapes('graph TD\nA[\\x\\]')).toBe('parallelogram_alt');
    expect(shapes('graph TD\nA[/x\\]')).toBe('trapezoid');
    expect(shapes('graph TD\nA[\\x/]')).toBe('trapezoid_alt');
  });
  it('соседние узлы с `/]` и `\\]` не склеиваются (ближайшая закрывающая)', () => {
    const ir = parseMermaidSource('graph TD\nM[/m\\] --> N[\\n/]');
    expect(ir.nodes.map(n => [n.id, n.shape, n.label])).toEqual([['M', 'trapezoid', 'm'], ['N', 'trapezoid_alt', 'n']]);
    expect(ir.edges).toHaveLength(1);
  });
  it('[/путь] без закрытия трапеции — обычный прямоугольник', () => {
    const n = parseMermaidSource('graph TD\nA[/var/log]').nodes[0];
    expect(n.shape).toBe('rectangle');
    expect(n.label).toBe('/var/log');
  });
  it('новый синтаксис @{ shape, label }', () => {
    const n = parseMermaidSource('flowchart TD\nA@{ shape: cyl, label: "DB, main" } --> B').nodes[0];
    expect(n.shape).toBe('cylinder');
    expect(n.label).toBe('DB, main');
  });
  it('#quot; и #35; в подписи', () => {
    expect(parseMermaidSource('graph TD\nA["a #quot;b#quot; #35; c"]').nodes[0].label).toBe('a "b" # c');
  });
});

describe('mermaidParse: стрелки', () => {
  const link = (code: string) => parseMermaidSource(`graph LR\n${code}`).edges[0];
  it('двунаправленные и с маркерами', () => {
    expect(link('A <--> B')).toMatchObject({ headStart: 'arrow', headEnd: 'arrow' });
    expect(link('A --x B')).toMatchObject({ headEnd: 'cross' });
    expect(link('A --o B')).toMatchObject({ headEnd: 'circle' });
    expect(link('A o--o B')).toMatchObject({ headStart: 'circle', headEnd: 'circle' });
  });
  it('длинные стрелки', () => {
    expect(link('A ----> B')).toMatchObject({ source: 'A', target: 'B', headEnd: 'arrow', lineType: 'solid' });
    expect(link('A ====> B')).toMatchObject({ lineType: 'thick', headEnd: 'arrow' });
    expect(link('A -..-> B')).toMatchObject({ lineType: 'dotted', headEnd: 'arrow' });
  });
  it('типы линий', () => {
    expect(link('A --- B')).toMatchObject({ lineType: 'solid', headEnd: 'none' });
    expect(link('A -.- B')).toMatchObject({ lineType: 'dotted', headEnd: 'none' });
    expect(link('A -.-> B')).toMatchObject({ lineType: 'dotted', headEnd: 'arrow' });
    expect(link('A === B')).toMatchObject({ lineType: 'thick', headEnd: 'none' });
    expect(link('A ~~~ B')).toMatchObject({ lineType: 'invisible' });
  });
  it('слово, начинающееся на o/x после пробела, не становится маркером', () => {
    expect(link('A --- other')).toMatchObject({ target: 'other', headEnd: 'none' });
    expect(link('A --> xray')).toMatchObject({ target: 'xray', headEnd: 'arrow' });
  });
});

describe('mermaidParse: классы и стили', () => {
  it('class до classDef и :::', () => {
    const ir = parseMermaidSource('graph TD\nclass A hot\nclassDef hot fill:#f00\nA --> B:::hot');
    expect(ir.nodes.find(n => n.id === 'A')?.style).toEqual({ backgroundColor: '#f00' });
    expect(ir.nodes.find(n => n.id === 'B')?.style).toEqual({ backgroundColor: '#f00' });
  });
  it('style перекрывает classDef независимо от порядка', () => {
    const ir = parseMermaidSource('graph TD\nstyle A fill:#00f\nclassDef c fill:#f00,color:#fff\nclass A c');
    expect(ir.nodes[0].style).toEqual({ backgroundColor: '#00f', color: '#fff' });
  });
  it('rgb(...) с запятыми внутри скобок не режется', () => {
    const ir = parseMermaidSource('graph TD\nA\nstyle A fill:rgb(255,0,0),stroke:#333');
    expect(ir.nodes[0].style).toEqual({ backgroundColor: 'rgb(255,0,0)', borderColor: '#333' });
  });
  it('linkStyle по индексу', () => {
    const ir = parseMermaidSource('graph TD\nA-->B\nB-->C\nlinkStyle 1 stroke:#f00,stroke-width:4px');
    expect(ir.edges[0].style).toBeUndefined();
    expect(ir.edges[1].style).toEqual({ stroke: '#f00', strokeWidth: 4 });
  });
});

describe('mermaidParse: подграфы', () => {
  it('вложенные подграфы и ссылка на подграф как на узел', () => {
    const ir = parseMermaidSource('graph TD\nsubgraph outer\nX-->Y\nsubgraph inner\nZ\nend\nend\nB --> inner');
    expect(ir.subgraphs.map(s => [s.id, s.parent])).toEqual([['outer', undefined], ['inner', 'outer']]);
    expect(ir.nodes.map(n => n.id).sort()).toEqual(['B', 'X', 'Y', 'Z']);
    expect(ir.edges.find(e => e.source === 'B')?.target).toBe('Z');
  });
  it('subgraph id [title] и "title"', () => {
    const ir = parseMermaidSource('graph TD\nsubgraph b1 [Бэкенд]\nA\nend\nsubgraph "Два слова"\nB\nend');
    expect(ir.subgraphs[0]).toMatchObject({ id: 'b1', title: 'Бэкенд' });
    expect(ir.subgraphs[1].title).toBe('Два слова');
  });
  it('лишний end и незакрытый subgraph — предупреждения', () => {
    expect(parseMermaidSource('graph TD\nA\nend').warnings).toHaveLength(1);
    expect(parseMermaidSource('graph TD\nsubgraph S\nA').warnings).toHaveLength(1);
  });
});

describe('mermaidParse: ошибки', () => {
  it('неподдерживаемый тип диаграммы — fatal', () => {
    const ir = parseMermaidSource('sequenceDiagram\nA->>B: hi');
    expect(ir.fatal?.message).toContain('sequenceDiagram');
    expect(ir.nodes).toEqual([]);
  });
  it('узел с именем pie/gantt и стрелкой — не тип диаграммы', () => {
    const ir = parseMermaidSource('graph TD\npie --> gantt');
    expect(ir.fatal).toBeUndefined();
    expect(ir.edges).toHaveLength(1);
  });
  it('мусорная строка пропускается с номером строки, остальное строится', () => {
    const ir = parseMermaidSource('graph TD\nэто ((( не граф\nA-->B');
    expect(ir.edges).toHaveLength(1);
    expect(ir.warnings).toHaveLength(1);
    expect(ir.warnings[0].line).toBe(2);
    expect(formatMermaidIssue(ir.warnings[0])).toContain('2');
  });
  it('обрыв стрелки и незакрытая скобка', () => {
    expect(parseMermaidSource('graph TD\nA -->').warnings[0].line).toBe(2);
    expect(parseMermaidSource('graph TD\nA[abc --> B').warnings[0].line).toBe(2);
    expect(parseMermaidSource('graph TD\nA -->|abc B').warnings).toHaveLength(1);
  });
  it('номер строки учитывает пустые строки и frontmatter', () => {
    const ir = parseMermaidSource('---\ntitle: x\n---\ngraph TD\n\nA -->');
    expect(ir.warnings[0].line).toBe(6);
  });
  it('транзакционность: частично разобранное выражение не оставляет узлов', () => {
    const ir = parseMermaidSource('graph TD\nA --> B --> ');
    expect(ir.nodes).toEqual([]);
  });
});

describe('looksLikeMermaid', () => {
  it('распознаёт заголовки', () => {
    expect(looksLikeMermaid('flowchart LR\nA-->B')).toBe(true);
    expect(looksLikeMermaid('\n%% c\ngraph TD')).toBe(true);
    expect(looksLikeMermaid('---\ntitle: x\n---\ngraph TD\nA')).toBe(true);
    expect(looksLikeMermaid('sequenceDiagram\nA->>B: x')).toBe(true);
  });
  it('обычный текст и SQL — нет', () => {
    expect(looksLikeMermaid('# Заголовок\n\nтекст')).toBe(false);
    expect(looksLikeMermaid('SELECT 1')).toBe(false);
    expect(looksLikeMermaid('')).toBe(false);
  });
});
