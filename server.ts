import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

let duckdbModule: any = null;
async function loadDuckDbModule() {
  if (duckdbModule) return duckdbModule;
  try {
    const imported = await import("duckdb");
    duckdbModule = imported.default || imported;
  } catch (e) {
    console.warn("DuckDB native module failed to load in server.ts:", e);
  }
  return duckdbModule;
}

const app = express();
app.use(express.json());

// Enable CORS for desktop clients (Tauri) and local connections
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const PORT = 3000;

// Healthcheck endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: duckdbModule ? "native_duckdb_server" : "wasm_duckdb_server" });
});

// Global duckdb connection for the server
let db: any = null;
let currentDbPath: string | null = null;

function applyDuckDbPragmas(dbObj: any, config: any) {
  if (!dbObj || !config) return;
  const { allowUnsignedExtensions, memoryLimit, tempDirectory, extensionDirectory, threads } = config;
  
  if (allowUnsignedExtensions !== undefined) {
    const val = allowUnsignedExtensions ? 'true' : 'false';
    dbObj.run(`SET allow_unsigned_extensions=${val};`, () => {});
  }
  if (memoryLimit && String(memoryLimit).trim()) {
    const cleanMem = String(memoryLimit).trim().replace(/['";]/g, '');
    dbObj.run(`PRAGMA memory_limit='${cleanMem}';`, () => {});
  }
  if (threads !== undefined && parseInt(threads) >= 0) {
    dbObj.run(`PRAGMA threads=${parseInt(threads)};`, () => {});
  }
  if (tempDirectory && String(tempDirectory).trim()) {
    const cleanDir = String(tempDirectory).trim().replace(/['";]/g, '');
    dbObj.run(`PRAGMA temp_directory='${cleanDir}';`, () => {});
  }
  if (extensionDirectory && String(extensionDirectory).trim()) {
    const cleanDir = String(extensionDirectory).trim().replace(/['";]/g, '');
    dbObj.run(`PRAGMA extension_directory='${cleanDir}';`, () => {});
  }
}

app.post("/api/duckdb/connect", async (req, res) => {
  try {
    let { dbPath, config } = req.body;
    if (!dbPath) {
      return res.status(400).json({ error: "dbPath is required" });
    }

    const duckdb = await loadDuckDbModule();
    if (!duckdb || !duckdb.Database) {
      return res.status(500).json({ error: "Native DuckDB is not available on this server environment. Use WASM mode." });
    }

    if (db) {
      if (typeof db.close === 'function') {
        db.close();
      }
    }

    const allowUnsigned = config?.allowUnsignedExtensions ?? false;
    const dbOpts: any = {
      allow_unsigned_extensions: allowUnsigned ? "true" : "false"
    };
    if (config?.memoryLimit) {
      dbOpts.max_memory = String(config.memoryLimit);
    }
    if (config?.threads) {
      dbOpts.threads = String(config.threads);
    }

    db = new duckdbModule.Database(dbPath, dbOpts);
    currentDbPath = dbPath;

    if (config) {
      applyDuckDbPragmas(db, config);
    }

    res.json({ success: true, path: dbPath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/duckdb/configure", (req, res) => {
  if (!db) {
    return res.status(400).json({ error: "No database connected" });
  }
  try {
    applyDuckDbPragmas(db, req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/duckdb/disconnect", (req, res) => {
  if (db) {
    try {
      // DuckDB Node.js API might not have a close() method or it might close automatically.
      // But we can reset our reference to it.
      // We check if close exists before calling it.
      if (typeof (db as any).close === 'function') {
        (db as any).close();
      }
    } catch (e) {
      // ignore
    }
    db = null;
    currentDbPath = null;
  }
  res.json({ success: true });
});

app.post("/api/duckdb/query", (req, res) => {
  if (!db) {
    return res.status(400).json({ error: "No database connected" });
  }

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const stmt = db.prepare(query);
    stmt.all((err, resData) => {
      try {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        let meta = [];
        const cols = stmt.columns();
        if (cols && Array.isArray(cols)) {
          meta = cols.map((c: any) => ({ 
            name: c.name, 
            type: c.type?.sql_type || c.type?.id || 'UNKNOWN'
          }));
        }
        
        const responsePayload = {
          success: true,
          data: resData,
          meta: meta
        };
        
        // Handle BigInt serialization
        const jsonStr = JSON.stringify(responsePayload, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        );
        
        res.type('json').send(jsonStr);
      } catch (callbackErr: any) {
        if (!res.headersSent) {
          res.status(500).json({ error: callbackErr.message });
        }
      }
    });
  } catch (err: any) {
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
});

// ClickHouse proxy endpoints
app.post("/api/clickhouse/test", async (req, res) => {
  const { protocol, host, user, key, database } = req.body;
  if (!host) {
    return res.status(400).json({ error: "Host is required" });
  }

  try {
    const cleanHost = host.replace(/^https?:\/\//i, '');
    const params = new URLSearchParams();
    if (database) params.set('database', database);
    if (params.toString() === '') params.set('default_format', 'JSON');
    const url = `${protocol || 'http'}://${cleanHost}/?${params.toString()}`;

    const chRes = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ClickHouse-User': user || 'default',
        'X-ClickHouse-Key': key || '',
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: 'SELECT 1'
    });

    const responseText = await chRes.text();
    if (!chRes.ok) {
      return res.status(chRes.status).json({ error: responseText || `HTTP ${chRes.status}` });
    }

    res.json({ success: true, text: responseText.trim() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/clickhouse/query", async (req, res) => {
  const { protocol, host, user, key, database, query } = req.body; console.log("CH QUERY:", query);
  if (!host || !query) {
    return res.status(400).json({ error: "Host and query are required" });
  }

  try {
    const cleanHost = host.replace(/^https?:\/\//i, '');
    const params = new URLSearchParams();
    if (database) params.set('database', database);
    if (params.toString() === '') params.set('default_format', 'JSON');
    const url = `${protocol || 'http'}://${cleanHost}/?${params.toString()}`;

    const chRes = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ClickHouse-User': user || 'default',
        'X-ClickHouse-Key': key || '',
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: query
    });

    const responseText = await chRes.text();
    if (!chRes.ok) {
      return res.status(chRes.status).json({ error: responseText || `HTTP ${chRes.status}` });
    }

    try {
      const json = JSON.parse(responseText);
      res.json({ success: true, data: json.data || json, meta: json.meta });
    } catch {
      res.json({ success: true, text: responseText });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/clickhouse/copy-to", async (req, res) => {
  const { protocol, host, user, key, database, innerSql, filePath } = req.body;
  if (!host || !innerSql || !filePath) {
    return res.status(400).json({ error: "Host, innerSql and filePath are required" });
  }

  try {
    const cleanHost = host.replace(/^https?:\/\//i, '');
    const params = new URLSearchParams();
    if (database) params.set('database', database);
    if (params.toString() === '') params.set('default_format', 'JSON');
    const url = `${protocol || 'http'}://${cleanHost}/?${params.toString()}`;

    let sqlToExec = innerSql.trim().replace(/;+$/, '');
    if (!/\bFORMAT\b/i.test(sqlToExec)) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.csv') {
        sqlToExec += ' FORMAT CSVWithNames';
      } else if (ext === '.tsv' || ext === '.tab') {
        sqlToExec += ' FORMAT TSVWithNames';
      } else if (ext === '.json') {
        sqlToExec += ' FORMAT JSONEachRow';
      } else {
        sqlToExec += ' FORMAT Parquet';
      }
    }

    const chRes = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ClickHouse-User': user || 'default',
        'X-ClickHouse-Key': key || '',
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: sqlToExec
    });

    if (!chRes.ok) {
      const errorText = await chRes.text();
      return res.status(chRes.status).json({ error: errorText || `HTTP ${chRes.status}` });
    }

    const arrayBuffer = await chRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const dir = path.dirname(filePath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      message: `Файл успешно сохранен: ${filePath}`,
      bytes: buffer.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/clickhouse/copy-from", async (req, res) => {
  const { protocol, host, user, key, database, innerSql, filePath } = req.body;
  if (!host || !innerSql || !filePath) {
    return res.status(400).json({ error: "Host, innerSql and filePath are required" });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: `Файл не найден по пути: ${filePath}` });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const cleanHost = host.replace(/^https?:\/\//i, '');
    const ext = path.extname(filePath).toLowerCase();

    let target = innerSql.trim();
    if (!/^INSERT INTO/i.test(target)) {
      target = `INSERT INTO ${target}`;
    }
    if (!/\bFORMAT\b/i.test(target)) {
      if (ext === '.csv') {
        target += ' FORMAT CSVWithNames';
      } else if (ext === '.tsv' || ext === '.tab') {
        target += ' FORMAT TSVWithNames';
      } else if (ext === '.json') {
        target += ' FORMAT JSONEachRow';
      } else {
        target += ' FORMAT Parquet';
      }
    }

    const params = new URLSearchParams();
    if (database) params.set('database', database);
    params.set('query', target);
    const url = `${protocol || 'http'}://${cleanHost}/?${params.toString()}`;

    const chRes = await fetch(url, {
      method: 'POST',
      headers: {
        'X-ClickHouse-User': user || 'default',
        'X-ClickHouse-Key': key || '',
        'Content-Type': 'application/octet-stream'
      },
      body: fileBuffer
    });

    const responseText = await chRes.text();
    if (!chRes.ok) {
      return res.status(chRes.status).json({ error: responseText || `HTTP ${chRes.status}` });
    }

    res.json({
      success: true,
      message: `Данные из файла ${filePath} успешно загружены в Clickhouse`,
      response: responseText || 'OK'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// VFS File Upload endpoint for syncing uploaded files with server DuckDB
app.post("/api/vfs/upload", express.json({ limit: "500mb" }), (req, res) => {
  try {
    const { fileName, contentBase64 } = req.body;
    if (!fileName || !contentBase64) {
      return res.status(400).json({ error: "fileName and contentBase64 are required" });
    }
    const cleanFileName = path.basename(fileName);
    const targetPath = path.resolve(process.cwd(), cleanFileName);
    const buffer = Buffer.from(contentBase64, 'base64');
    fs.writeFileSync(targetPath, buffer);
    res.json({ success: true, fileName: cleanFileName, size: buffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/vfs/delete", express.json(), (req, res) => {
  try {
    const { fileName } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: "fileName is required" });
    }
    const cleanFileName = path.basename(fileName);
    const targetPath = path.resolve(process.cwd(), cleanFileName);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

async function startServer() {
  await loadDuckDbModule();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
