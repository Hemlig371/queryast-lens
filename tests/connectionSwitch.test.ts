import { describe, it, expect } from 'vitest';
import { switchConnection, stateAfterSwitch, type ConnState } from '../src/utils/connectionSwitch';

// п. 3.7 (A-01, A-04): состояние подключения меняется только после успеха; при сбое прежнее подключение
// остаётся или восстанавливается. Бэкенд — управляемая заглушка (порядок вызовов записывается в журнал).

interface Conn { path: string; wasm: boolean }

class FakeBackend {
  log: string[] = [];
  current: Conn | null;
  /** Пути, которые не открываются. */
  broken = new Set<string>();
  /** Открытие того же файла при уже открытом соединении — ошибка (файловая блокировка DuckDB). */
  constructor(initial: Conn | null = null) { this.current = initial; }
  async close() { this.log.push('close'); this.current = null; }
  async open(path: string, { replaceOnSuccess }: { replaceOnSuccess: boolean }): Promise<Conn> {
    this.log.push(`open:${path}`);
    if (this.broken.has(path)) throw new Error(`cannot open ${path}`);
    if (this.current && !replaceOnSuccess) { /* старое уже закрыто вызывающим */ }
    if (this.current && this.current.path === path) throw new Error('file is locked by the previous connection');
    this.current = { path, wasm: false };
    return this.current;
  }
}

const plan = (b: FakeBackend, target: string, over: Partial<Parameters<typeof switchConnection<Conn>>[0]> = {}) => ({
  previous: b.current,
  openFirst: false,
  closeCurrent: () => b.close(),
  open: () => b.open(target, { replaceOnSuccess: false }),
  reopen: (prev: Conn) => {
    if (prev.path === ':memory:') return Promise.reject(new Error('in-memory database cannot be restored'));
    return b.open(prev.path, { replaceOnSuccess: false });
  },
  ...over,
});

describe('switchConnection', () => {
  it('нет прежнего подключения: просто открывает, ничего не закрывает', async () => {
    const b = new FakeBackend();
    const r = await switchConnection(plan(b, 'a.duckdb'));
    expect(r).toEqual({ ok: true, connection: { path: 'a.duckdb', wasm: false } });
    expect(b.log).toEqual(['open:a.duckdb']);
  });

  it('есть прежнее: сначала закрывается, потом открывается новое', async () => {
    const b = new FakeBackend({ path: 'old.duckdb', wasm: false });
    const r = await switchConnection(plan(b, 'new.duckdb'));
    expect(r.ok).toBe(true);
    expect(b.log).toEqual(['close', 'open:new.duckdb']);
  });

  it('сбой открытия: прежний файл открывается заново (восстановление), результат сообщает об этом', async () => {
    const b = new FakeBackend({ path: 'old.duckdb', wasm: false });
    b.broken.add('missing.duckdb');
    const r = await switchConnection(plan(b, 'missing.duckdb'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(String((r.error as Error).message)).toContain('missing.duckdb');
      expect(r.restored).toEqual({ path: 'old.duckdb', wasm: false });
      expect(r.previousStillOpen).toBe(false);
    }
    expect(b.log).toEqual(['close', 'open:missing.duckdb', 'open:old.duckdb']);
    expect(b.current?.path).toBe('old.duckdb');
  });

  it('сбой открытия, прежняя in-memory база не восстанавливается: restored = null и причина возвращена', async () => {
    const b = new FakeBackend({ path: ':memory:', wasm: false });
    b.broken.add('missing.duckdb');
    const r = await switchConnection(plan(b, 'missing.duckdb'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.restored).toBeNull();
      expect(r.restoreError).toBeInstanceOf(Error);
    }
  });

  it('openFirst: новое открывается без закрытия старого; при сбое старое не тронуто и не переоткрывается', async () => {
    const b = new FakeBackend({ path: 'old.duckdb', wasm: false });
    b.broken.add('missing.duckdb');
    const r = await switchConnection(plan(b, 'missing.duckdb', { openFirst: true }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.previousStillOpen).toBe(true);
      expect(r.restored).toBeNull();
    }
    expect(b.log).toEqual(['open:missing.duckdb']);
    expect(b.current?.path).toBe('old.duckdb');
  });

  it('openFirst: успех — старое отдельно не закрывается (его заменяет бэкенд)', async () => {
    const b = new FakeBackend({ path: 'old.duckdb', wasm: false });
    const r = await switchConnection(plan(b, 'new.duckdb', { openFirst: true }));
    expect(r.ok).toBe(true);
    expect(b.log).toEqual(['open:new.duckdb']);
  });

  it('ошибка закрытия старого не мешает открыть новое', async () => {
    const b = new FakeBackend({ path: 'old.duckdb', wasm: false });
    const r = await switchConnection(plan(b, 'new.duckdb', { closeCurrent: async () => { b.log.push('close'); throw new Error('close failed'); } }));
    expect(r.ok).toBe(true);
  });
});

describe('stateAfterSwitch: состояние меняется только после успеха', () => {
  const ch = { host: 'ch.local' };
  const duck: ConnState<typeof ch> = { duckDbPath: 'old.duckdb', wasm: false, clickhouse: null, engine: 'duckdb' };
  const chOnly: ConnState<typeof ch> = { duckDbPath: null, wasm: false, clickhouse: ch, engine: 'clickhouse' };
  const none: ConnState<typeof ch> = { duckDbPath: null, wasm: false, clickhouse: null, engine: 'duckdb' };
  const err = (e: unknown) => (e as Error).message;

  it('успех: DuckDB подключён, ClickHouse сброшен, движок duckdb, ошибки нет', () => {
    const r = stateAfterSwitch(chOnly, { ok: true, connection: { path: 'a.duckdb', wasm: false } }, err);
    expect(r.state).toEqual({ duckDbPath: 'a.duckdb', wasm: false, clickhouse: null, engine: 'duckdb' });
    expect(r.error).toBeNull();
    expect(r.resetResults).toBe(true);
  });

  it('успех из «ничего не подключено»: результаты не сбрасываются', () => {
    const r = stateAfterSwitch(none, { ok: true, connection: { path: ':memory:', wasm: true } }, err);
    expect(r.state.wasm).toBe(true);
    expect(r.resetResults).toBe(false);
  });

  it('сбой при подключённом ClickHouse: ClickHouse и движок остаются, показана ошибка', () => {
    const r = stateAfterSwitch(chOnly, { ok: false, error: new Error('нет файла'), restored: null, previousStillOpen: false }, err);
    expect(r.state).toEqual(chOnly);
    expect(r.error).toBe('нет файла');
    expect(r.resetResults).toBe(false);
  });

  it('сбой, прежний DuckDB остался открытым или восстановлен: состояние прежнее', () => {
    const still = stateAfterSwitch(duck, { ok: false, error: new Error('x'), restored: null, previousStillOpen: true }, err);
    expect(still.state).toEqual(duck);
    const restored = stateAfterSwitch(duck, { ok: false, error: new Error('x'), restored: { path: 'old.duckdb', wasm: false }, previousStillOpen: false }, err);
    expect(restored.state).toEqual(duck);
    expect(restored.resetResults).toBe(false);
  });

  it('сбой, прежний DuckDB потерян: отключённое состояние и сброс результатов, ошибка остаётся', () => {
    const r = stateAfterSwitch(duck, { ok: false, error: new Error('x'), restored: null, restoreError: new Error('r'), previousStillOpen: false }, err);
    expect(r.state).toEqual({ duckDbPath: null, wasm: false, clickhouse: null, engine: 'duckdb' });
    expect(r.error).toBe('x');
    expect(r.resetResults).toBe(true);
  });

  it('сбой при «ничего не подключено»: состояние прежнее', () => {
    const r = stateAfterSwitch(none, { ok: false, error: new Error('x'), restored: null, previousStillOpen: false }, err);
    expect(r.state).toEqual(none);
  });
});

// Страховка от возврата прежней схемы (путь от process.cwd())
import fs from 'node:fs';
import path from 'node:path';
describe('App.tsx: подключения', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  it('пункты меню подключения не меняют ClickHouse и движок до подключения', () => {
    expect(src).not.toMatch(/setClickhouseConfig\(null\);\s*setActiveEngine\('duckdb'\);\s*handle(ConfigureDuckDb|CreateDuckDbFile|ConnectInMemory)\(\)/);
    expect(src).not.toMatch(/handleDisconnectDuckDb\(\);\s*\}\s*setActiveEngine\('clickhouse'\);\s*setShowClickhouseModal\(true\)/);
  });
  it('подключения идут через connectDuckDb / switchConnection', () => {
    expect(src).toContain('switchConnection<DuckDbConn>(');
  });
});
