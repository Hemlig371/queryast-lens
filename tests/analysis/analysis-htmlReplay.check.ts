import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {bindHtmlReplay} from '../../src/analysis/htmlReplay';

const bootstrap=`const worker = await perspective.worker();
window.viewer.load(worker.table(bytes.buffer));
window.viewer.restore(JSON.parse(window.layout.textContent));`;
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

for(const plugin of ['Datagrid','X Bar','Y Line'])test(`HTML waits for ${plugin}, client load and layout before final draw`,async()=>{
 const config={table:'memory.dashboard_source',title:'Report',plugin,group_by:['region'],split_by:['year'],columns:['value'],filter:[['region','==','A']],aggregates:{value:'sum'}};
 const calls:any[]=[];let registered=false,loaded=false;
 const worker={table:async(_bytes:any,options:any)=>{assert.ok(registered);calls.push(['table',options]);}};
 const viewer={getAllPlugins:async()=>{registered=true;return [];},load:async(client:any)=>{assert.equal(client,worker);loaded=true;},restore:async(value:any)=>{assert.ok(loaded);calls.push(['restore',value]);},flush:async()=>calls.push('flush'),resize:async()=>calls.push('resize')};
 const window={customElements:{whenDefined:async()=>{}},viewer,layout:{textContent:JSON.stringify(config)},addEventListener:()=>{},requestAnimationFrame:(callback:any)=>callback()};
 await new AsyncFunction('perspective','bytes','window',bindHtmlReplay(bootstrap))({worker:async()=>{assert.ok(registered);return worker;}},{buffer:new ArrayBuffer(0)},window);
 assert.deepEqual(calls,[['table',{name:config.table}],['restore',config],'flush','resize','flush']);
});

test('restore failures become a visible message, not a silently empty export',async()=>{
 const dom=new JSDOM('<body></body>');const window=dom.window as any;
 window.viewer={getAllPlugins:async()=>[{get_static_config:()=>({name:'X Bar'})}],load:async()=>{},restore:async()=>{throw Error('Unsupported expression');}};
 window.layout={textContent:JSON.stringify({table:'source',plugin:'X Bar'})};
 const perspective={worker:async()=>({table:async()=>{}})};
 const html=bindHtmlReplay(bootstrap).replace('await window.customElements.whenDefined("perspective-viewer");','');
 await assert.rejects(()=>new AsyncFunction('perspective','bytes','window',html)(perspective,{buffer:new ArrayBuffer(0)},window),/Unsupported expression/);
 assert.match(window.document.querySelector('[role=alert]').textContent,/Unsupported expression/);dom.window.close();
});

test('HTML assets/data/config stay unchanged; unknown SDK templates fail explicitly',()=>{
 const prefix='<script id="data">base64</script><script id="layout">{"title":"Report"}</script>\n';
 assert.ok(bindHtmlReplay(prefix+bootstrap).startsWith(prefix));
 assert.throws(()=>bindHtmlReplay('<html>unknown</html>'),/Unsupported Perspective HTML bootstrap/);
 assert.throws(()=>bindHtmlReplay(bootstrap+bootstrap),/Unsupported Perspective HTML bootstrap/);
});
