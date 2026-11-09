import assert from 'node:assert/strict';

export async function checkColumnSettings(page) {
  const result=await page.evaluate(async()=>{
    const viewer=document.querySelector('perspective-viewer');
    const metric='New Column 1';
    await viewer.restore({plugin:'Datagrid',settings:true,columns:[metric],
      expressions:{[metric]:'"quantity" * 2'},aggregates:{[metric]:'sum'},
      group_by:['region'],split_by:['quantity'],filter:[],sort:[],plugin_config:{}});
    await viewer.flush();
    const opened=new Promise(resolve=>viewer.addEventListener('perspective-toggle-column-settings',event=>resolve(event.detail),{once:true}));
    await viewer.toggleColumnSettings(metric);
    const detail=await opened;
    await viewer.flush();
    const actual=await (await viewer.getView()).get_min_max(metric);
    const {getAnalysisWasmConnection}=await import('/src/lib/duckdbWasm.ts');
    const conn=await getAnalysisWasmConnection();
    const row=(await conn.query(`SELECT CAST(MIN(value) AS DOUBLE) AS min, CAST(MAX(value) AS DOUBLE) AS max
      FROM (SELECT SUM(quantity * 2) AS value FROM dashboard_source GROUP BY region,quantity)`)).toArray()[0].toJSON();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const error=document.querySelector('.explore-status[role="alert"]')?.textContent??'';
    await viewer.toggleColumnSettings(metric);
    await viewer.reset(true);
    await viewer.flush();
    return {detail,actual,expected:[row.min,row.max],error};
  });
  assert.equal(result.detail.open,true,'Column settings should open');
  assert.equal(result.detail.column_name,'New Column 1');
  assert.deepEqual(result.actual,result.expected,'Column style range must match grouped SQL');
  assert.equal(result.error,'','Opening column settings must not report an adapter error');
  return {feature:'split-column-settings',rangeMatches:true};
}
