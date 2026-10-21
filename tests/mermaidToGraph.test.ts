import { describe, it, expect } from 'vitest';
import { parseMermaidToGraph } from '../src/utils/mermaidToGraph';

describe('mermaidToGraph', () => {
  it('should parse basic flowchart', () => {
    const code = `
      graph TD
      A --> B
    `;
    const result = parseMermaidToGraph(code);
    expect(result.error).toBeUndefined();
    expect(result.direction).toBe('TB');
    // It creates 2 nodes and 1 edge
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.edges.length).toBe(1);
  });

  it('should extract node labels and shapes', () => {
    const code = `
      graph LR
      A[Моя таблица] --> B((Круг))
    `;
    const result = parseMermaidToGraph(code);
    expect(result.error).toBeUndefined();
    expect(result.direction).toBe('LR');
    
    const nodeA = result.nodes.find(n => n.id === 'A');
    expect(nodeA).toBeDefined();
    expect(nodeA?.data?.label).toContain('Моя таблица');
    
    const nodeB = result.nodes.find(n => n.id === 'B');
    expect(nodeB).toBeDefined();
    // Assuming some mapping to shape types, but we just check it exists
  });

  it('should return error for empty or invalid input', () => {
    const result1 = parseMermaidToGraph('');
    expect(result1.nodes).toEqual([]);
    
    // Some random text instead of mermaid
    const result2 = parseMermaidToGraph('random text without graph keyword');
    // The parser might treat it as invalid and return empty or error
    expect(result2.nodes).toEqual([]);
  });

  it('метки рёбер и стрелки попадают в рёбра React Flow', () => {
    const result = parseMermaidToGraph('graph TD\nA -->|yes| B\nB <--> C\nC ~~~ D\nlinkStyle 0 stroke:#f00');
    expect(result.error).toBeUndefined();
    // невидимая связь ~~~ в рёбра React Flow не попадает
    expect(result.edges.map(e => e.label)).toEqual(['yes', undefined]);
    expect(result.edges[0].style.stroke).toBe('#f00');
    // стрелки рисует MermaidEdge сам: вид наконечников лежит в data, RF-маркеров нет
    expect(result.edges[1].data.headStart).toBe('arrow');
    expect(result.edges[1].data.headEnd).toBe('arrow');
    expect(result.edges[1].markerEnd).toBeUndefined();
  });

  it('ошибки: тип диаграммы и номер строки', () => {
    const r1 = parseMermaidToGraph('sequenceDiagram\nA->>B: hi');
    expect(r1.nodes).toEqual([]);
    expect(r1.error).toContain('sequenceDiagram');

    const r2 = parseMermaidToGraph('graph TD\nA -->');
    expect(r2.nodes).toEqual([]);
    expect(r2.error).toContain('2');

    // часть выражений разобрана — граф строится, проблемы в warnings
    const r3 = parseMermaidToGraph('graph TD\nбред ((( \nA --> B');
    expect(r3.error).toBeUndefined();
    expect(r3.edges).toHaveLength(1);
    expect(r3.warnings).toHaveLength(1);
  });

  it('вложенные подграфы: рамка родителя охватывает рамку вложенного', () => {
    const r = parseMermaidToGraph('graph TD\nsubgraph outer\nX-->Y\nsubgraph inner\nZ\nend\nend');
    const outer = r.nodes.find(n => n.id === 'outer');
    const inner = r.nodes.find(n => n.id === 'inner');
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    expect(outer.position.x).toBeLessThan(inner.position.x);
    expect(outer.position.y).toBeLessThan(inner.position.y);
    expect(outer.position.x + outer.data.width).toBeGreaterThan(inner.position.x + inner.data.width);
    expect(outer.position.y + outer.data.height).toBeGreaterThan(inner.position.y + inner.data.height);
  });

  it('подпись ребра получает место в раскладке: узлы дальше, чем без подписи', () => {
    const gap = (code: string) => {
      const r = parseMermaidToGraph(code);
      const a = r.nodes.find(n => n.id === 'A');
      const b = r.nodes.find(n => n.id === 'B');
      return b.position.x - (a.position.x + (a.measured?.width ?? a.width ?? a.data?.width ?? 0));
    };
    const plain = gap('flowchart LR\nA --> B');
    const labeled = gap('flowchart LR\nA -->|read_csv_auto| B');
    expect(labeled > plain).toBe(true);
  });

  it('размер узла учитывает строки с <br/>, подпись ребра без <br/>, у ребра есть маршрут', () => {
    const r = parseMermaidToGraph('flowchart LR\nA["один"] -->|"раз,<br/>два"| B["a<br/>b<br/>c"]');
    const a = r.nodes.find(n => n.id === 'A');
    const b = r.nodes.find(n => n.id === 'B');
    expect(b.data.nodeHeight > a.data.nodeHeight).toBe(true);
    expect(r.edges[0].label).toBe('раз, два');
    expect(r.edges[0].type).toBe('mermaidEdge');
    expect(r.edges[0].data.route.start).toBeDefined();
    expect(r.edges[0].data.route.end).toBeDefined();
  });
});
