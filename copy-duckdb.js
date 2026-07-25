import fs from 'fs';
import path from 'path';

const targetDir = path.resolve('public/duckdb');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const files = [
  'duckdb-mvp.wasm',
  'duckdb-browser-mvp.worker.js',
  'duckdb-eh.wasm',
  'duckdb-browser-eh.worker.js',
];

const srcDir = path.resolve('node_modules/@duckdb/duckdb-wasm/dist');

for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(targetDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to public/duckdb/`);
  } else {
    console.warn(`Warning: Source file ${src} does not exist.`);
  }
}
