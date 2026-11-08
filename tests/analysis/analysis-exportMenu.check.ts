import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {exportMethodForFilename, installExportMenuBridge, isResizeObserverNotice} from '../../src/analysis/exportMenu';

test('native export filenames distinguish current view, all data, codecs and config',()=>{
  for (const [name,method] of [['demo.csv','csv'],['demo.all.csv','csv-all'],['demo.config.json','json-config'],['demo.all.zstd.arrow','arrow-zstd-all'],['demo.lz4.arrow','arrow-lz4'],['demo.png','plugin']]) {
    assert.equal(exportMethodForFilename(name),method);
  }
  assert.equal(exportMethodForFilename('unknown.file'),undefined);
});

test('only ResizeObserver scheduling notices are excluded',()=>{
 assert.ok(isResizeObserverNotice('ResizeObserver loop completed with undelivered notifications.'));
 assert.ok(isResizeObserverNotice('ResizeObserver loop limit exceeded'));
 assert.ok(!isResizeObserverNotice('Binder Error: column not found'));
 assert.ok(!isResizeObserverNotice('RuntimeError: unreachable'));
});

function fixture(){
 const dom=new JSDOM('<perspective-viewer><perspective-export-menu></perspective-export-menu></perspective-viewer>');
 const viewer=dom.window.document.querySelector('perspective-viewer') as any;
 const menu=viewer.querySelector('perspective-export-menu');
 const shadow=menu.attachShadow({mode:'open'});
 shadow.innerHTML='<span class="dropdown-menu-item"><code>demo.config.json</code></span>';
 return {dom,viewer,item:shadow.querySelector('code')!};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('click in shadow menu calls public download once and closes after success',async()=>{
 const {dom,viewer,item}=fixture();const calls:any[]=[];let sdkCalls=0,closed=0;
 viewer.download=async(options:any)=>calls.push(options);
 const dispose=installExportMenuBridge(viewer,{start:()=>calls.push('start'),success:()=>calls.push('success'),error:e=>calls.push(e)});
 item.addEventListener('mousedown',()=>sdkCalls++);
 dom.window.document.addEventListener('keydown',e=>{if(e.key==='Escape')closed++;});
 item.dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,bubbles:true,composed:true,cancelable:true}));
 await tick();
 assert.deepEqual(calls,['start',{method:'json-config'},'success']);assert.equal(sdkCalls,0);assert.equal(closed,1);
 dispose();
 item.dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,bubbles:true,composed:true}));
 assert.equal(sdkCalls,1);dom.window.close();
});

test('export rejection reaches error callback and does not report success',async()=>{
 const {dom,viewer,item}=fixture();const errors:unknown[]=[];let success=0;
 viewer.download=async()=>{throw Error('Arrow response exceeds 32 MiB');};
 const dispose=installExportMenuBridge(viewer,{start:()=>{},success:()=>success++,error:e=>errors.push(e)});
 item.dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,bubbles:true,composed:true,cancelable:true}));
 await tick();assert.equal(success,0);assert.match(String(errors[0]),/32 MiB/);dispose();dom.window.close();
});


test('HTML keeps the SDK document and saves under the selected filename',async()=>{
 const {exportNativeMenuChoice}=await import('../../src/analysis/exportData');
 const dom=new JSDOM('<body></body>');const calls:any[]=[];const saved:any[]=[];
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldTimer=globalThis.setTimeout;
 URL.createObjectURL=blob=>{saved.push(blob);return 'blob:test';};URL.revokeObjectURL=()=>{};
 globalThis.setTimeout=((callback:any)=>{callback();return 0;}) as any;
 dom.window.HTMLAnchorElement.prototype.click=function(){saved.push(this.download);};
 try{
  const viewer={ownerDocument:dom.window.document,getActivePanel:()=> 'chart',export:async(options:any)=>{calls.push(options);return '<html>stock SDK</html>\nwindow.viewer.load(worker.table(bytes.buffer));\nwindow.viewer.restore(JSON.parse(window.layout.textContent));';}};
  await exportNativeMenuChoice(viewer,'html','Regional report.html');
  assert.deepEqual(calls,[{method:'html',panel:'chart'}]);
  assert.equal(saved[1],'Regional report.html');assert.match(await saved[0].text(),/stock SDK/);assert.match(await saved[0].text(),/await worker.table/);
  viewer.export=async()=>{throw Error('HTML export failed');};
  await assert.rejects(()=>exportNativeMenuChoice(viewer,'html','demo.html'),/HTML export failed/);
 }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;globalThis.setTimeout=oldTimer;dom.window.close();}
});
