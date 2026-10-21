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

/** Действия над файлами из контекстного меню (только реальная ФС в Tauri). */
export interface FileTreeOps {
  platform: Platform;
  /** Показать в проводнике / Finder (на Linux — открыть папку). */
  reveal(path: string): Promise<void>;
  /** Системный выбор программы («Открыть с помощью…»). Только Windows и macOS. */
  openWith(path: string): Promise<void>;
  /** Переименовать в пределах той же папки; возвращает новый путь. Ошибка — Error с кодом: empty | invalid | exists | not_found | failed. */
  rename(path: string, newName: string): Promise<string>;
  /** Переместить в корзину. */
  trash(path: string): Promise<void>;
  /** Переместить в другую папку (только внутри одного диска); возвращает новый путь. Ошибка — Error с кодом: not_found | invalid | exists | failed. */
  move(path: string, targetDir: string): Promise<string>;
}

/** Поставщик списка файлов. Tauri — реальная ФС, остальные — виртуальная ФС DuckDB-WASM. */
export interface FileTreeProvider {
  kind: 'tauri' | 'vfs';
  /** Содержимое папки. Ошибки не бросает: недоступная папка даёт пустой список. */
  list(path: string): Promise<FileEntry[]>;
  /** Есть только у реальной ФС. */
  ops?: FileTreeOps;
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

export type FileSortKey = 'name' | 'date' | 'size';
export type FileSortDir = 'asc' | 'desc';
export interface FileSort { key: FileSortKey; dir: FileSortDir }

export const DEFAULT_FILE_SORT: FileSort = { key: 'name', dir: 'asc' };

/** Первое направление при выборе ключа: имя А→Я, дата — новые сверху, размер — крупные сверху. */
export function defaultSortDir(key: FileSortKey): FileSortDir {
  return key === 'name' ? 'asc' : 'desc';
}

/** Клик по кнопке сортировки: тот же ключ — разворот направления, другой — его направление по умолчанию. */
export function nextSort(current: FileSort, key: FileSortKey): FileSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: defaultSortDir(key) };
}

/** Значение из сохранённой сессии → корректная сортировка (иначе по умолчанию). */
export function normalizeFileSort(v: unknown): FileSort {
  const o = v as Partial<FileSort> | null | undefined;
  const key = o?.key;
  const dir = o?.dir;
  if ((key === 'name' || key === 'date' || key === 'size') && (dir === 'asc' || dir === 'desc')) return { key, dir };
  return DEFAULT_FILE_SORT;
}

const byName = (a: FileEntry, b: FileEntry) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/**
 * Папки всегда первыми, внутри — выбранный порядок. Имя: без учёта регистра, числа «естественно».
 * Дата и размер: записи без значения считаются нулём; при равенстве — по имени А→Я.
 * У папок размера нет, поэтому при сортировке по размеру они идут по имени А→Я.
 * Исходный массив не меняется.
 */
export function sortEntries(entries: FileEntry[], sort: FileSort = DEFAULT_FILE_SORT): FileEntry[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (sort.key === 'name') return sign * byName(a, b);
    if (sort.key === 'size') {
      if (a.isDir) return byName(a, b);
      const d = (a.size ?? 0) - (b.size ?? 0);
      return d !== 0 ? sign * d : byName(a, b);
    }
    const d = (a.modified ?? 0) - (b.modified ?? 0);
    return d !== 0 ? sign * d : byName(a, b);
  });
}

/** Совпадение имени с поиском: подстрока без учёта регистра; пустой запрос подходит всем. */
export function nameMatches(name: string, term: string): boolean {
  const q = term.trim().toLowerCase();
  return !q || name.toLowerCase().includes(q);
}

/**
 * Есть ли среди уже загруженных потомков папки запись, подходящая под поиск.
 * Ничего не загружает и не раскрывает: смотрит только в `children`.
 */
export function hasMatchingDescendant(children: Record<string, FileEntry[]>, path: string, term: string, seen: Set<string> = new Set()): boolean {
  if (seen.has(path)) return false; // защита от циклов (ссылки)
  seen.add(path);
  const list = children[path];
  if (!list) return false;
  return list.some(e => nameMatches(e.name, term) || (e.isDir && hasMatchingDescendant(children, e.path, term, seen)));
}

/** Записи папки, видимые при поиске: подходящие по имени и папки, внутри которых (из загруженного) есть подходящие. */
export function filterEntries(list: FileEntry[], children: Record<string, FileEntry[]>, term: string): FileEntry[] {
  if (!term.trim()) return list;
  return list.filter(e => nameMatches(e.name, term) || (e.isDir && hasMatchingDescendant(children, e.path, term)));
}

export type Platform = 'windows' | 'macos' | 'linux';

/** Платформа по строке User-Agent (в Tauri это WebView системы). */
export function detectPlatform(ua: string): Platform {
  const s = ua.toLowerCase();
  if (s.includes('windows')) return 'windows';
  if (s.includes('mac os') || s.includes('macintosh')) return 'macos';
  return 'linux';
}

/** Путь `p` совпадает с `base` или лежит внутри него (разделитель `/` или `\`). */
export function isSameOrInside(p: string, base: string): boolean {
  if (!base) return false;
  if (p === base) return true;
  if (!p.startsWith(base)) return false;
  if (base.endsWith('/') || base.endsWith('\\')) return true;
  const c = p[base.length];
  return c === '/' || c === '\\';
}

/** Тип данных перетаскивания внутри дерева (редактор его не читает: он берёт только `text/plain`). */
export const TREE_DRAG_MIME = 'application/x-queryast-path';

const trimTrailingSep = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

/**
 * Что делать при броске записи в папку: 'same' — запись уже в этой папке (ничего не делать, без сообщения),
 * 'into_self' — папку бросили в себя или в свою вложенную папку (недопустимо), 'ok' — можно пробовать переместить
 * (занятое имя и другой диск проверяет Rust).
 */
export function planMove(srcPath: string, srcParent: string, targetDir: string): 'same' | 'into_self' | 'ok' {
  if (trimTrailingSep(srcParent) === trimTrailingSep(targetDir)) return 'same';
  const src = trimTrailingSep(srcPath);
  const target = trimTrailingSep(targetDir);
  if (target === src || target.startsWith(src + '/')) return 'into_self';
  return 'ok';
}

/**
 * Есть ли в уже загруженном списке целевой папки запись с таким именем (быстрая проверка до обращения к диску;
 * окончательно решает Rust). На Windows и macOS регистр не различается.
 */
export function nameTaken(list: FileEntry[] | undefined, name: string, ignoreCase: boolean): boolean {
  if (!list) return false;
  return ignoreCase
    ? list.some(e => e.name.toLowerCase() === name.toLowerCase())
    : list.some(e => e.name === name);
}

/** Убирает из словаря ключи, относящиеся к пути или лежащие внутри него. */
export function dropPathKeys<T>(rec: Record<string, T>, base: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(rec)) if (!isSameOrInside(k, base)) out[k] = rec[k];
  return out;
}

/** Путь после переименования `oldPath` → `newPath`: для самого пути и для лежащих внутри. null — путь не затронут. */
export function remapPath(p: string, oldPath: string, newPath: string): string | null {
  if (p === oldPath) return newPath;
  if (!isSameOrInside(p, oldPath)) return null;
  return newPath + p.slice(oldPath.length);
}

/** Имя для переименования: непустое, без разделителей пути; на Windows — без запрещённых символов и без точки/пробела в конце. */
export function validateNewName(name: string, platform: Platform): 'empty' | 'invalid' | null {
  const n = name.trim();
  if (!n) return 'empty';
  if (n === '.' || n === '..' || /[\/\\\0]/.test(n)) return 'invalid';
  if (platform === 'windows' && (/[<>:"|?*\x00-\x1f]/.test(n) || n.endsWith('.'))) return 'invalid';
  return null;
}

/** Выделение при переименовании: имя без расширения (у скрытых файлов `.gitignore` и папок — всё имя). */
export function renameSelectionEnd(name: string, isDir: boolean): number {
  if (isDir) return name.length;
  const i = name.lastIndexOf('.');
  return i > 0 ? i : name.length;
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
