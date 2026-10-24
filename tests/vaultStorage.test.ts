import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseClickhouseUri, replaceSecretsInSql } from '../src/utils/vaultStorage';
// Здесь проверяется разбор URI ClickHouse; replaceSecretsInSql зависит от закрытого состояния хранилища и не покрыт.

describe('vaultStorage utils', () => {
  describe('parseClickhouseUri', () => {
    it('should parse basic http URI', () => {
      const uri = 'http://localhost:8123';
      const result = parseClickhouseUri(uri);
      expect(result).not.toBeNull();
      expect(result?.protocol).toBe('http');
      expect(result?.host).toBe('localhost:8123');
      expect(result?.user).toBe('default');
      expect(result?.key).toBe('');
      expect(result?.database).toBe('default');
    });

    it('should parse https URI with credentials and database', () => {
      const uri = 'https://admin:qwerty@ch.example.com:8443/analytics';
      const result = parseClickhouseUri(uri);
      expect(result).not.toBeNull();
      expect(result?.protocol).toBe('https');
      expect(result?.host).toBe('ch.example.com:8443');
      expect(result?.user).toBe('admin');
      expect(result?.key).toBe('qwerty');
      expect(result?.database).toBe('analytics');
    });

    it('should handle special double-escaped characters in password (@@ and ::)', () => {
      const uri = 'https://user:p@@ss::w@@rd@db.host.com/main';
      const result = parseClickhouseUri(uri);
      expect(result?.user).toBe('user');
      expect(result?.key).toBe('p@ss:w@rd');
      expect(result?.host).toBe('db.host.com');
      expect(result?.database).toBe('main');
    });

    it('should handle username only (no password)', () => {
      const uri = 'http://justuser@localhost/db';
      const result = parseClickhouseUri(uri);
      expect(result?.user).toBe('justuser');
      expect(result?.key).toBe('');
    });

    it('should handle URI without protocol (fallback to http)', () => {
      const uri = 'db.host.com/mydb';
      const result = parseClickhouseUri(uri);
      expect(result?.protocol).toBe('http');
      expect(result?.host).toBe('db.host.com');
      expect(result?.database).toBe('mydb');
    });

    it('should return null for empty or invalid input', () => {
      expect(parseClickhouseUri('')).toBeNull();
      expect(parseClickhouseUri('   ')).toBeNull();
      expect(parseClickhouseUri(null as any)).toBeNull();
    });
  });
});
