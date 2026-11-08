// Loaded through Vite so bare package imports are resolved before browser evaluation.
export async function runDatagridProbe({lens,patched}) {
   const {loadPerspective}=await import('/src/analysis/sdk.ts');
   const {getAnalysisWasmConnection}=await import('/src/lib/duckdbWasm.ts');
   const {installDatagridViewport}=await import('/src/analysis/datagridViewport.ts');
   const perspective=await loadPerspective();const conn=await getAnalysisWasmConnection();
   const metrics=Array.from({length:24},(_,i)=>`m${i}`);
   await conn.query(`CREATE OR REPLACE TABLE lens_grid_probe AS SELECT CASE WHEN i%2=0 THEN repeat('LONG GROUP TEXT ',500) ELSE 'short' END AS group_name, ${metrics.map((name,i)=>`(i*${i+1})::INTEGER AS ${name}`).join(',')} FROM range(10) t(i)`);
   const {DuckDBHandler}=await import('@perspective-dev/client/virtual_servers/duckdb');
   const {client_runtime}=await import('@perspective-dev/client/registry');
   const handler=new DuckDBHandler(conn);const runtime=client_runtime().glue;
   const server=new runtime.VirtualServer(handler);let client;
   client=await perspective.make_client(async bytes=>client.handle_response((await server.handleRequest(bytes)).slice()),()=>{});
   const frame=document.createElement(lens?'section':'div');frame.className=lens?'lens-explore':'';
   frame.style.cssText='position:fixed;inset:0;z-index:250;width:100vw;height:100vh;background:white';
   if(lens)frame.innerHTML='<header class="explore-toolbar">Lens container probe</header><div class="explore-body"><div class="explore-viewer"></div></div>';
   const host=lens?frame.querySelector('.explore-viewer'):frame;
   const viewer=document.createElement('perspective-viewer');viewer.setAttribute('theme','Pro Light');
   if(!lens)viewer.style.cssText='position:absolute;inset:0;width:100%;height:100%;font-size:14px';
   host.append(viewer);document.body.append(frame);
   const dispose=patched?installDatagridViewport(viewer):()=>{};
   try{
    await viewer.load(client);
    await viewer.restore({table:'memory.lens_grid_probe',theme:'Pro Light',plugin:'Datagrid',columns:metrics,group_by:['group_name']});await viewer.flush();
    const plugin=Array.from(viewer.children).find(child=>child.tagName==='PERSPECTIVE-VIEWER-DATAGRID');
    const grid=plugin?.regular_table;if(!grid)throw Error('Datagrid regular-table was not mounted');
    const view=await viewer.getView();const expected=JSON.stringify(await view.to_json());
    const naturalCells=grid.querySelectorAll('tbody td').length;
    // Deterministically exercise the same boundary as an auto-sized long label.
    const label=grid.querySelector('tbody th.psp-tree-label');
    const headerKey=label?grid.getMeta(label)?.size_key??1:1;
    grid.restoreColumnSizes({...grid.saveColumnSizes(),[headerKey]:Math.max(5000,grid.clientWidth*3)});
    const samples=[];
    for(const ratio of [0,0.5,1,0]){
     grid.scrollLeft=(grid.scrollWidth-grid.clientWidth)*ratio;
     grid.dispatchEvent(new Event('scroll'));
     await grid.draw({invalid_viewport:true});
     await new Promise(requestAnimationFrame);
     samples.push({ratio,cells:grid.querySelectorAll('tbody td').length});
    }
    return {lens,patched,naturalCells,samples,valuesUnchanged:expected===JSON.stringify(await view.to_json())};
   }finally{
    dispose();await viewer.delete();frame.remove();await client.terminate();client.free();server.free();handler.sqlBuilder.free();
   }

}
