import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDatagridViewport} from '../../src/analysis/datagridViewport';

test('plugin removal and exploration close unsubscribe public style listeners',async()=>{
 const dom=new JSDOM('<perspective-viewer><perspective-viewer-datagrid></perspective-viewer-datagrid></perspective-viewer>',{pretendToBeVisual:true});
 const viewer=dom.window.document.querySelector('perspective-viewer')! as HTMLElement;
 const plugin=viewer.firstElementChild! as any;let active=0;
 plugin.regular_table={ownerDocument:dom.window.document,addStyleListener(){active++;return ()=>{active--;};}};
 const dispose=installDatagridViewport(viewer);assert.equal(active,1);
 plugin.remove();await Promise.resolve();assert.equal(active,0);
 viewer.append(plugin);await Promise.resolve();assert.equal(active,1);
 dispose();assert.equal(active,0);dom.window.close();
});

test('a failed grid flush does not leave automatic sizing permanently locked',async(t)=>{
 const {installInitialColumnWidths}=await import('../../src/analysis/datagridViewport');
 let style!:()=>void,frame!:()=>Promise<void>,attempts=0;
 let sizes:Record<number,number>={};
 const warn=t.mock.method(console,'warn',()=>{});
 const grid:any={
  ownerDocument:{defaultView:{requestAnimationFrame:(fn:any)=>{frame=fn;return 1;},cancelAnimationFrame:()=>{}}},
  clientWidth:400,
  addStyleListener:(fn:()=>void)=>{style=fn;return ()=>{};},
  saveColumnSizes:()=>({...sizes}),restoreColumnSizes:(next:Record<number,number>)=>{sizes=next;},
  querySelectorAll:()=>[{colSpan:1,offsetWidth:900,scrollWidth:900}],getMeta:()=>({size_key:0}),
  flush:async()=>{if(++attempts===1)throw Error('View changed during flush');},draw:async()=>{},
 };
 const dispose=installInitialColumnWidths(grid);
 try {
  style();await assert.doesNotReject(()=>frame());
  assert.equal(warn.mock.callCount(),1);
  style();await frame();
  assert.equal(attempts,2);assert.ok(sizes[0]>0&&sizes[0]<900);
 } finally {dispose();}
});

test('disposing during an in-flight sizing pass does not redraw a removed grid',async()=>{
 const {installInitialColumnWidths}=await import('../../src/analysis/datagridViewport');
 let style!:()=>void,frame!:()=>Promise<void>,release!:()=>void;
 let draws=0,writes=0;
 const waiting=new Promise<void>(resolve=>{release=resolve;});
 const grid:any={
  ownerDocument:{defaultView:{requestAnimationFrame:(fn:any)=>{frame=fn;return 1;},cancelAnimationFrame:()=>{}}},clientWidth:400,
  addStyleListener:(fn:()=>void)=>{style=fn;return ()=>{};},saveColumnSizes:()=>({}),restoreColumnSizes:()=>{writes++;},
  querySelectorAll:()=>[{colSpan:1,offsetWidth:900,scrollWidth:900}],getMeta:()=>({size_key:0}),flush:()=>waiting,draw:async()=>{draws++;},
 };
 const dispose=installInitialColumnWidths(grid);style();const running=frame();dispose();release();await running;
 assert.equal(draws,0);assert.equal(writes,0);
});
