import type {SourceArrowReader} from './rawSourceArrow';
import {sourceArrowIpc} from './exportPaged';
import {workspaceSources,remapWorkspaceSources} from './workspaceExport';
export const scriptSafeJson=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c');
export const base64Bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export interface ExportTable { name:string; ipc:Uint8Array }

function appendBase64(parts:BlobPart[],bytes:Uint8Array){
  for(let start=0;start<bytes.length;start+=24576)parts.push(btoa(String.fromCharCode(...bytes.subarray(start,start+24576))));
}

export function renderHtmlParts(tables:ExportTable[],workspace:any,runtime:Uint8Array):BlobPart[]{
  const names=new Map(tables.map((table,index)=>[table.name,`memory.lens_source_${index}`]));
  const layout=remapWorkspaceSources(workspace,names);
  const parts:BlobPart[]=[`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QueryAST Lens — dashboard</title><style>html,body{margin:0;width:100%;height:100%}perspective-viewer{position:absolute;inset:0}#status{position:fixed;inset:12px auto auto 12px;z-index:10;font:14px system-ui;background:white;color:#172033;padding:10px;max-width:90vw;white-space:pre-wrap}</style></head><body><p id="status" role="status">Loading dashboard…</p><perspective-viewer id="viewer"></perspective-viewer>`];
  tables.forEach((table,index)=>{parts.push(`<script id="data-${index}" type="application/octet-stream">`);appendBase64(parts,table.ipc);parts.push('</script>');});
  parts.push(`<script id="tables" type="application/json">${scriptSafeJson(tables.map((_,index)=>({name:`lens_source_${index}`,data:`data-${index}`})))}</script><script id="layout" type="application/json">${scriptSafeJson(layout)}</script><script id="runtime" type="application/octet-stream">`);
  appendBase64(parts,runtime);
  parts.push(`</script><script>
(async()=>{try{
 const binary=atob(document.getElementById('runtime').textContent.trim());
 const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 let stream=new Blob([bytes]).stream();
 if(bytes[0]===31&&bytes[1]===139)stream=stream.pipeThrough(new DecompressionStream('gzip'));
 const script=document.createElement('script');script.type='module';script.textContent=await new Response(stream).text();document.body.appendChild(script);
}catch(error){document.getElementById('status').textContent='Cannot open dashboard: '+String(error);}})();
</script></body></html>`);
  return parts;
}

async function runtimeBytes(viewer:any){
  const embedded=viewer.ownerDocument?.getElementById('runtime');
  if(embedded)return base64Bytes(embedded.textContent.trim());
  const response=await fetch(new URL('analysis-export-runtime.js.gz',viewer.ownerDocument?.baseURI??document.baseURI));
  if(!response.ok)throw Error(`Offline runtime is unavailable (${response.status}); run npm run build:analysis-export`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function htmlExportBlob(viewer:any,runtime?:Uint8Array,readSource?:SourceArrowReader){
  await viewer.flush();
  const workspace=await viewer.saveWorkspace();
  const roots=workspaceSources(workspace);
  if(!roots.length)throw Error('The dashboard has no data sources');
  const client=await viewer.getClient();
  const tables:ExportTable[]=[];
  for(const name of roots){
    const table=await client.open_table(name);
    let view;
    try{
      if(readSource)tables.push({name,ipc:await readSource(name,await table.size())});
      else{view=await table.view({columns:Object.keys(await table.schema())});tables.push({name,ipc:await sourceArrowIpc(view)});}
    }
    finally{try{await view?.delete();}finally{table.free();}}
  }
  if(JSON.stringify(await viewer.saveWorkspace())!==JSON.stringify(workspace))throw Error('The dashboard changed during export; export it again');
  return new Blob(renderHtmlParts(tables,workspace,runtime??await runtimeBytes(viewer)),{type:'text/html;charset=utf-8'});
}
