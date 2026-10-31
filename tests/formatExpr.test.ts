import { describe, it, expect } from 'vitest';
import { formatExpr, parseSqlToAst } from '../src/utils/astToGraph';

const col = (column: string) => ({ type: 'column_ref', table: null, column });
const num = (value: number) => ({ type: 'number', value });
const bin = (operator: string, left: any, right: any, parentheses = false) =>
  ({ type: 'binary_expr', operator, left, right, ...(parentheses ? { parentheses: true } : {}) });

// Найти первое WHERE-выражение / колонку SELECT в разобранном запросе
// parseSqlToAst возвращает { ast, error }; ast — объект или массив операторов
const firstStatement = (sql: string) => {
  const { ast, error } = parseSqlToAst(sql);
  if (error || !ast) throw new Error(`не разобрано: ${sql} (${error})`);
  return Array.isArray(ast) ? ast[0] : ast;
};
const whereOf = (sql: string) => firstStatement(sql).where;
const colOf = (sql: string, i = 0) => firstStatement(sql).columns[i].expr;

describe('formatExpr: узлы с полем expr (D-01)', () => {
  describe('на готовом AST (без парсера)', () => {
    it('NOT над сравнением остаётся', () => {
      const e = { type: 'unary_expr', operator: 'NOT', expr: bin('=', col('b'), num(1)) };
      expect(formatExpr(e)).toMatch(/^NOT\s*\(?b = 1\)?$/);
    });
    it('NOT (a OR b) сохраняет скобки', () => {
      const inner = bin('OR', col('a'), col('b'), true);
      const e = { type: 'unary_expr', operator: 'NOT', expr: inner };
      expect(formatExpr(e)).toMatch(/NOT\s*\(a OR b\)/);
    });
    it('NOT EXISTS (подзапрос) остаётся', () => {
      const sub = { type: 'select', columns: '*', from: [{ table: 't' }] };
      const e = { type: 'unary_expr', operator: 'NOT', expr: { ast: sub } };
      expect(formatExpr(e)).toMatch(/^NOT EXISTS|^NOT\s*\(SELECT/i);
    });
    it('поисковый CASE', () => {
      const e = { type: 'case', expr: null, args: [
        { type: 'when', cond: bin('>', col('x'), num(1)), result: num(1) },
        { type: 'else', result: num(0) } ] };
      expect(formatExpr(e)).toBe('CASE WHEN x > 1 THEN 1 ELSE 0 END');
    });
    it('простой CASE x WHEN … печатает x', () => {
      const e = { type: 'case', expr: col('x'), args: [
        { type: 'when', cond: num(1), result: num(10) } ] };
      expect(formatExpr(e)).toBe('CASE x WHEN 1 THEN 10 END');
    });
    it('обёртка без type по-прежнему разворачивается', () => {
      expect(formatExpr({ expr: col('a') })).toBe('a');
      expect(formatExpr({ ast: num(5) })).toBe('5');
    });
  });

  describe('через node-sql-parser (PostgreSQL)', () => {
    it('CASE', () => {
      expect(formatExpr(colOf("SELECT CASE WHEN x > 1 THEN 'a' ELSE 'b' END FROM t")))
        .toMatch(/CASE WHEN x > 1 THEN 'a' ELSE 'b' END/);
    });
    it('CAST', () => {
      expect(formatExpr(colOf('SELECT CAST(x AS INT) FROM t'))).toMatch(/CAST\(x AS INT/i);
    });
    it('INTERVAL', () => {
      expect(formatExpr(colOf("SELECT now() + INTERVAL '1 day' FROM t"))).toMatch(/INTERVAL/i);
    });
    it('NOT (b = 1) — не регресс', () => {
      expect(formatExpr(whereOf('SELECT * FROM t WHERE NOT (b = 1)'))).toMatch(/NOT\s*\(b = 1\)/);
    });
    it('NOT b = 1 без скобок', () => {
      expect(formatExpr(whereOf('SELECT * FROM t WHERE NOT b = 1'))).toMatch(/NOT/);
    });
    it('NOT (a OR b) сохраняет скобки', () => {
      expect(formatExpr(whereOf('SELECT * FROM t WHERE NOT (a = 1 OR b = 2)')))
        .toMatch(/NOT\s*\(a = 1 OR b = 2\)/);
    });
    it('NOT EXISTS', () => {
      expect(formatExpr(whereOf('SELECT * FROM t WHERE NOT EXISTS (SELECT 1 FROM u WHERE u.id = t.id)')))
        .toMatch(/NOT EXISTS\s*\(SELECT/i);
    });
    it('EXISTS без NOT не получает NOT', () => {
      expect(formatExpr(whereOf('SELECT * FROM t WHERE EXISTS (SELECT 1 FROM u)'))).not.toMatch(/NOT/i);
    });
  });
});

describe('formatExpr: BETWEEN (D-10)', () => {
  it('значения BETWEEN склеиваются через AND', () => {
    const e = bin('BETWEEN', col('x'), { type: 'expr_list', value: [num(1), num(10)] });
    expect(formatExpr(e)).toBe('x BETWEEN 1 AND 10');
  });
  it('NOT BETWEEN', () => {
    const e = bin('NOT BETWEEN', col('x'), { type: 'expr_list', value: [num(1), num(10)] });
    expect(formatExpr(e)).toBe('x NOT BETWEEN 1 AND 10');
  });
});
