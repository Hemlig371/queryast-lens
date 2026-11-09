import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const original='new Intl.NumberFormat(navigator.languages,i)';
const replacement='new Intl.NumberFormat(__lensNumberLocale??navigator.languages,i)';
const oldPrelude='/* Lens number locale (Perspective 5.8.0). */let __lensNumberLocale;export function setLensNumberLocale(locale){__lensNumberLocale=locale;}';
const marker='/* Lens number locale (Perspective 5.8.0; worker-safe). */';
const prelude=marker+'let __lensNumberLocale;export function setLensNumberLocale(locale){__lensNumberLocale=locale;}export function getLensNumberLocale(){return __lensNumberLocale;}';

export function withLensNumberLocale(source,version) {
  if(version!=='5.8.0')throw Error('Revalidate the Perspective number locale patch for '+version);
  // Upgrade an installed copy prepared by the previous script.
  if(source.startsWith(oldPrelude))source=source.slice(oldPrelude.length).replace(replacement,original);
  const count=text=>source.split(text).length-1;
  if(count(marker)===1 && count(replacement)===1 && count(original)===0)return source;
  if(count(marker)!==0 || count(replacement)!==0 || count(original)!==1)throw Error('Unsupported Perspective number formatter template');
  return prelude+source.replace(original,replacement);
}

const chartOriginal='function Wr(e,t,n){let i=n??uf[e]??{},o=t?cf(i,t):i;return new Intl.NumberFormat(navigator.languages,o)}';
const oldChartReplacement='function Wr(e,t,n){return __lensSharedNumberFormatter(e,t,n)}';
const oldChartImport='/* Lens charts number locale (Perspective 5.8.0). */import{createNumberFormatter as __lensSharedNumberFormatter}from"@perspective-dev/viewer/column-format";';
const chartReplacement='function Wr(e,t,n){let i=n??uf[e]??{},o=t?cf(i,t):i;return new Intl.NumberFormat(globalThis.__lensNumberLocale??navigator.languages,o)}';
const chartImport='/* Lens charts number locale (Perspective 5.8.0; worker-safe). */import{getLensNumberLocale as __lensGetNumberLocale}from"@perspective-dev/viewer/column-format";';
const blobOriginal='new Blob([Te], {';
const blobReplacement='new Blob(["globalThis.__lensNumberLocale="+JSON.stringify(__lensGetNumberLocale())+";\\n",Te], {';

/** Pass a locale value into the worker; never refer to main-thread functions. */
export function withLensChartNumberLocale(source,version) {
  if(version!=='5.8.0')throw Error('Revalidate the Perspective charts number locale patch for '+version);
  if(source.startsWith(oldChartImport))source=source.slice(oldChartImport.length).replace(oldChartReplacement,chartOriginal);
  const count=text=>source.split(text).length-1;
  if(count(chartImport)===1 && count(chartReplacement)===1 && count(blobReplacement)===1 && count(chartOriginal)===0 && count(blobOriginal)===0)return source;
  if(count(chartImport)!==0 || count(chartOriginal)!==1 || count(blobOriginal)!==1)throw Error('Unsupported Perspective charts number formatter template');
  return chartImport+source.replace(chartOriginal,chartReplacement).replace(blobOriginal,blobReplacement);
}

export async function patchPerspectiveNumberLocale() {
  const {version}=JSON.parse(await readFile(require.resolve('@perspective-dev/viewer/package.json'),'utf8'));
  const charts=JSON.parse(await readFile(require.resolve('@perspective-dev/viewer-charts/package.json'),'utf8'));
  const path=require.resolve('@perspective-dev/viewer/column-format');
  const chartPath=require.resolve('@perspective-dev/viewer-charts');
  const source=await readFile(path,'utf8');
  const chartSource=await readFile(chartPath,'utf8');
  const result=withLensNumberLocale(source,version);
  const chartResult=withLensChartNumberLocale(chartSource,charts.version);
  if(result!==source)await writeFile(path,result);
  if(chartResult!==chartSource)await writeFile(chartPath,chartResult);
  return result!==source || chartResult!==chartSource;
}
