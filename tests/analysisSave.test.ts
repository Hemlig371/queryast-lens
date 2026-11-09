import {afterEach, describe, expect, it, vi} from 'vitest';
import {exportNativeMenuChoice} from '../src/analysis/exportData';

const capacitor = vi.hoisted(() => ({
  writeFile: vi.fn(), share: vi.fn(),
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {writeFile: capacitor.writeFile}, Directory: {Cache: 'CACHE'},
}));
vi.mock('@capacitor/share', () => ({Share: {share: capacitor.share}}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function desktop(path: string | null, writeBinaryFile = vi.fn().mockResolvedValue(undefined)) {
  const save = vi.fn().mockResolvedValue(path);
  vi.stubGlobal('window', {__TAURI__: {dialog: {save}, fs: {writeBinaryFile}}});
  return {save, writeBinaryFile};
}

describe('Perspective exports use Lens platform saving', () => {
  it('saves PNG bytes through Tauri and waits for the write', async () => {
    let finish!: () => void;
    const write = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const {save} = desktop('C:/reports/chart.png', write);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const viewer = {getActivePanel: () => 'chart', export: vi.fn().mockResolvedValue(new Blob([bytes]))};
    let completed = false;
    const pending = exportNativeMenuChoice(viewer, 'plugin', 'chart.png').then(() => { completed = true; });
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(completed).toBe(false);
    expect(save).toHaveBeenCalledWith({defaultPath: 'chart.png', filters: [{name: 'Export', extensions: ['png']}]});
    expect(viewer.export).toHaveBeenCalledWith({method: 'plugin', panel: 'chart'});
    expect(write).toHaveBeenCalledWith('C:/reports/chart.png', bytes);
    finish(); await pending;
  });

  it('cancelling the Tauri dialog does not write or fall back to a browser download', async () => {
    const {writeBinaryFile} = desktop(null);
    await exportNativeMenuChoice({export: async () => new Blob(['text'])}, 'plugin', 'report.txt');
    expect(writeBinaryFile).not.toHaveBeenCalled();
  });

  it('saves stock configuration through Tauri with the selected filename', async () => {
    const {writeBinaryFile} = desktop('C:/reports/view.config.json');
    const config = '{"plugin":"Datagrid","group_by":["region"]}';
    await exportNativeMenuChoice({export: async () => config}, 'json-config', 'view.config.json');
    expect(new TextDecoder().decode(writeBinaryFile.mock.calls[0][1])).toBe(config);
  });

  it('saves CSV through Tauri instead of an anchor download', async () => {
    const {writeBinaryFile} = desktop('C:/reports/report.csv');
    const view = {num_rows: async () => 1, to_csv: async () => 'id\n42\n'};
    await exportNativeMenuChoice({getView: async () => view}, 'csv', 'report.csv');
    expect(new TextDecoder().decode(writeBinaryFile.mock.calls[0][1])).toBe('id\n42\n');
  });

  it('saves and shares exact PNG bytes through the Android plugins', async () => {
    vi.stubGlobal('window', {Capacitor: {isNativePlatform: () => true}});
    vi.stubGlobal('FileReader', class {
      result = ''; onloadend?: () => void;
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then(bytes => {
          this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
          this.onloadend?.();
        });
      }
    });
    capacitor.writeFile.mockResolvedValue({uri: 'content://cache/chart.png'});
    capacitor.share.mockResolvedValue(undefined);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    await exportNativeMenuChoice({export: async () => new Blob([bytes], {type: 'image/png'})}, 'plugin', 'chart.png');
    expect(capacitor.writeFile).toHaveBeenCalledWith({path: 'chart.png', data: Buffer.from(bytes).toString('base64'), directory: 'CACHE'});
    expect(capacitor.share).toHaveBeenCalledWith({title: 'chart.png', url: 'content://cache/chart.png'});
  });
});
