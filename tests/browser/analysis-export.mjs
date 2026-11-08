// Run against a local Vite server. The second browser context is offline + file://.
import assert from 'node:assert/strict';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
const out=resolve(process.env.ANALYSIS_EXPORT_RESULTS??'test-results-dashboard');await mkdir(out,{recursive:true});
try{
 const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.env.ANALYSIS_URL??'http://127.0.0.1:3000'}/tests/browser/analysis-export.html`);
 await page.waitForFunction(()=>document.querySelector('perspective-viewer'),{timeout:60000});
 const expected=await page.evaluate(async()=>{
  const viewer=document.querySelector('perspective-viewer');await viewer.flush();
  const ws=await viewer.saveWorkspace();const initial=Object.values(ws.panels)[0];
  const grid={...initial,title:'Grid',plugin:'Datagrid',columns:['region','amount','quantity'],group_by:[],split_by:[],filter:[]};
  const chart={...initial,title:'Chart',plugin:'Y Bar',columns:['double_amount'],group_by:['region'],split_by:[],filter:[],expressions:{double_amount:'CAST("amount" AS DOUBLE) * 2'},aggregates:{double_amount:'sum'}};
  await viewer.restoreWorkspace({...ws,panels:{grid,chart},active:'chart',layout:{type:'split-layout',orientation:'horizontal',sizes:[0.5,0.5],children:[{type:'tab-layout',tabs:['grid']},{type:'tab-layout',tabs:['chart']}]},global_filters:[['quantity','>',2]],masters:['grid']});
  await viewer.flush();
  const values={};for(const panel of ['grid','chart']){const view=await viewer.getView({panel});values[panel]=await view.to_json({start_row:0,end_row:12});}
  return {workspace:await viewer.saveWorkspace(),values};
 });
 const download=page.waitForEvent('download');
 await page.evaluate(async()=>{const {exportNativeMenuChoice}=await import('/src/analysis/exportData.ts');const {rawSourceArrow}=await import('/src/analysis/rawSourceArrow.ts');const {getAnalysisWasmConnection}=await import('/src/lib/duckdbWasm.ts');const conn=await getAnalysisWasmConnection();await exportNativeMenuChoice(document.querySelector('perspective-viewer'),'html','dashboard.html',(name,rows)=>rawSourceArrow(conn,name,rows));});
 const path=resolve(out,'dashboard.html');await (await download).saveAs(path);
 const html=await readFile(path,'utf8');assert.ok(!/<script[^>]+src=|<link[^>]+href=/.test(html));
 // No shared HTTP cache/service worker: this file must include all its runtime assets.
 const offline=await browser.newContext({offline:true});const restored=await offline.newPage();const requests=[];
 offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const offlineErrors=[];restored.on('pageerror',e=>offlineErrors.push(String(e)));
 await restored.goto(pathToFileURL(path).href);
 await restored.waitForFunction(()=>!document.getElementById('status'),{timeout:90000});
 const actual=await restored.evaluate(async()=>{
  const viewer=document.querySelector('perspective-viewer');await viewer.flush();const values={};
  for(const panel of ['grid','chart']){const view=await viewer.getView({panel});values[panel]=await view.to_json({start_row:0,end_row:12});}
  return {workspace:await viewer.saveWorkspace(),values};
 });
 assert.deepEqual(actual.values,expected.values);
 assert.deepEqual(actual.workspace.layout,expected.workspace.layout);
 assert.deepEqual(actual.workspace.global_filters,expected.workspace.global_filters);
 assert.deepEqual(actual.workspace.masters,expected.workspace.masters);
 assert.equal(actual.workspace.panels.chart.expressions.double_amount,'CAST("amount" AS DOUBLE) * 2');
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);assert.deepEqual(offlineErrors,[]);
 await writeFile(resolve(out,'checks.json'),JSON.stringify({panels:2,rows:12000,offline:true,httpRequests:0,sqlExpression:true,layout:true,globalFilters:true,metricsMatch:true},null,2));
 console.log('Dashboard file:// replay matched both panels, layout, filters and SQL expression with network disabled.');
 await context.close();await offline.close();
}finally{await browser.close();}
