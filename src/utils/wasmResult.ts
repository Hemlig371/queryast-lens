// Приведение результата DuckDB-WASM к виду, который отдаёт Tauri (п. 3.14, WS-04).
//
// В Tauri (main.rs, execute_query) значения такие: BIGINT/HUGEINT/UBIGINT — строка; DECIMAL — строка с масштабом;
// DATE — `YYYY-MM-DD`; TIMESTAMP — `YYYY-MM-DD HH:MM:SS[.дробь]`; TIMESTAMPTZ — то же с суффиксом ` UTC`;
// TIME — `HH:MM:SS[.дробь]`; INTERVAL — `{месяцы}m {дни}d {наносекунды}ns`; BLOB — `<blob N bytes>`;
// вложенные LIST/STRUCT/MAP — JSON.
// В WASM значения приходят как объекты Arrow (число миллисекунд для дат, Uint32Array для DECIMAL, Int32Array для INTERVAL …).
//
// НЕ ПРОВЕРЕНО на реальных значениях WASM-сборки: вид значений Arrow взят из описания библиотеки, а не из живого запроса.
// Для проверки есть tools/wasm-diagnostics.html.

import { uniqueColumnNames } from './resultRows';
import { takeTableRows } from './arrowRows';

export const WASM_MAX_ROWS = 500000;

export type ArrowKind = 'date' | 'timestamp' | 'time' | 'decimal' | 'interval' | 'binary' | 'nested' | 'other';

export interface ArrowTypeInfo {
  kind: ArrowKind;
  /** Единица времени / интервала из описания типа (SECOND, MILLISECOND, MICROSECOND, NANOSECOND, DAY_TIME …). */
  unit?: string;
  /** У Timestamp задан часовой пояс (TIMESTAMPTZ). */
  tz?: boolean;
  scale?: number;
}

const typeText = (type: unknown): string => {
  try {
    return type ? String((type as any).toString()) : '';
  } catch {
    return '';
  }
};

/** Класс типа Arrow по его строковому описанию (`Timestamp<MICROSECOND, UTC>`, `Decimal[18e3]`, `List<Int32>` …). */
export function describeArrowType(type: unknown): ArrowTypeInfo {
  const text = typeText(type);
  const unit = /<\s*([A-Z_]+)/.exec(text)?.[1];
  if (/^Date/i.test(text)) return { kind: 'date' };
  if (/^Timestamp/i.test(text)) return { kind: 'timestamp', unit, tz: /<\s*[A-Z_]+\s*,/.test(text) };
  if (/^Time(32|64)?\b/i.test(text)) return { kind: 'time', unit };
  if (/^Decimal/i.test(text)) {
    const own = (type as any)?.scale;
    const m = /e(-?\d+)\]/.exec(text);
    const scale = typeof own === 'number' ? own : m ? parseInt(m[1], 10) : 0;
    return { kind: 'decimal', scale };
  }
  if (/^Interval/i.test(text)) return { kind: 'interval', unit };
  if (/^(Binary|LargeBinary|FixedSizeBinary)/i.test(text)) return { kind: 'binary' };
  if (/^(List|LargeList|FixedSizeList|Struct|Map|Union|DenseUnion|SparseUnion)/i.test(text)) return { kind: 'nested' };
  return { kind: 'other' };
}

const pad = (n: number | bigint, width: number) => String(n).padStart(width, '0');

/** Дробная часть секунд в виде chrono: пусто, `.mmm`, `.uuuuuu` или `.nnnnnnnnn`. */
function fraction(nanos: bigint): string {
  if (nanos === 0n) return '';
  if (nanos % 1_000_000n === 0n) return `.${pad(nanos / 1_000_000n, 3)}`;
  if (nanos % 1000n === 0n) return `.${pad(nanos / 1000n, 6)}`;
  return `.${pad(nanos, 9)}`;
}

const UNIT_NANOS: Record<string, bigint> = {
  SECOND: 1_000_000_000n,
  MILLISECOND: 1_000_000n,
  MICROSECOND: 1000n,
  NANOSECOND: 1n,
};

/** Момент времени как { миллисекунды от эпохи, наносекунды внутри миллисекунды }; null — формат не распознан. */
function epochParts(value: unknown, unit: string | undefined): { ms: number; subMsNanos: bigint } | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : { ms, subMsNanos: 0n };
  }
  if (typeof value === 'bigint') {
    const perUnit = UNIT_NANOS[unit || 'MICROSECOND'] ?? 1000n;
    const totalNanos = value * perUnit;
    const ms = totalNanos / 1_000_000n - (totalNanos % 1_000_000n < 0n ? 1n : 0n);
    const sub = totalNanos - ms * 1_000_000n;
    return { ms: Number(ms), subMsNanos: sub };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // библиотека Arrow отдаёт миллисекунды от эпохи; дробная часть числа — доли миллисекунды
    const ms = Math.floor(value);
    return { ms, subMsNanos: BigInt(Math.round((value - ms) * 1_000_000)) };
  }
  return null;
}

function formatDate(value: unknown): unknown {
  const p = epochParts(value, 'MILLISECOND');
  if (!p) return value;
  return new Date(p.ms).toISOString().slice(0, 10);
}

function formatTimestamp(value: unknown, info: ArrowTypeInfo): unknown {
  const p = epochParts(value, info.unit);
  if (!p) return value;
  const iso = new Date(p.ms).toISOString(); // YYYY-MM-DDTHH:MM:SS.mmmZ
  const msPart = BigInt(p.ms % 1000 < 0 ? (p.ms % 1000) + 1000 : p.ms % 1000);
  const nanos = msPart * 1_000_000n + p.subMsNanos;
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}${fraction(nanos)}${info.tz ? ' UTC' : ''}`;
}

function formatTime(value: unknown, info: ArrowTypeInfo): unknown {
  let totalNanos: bigint;
  if (typeof value === 'bigint') {
    totalNanos = value * (UNIT_NANOS[info.unit || 'MICROSECOND'] ?? 1000n);
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    totalNanos = BigInt(Math.round(value)) * (UNIT_NANOS[info.unit || 'MILLISECOND'] ?? 1_000_000n);
  } else {
    return value;
  }
  const secondsTotal = totalNanos / 1_000_000_000n;
  const frac = totalNanos % 1_000_000_000n;
  const h = secondsTotal / 3600n;
  const m = (secondsTotal % 3600n) / 60n;
  const s = secondsTotal % 60n;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${fraction(frac)}`;
}

function scaled(unscaled: bigint, scale: number): string {
  const negative = unscaled < 0n;
  const digits = (negative ? -unscaled : unscaled).toString();
  if (scale <= 0) return (negative ? '-' : '') + digits;
  const padded = digits.padStart(scale + 1, '0');
  return `${negative ? '-' : ''}${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}

function formatDecimal(value: unknown, info: ArrowTypeInfo): unknown {
  const scale = info.scale ?? 0;
  if (value instanceof Uint32Array || (Array.isArray(value) && value.every((x) => typeof x === 'number'))) {
    const words = Array.from(value as ArrayLike<number>);
    let n = 0n;
    for (let i = 0; i < words.length; i++) n |= BigInt(words[i] >>> 0) << BigInt(32 * i);
    return scaled(BigInt.asIntN(32 * words.length, n), scale);
  }
  if (typeof value === 'bigint') return scaled(value, scale);
  if (typeof value === 'number' && Number.isFinite(value)) return scale > 0 ? value.toFixed(scale) : String(value);
  return value;
}

function formatInterval(value: unknown, info: ArrowTypeInfo): unknown {
  const unit = info.unit || 'MONTH_DAY_NANO';
  if (unit === 'YEAR_MONTH' && typeof value === 'number') return `${value}m 0d 0ns`;
  if (value && typeof (value as ArrayLike<number>).length === 'number' && typeof value !== 'string') {
    const v = Array.from(value as ArrayLike<number>);
    if (unit === 'DAY_TIME' && v.length >= 2) return `0m ${v[0]}d ${BigInt(v[1]) * 1_000_000n}ns`;
    if (v.length >= 4) {
      const nanos = BigInt.asIntN(64, (BigInt(v[3] >>> 0) << 32n) | BigInt(v[2] >>> 0));
      return `${v[0]}m ${v[1]}d ${nanos}ns`;
    }
  }
  return value;
}

/** Вложенное значение → простые данные JS (bigint строкой, Date ISO, Uint8Array/Vector массивом); циклы обрываются. */
function toPlain(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== 'object') return String(value);
  if (depth > 32 || seen.has(value as object)) return null;
  seen.add(value as object);
  try {
    const anyVal = value as any;
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      return Array.from(value as unknown as ArrayLike<number | bigint>).map((x) => toPlain(x, seen, depth + 1));
    }
    if (Array.isArray(value)) return value.map((x) => toPlain(x, seen, depth + 1));
    if (typeof anyVal.toJSON === 'function') return toPlain(anyVal.toJSON(), seen, depth + 1);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(anyVal)) out[key] = toPlain(anyVal[key], seen, depth + 1);
    return out;
  } finally {
    seen.delete(value as object);
  }
}

/** Одно значение Arrow → значение в виде Tauri. */
export function normalizeWasmValue(value: unknown, info: ArrowTypeInfo): unknown {
  if (value === null || value === undefined) return null;
  try {
    switch (info.kind) {
      case 'date': return formatDate(value);
      case 'timestamp': return formatTimestamp(value, info);
      case 'time': return formatTime(value, info);
      case 'decimal': return formatDecimal(value, info);
      case 'interval': return formatInterval(value, info);
      case 'binary':
        return value instanceof Uint8Array || ArrayBuffer.isView(value) ? `<blob ${(value as Uint8Array).length} bytes>` : value;
      case 'nested':
        return JSON.stringify(toPlain(value, new WeakSet(), 0));
      default:
        break;
    }
  } catch (e) {
    console.warn('WASM value normalization failed', e);
    return typeof value === 'object' ? '<unreadable value>' : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace('Z', '');
  return value;
}

export interface NormalizedWasmResult {
  rows: Record<string, any>[];
  /** Имена столбцов в порядке выдачи (уникальные); null — схемы нет. */
  columns: string[] | null;
  columnTypes: Record<string, string>;
  /** Строк в таблице больше, чем взято. */
  truncated: boolean;
}

interface ArrowTableLike {
  numRows: number;
  schema?: { fields?: { name: unknown; type: unknown }[] };
  getChildAt?: (index: number) => { get(row: number): unknown } | null;
  get?: (index: number) => any;
}

/** Таблица Arrow → строки-объекты с уникальными именами, значения приведены к виду Tauri. */
export function normalizeWasmTable(table: ArrowTableLike, maxRows: number = WASM_MAX_ROWS): NormalizedWasmResult {
  const fields = table?.schema?.fields ?? [];
  const names = uniqueColumnNames(fields.map((f) => f.name));
  const infos = fields.map((f) => describeArrowType(f.type));
  const columnTypes: Record<string, string> = {};
  fields.forEach((f, i) => {
    const text = typeText(f.type);
    if (names[i] && text) columnTypes[names[i]] = text;
  });
  const total = table?.numRows ?? 0;
  const count = Math.min(total, maxRows);
  const rows: Record<string, any>[] = [];

  const setKey = (obj: Record<string, any>, key: string, v: unknown) => {
    if (key === '__proto__') Object.defineProperty(obj, key, { value: v, enumerable: true, writable: true, configurable: true });
    else obj[key] = v;
  };

  const columnReaders = typeof table.getChildAt === 'function' && fields.length > 0
    ? fields.map((_, i) => table.getChildAt!(i))
    : null;

  if (columnReaders && columnReaders.every((c) => c)) {
    for (let r = 0; r < count; r++) {
      const obj: Record<string, any> = {};
      for (let i = 0; i < names.length; i++) {
        setKey(obj, names[i], normalizeWasmValue(columnReaders[i]!.get(r), infos[i]));
      }
      rows.push(obj);
    }
  } else if (typeof table.get === 'function') {
    // запасной путь: строки Arrow по имени (дубли имён здесь неразличимы)
    const source = takeTableRows<any>(table as { numRows: number; get(i: number): any }, maxRows);
    const infoByName = new Map<string, ArrowTypeInfo>();
    fields.forEach((f, i) => infoByName.set(String(f.name), infos[i]));
    for (const raw of source) {
      const plain: Record<string, any> = typeof raw?.toJSON === 'function' ? raw.toJSON() : raw;
      const obj: Record<string, any> = {};
      for (const key of Object.keys(plain)) {
        setKey(obj, key, normalizeWasmValue(plain[key], infoByName.get(key) ?? { kind: 'other' }));
      }
      rows.push(obj);
    }
  }

  return {
    rows,
    columns: fields.length > 0 ? names : null,
    columnTypes,
    truncated: total > count,
  };
}
