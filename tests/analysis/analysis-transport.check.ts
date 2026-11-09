import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tableFromArrays, tableToIPC} from 'apache-arrow';
import {analysisConnection, type QueryTrace} from '../../src/analysis/transport';

// Exercise Lens and the real Tauri JS invoke API; only the native host is replaced.
async function withNativeHost(reply: (sql: string) => Uint8Array, run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const host: any = {crypto: globalThis.crypto};
  host.__TAURI_IPC__ = ({cmd, sql, callback, error}: any) => {
    assert.equal(cmd, 'analysis_query_arrow');
    try { host[`_${callback}`](reply(sql)); }
    catch (reason) { host[`_${error}`](String(reason)); }
  };
  Object.defineProperty(globalThis, 'window', {value: host, configurable: true});
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete (globalThis as any).window;
  }
}

test('native analysis decodes more than 500,000 rows without the editor limit', async () => {
  const ids = Int32Array.from({length: 500_001}, (_, i) => i);
  const bytes = tableToIPC(tableFromArrays({id: ids}), 'stream');
  await withNativeHost(() => bytes, async () => {
    const traces: QueryTrace[] = [];
    const conn = await analysisConnection('native', entry => traces.push(entry));
    const result = await conn.query('SELECT id FROM source');
    assert.equal(result.numRows, 500_001);
    assert.equal(result.getChild('id')!.get(500_000), 500_000);
    assert.equal(traces[0].rows, 500_001);
  });
});

test('native raw IPC transport accepts responses larger than the former 32 MiB cap', async () => {
  const bytes = new Uint8Array(32 * 1024 * 1024 + 1);
  bytes[0] = 42; bytes[bytes.length - 1] = 99;
  await withNativeHost(() => bytes, async () => {
    const traces: QueryTrace[] = [];
    const conn = await analysisConnection('native', entry => traces.push(entry));
    const result = await conn.useUnsafe((bindings, handle) => bindings.runQuery(handle, 'SELECT * FROM source'));
    assert.deepEqual(result, bytes);
    assert.equal(traces[0].bytes, bytes.length);
    assert.equal(traces[0].error, undefined);
  });
});

test('native backend errors still propagate and leave subsequent requests usable', async () => {
  const bytes = tableToIPC(tableFromArrays({id: [1]}), 'stream');
  await withNativeHost(sql => {
    if (sql === 'bad query') throw new Error('Source is unavailable');
    return bytes;
  }, async () => {
    const traces: QueryTrace[] = [];
    const conn = await analysisConnection('native', entry => traces.push(entry));
    await assert.rejects(conn.query('bad query'), /Source is unavailable/);
    assert.match(traces[0].error!, /Source is unavailable/);
    assert.equal((await conn.query('SELECT 1')).numRows, 1);
  });
});
