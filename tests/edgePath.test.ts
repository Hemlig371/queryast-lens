import { describe, it, expect } from 'vitest';
import { dropNearStraightRoute } from '../src/utils/edgePath';

describe('dropNearStraightRoute (волнистые рёбра Mermaid)', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 300, y: 0 };

  it('точка почти на прямой (3 px) отбрасывается — ребро прямое', () => {
    expect(dropNearStraightRoute(from, [{ x: 150, y: 3 }], to)).toEqual([]);
  });

  it('точка, обходящая узел (60 px), сохраняется', () => {
    const inner = [{ x: 150, y: 60 }];
    expect(dropNearStraightRoute(from, inner, to)).toEqual(inner);
  });

  it('если хотя бы одна точка далеко — сохраняются все', () => {
    const inner = [{ x: 100, y: 2 }, { x: 200, y: 50 }];
    expect(dropNearStraightRoute(from, inner, to)).toEqual(inner);
  });

  it('наклонная линия: точка на ней отбрасывается', () => {
    expect(dropNearStraightRoute({ x: 0, y: 0 }, [{ x: 100, y: 101 }], { x: 200, y: 200 })).toEqual([]);
  });

  it('пустой маршрут и совпадающие концы не ломаются', () => {
    expect(dropNearStraightRoute(from, [], to)).toEqual([]);
    const inner = [{ x: 5, y: 5 }];
    expect(dropNearStraightRoute(from, inner, from)).toEqual(inner);
  });
});
