import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'public');await mkdir(out,{recursive:true});
const result=await build({
  absWorkingDir:root,entryPoints:['src/analysis/offlineRuntime.ts'],write:false,
  bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,
  conditions:['browser'],legalComments:'inline',
  plugins:[{name:'embedded-export-assets',setup(build){
    build.onResolve({filter:/\?(base64|raw)$/},args=>{
      const [name,kind]=args.path.split('?');
      return {path:name==='@lens-export/zstd.wasm'?join(dirname(require.resolve('@bokuweb/zstd-wasm')),'zstd.wasm'):require.resolve(name),namespace:kind};
    });
    build.onLoad({filter:/.*/,namespace:'base64'},async args=>({contents:JSON.stringify((await readFile(args.path)).toString('base64')),loader:'json'}));
    build.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:JSON.stringify(await readFile(args.path,'utf8')),loader:'json'}));
  }}],
});
const js=result.outputFiles[0].contents;
await writeFile(join(out,'analysis-export-runtime.js.gz'),gzipSync(js,{level:9}));
await copyFile(join(dirname(require.resolve('@bokuweb/zstd-wasm')),'zstd.wasm'),join(out,'analysis-zstd.wasm'));
console.log(`Built offline dashboard runtime: ${js.length.toLocaleString()} bytes before gzip`);
