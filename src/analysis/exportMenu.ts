import type {SourceArrowReader} from './rawSourceArrow';
import { exportNativeMenuChoice } from './exportData';
import type { HTMLPerspectiveViewerElement, ExportMethod } from '@perspective-dev/viewer';

const methods: [string, ExportMethod][] = [
  ['.config.json','json-config'], ['.all.lz4.arrow','arrow-lz4-all'], ['.all.zstd.arrow','arrow-zstd-all'],
  ['.selected.lz4.arrow','arrow-lz4-selected'], ['.selected.zstd.arrow','arrow-zstd-selected'],
  ['.all.arrow','arrow-all'], ['.all.ndjson','ndjson-all'], ['.all.json','json-all'], ['.all.csv','csv-all'],
  ['.selected.arrow','arrow-selected'], ['.selected.ndjson','ndjson-selected'], ['.selected.json','json-selected'], ['.selected.csv','csv-selected'],
  ['.lz4.arrow','arrow-lz4'], ['.zstd.arrow','arrow-zstd'],
  ['.arrow','arrow'], ['.ndjson','ndjson'], ['.json','json'], ['.csv','csv'], ['.html','html'], ['.png','plugin'], ['.txt','plugin'],
];
export const exportMethodForFilename = (name: string) => methods.find(([suffix]) => name.endsWith(suffix))?.[1];
export const isResizeObserverNotice = (message: string) => /^(?:ResizeObserver loop completed with undelivered notifications\.?|ResizeObserver loop limit exceeded\.?)$/.test(message.trim());

/** Keep the native 5.8.0 menu; route its choices through the public, rejecting
 * export APIs instead of the menu's unchecked Rust unwrap() task.
 * Listen before the SDK's mousedown callback, without changing menu markup.
 */
export function installExportMenuBridge(viewer: HTMLPerspectiveViewerElement, callbacks: {
  start: () => void; success: () => void; error: (error: unknown) => void;
}, readSource?:SourceArrowReader) {
  const document = viewer.ownerDocument;
  let pending = false;
  let disposed = false;
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const path = event.composedPath();
    if (!path.includes(viewer)) return;
    const menu = path.find(node => (node as Element).tagName === 'PERSPECTIVE-EXPORT-MENU');
    const item = path.find(node => (node as Element).classList?.contains('dropdown-menu-item')) as Element | undefined;
    if (!menu || !item) return;
    const filename = item.querySelector('code')?.textContent ?? '';
    const method = exportMethodForFilename(filename);
    if (!method) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending) return;
    pending = true;
    callbacks.start();
    void (async () => {
      try {
        await exportNativeMenuChoice(viewer, method, filename,readSource);
        if (!disposed) {
          callbacks.success();
          // Let Perspective dismiss and dispose its own portal.
          document.dispatchEvent(new document.defaultView!.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
        }
      } catch (error) {
        if (!disposed) callbacks.error(error);
      } finally { pending = false; }
    })();
  };
  viewer.addEventListener('mousedown', onMouseDown, true);
  return () => {
    disposed = true;
    viewer.removeEventListener('mousedown', onMouseDown, true);
  };
}
