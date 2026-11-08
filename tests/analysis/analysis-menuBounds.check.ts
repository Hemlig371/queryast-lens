import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installMenuBounds} from '../../src/analysis/menuBounds';

for (const scale of [1,1.5]) test(`export menu stays below toolbar and scrolls at zoom ${scale}`,()=>{
 const dom=new JSDOM('<perspective-viewer><perspective-export-menu></perspective-export-menu></perspective-viewer>');
 const win=dom.window;
 Object.defineProperty(win,'innerWidth',{value:1000});
 Object.defineProperty(win,'innerHeight',{value:700});
 let pending:FrameRequestCallback|undefined;
 win.requestAnimationFrame=callback=>{pending=callback;return 1;};
 win.cancelAnimationFrame=()=>{pending=undefined;};
 const viewer=win.document.querySelector('perspective-viewer')! as HTMLElement;
 const menu=viewer.firstElementChild! as HTMLElement;
 const rect=(x:number,y:number,width:number,height:number)=>({x,y,left:x,top:y,right:x+width,bottom:y+height,width,height,toJSON:()=>({})});
 viewer.getBoundingClientRect=()=>rect(0,50,1000,650);
 Object.defineProperty(menu,'offsetWidth',{get:()=>400/scale});
 menu.getBoundingClientRect=()=>{
  const [x,y]=menu.style.getPropertyValue('translate').split(' ').map(parseFloat);
  const height=Math.min(1000,parseFloat(menu.style.maxHeight)*scale||1000);
  return rect(700+(x||0)*scale,-200+(y||0)*scale,400,height);
 };
 const stop=installMenuBounds(viewer);
 pending?.(0);
 const result=menu.getBoundingClientRect();
 assert.ok(result.top>=58-0.01);assert.ok(result.bottom<=692+0.01);
 assert.ok(result.left>=8);assert.ok(result.right<=992+0.01);
 assert.equal(menu.style.overflow,'auto');
 stop();assert.equal(pending,undefined);dom.window.close();
});
