import { describe, it, expect } from 'vitest';
import { isNodePropsEqual } from '../src/utils/nodePropsEqual';

describe('isNodePropsEqual (мемоизация узлов графа, в том числе ConstantNode)', () => {
  it('одинаковые данные (разные объекты) — равны', () => {
    expect(isNodePropsEqual({ data: { title: 'CONSTANT', details: 'SELECT 1' } }, { data: { title: 'CONSTANT', details: 'SELECT 1' } })).toBe(true);
  });
  it('тот же объект data — равны', () => {
    const data = { details: 'x' };
    expect(isNodePropsEqual({ data }, { data })).toBe(true);
  });
  it('другое значение в data — не равны', () => {
    expect(isNodePropsEqual({ data: { details: 'a' } }, { data: { details: 'b' } })).toBe(false);
  });
  it('другое число ключей — не равны', () => {
    expect(isNodePropsEqual({ data: { a: 1 } }, { data: { a: 1, b: 2 } })).toBe(false);
  });
  it('изменилось выделение — не равны', () => {
    expect(isNodePropsEqual({ data: { a: 1 }, selected: false }, { data: { a: 1 }, selected: true })).toBe(false);
  });
  it('изменилась позиция точек подключения — не равны', () => {
    expect(isNodePropsEqual({ data: {}, targetPosition: 'left' }, { data: {}, targetPosition: 'top' })).toBe(false);
    expect(isNodePropsEqual({ data: {}, sourcePosition: 'right' }, { data: {}, sourcePosition: 'bottom' })).toBe(false);
  });
  it('data отсутствует: равны только когда обе пустые одинаково', () => {
    expect(isNodePropsEqual({ data: null }, { data: null })).toBe(true);
    expect(isNodePropsEqual({ data: null }, { data: {} })).toBe(false);
  });
  it('вложенные объекты сравниваются по ссылке (поверхностно)', () => {
    expect(isNodePropsEqual({ data: { columns: [1] } }, { data: { columns: [1] } })).toBe(false);
    const columns = [1];
    expect(isNodePropsEqual({ data: { columns } }, { data: { columns } })).toBe(true);
  });
});
