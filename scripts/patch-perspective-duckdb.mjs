import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const normalization = 't=t.replace(/\\s+/g," ").trim();';
const patched = '/* Lens: preserve SQL whitespace (Perspective 5.8.0). */';

/** One version-scoped SDK correction; SQL literals and identifiers must be exact. */
export function preserveDuckDbSql(source, version) {
  if (version !== '5.8.0') throw new Error('Revalidate the DuckDB SQL whitespace patch for Perspective ' + version);
  const originals = source.split(normalization).length - 1;
  const markers = source.split(patched).length - 1;
  if (originals === 0 && markers === 1) return source;
  if (originals !== 1 || markers !== 0) throw new Error('Unsupported Perspective DuckDB SQL normalization template');
  return source.replace(normalization, patched);
}

export async function patchPerspectiveDuckDb() {
  const {version} = JSON.parse(await readFile(require.resolve('@perspective-dev/client/package.json'), 'utf8'));
  const path = require.resolve('@perspective-dev/client/virtual_servers/duckdb');
  const source = await readFile(path, 'utf8');
  const result = preserveDuckDbSql(source, version);
  if (result !== source) await writeFile(path, result);
  return result !== source;
}
