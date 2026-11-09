// Perspective 5.8 embeds a single panel and its full source, but its bootstrap
// loads an anonymously named table while the config refers to the original name.
const SDK_BOOTSTRAP = `window.viewer.load(worker.table(bytes.buffer));
window.viewer.restore(JSON.parse(window.layout.textContent));`;

export function bindHtmlReplay(html: string) {
  if (html.split(SDK_BOOTSTRAP).length !== 2) {
    throw new Error('Unsupported Perspective HTML bootstrap; revalidate the pinned SDK export');
  }
  return html.replace(SDK_BOOTSTRAP, `const config = JSON.parse(window.layout.textContent);
const tableName = config.table || "lens_export";
await worker.table(bytes.buffer, {name: tableName});
await window.viewer.load(worker);
await window.viewer.restore({...config, table: tableName});`);
}
