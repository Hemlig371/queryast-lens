import type { FileEntry, FileTreeProvider } from './fileTree';
import { vfsToEntries } from './fileTree';

/** Tauri: список папки читает Rust-команда list_dir (размер и даты есть только там). */
export function createTauriProvider(invoke: <T>(cmd: string, args?: Record<string, any>) => Promise<T>): FileTreeProvider {
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
