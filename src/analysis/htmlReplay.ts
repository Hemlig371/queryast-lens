// Pinned Perspective 5.8 HTML: keep SDK assets/data/config; repair only startup.
const SDK_WORKER = 'const worker = await perspective.worker();';
const SDK_BOOTSTRAP = `window.viewer.load(worker.table(bytes.buffer));
window.viewer.restore(JSON.parse(window.layout.textContent));`;

export function bindHtmlReplay(html: string) {
  if (html.split(SDK_BOOTSTRAP).length !== 2 || html.split(SDK_WORKER).length !== 2) {
    throw new Error('Unsupported Perspective HTML bootstrap; revalidate the pinned SDK export');
  }
  return html.replace(SDK_WORKER, `function showExportError(error) {
const document = window.document;
let message = document.getElementById("lens-export-error");
if (!message) {
message = document.createElement("pre");
message.id = "lens-export-error";
message.setAttribute("role", "alert");
message.style.cssText = "position:fixed;inset:8px 8px auto;z-index:10000;padding:12px;white-space:pre-wrap;background:#321f24;color:#ffb4b4;font:14px/1.5 sans-serif";
document.body.appendChild(message);
}
message.textContent = "Cannot restore exported view: " + String(error?.message ?? error);
}
window.addEventListener("unhandledrejection", event => showExportError(event.reason));
try {
await window.customElements.whenDefined("perspective-viewer");
// Finish Viewer WASM and pending plugin registration before creating the client.
await window.viewer.getAllPlugins();
const worker = await perspective.worker();`)
    .replace(SDK_BOOTSTRAP, `const config = JSON.parse(window.layout.textContent);
const tableName = config.table || "lens_export";
await worker.table(bytes.buffer, {name: tableName});
await window.viewer.load(worker);
await window.viewer.restore({...config, table: tableName});
await window.viewer.flush();
await new Promise(resolve => window.requestAnimationFrame(resolve));
await window.viewer.resize();
await window.viewer.flush();
} catch (error) {
showExportError(error);
throw error;
}`);
}
