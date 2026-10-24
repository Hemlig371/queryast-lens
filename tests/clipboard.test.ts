import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyTextWith } from '../src/utils/clipboard';

const ok = async () => {};
const fail = (msg: string) => async () => { throw new Error(msg); };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('copyTextWith', () => {
  it('веб-путь удался → true, текст передан как есть', async () => {
    const web = vi.fn(ok);
    expect(await copyTextWith('привет', { isTauri: false, tauriWrite: fail('не должен вызываться'), webWrite: web })).toBe(true);
    expect(web).toHaveBeenCalledWith('привет');
  });

  it('веб-путь отказал → false', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await copyTextWith('x', { isTauri: false, tauriWrite: ok, webWrite: fail('NotAllowedError') })).toBe(false);
  });

  it('Tauri-путь удался → true, веб-путь не используется', async () => {
    const tauri = vi.fn(ok);
    const web = vi.fn(ok);
    expect(await copyTextWith('x', { isTauri: true, tauriWrite: tauri, webWrite: web })).toBe(true);
    expect(tauri).toHaveBeenCalledWith('x');
    expect(web).not.toHaveBeenCalled();
  });

  it('сбой Tauri-пути, запасной веб-путь удался → true', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const web = vi.fn(ok);
    expect(await copyTextWith('x', { isTauri: true, tauriWrite: fail('ipc'), webWrite: web })).toBe(true);
    expect(web).toHaveBeenCalledTimes(1);
  });

  it('сбой обоих путей → false', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await copyTextWith('x', { isTauri: true, tauriWrite: fail('ipc'), webWrite: fail('denied') })).toBe(false);
  });

  it('синхронное исключение в веб-пути (нет navigator.clipboard) → false, а не исключение', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const web = (() => { throw new TypeError('undefined is not an object'); }) as unknown as (t: string) => Promise<void>;
    expect(await copyTextWith('x', { isTauri: false, tauriWrite: ok, webWrite: web })).toBe(false);
  });
});
