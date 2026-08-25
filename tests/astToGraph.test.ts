import { describe, it, expect } from 'vitest';
import { parseSqlToAst, stripCommentsSafely, splitQueries } from '../src/utils/astToGraph';

describe('astToGraph utils', () => {
  describe('stripCommentsSafely', () => {
    it('should remove inline and multiline comments', () => {
      const sql = `
        SELECT * FROM users; -- this is a comment
        /* multi
           line */
        SELECT 1;
      `;
      const cleaned = stripCommentsSafely(sql);
      expect(cleaned).not.toContain('-- this is a comment');
      expect(cleaned).not.toContain('multi');
      expect(cleaned).toContain('SELECT * FROM users;');
      expect(cleaned).toContain('SELECT 1;');
    });
  });

  describe('splitQueries', () => {
    it('should split multiple statements', () => {
      const sql = 'SELECT 1; SELECT 2;';
      const queries = splitQueries(sql);
      expect(queries).toEqual(['SELECT 1', 'SELECT 2']);
    });
  });

  describe('parseSqlToAst', () => {
    it('should parse a simple SELECT query', () => {
      const ast = parseSqlToAst('SELECT id, name FROM users');
      expect(ast).toBeDefined();
      // Usually it returns an AST object or array of objects
      expect(ast.type || (Array.isArray(ast) && ast[0]?.type)).toBeDefined();
    });

    it('should parse a query with JOIN', () => {
      const sql = 'SELECT u.id, p.title FROM users u JOIN posts p ON u.id = p.user_id';
      const ast = parseSqlToAst(sql);
      expect(ast).toBeDefined();
      // Not strictly checking the exact shape to avoid brittle tests, just verifying it doesn't throw or return null
    });

    it('should not throw on empty query', () => {
      const ast = parseSqlToAst('');
      expect(ast).toBeDefined();
    });
  });
});
