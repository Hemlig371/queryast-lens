import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preserveDuckDbSql} from '../../scripts/patch-perspective-duckdb.mjs';

const original = 'async function c(r,t,s={}){t=t.replace(/\\s+/g," ").trim();return r.query(t);}';

test('pinned DuckDB patch preserves SQL literals, identifiers and comments exactly', async () => {
  const source = preserveDuckDbSql(original, '5.8.0');
  const run = new Function(source + ';return c;')();
  const sql = `SELECT 'a  b', 'a\tb', 'a\nb', 'a''  b', "two  spaces" FROM "wide  table" -- comment\nWHERE id = 1`;
  const received: string[] = [];
  await run({query: async (query: string) => { received.push(query); }}, sql);
  assert.deepEqual(received, [sql]);
  assert.equal(preserveDuckDbSql(source, '5.8.0'), source);
});

test('unknown SDK versions and templates fail explicitly instead of applying a guessed patch', () => {
  assert.throws(() => preserveDuckDbSql(original, '5.9.0'), /Revalidate/);
  assert.throws(() => preserveDuckDbSql('unknown template', '5.8.0'), /Unsupported/);
  assert.throws(() => preserveDuckDbSql(original + original, '5.8.0'), /Unsupported/);
});
