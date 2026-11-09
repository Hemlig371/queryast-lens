import { getAnalysisWasmConnection } from '../lib/duckdbWasm';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export type AnalysisMode = 'wasm' | 'native';
export interface QueryTrace { sql: string; rows?: number; bytes?: number; error?: string }

/** Supplies only the two connection methods used by the official DuckDBHandler. */
export async function analysisConnection(mode: AnalysisMode, trace: (entry: QueryTrace) => void) {
  const wasm = mode === 'wasm' ? await getAnalysisWasmConnection() : null;
  const nativeIpc = async (sql: string) => {
    const { invoke } = await import('@tauri-apps/api/tauri');
    const bytes = new Uint8Array(await invoke<number[]>('analysis_query_arrow', { sql }));
    return bytes;
  };
  const run = async (sql: string, ipcOnly: boolean) => {
    const entry: QueryTrace = { sql };
    try {
      if (mode === 'native') {
        const bytes = await nativeIpc(sql);
        entry.bytes = bytes.byteLength;
        if (ipcOnly) return bytes;
        // DuckDB-WASM already uses this Arrow version. Preserve typed metadata rows.
        const { tableFromIPC } = await import('apache-arrow');
        const table = tableFromIPC(bytes);
        entry.rows = table.numRows;
        return table;
      }
      if (ipcOnly) {
        const bytes: Uint8Array = await wasm.useUnsafe((bindings, conn) => bindings.runQuery(conn, sql));
        entry.bytes = bytes.byteLength;
        return bytes;
      }
      const result = await wasm.query(sql);
      entry.rows = result.numRows;
      return result;
    } catch (error) {
      entry.error = String(error);
      throw error;
    } finally { trace(entry); }
  };
  return {
    query: (sql: string) => run(sql, false),
    useUnsafe: (callback: (bindings: { runQuery: (_conn: number, sql: string) => Promise<unknown> }, conn: number) => unknown) =>
      callback({ runQuery: (_conn, sql) => run(sql, true) }, 0),
  } as unknown as AsyncDuckDBConnection;
}

export const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
export const tablePath = (parts: string[]) => parts.map(quoteIdentifier).join('.');
