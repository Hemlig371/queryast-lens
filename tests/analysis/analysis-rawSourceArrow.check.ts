import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tableFromArrays,tableToIPC,tableFromIPC} from 'apache-arrow';
import {quoteHostedTable,rawSourceArrow} from '../../src/analysis/rawSourceArrow';
test('raw source quoting preserves dots and quotes and rejects SQL injection',()=>{
 assert.equal(quoteHostedTable('memory."a.b"."x""y"'),'"memory"."a.b"."x""y"');
 for(const bad of ['x;DROP TABLE x','a..b','a.',''])assert.throws(()=>quoteHostedTable(bad));
});
test('physical source snapshots preserve BIGINT bytes and page within one connection',async()=>{
 const queries:string[]=[];
 const conn={useUnsafe:async(callback:any)=>callback({runQuery:(_handle:number,sql:string)=>{queries.push(sql);const start=sql.endsWith('OFFSET 0')?0:2;return tableToIPC(tableFromArrays({big:BigInt64Array.from({length:Math.min(2,3-start)},(_,i)=>9007199254740993n+BigInt(start+i))}),'stream');}},0)};
 const result=tableFromIPC(await rawSourceArrow(conn,'memory.source',3,2));
 assert.equal(result.numRows,3);assert.equal(result.getChild('big')!.get(2),9007199254740995n);
 assert.deepEqual(queries,['SELECT * FROM "memory"."source" LIMIT 2 OFFSET 0','SELECT * FROM "memory"."source" LIMIT 2 OFFSET 2']);
});
