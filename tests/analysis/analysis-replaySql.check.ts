import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isolateReplaySql} from '../../src/analysis/replaySql';

test('replay renames dependencies but preserves literals, comments and quoted identifiers', () => {
  const {sql} = isolateReplaySql([
    `CREATE TEMPORARY TABLE abc AS SELECT 'abc' AS label, $$abc$$ AS dollar, "a""b" FROM "source"`,
    `UPDATE abc SET label='it''s abc' /* abc */`,
    `SELECT * FROM abc -- abc`,
  ], 'test');
  assert.match(sql, /CREATE OR REPLACE TEMPORARY TABLE "lens_replay_test_0"/);
  assert.ok(sql.includes(`'abc' AS label, $$abc$$ AS dollar, "a""b" FROM "source"`));
  assert.ok(sql.includes(`UPDATE "lens_replay_test_0" SET label='it''s abc' /* abc */`));
  assert.ok(sql.includes('FROM "lens_replay_test_0" -- abc'));
  assert.ok(sql.endsWith('-- DROP TABLE IF EXISTS "lens_replay_test_0";'));
});

test('replay preserves dependency order and rejects missing construction', () => {
  const {statements} = isolateReplaySql([
    'CREATE TEMP TABLE first AS SELECT 1',
    'CREATE TEMP TABLE "second" AS SELECT * FROM first',
    'SELECT * FROM "second"',
  ], 'deps');
  assert.ok(statements[1].includes('"lens_replay_deps_1" AS SELECT * FROM "lens_replay_deps_0"'));
  assert.throws(() => isolateReplaySql(['SELECT 1']), /unavailable/);
});

test('repeated CREATE keeps its mapping without colliding with a later table', () => {
  const {statements,sql} = isolateReplaySql([
    'CREATE TEMP TABLE a AS SELECT 1 AS value',
    'CREATE TEMP TABLE b AS SELECT * FROM a',
    'CREATE OR REPLACE TEMP TABLE "A" AS SELECT 2 AS value',
    'CREATE TEMP TABLE c AS SELECT * FROM a',
    'SELECT * FROM c',
  ], 'repeat');
  assert.match(statements[0], /TABLE "lens_replay_repeat_0"/);
  assert.match(statements[1], /TABLE "lens_replay_repeat_1" AS SELECT \* FROM "lens_replay_repeat_0"/);
  assert.match(statements[2], /TABLE "lens_replay_repeat_0"/);
  assert.match(statements[3], /TABLE "lens_replay_repeat_2" AS SELECT \* FROM "lens_replay_repeat_0"/);
  assert.equal((sql.match(/-- DROP TABLE IF EXISTS/g)??[]).length,3);
});
