import {tableFromIPC,tableToIPC} from 'apache-arrow';
/** Quote hosted SDK table names, including quoted dots/escaped quotes. */
export function quoteHostedTable(name:string){
  const token=/(?:"((?:[^"]|"")*)"|([A-Za-z_][A-Za-z_0-9$]*))/y;
  const parts=[];let at=0;
  while(at<name.length){
    token.lastIndex=at;const match=token.exec(name);
    if(!match)throw Error('Invalid hosted source identifier');
    parts.push('"'+(match[1]===undefined?match[2]:match[1].replaceAll('""','"')).replaceAll('"','""')+'"');
    at=token.lastIndex;if(at===name.length)break;
    if(name[at++]!=='.'||at===name.length)throw Error('Invalid hosted source identifier');
  }
  if(!parts.length)throw Error('Empty hosted source identifier');
  return parts.join('.');
}

/** Snapshot raw physical Arrow before Perspective's numeric type coercions. */
export async function rawSourceArrow(conn:any,name:string,rows:number,pageRows=50_000){
  const source=quoteHostedTable(name);const pages=[];
  for(let start=0;start<Math.max(rows,1);start+=pageRows){
    const bytes=await conn.useUnsafe((bindings:any,handle:number)=>bindings.runQuery(handle,`SELECT * FROM ${source} LIMIT ${pageRows} OFFSET ${start}`));
    pages.push(tableFromIPC(bytes));
  }
  return tableToIPC(pages[0].concat(...pages.slice(1)),'stream');
}
export type SourceArrowReader=(name:string,rows:number)=>Promise<Uint8Array>;
