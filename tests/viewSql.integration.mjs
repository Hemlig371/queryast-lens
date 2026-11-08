import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tableToIPC} from 'apache-arrow';
import {createRequire} from 'node:module';
import * as perspective from '@perspective-dev/client/dist/esm/perspective.js';
import {client_runtime} from '@perspective-dev/client/registry';
import {DuckDBHandler} from '@perspective-dev/client/virtual_servers/duckdb';
import {ViewSqlCapture} from '../src/analysis/viewSql.ts';

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
 ((i%10000)/100.0)::DOUBLE AS revenue, (1+i%8)::INTEGER AS quantity FROM range(12000) t(i)`);
const capture=new ViewSqlCapture();
const connection={query:async sql=>{try{const result=conn.query(sql);capture.record({sql});return result;}catch(e){capture.record({sql,error:String(e)});throw e;}},useUnsafe:async callback=>conn.useUnsafe((bindings,handle)=>callback({runQuery:(_h,sql)=>{const bytes=bindings.runQuery(handle,sql);capture.record({sql});return bytes;}},handle))};
const handler=new DuckDBHandler(connection);
const server=new (client_runtime().glue.VirtualServer)(capture.instrument(handler));
let client;
client=await perspective.make_client(async bytes=>client.handle_response((await server.handleRequest(bytes)).slice()),()=>{});
const table=await client.open_table((await handler.getHostedTables()).find(x=>x.endsWith('.demo')));
const views=[];
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
 if(fixtureDir){
  const name=`case-${cases.length}`;cases.push({name,rows});
  await writeFile(join(fixtureDir,`${name}.sql`),snapshot.sql);
  await writeFile(join(fixtureDir,`${name}.expected.arrow`),tableToIPC(expectedTable,'stream'));
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
try{
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
 if(fixtureDir)await writeFile(join(fixtureDir,'cases.json'),JSON.stringify(cases));
 console.log('SQL replay verified twice in the shared editor connection; live Views intact and unrelated Views excluded.');
}finally{
 for(const view of views)await view.delete();table.free();await client.terminate();client.free();server.free();handler.sqlBuilder.free();conn.close();
}
