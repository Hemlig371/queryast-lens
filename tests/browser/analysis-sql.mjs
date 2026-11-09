import assert from 'node:assert/strict';

export async function checkSqlDialog(page) {
  const counts=await page.evaluate(async()=>{
    const viewer=document.querySelector('perspective-viewer');
    const original=await viewer.save();
    const locale=document.querySelector('.lens-explore').dataset.language==='en'?'en-US':'ru-RU';
    if(window.__analysisFormatNumber(1234.56)!==new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(1234.56))throw Error('Perspective number locale does not follow Lens');
    // Perspective omits values equal to schema defaults from save().
    // Check the effective table font, not the presence of optional JSON keys.
    const plugin=Array.from(viewer.children).find(child=>child.tagName==='PERSPECTIVE-VIEWER-DATAGRID');
    const grid=plugin?.regular_table;
    const font=grid?getComputedStyle(grid):undefined;
    if(!font || !font.fontFamily.includes('Segoe UI') || font.fontSize!=='13px') {
      throw Error('Default Datagrid font is incorrect: '+JSON.stringify({saved:original.plugin_config,family:font?.fontFamily,size:font?.fontSize}));
    }
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
