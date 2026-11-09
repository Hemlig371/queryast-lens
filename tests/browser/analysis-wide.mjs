import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function checkWideTableStress(page,out) {
 const reports=[];
 let timer;
 const run=(async()=>{
  const original=await page.evaluate(async()=>{
   window.__analysisWideStage='save initial workspace';
   const viewer=document.querySelector('perspective-viewer');await viewer.flush();
   return viewer.saveWorkspace();
  });
  try {
   for(let cycle=0;cycle<3;cycle++) {
    const state=await page.evaluate(async cycle=>{
     const mark=stage=>{window.__analysisWideStage=`cycle ${cycle+1}: ${stage}`;};
     const viewer=document.querySelector('perspective-viewer');
     const {wideMetrics}=await import('/tests/fixtures/analysis-wide.mjs');
     const {getAnalysisWasmConnection}=await import('/src/lib/duckdbWasm.ts');
     const conn=await getAnalysisWasmConnection();
     const temporaryCount=async()=>Number((await conn.query('SELECT count(*) AS n FROM duckdb_tables() WHERE temporary')).toArray()[0].toJSON().n);
     mark('open wide pivot');const baseline=await temporaryCount();
     const panel=await viewer.addPanel({table:'memory.dashboard_wide',plugin:'Datagrid',title:'Wide stress',
      columns:wideMetrics,group_by:['region','day'],split_by:['category'],
      aggregates:Object.fromEntries(wideMetrics.map(name=>[name,'sum']))});
     await viewer.restoreWorkspace({active:panel});await viewer.flush();
     mark('rapidly remove columns');
     // Submit without waiting for each individual render, like fast UI edits.
     await Promise.all([28,24,20,16,12,8,4,1].map(count=>viewer.restore({columns:wideMetrics.slice(0,count)},{panel})));
     await viewer.flush();
     const view=await viewer.getView({panel});const config=await view.get_config();
     if(JSON.stringify(config.columns)!==JSON.stringify([wideMetrics[0]]))throw Error('Final column configuration was lost');
     mark('compare final pivot with SQL');
     const rows=await view.to_json();const total=rows.find(row=>row.__ROW_PATH__?.length===0);
     const expected=(await conn.query('SELECT category,SUM(metric_00) AS value FROM dashboard_wide GROUP BY category')).toArray().map(row=>row.toJSON());
     for(const row of expected)if(Number(total?.[`${row.category}|metric_00`])!==Number(row.value))throw Error('Wide pivot differs from SQL');
     return {panel,baseline,cycle:cycle+1,rows:rows.length};
    },cycle);
    if(cycle===1) {
     await page.evaluate(()=>{window.__analysisWideStage='refresh wide workspace';});
     const previous=await page.$('perspective-viewer');
     try {
      await page.getByRole('button',{name:/^(Обновить|Refresh)$/}).click();
      await page.waitForFunction(old=>document.querySelector('perspective-viewer')!==old,previous,{timeout:30000});
      await page.waitForFunction(()=>{
       const failure=document.querySelector('.explore-status[role="alert"]');
       if(failure?.textContent)throw Error(failure.textContent);
       return document.querySelector('perspective-viewer')?.style.visibility==='visible' &&
        !document.querySelector('.explore-toolbar button[title]')?.disabled;
      },null,{timeout:30000});
     } finally {await previous?.dispose();}
     await page.evaluate(async panel=>{
      const viewer=document.querySelector('perspective-viewer');
      const config=await (await viewer.getView({panel})).get_config();
      if(JSON.stringify(config.columns)!==JSON.stringify(['metric_00']))throw Error('Refresh lost the wide panel configuration');
      await viewer.flush();
     },state.panel);
    }
    const remaining=await page.evaluate(async panel=>{
     window.__analysisWideStage='remove wide panel and verify cleanup';
     const viewer=document.querySelector('perspective-viewer');
     await viewer.removePanel(panel);await viewer.flush();
     const {getAnalysisWasmConnection}=await import('/src/lib/duckdbWasm.ts');
     const conn=await getAnalysisWasmConnection();
     return Number((await conn.query('SELECT count(*) AS n FROM duckdb_tables() WHERE temporary')).toArray()[0].toJSON().n);
    },state.panel);
    assert.equal(remaining,state.baseline,`Cycle ${cycle+1}: temporary View tables accumulated`);
    reports.push({...state,temporaryTablesAfterClose:remaining});
   }
  } finally {
   await page.evaluate(async original=>{
    window.__analysisWideStage='restore initial workspace';
    const viewer=document.querySelector('perspective-viewer');
    await viewer.restoreWorkspace(original);await viewer.flush();
   },original);
  }
 })();
 try {
  await Promise.race([run,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Wide table stress test stalled')),120000);})]);
 } catch(error) {
  const stage=await page.evaluate(()=>window.__analysisWideStage).catch(()=> 'unavailable');
  await page.screenshot({path:resolve(out,'wide-stress-failure.png')}).catch(()=>{});
  throw Error(`${error.message} (stage: ${stage})`);
 } finally {
  clearTimeout(timer);
  await writeFile(resolve(out,'wide-stress.json'),JSON.stringify(reports,null,2));
 }
 console.log('Wide table: 50000 rows, 36 columns, 3 open/edit/close cycles and workspace refresh passed.');
 return {feature:'wide-table-stress',sourceRows:50000,sourceColumns:36,cycles:reports.length,refresh:true};
}
