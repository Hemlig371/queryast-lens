// Чистые функции для виртуальных файлов DuckDB-WASM.

import { splitSqlSegments } from './sqlTokens';

const SYSTEM_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'server.ts',
  'index.html',
  'components.json',
]);
const SYSTEM_DIRS = ['node_modules/', 'dist/', 'src/', 'public/'];

/**
 * Файл проекта, а не пользовательские данные (его возвращает glob серверного dev-режима).
 * Скрываются только каталоги проекта (имя начинается с `src/` и т. п.), а не любые имена с таким префиксом:
 * `source.parquet`, `distance.csv`, `public_2024.csv` — пользовательские данные. Скрытые файлы (`.env`), `*.js` и `*.lock` тоже скрыты.
 */
export function isSystemVfsFile(filename: string): boolean {
  const f = (filename || '').replace(/\\/g, '/').toLowerCase();
  if (f.startsWith('.')) return true;
  if (SYSTEM_NAMES.has(f)) return true;
  if (SYSTEM_DIRS.some((d) => f.startsWith(d))) return true;
  return f.endsWith('.js') || f.endsWith('.lock');
}

/** Содержимое строкового литерала без внешних кавычек; удвоенная кавычка внутри превращается в одну. */
function unquote(text: string): string {
  const q = text[0];
  const closed = text.length >= 2 && text[text.length - 1] === q;
  const inner = text.slice(1, closed ? -1 : undefined);
  return inner.split(q + q).join(q);
}

/**
 * Файл, в который скрипт пишет оператором `COPY … TO '<файл>'`, или null.
 * Ищется только в коде: комментарии и строки пропускаются. Берётся первый COPY скрипта.
 */
export function detectCopyTarget(sql: string): string | null {
  const segments = splitSqlSegments(sql || '', { backslashEscapes: false });
  let seenCopy = false;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type !== 'code') continue;
    if (!seenCopy && /\bCOPY\b/i.test(seg.text)) seenCopy = true;
    if (!seenCopy) continue;
    // `… TO` в конце куска кода, сразу за ним — строка в кавычках
    const next = segments[i + 1];
    if (next && next.type === 'string' && (next.text[0] === "'" || next.text[0] === '"') && /\bTO\s*$/i.test(seg.text)) {
      const name = unquote(next.text).trim();
      return name === '' ? null : name;
    }
  }
  return null;
}

export type WasmRegisterStatus = 'registered' | 'postponed';
export type WasmServerSync = 'ok' | 'failed' | 'skipped';

export interface WasmRegisterResult {
  /** registered — файл сразу доступен в WASM; postponed — буфер сохранён и будет зарегистрирован перед ближайшим запросом. */
  status: WasmRegisterStatus;
  /** Синхронизация с dev-сервером: skipped — сервера нет (Tauri, Android, сборка без server.ts). */
  serverSync: WasmServerSync;
  /** Причина, если регистрация отложена или синхронизация не удалась. */
  error?: string;
}

export interface RegisterOutcome {
  kind: 'ok' | 'warning';
  /** postponed — файл ещё не в WASM; server-sync — в WASM файл есть, но dev-сервер его не получил. */
  cause?: 'postponed' | 'server-sync';
  details?: string;
}

/** Что показать пользователю после загрузки одного файла. «Успешно» — только если файл действительно зарегистрирован. */
export function describeRegisterResult(r: WasmRegisterResult): RegisterOutcome {
  if (r.status === 'postponed') return { kind: 'warning', cause: 'postponed', details: r.error };
  if (r.serverSync === 'failed') return { kind: 'warning', cause: 'server-sync', details: r.error };
  return { kind: 'ok' };
}
