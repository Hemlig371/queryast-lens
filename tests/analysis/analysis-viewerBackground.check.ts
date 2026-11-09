import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installViewerBackground} from '../../src/analysis/viewerBackground';

test('gutter follows active panel theme through events and releases its listener',()=>{
 const dom=new JSDOM('<div><perspective-viewer><div slot="a" style="--psp--background-color:#123456"></div><div slot="b" style="--psp--background-color:#abcdef"></div></perspective-viewer></div>');
 const win=dom.window;let pending:FrameRequestCallback|undefined;
 win.requestAnimationFrame=callback=>{pending=callback;return 1;};win.cancelAnimationFrame=()=>{pending=undefined;};
 const viewer=win.document.querySelector('perspective-viewer')! as HTMLElement & {getActivePanel:()=>string};
 viewer.getActivePanel=()=> 'b';const target=viewer.parentElement!;
 const stop=installViewerBackground(viewer,target);pending?.(0);pending=undefined;
 assert.equal(target.style.getPropertyValue('--explore-viewer-bg'),'#abcdef');
 viewer.getActivePanel=()=> 'a';viewer.dispatchEvent(new win.Event('perspective-config-update'));pending?.(0);
 assert.equal(target.style.getPropertyValue('--explore-viewer-bg'),'#123456');
 stop();viewer.dispatchEvent(new win.Event('perspective-config-update'));assert.equal(pending,undefined);dom.window.close();
});
