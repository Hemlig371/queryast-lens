import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installUiPolish,translateMenu,translateControls} from '../../src/analysis/uiPolish';
import {installInitialColumnWidths} from '../../src/analysis/datagridViewport';

test('public sizing API waits for SDK reconciliation, preserves manual widths and disposes',async()=>{
  const dom=new JSDOM('<div><table><tr><th></th><td></td></tr></table></div>',{pretendToBeVisual:true});
  const grid:any=dom.window.document.querySelector('div');let listener:any,removed=false;
  const frames:any[]=[];dom.window.requestAnimationFrame=(fn:any)=>{frames.push(fn);return frames.length;};dom.window.cancelAnimationFrame=()=>{};
  grid.flush=async()=>{};grid.draw=async()=>listener();
  let sizes:any={1:900};
  Object.defineProperty(grid,'clientWidth',{value:800});
  const cells=grid.querySelectorAll('th,td');
  for(const cell of cells)Object.defineProperty(cell,'offsetWidth',{value:1500});
  grid.getMeta=(cell:any)=>({size_key:cell===cells[0]?0:1});
  grid.saveColumnSizes=()=>({...sizes});grid.restoreColumnSizes=(next:any)=>{sizes=next;};
  grid.addStyleListener=(fn:any)=>{listener=fn;return ()=>{removed=true;};};
  const dispose=installInitialColumnWidths(grid);listener();
  assert.equal(sizes[0],undefined,'Width is not injected during SDK style reconciliation');
  await frames.shift()();
  assert.equal(sizes[0],320);assert.equal(sizes[1],900);
  sizes[0]=720;listener();assert.equal(sizes[0],720);
  dispose();assert.equal(removed,true);dom.window.close();
});

test('menu translation preserves command listeners, submenu source names and filenames',()=>{
  const dom=new JSDOM('<div></div>');const root=dom.window.document.querySelector('div')!.attachShadow({mode:'open'});
  root.innerHTML='<div class="context-menu"><span class="context-menu-item">Export</span><span class="context-menu-item">Master</span><span class="context-menu-item">Detail</span><span class="context-menu-item has-submenu">New<div><span class="dropdown-menu-item">Export</span></div></span></div><span class="dropdown-group-label">Current View</span><code>Export.csv</code>';
  const item=root.querySelector('.context-menu-item')!;let clicks=0;item.addEventListener('click',()=>clicks++);
  translateMenu(root);translateMenu(root);item.dispatchEvent(new dom.window.MouseEvent('click'));
  assert.equal(item.textContent,'Экспорт');assert.equal(clicks,1);
  assert.deepEqual(Array.from(root.querySelectorAll('.context-menu>.context-menu-item')).slice(1,3).map(node=>node.textContent),['Основная','Зависимая']);
  assert.equal(root.querySelector('.dropdown-menu-item')!.textContent,'Export');
  assert.equal(root.querySelector('code')!.textContent,'Export.csv');
  assert.equal(root.querySelector('.dropdown-group-label')!.textContent,'Текущее представление');dom.window.close();
});

test('polish follows portal lifetime and cleanup removes its observers/styles',async()=>{
  const dom=new JSDOM('<perspective-viewer></perspective-viewer>',{pretendToBeVisual:true});const viewer=dom.window.document.querySelector('perspective-viewer')! as HTMLElement;
  const root=viewer.attachShadow({mode:'open'});const dispose=installUiPolish(viewer,'ru');
  assert.match(root.querySelector('style')!.textContent!,/width:max-content/);
  const menu=dom.window.document.createElement('perspective-export-menu');const shadow=menu.attachShadow({mode:'open'});
  shadow.innerHTML='<span class="dropdown-group-label">Save as</span>';viewer.appendChild(menu);
  await new Promise(r=>setTimeout(r,0));assert.equal(shadow.querySelector('span')!.textContent,'Сохранить как');
  dispose();assert.equal(root.querySelector('style'),null);assert.equal(shadow.querySelector('style'),null);dom.window.close();
});

test('fixed expression controls translate without touching field names, source or errors',()=>{
 const dom=new JSDOM('<div></div>');const root=dom.window.document.querySelector('div')!.attachShadow({mode:'open'});
 root.innerHTML='<div id="expression-editor"><label class="item_title">Expression</label><textarea>Create</textarea><div class="error">Missing Column</div></div><button id="psp-expression-editor-button-save">Create</button><input value="New Column 1">';
 translateControls(root);
 assert.equal(root.querySelector('label')!.textContent,'Выражение');
 assert.equal(root.querySelector('button')!.textContent,'Создать');
 assert.equal(root.querySelector('textarea')!.value,'Create');
 assert.equal(root.querySelector('.error')!.textContent,'Missing Column');
 assert.equal(root.querySelector('input')!.value,'New Column 1');dom.window.close();
});
