import { normalizeWasmTable } from '../utils/wasmResult';
import { isSystemVfsFile, detectCopyTarget, type WasmRegisterResult } from '../utils/wasmFiles';

let dbInstance: any = null;
let connInstance: any = null;
let duckDbInitPromise: Promise<any> | null = null;

/** Dev-сервер (web/server.ts с /api/vfs/*) есть только в веб-режиме; в Tauri и Capacitor его нет. */
function hasDevVfsServer(): boolean {
  if (typeof window === 'undefined') return false;
  if ('__TAURI__' in window || '__TAURI_IPC__' in window) return false;
  if ((window as any).Capacitor?.isNativePlatform?.()) return false;
  return true;
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_IPC__' in window);
}

export async function getDuckDbWasm() {
  if (dbInstance) return dbInstance;
  if (duckDbInitPromise) return duckDbInitPromise;

  duckDbInitPromise = new Promise(async (resolve, reject) => {
    let timer = setTimeout(() => {
      duckDbInitPromise = null;
      reject(new Error("DuckDB WASM worker initialization timed out"));
    }, 10000);

    try {
      const duckdb = await import('@duckdb/duckdb-wasm');
      
      const baseUrl = (typeof window !== 'undefined' ? window.location.href : '').replace(/\/[^\/]*$/, '/');
      const duckdbPath = new URL('./duckdb', baseUrl).href;

      const LOCAL_BUNDLES = {
        mvp: {
          mainModule: `${duckdbPath}/duckdb-mvp.wasm`,
          mainWorker: `${duckdbPath}/duckdb-browser-mvp.worker.js`,
        },
        eh: {
          mainModule: `${duckdbPath}/duckdb-eh.wasm`,
          mainWorker: `${duckdbPath}/duckdb-browser-eh.worker.js`,
        },
      };

      let bundle;
      try {
        bundle = await duckdb.selectBundle(LOCAL_BUNDLES);
      } catch (e) {
        console.warn("Local DuckDB bundle selection failed, using JSDelivr CDN:", e);
        bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      }

      const worker = await duckdb.createWorker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      try {
        await db.open({ allowUnsignedExtensions: true });
      } catch (_) {}

      clearTimeout(timer);
      dbInstance = db;
      resolve(db);
    } catch (err) {
      clearTimeout(timer);
      duckDbInitPromise = null;
      reject(err);
    }
  });

  return duckDbInitPromise;
}

export interface DuckDbConfigOptions {
  allowUnsignedExtensions?: boolean;
  memoryLimit?: string;
  tempDirectory?: string;
  extensionDirectory?: string;
  threads?: number;
  initSql?: string;
}

export async function applyDuckDbConfigWasm(options?: DuckDbConfigOptions) {
  if (!options) return;
  const db = await getDuckDbWasm();
  if (!connInstance) {
    connInstance = await db.connect();
  }

  try {
    if (options.memoryLimit && options.memoryLimit.trim()) {
      const cleanMem = options.memoryLimit.trim().replace(/['";]/g, '');
      await connInstance.query(`PRAGMA memory_limit = '${cleanMem}';`);
    }
    if (options.threads !== undefined && options.threads > 0) { // 0 = «авто»: PRAGMA threads=0 отвергается
      await connInstance.query(`PRAGMA threads = ${options.threads};`);
    }
    if (options.tempDirectory && options.tempDirectory.trim()) {
      const cleanDir = options.tempDirectory.trim().replace(/['";]/g, '');
      await connInstance.query(`PRAGMA temp_directory = '${cleanDir}';`);
    }
    if (options.extensionDirectory && options.extensionDirectory.trim()) {
      const cleanDir = options.extensionDirectory.trim().replace(/['";]/g, '');
      await connInstance.query(`PRAGMA extension_directory = '${cleanDir}';`);
    }
  } catch (e) {
    console.warn("Failed to apply DuckDB WASM config PRAGMAs:", e);
  }

  if (options.initSql && options.initSql.trim()) {
    try {
      await connInstance.query(options.initSql);
    } catch (e) {
      console.warn("Failed to execute DuckDB WASM initSql:", e);
    }
  }
}

export async function connectDuckDbWasmMemory(options?: DuckDbConfigOptions) {
  const db = await getDuckDbWasm();
  if (connInstance) {
    try {
      await connInstance.close();
    } catch (_) {}
    connInstance = null;
  }
  connInstance = await db.connect();
  if (options) {
    await applyDuckDbConfigWasm(options);
  }
  return ":memory:";
}

export async function connectDuckDbWasmFile(file: File, options?: DuckDbConfigOptions) {
  const db = await getDuckDbWasm();
  if (connInstance) {
    try {
      await connInstance.close();
    } catch (_) {}
    connInstance = null;
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileName = file.name || "db.duckdb";

  try {
    await db.dropFile(fileName);
  } catch (_) {}
  const u8Array = new Uint8Array(arrayBuffer);
  await db.registerFileBuffer(fileName, u8Array);
  registeredVfsFiles.set(fileName, { size: u8Array.byteLength, loadedAt: new Date() });
  connInstance = await db.connect();

  if (options) {
    await applyDuckDbConfigWasm(options);
  }

  try {
    await connInstance.query(`ATTACH '${fileName}' AS attached_db`);
  } catch (_) {
    // Registered in in-browser WASM filesystem
  }

  return fileName;
}

export async function attachDuckDbWasmFile(file: File): Promise<string> {
  const db = await getDuckDbWasm();
  if (!connInstance) {
    connInstance = await db.connect();
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileName = file.name || "attached.duckdb";

  // Register the file buffer in WASM virtual filesystem using single fileName
  try {
    await db.dropFile(fileName);
  } catch (_) {}
  const u8ArrayAttach = new Uint8Array(arrayBuffer);
  await db.registerFileBuffer(fileName, u8ArrayAttach);
  registeredVfsFiles.set(fileName, { size: u8ArrayAttach.byteLength, loadedAt: new Date() });

  // Determine database alias without extension (e.g. "my_data" from "my_data.duckdb")
  const rawAlias = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_') || 'attached_db';

  // Execute ATTACH in DuckDB WASM
  const escapedFileName = fileName.replace(/'/g, "''");
  const escapedAlias = rawAlias.replace(/"/g, '""');
  await connInstance.query(`ATTACH '${escapedFileName}' AS "${escapedAlias}"`);

  return rawAlias;
}

// Write binary data directly to physical disk via Tauri FS API
async function writeTauriFileBinary(filePath: string, data: Uint8Array): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.fs) {
      const fs = (window as any).__TAURI__.fs;
      if (fs.writeBinaryFile) {
        await fs.writeBinaryFile(filePath, data);
        return true;
      }
    }
    const tauriFs = await import('@tauri-apps/api/fs');
    if (tauriFs && tauriFs.readBinaryFile) {
      await tauriFs.writeBinaryFile(filePath, data);
      return true;
    }
  } catch (e) {
    console.warn("Could not write file via Tauri FS:", filePath, e);
  }
  return false;
}

// Download exported file buffer in web browser
export async function downloadFileInBrowser(fileName: string, buffer: Uint8Array) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const downloadName = fileName.split(/[\\\/]/).pop() || fileName;

  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform();
  if (isCapacitor) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const savedFile = await Filesystem.writeFile({
        path: downloadName,
        data: base64Data,
        directory: Directory.Cache,
      });

      await Share.share({
        title: downloadName,
        url: savedFile.uri,
      });
      return;
    } catch (err) {
      console.warn("Capacitor export failed, falling back to web:", err);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function exportWasmFile(fileName: string): Promise<Uint8Array | null> {
  const db = await getDuckDbWasm();
  try {
    return await db.copyFileToBuffer(fileName);
  } catch (e) {
    console.warn("Failed to copy file from DuckDB WASM VFS:", fileName, e);
    return null;
  }
}

export async function queryDuckDbWasm(sqlQuery: string) {
  const db = await getDuckDbWasm();
  if (!connInstance) {
    connInstance = await db.connect();
  }

  // Ensure all uploaded VFS files are registered in DuckDB WASM VFS before running query
  await ensureWasmFilesRegistered(db);

  // COPY ... TO 'файл': ищется только в коде, комментарии и строки не считаются (WS-07)
  const copyTargetFile = detectCopyTarget(sqlQuery);

  const result = await connInstance.query(sqlQuery);

  // Handle COPY TO output file extraction from WASM VFS
  let copyNotice: string | null = null;
  if (copyTargetFile) {
    try {
      const fileNameOnly = copyTargetFile.split(/[\\\/]/).pop() || copyTargetFile;
      let exportedBuffer: Uint8Array | null = null;
      
      try {
        exportedBuffer = await db.copyFileToBuffer(copyTargetFile);
      } catch (_) {
        try {
          exportedBuffer = await db.copyFileToBuffer(fileNameOnly);
        } catch (_) {}
      }

      if (exportedBuffer) {
        // Пустой файл (0 байт) — тоже настоящий результат COPY; раньше он молча не сохранялся.
        if (isTauriEnvironment()) {
          await writeTauriFileBinary(copyTargetFile, exportedBuffer);
        } else {
          await downloadFileInBrowser(fileNameOnly, exportedBuffer);
        }
      } else {
        copyNotice = `COPY TO '${copyTargetFile}': файл не найден в виртуальной памяти WASM, сохранить его не удалось`;
        console.warn(copyNotice);
      }
    } catch (e) {
      copyNotice = `COPY TO '${copyTargetFile}': ошибка сохранения файла: ${e instanceof Error ? e.message : String(e)}`;
      console.warn("Failed to process COPY TO output file:", e);
    }
  }

  // Не более 500 000 строк без материализации всей таблицы (WS-05); значения приводятся к виду Tauri (п. 3.14, WS-04):
  // даты и время — строками, DECIMAL/BIGINT — строками, INTERVAL, BLOB, вложенные значения — как в execute_query.
  // Имена столбцов делаются уникальными, порядок хранится отдельно (п. 3.2).
  const normalized = normalizeWasmTable(result as any, 500000);
  const resultRows: any = normalized.rows;
  resultRows.__columnTypes = normalized.columnTypes;
  resultRows.__columns = normalized.columns;
  if (copyNotice) resultRows.__notice = copyNotice; // пока только в свойстве массива: в интерфейсе не показывается

  return resultRows;
}

const registeredVfsFiles = new Map<string, { buffer?: Uint8Array; size?: number; loadedAt: Date }>();
const wasmRegisteredSet = new Set<string>();

export async function ensureWasmFilesRegistered(db: any) {
  if (!db) return;
  for (const [name, meta] of registeredVfsFiles.entries()) {
    if (meta.buffer && !wasmRegisteredSet.has(name)) {
      try {
        await db.dropFile(name);
      } catch (_) {}
      try {
        await db.registerFileBuffer(name, meta.buffer);
        wasmRegisteredSet.add(name);
        meta.buffer = undefined;
      } catch (e) {
        console.warn("Failed to register file buffer in DuckDB WASM:", name, e);
      }
    }
  }
}

export async function getRegisteredWasmFiles(): Promise<Array<{ name: string; size?: number; loadedAt?: Date }>> {
  const result: Array<{ name: string; size?: number; loadedAt?: Date }> = [];
  const seen = new Set<string>();

  const isSystemFile = isSystemVfsFile;

  // 1. First add files from registeredVfsFiles Map
  for (const [name, meta] of registeredVfsFiles.entries()) {
    result.push({ name, size: meta.size, loadedAt: meta.loadedAt });
    seen.add(name);
  }

  // 2. Try fetching from WASM worker (if active)
  try {
    const fetchWasmFiles = async () => {
      const db = await getDuckDbWasm();

      // Try querying glob directly from the connection for files generated via COPY TO
      if (connInstance) {
        try {
          const res = await connInstance.query("SELECT * FROM glob('*')");
          if (res) {
            const rows = res.toArray().map((r: any) => r.toJSON());
            for (const row of rows) {
              const rawFileName = row.file || row.name || row.file_name;
              if (rawFileName && typeof rawFileName === 'string') {
                const cleanName = rawFileName.replace(/^\.\//, '');
                if (!isSystemFile(cleanName) && !seen.has(cleanName) && !seen.has(rawFileName)) {
                  result.push({
                    name: cleanName,
                    size: row.size ? Number(row.size) : undefined,
                    loadedAt: undefined,
                  });
                  seen.add(cleanName);
                }
              }
            }
          }
        } catch (e) {
          console.warn("Direct glob query failed", e);
        }
      }

      if (db && typeof db.globFileInfos === 'function') {
        const fileInfos = await db.globFileInfos('*');
        if (Array.isArray(fileInfos)) {
          for (const info of fileInfos) {
            const rawFileName = (info as any).fileName || (info as any).path || (info as any).file_name || (info as any).file || (info as any).name;
            if (rawFileName && typeof rawFileName === 'string') {
              const cleanName = rawFileName.replace(/^\.\//, '');
              if (!isSystemFile(cleanName) && !seen.has(cleanName) && !seen.has(rawFileName)) {
                result.push({
                  name: cleanName,
                  size: (info as any).fileSize || (info as any).size,
                  loadedAt: undefined,
                });
                seen.add(cleanName);
              }
            }
          }
        }
      }
    };

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));
    await Promise.race([fetchWasmFiles(), timeoutPromise]);
  } catch (_) {}

  // 3. Список с dev-сервера: только там, где он есть (в Tauri и Capacitor его нет, WS-06)
  if (hasDevVfsServer()) {
  try {
    const fetchServerFiles = async () => {
      const res = await fetch('/api/duckdb/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: "SELECT file FROM glob('*')" }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          for (const row of json.data) {
            const rawName = row.file || row.name;
            if (rawName && typeof rawName === 'string') {
              const cleanName = rawName.replace(/^\.\//, '');
              if (!isSystemFile(cleanName) && !seen.has(cleanName) && !seen.has(rawName)) {
                result.push({
                  name: cleanName,
                  size: undefined,
                  loadedAt: undefined,
                });
                seen.add(cleanName);
              }
            }
          }
        }
      }
    };

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));
    await Promise.race([fetchServerFiles(), timeoutPromise]);
  } catch (_) {}
  }

  return result;
}

async function uint8ArrayToBase64Async(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes]);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

export async function dropWasmFile(fileName: string): Promise<boolean> {
  const cleanFileName = fileName.split(/[\\\/]/).pop() || fileName;

  registeredVfsFiles.delete(cleanFileName);
  registeredVfsFiles.delete(fileName);
  wasmRegisteredSet.delete(cleanFileName);
  wasmRegisteredSet.delete(fileName);

  if (hasDevVfsServer()) {
    try {
      await fetch('/api/vfs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: cleanFileName }),
      });
    } catch (_) {}
  }

  // Файл убран из реестра выше; true возвращается только если и WASM подтвердил удаление (раньше — всегда true, WS-07).
  let wasmDone = false;
  try {
    const dropTask = async () => {
      const db = await getDuckDbWasm();
      try {
        await db.dropFile(cleanFileName);
      } catch (_) {}
      try {
        await db.dropFile(fileName);
      } catch (_) {}
      if (connInstance) {
        const alias = cleanFileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        try {
          await connInstance.query(`DETACH "${alias}"`);
        } catch (_) {}
      }
      wasmDone = true;
    };

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5000));
    await Promise.race([dropTask(), timeoutPromise]);
  } catch (e) {
    console.warn("WASM drop failed:", cleanFileName, e);
  }

  return wasmDone;
}

export async function registerWasmFile(fileName: string, buffer: Uint8Array): Promise<WasmRegisterResult> {
  const cleanFileName = fileName.split(/[\\\/]/).pop() || fileName;
  let serverSync: WasmRegisterResult['serverSync'] = 'skipped';
  let error: string | undefined;

  // Store in memory map with buffer immediately
  registeredVfsFiles.set(cleanFileName, { buffer, size: buffer.byteLength, loadedAt: new Date() });
  wasmRegisteredSet.delete(cleanFileName);

  // Sync file with Server VFS so Server DuckDB instance can query it.
  // Только в веб-dev режиме: в Tauri/Capacitor сервера нет, а base64 всего файла впустую съедает память.
  if (hasDevVfsServer()) {
    try {
      const contentBase64 = await uint8ArrayToBase64Async(buffer);
      const res = await fetch('/api/vfs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: cleanFileName, contentBase64 }),
      });
      if (!res.ok) {
        console.warn("Server VFS sync failed status:", res.status);
        serverSync = 'failed';
        error = `server VFS: HTTP ${res.status}`;
      } else {
        serverSync = 'ok';
      }
    } catch (e) {
      console.warn("Server VFS sync failed:", e);
      serverSync = 'failed';
      error = `server VFS: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Attempt WASM worker registration with generous timeout
  let registered = false;
  try {
    const registerTask = async () => {
      const db = await getDuckDbWasm();
      try {
        await db.dropFile(cleanFileName);
      } catch (_) {}
      await db.registerFileBuffer(cleanFileName, buffer);
      wasmRegisteredSet.add(cleanFileName);
      registered = true;
      // Free buffer reference from JS memory once registered in WASM VFS
      const entry = registeredVfsFiles.get(cleanFileName);
      if (entry) {
        entry.buffer = undefined;
      }
    };

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("WASM register timeout")), 8000)
    );
    await Promise.race([registerTask(), timeoutPromise]);
  } catch (e) {
    // Буфер остаётся в реестре: ensureWasmFilesRegistered зарегистрирует файл перед ближайшим запросом.
    console.warn("WASM worker registration postponed to query time:", cleanFileName, e);
    error = e instanceof Error ? e.message : String(e);
  }

  return { status: registered ? 'registered' : 'postponed', serverSync, ...(error ? { error } : {}) };
}

export async function disconnectDuckDbWasm() {
  if (connInstance) {
    try {
      await connInstance.close();
    } catch (_) {}
    connInstance = null;
  }
}
