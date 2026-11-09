import vm from 'node:vm';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {withLensNumberLocale,withLensChartNumberLocale} from '../../scripts/patch-perspective-number-locale.mjs';
import {localeForLang} from '../../src/utils/i18n';
const require=createRequire(import.meta.url);
const source=await readFile(require.resolve('@perspective-dev/viewer/column-format'),'utf8');
const patched=withLensNumberLocale(source,'5.8.0');
const formatter=await import('data:text/javascript;base64,'+Buffer.from(patched).toString('base64'));

test('real shared SDK formatter follows Lens RU/EN and preserves numeric formatting options',()=>{
 for(const lang of ['ru','en']) {
  const locale=localeForLang(lang);formatter.setLensNumberLocale(locale);
  const number=formatter.createNumberFormatter('float');
  assert.equal(number.format(1234.56),lang==='ru'?'1\u00a0234,56':'1,234.56');
  assert.equal(number.format(-1234.56),new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(-1234.56));
  assert.equal(formatter.createNumberFormatter('integer').format(9007199254740993n),new Intl.NumberFormat(locale).format(9007199254740993n));
  assert.equal(formatter.createNumberFormatter('float',{useGrouping:false,maximumFractionDigits:1}).format(1234.56),lang==='ru'?'1234,6':'1234.6');
  assert.equal(formatter.createNumberFormatter('float',{style:'percent',maximumFractionDigits:1}).format(0.125),new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:1}).format(0.125));
 }
});

test('pinned locale patch is idempotent and rejects unknown SDK versions/templates',()=>{
 assert.equal(withLensNumberLocale(patched,'5.8.0'),patched);
 assert.throws(()=>withLensNumberLocale(source,'5.9.0'),/Revalidate/);
 assert.throws(()=>withLensNumberLocale('unknown','5.8.0'),/Unsupported/);
 // Date formatting and parsing are deliberately outside this number-only patch.
 assert.equal((source.match(/new Intl.DateTimeFormat\(navigator.languages/g)||[]).length,(patched.match(/new Intl.DateTimeFormat\(navigator.languages/g)||[]).length);
});

test('actual chart worker Blob formats RU/EN in an isolated realm without main-thread imports',async()=>{
 const source=await readFile(require.resolve('@perspective-dev/viewer-charts'),'utf8');
 const patched=withLensChartNumberLocale(source,'5.8.0');
 assert.equal(withLensChartNumberLocale(patched,'5.8.0'),patched);
 assert.throws(()=>withLensChartNumberLocale(source,'5.9.0'),/Revalidate/);
 assert.throws(()=>withLensChartNumberLocale('unknown','5.8.0'),/Unsupported/);
 const ast=ts.createSourceFile('charts.js',patched,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 let worker:string|undefined,blob:string|undefined;
 const visit=(node:ts.Node)=>{
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='Te'&&node.initializer&&ts.isStringLiteral(node.initializer))worker=node.initializer.text;
  if(ts.isNewExpression(node)&&node.expression.getText(ast)==='Blob')blob=node.getText(ast);
  ts.forEachChild(node,visit);
 };
 visit(ast);assert.ok(worker);assert.ok(blob);
 assert.ok(!worker.includes('__lensSharedNumberFormatter'),'Worker cannot access main-thread imports');
 const createBlob=new Function('Te','__lensGetNumberLocale','return '+blob);
 for(const locale of ['ru-RU','en-US']) {
  const code=await (createBlob(worker,()=>locale) as Blob).text();
  const host:any={Intl,navigator:{languages:['en-US']},performance,setTimeout,clearTimeout,postMessage:()=>{},addEventListener:()=>{}};
  host.self=host;
  // Run the full shipped worker bootstrap, then its number helper in that realm.
  vm.runInNewContext(code.replace(/export\{Js as WorkerRenderer\};/,'')+';cl();',host);
  for(const [type,options,value] of [['float',undefined,1234.56],['integer',undefined,9007199254740993n],['float',{style:'percent'},0.125]] as const) {
   host.type=type;host.options=options;host.value=value;
   vm.runInNewContext('globalThis.result=Wr(type,options).format(value)',host);
   formatter.setLensNumberLocale(locale);
   assert.equal(host.result,formatter.createNumberFormatter(type,options).format(value));
  }
 }
});

test('direct Vite startup repairs an unprepared SDK before serving runtime imports',async()=>{
 const target=require.resolve('@perspective-dev/viewer/column-format');
 const saved=await readFile(target,'utf8');
 const clean=saved.replace(/^\/\* Lens number locale \(Perspective 5\.8\.0; worker-safe\)\. \*\/let __lensNumberLocale;export function setLensNumberLocale\(locale\)\{__lensNumberLocale=locale;\}export function getLensNumberLocale\(\)\{return __lensNumberLocale;\}/,'').replace('new Intl.NumberFormat(__lensNumberLocale??navigator.languages,i)','new Intl.NumberFormat(navigator.languages,i)');
 assert.ok(!clean.includes('export function setLensNumberLocale'));
 try {
  await writeFile(target,clean);
  const {default:config}=await import('../../vite.config.ts');
  await (config as any)({command:'serve',mode:'development'});
  const module=await import(pathToFileURL(target).href+'?locale-startup='+Date.now());
  assert.equal(typeof module.setLensNumberLocale,'function');
  module.setLensNumberLocale('ru-RU');
  assert.equal(module.createNumberFormatter('float').format(1234.56),'1\u00a0234,56');
 } finally { await writeFile(target,saved); }
});
