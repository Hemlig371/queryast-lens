import { describe, it, expect } from 'vitest';
import { selectRange, toggleColumn, formatSelectedColumns, reduceColumnClick } from '../src/utils/columnSelection';

const cols = ['a', 'b', 'c', 'd', 'e'];

describe('selectRange', () => {
  it('диапазон вперёд и назад даёт один и тот же порядок столбцов', () => {
    expect(selectRange(cols, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(selectRange(cols, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });
  it('якорь = цель → один столбец', () => {
    expect(selectRange(cols, 'c', 'c')).toEqual(['c']);
  });
  it('нет якоря или якоря нет в списке → только цель', () => {
    expect(selectRange(cols, null, 'c')).toEqual(['c']);
    expect(selectRange(cols, 'zzz', 'c')).toEqual(['c']);
  });
  it('цели нет в списке → пусто', () => {
    expect(selectRange(cols, 'a', 'zzz')).toEqual([]);
  });
});

describe('toggleColumn', () => {
  it('добавляет столбец вне диапазона, порядок как в результате', () => {
    expect(toggleColumn(cols, ['b', 'c'], 'e')).toEqual(['b', 'c', 'e']);
    expect(toggleColumn(cols, ['c', 'd'], 'a')).toEqual(['a', 'c', 'd']);
  });
  it('убирает столбец из середины диапазона', () => {
    expect(toggleColumn(cols, ['b', 'c', 'd'], 'c')).toEqual(['b', 'd']);
  });
  it('убирает последний → пусто; остаётся один → один', () => {
    expect(toggleColumn(cols, ['b'], 'b')).toEqual([]);
    expect(toggleColumn(cols, ['b', 'c'], 'b')).toEqual(['c']);
  });
  it('столбца нет в списке → выбор не меняется (без чужих имён)', () => {
    expect(toggleColumn(cols, ['b', 'zzz'], 'qqq')).toEqual(['b']);
  });
});

describe('formatSelectedColumns', () => {
  it('имена через запятую', () => {
    expect(formatSelectedColumns(['a', 'Период с'])).toBe('a, Период с');
  });
});


describe('reduceColumnClick (последовательности кликов)', () => {
  const none = { shiftKey: false, ctrlKey: false, metaKey: false };
  const shift = { shiftKey: true, ctrlKey: false, metaKey: false };
  const ctrl = { shiftKey: false, ctrlKey: true, metaKey: false };
  const cmd = { shiftKey: false, ctrlKey: false, metaKey: true };
  type S = { sel: string[]; anchor: string | null };
  const click = (st: S, mods: typeof none, col: string): S => {
    const r = reduceColumnClick(cols, st.sel, st.anchor, mods, col);
    return { sel: r.selection, anchor: r.anchor };
  };
  const start: S = { sel: [], anchor: null };

  it('клик b, Shift+d → диапазон b..d; якорь остаётся b', () => {
    let st = click(start, none, 'b');
    expect(st).toEqual({ sel: ['b'], anchor: 'b' });
    st = click(st, shift, 'd');
    expect(st).toEqual({ sel: ['b', 'c', 'd'], anchor: 'b' });
    st = click(st, shift, 'a');
    expect(st.sel).toEqual(['a', 'b']);
    expect(st.anchor).toBe('b');
  });

  it('Ctrl убирает столбец из середины диапазона и добавляет вне диапазона', () => {
    let st = click(click(start, none, 'b'), shift, 'd');
    st = click(st, ctrl, 'c');
    expect(st.sel).toEqual(['b', 'd']);
    st = click(st, ctrl, 'e');
    expect(st.sel).toEqual(['b', 'd', 'e']);
  });

  it('Cmd (macOS) работает как Ctrl', () => {
    let st = click(start, none, 'a');
    st = click(st, cmd, 'c');
    expect(st.sel).toEqual(['a', 'c']);
  });

  it('снимаем до одного → один столбец; до нуля → пусто', () => {
    let st = click(click(start, none, 'a'), ctrl, 'c');
    st = click(st, ctrl, 'a');
    expect(st.sel).toEqual(['c']);
    st = click(st, ctrl, 'c');
    expect(st.sel).toEqual([]);
  });

  it('Shift без выбора и без якоря → один столбец', () => {
    expect(click(start, shift, 'c')).toEqual({ sel: ['c'], anchor: 'c' });
  });

  it('якорь снят Ctrl-ом → Shift берёт диапазон от первого выбранного', () => {
    let st = click(click(start, none, 'b'), ctrl, 'd'); // b, d; якорь d
    st = click(st, ctrl, 'd');                          // убрали d → [b]; якорь d (вне выбора)
    st = click(st, shift, 'e');
    expect(st.sel).toEqual(['b', 'c', 'd', 'e']);
  });

  it('простой клик сбрасывает мультивыбор', () => {
    let st = click(click(start, none, 'a'), shift, 'c');
    st = click(st, none, 'e');
    expect(st).toEqual({ sel: ['e'], anchor: 'e' });
  });
});