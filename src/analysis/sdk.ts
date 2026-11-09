import {currentLocale} from '../utils/i18n';
let pending: Promise<typeof import('@perspective-dev/client')> | undefined;

export function loadPerspective() {
  return pending ??= (async () => {
    // Configure before importing plugins, which cache number formatters.
    const formatters = await import('@perspective-dev/viewer/column-format') as
      typeof import('@perspective-dev/viewer/column-format') & {setLensNumberLocale(locale:string):void};
    formatters.setLensNumberLocale(currentLocale);
    const [perspective, viewer, wasm] = await Promise.all([
      import('@perspective-dev/client'),
      import('@perspective-dev/viewer'),
      import('@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url'),
      import('@perspective-dev/viewer/dist/css/themes.css'),
      import('@perspective-dev/viewer-datagrid'),
      import('@perspective-dev/viewer-charts'),
    ]);
    await viewer.init({ viewer: () => fetch(wasm.default) });
    await perspective.getCompiledClientWasm();
    await customElements.whenDefined('perspective-viewer');
    return perspective;
  })().catch(error => { pending = undefined; throw error; });
}
