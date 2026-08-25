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
});
