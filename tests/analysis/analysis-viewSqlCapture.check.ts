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
