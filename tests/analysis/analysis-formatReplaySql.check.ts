import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatReplaySql} from '../../src/analysis/formatReplaySql';

test('formatting accepts layout/case changes and preserves exact literal whitespace',async()=>{
 const sql=`select "New Column 1", 'a  b', 1e-3 from example; -- cleanup`;
 const formatted=`SELECT\n "New Column 1", 'a  b', 1e-3\nFROM example;\n-- cleanup`;
 assert.equal(await formatReplaySql(sql,async()=>formatted),formatted);
});

test('changed literals, quoted names, operations, numbers and swallowed code retain original SQL',async()=>{
 const sql=`SELECT "Column 1", 'a  b', x - -1 FROM t;`;
 for(const changed of [sql.replace('a  b','a b'),sql.replace('Column 1','Column 2'),sql.replace('- -1','--1'),sql.replace('- -1','+ 1'),sql.replace('- -1','- -2')]) {
  assert.equal(await formatReplaySql(sql,async()=>changed),sql);
 }
 assert.equal(await formatReplaySql(sql,async()=>{throw Error('unsupported syntax');}),sql);
});
