import { describe, it, expect, vi } from 'vitest';
import { takeTableRows } from '../src/utils/arrowRows';

function fakeTable(n: number) {
  const get = vi.fn((i: number) => ({ id: i }));
  const toArray = vi.fn(() => Array.from({ length: n }, (_, i) => ({ id: i })));
  return { numRows: n, get, toArray };
}

describe('takeTableRows', () => {
  it('берёт все строки, если их меньше предела', () => {
    const t = fakeTable(3);
    expect(takeTableRows(t, 10)).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
  });

  it('усекает до предела и обращается только к нужным строкам', () => {
    const t = fakeTable(600000);
    const rows = takeTableRows(t, 500000);
    expect(rows.length).toBe(500000);
    expect(t.get).toHaveBeenCalledTimes(500000);
    expect(t.toArray).not.toHaveBeenCalled();
  });

  it('пустая таблица', () => {
    expect(takeTableRows(fakeTable(0), 5)).toEqual([]);
  });

  it('пустые (null) строки пропускаются', () => {
    const t = { numRows: 3, get: (i: number) => (i === 1 ? null : { id: i }) };
    expect(takeTableRows(t, 10)).toEqual([{ id: 0 }, { id: 2 }]);
  });
});
