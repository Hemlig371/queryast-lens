import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installPivotMinMax} from '../../src/analysis/pivotMinMax';

test('unsplit and physical-column requests keep the stock handler', async () => {
  const calls: any[]=[];
  const handler={viewGetMinMax: async (...args: any[])=>{calls.push(args);return {min:1,max:9};}};
  installPivotMinMax(handler, {query: async ()=>{throw Error('Unexpected SQL');}} as any);
  await handler.viewGetMinMax('view','value',{columns:['value'],split_by:[]});
  await handler.viewGetMinMax('view','41|value',{columns:['value'],split_by:['key']});
  assert.equal(calls.length,2);
});

test('split metric range uses all matching columns and keeps overlapping metric names separate', async () => {
  const queries: string[]=[];
  const handler={
    tableSchema: async ()=>({'41|value':'float','42|value':'float','41|other|value':'float'}),
    viewGetMinMax: async ()=>{throw Error('Unresolved base metric');},
  };
  installPivotMinMax(handler,{query:async (sql:string)=>{
    queries.push(sql);return {toArray:()=>[{toJSON:()=>({min:-4,max:12})}]};
  }} as any);
  const result=await handler.viewGetMinMax('view"name','value',{columns:['value','other|value'],split_by:['key'],group_by:['group']});
  assert.deepEqual(result,{min:-4,max:12});
  assert.equal(queries.length,1);
  assert.match(queries[0],/LEAST\(MIN\("41\|value"\), MIN\("42\|value"\)\)/);
  assert.doesNotMatch(queries[0],/other\|value/);
  assert.match(queries[0],/FROM "view""name" WHERE "__GROUPING_ID__" = 0$/);
});

test('empty pivots return an empty range without a guessed column or a data query', async () => {
  const handler={tableSchema:async()=>({}),viewGetMinMax:async()=>{throw Error('Missing column');}};
  installPivotMinMax(handler,{query:async()=>{throw Error('Unexpected SQL');}} as any);
  assert.deepEqual(await handler.viewGetMinMax('view','metric',{columns:['metric'],split_by:['key']}),{min:null,max:null});
});
