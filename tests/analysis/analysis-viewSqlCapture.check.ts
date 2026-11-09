import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ViewSqlCapture} from '../../src/analysis/viewSql';

test('expression validation errors remain local to the expression editor',async()=>{
 const capture=new ViewSqlCapture();const seen:boolean[]=[];
 const handler=capture.instrument({tableDescribe:async()=>{seen.push(capture.validating);capture.record({sql:'invalid draft',error:'invalid expression'});return {expression_errors:{draft:{error_message:'invalid expression'}}};},tableSize:async()=>{seen.push(capture.validating);return 10;}});
 const result=await handler.tableDescribe();assert.ok(result.expression_errors.draft);
 assert.equal(capture.validating,false);await handler.tableSize();
 assert.deepEqual(seen,[true,false]);
});


test('a failed queued operation does not block later View operations',async()=>{
 const capture=new ViewSqlCapture();const order:string[]=[];
 let release!:()=>void;
 const blocked=new Promise<void>(resolve=>{release=resolve;});
 const handler=capture.instrument({
  tableMakeView:async(_table:string,view:string)=>{
   order.push(view);
   if(view==='bad'){await blocked;throw Error('invalid projection');}
   return view;
  },
 });
 const bad=handler.tableMakeView('source','bad');
 const rejected=assert.rejects(bad,/invalid projection/);
 const good=handler.tableMakeView('source','good');
 await Promise.resolve();assert.deepEqual(order,['bad']);
 release();await rejected;assert.equal(await good,'good');
 assert.deepEqual(order,['bad','good']);assert.equal(capture.validating,false);
});
