// Run against a local Vite server. Stock HTML uses CDN assets in a fresh online context.
import assert from 'node:assert/strict';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
const out=resolve(process.env.ANALYSIS_EXPORT_RESULTS??'test-results-dashboard');await mkdir(out,{recursive:true});
try{
 const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>{errors.push(String(e));console.error('[pageerror]',e.stack??String(e));});
 page.on('console',message=>{if(['error','warning'].includes(message.type()))console.error('[browser '+message.type()+']',message.text());});
 page.on('requestfailed',request=>console.error('[requestfailed]',request.url(),request.failure()?.errorText));
 page.on('response',response=>{if(response.status()>=400)console.error('[http]',response.status(),response.url());});
 await page.goto(`${process.env.ANALYSIS_URL??'http://127.0.0.1:3000'}/tests/browser/analysis-export.html`);
 await page.waitForFunction(()=>{
  const failure=document.querySelector('.explore-status[role="alert"]');
  if(failure?.textContent)throw new Error(failure.textContent);
  const refresh=document.querySelector('.explore-toolbar button[title]');
  return document.querySelector('perspective-viewer')&&refresh&&!refresh.disabled;
 },null,{timeout:60000});
 assert.equal(await page.evaluate(async()=> (await document.querySelector('perspective-viewer').save()).title),'dashboard_source');
 const expected=await page.evaluate(async()=>{
  const viewer=document.querySelector('perspective-viewer');
  await viewer.restore({title:'Regional report',plugin:'Datagrid',columns:['quantity'],group_by:['region'],split_by:[],filter:[['quantity','>',2]],aggregates:{quantity:'sum'}});
  await viewer.flush();
  return (await viewer.getView()).to_json();
 });
 const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(async()=>{
  const {exportNativeMenuChoice}=await import('/src/analysis/exportData.ts');
  await exportNativeMenuChoice(document.querySelector('perspective-viewer'),'html','regional-report.html');
 })]);
 assert.equal(download.suggestedFilename(),'regional-report.html');
 const path=resolve(out,'dashboard.html');await download.saveAs(path);
 const html=await readFile(path,'utf8');
 assert.match(html,/https:\/\//,'stock HTML should reference its CDN runtime');
 const online=await browser.newContext();const restored=await online.newPage();
 const replayErrors=[];
 restored.on('pageerror',e=>{replayErrors.push(String(e));console.error('[HTML pageerror]',e.stack??String(e));});
 restored.on('requestfailed',r=>console.error('[HTML requestfailed]',r.url(),r.failure()?.errorText));
 await restored.goto(pathToFileURL(path).href);
 // waitForFunction must use a synchronous predicate: an async false result can
 // finish polling before the CDN custom element has been upgraded.
 await restored.waitForFunction(()=>typeof document.querySelector('perspective-viewer')?.flush==='function',null,{timeout:90000});
 const deadline=Date.now()+90000;
 let actual,lastReason='HTML viewer is not ready';
 while(Date.now()<deadline){
  if(replayErrors.length)throw Error(replayErrors.join('\n'));
  const result=await restored.evaluate(async()=>{
   try{
    const viewer=document.querySelector('perspective-viewer');await viewer.flush();
    const config=await viewer.save();
    if(config.title!=='Regional report'||JSON.stringify(config.group_by)!==JSON.stringify(['region']))return {ready:false,reason:'Waiting for restored panel configuration'};
    const view=await viewer.getView();
    if(!(await view.num_rows()))return {ready:false,reason:'Waiting for rows'};
    return {ready:true,values:await view.to_json()};
   }catch(error){return {ready:false,reason:String(error)};}
  });
  if(result.ready){actual=result.values;break;}
  lastReason=result.reason;
  await restored.waitForTimeout(100);
 }
 assert.ok(actual,`Stock HTML did not become ready: ${lastReason}`);
 assert.deepEqual(actual,expected);
 assert.deepEqual(errors,[]);assert.deepEqual(replayErrors,[]);
 await writeFile(resolve(out,'checks.json'),JSON.stringify({rows:12000,stockHTML:true,internetRequired:true,metricsMatch:true},null,2));
 console.log('Stock HTML file:// replay matched active panel grouping, filter and metrics.');
 await context.close();await online.close();
}finally{await browser.close();}

