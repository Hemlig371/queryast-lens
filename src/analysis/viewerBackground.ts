/** Match the gutter to the active panel's own theme without polling or React updates. */
export function installViewerBackground(viewer: HTMLElement & {getActivePanel?: () => string}, target: HTMLElement) {
  const win=viewer.ownerDocument.defaultView!;
  let frame=0;
  const update=()=>{
    frame=0;
    const panel=viewer.getActivePanel?.();
    const plugin=Array.from(viewer.children).find(child=>child.getAttribute('slot')===panel);
    const color=win.getComputedStyle(plugin??viewer).getPropertyValue('--psp--background-color').trim();
    if(color && target.style.getPropertyValue('--explore-viewer-bg')!==color)target.style.setProperty('--explore-viewer-bg',color);
  };
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(update);};
  viewer.addEventListener('perspective-config-update',schedule);
  schedule();
  return ()=>{win.cancelAnimationFrame(frame);viewer.removeEventListener('perspective-config-update',schedule);};
}
