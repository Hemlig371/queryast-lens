// Built into a standalone, gzip-packed script. No Lens/editor modules or URLs.
import * as perspective from '@perspective-dev/client';
import * as viewerApi from '@perspective-dev/viewer';
import '@perspective-dev/viewer-datagrid';
import '@perspective-dev/viewer-charts';
import * as duckdb from '@duckdb/duckdb-wasm';
import {tableFromIPC} from 'apache-arrow';
import {DuckDBHandler} from '@perspective-dev/client/virtual_servers/duckdb';
import {client_runtime} from '@perspective-dev/client/registry';
import viewerWasm from '@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?base64';
import dbWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?base64';
import dbWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?raw';
import themes from '@perspective-dev/viewer/dist/css/themes.css?raw';
import {rawSourceArrow} from './rawSourceArrow';
import {installExportMenuBridge} from './exportMenu';
import {configureZstdWasm} from './arrowCompression';
import zstdWasm from '@lens-export/zstd.wasm?base64';
import {installDateSplitPathCompatibility} from './dateSplitPaths';

const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const status=document.getElementById('status')!;
void (async()=>{
  const style=document.createElement('style');style.textContent=themes;document.head.appendChild(style);
  await viewerApi.init({viewer:decode(viewerWasm)});
  await perspective.getCompiledClientWasm();
  const workerUrl=URL.createObjectURL(new Blob([dbWorker],{type:'application/javascript'}));
  const wasmUrl=URL.createObjectURL(new Blob([decode(dbWasm)],{type:'application/wasm'}));
  const worker=new Worker(workerUrl);
  const db=new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),worker);
  await db.instantiate(wasmUrl);URL.revokeObjectURL(wasmUrl);URL.revokeObjectURL(workerUrl);
  const conn=await db.connect();
  const tables=JSON.parse(document.getElementById('tables')!.textContent!);
  for(const table of tables){
    status.textContent=`Loading ${table.name}…`;
    const bytes=decode(document.getElementById(table.data)!.textContent!.trim());
    await conn.insertArrowTable(tableFromIPC(bytes),{name:table.name});
  }
  const handler=new DuckDBHandler(conn);
  const runtime=client_runtime()!.glue;
  const server=new runtime.VirtualServer(handler);
  let client:any;
  client=await perspective.make_client(async bytes=>{await client.handle_response((await server.handleRequest(bytes)).slice());},()=>{});
  // Match Lens's scoped date-header compatibility; no remote resources/queries.
  const schema:Record<string,string>={};
  const conflicts=new Set<string>();
  for(const source of tables){
    const table=await client.open_table(`memory.${source.name}`);
    for(const [name,type] of Object.entries(await table.schema())){
      if(schema[name]&&schema[name]!==type)conflicts.add(name);
      schema[name]=String(type);
    }
    table.free();
  }
  for(const name of conflicts)delete schema[name];
  installDateSplitPathCompatibility(runtime.View,schema);
  const viewer=document.getElementById('viewer') as viewerApi.HTMLPerspectiveViewerElement;
  await viewer.load(client);
  await viewer.resetThemes();
  await viewer.restoreWorkspace(JSON.parse(document.getElementById('layout')!.textContent!));
  await viewer.flush();status.remove();
  configureZstdWasm(()=>URL.createObjectURL(new Blob([decode(zstdWasm)],{type:'application/wasm'})));
  const removeExport=installExportMenuBridge(viewer,{
    start:()=>{status.textContent='Preparing export…';document.body.appendChild(status);},
    success:()=>status.remove(),
    error:error=>{status.textContent=`Export: ${String(error)}`;document.body.appendChild(status);},
  },(name,rows)=>rawSourceArrow(conn,name,rows));
  window.addEventListener('pagehide',()=>{removeExport();worker.terminate();},{once:true});
})().catch(error=>{status.textContent=`Cannot open dashboard: ${String(error)}`;console.error(error);});
