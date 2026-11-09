// @vitest-environment jsdom
import {act, createElement, createRef} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import Explore, {type ExploreHandle} from '../src/analysis/Explore';

const sdk=vi.hoisted(()=>({load:vi.fn(),events:[] as string[]}));
vi.mock('../src/analysis/sdk',()=>({loadPerspective:()=>sdk.load()}));
vi.mock('../src/analysis/transport',()=>({
 tablePath:(parts:string[])=>parts.join('.'),
 analysisConnection:async()=>({query:async()=>({toArray:()=>['source','other'].map(table=>({toJSON:()=>({database_name:'memory',schema_name:'main',table_name:table})}))})}),
}));
vi.mock('@perspective-dev/client/virtual_servers/duckdb',()=>({DuckDBHandler:class {sqlBuilder={free:()=>sdk.events.push('handler.free')};}}));
vi.mock('@perspective-dev/client/registry',()=>({client_runtime:()=>({glue:{
 VirtualServer:class {free(){sdk.events.push('server.free');}},
 GenericSQLVirtualServerModel:class {tablePath(parts:string[]){return parts.join('.');}free(){}},
 View:class {},
}})}));
vi.mock('../src/analysis/viewSql',()=>({ViewSqlCapture:class {record(){}instrument(h:unknown){return h;}async snapshot(){return {sql:'SELECT 1;'};}}}));
vi.mock('../src/analysis/defaultColumns',()=>({installDefaultColumns:()=>{}}));
vi.mock('../src/analysis/pivotMinMax',()=>({installPivotMinMax:()=>{}}));
vi.mock('../src/analysis/uiPolish',()=>({installUiPolish:()=>()=>{}}));
vi.mock('../src/analysis/menuBounds',()=>({installMenuBounds:()=>()=>{}}));
vi.mock('../src/analysis/datagridViewport',()=>({installDatagridViewport:()=>()=>{}}));
vi.mock('../src/analysis/viewerBackground',()=>({installViewerBackground:()=>()=>{}}));
vi.mock('../src/analysis/dateSplitPaths',()=>({installDateSplitPathCompatibility:()=>()=>sdk.events.push('paths.restore')}));
vi.mock('../src/analysis/exportMenu',()=>({installExportMenuBridge:()=>()=>sdk.events.push('export.remove')}));

function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
const workspace={panels:{panel:{columns:['id']}}};
class FakeViewer extends HTMLElement {
 flush=vi.fn(async()=>{});
 load=vi.fn(async()=>{});
 resetThemes=vi.fn(async()=>{});
 restore=vi.fn(async()=>{});
 restoreWorkspace=vi.fn(async()=>{});
 saveWorkspace=vi.fn(async()=>{sdk.events.push('viewer.save');return workspace;});
 delete=vi.fn(async()=>{sdk.events.push('viewer.delete');});
 getActivePanel=()=> 'panel';
 getView=async()=>({__unsafe_get_name:()=> 'view',get_config:async()=>({}),num_rows:async()=>1,num_columns:async()=>1,column_paths:async()=>[]});
}
customElements.define('perspective-viewer',FakeViewer);
const source={database:'memory',schema:'main',table:'source',connection:':memory:'};
let root:Root,host:HTMLElement;
let runtime:any;
const back=()=>host.querySelector<HTMLButtonElement>('button')!;
const button=(label:RegExp)=>Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b=>label.test(b.textContent??''))!;
async function render(props:any={}) {await act(async()=>root.render(createElement(Explore,{source,...props})));}
async function ready() {await vi.waitFor(()=>expect(host.querySelector('perspective-viewer')?.getAttribute('style')).toContain('visible'));return host.querySelector('perspective-viewer') as FakeViewer;}
async function click(element:HTMLElement) {await act(async()=>element.click());}
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 sdk.events.length=0;
 runtime={make_client:async()=>({
  open_table:async()=>({schema:async()=>({id:'integer'}),free:()=>sdk.events.push('table.free')}),
  terminate:async()=>{sdk.events.push('client.terminate');},free:()=>sdk.events.push('client.free'),
 })};
 sdk.load.mockImplementation(async()=>runtime);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:vi.fn(function(this:HTMLDialogElement){this.removeAttribute('open');})});
 // jsdom does not provide the browser dialog implementation.
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');})});
});
afterEach(async()=>{await act(async()=>root.unmount());await act(async()=>{});host.remove();vi.restoreAllMocks();delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;});

it('returns while initialization is pending without closing the exploration',async()=>{
 const loading=deferred<any>();sdk.load.mockReturnValueOnce(loading.promise);
 const onBack=vi.fn(),onClose=vi.fn();
 try {await render({onBack,onClose});expect(back().disabled).toBe(false);await click(back());expect(onBack).toHaveBeenCalledOnce();expect(onClose).not.toHaveBeenCalled();}
 finally {await act(async()=>loading.resolve(runtime));}
});

it('returns without waiting for an already stalled render',async()=>{
 const onBack=vi.fn();await render({onBack});const viewer=await ready();
 const stalled=deferred<void>();viewer.flush.mockReturnValue(stalled.promise);
 await click(back());expect(onBack).toHaveBeenCalledOnce();expect(viewer.flush).toHaveBeenCalledTimes(1); // initialization only
 stalled.resolve();
});

it('does not open a late SQL dialog after returning to the editor',async()=>{
 const onBack=vi.fn();await render({onBack});const viewer=await ready();
 const stalled=deferred<void>();viewer.flush.mockReturnValueOnce(stalled.promise);
 await click(button(/^(SQL представления|View SQL)$/));
 expect(back().disabled).toBe(false);await click(back());expect(onBack).toHaveBeenCalledOnce();
 await render({onBack,visible:false});await act(async()=>stalled.resolve());
 expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
});

it('refreshes with the saved workspace and disposes the previous runtime first',async()=>{
 await render();const first=await ready();await click(button(/^(Обновить|Refresh)$/));
 await vi.waitFor(()=>expect(host.querySelector('perspective-viewer')).not.toBe(first));
 const second=await ready();expect(second.restoreWorkspace).toHaveBeenCalledWith(workspace);
 expect(sdk.events.indexOf('viewer.save')).toBeLessThan(sdk.events.indexOf('viewer.delete'));
 expect(sdk.events.indexOf('viewer.delete')).toBeLessThan(sdk.events.indexOf('client.terminate'));
});

it('changing the source does not restore the previous source workspace',async()=>{
 await render();const first=await ready();await render({source:{...source,table:'other'}});
 await vi.waitFor(()=>expect(host.querySelector('perspective-viewer')).not.toBe(first));
 const second=await ready();expect(second.restoreWorkspace).not.toHaveBeenCalled();expect(second.restore).toHaveBeenCalled();
});

it('explicit close is idempotent and releases viewer, client and handlers',async()=>{
 const ref=createRef<ExploreHandle>();await render({ref});await ready();
 await act(async()=>{await Promise.all([ref.current!.close(),ref.current!.close()]);});
 for(const event of ['viewer.delete','table.free','client.terminate','client.free','server.free','handler.free','paths.restore'])expect(sdk.events.filter(x=>x===event)).toHaveLength(1);
 expect(host.querySelector('perspective-viewer')).toBeNull();
});

it('hiding and reopening retains the same Viewer without recreating its runtime',async()=>{
 const onBack=vi.fn();await render({onBack});const viewer=await ready();
 await render({onBack,visible:false});expect(host.querySelector('section')?.style.display).toBe('none');
 await render({onBack,visible:true});expect(host.querySelector('perspective-viewer')).toBe(viewer);
 expect(sdk.load).toHaveBeenCalled();expect(viewer.delete).not.toHaveBeenCalled();
});

it('cleanup continues after save and viewer deletion failures',async()=>{
 const ref=createRef<ExploreHandle>();await render({ref});const viewer=await ready();
 viewer.saveWorkspace.mockRejectedValueOnce(Error('save failed'));
 viewer.delete.mockRejectedValueOnce(Error('delete failed'));
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 await act(async()=>{await ref.current!.close();});
 expect(warn).toHaveBeenCalledTimes(2);
 for(const event of ['table.free','client.terminate','client.free','server.free','handler.free','paths.restore'])expect(sdk.events).toContain(event);
 expect(host.querySelector('perspective-viewer')).toBeNull();
});

it('closing during initialization does not mount a late Viewer',async()=>{
 const loading=deferred<any>();sdk.load.mockReturnValueOnce(loading.promise);
 const ref=createRef<ExploreHandle>();await render({ref});
 const closing=ref.current!.close();await act(async()=>loading.resolve(runtime));await closing;
 expect(host.querySelector('perspective-viewer')).toBeNull();
});

it('source switching waits for old cleanup before opening the next connection',async()=>{
 await render();const first=await ready();
 const deletion=deferred<void>();first.delete.mockImplementationOnce(()=>deletion.promise);
 const opened=sdk.load.mock.calls.length;
 await render({source:{...source,table:'other'}});
 expect(sdk.load.mock.calls.length).toBe(opened);
 expect(sdk.events).not.toContain('client.free');
 await act(async()=>deletion.resolve());
 await vi.waitFor(()=>expect(sdk.load.mock.calls.length).toBe(opened+1));
 const second=await ready();expect(second).not.toBe(first);
 expect(sdk.events).toContain('client.free');
});
