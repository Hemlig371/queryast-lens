// Чистая логика дерева файлов в панели «Схема и файлы». Без обращений к DOM, Tauri и DuckDB.

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  /** Размер в байтах (для папок не задаётся). */
  size?: number;
  /** Время изменения, мс с начала эпохи. */
  modified?: number;
  /** Время создания, мс с начала эпохи. */
  created?: number;
}

/** Поставщик списка файлов. Tauri — реальная ФС, остальные — виртуальная ФС DuckDB-WASM. */
export interface FileTreeProvider {
  kind: 'tauri' | 'vfs';
  /** Содержимое папки. Ошибки не бросает: недоступная папка даёт пустой список. */
  list(path: string): Promise<FileEntry[]>;
}

export type FilesSectionMode = 'split' | 'collapsed' | 'max';

/** Расширения, которые двойной клик открывает вкладкой редактора. */
export const TEXT_EXTENSIONS = ['sql', 'md', 'txt', 'py', 'sh', 'yml', 'yaml', 'toml', 'ini', 'log'];

/** Расширения, которые двойной клик передаёт внешней программе (тот же список зашит в Rust-команде open_path). */
export const EXTERNAL_EXTENSIONS = [
  'xlsx', 'xls', 'xlsb', 'xlsm', 'xltx', 'xltm',
  'docx', 'doc', 'docm', 'dotx', 'rtf', 'odt', 'ods',
  'pptx', 'ppt', 'pptm', 'odp',
  'pdf',
];

export const FILE_TREE_REFRESH_MIN_MS = 10_000;

export function getExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export type DoubleClickAction = 'tab' | 'external' | 'none';

export function getDoubleClickAction(entry: Pick<FileEntry, 'name' | 'isDir'>): DoubleClickAction {
  if (entry.isDir) return 'none';
  const ext = getExtension(entry.name);
  if (TEXT_EXTENSIONS.includes(ext)) return 'tab';
  if (EXTERNAL_EXTENSIONS.includes(ext)) return 'external';
  return 'none';
}

/** Папки первыми, затем по имени (без учёта регистра, числа «естественно»). Исходный массив не меняется. */
export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
}

/** Путь для вставки в запрос: одинарные кавычки, `\` → `/`, `'` удваивается. */
export function quotePathForSql(path: string): string {
  return `'${path.replace(/\\/g, '/').replace(/'/g, "''")}'`;
}

/** Папка, в которой лежит файл (поддерживает `/` и `\`). Для пути без разделителя — пустая строка. */
export function dirnameOf(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  if (i < 0) return '';
  if (i === 0) return '/';
  // Сохраняем исходный вид разделителей: режем по позиции в исходной строке.
  return path.slice(0, i) || '/';
}

/** Корень дерева: путь из настроек → папка открытой БД → домашняя папка. */
export function pickFileTreeRoot(opts: { configured?: string | null; dbPath?: string | null; home?: string | null }): string {
  const configured = opts.configured?.trim();
  if (configured) return configured;
  const db = opts.dbPath?.trim();
  if (db && db !== ':memory:') {
    const dir = dirnameOf(db);
    if (dir) return dir;
  }
  return opts.home?.trim() || '';
}

/** Можно ли перечитать дерево при возврате в окно: прошло не меньше minMs с прошлого чтения. */
export function shouldRefreshOnFocus(now: number, last: number, minMs: number = FILE_TREE_REFRESH_MIN_MS): boolean {
  return now - last >= minMs;
}

/** Склейка пути родителя и имени с учётом стиля разделителя родителя. */
export function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  return parent.endsWith('/') || parent.endsWith('\\') ? parent + name : parent + sep + name;
}

/** Подсказка при наведении: имя, дата изменения/создания, размер. */
export function buildEntryTooltip(entry: FileEntry, fmtBytes: (n: number) => string | null, fmtDate: (ms: number) => string, labels: { modified: string; created: string; size: string }): string {
  const lines = [entry.path || entry.name];
  if (entry.modified) lines.push(`${labels.modified}: ${fmtDate(entry.modified)}`);
  if (entry.created) lines.push(`${labels.created}: ${fmtDate(entry.created)}`);
  if (!entry.isDir && entry.size !== undefined) {
    const s = fmtBytes(entry.size);
    if (s) lines.push(`${labels.size}: ${s}`);
  }
  return lines.join('\n');
}

/** Плоский список виртуальной ФС DuckDB-WASM → записи дерева (без папок). */
export function vfsToEntries(files: Array<{ name: string; size?: number; loadedAt?: Date | number }>): FileEntry[] {
  return files.map(f => ({
    name: f.name,
    path: f.name,
    isDir: false,
    size: f.size,
    modified: f.loadedAt instanceof Date ? f.loadedAt.getTime() : f.loadedAt,
  }));
}

/** Какие раскрытые папки перечитывать при обновлении: только раскрытые, корень всегда. */
export function foldersToReload(root: string, expanded: Record<string, boolean>): string[] {
  return [root, ...Object.keys(expanded).filter(p => expanded[p] && p !== root)];
}
