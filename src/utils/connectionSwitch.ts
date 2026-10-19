// Переключение подключения DuckDB (п. 3.7, A-01/A-04): состояние интерфейса меняется только после успешного подключения.

export interface SwitchPlan<T> {
  /** Текущее подключение DuckDB (null — его нет, например подключён только ClickHouse). */
  previous: T | null;
  /**
   * Открыть новое подключение, не закрывая старое: бэкенд сам заменяет его при успехе (Tauri connect_db),
   * а при сбое старое остаётся нетронутым. Допустимо только для другого файла (тот же файл заблокирован старым подключением).
   */
  openFirst: boolean;
  closeCurrent: () => Promise<void>;
  open: () => Promise<T>;
  /** Открыть прежнее подключение заново; бросает, если его нельзя восстановить (in-memory база, файл браузера). */
  reopen: (previous: T) => Promise<T>;
}

export type SwitchResult<T> =
  | { ok: true; connection: T }
  | {
      ok: false;
      error: unknown;
      /** Прежнее подключение открыто заново. */
      restored: T | null;
      restoreError?: unknown;
      /** Прежнее подключение вообще не закрывалось (openFirst). */
      previousStillOpen: boolean;
    };

export async function switchConnection<T>(plan: SwitchPlan<T>): Promise<SwitchResult<T>> {
  const closeFirst = plan.previous !== null && !plan.openFirst;
  if (closeFirst) {
    try {
      await plan.closeCurrent();
    } catch (e) {
      console.warn('Closing the previous DuckDB connection failed', e);
    }
  }
  try {
    const connection = await plan.open();
    return { ok: true, connection };
  } catch (error) {
    if (!closeFirst) {
      return { ok: false, error, restored: null, previousStillOpen: plan.previous !== null };
    }
    try {
      const restored = await plan.reopen(plan.previous as T);
      return { ok: false, error, restored, previousStillOpen: false };
    } catch (restoreError) {
      return { ok: false, error, restored: null, restoreError, previousStillOpen: false };
    }
  }
}

export interface ConnState<C> {
  duckDbPath: string | null;
  wasm: boolean;
  clickhouse: C | null;
  engine: 'duckdb' | 'clickhouse';
}

export interface StateAfterSwitch<C> {
  state: ConnState<C>;
  error: string | null;
  /** Панель результатов нужно очистить (подключение сменилось или потеряно). */
  resetResults: boolean;
}

/** Новое состояние подключения по итогу переключения. */
export function stateAfterSwitch<C, T extends { path: string; wasm: boolean }>(
  prev: ConnState<C>,
  result: SwitchResult<T>,
  errorText: (error: unknown) => string
): StateAfterSwitch<C> {
  const hadAny = prev.duckDbPath !== null || prev.clickhouse !== null;
  if (result.ok === true) {
    return {
      state: { duckDbPath: result.connection.path, wasm: result.connection.wasm, clickhouse: null, engine: 'duckdb' },
      error: null,
      resetResults: hadAny,
    };
  }
  const error = errorText(result.error);
  const hadDuckDb = prev.duckDbPath !== null;
  if (hadDuckDb && !result.previousStillOpen && result.restored === null) {
    // прежнее подключение закрыто и не восстановлено: интерфейс должен показывать, что подключения нет
    return {
      state: { duckDbPath: null, wasm: false, clickhouse: prev.clickhouse, engine: prev.clickhouse ? prev.engine : 'duckdb' },
      error,
      resetResults: true,
    };
  }
  return { state: prev, error, resetResults: false };
}
