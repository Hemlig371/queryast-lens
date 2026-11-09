import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDatagridLabels} from '../../src/analysis/datagridLabels';

function fixture(language='ru') {
 const dom=new JSDOM('<regular-table><table><thead><tr><th>TOTAL</th></tr></thead><tbody><tr><th><span>TOTAL</span></th><th>TOTAL</th><td>TOTAL</td></tr></tbody></table></regular-table>');
 const grid:any=dom.window.document.querySelector('regular-table');
 const [root,group]=grid.querySelectorAll('tbody th');
 const meta=new Map([[root,{type:'row_header',row_header_x:0,row_header:[{toString:()=> 'TOTAL'},undefined]}],[group,{type:'row_header',row_header_x:1,row_header:['','TOTAL']}]]);
 let style=()=>{},removed=false;
 grid.getMeta=(cell:HTMLElement)=>meta.get(cell);
 grid.addStyleListener=(fn:()=>void)=>{style=fn;return ()=>{removed=true;};};
 const dispose=installDatagridLabels(grid,language);
 return {dom,grid,root,group,meta,draw:()=>style(),dispose,removed:()=>removed};
}

test('only the synthetic TOTAL root is translated; data, headers, metadata and listeners survive',()=>{
 const f=fixture();const before=JSON.stringify([...f.meta.values()]);let clicks=0;
 f.root.firstChild.addEventListener('click',()=>clicks++);
 f.draw();f.draw();
 assert.equal(f.root.textContent,'Итого');assert.equal(f.group.textContent,'TOTAL');
 assert.equal(f.grid.querySelector('thead th').textContent,'TOTAL');
 assert.equal(f.grid.querySelector('td').textContent,'TOTAL');
 assert.equal(JSON.stringify([...f.meta.values()]),before);
 f.root.firstChild.dispatchEvent(new f.dom.window.MouseEvent('click'));assert.equal(clicks,1);
 f.dispose();assert.equal(f.root.textContent,'TOTAL');assert.equal(f.removed(),true);f.dom.window.close();
});

test('recycled and flat-group cells retain source TOTAL values',()=>{
 const f=fixture();f.draw();
 f.meta.set(f.root,{type:'row_header',row_header_x:0,row_header:['TOTAL']});
 f.grid.classList.add('flat-group-rollup-mode');f.draw();assert.equal(f.root.textContent,'TOTAL');
 f.grid.classList.remove('flat-group-rollup-mode');f.draw();assert.equal(f.root.textContent,'Итого');
 f.meta.set(f.root,{type:'row_header',row_header_x:1,row_header:['','TOTAL']});
 f.draw();assert.equal(f.root.textContent,'TOTAL');
 f.dispose();f.dom.window.close();
});

test('English leaves the SDK label unchanged and installs no listener',()=>{
 const f=fixture('en');f.draw();assert.equal(f.root.textContent,'TOTAL');f.dispose();assert.equal(f.removed(),false);f.dom.window.close();
});
