import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindHtmlReplay} from '../../src/analysis/htmlReplay';

const bootstrap=`window.viewer.load(worker.table(bytes.buffer));
window.viewer.restore(JSON.parse(window.layout.textContent));`;

test('SDK HTML registers the embedded table by config name before restoring the panel',async()=>{
 const config={table:'memory.dashboard_source',title:'Report',plugin:'Datagrid',group_by:['region'],split_by:['year'],columns:['value'],filter:[['region','==','A']],aggregates:{value:'sum'}};
 const html=bindHtmlReplay(bootstrap);const calls:any[]=[];let registered=false,loaded=false;
 const worker={table:async(_bytes:any,options:any)=>{await Promise.resolve();registered=true;calls.push(['table',options]);}};
 const viewer={load:async(client:any)=>{assert.equal(client,worker);assert.ok(registered);await Promise.resolve();loaded=true;},restore:async(value:any)=>{assert.ok(loaded);calls.push(['restore',value]);}};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('worker','bytes','window',html)(worker,{buffer:new ArrayBuffer(0)},{viewer,layout:{textContent:JSON.stringify(config)}});
 assert.deepEqual(calls,[['table',{name:config.table}],['restore',config]]);
});

test('HTML assets/data/config stay unchanged; unknown SDK templates fail explicitly',()=>{
 const prefix='<script id="data">base64</script><script id="layout">{"title":"Report"}</script>\n';
 assert.ok(bindHtmlReplay(prefix+bootstrap).startsWith(prefix));
 assert.throws(()=>bindHtmlReplay('<html>unknown</html>'),/Unsupported Perspective HTML bootstrap/);
 assert.throws(()=>bindHtmlReplay(bootstrap+bootstrap),/Unsupported Perspective HTML bootstrap/);
});
