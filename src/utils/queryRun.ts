// Учёт запусков запросов и отмена (п. 3.3, находки B-05/B-06).
//
// Раньше отмена обнуляла общий AbortController и флаг «выполняется», но запрос в Tauri/WASM продолжал работать и по
// окончании записывал результат вкладки; завершившийся «старый» запрос сбрасывал флаг уже нового запуска и обнулял его
// AbortController. Здесь каждый запуск получает собственный handle: после отмены он «устаревший» — его результат и
// сброс флага вызывающий обязан игнорировать (`isActive()` / `finish().wasActive`).

export interface FinishInfo {
  /** Запуск не был отменён и не завершался раньше: только тогда вызывающий вправе менять состояние интерфейса. */
  wasActive: boolean;
  /** Сколько других запусков ещё активно. */
  remaining: number;
}

export interface RunHandle {
  readonly id: number;
  readonly scope: string;
  readonly signal: AbortSignal;
  isActive(): boolean;
  /** Идемпотентно. */
  finish(): FinishInfo;
}

export interface RunTracker {
  begin(scope: string): RunHandle;
  /** Отменяет все активные запуски; возвращает их число. */
  cancelAll(): number;
  /** Отменяет активные запуски одной вкладки. */
  cancelScope(scope: string): number;
  activeCount(): number;
}

export function createRunTracker(): RunTracker {
  let nextId = 1;
  const active = new Map<number, { scope: string; controller: AbortController }>();

  const cancelWhere = (pred: (scope: string) => boolean): number => {
    let n = 0;
    for (const [id, run] of Array.from(active.entries())) {
      if (!pred(run.scope)) continue;
      active.delete(id);
      run.controller.abort();
      n++;
    }
    return n;
  };

  return {
    begin(scope) {
      const id = nextId++;
      const controller = new AbortController();
      active.set(id, { scope, controller });
      return {
        id,
        scope,
        signal: controller.signal,
        isActive: () => active.has(id),
        finish: () => {
          const wasActive = active.delete(id);
          return { wasActive, remaining: active.size };
        },
      };
    },
    cancelAll: () => cancelWhere(() => true),
    cancelScope: (scope) => cancelWhere((s) => s === scope),
    activeCount: () => active.size,
  };
}

export interface StatsQueryDeps {
  tracker: RunTracker;
  /** Вкладка, из которой запрошена статистика. */
  scope: string;
  /** Подстановка {{$переменных}} и секретов; может бросить (хранилище заблокировано) — тогда запрос не запускается. */
  substitute: (sql: string) => string;
  execute: (sql: string, signal: AbortSignal) => Promise<any[]>;
  cancelledMessage: string;
  onStart?: (info: { othersActive: number }) => void;
  onFinish?: (info: FinishInfo) => void;
}

/** Служебный запрос статистики (SUMMARIZE, распределения, ATTACH …) с подстановкой параметров и общей отменой. */
export async function executeStatsQuery(sql: string, deps: StatsQueryDeps): Promise<any[]> {
  const prepared = deps.substitute(sql);
  const othersActive = deps.tracker.activeCount();
  const run = deps.tracker.begin(deps.scope);
  deps.onStart?.({ othersActive });
  try {
    const rows = await deps.execute(prepared, run.signal);
    if (!run.isActive()) throw new Error(deps.cancelledMessage);
    return rows;
  } catch (err: any) {
    if (!run.isActive() || err?.name === 'AbortError') throw new Error(deps.cancelledMessage);
    throw err;
  } finally {
    deps.onFinish?.(run.finish());
  }
}
