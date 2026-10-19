import { describe, it, expect } from 'vitest';
import { 
  parseClickhouseCopy, 
  getClickhouseUrl, 
  getClickhouseHeaders,
  parseClickhouseResponse,
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

  // п. 2.20 (CK-02): хвост после пути файла
  describe('parseClickhouseCopy: хвостовой ; и комментарий', () => {
    it("COPY … TO 'x.csv'; -- готово распознаётся", () => {
      const r = parseClickhouseCopy("COPY (SELECT 1) TO 'x.csv'; -- готово");
      expect(r?.type).toBe('COPY_TO');
      expect(r?.innerSql).toBe('SELECT 1');
      expect(r?.filePath).toBe('x.csv');
    });
    it('блочный комментарий и несколько ; после пути', () => {
      expect(parseClickhouseCopy("COPY t FROM 'in.csv' /* ok */;;\n")?.type).toBe('COPY_FROM');
    });
    it('комментарий перед запросом и после него', () => {
      const r = parseClickhouseCopy("-- выгрузка\nCOPY (SELECT 1) TO 'x.parquet' -- конец");
      expect(r?.filePath).toBe('x.parquet');
    });
    it('-- внутри пути не принимается за комментарий', () => {
      expect(parseClickhouseCopy("COPY (SELECT 1) TO 'a--b.csv'")?.filePath).toBe('a--b.csv');
    });
    it('обычный SELECT с хвостовым комментарием по-прежнему не COPY', () => {
      expect(parseClickhouseCopy('SELECT 1; -- готово')).toBeNull();
    });
  });

  // п. 2.20 (CK-04): в URL остаётся единственный механизм default_format только как защита пустой строки параметров
  describe('getClickhouseUrl: default_format', () => {
    it('без БД и параметров ставится default_format=JSON (защита от маршрутизации на сайт)', () => {
      expect(getClickhouseUrl({ ...dummyConfig, database: '' })).toBe('https://example.com:8443/?default_format=JSON');
    });
    it('с БД default_format не добавляется (формат задаёт FORMAT в тексте запроса)', () => {
      expect(getClickhouseUrl(dummyConfig)).toBe('https://example.com:8443/?database=default');
    });
  });

  // п. 2.20 (CK-03): не-JSON ответ на запрос с FORMAT JSON — ошибка
  describe('parseClickhouseResponse', () => {
    it('JSON с data и meta разбирается', () => {
      const r = parseClickhouseResponse('{"meta":[{"name":"a","type":"UInt8"}],"data":[{"a":1}]}', 'SELECT 1\nFORMAT JSON');
      expect(r.data).toEqual([{ a: 1 }]);
      expect(r.meta).toEqual([{ name: 'a', type: 'UInt8' }]);
    });
    it('HTML вместо JSON на запрос FORMAT JSON — ошибка с началом ответа', () => {
      expect(() => parseClickhouseResponse('<html><body>Play</body></html>', 'SELECT 1\nFORMAT JSON')).toThrow('<html>');
    });
    it('TSV вместо JSON на запрос FORMAT JSON — ошибка', () => {
      expect(() => parseClickhouseResponse('1\t2\n', '-- c\nSELECT 1, 2 FORMAT JSON')).toThrow();
    });
    it('пустой ответ INSERT/DDL — успех с text', () => {
      expect(parseClickhouseResponse('', 'INSERT INTO t VALUES (1)')).toEqual({ success: true, text: '' });
      expect(parseClickhouseResponse('Ok.\n', 'CREATE TABLE t (a Int8) ENGINE=Memory')).toEqual({ success: true, text: 'Ok.' });
    });
    it('свой формат пользователя (CSV) — текст, не ошибка', () => {
      expect(parseClickhouseResponse('1,2\n', 'SELECT 1, 2 FORMAT CSV')).toEqual({ success: true, text: '1,2' });
    });
    it('усечение до maxRows', () => {
      const body = JSON.stringify({ data: [1, 2, 3, 4] });
      expect(parseClickhouseResponse(body, 'SELECT 1 FORMAT JSON', 2).data).toEqual([1, 2]);
      expect(parseClickhouseResponse(body, 'SELECT 1 FORMAT JSON', Infinity).data).toEqual([1, 2, 3, 4]);
    });
  });
});
