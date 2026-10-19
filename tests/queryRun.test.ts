import { describe, it, expect } from 'vitest';
import { createRunTracker, executeStatsQuery, type FinishInfo } from '../src/utils/queryRun';
import { replaceVariablesInSql } from '../src/lib/sqlUtils';

// Отмена и устаревшие запуски (п. 3.3). Выполнитель запросов — управляемая заглушка, времени и сети нет.

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('createRunTracker', () => {
  it('новый запуск активен, завершение снимает его и сообщает, остались ли другие', () => {
    const t = createRunTracker();
    const a = t.begin('1');
    expect(a.isActive()).toBe(true);
    expect(t.activeCount()).toBe(1);
    expect(a.finish()).toEqual({ wasActive: true, remaining: 0 });
    expect(a.isActive()).toBe(false);
    expect(a.finish()).toEqual({ wasActive: false, remaining: 0 }); // повторное завершение ничего не меняет
  });

  it('отмена прерывает signal и делает запуск устаревшим', () => {
    const t = createRunTracker();
    const a = t.begin('1');
    expect(a.signal.aborted).toBe(false);
    expect(t.cancelAll()).toBe(1);
    expect(a.signal.aborted).toBe(true);
    expect(a.isActive()).toBe(false);
    expect(t.activeCount()).toBe(0);
  });

  it('устаревший запуск не сообщает «был активен» и не мешает новому запуску', () => {
    const t = createRunTracker();
    const old = t.begin('1');
    t.cancelAll();
    const fresh = t.begin('1');
    const info = old.finish(); // старый запуск доработал уже после запуска нового
    expect(info).toEqual({ wasActive: false, remaining: 1 });
    expect(fresh.isActive()).toBe(true);
    expect(fresh.signal.aborted).toBe(false);
    expect(fresh.finish()).toEqual({ wasActive: true, remaining: 0 });
  });

  it('cancelScope отменяет только запуски своей вкладки', () => {
    const t = createRunTracker();
    const a = t.begin('1');
    const b = t.begin('2');
    expect(t.cancelScope('1')).toBe(1);
    expect(a.isActive()).toBe(false);
    expect(b.isActive()).toBe(true);
  });

  it('номера запусков растут', () => {
    const t = createRunTracker();
    const a = t.begin('1'); a.finish();
    const b = t.begin('1');
    expect(b.id).toBeGreaterThan(a.id);
  });
});

describe('executeStatsQuery', () => {
  const base = (over: Partial<Parameters<typeof executeStatsQuery>[1]> = {}) => {
    const tracker = createRunTracker();
    const calls: string[] = [];
    const finishes: FinishInfo[] = [];
    const starts: number[] = [];
    const deps = {
      tracker,
      scope: '1',
      substitute: (s: string) => s,
      execute: async (s: string) => { calls.push(s); return [{ ok: 1 }]; },
      cancelledMessage: 'cancelled',
      onStart: (i: { othersActive: number }) => { starts.push(i.othersActive); },
      onFinish: (i: FinishInfo) => { finishes.push(i); },
      ...over,
    };
    return { tracker, calls, finishes, starts, deps };
  };

  it('{{$param}} подставляется до выполнения, SQL берётся из контекста вкладки', async () => {
    const { deps, calls } = base({
      substitute: (s) => replaceVariablesInSql(s, '/* {{$n=5}} */ SELECT 1'),
    });
    await executeStatsQuery('SUMMARIZE (SELECT * FROM t LIMIT {{$n}})', deps);
    expect(calls).toEqual(['SUMMARIZE (SELECT * FROM t LIMIT 5)']);
  });

  it('секрет подставляется, ошибка хранилища не запускает запрос и не трогает состояние «выполняется»', async () => {
    const ok = base({ substitute: (s) => s.replace('{{key}}', 'abc') });
    await executeStatsQuery("SELECT '{{key}}'", ok.deps);
    expect(ok.calls).toEqual(["SELECT 'abc'"]);

    const locked = base({ substitute: () => { throw new Error('Хранилище ключей заблокировано'); } });
    await expect(executeStatsQuery('SELECT {{key}}', locked.deps)).rejects.toThrow('заблокировано');
    expect(locked.calls).toEqual([]);
    expect(locked.starts).toEqual([]);
    expect(locked.finishes).toEqual([]);
  });

  it('успех: onStart один раз, onFinish с wasActive и без остатка', async () => {
    const { deps, starts, finishes } = base();
    const rows = await executeStatsQuery('SELECT 1', deps);
    expect(rows).toEqual([{ ok: 1 }]);
    expect(starts).toEqual([0]);
    expect(finishes).toEqual([{ wasActive: true, remaining: 0 }]);
  });

  it('ошибка выполнения пробрасывается как есть, запуск снимается', async () => {
    const { deps, finishes, tracker } = base({ execute: async () => { throw new Error('syntax'); } });
    await expect(executeStatsQuery('SELECT', deps)).rejects.toThrow('syntax');
    expect(finishes).toEqual([{ wasActive: true, remaining: 0 }]);
    expect(tracker.activeCount()).toBe(0);
  });

  it('отмена во время выполнения: результат отбрасывается, сообщение об отмене, флаг не сбрасывается устаревшим запуском', async () => {
    const d = deferred<any[]>();
    const { deps, finishes, tracker } = base({ execute: () => d.promise });
    const p = executeStatsQuery('SELECT 1', deps);
    const settled = p.then(() => 'ok', (e) => String(e.message));
    expect(tracker.activeCount()).toBe(1);
    tracker.cancelAll();
    d.resolve([{ late: 1 }]); // движок, не поддерживающий отмену, всё равно вернул строки
    expect(await settled).toBe('cancelled');
    expect(finishes).toEqual([{ wasActive: false, remaining: 0 }]);
  });

  it('AbortError от fetch после отмены превращается в сообщение об отмене', async () => {
    const d = deferred<any[]>();
    const { deps, tracker } = base({ execute: (_s, signal) => { signal.addEventListener('abort', () => d.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); return d.promise; } });
    const p = executeStatsQuery('SELECT 1', deps).then(() => 'ok', (e) => String(e.message));
    tracker.cancelAll();
    expect(await p).toBe('cancelled');
  });

  it('старая статистика, доработавшая после отмены и нового запуска, не сбрасывает «выполняется» нового', async () => {
    const d = deferred<any[]>();
    const { deps, tracker, finishes } = base({ execute: () => d.promise });
    const p = executeStatsQuery('SELECT 1', deps).then(() => 'ok', (e) => String(e.message));
    tracker.cancelAll();
    const fresh = tracker.begin('1'); // пользователь успел запустить другой запрос
    d.resolve([]);
    await p;
    expect(finishes).toEqual([{ wasActive: false, remaining: 1 }]);
    expect(fresh.isActive()).toBe(true);
  });

  it('если уже идёт другой запуск, onStart сообщает о нём', async () => {
    const { deps, tracker, starts } = base();
    tracker.begin('2');
    await executeStatsQuery('SELECT 1', deps);
    expect(starts).toEqual([1]);
  });
});
