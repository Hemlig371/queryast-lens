import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDateSplitPaths, installDateSplitPathCompatibility} from '../../src/analysis/dateSplitPaths';

test('ISO date pivot headers are UTC epoch milliseconds accepted by Intl', () => {
  const paths = [['2025-01-01', '2025-01-02', null], ['revenue', 'quantity', 'revenue']];
  const result = normalizeDateSplitPaths(paths, ['day'], {day: 'date'});
  assert.deepEqual(result[0], [1735689600000, 1735776000000, null]);
  assert.doesNotThrow(() => new Intl.DateTimeFormat('ru-RU', {timeZone:'UTC'}).format(result[0][0] as number));
  assert.equal(paths[0][0], '2025-01-01');
  assert.equal(result[1], paths[1]);
});

test('strings, numeric dates, nulls and non-date split levels retain their types', () => {
  const paths = [['2025-01-01'], [1735689600000, null, 'not-a-date'], ['revenue']];
  assert.deepEqual(normalizeDateSplitPaths(paths, ['region','day'], {region:'string', day:'date'}), paths);
});

test('compatibility forwards column windows and restores the original method', async () => {
  class View {
    async get_config(){return {split_by:['day']};}
    async column_paths(window?: unknown){assert.deepEqual(window,{start_col:2,end_col:4});return [['2025-01-01'],['revenue']];}
  }
  const original=View.prototype.column_paths;
  const dispose=installDateSplitPathCompatibility(View,{day:'date'});
  assert.deepEqual(await new View().column_paths({start_col:2,end_col:4}),[[1735689600000],['revenue']]);
  dispose();
  assert.equal(View.prototype.column_paths,original);
});
