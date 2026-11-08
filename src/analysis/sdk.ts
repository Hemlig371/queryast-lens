let pending: Promise<typeof import('@perspective-dev/client')> | undefined;

export function loadPerspective() {
  return pending ??= (async () => {
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
