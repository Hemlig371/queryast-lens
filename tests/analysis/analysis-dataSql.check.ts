import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDataSql} from '../../src/analysis/dataSql';

const create=(body:string)=>`CREATE TEMPORARY TABLE view AS (SELECT *, FALSE AS "__HIDDEN__" FROM (${body}) AS __PSP_EXPAND_SRC__)`;
test('data SQL keeps exact literals and configured column order, without temporary objects or UI updates',()=>{
  const sql=buildDataSql([create(`SELECT 'a  b' AS "label", 42 AS "id" FROM memory.source ORDER BY rowid`),'UPDATE view SET "__HIDDEN__"=TRUE'],{group_by:[]},{label:'string',id:'integer'},'SELECT "id", "label" FROM view WHERE NOT "__HIDDEN__" LIMIT 1');
  assert.match(sql,/'a  b'/);assert.match(sql,/SELECT\s+"id",\s+"label"\s+FROM prepared_data/);
  assert.doesNotMatch(sql,/CREATE|UPDATE|DROP|__HIDDEN__|LIMIT/);
});
test('quoted names containing FROM are parsed as identifiers and aliases avoid collisions',()=>{
  const sql=buildDataSql([create('SELECT 1')],{group_by:['x'],group_rollup_mode:'rollup'},{x:'integer','a FROM b':'integer'},'SELECT "__GROUPING_ID__", "__ROW_PATH_0__", "a FROM b", "x" FROM view');
  assert.match(sql,/"__ROW_PATH_0__" AS "x_2"/);assert.match(sql,/"a FROM b",\s+"x"/);
});
test('derived chains and unknown SQL templates are refused explicitly',()=>{
  assert.throws(()=>buildDataSql([create('SELECT 1'),create('SELECT 2')],{}, {},''),/derived/);
  assert.throws(()=>buildDataSql(['CREATE TEMP TABLE x AS SELECT 1'],{}, {},''),/template/);
});
