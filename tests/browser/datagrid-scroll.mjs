import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function checkDatagridScroll(page, out) {
 const reports=[];
 for(const lens of [false,true]) for(const patched of [false,true]) {
  const result=await page.evaluate(async options=>{
   const {runDatagridProbe}=await import('/tests/browser/datagrid-probe.js');
   return runDatagridProbe(options);
  },{lens,patched});
  reports.push(result);
  if(patched){
   assert.ok(result.samples.every(sample=>sample.cells>0),`Datagrid cells disappeared: ${JSON.stringify(result)}`);
   assert.ok(result.valuesUnchanged,'Viewport fix must not change values');
  }
 }
 await writeFile(resolve(out,'grid-scroll.json'),JSON.stringify(reports,null,2));
 console.log('Wide group headers: compared plain/Lens containers and checked patched horizontal scrolling.');
}
