import { describe, it, expect } from 'vitest';
import { formatColumnType, splitBySemicolonIgnoringQuotes } from '../src/lib/sqlUtils';

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
      const result = splitBySemicolonIgnoringQuotes(sql);
      expect(result).toEqual(['SELECT * FROM users', 'SELECT * FROM posts']);
    });

    it('should ignore semicolons inside single quotes', () => {
      const sql = "SELECT 'hello;world'; SELECT 1;";
      const result = splitBySemicolonIgnoringQuotes(sql);
      expect(result).toEqual(["SELECT 'hello;world'", "SELECT 1"]);
    });

    it('should handle empty queries gracefully', () => {
      const sql = "; ;";
      const result = splitBySemicolonIgnoringQuotes(sql);
      expect(result).toEqual([]);
    });
  });
});
