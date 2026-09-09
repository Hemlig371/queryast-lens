import 'fake-indexeddb/auto';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}
(globalThis as any).indexedDB = indexedDB;
(globalThis as any).IDBKeyRange = IDBKeyRange;
(globalThis.window as any).indexedDB = indexedDB;
(globalThis.window as any).IDBKeyRange = IDBKeyRange;

class LocalStorageMock {
  store: Record<string, string> = {};
  clear() { this.store = {}; }
  getItem(key: string) { return this.store[key] || null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
}
(globalThis as any).localStorage = new LocalStorageMock();
(globalThis.window as any).localStorage = (globalThis as any).localStorage;
