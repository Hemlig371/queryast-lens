import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pagedJsonBlob} from '../../src/analysis/exportPaged';
import {exportNativeMenuChoice} from '../../src/analysis/exportData';

test('paged JSON preserves column-oriented structure and null/Unicode values',async()=>{
 const records=[{id:1,label:'Москва'},{id:2,label:null},{id:3,label:'x"\n'}];
 const view={num_rows:async()=>3,to_columns:async(w:any)=>({id:records.slice(w.start_row,w.end_row).map(x=>x.id),label:records.slice(w.start_row,w.end_row).map(x=>x.label)})};
 assert.deepEqual(JSON.parse(await (await pagedJsonBlob(view,false,2)).text()),{id:[1,2,3],label:['Москва',null,'x"\n']});
});
test('paged NDJSON separates records and empty JSON retains schema',async()=>{
 const view={num_rows:async()=>3,to_ndjson:async(w:any)=>Array.from({length:w.end_row-w.start_row},(_,i)=>JSON.stringify({id:w.start_row+i})).join('\n')};
 assert.deepEqual((await(await pagedJsonBlob(view,true,2)).text()).trim().split('\n').map(x=>JSON.parse(x)),[{id:0},{id:1},{id:2}]);
 assert.deepEqual(JSON.parse(await(await pagedJsonBlob({num_rows:async()=>0,to_columns:async()=>({id:[]})},false)).text()),{id:[]});
});
test('selected JSON pages retain selected row and column boundaries',async()=>{
 const calls:any[]=[];
 const view={num_rows:async()=>10,to_columns:async(w:any)=>{calls.push(w);return {id:Array.from({length:w.end_row-w.start_row},(_,i)=>w.start_row+i)};}};
 const blob=await pagedJsonBlob(view,false,2,{start_row:3,end_row:6,start_col:1,end_col:2});
 assert.deepEqual(JSON.parse(await blob.text()),{id:[3,4,5]});
 assert.deepEqual(calls,[{start_row:3,end_row:5,start_col:1,end_col:2},{start_row:5,end_row:6,start_col:1,end_col:2}]);
});
