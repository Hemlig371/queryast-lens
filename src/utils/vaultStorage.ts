/**
 * Isolated Secure Vault Storage (Web Crypto API + IndexedDB)
 * 
 * Features:
 * - PBKDF2 (100,000 iterations, SHA-256) + AES-GCM (256-bit)
 * - Isolated IndexedDB database: 'app_secure_vault_db' (never touched by settings export/import)
 * - 8-hour unlock lifetime in memory
 * - ClickHouse URI parser with support for double-escaped separators (@@ -> @, :: -> :)
 * - Zero-overhead SQL secret replacer (exits immediately if no '{{' found)
 */

export interface VaultSecret {
  name: string;
  value: string;
}

interface VaultStorageRecord {
  id: string;
  salt: string; // base64
  iv: string;   // base64
  ciphertext: string; // base64
  isSet: boolean;
}

const DB_NAME = 'app_secure_vault_db';
const STORE_NAME = 'vault_meta';
const DB_VERSION = 1;
const RECORD_ID = 'root_vault';
const UNLOCK_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

// In-memory state for unlocked vault
interface MemoryVaultState {
  secrets: VaultSecret[];
  pin: string;
  expiresAt: number;
}

let memoryVault: MemoryVaultState | null = null;

// IndexedDB Helper
function getVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (err: any) => reject(err.target?.error || err);
  });
}

async function getVaultRecord(): Promise<VaultStorageRecord | null> {
  try {
    const db = await getVaultDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(RECORD_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('getVaultRecord error:', e);
    return null;
  }
}

async function saveVaultRecord(record: VaultStorageRecord): Promise<void> {
  const db = await getVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Crypto Helpers
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(pin: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(data: VaultSecret[], pin: string): Promise<{ salt: string; iv: string; ciphertext: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  
  const enc = new TextEncoder();
  const encoded = enc.encode(JSON.stringify(data));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(encrypted),
  };
}

async function decryptData(record: VaultStorageRecord, pin: string): Promise<VaultSecret[]> {
  const salt = base64ToBuffer(record.salt);
  const iv = base64ToBuffer(record.iv);
  const ciphertext = base64ToBuffer(record.ciphertext);
  const key = await deriveKey(pin, salt);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  const jsonStr = dec.decode(decrypted);
  const parsed = JSON.parse(jsonStr);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  return [];
}

/**
 * Check if a vault PIN has already been configured
 */
export async function isVaultConfigured(): Promise<boolean> {
  const record = await getVaultRecord();
  return Boolean(record && record.isSet);
}

/**
 * Check if the vault is currently unlocked and within the 4-hour window
 */
export function isVaultUnlocked(): boolean {
  if (!memoryVault) return false;
  if (Date.now() > memoryVault.expiresAt) {
    memoryVault = null;
    return false;
  }
  return true;
}

/**
 * Get remaining unlock time (or null if locked)
 */
export function getVaultExpiresAt(): number | null {
  if (!isVaultUnlocked()) return null;
  return memoryVault?.expiresAt || null;
}

/**
 * Set up initial PIN code (digits only, min 4)
 */
export async function setupVaultPin(pin: string): Promise<void> {
  const cleanPin = pin.trim();
  if (!/^\d{4,}$/.test(cleanPin)) {
    throw new Error('ПИН-код должен состоять минимум из 4 цифр');
  }

  const initialSecrets: VaultSecret[] = [];
  const encrypted = await encryptData(initialSecrets, cleanPin);

  const record: VaultStorageRecord = {
    id: RECORD_ID,
    salt: encrypted.salt,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    isSet: true,
  };

  await saveVaultRecord(record);

  memoryVault = {
    secrets: initialSecrets,
    pin: cleanPin,
    expiresAt: Date.now() + UNLOCK_DURATION_MS,
  };

  window.dispatchEvent(new CustomEvent('sql_vault_status_changed'));
}

/**
 * Unlock the vault with a PIN code
 */
export async function unlockVault(pin: string): Promise<boolean> {
  const cleanPin = pin.trim();
  const record = await getVaultRecord();
  if (!record || !record.isSet) {
    throw new Error('Хранилище еще не настроено');
  }

  try {
    const secrets = await decryptData(record, cleanPin);
    memoryVault = {
      secrets,
      pin: cleanPin,
      expiresAt: Date.now() + UNLOCK_DURATION_MS,
    };
    window.dispatchEvent(new CustomEvent('sql_vault_status_changed'));
    return true;
  } catch (err) {
    console.warn('Failed to unlock vault with provided PIN:', err);
    return false;
  }
}

/**
 * Manually lock the vault
 */
export function lockVault(): void {
  memoryVault = null;
  window.dispatchEvent(new CustomEvent('sql_vault_status_changed'));
}

/**
 * Completely reset vault (wipe all data and PIN)
 */
export async function resetVault(): Promise<void> {
  try {
    const db = await getVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(RECORD_ID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('resetVault error:', e);
  } finally {
    memoryVault = null;
    window.dispatchEvent(new CustomEvent('sql_vault_status_changed'));
  }
}

/**
 * Get current secrets list (null if locked)
 */
export function getVaultSecrets(): VaultSecret[] | null {
  if (!isVaultUnlocked()) return null;
  return memoryVault?.secrets || null;
}

/**
 * Get ClickHouse specific secrets (starting with 'ch_')
 */
export function getClickhouseVaultSecrets(): VaultSecret[] {
  const secrets = getVaultSecrets();
  if (!secrets) return [];
  return secrets.filter(s => s.name.startsWith('ch_'));
}

/**
 * Add or update a secret
 */
export async function addOrUpdateVaultSecret(name: string, value: string): Promise<void> {
  if (!isVaultUnlocked() || !memoryVault) {
    throw new Error('Хранилище заблокировано. Введите ПИН-код.');
  }

  const cleanName = name.trim();
  const cleanValue = value.trim();

  if (!cleanName) {
    throw new Error('Имя ключа не может быть пустым');
  }

  const existingIndex = memoryVault.secrets.findIndex(s => s.name === cleanName);
  let updatedSecrets: VaultSecret[];

  if (existingIndex >= 0) {
    updatedSecrets = memoryVault.secrets.map((s, idx) =>
      idx === existingIndex ? { name: cleanName, value: cleanValue } : s
    );
  } else {
    updatedSecrets = [...memoryVault.secrets, { name: cleanName, value: cleanValue }];
  }

  const encrypted = await encryptData(updatedSecrets, memoryVault.pin);
  await saveVaultRecord({
    id: RECORD_ID,
    salt: encrypted.salt,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    isSet: true,
  });

  memoryVault.secrets = updatedSecrets;
  window.dispatchEvent(new CustomEvent('sql_vault_secrets_updated'));
}

/**
 * Delete a single secret
 */
export async function deleteVaultSecret(name: string): Promise<void> {
  if (!isVaultUnlocked() || !memoryVault) {
    throw new Error('Хранилище заблокировано');
  }

  const updatedSecrets = memoryVault.secrets.filter(s => s.name !== name);
  const encrypted = await encryptData(updatedSecrets, memoryVault.pin);
  await saveVaultRecord({
    id: RECORD_ID,
    salt: encrypted.salt,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    isSet: true,
  });

  memoryVault.secrets = updatedSecrets;
  window.dispatchEvent(new CustomEvent('sql_vault_secrets_updated'));
}

/**
 * Change PIN code
 */
export async function changeVaultPin(oldPin: string, newPin: string): Promise<void> {
  const cleanOld = oldPin.trim();
  const cleanNew = newPin.trim();

  if (!/^\d{4,}$/.test(cleanNew)) {
    throw new Error('Новый ПИН-код должен состоять минимум из 4 цифр');
  }

  const record = await getVaultRecord();
  if (!record || !record.isSet) {
    throw new Error('Хранилище еще не настроено');
  }

  const secrets = await decryptData(record, cleanOld);
  const encrypted = await encryptData(secrets, cleanNew);

  await saveVaultRecord({
    id: RECORD_ID,
    salt: encrypted.salt,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    isSet: true,
  });

  memoryVault = {
    secrets,
    pin: cleanNew,
    expiresAt: Date.now() + UNLOCK_DURATION_MS,
  };

  window.dispatchEvent(new CustomEvent('sql_vault_status_changed'));
}

/**
 * Zero-overhead secret replacer for SQL queries.
 * Exits immediately if query does not contain '{{'.
 * 
 * Throws a descriptive error if vault is locked or key is not found.
 */
export function replaceSecretsInSql(sql: string): string {
  // CRITICAL: Instant exit if no template macro present
  if (!sql.includes('{{')) {
    return sql;
  }

  // Check if vault is unlocked
  if (!isVaultUnlocked() || !memoryVault) {
    throw new Error('Хранилище ключей заблокировано. Введите ПИН-код в настройках (вкладка «Элементы UI»).');
  }

  const secretMap = new Map<string, string>();
  for (const s of memoryVault.secrets) {
    secretMap.set(s.name, s.value);
  }

  // Replace {{key_name}}
  return sql.replace(/\{\{([a-zA-Z0-9_\-]+)\}\}/g, (match, keyName) => {
    if (!secretMap.has(keyName)) {
      throw new Error(`Ключ {{${keyName}}} не найден в хранилище ключей.`);
    }
    return secretMap.get(keyName)!;
  });
}

export interface ParsedClickhouseUri {
  protocol: 'http' | 'https';
  host: string;
  user: string;
  key: string;
  database: string;
}

/**
 * Parse ClickHouse URI format into config fields.
 * Supports double-escaped characters in passwords (@@ -> @, :: -> :)
 * Examples:
 *   http://user:password@host:port/database
 *   https://default:my@@pass::word@ch.example.com:8443/analytics
 *   http://localhost:8123
 */
export function parseClickhouseUri(rawUri: string): ParsedClickhouseUri | null {
  if (!rawUri || typeof rawUri !== 'string') return null;
  const trimmed = rawUri.trim();
  if (!trimmed) return null;

  let protocol: 'http' | 'https' = 'http';
  let rest = trimmed;

  if (rest.startsWith('https://')) {
    protocol = 'https';
    rest = rest.slice('https://'.length);
  } else if (rest.startsWith('http://')) {
    protocol = 'http';
    rest = rest.slice('http://'.length);
  }

  // Replace double separators with safe temporary tokens
  const DOUBLE_AT_TOKEN = '__DBL_AT_TK__';
  const DOUBLE_COLON_TOKEN = '__DBL_CLN_TK__';

  const masked = rest
    .replace(/@@/g, DOUBLE_AT_TOKEN)
    .replace(/::/g, DOUBLE_COLON_TOKEN);

  let user = 'default';
  let password = '';
  let hostPart = masked;
  let database = 'default';

  // Check if credentials are present (contains @)
  const atIndex = masked.lastIndexOf('@');
  if (atIndex !== -1) {
    const credPart = masked.slice(0, atIndex);
    hostPart = masked.slice(atIndex + 1);

    const colonIndex = credPart.indexOf(':');
    if (colonIndex !== -1) {
      user = credPart.slice(0, colonIndex);
      password = credPart.slice(colonIndex + 1);
    } else {
      user = credPart;
    }
  }

  // Check if database path is present (contains /)
  const slashIndex = hostPart.indexOf('/');
  if (slashIndex !== -1) {
    const dbPart = hostPart.slice(slashIndex + 1).trim();
    hostPart = hostPart.slice(0, slashIndex);
    if (dbPart) {
      database = dbPart;
    }
  }

  // Unescape tokens back to single @ and :
  user = user
    .replace(new RegExp(DOUBLE_AT_TOKEN, 'g'), '@')
    .replace(new RegExp(DOUBLE_COLON_TOKEN, 'g'), ':');
    
  password = password
    .replace(new RegExp(DOUBLE_AT_TOKEN, 'g'), '@')
    .replace(new RegExp(DOUBLE_COLON_TOKEN, 'g'), ':');

  const host = hostPart.trim() || '127.0.0.1:8123';

  return {
    protocol,
    host,
    user: user || 'default',
    key: password,
    database: database || 'default',
  };
}
