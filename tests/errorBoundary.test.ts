import { describe, it, expect } from 'vitest';
import {
  boundaryErrorState,
  deriveBoundaryState,
  initialBoundaryState,
} from '../src/utils/errorBoundaryState';

describe('состояние ErrorBoundary (без отрисовки)', () => {
  it('начальное состояние без ошибки и с ключом', () => {
    expect(initialBoundaryState('tab-1')).toEqual({ hasError: false, error: null, resetKey: 'tab-1' });
  });

  it('ошибка потомка переводит в состояние ошибки', () => {
    const err = new Error('boom');
    expect(boundaryErrorState(err)).toEqual({ hasError: true, error: err });
  });

  it('тот же ключ — состояние не меняется (ошибка остаётся на экране)', () => {
    const state = { ...boundaryErrorState(new Error('x')), resetKey: 'tab-1' };
    expect(deriveBoundaryState('tab-1', state)).toBeNull();
  });

  it('смена ключа при ошибке снимает экран ошибки', () => {
    const state = { ...boundaryErrorState(new Error('x')), resetKey: 'tab-1' };
    expect(deriveBoundaryState('tab-2', state)).toEqual({ hasError: false, error: null, resetKey: 'tab-2' });
  });

  it('смена ключа без ошибки только запоминает новый ключ', () => {
    expect(deriveBoundaryState('tab-2', initialBoundaryState('tab-1'))).toEqual({ resetKey: 'tab-2' });
  });

  it('без ключа (resetKey не передан) автосброса нет', () => {
    const state = { ...boundaryErrorState(new Error('x')), resetKey: undefined };
    expect(deriveBoundaryState(undefined, state)).toBeNull();
  });

  it('после ошибки и смены ключа новая ошибка снова показывается', () => {
    let state = initialBoundaryState('tab-1');
    state = { ...state, ...boundaryErrorState(new Error('a')) };
    state = { ...state, ...(deriveBoundaryState('tab-2', state) ?? {}) };
    expect(state.hasError).toBe(false);
    state = { ...state, ...boundaryErrorState(new Error('b')) };
    expect(state.hasError).toBe(true);
    expect(deriveBoundaryState('tab-2', state)).toBeNull();
  });
});

// Статические методы самого компонента: подгружаются динамически, чтобы тесты чистой логики выше
// не зависели от установки react / lucide-react.
describe('ErrorBoundary: статические методы компонента', () => {
  it('getDerivedStateFromError возвращает состояние ошибки', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary');
    const err = new Error('boom');
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ hasError: true, error: err });
  });

  it('getDerivedStateFromProps сбрасывает ошибку при смене resetKey', async () => {
    const { ErrorBoundary } = await import('../src/components/ErrorBoundary');
    const state = { hasError: true, error: new Error('x'), resetKey: 'a' };
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: 'a' }, state)).toBeNull();
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: 'b' }, state)).toEqual({
      hasError: false,
      error: null,
      resetKey: 'b',
    });
  });
});
