import type { FileEntry, FileTreeProvider, Platform } from './fileTree';
import { vfsToEntries } from './fileTree';

/** Код ошибки из Rust-команды (`rename_path` и др.) → Error с этим кодом в message. */
function toError(e: unknown): Error {
  const s = typeof e === 'string' ? e : (e as any)?.message ?? '';
  const code = ['empty', 'invalid', 'exists', 'not_found'].find(c => s === c);
  return new Error(code || 'failed');
}

/** Tauri: список папки читает Rust-команда list_dir (размер и даты есть только там). */
export function createTauriProvider(
  invoke: <T>(cmd: string, args?: Record<string, any>) => Promise<T>,
  platform: Platform = 'linux',
): FileTreeProvider {
  return {
    kind: 'tauri',
    async list(path: string): Promise<FileEntry[]> {
      try {
        const res = await invoke<FileEntry[]>('list_dir', { path });
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
    ops: {
      platform,
      async reveal(path) {
        try { await invoke<void>('reveal_path', { path }); } catch (e) { throw toError(e); }
      },
      async openWith(path) {
        try { await invoke<void>('open_with', { path }); } catch (e) { throw toError(e); }
      },
      async rename(path, newName) {
        try { return await invoke<string>('rename_path', { path, newName }); } catch (e) { throw toError(e); }
      },
      async move(path, targetDir) {
        try { return await invoke<string>('move_path', { path, targetDir }); } catch (e) { throw toError(e); }
      },
      async trash(path) {
        try { await invoke<void>('trash_path', { path }); } catch (e) { throw toError(e); }
      },
    },
  };
}

/** dev (Express/AI Studio) и WASM/Android: плоский список виртуальной ФС DuckDB-WASM. */
export function createVfsProvider(getFiles: () => Promise<Array<{ name: string; size?: number; loadedAt?: Date }>>): FileTreeProvider {
  return {
    kind: 'vfs',
    async list(): Promise<FileEntry[]> {
      try {
        return vfsToEntries(await getFiles());
      } catch {
        return [];
      }
    },
  };
}
