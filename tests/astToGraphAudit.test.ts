import { describe, it, expect } from 'vitest';
import { parseSqlToAst, astToGraph, splitQueries } from '../src/utils/astToGraph';

const graphOf = (sql: string, dialect = 'DuckDB') => {
  const r = parseSqlToAst(sql, dialect);
  return astToGraph(r.ast, 'main_', dialect);
};
const chipsOf = (g: { nodes: any[] }) => g.nodes.flatMap((n: any) => n.data?.chips ?? []).map((c: any) => String(c.text));
const joinTypes = (g: { edges: any[] }) => g.edges.map((e: any) => String(e.data?.joinType ?? ''));

describe('D-02: «/» как деление и как разделитель', () => {
  it('SUM(CASE … END) / COUNT(*) — один запрос', () => {
    expect(splitQueries('SELECT SUM(CASE WHEN a = 1 THEN 1 END) / COUNT(*) FROM t')).toHaveLength(1);
    expect(splitQueries('SELECT SUM(CASE WHEN a = 1 THEN 1 END)\n/ COUNT(*) FROM t')).toHaveLength(1);
  });
  it('«/» на отдельной строке после END разделяет запросы', () => {
    expect(splitQueries('SELECT CASE WHEN a THEN 1 END\n/\nSELECT 2')).toEqual(['SELECT CASE WHEN a THEN 1 END', 'SELECT 2']);
  });
});

describe('D-04: ClickHouse SELECT * EXCEPT (a, b)', () => {
  it('EXCEPT-модификатор не режет запрос на части', () => {
    const r = parseSqlToAst('SELECT * EXCEPT (a, b) FROM t', 'ClickHouse');
    expect(r.ast?.type).not.toBe('union');
  });
  it('настоящий EXCEPT над множествами по-прежнему разбирается', () => {
    expect(parseSqlToAst('SELECT a FROM t1 EXCEPT SELECT a FROM t2', 'DuckDB').ast.type).toBe('union');
    expect(parseSqlToAst('SELECT a FROM t1 EXCEPT (SELECT a FROM t2)', 'DuckDB').ast.type).toBe('union');
  });
});

describe('D-05: INSERT … SELECT … UNION ALL', () => {
  it('остаётся одним оператором INSERT с объединением в источнике', () => {
    const r = parseSqlToAst('INSERT INTO tgt (a) SELECT a FROM s1 UNION ALL SELECT a FROM s2', 'DuckDB');
    expect(r.ast.type).toBe('insert');
    expect(r.ast.values.type).toBe('union');
  });
});

describe('D-07: LIMIT offset, count', () => {
  it('LIMIT 5, 10 → LIMIT 10 OFFSET 5', () => {
    expect(chipsOf(graphOf('SELECT a FROM t LIMIT 5, 10'))).toContain('LIMIT 10 OFFSET 5');
  });
  it('LIMIT 10 OFFSET 5 без изменений', () => {
    expect(chipsOf(graphOf('SELECT a FROM t LIMIT 10 OFFSET 5'))).toContain('LIMIT 10 OFFSET 5');
  });
  it('LIMIT 10 без смещения', () => {
    expect(chipsOf(graphOf('SELECT a FROM t LIMIT 10'))).toContain('LIMIT 10');
  });
});

describe('D-08: модификатор JOIN после направления', () => {
  const sqls: Array<[string, string]> = [
    ['SELECT * FROM a LEFT SEMI JOIN b ON a.id = b.id', 'LEFT SEMI JOIN'],
    ['SELECT * FROM a LEFT ANTI JOIN b ON a.id = b.id', 'LEFT ANTI JOIN'],
    ['SELECT * FROM a LEFT ANY JOIN b ON a.id = b.id', 'LEFT ANY JOIN'],
    ['SELECT * FROM a INNER ANY JOIN b ON a.id = b.id', 'INNER ANY JOIN'],
  ];
  for (const [sql, kw] of sqls) {
    it(kw, () => {
      const g = graphOf(sql, 'ClickHouse');
      expect(joinTypes(g)).toContain(kw);
      expect(g.nodes.filter((n: any) => n.type === 'tableNode')).toHaveLength(2);
    });
  }
  it('POSITIONAL JOIN', () => {
    const g = graphOf('SELECT * FROM a POSITIONAL JOIN b');
    const labels = g.nodes.map((n: any) => String(n.data?.label ?? ''));
    expect(labels).toContain('a');
    expect(labels).toContain('b');
  });
});

describe('D-09: CTE с именем в кавычках', () => {
  it('имя в двойных кавычках', () => {
    const r = parseSqlToAst('WITH "my cte" AS (SELECT 1 a FROM base1) SELECT * FROM "my cte"', 'DuckDB');
    expect((r.ast.ctes ?? []).map((c: any) => c.name)).toEqual(['"my cte"']);
    expect(graphOf('WITH "my cte" AS (SELECT 1 a FROM base1) SELECT * FROM "my cte"').nodes.some((n: any) => n.id.includes('cte_my cte_'))).toBe(true);
  });
  it('имя в обратных кавычках и второй CTE', () => {
    const r = parseSqlToAst('WITH `c1` AS (SELECT 1 a FROM p), c2 AS (SELECT 2 b FROM q) SELECT * FROM `c1` JOIN c2 ON c1.a = c2.b', 'ClickHouse');
    expect((r.ast.ctes ?? []).map((c: any) => c.name)).toEqual(['`c1`', 'c2']);
  });
});
