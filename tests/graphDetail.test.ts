import { describe, it, expect } from 'vitest';
import { parseSqlToAst, astToGraph, getLayoutedElements, formatExpr } from '../src/utils/astToGraph';
import { getNodeDimensions } from '../src/utils/graphNodeSize';

// Запрос с WITH разбирается встроенным разбором, но тело каждого CTE идёт в node-sql-parser: GROUP BY там приходит объектом { columns }.
const SQL = `WITH cs AS (SELECT o.customer_id, SUM(o.total) AS spend FROM orders o JOIN order_items i ON i.order_id = o.id GROUP BY o.customer_id HAVING SUM(o.total) > 10)
SELECT c.name, cs.spend FROM customers c JOIN cs ON cs.customer_id = c.id LEFT JOIN regions r ON r.id = c.region_id WHERE c.active AND r.name <> 'x' ORDER BY cs.spend DESC LIMIT 5`;

const build = (sql: string, direction = 'LR') => {
  const ast = parseSqlToAst(sql, 'PostgreSQL').ast;
  const g = astToGraph(ast, 'main_', 'PostgreSQL');
  const laid = getLayoutedElements(g.nodes as any, g.edges as any, direction);
  return { g, laid };
};

const rectOf = (n: any) => ({ x: n.position.x, y: n.position.y, ...getNodeDimensions(n) });
const overlap = (a: any, b: any) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('граф запроса', () => {
  describe('соединения и стрелки', () => {
    const { g, laid } = build(SQL);
    it('узлов JOIN нет, соединения — стрелки с подписью и данными', () => {
      expect(g.nodes.some(n => n.type === 'joinNode')).toBe(false);
      const joins = g.edges.filter(e => e.data?.join);
      expect(joins.length).toBe(3);
      const labels = joins.map(e => e.label);
      expect(labels).toContain('INNER JOIN · i.order_id = o.id');
      expect(labels).toContain('LEFT JOIN · r.id = c.region_id');
    });
    it('присоединяемый источник ведёт к родителю по алиасу из ON', () => {
      const byId = new Map(g.nodes.map(n => [n.id, n]));
      const toCustomers = g.edges.filter(e => e.data?.join && byId.get(e.target)?.data?.label === 'customers');
      expect(toCustomers.length).toBe(2); // cs и regions присоединены к customers
    });
    it('все стрелки — mermaidEdge с маршрутом, петель нет', () => {
      expect(laid.edges.every((e: any) => e.type === 'mermaidEdge')).toBe(true);
      expect(laid.edges.every((e: any) => !!e.data?.route)).toBe(true);
      expect(laid.edges.every((e: any) => e.source !== e.target)).toBe(true);
    });
    it('стрелки не анимированы; пунктир только у подзапросов в условиях (IN/EXISTS); потоки данных CTE и производных таблиц сплошные', () => {
      expect(g.edges.every(e => e.animated === false)).toBe(true);
      const dashed = g.edges.filter(e => e.style?.strokeDasharray);
      expect(dashed.every(e => e.label === 'subquery')).toBe(true);
      expect(dashed.every(e => !e.data?.join)).toBe(true);
    });
    it('карточки не накладываются друг на друга', () => {
      const rects = laid.nodes.filter((n: any) => n.type !== 'frameNode').map(rectOf);
      let bad = 0;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i], rects[j])) bad++;
      expect(bad).toBe(0);
    });
    it('режим TB тоже даёт маршруты', () => {
      const tb = build(SQL, 'TB').laid;
      expect(tb.edges.every((e: any) => !!e.data?.route)).toBe(true);
    });
    it('тот же CTE дважды в запросе: без петель и циклов из двух рёбер', () => {
      const sj = build('WITH cs AS (SELECT customer_id FROM orders) SELECT a.customer_id FROM cs a JOIN cs b ON b.customer_id = a.customer_id');
      const pairs = new Set(sj.g.edges.map(e => `${e.source}>${e.target}`));
      expect(sj.g.edges.every(e => e.source !== e.target)).toBe(true);
      expect(sj.g.edges.every(e => !pairs.has(`${e.target}>${e.source}`))).toBe(true);
    });
  });

  describe('чипы, колонки и рамки', () => {
    const { g, laid } = build(SQL);
    const byId = new Map(g.nodes.map(n => [n.id, n]));
    const chipsOf = (label: string) => g.nodes.find(n => n.data?.label === label)?.data?.chips?.map((c: any) => c.text);
    it('отдельных узлов WHERE / GROUP BY / HAVING / ORDER / LIMIT нет', () => {
      for (const t of ['filterNode', 'groupByNode', 'havingNode', 'sortNode', 'limitNode', 'joinNode']) {
        expect(g.nodes.some(n => n.type === t)).toBe(false);
      }
    });
    it('WHERE — чипы на карточках источников по первому упомянутому алиасу', () => {
      expect(chipsOf('customers')).toEqual(['c.active']);
      expect(chipsOf('regions')).toEqual(["r.name <> 'x'"]);
    });
    it('GROUP BY, HAVING, ORDER BY, LIMIT — чипы на Projection', () => {
      const proj = byId.get('main_projection')!;
      const texts = proj.data.chips.map((c: any) => c.text);
      expect(texts).toEqual(['ORDER BY cs.spend DESC', 'LIMIT 5']);
      const cteProj = byId.get('main_cte_cs_projection')!;
      expect(cteProj.data.chips.map((c: any) => c.text)).toEqual(['GROUP BY o.customer_id', 'HAVING SUM(o.total) > 10']);
    });
    it('колонки на карточках — только alias.колонка из запроса', () => {
      const customers = g.nodes.find(n => n.data?.label === 'customers')!;
      expect(customers.data.columns).toEqual(['id', 'region_id', 'active', 'name']);
      expect(customers.data.columnsTitle).toBeUndefined();
    });
    it('у колонок результата — метка источника', () => {
      const proj = byId.get('main_projection')!;
      expect(proj.data.columns.map((c: any) => c.src)).toEqual(['c', 'cs']);
    });
    it('CTE с двумя источниками получает рамку; обращение к CTE — своя карточка с алиасом', () => {
      const frames = laid.nodes.filter((n: any) => n.type === 'frameNode');
      expect(frames.length).toBe(1);
      expect(frames[0].data.kind).toBe('cte');
      expect(frames[0].data.name).toBe('cs');
      expect(byId.get('main_ref_1')!.data.label).toBe('cs');
    });
    it('рамка охватывает свои карточки и не заходит на чужие', () => {
      const frame: any = laid.nodes.find((n: any) => n.type === 'frameNode');
      const fr = { x: frame.position.x, y: frame.position.y, width: frame.data.width, height: frame.data.height };
      const members = new Set<string>(frame.data.members);
      for (const n of laid.nodes as any[]) {
        if (n.type === 'frameNode') continue;
        const r = rectOf(n);
        if (members.has(n.id)) {
          expect(r.x >= fr.x && r.y >= fr.y && r.x + r.width <= fr.x + fr.width && r.y + r.height <= fr.y + fr.height).toBe(true);
        } else {
          expect(overlap(r, fr)).toBe(false);
        }
      }
    });
    it('узлы без пересечений, все стрелки с маршрутом', () => {
      const rects = laid.nodes.filter((n: any) => n.type !== 'frameNode').map(rectOf);
      let bad = 0;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i], rects[j])) bad++;
      expect(bad).toBe(0);
      expect(laid.edges.every((e: any) => !!e.data?.route)).toBe(true);
    });
    it('условие с OR остаётся одним чипом', () => {
      const r = build("WITH x AS (SELECT 1 AS a) SELECT t.a FROM t JOIN u ON u.id = t.id WHERE t.a = 1 OR u.b = 2");
      const t = r.g.nodes.find(n => n.data?.label === 't');
      expect(t?.data?.chips?.length).toBe(1);
    });
  });

  describe('встроенный разбор: производные таблицы и ClickHouse', () => {
    const joinLabels = (sql: string) => build(sql).g.edges.filter(e => e.data?.join).map(e => e.label);
    it('ON соединения с производной таблицей берётся после её закрывающей скобки, а не из подзапроса', () => {
      const sql = `WITH w AS (SELECT 1 AS a FROM z)
SELECT t.a FROM t
LEFT JOIN (SELECT m.id, count() AS n FROM m INNER JOIN k ON k.id = m.id GROUP BY m.id) AS d ON d.id = t.id`;
      const labels = joinLabels(sql);
      expect(labels).toContain('LEFT JOIN · d.id = t.id');
      expect(labels).toContain('INNER JOIN · k.id = m.id');
    });
    it('ANY / ASOF / GLOBAL перед JOIN входят в тип соединения, а не в алиас предыдущей таблицы', () => {
      const sql = `WITH w AS (SELECT 1 AS a FROM z)
SELECT a.x FROM shop.a AS a ANY LEFT JOIN shop.b AS b ON b.id = a.id GLOBAL ALL INNER JOIN shop.c AS c ON c.id = a.id ASOF JOIN shop.d AS d ON d.t <= a.t`;
      const { g } = build(sql);
      expect(joinLabels(sql)).toEqual(['ANY LEFT JOIN · b.id = a.id', 'GLOBAL ALL INNER JOIN · c.id = a.id', 'ASOF JOIN · d.t <= a.t']);
      const a = g.nodes.find(n => n.data?.label === 'shop.a');
      expect(a?.data?.alias).toBe('a');
    });
    it('WITH с константами и скалярным подзапросом (ClickHouse) не мешает разбору CTE', () => {
      const sql = `WITH toDate('2026-01-01') AS p0, (SELECT avg(x) FROM s) AS g, c1 AS (SELECT 1 AS a FROM base1), c2 AS (SELECT a FROM c1) SELECT * FROM c2`;
      const ctes = (parseSqlToAst(sql, 'Clickhouse').ast.ctes ?? []).map((c: any) => c.name);
      expect(ctes).toEqual(['c1', 'c2']);
    });
  });

  describe('итоговая карточка', () => {
    it('помечается только результат основного запроса, не CTE и не подзапросы', () => {
      const { g } = build(SQL);
      const finals = g.nodes.filter(n => n.data?.final).map(n => n.id);
      expect(finals).toEqual(['main_projection']);
    });
    it('в файле из нескольких запросов — по одной на запрос', () => {
      const { g } = build(`${SQL};\n${SQL}`);
      expect(g.nodes.filter(n => n.data?.final).length).toBe(2);
    });
  });

  describe('оконные функции', () => {
    const col = (column: string) => ({ type: 'column_ref', table: null, column });
    // форма AST настоящего node-sql-parser: over.as_window_specification.window_specification
    const realOver = (spec: any) => ({ type: 'window', as_window_specification: { window_specification: spec, parentheses: true } });
    it('row_number() с PARTITION BY и ORDER BY (форма node-sql-parser)', () => {
      const e = {
        type: 'window_func', name: 'row_number', args: { type: 'expr_list', value: [] },
        over: realOver({ partitionby: [{ type: 'expr', expr: col('id') }], orderby: [{ expr: col('marker'), type: 'DESC' }], window_frame_clause: null }),
      };
      expect(formatExpr(e)).toBe('row_number() OVER (PARTITION BY id ORDER BY marker DESC)');
    });
    it('агрегат с окном и рамкой; ORDER BY без направления', () => {
      const e = {
        type: 'aggr_func', name: 'SUM', args: { expr: col('x') },
        over: realOver({
          partitionby: [{ type: 'expr', expr: col('g') }, { type: 'expr', expr: col('h') }],
          orderby: [{ expr: col('ts'), type: null }],
          window_frame_clause: { type: 'rows', expr: { type: 'binary_expr', operator: 'BETWEEN', left: { type: 'origin', value: 'unbounded preceding' }, right: { type: 'expr_list', value: [{ type: 'origin', value: 'current row' }] } } },
        }),
      };
      expect(formatExpr(e)).toBe('SUM(x) OVER (PARTITION BY g, h ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)');
    });
    it('именованное окно и пустое OVER ()', () => {
      expect(formatExpr({ type: 'window_func', name: 'rank', args: { type: 'expr_list', value: [] }, over: { type: 'window', as_window_specification: 'w' } })).toBe('rank() OVER w');
      expect(formatExpr({ type: 'window_func', name: 'count', args: { type: 'expr_list', value: [{ type: 'star', value: '*' }] }, over: realOver({ partitionby: null, orderby: null }) })).toBe('count(*) OVER ()');
    });
    it('прежняя упрощённая форма over.partitionby по-прежнему читается', () => {
      const e = { type: 'aggr_func', name: 'SUM', args: { expr: col('x') }, over: { partitionby: [col('g')], orderby: [{ expr: col('ts'), type: 'asc' }] } };
      expect(formatExpr(e)).toBe('SUM(x) OVER (PARTITION BY g ORDER BY ts ASC)');
    });
    it('оконная колонка помечается window, обычная — нет', () => {
      const { g } = build('SELECT id, row_number() OVER (PARTITION BY id ORDER BY marker) AS rn, count(*) AS c FROM t GROUP BY id');
      const cols = g.nodes.find(n => n.id === 'main_projection')!.data.columns;
      expect(cols.map((c: any) => !!c.window)).toEqual([false, true, false]);
      expect(cols[1].name).toContain('PARTITION BY id ORDER BY marker');
    });
  });

  describe('предупреждения ⚠', () => {
    const warns = (sql: string) => {
      const { g } = build(sql);
      return g.nodes.flatMap(n => (n.data?.warnings ?? []).map((w: any) => ({ label: n.data.label ?? n.data.title, final: !!n.data.final, ...w })));
    };
    const WITH = 'WITH w AS (SELECT 1 AS a FROM z) ';
    it('запятая и CROSS JOIN без связи — декартово произведение', () => {
      expect(warns(WITH + 'SELECT a.x FROM a, b').map(w => w.label)).toEqual(['b']);
      expect(warns(WITH + 'SELECT a.x FROM a CROSS JOIN b').map(w => w.label)).toEqual(['b']);
    });
    it('старый стиль «FROM a, b WHERE a.id = b.id» не считается ошибкой', () => {
      expect(warns(WITH + 'SELECT a.x FROM a, b WHERE a.id = b.id')).toEqual([]);
    });
    it('ARRAY JOIN и JOIN с условием — без предупреждений', () => {
      expect(warns(WITH + 'SELECT a.x FROM a JOIN b ON b.id = a.id')).toEqual([]);
      expect(warns(WITH + 'SELECT a.x FROM a ARRAY JOIN a.tags AS tag')).toEqual([]);
    });
    it('LEFT JOIN с условием WHERE по правой таблице', () => {
      const w = warns(WITH + "SELECT a.x FROM a LEFT JOIN b ON b.id = a.id WHERE b.kind = 'x'");
      expect(w.length).toBe(1);
      expect(w[0].label).toBe('b');
      expect(w[0].detail).toBe("b.kind = 'x'");
    });
    it('LEFT JOIN: IS NULL, условие по левой таблице и OR с левой — без предупреждений', () => {
      expect(warns(WITH + 'SELECT a.x FROM a LEFT JOIN b ON b.id = a.id WHERE b.id IS NULL')).toEqual([]);
      expect(warns(WITH + 'SELECT a.x FROM a LEFT JOIN b ON b.id = a.id WHERE a.k = 1')).toEqual([]);
      expect(warns(WITH + 'SELECT a.x FROM a LEFT JOIN b ON b.id = a.id WHERE a.k = 1 OR b.k = 2')).toEqual([]);
    });
    it('SELECT * — только у итогового результата, не у CTE', () => {
      const w = warns('WITH w AS (SELECT * FROM z) SELECT * FROM w');
      expect(w.length).toBe(1);
      expect(w[0].final).toBe(true);
      expect(warns('SELECT count(*) AS n FROM t')).toEqual([]);
    });
  });

  describe('единое название «subquery»', () => {
    it('подпись «subquery» только у стрелки подзапроса в условии; у производной таблицы её нет (карточка помечена бейджем)', () => {
      const { g } = build("WITH w AS (SELECT 1 AS a FROM z) SELECT t.a FROM t JOIN (SELECT x FROM q) AS d ON d.x = t.a WHERE t.a IN (SELECT a FROM w)");
      const dashed = g.edges.filter(e => e.style?.strokeDasharray);
      expect(dashed.filter(e => e.label).map(e => e.label)).toEqual(['subquery']);
      const derived = g.nodes.find(n => n.data?.label === 'd');
      expect(derived?.data?.isSubquery).toBe(true);
      expect(g.edges.some(e => e.target === derived?.id && !e.label)).toBe(true);
    });
  });

  describe('источник без имени таблицы', () => {
    it('табличная функция показывается как написана, а не UNKNOWN', () => {
      const ast = {
        type: 'select', columns: '*',
        from: [{ expr: { type: 'function', name: 'read_parquet', args: { type: 'expr_list', value: [{ type: 'single_quote_string', value: 'data/t/*.parquet' }] } }, as: 't' }],
      };
      const g = astToGraph(ast, 'main_', 'DuckDB');
      const src = g.nodes.find(n => n.data?.alias === 't');
      expect(src?.data?.label).toBe("read_parquet('data/t/*.parquet')");
    });
  });

  describe('метки CTE: RECURSIVE и MATERIALIZED', () => {
    const tagsOf = (sql: string) => Object.fromEntries(build(sql).g.nodes.filter(n => /cte_(\w+_projection|wrap_\w+)$/.test(n.id)).map(n => [n.id.replace(/^main_cte_(wrap_)?|_projection$/g, ''), n.data.tags]));
    it('MATERIALIZED / NOT MATERIALIZED показываются на своём CTE', () => {
      const t = tagsOf('WITH m AS MATERIALIZED (SELECT 1 a FROM b1), n AS NOT MATERIALIZED (SELECT 2 b FROM b2), k AS (SELECT 3 c FROM b3) SELECT * FROM m, n, k');
      expect(t).toEqual({ m: ['MATERIALIZED'], n: ['NOT MATERIALIZED'], k: undefined });
    });
    it('RECURSIVE не ставится CTE, в теле которого есть одноимённая таблица другой схемы', () => {
      const t = tagsOf('WITH RECURSIVE org AS (SELECT 1 AS n FROM hr.t UNION ALL SELECT n + 1 FROM org), salaries AS (SELECT x FROM hr.salaries s) SELECT * FROM org, salaries');
      expect(t.org).toEqual(['RECURSIVE']);
      expect(t.salaries).toBeUndefined();
    });
    it('RECURSIVE — только у CTE, который ссылается на себя', () => {
      const t = tagsOf('WITH RECURSIVE r AS (SELECT 1 AS n FROM seed UNION ALL SELECT n + 1 FROM r WHERE n < 5), s AS (SELECT 1 AS x FROM seed2) SELECT * FROM r, s');
      expect(t.r).toEqual(['RECURSIVE']);
      expect(t.s).toBeUndefined();
    });
  });

  describe('пустой limit от node-sql-parser', () => {
    // форма AST настоящего парсера для запроса без LIMIT: limit = { seperator: '', value: [] }
    const ast = {
      type: 'select',
      from: [{ table: 't', as: null }],
      columns: [{ expr: { type: 'column_ref', table: null, column: 'a' }, as: null }],
      where: null, groupby: null, having: null, orderby: null,
      limit: { seperator: '', value: [] },
    };
    it('не рисуется чипом LIMIT 0', () => {
      const g = astToGraph(ast, 'main_', 'PostgreSQL');
      expect(g.nodes.some(n => (n.data?.chips || []).some((c: any) => c.kind === 'limit'))).toBe(false);
    });
    it('настоящий LIMIT по-прежнему рисуется', () => {
      const withLimit = { ...ast, limit: { seperator: '', value: [{ type: 'number', value: 20 }] } };
      const g = astToGraph(withLimit, 'main_', 'PostgreSQL');
      const proj = g.nodes.find(n => n.id === 'main_projection')!;
      expect(proj.data.chips.map((c: any) => c.text)).toEqual(['LIMIT 20']);
    });
  });

  describe('несколько запросов в файле', () => {
    it('блоки запросов не пересекаются', () => {
      {
        const sql = `${SQL};\n${SQL}`;
        const { laid } = build(sql);
        const block = (k: number) => (laid.nodes as any[]).filter(n => n.type !== 'collapseNode' && new RegExp(`^main_q${k}_`).test(n.id) && n.type !== 'frameNode').map(rectOf);
        const b0 = block(0), b1 = block(1);
        expect(b0.length).toBeGreaterThan(0);
        expect(b1.length).toBeGreaterThan(0);
        let bad = 0;
        for (const a of b0) for (const b of b1) if (overlap(a, b)) bad++;
        expect(bad).toBe(0);
      }
    });
  });

  describe('DML', () => {
    const dml = (sql: string) => {
      const r = parseSqlToAst(sql, 'PostgreSQL');
      return astToGraph(r.ast, 'main_', 'PostgreSQL');
    };
    const data = (g: any, id: string) => g.nodes.find((n: any) => n.id === id)?.data;
    it('UPDATE без WHERE всё равно показывает SET со списком присваиваний', () => {
      const g = dml('UPDATE tgt SET a = 1, b = x + 1');
      expect(data(g, 'main_update_action')?.columns).toEqual(['a = 1', 'b = x + 1']);
    });
    it('UPDATE … FROM: источники, JOIN-условие и алиас цели', () => {
      const g = dml('UPDATE tgt t SET a = s.a FROM src s WHERE s.id = t.id AND t.x > 0');
      expect(data(g, 'main_target_0')?.alias).toBe('t');
      const src = g.nodes.find((n: any) => n.data?.label === 'src');
      expect(src?.data?.chips?.map((c: any) => c.text)).toEqual(['s.id = t.id', 't.x > 0']);
      expect(data(g, 'main_update_action')?.columns).toEqual(['a = s.a']);
      expect(g.edges.some((e: any) => e.target === 'main_update_action' && e.source === 'main_target_0')).toBe(true);
    });
    it('DELETE … USING показывает источник; WHERE с подзапросом не режется по чужому WHERE', () => {
      const g = dml('DELETE FROM tgt t USING src s WHERE s.id = t.id');
      expect(g.nodes.some((n: any) => n.data?.label === 'src')).toBe(true);
      const g2 = dml('DELETE FROM tgt WHERE id IN (SELECT id FROM q WHERE q.k = 1)');
      expect(data(g2, 'main_dml_where')?.condition).toContain('SELECT id FROM q WHERE q.k = 1');
    });
    it('INSERT: список колонок на карточке цели', () => {
      const g = dml('INSERT INTO tgt (id, a, b) SELECT id, a, b FROM src');
      expect(data(g, 'main_target_0')?.columns.map((c: any) => c.name)).toEqual(['id', 'a', 'b']);
    });
    it('MERGE: источник, ON и ветки WHEN', () => {
      const g = dml('MERGE INTO tgt t USING (SELECT id, a FROM src WHERE ok = 1) s ON t.id = s.id WHEN MATCHED AND s.del = 1 THEN DELETE WHEN MATCHED THEN UPDATE SET a = s.a WHEN NOT MATCHED THEN INSERT (id, a) VALUES (s.id, s.a)');
      expect(data(g, 'main_merge_on')?.condition).toBe('t.id = s.id');
      expect(data(g, 'main_merge_when')?.columns).toEqual([
        'MATCHED AND s.del = 1 → DELETE',
        'MATCHED → UPDATE SET a = s.a',
        'NOT MATCHED → INSERT (id, a) VALUES (s.id, s.a)',
      ]);
      expect(g.nodes.some((n: any) => n.data?.label === 'src')).toBe(true);
    });
    it('все DML-графы раскладываются без пересечений карточек', () => {
      for (const sql of [
        'UPDATE tgt t SET a = s.a FROM src s WHERE s.id = t.id',
        'DELETE FROM tgt t USING src s WHERE s.id = t.id',
        'MERGE INTO tgt t USING src s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = s.a',
      ]) {
        const g = dml(sql);
        const laid = getLayoutedElements(g.nodes, g.edges);
        expect(laid.nodes.every((n: any) => Number.isFinite(n.position.x))).toBe(true);
      }
    });
  });

  describe('ClickHouse: FINAL и константы WITH', () => {
    const g = () => astToGraph(parseSqlToAst("WITH toDate('2026-01-01') AS p0, (SELECT avg(x) FROM s.pay) AS g1, c AS (SELECT 1 AS a FROM z) SELECT o.id FROM shop.orders AS o FINAL WHERE o.d >= p0", 'ClickHouse').ast, 'main_', 'ClickHouse');
    it('FINAL — метка на карточке таблицы, алиас сохраняется', () => {
      const n = g().nodes.find((x: any) => x.data?.label === 'shop.orders');
      expect(n?.data?.tags).toEqual(['FINAL']);
      expect(n?.data?.alias).toBe('o');
    });
    it('константы WITH — отдельная карточка «имя = выражение»', () => {
      const wv = g().nodes.find((x: any) => x.id === 'main_with_values');
      expect(wv?.data?.columns).toEqual(["p0 = toDate('2026-01-01')", 'g1 = (SELECT avg(x) FROM s.pay)']);
    });
  });

  describe('разбор: мелкие случаи', () => {
    const g = (sql: string, d = 'PostgreSQL') => astToGraph(parseSqlToAst(sql, d).ast, 'main_', d);
    it('ORDER BY … NULLS LAST без лишнего ASC', () => {
      const n = g('WITH x AS (SELECT 1 AS a FROM t) SELECT a FROM x ORDER BY a DESC NULLS LAST, b NULLS FIRST').nodes.find((x: any) => x.data?.title === 'Projection');
      expect(n?.data?.chips?.map((c: any) => c.text)).toContain('ORDER BY a DESC NULLS LAST, b ASC NULLS FIRST');
    });
    it('массив в WITH (ClickHouse) попадает в константы', () => {
      const wv = g("WITH ['a', 'b'] AS wanted, 1 AS k SELECT 1 FROM t WHERE x IN wanted", 'ClickHouse').nodes.find((x: any) => x.id === 'main_with_values');
      expect(wv?.data?.columns).toEqual(["wanted = ['a', 'b']", 'k = 1']);
    });
    it('колонка «o.lvl + 1» без алиаса не теряет «1»', () => {
      const names = g('WITH x AS (SELECT d.id, o.lvl + 1 FROM t d JOIN o ON o.id = d.id) SELECT * FROM x').nodes
        .flatMap((v: any) => (v.type === 'resultNode' && Array.isArray(v.data?.columns) ? v.data.columns.map((c: any) => c.name) : []));
      expect(names).toContain('o.lvl + 1');
    });
    it('JOIN LATERAL (подзапрос): источник разобран, соединение помечено LATERAL', () => {
      const r = g('WITH a AS (SELECT 1 AS id FROM z) SELECT a.id, l.m FROM a LEFT JOIN LATERAL (SELECT max(q.v) AS m FROM q WHERE q.id = a.id) l ON true');
      expect(r.nodes.some((n: any) => n.data?.label === 'q')).toBe(true);
      expect(r.edges.some((e: any) => String(e.label || '').startsWith('LEFT JOIN LATERAL'))).toBe(true);
    });
  });

  describe('GROUP BY в двух формах AST', () => {
    const SQL_G = 'SELECT o.customer_id, SUM(o.total) AS spend FROM orders o GROUP BY o.customer_id, o.region';
    const chips = (ast: any) => astToGraph(ast, 'q_', 'PostgreSQL').nodes
      .find((n: any) => n.id === 'q_projection')?.data?.chips?.map((c: any) => c.text);
    it('массив (встроенный разбор)', () => {
      const ast = parseSqlToAst(SQL_G, 'PostgreSQL').ast;
      const cols = Array.isArray(ast.groupby) ? ast.groupby : ast.groupby.columns;
      expect(chips({ ...ast, groupby: cols })).toEqual(['GROUP BY o.customer_id, o.region']);
    });
    it('объект { columns, modifiers } (node-sql-parser 5.x)', () => {
      const ast = parseSqlToAst(SQL_G, 'PostgreSQL').ast;
      const cols = Array.isArray(ast.groupby) ? ast.groupby : ast.groupby.columns;
      expect(chips({ ...ast, groupby: { columns: cols, modifiers: [] } })).toEqual(['GROUP BY o.customer_id, o.region']);
    });
  });
});
