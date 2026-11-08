import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {keepDataColumn,installDatagridViewport} from '../../src/analysis/datagridViewport';

// Exercise the actual installed 0.9.2 planner without requiring a browser layout.
const require=createRequire(import.meta.url);
const source=await readFile(resolve(dirname(require.resolve('regular-table')),'../../src/ts/scroll_panel.ts'),'utf8');
const start=source.indexOf('private _plan_column_extent(');assert.ok(start>=0);
let end=source.indexOf('{',start),depth=1;const body=end;
while(depth){end++;if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
assert.ok(body>start);
const method=source.slice(start,end+1).replace(/^private\s+/,'');
const code=ts.transpileModule(`exports.Grid=class {${method}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{} as any};vm.runInNewContext(code,context);
const planner=context.exports.Grid.prototype._plan_column_extent;
const grid=(header:number)=>({_plan_column_extent:planner,_virtual_mode:'both',_column_sizes:{indices:[24,header,...Array(20).fill(80)],override:{}},_view_cache:{row_headers_length:2},_container_size:{width:800}});

test('real regular-table planner returns no data columns for over-wide group header; instance fix retains one',()=>{
 const table=grid(5000);
 assert.equal(table._plan_column_extent({start_col:0,end_col:20},20),0);
 const dispose=keepDataColumn(table);
 for(const start_col of [0,1,10,19])assert.equal(table._plan_column_extent({start_col,end_col:20},20),start_col+1);
 dispose();assert.equal(table._plan_column_extent,planner);
});

test('normal windows, zero-column sources and non-horizontal modes keep SDK behavior',()=>{
 const table=grid(100),window={start_col:0,end_col:0};
 const expected=planner.call(table,window,20);const dispose=keepDataColumn(table);
 assert.equal(table._plan_column_extent(window,20),expected);
 assert.equal(table._plan_column_extent(window,0),0);
 table._virtual_mode='vertical';assert.equal(table._plan_column_extent(window,20),0);
 dispose();
});

test('plugin removal and exploration close restore original methods',async()=>{
 const dom=new JSDOM('<perspective-viewer><perspective-viewer-datagrid></perspective-viewer-datagrid></perspective-viewer>');
 const viewer=dom.window.document.querySelector('perspective-viewer')! as HTMLElement;
 const plugin=viewer.firstElementChild! as any;const table=grid(5000);plugin.regular_table=table;
 const dispose=installDatagridViewport(viewer);assert.notEqual(table._plan_column_extent,planner);
 plugin.remove();await Promise.resolve();assert.equal(table._plan_column_extent,planner);
 viewer.append(plugin);await Promise.resolve();assert.notEqual(table._plan_column_extent,planner);
 dispose();assert.equal(table._plan_column_extent,planner);dom.window.close();
});
