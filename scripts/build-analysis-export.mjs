// Prepare analysis assets and the pinned DuckDB SQL correctness patch.
import {patchPerspectiveDuckDb} from './patch-perspective-duckdb.mjs';
import {mkdir,copyFile,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if (await patchPerspectiveDuckDb()) {
  // Do not reuse a dev prebundle containing the old SQL normalization.
  await rm(join(root,'node_modules/.vite'),{recursive:true,force:true});
}
await mkdir(join(root,'public'),{recursive:true});
await copyFile(join(dirname(require.resolve('@bokuweb/zstd-wasm')),'zstd.wasm'),join(root,'public/analysis-zstd.wasm'));
await rm(join(root,'public/analysis-export-runtime.js.gz'),{force:true});
console.log('Prepared lazy ZSTD codec asset');
