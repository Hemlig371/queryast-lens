import express from "express";
import duckdb from "duckdb";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const { Database } = duckdb;

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

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Healthcheck endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: "native_duckdb_server" });
});

// Global duckdb connection for the server
let db: Database | null = null;
let currentDbPath: string | null = null;

app.post("/api/duckdb/connect", (req, res) => {
  try {
    let { dbPath } = req.body;
    if (!dbPath) {
      return res.status(400).json({ error: "dbPath is required" });
    }

    // Remove directory fallback for DuckDB file
    if (db) {
      db.close();
    }

    db = new Database(dbPath);
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

async function startServer() {
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
