import { describe, it, expect } from 'vitest';
import { isSystemVfsFile, detectCopyTarget, describeRegisterResult } from '../src/utils/wasmFiles';

// фильтр «системных файлов», COPY-детектор и честный статус загрузки в менеджере файлов.

describe('isSystemVfsFile', () => {
  it('пользовательские файлы с именами, начинающимися на src/dist/public, видны', () => {
    for (const name of ['source.parquet', 'distance.csv', 'public_2024.csv', 'srcdata.json', 'distribution.parquet', 'node_modules_stats.csv']) {
      expect(isSystemVfsFile(name), name).toBe(false);
    }
  });

  it('служебные файлы и каталоги проекта скрыты', () => {
    for (const name of [
      '.env', '.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'server.ts', 'index.html',
      'components.json', 'node_modules/x/y.csv', 'dist/index.html', 'src/App.tsx', 'public/logo.png', 'yarn.lock', 'eslint.config.js',
    ]) {
      expect(isSystemVfsFile(name), name).toBe(true);
    }
  });

  it('регистр имени не важен для служебных имён', () => {
    expect(isSystemVfsFile('Package.JSON')).toBe(true);
    expect(isSystemVfsFile('SRC/main.ts')).toBe(true);
  });

  it('обычные данные видны', () => {
    for (const name of ['data.csv', 'out.parquet', 'base.duckdb', 'a.json', 'b.jsonl', 'c.xlsx']) {
      expect(isSystemVfsFile(name), name).toBe(false);
    }
  });
});

describe('detectCopyTarget', () => {
  it('простой COPY ... TO', () => {
    expect(detectCopyTarget("COPY t TO 'out.csv'")).toBe('out.csv');
    expect(detectCopyTarget("copy (select 1) to 'out.parquet' (format parquet)")).toBe('out.parquet');
    expect(detectCopyTarget('COPY t TO "out.csv"')).toBe('out.csv');
  });

  it('COPY в комментарии не считается', () => {
    expect(detectCopyTarget("-- COPY t TO 'x.csv'\nSELECT 1")).toBeNull();
    expect(detectCopyTarget("/* COPY t TO 'x.csv' */ SELECT 1")).toBeNull();
  });

  it('COPY внутри строки не считается', () => {
    expect(detectCopyTarget("SELECT 'COPY t TO ''x.csv''' AS s")).toBeNull();
    expect(detectCopyTarget("SELECT 'copy' AS a, 'to' AS b, 'x.csv' AS c")).toBeNull();
  });

  it('COPY FROM и обычные запросы не считаются', () => {
    expect(detectCopyTarget("COPY t FROM 'in.csv'")).toBeNull();
    expect(detectCopyTarget('SELECT copy_total FROM t')).toBeNull();
    expect(detectCopyTarget('')).toBeNull();
  });

  it('после COPY стоят комментарий или несколько операторов', () => {
    expect(detectCopyTarget("COPY t TO 'x.csv'; -- готово")).toBe('x.csv');
    expect(detectCopyTarget("CREATE TABLE t AS SELECT 1;\nCOPY t TO 'x.csv' (HEADER);\nSELECT * FROM t")).toBe('x.csv');
  });

  it('строка внутри подзапроса не принимается за цель', () => {
    expect(detectCopyTarget("COPY (SELECT 'to' AS a, 'z' AS b) TO 'x.csv'")).toBe('x.csv');
  });

  it('удвоенная кавычка в имени разворачивается', () => {
    expect(detectCopyTarget("COPY t TO 'it''s.csv'")).toBe("it's.csv");
  });
});

describe('describeRegisterResult', () => {
  it('зарегистрирован сразу', () => {
    const r = describeRegisterResult({ status: 'registered', serverSync: 'skipped' });
    expect(r.kind).toBe('ok');
  });

  it('регистрация отложена до запроса — не «успешно»', () => {
    const r = describeRegisterResult({ status: 'postponed', serverSync: 'skipped', error: 'WASM register timeout' });
    expect(r.kind).toBe('warning');
    expect(r.cause).toBe('postponed');
    expect(r.details).toContain('WASM register timeout');
  });

  it('сбой синхронизации с сервером — предупреждение', () => {
    const r = describeRegisterResult({ status: 'registered', serverSync: 'failed', error: 'server VFS: HTTP 500' });
    expect(r.kind).toBe('warning');
    expect(r.cause).toBe('server-sync');
  });
});

// Страховка: тонкие места duckdbWasm.ts проверены по исходнику (реальную WASM-сборку тесты не запускают).
describe('duckdbWasm.ts использует вынесенные функции (3.15)', () => {
  const fs = require('fs');
  const path = require('path');
  const src: string = fs.readFileSync(path.join(process.cwd(), 'src/lib/duckdbWasm.ts'), 'utf-8');

  it('нет прежней регулярки COPY по всему тексту', () => {
    expect(src).not.toContain('/COPY\\b[\\s\\S]*?\\bTO\\b');
    expect(src).toContain('detectCopyTarget(sqlQuery)');
  });

  it('список файлов с dev-сервера запрашивается только при hasDevVfsServer()', () => {
    const i = src.indexOf("fetch('/api/duckdb/query'");
    expect(i).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, i - 400), i)).toContain('hasDevVfsServer()');
  });

  it('registerWasmFile не возвращает безусловное true', () => {
    const a = src.indexOf('export async function registerWasmFile');
    const b = src.indexOf('export async function disconnectDuckDbWasm');
    expect(src.slice(a, b)).not.toMatch(/return true;/);
  });
});
