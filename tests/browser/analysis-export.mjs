// Supported HTML: Datagrid state/metrics. Charts are checked as PNG inside Lens.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader'],...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const out=resolve(process.env.ANALYSIS_EXPORT_RESULTS??'test-results-dashboard');await mkdir(out,{recursive:true});
async function coloredPixels(png){
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let colored=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]>0&&Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>30)colored++;
 assert.ok(info.width>0&&info.height>0);return colored;
}
try{
 const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>{errors.push(String(e));console.error('[pageerror]',e.stack??String(e));});
 page.on('console',m=>{if(['error','warning'].includes(m.type()))console.error('[browser '+m.type()+']',m.text());});
 page.on('requestfailed',r=>console.error('[requestfailed]',r.url(),r.failure()?.errorText));
 await page.goto(`${process.env.ANALYSIS_URL??'http://127.0.0.1:3000'}/tests/browser/analysis-export.html`);
 await page.waitForFunction(()=>{
  const failure=document.querySelector('.explore-status[role="alert"]');if(failure?.textContent)throw Error(failure.textContent);
  const button=document.querySelector('.explore-toolbar button[title]');
  return document.querySelector('perspective-viewer')&&button&&!button.disabled;
 },null,{timeout:60000});
 assert.equal(await page.evaluate(async()=> (await document.querySelector('perspective-viewer').save()).title),'dashboard_source');
 const reports=[];
 for(const plugin of ['Datagrid']){
  const label=plugin.replaceAll(' ','-');const title=`Regional ${plugin}`;
  const expected=await page.evaluate(async({plugin,title})=>{
   const viewer=document.querySelector('perspective-viewer');
   await viewer.restore({title,plugin,settings:false,columns:['quantity'],group_by:['region'],split_by:[],filter:[['quantity','>',2]],aggregates:{quantity:'sum'},plugin_config:{}});
   await viewer.flush();return {config:await viewer.save(),values:await (await viewer.getView()).to_json()};
  },{plugin,title});
  const filename=`regional-${label}.html`;
  const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(async filename=>{
   const {exportNativeMenuChoice}=await import('/src/analysis/exportData.ts');
   await exportNativeMenuChoice(document.querySelector('perspective-viewer'),'html',filename);
  },filename)]);
  assert.equal(download.suggestedFilename(),filename);
  const path=resolve(out,filename);await download.saveAs(path);
  assert.match(await readFile(path,'utf8'),/https:\/\//);
  const online=await browser.newContext();const restored=await online.newPage();const replayErrors=[];
  restored.on('pageerror',e=>{replayErrors.push(String(e));console.error('[HTML pageerror]',e.stack??String(e));});
  restored.on('console',m=>{if(['error','warning'].includes(m.type()))console.error('[HTML '+m.type()+']',m.text());});
  restored.on('requestfailed',r=>console.error('[HTML requestfailed]',r.url(),r.failure()?.errorText));
  try{
   await restored.goto(pathToFileURL(path).href);
   await restored.waitForFunction(()=>typeof document.querySelector('perspective-viewer')?.flush==='function',null,{timeout:90000});
   const deadline=Date.now()+90000;let actual,lastReason='HTML not ready';
   while(Date.now()<deadline){
    if(replayErrors.length)throw Error(replayErrors.join('\n'));
    const result=await restored.evaluate(async({plugin,title})=>{
     try{
      const viewer=document.querySelector('perspective-viewer');await viewer.flush();const config=await viewer.save();
      if(config.title!==title||config.plugin!==plugin||JSON.stringify(config.group_by)!==JSON.stringify(['region']))return {ready:false,reason:'Waiting for panel restore'};
      const view=await viewer.getView();if(!(await view.num_rows()))return {ready:false,reason:'Waiting for rows'};
      return {ready:true,config,values:await view.to_json()};
     }catch(error){return {ready:false,reason:String(error)};}
    },{plugin,title});
    if(result.ready){actual=result;break;}lastReason=result.reason;await restored.waitForTimeout(100);
   }
   assert.ok(actual,`${plugin} did not restore: ${lastReason}`);
   for(const key of ['plugin','title','columns','group_by','split_by','filter','aggregates'])assert.deepEqual(actual.config[key],expected.config[key],`${plugin}: ${key}`);
   assert.deepEqual(actual.values,expected.values,`${plugin}: metrics`);
   assert.deepEqual(replayErrors,[]);reports.push({plugin,format:'html',metricsMatch:true});
   console.log(`Stock HTML ${plugin}: configuration and metrics matched.`);
  }catch(error){await restored.screenshot({path:resolve(out,`${label}-failure.png`)}).catch(()=>{});throw error;}
  finally{await online.close();}
 }
 // Keep chart PNG tests in Lens; file:// chart HTML is outside supported scope.
 for(const plugin of ['X Bar','Y Line']){
  await page.evaluate(async plugin=>{
   const viewer=document.querySelector('perspective-viewer');
   await viewer.restore({title:`Regional ${plugin}`,plugin,settings:false,columns:['quantity'],group_by:['region'],split_by:[],filter:[['quantity','>',2]],aggregates:{quantity:'sum'},plugin_config:{}});
   await viewer.flush();
  },plugin);
  const pngName=`regional-${plugin.replaceAll(' ','-')}.png`;
  const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(async filename=>{
   const {exportNativeMenuChoice}=await import('/src/analysis/exportData.ts');
   await exportNativeMenuChoice(document.querySelector('perspective-viewer'),'plugin',filename);
  },pngName)]);
  assert.equal(download.suggestedFilename(),pngName);
  const path=resolve(out,pngName);await download.saveAs(path);
  assert.ok(await coloredPixels(await readFile(path))>20,`${plugin}: PNG should contain plotted colors`);
  reports.push({plugin,format:'png',rendered:true});
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'checks.json'),JSON.stringify(reports,null,2));
 await context.close();
}finally{await browser.close();}
