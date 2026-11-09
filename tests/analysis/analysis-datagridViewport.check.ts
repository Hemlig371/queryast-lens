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
