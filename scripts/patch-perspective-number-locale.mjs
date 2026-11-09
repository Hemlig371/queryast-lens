import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const original='new Intl.NumberFormat(navigator.languages,i)';
const replacement='new Intl.NumberFormat(__lensNumberLocale??navigator.languages,i)';
const marker='/* Lens number locale (Perspective 5.8.0). */';
const prelude=marker+'let __lensNumberLocale;export function setLensNumberLocale(locale){__lensNumberLocale=locale;}';

export function withLensNumberLocale(source,version) {
  if(version!=='5.8.0')throw Error('Revalidate the Perspective number locale patch for '+version);
  const count=text=>source.split(text).length-1;
  if(count(marker)===1 && count(replacement)===1 && count(original)===0)return source;
  if(count(marker)!==0 || count(replacement)!==0 || count(original)!==1)throw Error('Unsupported Perspective number formatter template');
  return prelude+source.replace(original,replacement);
}

const chartOriginal='function Wr(e,t,n){let i=n??uf[e]??{},o=t?cf(i,t):i;return new Intl.NumberFormat(navigator.languages,o)}';
const chartReplacement='function Wr(e,t,n){return __lensSharedNumberFormatter(e,t,n)}';
const chartImport='/* Lens charts number locale (Perspective 5.8.0). */import{createNumberFormatter as __lensSharedNumberFormatter}from"@perspective-dev/viewer/column-format";';

/** Charts bundle their own copy; delegate only that copy's number helper. */
export function withLensChartNumberLocale(source,version) {
  if(version!=='5.8.0')throw Error('Revalidate the Perspective charts number locale patch for '+version);
  const count=text=>source.split(text).length-1;
  if(count(chartImport)===1 && count(chartReplacement)===1 && count(chartOriginal)===0)return source;
  if(count(chartImport)!==0 || count(chartReplacement)!==0 || count(chartOriginal)!==1)throw Error('Unsupported Perspective charts number formatter template');
  return chartImport+source.replace(chartOriginal,chartReplacement);
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
