/** Collect actual root sources; preserve derived-table definitions and panel links. */
export function workspaceSources(workspace:any):string[] {
  const sources=new Set<string>();const active=new Set<string>();
  const visit=(name:string)=>{
    if(typeof name!=='string')throw Error('Unsupported workspace table reference');
    const derived=workspace.derived_tables?.[name];
    if(!derived){sources.add(name);return;}
    if(active.has(name))throw Error('Cyclic workspace table dependency');
    active.add(name);visit(derived.table);active.delete(name);
  };
  for(const panel of Object.values(workspace.panels??{}) as any[])visit(panel.table);
  for(const name of Object.keys(workspace.derived_tables??{}))visit(name);
  return [...sources];
}

export function remapWorkspaceSources(workspace:any,names:Map<string,string>) {
  const copy=JSON.parse(JSON.stringify(workspace));
  for(const panel of Object.values(copy.panels??{}) as any[])panel.table=names.get(panel.table)??panel.table;
  for(const table of Object.values(copy.derived_tables??{}) as any[])table.table=names.get(table.table)??table.table;
  return copy;
}
