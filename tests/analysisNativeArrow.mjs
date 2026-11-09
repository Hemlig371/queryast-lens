// Called after Rust tests in analysis-native.yml; reads real native IPC, not a mock.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tableFromIPC} from 'apache-arrow';
const folder = process.env.LENS_ARROW_FIXTURE_DIR;
assert.ok(folder, 'LENS_ARROW_FIXTURE_DIR is required');
const table = tableFromIPC(await readFile(join(folder, 'native.arrow')));
assert.equal(table.numRows, 1);
assert.equal(table.getChild('id').get(0), 42);
assert.equal(table.getChild('label').get(0), 'Москва');
assert.equal(table.getChild('big').get(0), 9007199254740993n);
assert.equal(table.getChild('missing').get(0), null);
assert.equal(table.getChild('flag').get(0), true);
assert.equal(Number(table.getChild('day').get(0)), Date.UTC(2025,0,2));
assert.equal(Number(table.getChild('stamp').get(0)), Date.UTC(2025,0,2,3,4,5));
assert.equal(table.getChild('amount').type.scale, 2);
assert.equal(table.getChild('amount').get(0)[0], 1234567);
const cases = JSON.parse(await readFile(join(folder, 'cases.json'), 'utf8'));
const normalized = rows => JSON.stringify(rows, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
for (const {name} of cases) {
  const expected = tableFromIPC(await readFile(join(folder, `${name}.expected.arrow`)));
  const actual = tableFromIPC(await readFile(join(folder, `${name}.native.arrow`)));
  assert.ok(expected.schema.fields.length>0,`${name}: invalid empty WASM reference schema`);
  assert.deepEqual(actual.schema.fields.map(f => f.name), expected.schema.fields.map(f => f.name));
  assert.equal(normalized(actual.toArray().map(r => r.toJSON())), normalized(expected.toArray().map(r => r.toJSON())), name);
  console.log(`Native SQL replay matches WASM: ${name} (${actual.numRows} rows)`);
}
console.log('Rust Arrow 58 IPC decoded successfully by Lens JS Arrow 17.');
