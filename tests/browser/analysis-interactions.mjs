import assert from 'node:assert/strict';

export async function checkAnalysisInteractions(page) {
 let timer;
 const run=page.evaluate(async()=>{
  const mark=stage=>{window.__analysisInteractionStage=stage;console.info('[interaction]',stage);};
  mark('save original workspace');
  const viewer=document.querySelector('perspective-viewer');
  const original=await viewer.saveWorkspace();
  const {getAnalysisWasmConnection}=await import('/src/lib/duckdbWasm.ts');
  const conn=await getAnalysisWasmConnection();
  try {
   mark('configure detail');
   await viewer.restore({plugin:'Datagrid',columns:['quantity'],group_by:['region'],split_by:[],filter:[],aggregates:{quantity:'sum'},plugin_config:{}});
   const detail=viewer.getActivePanel();
   mark('add master');
   const master=await viewer.addPanel({table:'memory.dashboard_filter_source',plugin:'Datagrid',columns:['region'],title:'Filter source'});
   mark('set master role');
   await viewer.restoreWorkspace({masters:[master]});
   await viewer.flush();
   const data=async panel=>await (await viewer.getView({panel})).to_json();
   mark('read initial detail');
   const before=await data(detail);
   mark('read initial master');
   const masterBefore=await data(master);
   // Dispatch the plugin's real selection contract, attributed to the master panel.
   const PerspectiveSelectDetail=window.__analysisSelectDetail;
   const plugin=Array.from(viewer.children).find(child=>child.getAttribute('slot')===master);
   if(!plugin)throw Error('Master plugin is not mounted');
   const config={filter:[['region','==','Москва']]};
   const select=async detail=>{
    const applied=new Promise(resolve=>viewer.addEventListener('perspective-global-filter-update',resolve,{once:true}));
    plugin.dispatchEvent(new CustomEvent('perspective-global-filter',{bubbles:true,composed:true,detail}));
    mark('await global filter event');
    await applied;mark('flush after filter event');await viewer.flush();
   };
   mark('select master value');
   await select(new PerspectiveSelectDetail(true,{region:'Москва'},['region'],[],[config],master));
   mark('read filtered detail');
   const filtered=await data(detail);
   const masterAfter=await data(master);
   const workspace=await viewer.saveWorkspace();
   const expected=(await conn.query("SELECT SUM(quantity)::DOUBLE AS quantity FROM dashboard_source WHERE region='Москва'")).toArray()[0].toJSON().quantity;
   if(!workspace.global_filters?.length)throw Error('Master selection did not create a global filter');
   if(filtered.some(row=>row.__ROW_PATH__?.length && row.__ROW_PATH__[0]!=='Москва'))throw Error('Detail contains unselected regions');
   const total=filtered.find(row=>row.__ROW_PATH__?.length===0);
   if(Number(total?.quantity)!==expected)throw Error('Filtered detail total differs from SQL');
   if(JSON.stringify(masterAfter)!==JSON.stringify(masterBefore))throw Error('Master must not filter itself');
   mark('clear selection');
   await select(new PerspectiveSelectDetail(false,{},[],[config],[],master));
   if(JSON.stringify(await data(detail))!==JSON.stringify(before))throw Error('Removing selection did not restore detail');
   // Reapply, then remove the filter source: no orphan selection may remain.
   mark('select master value');
   await select(new PerspectiveSelectDetail(true,{region:'Москва'},['region'],[],[config],master));
   mark('remove master');
   await viewer.removePanel(master);await viewer.flush();
   if(JSON.stringify(await data(detail))!==JSON.stringify(before))throw Error('Removing master left a stale detail filter');
   // Queue valid projection changes, as when quickly removing columns.
   await viewer.restore({columns:['id','amount','quantity'],group_by:[],split_by:[],filter:[],sort:[]},{panel:detail});
   mark('rapid projection updates');
   await Promise.all([
    viewer.restore({columns:['amount','quantity']},{panel:detail}),
    viewer.restore({columns:['quantity']},{panel:detail}),
   ]);
   await viewer.flush();
   const final=await (await viewer.getView({panel:detail})).get_config();
   if(JSON.stringify(final.columns)!==JSON.stringify(['quantity']))throw Error('Rapid projection updates lost the final state');
   return {feature:'panel-interactions',crossTableFilter:true,clearSelection:true,removeMaster:true,rapidColumns:true};
  } finally {
   mark('restore original workspace');
   await viewer.restoreWorkspace(original);await viewer.flush();
  }
 });
 const result=await Promise.race([run,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Panel interaction test stalled')),60000);})]).catch(async error=>{const stage=await page.evaluate(()=>window.__analysisInteractionStage).catch(()=> 'unavailable');throw Error(`${error.message} (stage: ${stage})`);}).finally(()=>clearTimeout(timer));
 assert.equal(result.crossTableFilter,true);
 return result;
}
