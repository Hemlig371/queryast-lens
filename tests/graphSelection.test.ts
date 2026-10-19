import { describe, it, expect } from 'vitest';
import { reconcileSelectedNodeId, findSelectedNode, defaultSelectedNodeId } from '../src/utils/graphSelection';

// п. 3.8 (D-01): выбранный узел хранится как id и ищется в актуальном списке узлов.

const n = (id: string, label = id) => ({ id, type: 'tableNode', data: { label } });

describe('defaultSelectedNodeId', () => {
  it('узел результата (id оканчивается на result) предпочтительнее первого', () => {
    expect(defaultSelectedNodeId([n('main_t1'), n('main_result'), n('main_t2')])).toBe('main_result');
  });
  it('нет узла результата: первый узел', () => {
    expect(defaultSelectedNodeId([n('a'), n('b')])).toBe('a');
  });
  it('пустой список: null', () => {
    expect(defaultSelectedNodeId([])).toBeNull();
  });
});

describe('reconcileSelectedNodeId', () => {
  it('ничего не выбрано: выбирается узел по умолчанию', () => {
    expect(reconcileSelectedNodeId(null, [n('x'), n('main_result')])).toBe('main_result');
  });
  it('выбранный узел есть в новом графе: выбор сохраняется', () => {
    expect(reconcileSelectedNodeId('main_t1', [n('main_t1'), n('main_result')])).toBe('main_t1');
  });
  it('выбранного узла в новом графе нет: выбирается узел по умолчанию, а не остаётся «висеть» старый', () => {
    expect(reconcileSelectedNodeId('gone', [n('main_t1'), n('main_result')])).toBe('main_result');
  });
  it('граф пуст: выбора нет', () => {
    expect(reconcileSelectedNodeId('main_t1', [])).toBeNull();
    expect(reconcileSelectedNodeId(null, [])).toBeNull();
  });
});

describe('findSelectedNode', () => {
  it('возвращает актуальный объект узла, а не тот, что был при выборе', () => {
    const before = [n('main_t1', 'старая подпись')];
    const selectedId = 'main_t1';
    expect(findSelectedNode(before, selectedId)?.data.label).toBe('старая подпись');
    const after = [n('main_t1', 'новая подпись'), n('main_result')];
    expect(findSelectedNode(after, selectedId)?.data.label).toBe('новая подпись');
  });
  it('нет id или узла: null', () => {
    expect(findSelectedNode([n('a')], null)).toBeNull();
    expect(findSelectedNode([n('a')], 'b')).toBeNull();
  });
});
