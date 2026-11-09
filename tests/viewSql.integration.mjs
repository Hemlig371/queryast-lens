import {csvExportBlob} from '../src/analysis/exportData.ts';
import {pagedJsonBlob,sourceArrowIpc} from '../src/analysis/exportPaged.ts';
import {installDefaultColumns} from '../src/analysis/defaultColumns.ts';
import {installPivotMinMax} from '../src/analysis/pivotMinMax.ts';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tableFromIPC} from 'apache-arrow';
import {createRequire} from 'node:module';
import * as perspective from '@perspective-dev/client/dist/esm/perspective.js';
import {client_runtime} from '@perspective-dev/client/registry';
import {DuckDBHandler} from '@perspective-dev/client/virtual_servers/duckdb';
import {ViewSqlCapture} from '../src/analysis/viewSql.ts';
import {formatReplaySql} from '../src/analysis/formatReplaySql.ts';
import {formatSqlText} from '../src/utils/sqlFormat.ts';
import {isolateReplaySql} from '../src/analysis/replaySql.ts';

const require=createRequire(import.meta.url);
await perspective.init({client:()=>readFile(require.resolve('@perspective-dev/client/dist/wasm/perspective-js.wasm'))});
await perspective.getCompiledClientWasm();
const d=require('@duckdb/duckdb-wasm/blocking');
const path=require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm');
const db=await d.createDuckDB({mvp:{mainModule:path,mainWorker:''},eh:{mainModule:path,mainWorker:''}},new d.ConsoleLogger(d.LogLevel.ERROR),d.NODE_RUNTIME);
await db.instantiate(()=>{});
const conn=db.connect();
conn.query(`CREATE TABLE demo AS SELECT i::INTEGER AS id,
 ['Москва','Казань','Санкт-Петербург','Новосибирск'][1+i%4] AS region,
 ['Hardware','Software','Services'][1+i%3] AS category,
 DATE '2025-01-01'+(i%365)::INTEGER AS day,
 ((i%10000)/100.0)::DOUBLE AS revenue, (1+i%8)::INTEGER AS quantity,
 ['a  b','a b','a'||chr(9)||'b','a'||chr(10)||'b','a''  b'][1+i%5] AS "label  value"
 FROM range(12000) t(i)`);
const capture=new ViewSqlCapture();
const executedSql=[];
const connection={query:async sql=>{try{const result=conn.query(sql);executedSql.push(sql);capture.record({sql});return result;}catch(e){capture.record({sql,error:String(e)});throw e;}},useUnsafe:async callback=>conn.useUnsafe((bindings,handle)=>callback({runQuery:(_h,sql)=>{const bytes=bindings.runQuery(handle,sql);capture.record({sql});return bytes;}},handle))};
const handler=new DuckDBHandler(connection);
installDefaultColumns(handler);
installPivotMinMax(handler,connection);
const server=new (client_runtime().glue.VirtualServer)(capture.instrument(handler));
let client;
client=await perspective.make_client(async bytes=>client.handle_response((await server.handleRequest(bytes)).slice()),()=>{});
const table=await client.open_table((await handler.getHostedTables()).find(x=>x.endsWith('.demo')));
const views=[];
const derivedTables=[];
const fixtureDir=process.env.LENS_ARROW_FIXTURE_DIR;
const cases=[];
if(fixtureDir)await mkdir(fixtureDir,{recursive:true});
const stable=rows=>JSON.stringify(rows.map(row=>row.toJSON()),(_k,value)=>typeof value==='bigint'?value.toString():value);
async function check(view,label){
 await view.to_json({start_row:0,end_row:3});
 const rows=await view.num_rows(),columns=await view.num_columns();
 let originalQuery;
 const getData = handler.sqlBuilder.viewGetData.bind(handler.sqlBuilder);
 handler.sqlBuilder.viewGetData = (...args) => (originalQuery = getData(...args));
 const snapshot=await capture.snapshot(handler,view.__unsafe_get_name(),await view.get_config(),{start_row:0,end_row:rows,start_col:0,end_col:columns});
 handler.sqlBuilder.viewGetData = getData;
 const originalSql = originalQuery;
 const expectedTable=conn.query(originalSql);
 const expected=stable(expectedTable.toArray());
 const replaySql=await formatReplaySql(snapshot.sql,sql=>formatSqlText(sql,{keywordCase:'upper',tabWidth:2,useTabs:false,expressionWidth:80,denseOperators:false,leadingCommas:false}));
 assert.equal(stable(conn.query(replaySql).toArray()),expected,'Formatting must preserve replay values');
 if(fixtureDir){
  const name=`case-${cases.length}`;cases.push({name,rows});
  await writeFile(join(fixtureDir,`${name}.sql`),replaySql);
  // The blocking DuckDB bundle can return a different Arrow class instance.
  // Export its actual IPC bytes, rather than passing that Table across CJS/ESM.
  const expectedIpc=conn.useUnsafe((bindings,handle)=>bindings.runQuery(handle,originalSql)).slice();
  const decoded=tableFromIPC(expectedIpc);
  assert.equal(decoded.numRows,rows,'WASM fixture row count');
  assert.deepEqual(decoded.schema.fields.map(f=>f.name),expectedTable.schema.fields.map(f=>f.name),'WASM fixture schema');
  assert.equal(stable(decoded.toArray()),expected,'WASM fixture values');
  await writeFile(join(fixtureDir,`${name}.expected.arrow`),expectedIpc);
 }
 // Execute twice in the same connection used by the live View, like the Lens editor.
 for (let attempt=0;attempt<2;attempt++) {
   const actual=conn.query(snapshot.sql);
   assert.equal(stable(actual.toArray()),expected);assert.equal(actual.numRows,rows);
   assert.equal(stable(conn.query(originalSql).toArray()),expected);
 }
 console.log(label,JSON.stringify({rows,columns,sqlBytes:snapshot.sql.length}));
 return snapshot;
}
async function checkRange(config,referenceSql,label) {
 const view=await table.view(config);views.push(view);
 const start=executedSql.length;
 const actual=await view.get_min_max('New Column 1');
 const rangeSql=executedSql.slice(start).findLast(sql=>/^\s*SELECT\b/i.test(sql));
 const row=conn.query(referenceSql).toArray()[0].toJSON();
 assert.deepEqual(actual,[row.min,row.max],label);
 if(fixtureDir&&rangeSql) {
  const name=`case-${cases.length}`;cases.push({name,rows:1});
  const definition=handler.sqlBuilder.tableMakeView('memory.demo',view.__unsafe_get_name(),await view.get_config());
  const sql=isolateReplaySql([definition,rangeSql]).sql;
  assert.equal(stable(conn.query(sql).toArray()),stable(conn.query(referenceSql).toArray()),label+' replay');
  await writeFile(join(fixtureDir,`${name}.sql`),sql);
  const bytes=conn.useUnsafe((bindings,handle)=>bindings.runQuery(handle,referenceSql)).slice();
  await writeFile(join(fixtureDir,`${name}.expected.arrow`),bytes);
 }
 console.log(label,actual);
 return view;
}
try{
 const draft=await handler.tableDescribe('memory.demo',{columns:[],expressions:{draft:''}});
 assert.ok(draft.expression_errors.draft);assert.ok(!draft.config_error);
 const valid=await handler.tableDescribe('memory.demo',{columns:[],expressions:{double_quantity:'"quantity" * 2'}});
 assert.equal(valid.expression_schema.double_quantity,'integer');
 const features=handler.getFeatures();
 assert.ok(!features.aggregates.string.includes('countif'));
 assert.ok(features.aggregates.boolean.includes('countif'));
 // Native HTML export uses the public default table.view() path.
 const defaultView=await table.view();views.push(defaultView);
 const exported=tableFromIPC(await defaultView.to_arrow());
 const source=conn.query('SELECT * FROM demo ORDER BY rowid');
 assert.deepEqual(exported.schema.fields.map(f=>f.name),source.schema.fields.map(f=>f.name));
 assert.equal(stable(exported.toArray()),stable(source.toArray()));
 console.log('Default view for stock HTML exports all source rows and columns.');
 const a=await table.view({group_by:['region','category'],columns:['revenue','quantity'],filter:[['category','==','Software']],sort:[['revenue','desc']],aggregates:{revenue:'avg',quantity:'count'}});views.push(a);
 const b=await table.view({group_by:['day'],split_by:['region','category'],columns:['revenue','quantity'],aggregates:{revenue:'sum',quantity:'sum'}});views.push(b);
 const total=(await a.to_json()).find(row=>row.__ROW_PATH__?.length===0);
 const reference=conn.query("SELECT avg(revenue) AS revenue, count(quantity) AS quantity FROM demo WHERE category='Software'").toArray()[0].toJSON();
 assert.ok(Math.abs(total.revenue-reference.revenue)<1e-9);
 assert.equal(Number(total.quantity),Number(reference.quantity));
 const sa=await check(a,'filtered average/count');
 assert.ok(!sa.sql.includes(b.__unsafe_get_name()));assert.ok(sa.sql.includes('Software'));
 await check(b,'date groups and column split');
 await a.collapse(1);await check(a,'collapsed groups');
 await a.expand(1);await check(a,'expanded groups');
 const c=await table.view({group_by:['region','category'],split_by:['day'],columns:['revenue','quantity'],aggregates:{revenue:'sum',quantity:'sum'}});views.push(c);
 await check(c,'day moved to 730 columns');
 const derived=await client.table(a,{name:'analysis_derived'});derivedTables.push(derived);
 const derivedView=await derived.view({columns:['region','revenue','quantity']});views.push(derivedView);
 const derivedSnapshot=await check(derivedView,'derived table');
 assert.doesNotMatch(derivedSnapshot.sql,/^\s*(?:DESCRIBE|DESC)\b/im);

 const expressionView=await table.view({expressions:{double_quantity:'"quantity" * 2'},columns:['double_quantity'],group_by:['region'],aggregates:{double_quantity:'sum'}});views.push(expressionView);
 await check(expressionView,'computed column');
 for (const value of ['a  b','a b','a\tb','a\nb',"a'  b"]) {
  const view=await table.view({columns:['id','label  value'],filter:[['label  value','==',value]]});views.push(view);
  const actual=await view.to_json();
  const expected=conn.query(`SELECT id, "label  value" FROM demo WHERE "label  value"='${value.replaceAll("'","''")}' ORDER BY id`).toArray();
  assert.equal(actual.length,2400);
  assert.equal(stable(actual.map(row=>({toJSON:()=>row}))),stable(expected),'Filter must preserve '+JSON.stringify(value));
  await check(view,'exact whitespace filter '+JSON.stringify(value));
 }
 const literal=await table.view({columns:['literal'],expressions:{literal:"'a  b'"}});views.push(literal);
 assert.deepEqual((await literal.to_json({start_row:0,end_row:3})).map(row=>row.literal),['a  b','a  b','a  b']);
 await check(literal,'expression preserves repeated spaces');
 const metric={columns:['New Column 1'],expressions:{'New Column 1':'"quantity" * 2'},aggregates:{'New Column 1':'sum'}};
 const rangeReference=(group,where='')=>`SELECT CAST(MIN(value) AS DOUBLE) AS min, CAST(MAX(value) AS DOUBLE) AS max FROM (SELECT SUM(quantity * 2) AS value FROM demo ${where} GROUP BY ${group})`;
 const rangeView=await checkRange({...metric,group_by:['region'],split_by:['category']},rangeReference('region,category'),'computed split metric range excludes rollup totals');
 await checkRange({...metric,group_by:['region'],split_by:['quantity'],group_rollup_mode:'flat'},rangeReference('region,quantity'),'flat numeric split range');
 await checkRange({...metric,group_by:['region'],split_by:['category'],filter:[['category','==','Software']]},rangeReference('region,category',"WHERE category='Software'"),'single split range');
 await checkRange({...metric,group_by:[],split_by:['category']},'SELECT 2::DOUBLE AS min,16::DOUBLE AS max','split-only range');
 await checkRange({...metric,expressions:{'New Column 1':'NULL::INTEGER'},group_by:['region'],split_by:['category']},'SELECT NULL::DOUBLE AS min,NULL::DOUBLE AS max','all-null split range');
 await checkRange({...metric,group_by:['region'],split_by:['category'],filter:[['quantity','>',999]]},'SELECT NULL::DOUBLE AS min,NULL::DOUBLE AS max','empty split range');
 // Separate source tables can share a filter key without copying rows into JS.
 conn.query('CREATE TABLE filter_source AS SELECT DISTINCT region FROM demo');
 const filterTable=await client.open_table('memory.filter_source');
 const master=await filterTable.view({columns:['region']});
 try {
   const allMaster=await master.to_json();
   assert.equal(allMaster.length,4);
   for(const region of allMaster.map(row=>row.region)) {
     const detail=await table.view({columns:['quantity'],group_by:['region'],filter:[['region','==',region]],aggregates:{quantity:'sum'}});
     try {
       const result=await detail.to_json();
       const expected=conn.query(`SELECT SUM(quantity) AS n FROM demo WHERE region='${region.replaceAll("'","''")}'`).toArray()[0].toJSON().n;
       assert.equal(Number(result.find(row=>!row.__ROW_PATH__.length).quantity),Number(expected));
       assert.ok(result.every(row=>!row.__ROW_PATH__.length||row.__ROW_PATH__[0]===region));
     } finally { await detail.delete(); }
   }
   assert.deepEqual(await master.to_json(),allMaster,'Filtering detail must leave master data intact');
 } finally { await master.delete();filterTable.free();conn.query('DROP TABLE filter_source'); }
 console.log('Cross-table filter keys: 4 detail aggregates match SQL; master source unchanged.');
 // Export the filtered View in small pages and compare every format with SQL.
 const filteredExport=await table.view({columns:['id','region','quantity'],filter:[['region','==','Москва']],sort:[['id','asc']]});
 try {
   const expected=conn.query("SELECT id,region,quantity FROM demo WHERE region='Москва' ORDER BY id");
   const json=JSON.parse(await (await pagedJsonBlob(filteredExport,false,137)).text());
   assert.deepEqual(json.id,expected.toArray().map(row=>row.toJSON().id));
   const ndjson=(await (await pagedJsonBlob(filteredExport,true,137)).text()).trim().split('\n').map(JSON.parse);
   assert.equal(stable(ndjson.map(row=>({toJSON:()=>row}))),stable(expected.toArray()));
   const arrow=tableFromIPC(await sourceArrowIpc(filteredExport,137));
   assert.equal(stable(arrow.toArray()),stable(expected.toArray()));
   const selected=tableFromIPC(await sourceArrowIpc(filteredExport,3,{start_row:2,end_row:8,start_col:0,end_col:2}));
   assert.equal(selected.numRows,6);assert.equal(selected.numCols,2);
   assert.deepEqual(selected.toArray().map(row=>row.toJSON().id),expected.toArray().slice(2,8).map(row=>row.toJSON().id));
   const csv=await (await csvExportBlob(filteredExport,137)).text();
   assert.equal(csv.trim().split('\n').length,expected.numRows+1);
   const header=csv.slice(0,csv.indexOf('\n')+1);
   assert.equal(csv.split(header).length,2,'CSV header must occur once');
 } finally {await filteredExport.delete();}
 console.log('Filtered paged CSV/JSON/NDJSON/Arrow exports match SQL (3000 rows, pages of 137).');
 const emptyExport=await table.view({columns:['id','quantity'],filter:[['quantity','>',999]]});
 try {
   assert.equal(tableFromIPC(await sourceArrowIpc(emptyExport,3)).numRows,0);
   const json=JSON.parse(await (await pagedJsonBlob(emptyExport,false,3)).text());
   assert.deepEqual(json,{id:[],quantity:[]});
   assert.equal(await (await pagedJsonBlob(emptyExport,true,3)).text(),'');
   assert.equal((await (await csvExportBlob(emptyExport,3)).text()).trim().split('\n').length,1);
 }finally{await emptyExport.delete();}
 console.log('Selected-window Arrow and empty CSV/JSON/NDJSON/Arrow exports verified.');
 // Recreate a View after changing the source: no reuse of old materialized data.
 conn.query('CREATE TABLE refresh_source AS SELECT 1::INTEGER AS id');
 const refreshTable=await client.open_table('memory.refresh_source');
 const oldView=await refreshTable.view({columns:['id']});
 assert.equal(await oldView.num_rows(),1);await oldView.delete();
 conn.query('INSERT INTO refresh_source VALUES (2),(3)');
 const freshView=await refreshTable.view({columns:['id']});
 assert.equal(await freshView.num_rows(),3);await freshView.delete();refreshTable.free();conn.query('DROP TABLE refresh_source');
 console.log('Reopening a View after a source update rereads all rows.');
 // Rapid requests must drain and release every temporary View.
 const burst=await Promise.all(Array.from({length:16},async(_,i)=>{
   const columns=i%2?['quantity']:['revenue','quantity'];
   const view=await table.view({columns,group_by:['region'],split_by:i%3?[]:['category']});
   const id=view.__unsafe_get_name();
   try { assert.ok((await view.to_json()).length>0); }
   finally { await view.delete(); }
   return id;
 }));
 const remaining=new Set(conn.query('SELECT table_name FROM duckdb_tables() WHERE temporary').toArray().map(row=>row.toJSON().table_name));
 assert.ok(burst.every(id=>!remaining.has(id)),'Deleted burst Views must release their temporary tables');
 console.log('16 concurrent View create/read/delete operations drained; temporary tables released.');
 const liveId=rangeView.__unsafe_get_name();
 assert.equal(Number(conn.query(`SELECT count(*) AS n FROM duckdb_tables() WHERE temporary AND table_name='${liveId}'`).toArray()[0].toJSON().n),1);
 await rangeView.delete();views.splice(views.indexOf(rangeView),1);
 assert.equal(Number(conn.query(`SELECT count(*) AS n FROM duckdb_tables() WHERE temporary AND table_name='${liveId}'`).toArray()[0].toJSON().n),0);
 console.log('Live temporary View exists in DuckDB and is removed on View.delete().');
 if(fixtureDir)await writeFile(join(fixtureDir,'cases.json'),JSON.stringify(cases));
 console.log('SQL replay verified twice in the shared editor connection; live Views intact and unrelated Views excluded.');
}finally{
 for(const view of views.reverse())await view.delete();for(const derived of derivedTables)await derived.delete();table.free();await client.terminate();client.free();server.free();handler.sqlBuilder.free();conn.close();
}
