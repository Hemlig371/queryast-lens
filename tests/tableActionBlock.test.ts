import { describe, it, expect } from 'vitest';
import { appendTableActionBlock, TABLE_ACTION_SEPARATOR, type TableActionBlock } from '../src/utils/tableActionBlock';

// Этап E плана 32: действия над таблицей дописывают блок в конец вкладки; сортировка и фильтр подряд заменяют друг друга.
const SEP = TABLE_ACTION_SEPARATOR;

describe('appendTableActionBlock', () => {
  it('разделитель — пустая строка, /* ------ */, перевод строки', () => {
    expect(SEP).toBe('\n\n/* ------ */\n');
  });

  it('первое действие дописывает блок в конец и запоминает его начало и текст', () => {
    const r = appendTableActionBlock('SELECT * FROM t', 'SELECT 1 /*s1*/', 'sort');
    expect(r.sql).toBe('SELECT * FROM t' + SEP + 'SELECT 1 /*s1*/');
    expect(r.replaced).toBe(false);
    expect(r.block).toEqual({ kind: 'sort', start: 'SELECT * FROM t'.length, text: SEP + 'SELECT 1 /*s1*/' });
    expect(r.sql.slice(r.block.start)).toBe(r.block.text);
  });

  it('последовательные сортировки и фильтр заменяют последний блок; текст выше не меняется', () => {
    const base = '-- мой запрос\nSELECT * FROM t;\n';
    const a = appendTableActionBlock(base, 'SORT 1', 'sort');
    const b = appendTableActionBlock(a.sql, 'SORT 2', 'sort', a.block);
    const c = appendTableActionBlock(b.sql, 'FILTER 1', 'filter', b.block);
    const d = appendTableActionBlock(c.sql, 'SORT 3', 'sort', c.block);
    expect(b.replaced && c.replaced && d.replaced).toBe(true);
    expect(d.sql).toBe(base + SEP + 'SORT 3');
    expect(d.sql.startsWith(base)).toBe(true);
    expect(d.sql.split('/* ------ */').length).toBe(2);
  });

  it('группировка, «оставить», «удалить», distinct никогда не заменяются и дают новый блок', () => {
    let state = appendTableActionBlock('SELECT 1', 'G1', 'group');
    const second = appendTableActionBlock(state.sql, 'G2', 'group', state.block);
    expect(second.replaced).toBe(false);
    expect(second.sql).toBe('SELECT 1' + SEP + 'G1' + SEP + 'G2');
    for (const kind of ['keep', 'remove', 'distinct'] as const) {
      const prev = appendTableActionBlock('Q', 'X', 'sort');
      const next = appendTableActionBlock(prev.sql, 'Y', kind, prev.block);
      expect(next.replaced).toBe(false);
      expect(next.sql).toBe('Q' + SEP + 'X' + SEP + 'Y');
    }
  });

  it('сортировка после группировки дописывает новый блок, а следующий фильтр заменяет сортировку, но не группировку', () => {
    const g = appendTableActionBlock('Q', 'GROUP', 'group');
    const s = appendTableActionBlock(g.sql, 'SORT', 'sort', g.block);
    const f = appendTableActionBlock(s.sql, 'FILTER', 'filter', s.block);
    expect(s.replaced).toBe(false);
    expect(f.replaced).toBe(true);
    expect(f.sql).toBe('Q' + SEP + 'GROUP' + SEP + 'FILTER');
  });

  it('если пользователь правил блок или печатал под ним, дописывается новый блок', () => {
    const a = appendTableActionBlock('Q', 'SORT 1', 'sort');
    const edited = a.sql.replace('SORT 1', 'SORT 1 -- моя правка');
    const r1 = appendTableActionBlock(edited, 'SORT 2', 'sort', a.block);
    expect(r1.replaced).toBe(false);
    expect(r1.sql).toBe(edited + SEP + 'SORT 2');
    const typedBelow = a.sql + '\nSELECT 42;';
    const r2 = appendTableActionBlock(typedBelow, 'SORT 2', 'sort', a.block);
    expect(r2.replaced).toBe(false);
    expect(r2.sql).toBe(typedBelow + SEP + 'SORT 2');
  });

  it('если текст выше блока изменился (сдвиг начала), блок не находится и дописывается новый', () => {
    const a = appendTableActionBlock('Q', 'SORT 1', 'sort');
    const shifted = '-- добавили строку\n' + a.sql;
    const r = appendTableActionBlock(shifted, 'SORT 2', 'sort', a.block);
    expect(r.replaced).toBe(false);
    expect(r.sql).toBe(shifted + SEP + 'SORT 2');
  });

  it('запомненного блока нет или он испорчен: новый блок в конец', () => {
    expect(appendTableActionBlock('Q', 'S', 'sort', null).sql).toBe('Q' + SEP + 'S');
    expect(appendTableActionBlock('Q', 'S', 'sort', undefined).replaced).toBe(false);
    const bad: TableActionBlock = { kind: 'sort', start: 999, text: 'x' };
    expect(appendTableActionBlock('Q', 'S', 'sort', bad).sql).toBe('Q' + SEP + 'S');
    const neg: TableActionBlock = { kind: 'sort', start: -1, text: 'Q' };
    expect(appendTableActionBlock('Q', 'S', 'sort', neg).replaced).toBe(false);
  });

  it('пустая вкладка: блок без разделителя, начало 0', () => {
    const r = appendTableActionBlock('  \n', 'SELECT 1', 'sort');
    expect(r.sql).toBe('SELECT 1');
    expect(r.block).toEqual({ kind: 'sort', start: 0, text: 'SELECT 1' });
    const again = appendTableActionBlock(r.sql, 'SELECT 2', 'filter', r.block);
    expect(again.replaced).toBe(true);
    expect(again.sql).toBe('SELECT 2');
  });

  it('блок, оставшийся единственным текстом, заменяется целиком вместе с разделителем', () => {
    const a = appendTableActionBlock('Q', 'S1', 'filter');
    const b = appendTableActionBlock(a.sql, 'S2', 'sort', a.block);
    expect(b.sql).toBe('Q' + SEP + 'S2');
    expect(b.block.start).toBe(1);
  });
});
