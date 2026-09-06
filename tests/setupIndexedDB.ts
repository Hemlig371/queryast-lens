import 'fake-indexeddb/auto';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}
(globalThis as any).indexedDB = indexedDB;
(globalThis as any).IDBKeyRange = IDBKeyRange;
(globalThis.window as any).indexedDB = indexedDB;
(globalThis.window as any).IDBKeyRange = IDBKeyRange;
