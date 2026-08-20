export async function downloadFileWithFallback(blob: Blob, filename: string) {
  const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_IPC__' in window);
  if (isTauri) {
    try {
      let savePath: string | null = null;
      const extMatch = filename.match(/\.([^.]+)$/);
      const ext = extMatch ? extMatch[1] : '*';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      
      if ((window as any).__TAURI__?.dialog?.save) {
        savePath = await (window as any).__TAURI__.dialog.save({
          defaultPath: filename,
          filters: [{ name: 'Export', extensions: [ext] }],
        });
      } else {
        const { save } = await import('@tauri-apps/api/dialog');
        savePath = await save({
          defaultPath: filename,
          filters: [{ name: 'Export', extensions: [ext] }],
        });
      }
      if (!savePath) return;

      const buffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      if ((window as any).__TAURI__?.fs?.writeBinaryFile) {
        await (window as any).__TAURI__.fs.writeBinaryFile(savePath, uint8Array);
      } else {
        const { writeBinaryFile } = await import('@tauri-apps/api/fs');
        await writeBinaryFile(savePath, uint8Array);
      }
      return;
    } catch (err) {
      console.warn("Tauri export failed, falling back to web:", err);
    }
  }

  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform();
  if (isCapacitor) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const buffer = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = window.btoa(binary);

      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });

      await Share.share({
        title: filename,
        url: savedFile.uri,
      });
      return;
    } catch (err) {
      console.warn("Capacitor export failed, falling back to web:", err);
    }
  }

  // Web fallback
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
