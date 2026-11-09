import assert from 'node:assert/strict';

export async function checkSqlDialog(page) {
  const counts=await page.evaluate(async()=>{
    const viewer=document.querySelector('perspective-viewer');
    const original=await viewer.save();
    await viewer.restore({plugin:'Datagrid',columns:['quantity'],group_by:['region','day'],split_by:[],aggregates:{quantity:'sum'},settings:true});
    await viewer.flush();
    const view=await viewer.getView();const full=await view.num_rows();
    await view.collapse(1);await viewer.flush();
    window.__sqlTestOriginal=original;
    return {full,collapsed:await view.num_rows()};
  });
  assert.ok(counts.collapsed<counts.full);
  await page.getByRole('button',{name:/^(SQL представления|View SQL)$/}).click();
  const dialog=page.locator('dialog[open]');
  await dialog.waitFor();
  const sql=await dialog.locator('textarea').inputValue();
  assert.match(sql,/CREATE OR REPLACE TEMPORARY TABLE/i);
  assert.equal(await dialog.getByRole('button',{name:/^(SQL данных|Data SQL)$/}).count(),0);
  await dialog.getByRole('button',{name:/^(Закрыть|Close)$/}).click();
  await page.locator('perspective-viewer').locator('#debug_tabbar_tab').click();
  await page.evaluate(async()=>{
    const viewer=document.querySelector('perspective-viewer');
    const copy=viewer.shadowRoot.querySelector('#debug-panel-copy');
    if(!copy || getComputedStyle(copy).fontSize!=='11px' || getComputedStyle(copy).textTransform!=='none')throw Error('JSON controls lost compact styles');
    if(!getComputedStyle(viewer).fontFamily.includes('Segoe UI'))throw Error('Viewer base font was overridden by its theme');
    const localized=getComputedStyle(viewer).getPropertyValue('--psp-label--export-button--content');
    if(document.querySelector('.lens-explore').dataset.language==='ru'&&!localized.includes('Экспорт'))throw Error('Russian export label is missing');
    await viewer.restore(window.__sqlTestOriginal);delete window.__sqlTestOriginal;await viewer.flush();
  });
  return {feature:'formatted-technical-sql',singleScript:true};
}
