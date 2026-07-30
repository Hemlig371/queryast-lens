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

app.post("/api/duckdb/connect", async (req, res) => {
  try {
    let { dbPath } = req.body;
    if (!dbPath) {
      return res.status(400).json({ error: "dbPath is required" });
    }

    const duckdb = await loadDuckDbModule();
    if (!duckdb || !duckdb.Database) {
      return res.status(500).json({ error: "Native DuckDB is not available on this server environment. Use WASM mode." });
    }

    // Remove directory fallback for DuckDB file
    if (db) {
      if (typeof db.close === 'function') {
        db.close();
      }
    }

    db = new duckdbModule.Database(dbPath);
    currentDbPath = dbPath;
    res.json({ success: true, path: dbPath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    db.all(query, (err, resData) => {
      try {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // Handle BigInt serialization
        const jsonStr = JSON.stringify(resData, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        );
        
        res.type('json').send(`{"success":true,"data":${jsonStr}}`);
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
  const { protocol, host, user, key, database, query } = req.body;
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
      res.json({ success: true, data: json.data || json });
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
