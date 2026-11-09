const commands: Record<string,string> = {
  New:'Создать',Duplicate:'Дублировать','Derive Table':'Плоская таблица',
  Reset:'Сбросить',Export:'Экспорт',Copy:'Копировать',Maximize:'Развернуть',
  Restore:'Восстановить',Close:'Закрыть',Master:'Основная',Detail:'Зависимая',
};
const headings: Record<string,string> = {
  'Save as':'Сохранить как','Current View':'Текущее представление',All:'Все данные',
  Selected:'Выделенное',Config:'Настройки',
};

/** Only command text nodes, never submenu table names, filenames or listeners. */
export function translateMenu(root: ShadowRoot) {
  const menu=root.querySelector('.context-menu');
  for(const item of Array.from(menu?.children??[])) {
    if(!item.classList.contains('context-menu-item'))continue;
    const node=item.firstChild;
    if(node?.nodeType===3) {
      const translated=commands[node.textContent?.trim()??''];
      if(translated)node.textContent=translated;
    }
  }
  for(const label of root.querySelectorAll('.dropdown-group-label:not([data-label]),.dropdown-group-sublabel')) {
    const node=label.firstChild;
    if(node?.nodeType===3) {
      const translated=headings[node.textContent?.trim()??''];
      if(translated)node.textContent=translated;
    }
  }
}

/** Fixed controls only; never editor text, errors or user field names. */
export function translateControls(root: ShadowRoot) {
  const labels: Record<string,string> = {Expression:'Выражение',Create:'Создать',Save:'Сохранить',Reset:'Сбросить','Delete Column':'Удалить столбец'};
  for (const element of root.querySelectorAll('#expression-editor .item_title,#psp-expression-editor-button-save,#psp-expression-editor-button-reset,#psp-expression-editor-button-delete')) {
    const node=element.firstChild;
    const value=node?.textContent?.trim()??'';
    if(node?.nodeType===3 && labels[value])node.textContent=labels[value];
  }
}

/** Scoped UI styles/labels; grid cells live outside these shadow roots. */
export function installUiPolish(viewer: HTMLElement, language: string) {
  const win=viewer.ownerDocument.defaultView!;
  const installed=new Map<ShadowRoot,{style:HTMLStyleElement;observer?:MutationObserver}>();
  const attach=(root:ShadowRoot,menu:boolean)=>{
    if(installed.has(root))return;
    const style=viewer.ownerDocument.createElement('style');
    style.textContent=menu ? `
      :host { box-sizing:border-box; font:13px "Segoe UI",Arial,sans-serif; }
      .dropdown-group-label,.dropdown-group-sublabel,.dropdown-group-container>span,.no-results { margin-inline:-4px!important; }
      code,input { font:inherit; }
      input { box-sizing:border-box; padding:0 4px!important; }
    ` : `
      #status_bar .hover-target .button>span:not(.icon) { width:max-content!important; min-width:31px; max-width:100px; white-space:pre-wrap!important; overflow:visible!important; left:50%!important; right:auto!important; translate:-50% 0!important; box-sizing:border-box; padding:5px!important; line-height:1!important; font:9px "Segoe UI",Arial,sans-serif!important; }
      :host([part~="tab"]) { padding-inline:4px!important; font:13px "Segoe UI",Arial,sans-serif; }
      .psp-tab-title { height:auto!important; line-height:16px!important; }
      #editor,#textarea_editable,#line_numbers { font-family:ui-monospace,Consolas,monospace; }
      #theme_selector { padding-inline:4px!important; box-sizing:border-box; }
      #theme_selector option { padding:2px 4px; }
      :host #debug-panel #debug-panel-controls { flex-wrap:wrap; gap:4px; }
      :host #debug-panel #debug-panel-controls button[id] { flex:0 0 auto; width:auto; padding:2px 6px; font-size:11px; text-transform:none; overflow:visible; text-overflow:clip; }
    `;
    root.appendChild(style);
    let observer:MutationObserver|undefined;
    if(!menu || language==='ru') {
      const translate=()=>{
        if(language==='ru')menu?translateMenu(root):translateControls(root);
        if(root.host===viewer)refresh();
      };
      observer=new win.MutationObserver(translate);
      observer.observe(root,{childList:true,subtree:true,characterData:true});
      if(language==='ru')menu?translateMenu(root):translateControls(root);
    }
    installed.set(root,{style,observer});
  };
  const refresh=()=>{
    if(viewer.shadowRoot)attach(viewer.shadowRoot,false);
    for(const scope of [viewer,viewer.shadowRoot])for(const tab of scope?.querySelectorAll('perspective-viewer-tab')??[])if(tab.shadowRoot)attach(tab.shadowRoot,false);
    for(const menu of viewer.querySelectorAll('perspective-context-menu,perspective-export-menu,perspective-copy-menu')) {
      if(menu.shadowRoot)attach(menu.shadowRoot,true);
    }
    for(const [root,state] of installed)if(root.host!==viewer&&!viewer.contains(root.host)&&!viewer.shadowRoot?.contains(root.host)) {
      state.observer?.disconnect();state.style.remove();installed.delete(root);
    }
  };
  const observer=new win.MutationObserver(refresh);
  observer.observe(viewer,{childList:true});refresh();
  return ()=>{observer.disconnect();for(const state of installed.values()){state.observer?.disconnect();state.style.remove();}installed.clear();};
}
