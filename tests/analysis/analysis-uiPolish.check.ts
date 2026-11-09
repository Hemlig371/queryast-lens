import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installUiPolish,translateMenu} from '../../src/analysis/uiPolish';
import {installInitialColumnWidths} from '../../src/analysis/datagridViewport';

test('initial auto widths are bounded, manual widths remain unrestricted, and recreated models are covered',()=>{
  const sizes={auto:{0:1200,1:90,2:1500},override:{2:900},indices:{}};
  const grid:any={clientWidth:800,_column_sizes:sizes,_create_table_model(){this.table_model={autosize_cells(){return 42;}};}};
  grid._create_table_model();const original=grid.table_model.autosize_cells;
  const dispose=installInitialColumnWidths(grid);
  assert.equal(grid.table_model.autosize_cells(),42);
  assert.equal(sizes.override[0],320);assert.equal(sizes.override[1],undefined);assert.equal(sizes.override[2],900);
  sizes.override[0]=720;grid.table_model.autosize_cells();assert.equal(sizes.override[0],720);
  grid._create_table_model();delete sizes.override[0];grid.table_model.autosize_cells();assert.equal(sizes.override[0],320);
  dispose();assert.equal(grid.table_model.autosize_cells.toString(),original.toString());
});

test('menu translation preserves command listeners, submenu source names and filenames',()=>{
  const dom=new JSDOM('<div></div>');const root=dom.window.document.querySelector('div')!.attachShadow({mode:'open'});
  root.innerHTML='<div class="context-menu"><span class="context-menu-item">Export</span><span class="context-menu-item has-submenu">New<div><span class="dropdown-menu-item">Export</span></div></span></div><span class="dropdown-group-label">Current View</span><code>Export.csv</code>';
  const item=root.querySelector('.context-menu-item')!;let clicks=0;item.addEventListener('click',()=>clicks++);
  translateMenu(root);translateMenu(root);item.dispatchEvent(new dom.window.MouseEvent('click'));
  assert.equal(item.textContent,'Экспорт');assert.equal(clicks,1);
  assert.equal(root.querySelector('.dropdown-menu-item')!.textContent,'Export');
  assert.equal(root.querySelector('code')!.textContent,'Export.csv');
  assert.equal(root.querySelector('.dropdown-group-label')!.textContent,'Текущее представление');dom.window.close();
});

test('polish follows portal lifetime and cleanup removes its observers/styles',async()=>{
  const dom=new JSDOM('<perspective-viewer></perspective-viewer>');const viewer=dom.window.document.querySelector('perspective-viewer')! as HTMLElement;
  const root=viewer.attachShadow({mode:'open'});const dispose=installUiPolish(viewer,'ru');
  assert.match(root.querySelector('style')!.textContent!,/width:max-content/);
  const menu=dom.window.document.createElement('perspective-export-menu');const shadow=menu.attachShadow({mode:'open'});
  shadow.innerHTML='<span class="dropdown-group-label">Save as</span>';viewer.appendChild(menu);
  await new Promise(r=>setTimeout(r,0));assert.equal(shadow.querySelector('span')!.textContent,'Сохранить как');
  dispose();assert.equal(root.querySelector('style'),null);assert.equal(shadow.querySelector('style'),null);dom.window.close();
});
