let dbInstance: any = null;
let connInstance: any = null;

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_IPC__' in window);
}

// Track files registered in WASM memory to allow cleanup and prevent memory leaks
const registeredFilesMap = new Map<string, number>();

// Read local file from disk via Tauri FS API if available
async function readTauriFileBinary(filePath: string): Promise<Uint8Array | null> {
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.fs) {
      const fs = (window as any).__TAURI__.fs;
      if (fs.readBinaryFile) {
        const data = await fs.readBinaryFile(filePath);
        return new Uint8Array(data);
      }
    }
    const tauriFs = await import('@tauri-apps/api/fs');
    if (tauriFs && tauriFs.readBinaryFile) {
      const data = await tauriFs.readBinaryFile(filePath);
      return new Uint8Array(data);
    }
  } catch (e) {
    console.warn("Could not read file via Tauri FS:", filePath, e);
  }
  return null;
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
    if (tauriFs && tauriFs.writeBinaryFile) {
      await tauriFs.writeBinaryFile(filePath, data);
      return true;
    }
  } catch (e) {
    console.warn("Could not write file via Tauri FS:", filePath, e);
  }
  return false;
}

// Extract quoted path strings from SQL query and pre-register them in DuckDB WASM if in Tauri
async function preloadTauriFilesFromQuery(db: any, sqlQuery: string) {
  if (!isTauriEnvironment()) return;

  const pathMatches = sqlQuery.match(/['"]([^'"]+)['"]/g);
  if (!pathMatches) return;

  for (const match of pathMatches) {
    const rawPath = match.slice(1, -1).trim();
    const isLocalDriveOrNetwork = /^[a-zA-Z]:[\\\/]|^\\\\|^\/|^~/i.test(rawPath);
    const hasDataExtension = /\.(csv|parquet|json|duckdb|db|tsv|txt)$/i.test(rawPath);

    if (isLocalDriveOrNetwork || hasDataExtension) {
      const normalizedPath = rawPath.replace(/\\/g, '/');
      const fileNameOnly = rawPath.split(/[\\\/]/).pop() || 'data_file';

      const binaryData = (await readTauriFileBinary(rawPath)) || (await readTauriFileBinary(normalizedPath));
      if (binaryData) {
        try {
          // Unregister existing virtual file buffer first to release WASM RAM memory
          if (registeredFilesMap.has(rawPath)) {
            try { await db.dropFile(rawPath); } catch (_) {}
            try { await db.dropFile(normalizedPath); } catch (_) {}
            try { await db.dropFile(fileNameOnly); } catch (_) {}
          }

          await db.registerFileBuffer(rawPath, binaryData);
          await db.registerFileBuffer(normalizedPath, binaryData);
          await db.registerFileBuffer(fileNameOnly, binaryData);

          registeredFilesMap.set(rawPath, Date.now());
        } catch (e) {
          console.warn("Failed to register file in DuckDB WASM:", rawPath, e);
        }
      }
    }
  }
}


export async function getDuckDbWasm() {
  if (dbInstance) return dbInstance;

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

  let bundle: any;
  try {
    bundle = await duckdb.selectBundle(LOCAL_BUNDLES);
  } catch (_) {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  }

  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  dbInstance = db;
  return db;
}

export async function connectDuckDbWasmMemory() {
  const db = await getDuckDbWasm();
  if (connInstance) {
    try {
      await connInstance.close();
    } catch (_) {}
    connInstance = null;
  }
  connInstance = await db.connect();
  return ":memory:";
}

export async function connectDuckDbWasmFile(file: File) {
  const db = await getDuckDbWasm();
  if (connInstance) {
    try {
      await connInstance.close();
    } catch (_) {}
    connInstance = null;
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileName = file.name || "db.duckdb";

  await db.registerFileBuffer(fileName, new Uint8Array(arrayBuffer));
  connInstance = await db.connect();

  try {
    await connInstance.query(`ATTACH '${fileName}' AS attached_db`);
  } catch (_) {
    // Registered in in-browser WASM filesystem
  }

  return fileName;
}

export async function queryDuckDbWasm(sqlQuery: string) {
  const db = await getDuckDbWasm();
  if (!connInstance) {
    connInstance = await db.connect();
  }

  await preloadTauriFilesFromQuery(db, sqlQuery);
  const cleanQuery = sqlQuery;

  // Check if query is COPY ... TO 'path'
  const isCopyQuery = /COPY\b[\s\S]*?\bTO\b\s*['"]([^'"]+)['"]/i.exec(sqlQuery);
  const copyTargetPath = isCopyQuery ? isCopyQuery[1].trim() : null;

  const result = await connInstance.query(cleanQuery);

  // If COPY TO was executed in Tauri desktop mode, flush exported file from WASM VFS to physical disk
  if (copyTargetPath && isTauriEnvironment()) {
    try {
      const normalizedPath = copyTargetPath.replace(/\\/g, '/');
      const fileNameOnly = copyTargetPath.split(/[\\\/]/).pop() || 'export_data';

      let exportedBuffer: Uint8Array | null = null;
      try {
        exportedBuffer = await db.copyFileToBuffer(copyTargetPath);
      } catch (_) {
        try {
          exportedBuffer = await db.copyFileToBuffer(normalizedPath);
        } catch (_) {
          try {
            exportedBuffer = await db.copyFileToBuffer(fileNameOnly);
          } catch (_) {}
        }
      }

      if (exportedBuffer && exportedBuffer.length > 0) {
        // Write file directly to real physical disk / network drive
        await writeTauriFileBinary(copyTargetPath, exportedBuffer);

        // Immediately drop file from WASM VFS to free memory
        try { await db.dropFile(copyTargetPath); } catch (_) {}
        try { await db.dropFile(normalizedPath); } catch (_) {}
        try { await db.dropFile(fileNameOnly); } catch (_) {}
      }
    } catch (e) {
      console.warn("Failed to write COPY TO file to disk in Tauri:", e);
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

  return rows;
}

export async function disconnectDuckDbWasm() {
  if (connInstance) {
    try {
      await connInstance.close();
    } catch (_) {}
    connInstance = null;
  }
}
