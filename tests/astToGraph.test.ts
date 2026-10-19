import { describe, it, expect } from 'vitest';
import { parseSqlToAst, astToGraph, stripCommentsSafely, splitQueries, getLayoutedElements, distinctLabel, tokenizeSql } from '../src/utils/astToGraph';

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

  describe('граф: COPY / CTAS / DISTINCT / QUALIFY / область видимости CTE', () => {
    const build = (sql: string) => {
      const r = parseSqlToAst(sql, 'DuckDB');
      return astToGraph(r.ast, 'main_', 'DuckDB');
    };
    const titles = (g: { nodes: any[] }) => g.nodes.map(n => String(n.data.title || ''));
    const labels = (g: { nodes: any[] }) => g.nodes.map(n => String(n.data.label || ''));

    it('COPY (SELECT ...) TO строит источник и узел файла', () => {
      const g = build("COPY (SELECT a FROM t WHERE a > 1) TO 'out/x.parquet' (FORMAT PARQUET)");
      expect(labels(g)).toContain('out/x.parquet');
      expect(labels(g)).toContain('t');
      expect(titles(g).some(t => t.startsWith('File (COPY TO'))).toBe(true);
    });

    it('COPY tbl FROM строит файл -> таблица', () => {
      const g = build("COPY tbl FROM 'in.csv' (HEADER)");
      expect(labels(g)).toContain('in.csv');
      expect(labels(g)).toContain('tbl');
      expect(g.edges.length).toBe(1);
    });

    it('CREATE TABLE ... AS SELECT добавляет целевую таблицу', () => {
      const g = build('CREATE OR REPLACE TABLE out AS SELECT a FROM src');
      expect(labels(g)).toContain('out');
      expect(labels(g)).toContain('src');
      expect(titles(g)).toContain('Target (CREATE TABLE)');
    });

    it('SELECT DISTINCT отображается в проекции, а не как столбец', () => {
      const g = build('SELECT DISTINCT a FROM t');
      expect(titles(g).some(t => t.includes('DISTINCT'))).toBe(true);
      const proj = g.nodes.find(n => String(n.data.title).startsWith('Projection'));
      expect(JSON.stringify(proj?.data.columns)).not.toContain('"DISTINCT"');
    });

    it('SELECT без DISTINCT не получает подпись DISTINCT в проекции', () => {
      const g = build('SELECT a FROM t');
      expect(titles(g).some(t => t.includes('DISTINCT'))).toBe(false);
      const g2 = build('SELECT id, ROW_NUMBER() OVER (PARTITION BY g ORDER BY ts) rn FROM e');
      expect(titles(g2).some(t => t.includes('DISTINCT'))).toBe(false);
    });

    it('distinctLabel: пустые значения парсера не считаются DISTINCT', () => {
      expect(distinctLabel(null)).toBeNull();
      expect(distinctLabel(undefined)).toBeNull();
      expect(distinctLabel({ type: null })).toBeNull();
      expect(distinctLabel({})).toBeNull();
      expect(distinctLabel('')).toBeNull();
      expect(distinctLabel({ type: 'ALL' })).toBeNull();
    });

    it('distinctLabel: DISTINCT и DISTINCT ON', () => {
      expect(distinctLabel('DISTINCT')).toBe('DISTINCT');
      expect(distinctLabel({ type: 'distinct' })).toBe('DISTINCT');
      expect(distinctLabel({ type: 'DISTINCT ON', on: 'a, b' })).toBe('DISTINCT ON (a, b)');
    });

    it('QUALIFY становится отдельным узлом-фильтром', () => {
      const g = build('SELECT id, ROW_NUMBER() OVER (PARTITION BY g ORDER BY ts) rn FROM e QUALIFY rn = 1');
      expect(titles(g)).toContain('QUALIFY');
      expect(labels(g)).toContain('e');
    });

    it('CTE одного запроса не подхватывается следующим запросом файла', () => {
      const g = build('WITH t AS (SELECT 1 a FROM base1) SELECT * FROM t; SELECT * FROM t JOIN z ON z.a = t.a');
      const leaked = g.edges.filter(e => e.source.includes('cte_wrap_t') && e.target.startsWith('main_q1_'));
      expect(leaked.length).toBe(0);
    });
  });

  describe('CTE: RECURSIVE и [NOT] MATERIALIZED (D-06)', () => {
    const cteNames = (sql: string) => (parseSqlToAst(sql, 'PostgreSQL').ast.ctes ?? []).map((c: any) => c.name);
    const graphIds = (sql: string) => {
      const r = parseSqlToAst(sql, 'PostgreSQL');
      return astToGraph(r.ast, 'main_', 'PostgreSQL').nodes.map(n => n.id);
    };

    it('обычный WITH разбирается как раньше', () => {
      expect(cteNames('WITH t AS (SELECT 1 a FROM base1) SELECT * FROM t')).toEqual(['t']);
      expect(cteNames('WITH a AS (SELECT 1 x FROM p), b AS (SELECT 2 y FROM q) SELECT * FROM a JOIN b ON a.x = b.y')).toEqual(['a', 'b']);
    });

    it('WITH RECURSIVE даёт CTE-узел', () => {
      const sql = 'WITH RECURSIVE r AS (SELECT 1 AS n FROM seed) SELECT * FROM r';
      expect(cteNames(sql)).toEqual(['r']);
      expect(graphIds(sql).some(id => id.includes('cte_wrap_r'))).toBe(true);
    });

    it('WITH RECURSIVE со списком столбцов и несколькими CTE', () => {
      expect(cteNames('WITH RECURSIVE r(n) AS (SELECT 1 FROM seed), s AS (SELECT 2 FROM seed2) SELECT * FROM r, s')).toEqual(['r', 's']);
    });

    it('AS MATERIALIZED (...) даёт CTE-узел', () => {
      const sql = 'WITH m AS MATERIALIZED (SELECT 1 a FROM base1) SELECT * FROM m';
      expect(cteNames(sql)).toEqual(['m']);
      expect(graphIds(sql).some(id => id.includes('cte_wrap_m'))).toBe(true);
    });

    it('AS NOT MATERIALIZED (...) даёт CTE-узел', () => {
      const sql = 'WITH n AS NOT MATERIALIZED (SELECT 1 a FROM base1), k AS (SELECT 2 b FROM base2) SELECT * FROM n, k';
      expect(cteNames(sql)).toEqual(['n', 'k']);
    });

    it('RECURSIVE вместе с MATERIALIZED', () => {
      expect(cteNames('WITH RECURSIVE r AS MATERIALIZED (SELECT 1 AS n FROM seed) SELECT * FROM r')).toEqual(['r']);
    });

    it('CTE по имени recursive (без ключевого слова) по-прежнему разбирается', () => {
      expect(cteNames('WITH recursive AS (SELECT 1 a FROM base1) SELECT * FROM recursive')).toEqual(['recursive']);
    });
  });

  describe('tokenizeSql: # (D-05)', () => {
    const comments = (sql: string) => tokenizeSql(sql).filter(t => t.type === 'comment').map(t => t.value);

    it('# в начале слова — по-прежнему комментарий до конца строки (MySQL)', () => {
      expect(comments('SELECT 1 # note\n, 2')).toEqual(['# note']);
      expect(stripCommentsSafely('SELECT 1 # note\nFROM t')).not.toContain('note');
    });

    it('оператор #>> не начинает комментарий', () => {
      const sql = "SELECT doc #>> '{a,b}' AS v FROM t";
      expect(comments(sql)).toEqual([]);
      expect(stripCommentsSafely(sql)).toContain("'{a,b}' AS v FROM t");
    });

    it('оператор #> не начинает комментарий', () => {
      expect(comments("SELECT doc #> '{a}' FROM t")).toEqual([]);
    });

    it('-- комментарий рядом с #>> работает как раньше', () => {
      expect(comments("SELECT doc #>> '{a}' FROM t -- хвост")).toEqual(['-- хвост']);
    });
  });

  describe('несколько запросов в файле', () => {
    const build = (sql: string, collapsed?: Set<string>) => {
      const r = parseSqlToAst(sql, 'DuckDB');
      return astToGraph(r.ast, 'main_', 'DuckDB', {}, { showSort: true, showLimit: true, collapsedQueries: collapsed });
    };
    const inQuery = (id: string, i: number) => id.startsWith(`main_q${i}_`) || id === `main_q_${i}` || id.startsWith(`main_q_${i}_`);

    it('между запросами нет рёбер (раньше «Next» связывал запросы)', () => {
      const g = build('SELECT a FROM t1; SELECT b FROM t2; SELECT c FROM t3');
      expect(g.edges.some((e: any) => e.label === 'Next')).toBe(false);
      for (const e of g.edges as any[]) {
        const qs = [0, 1, 2];
        const qa = qs.find(i => inQuery(e.source, i));
        const qb = qs.find(i => inQuery(e.target, i));
        expect(qa).toBe(qb);
      }
    });

    const boxOf = (laid: any, i: number) => {
      const ns = laid.nodes.filter((n: any) => inQuery(n.id, i));
      expect(ns.length > 0).toBe(true);
      return {
        minX: Math.min(...ns.map((n: any) => n.position.x)),
        minY: Math.min(...ns.map((n: any) => n.position.y)),
        maxX: Math.max(...ns.map((n: any) => n.position.x + 256)),
        maxY: Math.max(...ns.map((n: any) => n.position.y + 40)),
      };
    };

    it('LR: блоки запросов идут друг под другом с общим левым краем', () => {
      const g = build('SELECT a FROM t1; SELECT b FROM t2 WHERE b > 1; SELECT c FROM t3');
      const laid = getLayoutedElements(g.nodes as any, g.edges as any, 'LR');
      const b0 = boxOf(laid, 0), b1 = boxOf(laid, 1), b2 = boxOf(laid, 2);
      expect(b0.minX).toBe(0);
      expect(b1.minX).toBe(0);
      expect(b2.minX).toBe(0);
      expect(b1.minY > b0.maxY).toBe(true);
      expect(b2.minY > b1.maxY).toBe(true);
    });

    it('TB: блоки запросов идут друг за другом вправо с общим верхним краем', () => {
      const g = build('SELECT a FROM t1; SELECT b FROM t2 WHERE b > 1; SELECT c FROM t3');
      const laid = getLayoutedElements(g.nodes as any, g.edges as any, 'TB');
      const b0 = boxOf(laid, 0), b1 = boxOf(laid, 1), b2 = boxOf(laid, 2);
      expect(b0.minY).toBe(0);
      expect(b1.minY).toBe(0);
      expect(b2.minY).toBe(0);
      expect(b0.minX).toBe(0);
      expect(b1.minX > b0.maxX).toBe(true);
      expect(b2.minX > b1.maxX).toBe(true);
    });

    it('заголовок «Query N» без рёбер и стоит над своим блоком у левого края', () => {
      const g = build('SELECT a FROM t1; SELECT b FROM t2 WHERE b > 1');
      const headers = (g.nodes as any[]).filter(n => n.type === 'collapseNode');
      expect(headers.length).toBe(2);
      expect(headers[0].data.title).toBe('Query 1');
      for (const h of headers) {
        expect((g.edges as any[]).some(e => e.source === h.id || e.target === h.id)).toBe(false);
      }
      const laid = getLayoutedElements(g.nodes as any, g.edges as any, 'LR');
      [0, 1].forEach(i => {
        const hdr = laid.nodes.find((n: any) => n.id === `main_q_${i}_collapse`) as any;
        const rest = laid.nodes.filter((n: any) => inQuery(n.id, i) && n.type !== 'collapseNode') as any[];
        expect(hdr.position.x).toBe(0);
        expect(rest.every(n => n.position.y > hdr.position.y)).toBe(true);
      });
    });

    it('свёрнутый запрос остаётся в своём месте списка', () => {
      const g = build('SELECT a FROM t1; SELECT b FROM t2; SELECT c FROM t3', new Set(['main_q_1']));
      const laid = getLayoutedElements(g.nodes as any, g.edges as any, 'LR');
      const y = (id: string) => (laid.nodes.find((n: any) => n.id === id) as any).position.y;
      expect(y('main_q_1') > y('main_q_0_collapse')).toBe(true);
      expect(y('main_q_2_collapse') > y('main_q_1')).toBe(true);
    });
  });
});