import { describe, it, expect } from 'vitest';
import {
  qualifiersIn,
  pickJoinParent,
  firstKnownQualifier,
  joinEdgeLabel,
  columnsByAlias,
  conditionChipTexts,
  countSources,
} from '../src/utils/joinTree';

describe('joinTree helpers', () => {
  describe('qualifiersIn', () => {
    it('алиасы в порядке упоминания', () => {
      expect(qualifiersIn('c.id = o.customer_id')).toEqual(['c', 'o']);
    });
    it('строковые литералы игнорируются', () => {
      expect(qualifiersIn("x.a = 'b.c' AND y.d = 1")).toEqual(['x', 'y']);
    });
    it('кавычки идентификаторов', () => {
      expect(qualifiersIn('"c"."id" = `o`.`customer_id`')).toEqual(['c', 'o']);
    });
    it('числа с точкой не принимаются за алиас', () => {
      expect(qualifiersIn('a.price > 1.5')).toEqual(['a']);
    });
  });

  describe('pickJoinParent', () => {
    const known = new Map([['o', 'N_o'], ['c', 'N_c'], ['i', 'N_i']]);
    it('первый ранее объявленный алиас из ON, не сам источник', () => {
      expect(pickJoinParent('p.id = i.product_id', ['p'], known, 'N_o')).toBe('N_i');
      expect(pickJoinParent('i.order_id = o.id', ['i'], known, 'N_o')).toBe('N_o');
    });
    it('свой алиас пропускается, даже если он упомянут первым', () => {
      expect(pickJoinParent('c.id = o.customer_id', ['c'], new Map([['o', 'N_o'], ['c', 'N_c']]), 'ROOT')).toBe('N_o');
    });
    it('без известного алиаса — корень', () => {
      expect(pickJoinParent('', ['x'], known, 'ROOT')).toBe('ROOT');
      expect(pickJoinParent('x.id = zz.id', ['x'], known, 'ROOT')).toBe('ROOT');
    });
    it('регистр алиасов не важен', () => {
      expect(pickJoinParent('I.order_id = O.id', ['I'], known, 'ROOT')).toBe('N_o');
    });
  });

  describe('firstKnownQualifier', () => {
    const known = new Map([['a', 'N_a'], ['b', 'N_b']]);
    it('возвращает первый известный алиас как он написан', () => {
      expect(firstKnownQualifier('zz.x = B.y AND a.z = 1', known)).toEqual({ alias: 'B', nodeId: 'N_b' });
    });
    it('null, если алиасов нет', () => {
      expect(firstKnownQualifier('x > 1', known)).toBeNull();
    });
  });

  describe('joinEdgeLabel', () => {
    it('тип и условие', () => {
      expect(joinEdgeLabel('LEFT JOIN', 'a.x = b.y')).toBe('LEFT JOIN · a.x = b.y');
    });
    it('без условия — только тип', () => {
      expect(joinEdgeLabel('COMMA JOIN', 'NO CONDITION (CROSS)')).toBe('COMMA JOIN');
      expect(joinEdgeLabel('CROSS JOIN', '')).toBe('CROSS JOIN');
    });
    it('длинная подпись обрезается с многоточием', () => {
      const label = joinEdgeLabel('INNER JOIN', 'a.x = b.y AND ' + 'c.zz = d.zz AND '.repeat(10));
      expect(label.length).toBeLessThan(90);
      expect(label.endsWith('…')).toBe(true);
    });
    it('переводы строк и повторные пробелы схлопываются', () => {
      expect(joinEdgeLabel('JOIN', 'a.x =\n   b.y')).toBe('JOIN · a.x = b.y');
    });
  });

  describe('columnsByAlias', () => {
    const known = new Map([['o', 'N_o'], ['c', 'N_c'], ['t', 'N_t']]);
    it('колонки по алиасам в порядке первого упоминания, без повторов', () => {
      const res = columnsByAlias(['o.id, o.name, c.x', 'c.x = o.id', "o.status = 'a.b'", 'O.ID'], known);
      expect(res.get('N_o')).toEqual(['id', 'name', 'status']);
      expect(res.get('N_c')).toEqual(['x']);
    });
    it('alias.* попадает как *', () => {
      expect(columnsByAlias(['o.*'], known).get('N_o')).toEqual(['*']);
    });
    it('цепочка schema.table.column: алиасом считается table', () => {
      const res = columnsByAlias(['s.t.col'], known);
      expect(res.get('N_t')).toEqual(['col']);
      expect(res.has('N_o')).toBe(false);
    });
    it('неизвестные алиасы и колонки без алиаса игнорируются', () => {
      expect(columnsByAlias(['zz.a, plain_col, f(x)'], known).size).toBe(0);
    });
  });

  describe('conditionChipTexts', () => {
    it('части по AND без префикса', () => {
      expect(conditionChipTexts([{ name: 'a = 1' }, { name: 'AND b = 2' }], 'a = 1 AND b = 2')).toEqual(['a = 1', 'b = 2']);
    });
    it('при OR условие остаётся одним чипом', () => {
      expect(conditionChipTexts([{ name: 'a = 1' }, { name: 'OR b = 2' }], 'a = 1 OR b = 2')).toEqual(['a = 1 OR b = 2']);
    });
    it('пробельные символы схлопываются', () => {
      expect(conditionChipTexts([{ name: 'EXISTS (SELECT 1\n   FROM t)' }], 'x')).toEqual(['EXISTS (SELECT 1 FROM t)']);
    });
  });

  describe('countSources', () => {
    it('элементы FROM; для UNION — сумма по частям', () => {
      expect(countSources({ type: 'select', from: [{}, {}] })).toBe(2);
      expect(countSources({ type: 'union', queries: [{ type: 'select', from: [{}] }, { type: 'select', from: [{}, {}] }] })).toBe(3);
      expect(countSources(null)).toBe(0);
      expect(countSources({ type: 'select' })).toBe(0);
    });
  });
});
