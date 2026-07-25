let dbInstance: any = null;
let connInstance: any = null;
let activeFileName: string | null = null;

export async function getDuckDbWasm() {
  if (dbInstance) return dbInstance;

  const duckdb = await import('@duckdb/duckdb-wasm');
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  dbInstance = db;
  return db;
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
  activeFileName = fileName;

  await db.registerFileBuffer(fileName, new Uint8Array(arrayBuffer));
  connInstance = await db.connect();

  // Try attaching file if it's a DuckDB/SQLite database file
  try {
    await connInstance.query(`ATTACH '${fileName}' AS attached_db`);
  } catch (_) {
    // File registered in WASM filesystem, can also be queried directly
  }

  return fileName;
}

export async function queryDuckDbWasm(sqlQuery: string) {
  if (!connInstance) {
    const db = await getDuckDbWasm();
    connInstance = await db.connect();
  }

  const result = await connInstance.query(sqlQuery);
  const rows = result.toArray().map(row => {
    const obj: Record<string, any> = row.toJSON();
    for (const key in obj) {
      if (typeof obj[key] === 'bigint') {
        obj[key] = obj[key].toString();
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
  activeFileName = null;
}
