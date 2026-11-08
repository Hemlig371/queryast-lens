import {pagedJsonBlob,sourceArrowIpc} from './exportPaged';
import {bindHtmlReplay} from './htmlReplay';
export async function csvExportBlob(view: any, pageRows = 50_000, selection: any = {}) {
  const rows = await view.num_rows();
  const chunks: string[] = [];
  let header = '';
  const first=selection.start_row??0, endRow=Math.min(rows,selection.end_row??rows);
  for (let start = first; start < Math.max(endRow, first+1); start += pageRows) {
    const csv = await view.to_csv({...selection,start_row:start, end_row:Math.min(endRow, start + pageRows)});
    const end = csvHeaderEnd(csv);
    if (start === first) { header = csv.slice(0,end); chunks.push(csv); }
    else {
      if (csv.slice(0,end) !== header) throw new Error('CSV columns changed during export');
      chunks.push(csv.slice(end));
    }
  }
  return new Blob(chunks, {type:'text/csv;charset=utf-8'});
}

/** Locate the first CSV record, allowing quoted newlines and escaped quotes. */
export function csvHeaderEnd(csv: string) {
  let quoted = false;
  for (let i=0;i<csv.length;i++) {
    if (csv[i] === '"') {
      if (quoted && csv[i+1] === '"') i++;
      else quoted = !quoted;
    } else if (csv[i] === '\n' && !quoted) return i+1;
  }
  return csv.length;
}

export async function exportNativeMenuChoice(viewer: any, method: string, filename: string) {
  const panel=viewer.getActivePanel?.();
  const options=panel?{panel}:undefined;
  const match=/^(csv|json|ndjson|arrow)(?:-(lz4|zstd))?(?:-(all|selected))?$/.exec(method);
  if(method==='html') {
    // Keep the SDK HTML document; its download() hard-codes "untitled".
    const data=await viewer.export({method,...options});
    const html=data instanceof Blob?await data.text():data;
    if(typeof html!=='string')throw new Error('Perspective HTML export returned an unsupported value');
    const blob=new Blob([bindHtmlReplay(html)],{type:'text/html;charset=utf-8'});
    downloadExportBlob(viewer,blob,filename);
    return;
  }
  if(method==='plugin') {
    const data=await viewer.export({method,...options});
    const blob=data instanceof Blob?data:typeof data==='string'&&filename.endsWith('.txt')?new Blob([data],{type:'text/plain;charset=utf-8'}):undefined;
    if(!blob)throw new Error('Perspective plugin export returned an unsupported value');
    downloadExportBlob(viewer,blob,filename);
    return;
  }
  if(!match)return viewer.download({method,...options});
  const [,format,codec,scope]=match;
  const selection=scope==='selected'?viewer.getSelection(options):undefined;
  if(scope==='selected'&&!selection)throw Error('Select a data region before exporting the selection');
  let view;
  try {
    if(scope==='all') {
      const table=await viewer.getTable(options);
      view=await table.view({columns:Object.keys(await table.schema())});
    } else view=await viewer.getView(options);
    let blob:Blob;
    if(format==='csv')blob=await csvExportBlob(view,50_000,selection);
    else if(format==='json'||format==='ndjson')blob=await pagedJsonBlob(view,format==='ndjson',50_000,selection);
    else {
      let bytes=await sourceArrowIpc(view,50_000,selection);
      if(codec){const {compressArrowIpc}=await import('./arrowCompression');bytes=await compressArrowIpc(bytes,codec as 'lz4'|'zstd');}
      blob=new Blob([bytes],{type:'application/vnd.apache.arrow.stream'});
    }
    downloadExportBlob(viewer,blob,filename);
  } finally {if(scope==='all')await view?.delete();}
}

function downloadExportBlob(viewer: any, blob: Blob, filename: string) {
  const document = viewer.ownerDocument;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename; link.href = url; link.style.display = 'none';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
