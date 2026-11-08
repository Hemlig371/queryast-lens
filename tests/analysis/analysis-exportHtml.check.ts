import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tableFromArrays,tableToIPC,tableFromIPC} from 'apache-arrow';
import {htmlExportBlob,renderHtmlParts} from '../../src/analysis/exportHtml';
import {workspaceSources,remapWorkspaceSources} from '../../src/analysis/workspaceExport';

const workspace={version:'5.8.0',active:'chart',panels:{grid:{table:'memory.source',plugin:'Datagrid'},chart:{table:'derived',plugin:'Y Bar',title:'</script><script>bad()</script>'}},derived_tables:{derived:{table:'memory.source',group_by:['label']}},layout:{},global_filters:[['label','==','Москва']],masters:['grid'],palette:{color:'red'}};
test('offline HTML embeds all data, the whole workspace and runtime without external resource tags',()=>{
 const table=tableFromArrays({id:Int32Array.from([1,2]),label:['Привет','</script><img src=x>']});
 const htmlParts=renderHtmlParts([{name:'memory.source',ipc:tableToIPC(table,'stream')}],workspace,new Uint8Array([1,2,3]));
 return new Blob(htmlParts).text().then(html=>{
  const config=JSON.parse(html.match(/id="layout" type="application\/json">([\s\S]*?)<\/script>/)![1]);
  assert.equal(config.panels.grid.table,'memory.lens_source_0');assert.equal(config.panels.chart.table,'derived');
  assert.equal(config.derived_tables.derived.table,'memory.lens_source_0');
  assert.equal(config.panels.chart.title,'</script><script>bad()</script>');
  assert.deepEqual(config.global_filters,workspace.global_filters);assert.deepEqual(config.masters,['grid']);
  const bytes=Uint8Array.from(atob(html.match(/id="data-0" type="application\/octet-stream">([\s\S]*?)<\/script>/)![1]),c=>c.charCodeAt(0));
  assert.equal(tableFromIPC(bytes).numRows,2);
  assert.ok(!html.includes('<script>bad()'));assert.ok(!/<script[^>]+src=|<link[^>]+href=/.test(html));
  assert.ok(html.includes('DecompressionStream'));assert.ok(html.includes('id="runtime"'));
 });
});

test('workspace root discovery preserves derivations, deduplicates physical sources and rejects cycles',()=>{
 assert.deepEqual(workspaceSources(workspace),['memory.source']);
 assert.equal(remapWorkspaceSources(workspace,new Map([['memory.source','new']])).panels.grid.table,'new');
 assert.equal(workspace.panels.grid.table,'memory.source');
 assert.throws(()=>workspaceSources({panels:{a:{table:'x'}},derived_tables:{x:{table:'y'},y:{table:'x'}}}),/Cyclic/);
});

test('HTML pages each whole physical source once and releases temporary handles',async()=>{
 let deleted=0,freed=0;const windows:any[]=[];
 const view={num_rows:async()=>50_001,to_arrow:async(w:any)=>{windows.push(w);return tableToIPC(tableFromArrays({id:Int32Array.from({length:w.end_row-w.start_row},(_,i)=>w.start_row+i)}),'stream');},delete:async()=>{deleted++;}};
 const viewer={flush:async()=>{},getClient:async()=>({open_table:async()=>({schema:async()=>({id:'integer'}),view:async()=>view,free:()=>{freed++;}})}),saveWorkspace:async()=>workspace};
 const html=await (await htmlExportBlob(viewer,new Uint8Array([1]))).text();
 const bytes=Uint8Array.from(atob(html.match(/id="data-0" type="application\/octet-stream">([\s\S]*?)<\/script>/)![1]),c=>c.charCodeAt(0));
 const data=tableFromIPC(bytes);assert.equal(data.numRows,50_001);assert.equal(data.getChild('id')!.get(50_000),50_000);
 assert.equal(deleted,1);assert.equal(freed,1);assert.deepEqual(windows,[{start_row:0,end_row:50_000},{start_row:50_000,end_row:50_001}]);
});
