import { describe, it, expect } from 'vitest';
import { 
  parseClickhouseCopy, 
  getClickhouseUrl, 
  getClickhouseHeaders,
  ClickhouseConfig
} from '../src/lib/clickhouse';

describe('clickhouse utils', () => {
  const dummyConfig: ClickhouseConfig = {
    protocol: 'https',
    host: 'example.com:8443',
    user: 'default',
    key: 'password123',
    database: 'default'
  };

  describe('parseClickhouseCopy', () => {
    it('should parse COPY TO with parentheses', () => {
      const sql = "COPY (SELECT * FROM users) TO 'out.csv'";
      const result = parseClickhouseCopy(sql);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('COPY_TO');
      expect(result?.innerSql).toBe('SELECT * FROM users');
      expect(result?.filePath).toBe('out.csv');
    });

    it('should parse COPY FROM without parentheses', () => {
      const sql = "COPY users FROM 'data.csv';";
      const result = parseClickhouseCopy(sql);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('COPY_FROM');
      expect(result?.innerSql).toBe('users');
      expect(result?.filePath).toBe('data.csv');
    });

    it('should return null for normal SELECT queries', () => {
      const sql = "SELECT * FROM users";
      const result = parseClickhouseCopy(sql);
      expect(result).toBeNull();
    });
  });

  describe('getClickhouseUrl', () => {
    it('should format URL with protocol and host', () => {
      const url = getClickhouseUrl(dummyConfig);
      expect(url).toContain('https://example.com:8443');
    });

    it('should strip http:// from host if mistakenly provided', () => {
      const configWithHttp = { ...dummyConfig, protocol: 'http' as const, host: 'http://localhost:8123' };
      const url = getClickhouseUrl(configWithHttp);
      expect(url).toBe('http://localhost:8123/?database=default');
    });

    it('should append database and default_format to query string', () => {
      const url = getClickhouseUrl({ ...dummyConfig, database: 'analytics' });
      expect(url).toContain('database=analytics');
    });

    it('should append custom query params', () => {
      const url = getClickhouseUrl(dummyConfig, { query: 'SELECT 1' });
      expect(url).toContain('query=SELECT+1');
      expect(url).toContain('database=default');
    });
  });

  describe('getClickhouseHeaders', () => {
    it('should include user and key if provided', () => {
      const headers = getClickhouseHeaders(dummyConfig);
      expect(headers['X-ClickHouse-User']).toBe('default');
      expect(headers['X-ClickHouse-Key']).toBe('password123');
      expect(headers['Content-Type']).toBe('text/plain;charset=utf-8');
    });

    it('should not include user and key if empty', () => {
      const emptyConfig: ClickhouseConfig = { protocol: 'http', host: 'localhost', user: '', key: '', database: '' };
      const headers = getClickhouseHeaders(emptyConfig);
      expect(headers['X-ClickHouse-User']).toBeUndefined();
      expect(headers['X-ClickHouse-Key']).toBeUndefined();
    });

    it('should allow overriding Content-Type', () => {
      const headers = getClickhouseHeaders(dummyConfig, 'application/json');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });
});
