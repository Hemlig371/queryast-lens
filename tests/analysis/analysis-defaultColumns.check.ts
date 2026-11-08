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

test('blank New Column drafts validate inline without running SQL',async()=>{
 let calls=0;
 const handler={tableMakeView:async()=>{},tableDescribe:async()=>{calls++;return {expression_schema:{valid:'integer'}};}};
 installDefaultColumns(handler);
 const draft=await handler.tableDescribe('source',{expressions:{draft:'  '}}) as any;
 assert.equal(calls,0);assert.ok(draft.expression_errors.draft);
 await handler.tableDescribe('source',{expressions:{valid:'"quantity" * 2'}});
 assert.equal(calls,1);
});

test('countif is offered only for boolean columns without changing SDK feature arrays',()=>{
 const aggregates={string:['count','countif'],integer:['sum','countif'],float:['avg','countif'],date:['countif'],datetime:['countif'],boolean:['count','countif']};
 const handler={tableMakeView:async()=>{},getFeatures:()=>({aggregates})};
 installDefaultColumns(handler);
 const fixed=handler.getFeatures().aggregates;
 assert.deepEqual(fixed.string,['count']);assert.deepEqual(fixed.integer,['sum']);
 assert.deepEqual(fixed.boolean,['count','countif']);assert.deepEqual(aggregates.string,['count','countif']);
});
