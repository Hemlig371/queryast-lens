// Логика состояния ErrorBoundary без React: проверяется юнит-тестами без отрисовки.

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  /** Ключ документа/вкладки, для которого ErrorBoundary показывает содержимое (см. свойство resetKey). */
  resetKey?: unknown;
}

export const initialBoundaryState = (resetKey?: unknown): ErrorBoundaryState => ({
  hasError: false,
  error: null,
  resetKey,
});

/** Состояние после ошибки отрисовки потомка (resetKey не трогаем: его ведёт deriveBoundaryState). */
export const boundaryErrorState = (error: Error): Pick<ErrorBoundaryState, 'hasError' | 'error'> => ({
  hasError: true,
  error,
});

/**
 * Автосброс по ключу: если ключ сменился (другая вкладка, другой документ), экран ошибки снимается.
 * Возвращает null, когда состояние менять не нужно.
 */
export const deriveBoundaryState = (
  nextResetKey: unknown,
  state: ErrorBoundaryState,
): Partial<ErrorBoundaryState> | null => {
  if (Object.is(nextResetKey, state.resetKey)) return null;
  return state.hasError
    ? { hasError: false, error: null, resetKey: nextResetKey }
    : { resetKey: nextResetKey };
};
