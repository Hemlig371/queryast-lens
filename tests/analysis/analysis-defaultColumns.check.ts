import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installDefaultColumns} from '../../src/analysis/defaultColumns';

test('default HTML view receives source columns without changing the SDK config',async()=>{
 const calls:any[]=[];let schemas=0;
 const handler={tableSchema:async()=>{schemas++;return {id:'integer',label:'string'};},
  tableMakeView:async(...args:any[])=>{calls.push(args);}};
 installDefaultColumns(handler);
 const config={columns:[],group_by:[],split_by:[],filter:[]};
 await handler.tableMakeView('source','view',config);
 assert.deepEqual(calls[0],['source','view',{...config,columns:['id','label']}]);
 assert.deepEqual(config.columns,[]);
 await handler.tableMakeView('source','explicit',{columns:['label']});
 await handler.tableMakeView('source','grouped',{columns:[],group_by:['label']});
 assert.equal(schemas,1);
 assert.deepEqual(calls[1][2],{columns:['label']});
 assert.deepEqual(calls[2][2],{columns:[],group_by:['label']});
});
