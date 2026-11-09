const commands: Record<string,string> = {
  New:'Создать',Duplicate:'Дублировать','Derive Table':'Производная таблица',
  Reset:'Сбросить',Export:'Экспорт',Copy:'Копировать',Maximize:'Развернуть',
  Restore:'Восстановить',Close:'Закрыть',
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

/** Scoped styles and small portal-only observers; no grid subtree scanning. */
export function installUiPolish(viewer: HTMLElement, language: string) {
  const win=viewer.ownerDocument.defaultView!;
  const installed=new Map<ShadowRoot,{style:HTMLStyleElement;observer?:MutationObserver}>();
  const attach=(root:ShadowRoot,menu:boolean)=>{
    if(installed.has(root))return;
    const style=viewer.ownerDocument.createElement('style');
    style.textContent=menu ? `
      :host { box-sizing:border-box; }
      .dropdown-group-label,.dropdown-group-sublabel,.dropdown-group-container>span,.no-results { margin-inline:0!important; }
      code,input { font-size:inherit; }
    ` : `
      .hover-target .button>span:not(.icon) { width:max-content!important; min-width:41px; max-width:calc(100vw - 16px); overflow:visible!important; left:auto!important; right:0; translate:none!important; }
    `;
    root.appendChild(style);
    let observer:MutationObserver|undefined;
    if(menu&&language==='ru') {
      observer=new win.MutationObserver(()=>translateMenu(root));
      observer.observe(root,{childList:true,subtree:true,characterData:true});
      translateMenu(root);
    }
    installed.set(root,{style,observer});
  };
  const refresh=()=>{
    if(viewer.shadowRoot)attach(viewer.shadowRoot,false);
    for(const menu of viewer.querySelectorAll('perspective-context-menu,perspective-export-menu,perspective-copy-menu')) {
      if(menu.shadowRoot)attach(menu.shadowRoot,true);
    }
    for(const [root,state] of installed)if(root.host!==viewer&&!viewer.contains(root.host)) {
      state.observer?.disconnect();state.style.remove();installed.delete(root);
    }
  };
  const observer=new win.MutationObserver(refresh);
  observer.observe(viewer,{childList:true});refresh();
  return ()=>{observer.disconnect();for(const state of installed.values()){state.observer?.disconnect();state.style.remove();}installed.clear();};
}
