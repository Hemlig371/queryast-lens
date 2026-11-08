import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvExportBlob,csvHeaderEnd} from '../../src/analysis/exportData';

test('CSV paging includes every row once with one header',async()=>{
 const calls:any[]=[];
 const view={num_rows:async()=>5,to_csv:async(w:any)=>{calls.push(w);return 'id,label\n'+Array.from({length:w.end_row-w.start_row},(_,i)=>`${w.start_row+i},x\n`).join('');}};
 const blob=await csvExportBlob(view,2);
 assert.equal(await blob.text(),'id,label\n0,x\n1,x\n2,x\n3,x\n4,x\n');
 assert.deepEqual(calls,[{start_row:0,end_row:2},{start_row:2,end_row:4},{start_row:4,end_row:5}]);
});

test('CSV header boundaries handle quoted newlines, escaped quotes and CRLF',()=>{
 const header='"a\n""b",value\r\n';assert.equal(csvHeaderEnd(header+'1,2\r\n'),header.length);
});

test('empty source still exports a header and schema changes fail explicitly',async()=>{
 assert.equal(await (await csvExportBlob({num_rows:async()=>0,to_csv:async()=> 'id\n'})).text(),'id\n');
 await assert.rejects(csvExportBlob({num_rows:async()=>2,to_csv:async(w:any)=>w.start_row?'other\n2\n':'id\n1\n'},1),/columns changed/);
});
