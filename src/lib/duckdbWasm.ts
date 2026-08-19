let dbInstance: any = null;
let connInstance: any = null;
let duckDbInitPromise: Promise<any> | null = null;

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
    }, 3000);

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
}

export async function applyDuckDbConfigWasm(options?: DuckDbConfigOptions) {
  if (!options) return;
  const db = await getDuckDbWasm();
  if (!connInstance) {
    connInstance = await db.connect();
  }

  try {
    if (options.allowUnsignedExtensions !== undefined) {
      const val = options.allowUnsignedExtensions ? 'true' : 'false';
      await connInstance.query(`SET allow_unsigned_extensions = ${val};`);
    }
    if (options.memoryLimit && options.memoryLimit.trim()) {
      const cleanMem = options.memoryLimit.trim().replace(/['";]/g, '');
      await connInstance.query(`PRAGMA memory_limit = '${cleanMem}';`);
    }
    if (options.threads !== undefined && options.threads >= 0) {
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
export function downloadFileInBrowser(fileName: string, buffer: Uint8Array) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.split(/[\\\/]/).pop() || fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  // Detect if query is COPY ... TO 'fileName'
  const isCopyMatch = /COPY\b[\s\S]*?\bTO\b\s*['"]([^'"]+)['"]/i.exec(sqlQuery);
  const copyTargetFile = isCopyMatch ? isCopyMatch[1].trim() : null;

  const result = await connInstance.query(sqlQuery);

  // Handle COPY TO output file extraction from WASM VFS
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

      if (exportedBuffer && exportedBuffer.length > 0) {
        if (isTauriEnvironment()) {
          await writeTauriFileBinary(copyTargetFile, exportedBuffer);
        } else {
          downloadFileInBrowser(fileNameOnly, exportedBuffer);
        }
      }
    } catch (e) {
      console.warn("Failed to process COPY TO output file:", e);
    }
  }

  const rows = result.toArray().map((row: any) => {
    const obj: Record<string, any> = row.toJSON();
    for (const key in obj) {
      if (typeof obj[key] === 'bigint') {
        obj[key] = obj[key].toString();
      } else if (obj[key] instanceof Date) {
        obj[key] = obj[key].toISOString().replace('T', ' ').replace('Z', '');
      }
    }
    return obj;
  });

  const typesDict: Record<string, string> = {};
  if (result?.schema?.fields) {
    result.schema.fields.forEach((f: any) => {
      if (f.name && f.type) {
        typesDict[f.name] = f.type.toString();
      }
    });
  }
  
  const resultRows: any = rows;
  resultRows.__columnTypes = typesDict;

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
      } catch (e) {
        console.warn("Failed to register file buffer in DuckDB WASM:", name, e);
      }
    }
  }
}

export async function getRegisteredWasmFiles(): Promise<Array<{ name: string; size?: number; loadedAt?: Date }>> {
  const result: Array<{ name: string; size?: number; loadedAt?: Date }> = [];
  const seen = new Set<string>();

  // 1. First add files from registeredVfsFiles Map
  for (const [name, meta] of registeredVfsFiles.entries()) {
    result.push({ name, size: meta.size, loadedAt: meta.loadedAt });
    seen.add(name);
  }

  // 2. Try fetching from WASM worker (if active)
  try {
    const fetchWasmFiles = async () => {
      const db = await getDuckDbWasm();
      if (db && typeof db.globFileInfos === 'function') {
        const fileInfos = await db.globFileInfos('*');
        if (Array.isArray(fileInfos)) {
          for (const info of fileInfos) {
            const rawFileName = (info as any).fileName || (info as any).file || (info as any).name;
            if (rawFileName && typeof rawFileName === 'string') {
              const cleanName = rawFileName.replace(/^\.\//, '');
              if (!seen.has(cleanName) && !seen.has(rawFileName)) {
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

  const isSystemFile = (filename: string): boolean => {
    const f = filename.toLowerCase();
    return (
      f.startsWith('.') ||
      f === 'package.json' ||
      f === 'package-lock.json' ||
      f === 'tsconfig.json' ||
      f === 'tsconfig.node.json' ||
      f === 'vite.config.ts' ||
      f === 'server.ts' ||
      f === 'index.html' ||
      f === 'components.json' ||
      f.startsWith('node_modules') ||
      f.startsWith('dist') ||
      f.startsWith('src') ||
      f.startsWith('public') ||
      f.endsWith('.js') ||
      f.endsWith('.lock')
    );
  };

  // 3. Try fetching from Server API (if DuckDB server is active)
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

  try {
    await fetch('/api/vfs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: cleanFileName }),
    });
  } catch (_) {}

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
    };

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));
    await Promise.race([dropTask(), timeoutPromise]);
  } catch (_) {}

  return true;
}

export async function registerWasmFile(fileName: string, buffer: Uint8Array): Promise<boolean> {
  const cleanFileName = fileName.split(/[\\\/]/).pop() || fileName;

  // Store in memory map with buffer immediately
  registeredVfsFiles.set(cleanFileName, { buffer, size: buffer.byteLength, loadedAt: new Date() });
  wasmRegisteredSet.delete(cleanFileName);

  // Sync file with Server VFS so Server DuckDB instance can query it
  try {
    const contentBase64 = await uint8ArrayToBase64Async(buffer);
    const res = await fetch('/api/vfs/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: cleanFileName, contentBase64 }),
    });
    if (!res.ok) {
      console.warn("Server VFS sync failed status:", res.status);
    }
  } catch (e) {
    console.warn("Server VFS sync failed:", e);
  }

  // Attempt WASM worker registration with generous timeout
  try {
    const registerTask = async () => {
      const db = await getDuckDbWasm();
      try {
        await db.dropFile(cleanFileName);
      } catch (_) {}
      await db.registerFileBuffer(cleanFileName, buffer);
      wasmRegisteredSet.add(cleanFileName);
    };

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("WASM register timeout")), 8000)
    );
    await Promise.race([registerTask(), timeoutPromise]);
  } catch (e) {
    console.warn("WASM worker registration postponed to query time:", cleanFileName, e);
  }

  return true;
}

export async function disconnectDuckDbWasm() {
  if (connInstance) {
    try {
      await connInstance.close();
    } catch (_) {}
    connInstance = null;
  }
}
