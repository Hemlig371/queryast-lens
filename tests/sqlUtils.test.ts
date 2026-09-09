import { describe, it, expect } from 'vitest';
import { formatColumnType, splitBySemicolonIgnoringQuotes, replaceVariablesInSql } from '../src/lib/sqlUtils';

describe('sqlUtils', () => {
  describe('formatColumnType', () => {
    it('should format Enum types correctly', () => {
      expect(formatColumnType("Enum8('a' = 1, 'b' = 2)")).toBe('Enum8(...)');
      expect(formatColumnType("Enum16('yes' = 1, 'no' = 0)")).toBe('Enum16(...)');
    });

    it('should return the type as-is for other types', () => {
      expect(formatColumnType('Int32')).toBe('Int32');
      expect(formatColumnType('Float64')).toBe('Float64');
      expect(formatColumnType('String')).toBe('String');
    });
  });

  describe('splitBySemicolonIgnoringQuotes', () => {
    it('should split simple queries', () => {
      const sql = 'SELECT * FROM users; SELECT * FROM posts;';
      const result = splitBySemicolonIgnoringQuotes(sql).map(s => s.trim()).filter(Boolean);
      expect(result).toEqual(['SELECT * FROM users', 'SELECT * FROM posts']);
    });

    it('should ignore semicolons inside single quotes', () => {
      const sql = "SELECT 'hello;world'; SELECT 1;";
      const result = splitBySemicolonIgnoringQuotes(sql).map(s => s.trim()).filter(Boolean);
      expect(result).toEqual(["SELECT 'hello;world'", "SELECT 1"]);
    });

    it('should handle empty queries gracefully', () => {
      const sql = "; ;";
      const result = splitBySemicolonIgnoringQuotes(sql).map(s => s.trim()).filter(Boolean);
      expect(result).toEqual([]);
    });
  });

  describe('replaceVariablesInSql', () => {
    it('should return original sql if no {{$ is present', () => {
      const sql = 'SELECT * FROM users WHERE id = 1';
      expect(replaceVariablesInSql(sql)).toBe(sql);
    });

    it('should replace variables defined in SQL comments', () => {
      const sql = `-- {{$status=active}}
-- {{$limit = 10}}
SELECT * FROM users WHERE status = '{{$status}}' LIMIT {{$limit}};`;
      const expected = `-- active
-- 10
SELECT * FROM users WHERE status = 'active' LIMIT 10;`;
      expect(replaceVariablesInSql(sql)).toBe(expected);
    });

    it('should support block comments /* ... */', () => {
      const sql = `/* {{$table=sales}} {{$year=2024}} */
SELECT * FROM {{$table}} WHERE year = {{$year}};`;
      const expected = `/* sales 2024 */
SELECT * FROM sales WHERE year = 2024;`;
      expect(replaceVariablesInSql(sql)).toBe(expected);
    });

    it('should resolve variables defined in contextSql when executing a selected snippet', () => {
      const fullTabSql = `-- {{$tenant=acme}}
-- {{$threshold=99.5}}
SELECT * FROM logs WHERE tenant = '{{$tenant}}' AND score > {{$threshold}};`;

      // User highlighted only the SELECT query
      const selectedQuery = `SELECT * FROM logs WHERE tenant = '{{$tenant}}' AND score > {{$threshold}};`;
      const result = replaceVariablesInSql(selectedQuery, fullTabSql);
      expect(result).toBe(`SELECT * FROM logs WHERE tenant = 'acme' AND score > 99.5;`);
    });

    it('should replace inline definitions {{$var=value}} seamlessly', () => {
      const sql = `SELECT * FROM items WHERE status = '{{$status=pending}}' AND count > {{$count=5}};`;
      expect(replaceVariablesInSql(sql)).toBe(`SELECT * FROM items WHERE status = 'pending' AND count > 5;`);
    });

    it('should not interfere with vault secrets {{secret_name}}', () => {
      const sql = `-- {{$env=prod}}
SELECT * FROM {{$env}}_db WHERE token = '{{clickhouse_secret}}' AND key = '{{vault-key-1}}';`;
      const result = replaceVariablesInSql(sql);
      expect(result).toBe(`-- prod
SELECT * FROM prod_db WHERE token = '{{clickhouse_secret}}' AND key = '{{vault-key-1}}';`);
    });

    it('should replace repeated occurrences of the same variable', () => {
      const sql = `-- {{$id=42}}
SELECT * FROM a WHERE id = {{$id}} UNION ALL SELECT * FROM b WHERE id = {{$id}};`;
      const expected = `-- 42
SELECT * FROM a WHERE id = 42 UNION ALL SELECT * FROM b WHERE id = 42;`;
      expect(replaceVariablesInSql(sql)).toBe(expected);
    });
  });
});

