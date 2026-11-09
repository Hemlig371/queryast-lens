export async function sourceArrowIpc(view: any, pageRows = 50_000, selection: any = {}) {
  const {tableFromIPC,tableToIPC}=await import('apache-arrow');
  const rows=await view.num_rows();const pages=[];
  const first=selection.start_row??0,endRow=Math.min(rows,selection.end_row??rows);
  for(let start=first;start<Math.max(endRow,first+1);start+=pageRows)pages.push(tableFromIPC(await view.to_arrow({...selection,start_row:start,end_row:Math.min(endRow,start+pageRows)})));
  return tableToIPC(pages[0].concat(...pages.slice(1)),'stream');
}

export async function pagedJsonBlob(view: any, ndjson: boolean, pageRows = 50_000, selection: any = {}) {
  const rows=await view.num_rows();
  const lines: string[]=[];const columns=new Map<string,string[]>();let names:string[]|undefined;
  const first=selection.start_row??0,endRow=Math.min(rows,selection.end_row??rows);
  for(let start=first;start<Math.max(endRow,first+1);start+=pageRows){
    const window={...selection,start_row:start,end_row:Math.min(endRow,start+pageRows)};
    if(ndjson){const chunk=await view.to_ndjson(window);if(chunk)lines.push(chunk.endsWith('\n')?chunk:chunk+'\n');}
    else{
      const data=await view.to_columns(window);const keys=Object.keys(data);
      if(names&&JSON.stringify(keys)!==JSON.stringify(names))throw Error('JSON columns changed during export');
      names=keys;
      for(const name of keys){if(!columns.has(name))columns.set(name,[]);const part=JSON.stringify(data[name]).slice(1,-1);if(part)columns.get(name)!.push(part);}
    }
  }
  if(ndjson)return new Blob(lines,{type:'application/x-ndjson'});
  const parts:string[]=['{'];let firstColumn=true;
  for(const [name,chunks] of columns){if(!firstColumn)parts.push(',');firstColumn=false;parts.push(JSON.stringify(name),':[');chunks.forEach((chunk,index)=>{if(index)parts.push(',');parts.push(chunk);});parts.push(']');}
  parts.push('}');return new Blob(parts,{type:'application/json'});
}
