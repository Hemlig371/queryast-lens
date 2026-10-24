import { describe, it, expect } from 'vitest';
import { buildPagedSql, splitStatements, hasOwnRowLimit, type PagedSql } from '../src/utils/pagedSql';
import { hasFormatClause } from '../src/utils/clickhouseFormat';

//  A — один SELECT: LIMIT/OFFSET, хвостовые `;` и комментарии
//  B — скрипт из нескольких операторов: подготовительные операторы не выполняются на странице ≥ 2
//  C — скрипт, начинающийся с CREATE: страница 2 листает последний SELECT, а не повторяет данные
//  D — WITH / собственный LIMIT / OFFSET / UNION: LIMIT ищется только на верхнем уровне последнего SELECT
//  E — комментарии `--` и `/* */` (в том числе с `;`, LIMIT и UNION внутри)
//  F — ClickHouse: LIMIT перед SETTINGS и FORMAT
//  G — строки с `;`, `--`, `LIMIT` и обратной косой чертой

const P = (page: number, extra: Partial<{ pageSize: number; dialect: 'duckdb' | 'clickhouse'; mode: 'sequential' | 'parallel' }> = {}) => ({
  page,
  pageSize: 50,
  dialect: 'duckdb' as const,
  ...extra,
});

const mainOf = (sql: string, page: number, extra: Parameters<typeof P>[1] = {}): string => buildPagedSql(sql, P(page, extra)).main;

describe('A: один SELECT', () => {
  it('страница 1 добавляет LIMIT, страница 3 — LIMIT и OFFSET', () => {
    const r: PagedSql = buildPagedSql('SELECT * FROM t', P(1));
    expect(r).toEqual({ setup: [], main: 'SELECT * FROM t\nLIMIT 50', pageable: true, skip: false });
    expect(mainOf('SELECT * FROM t', 3)).toBe('SELECT * FROM t\nLIMIT 50 OFFSET 100');
  });

  it('завершающая ; и пробелы убираются', () => {
    expect(mainOf('SELECT * FROM t ;  \n', 1)).toBe('SELECT * FROM t\nLIMIT 50');
  });

  it('после ; остался только комментарий — он не считается оператором', () => {
    expect(mainOf('SELECT 1; -- done', 1)).toBe('SELECT 1\nLIMIT 50');
    expect(mainOf('SELECT 1; /* done; really */', 2)).toBe('SELECT 1\nLIMIT 50 OFFSET 50');
  });

  it('хвостовой -- комментарий не съедает LIMIT и остаётся в запросе', () => {
    expect(mainOf('SELECT a FROM t -- c', 1)).toBe('SELECT a FROM t\nLIMIT 50 -- c');
    expect(mainOf('SELECT a FROM t /* c */', 2)).toBe('SELECT a FROM t\nLIMIT 50 OFFSET 50 /* c */');
  });

  it('комментарий в начале сохраняется', () => {
    expect(mainOf('-- hi\nSELECT 1', 1)).toBe('-- hi\nSELECT 1\nLIMIT 50');
  });

  it('регистр ключевых слов не важен; FROM-first и скобка в начале листаются', () => {
    expect(mainOf('select 1', 1)).toBe('select 1\nLIMIT 50');
    expect(mainOf('FROM t', 1)).toBe('FROM t\nLIMIT 50');
    expect(buildPagedSql('(SELECT 1)', P(1)).pageable).toBe(true);
  });

  it('номер страницы меньше 1 или дробный приводится к целой странице ≥ 1', () => {
    expect(mainOf('SELECT 1', 0)).toBe('SELECT 1\nLIMIT 50');
    expect(mainOf('SELECT 1', 2.9)).toBe('SELECT 1\nLIMIT 50 OFFSET 50');
  });
});

describe('B: скрипт из нескольких операторов', () => {
  const script = 'CREATE TABLE t AS SELECT 1 AS a;\nINSERT INTO t VALUES (2);\nSELECT * FROM t';

  it('обычный запуск, страница 1: весь текст как раньше, LIMIT только у последнего оператора', () => {
    const r = buildPagedSql(script, P(1));
    expect(r.setup).toEqual([]);
    expect(r.main).toBe('CREATE TABLE t AS SELECT 1 AS a;\nINSERT INTO t VALUES (2);\nSELECT * FROM t\nLIMIT 50');
    expect(r.skip).toBe(false);
  });

  it('обычный запуск, страница 2: подготовительные операторы не выполняются повторно', () => {
    const r = buildPagedSql(script, P(2));
    expect(r.setup).toEqual([]);
    expect(r.main).toBe('SELECT * FROM t\nLIMIT 50 OFFSET 50');
    expect(r.main).not.toMatch(/CREATE|INSERT/);
  });

  it('режим sequential: страница 1 отдаёт подготовительные операторы отдельно, страница ≥ 2 — нет', () => {
    const p1 = buildPagedSql(script, P(1, { mode: 'sequential' }));
    expect(p1.setup).toEqual(['CREATE TABLE t AS SELECT 1 AS a', 'INSERT INTO t VALUES (2)']);
    expect(p1.main).toBe('SELECT * FROM t\nLIMIT 50');
    const p3 = buildPagedSql(script, P(3, { mode: 'sequential' }));
    expect(p3.setup).toEqual([]);
    expect(p3.main).toBe('SELECT * FROM t\nLIMIT 50 OFFSET 100');
  });

  it('последний оператор — только комментарий: он не выполняется вместо запроса', () => {
    const r = buildPagedSql('SET threads = 1;\nSELECT 1;\n-- the end', P(1, { mode: 'sequential' }));
    expect(r.setup).toEqual(['SET threads = 1']);
    expect(r.main).toBe('SELECT 1\nLIMIT 50');
  });

  it('комментарии перед операторами остаются при операторе', () => {
    const r = buildPagedSql('-- setup\nSET threads = 1;\n-- main\nSELECT 1', P(1, { mode: 'sequential' }));
    expect(r.setup).toEqual(['-- setup\nSET threads = 1']);
    expect(r.main).toBe('-- main\nSELECT 1\nLIMIT 50');
  });
});

describe('C: скрипт, начинающийся с CREATE', () => {
  it('страница 2 листает последний SELECT (данные не повторяются)', () => {
    const sql = 'CREATE VIEW v AS SELECT 1;\nSELECT * FROM v';
    expect(mainOf(sql, 1)).toBe('CREATE VIEW v AS SELECT 1;\nSELECT * FROM v\nLIMIT 50');
    expect(mainOf(sql, 2)).toBe('SELECT * FROM v\nLIMIT 50 OFFSET 50');
  });

  it('последний оператор не листается: страница 1 без изменений, страница ≥ 2 ничего не выполняет', () => {
    const sql = 'SELECT 1;\nCREATE TABLE x AS SELECT 2';
    const p1 = buildPagedSql(sql, P(1));
    expect(p1).toEqual({ setup: [], main: sql, pageable: false, skip: false });
    const p2 = buildPagedSql(sql, P(2));
    expect(p2.skip).toBe(true);
    expect(p2.main).toBe('');
    expect(p2.setup).toEqual([]);
  });

  it('режим sequential с непагинируемым последним оператором: подготовка и сам оператор как есть, без LIMIT', () => {
    const p1 = buildPagedSql('SET a = 1; COPY t TO \'x.csv\'', P(1, { mode: 'sequential' }));
    expect(p1.setup).toEqual(['SET a = 1']);
    expect(p1.main).toBe("COPY t TO 'x.csv'");
    expect(p1.pageable).toBe(false);
  });

  it('INSERT и другие операторы без строк не листаются', () => {
    for (const sql of ['INSERT INTO t SELECT * FROM s', 'SHOW TABLES', 'EXPLAIN SELECT 1', 'DROP TABLE t', 'PRAGMA version']) {
      const r = buildPagedSql(sql, P(1));
      expect(r.pageable).toBe(false);
      expect(r.main).toBe(sql);
      expect(buildPagedSql(sql, P(2)).skip).toBe(true);
    }
  });
});

describe('D: WITH, собственный LIMIT, OFFSET, UNION', () => {
  it('LIMIT внутри CTE не считается: LIMIT добавляется к основному запросу', () => {
    const sql = 'WITH a AS (SELECT * FROM t LIMIT 10) SELECT * FROM a';
    expect(mainOf(sql, 1)).toBe(`${sql}\nLIMIT 50`);
    expect(mainOf(sql, 2)).toBe(`${sql}\nLIMIT 50 OFFSET 50`);
    expect(hasOwnRowLimit(sql, 'duckdb')).toBe(false);
  });

  it('LIMIT в подзапросе FROM не считается', () => {
    const sql = 'SELECT * FROM (SELECT * FROM t LIMIT 5) s';
    expect(mainOf(sql, 1)).toBe(`${sql}\nLIMIT 50`);
  });

  it('собственный LIMIT верхнего уровня: страница 1 без изменений, страница 2 оборачивает запрос', () => {
    const sql = 'SELECT * FROM t ORDER BY x LIMIT 1000';
    expect(mainOf(sql, 1)).toBe(sql);
    expect(mainOf(sql, 2)).toBe(`SELECT * FROM (\n${sql}\n) AS _limited_subquery LIMIT 50 OFFSET 50`);
    expect(hasOwnRowLimit(sql, 'duckdb')).toBe(true);
  });

  it('LIMIT в строке и в комментарии не считается собственным', () => {
    const sql = "SELECT 'LIMIT 5' AS x -- LIMIT 3\nFROM t";
    expect(hasOwnRowLimit(sql, 'duckdb')).toBe(false);
    expect(mainOf(sql, 1)).toBe(`${sql}\nLIMIT 50`);
    const sql2 = 'SELECT 1 /* LIMIT 3 */ FROM t';
    expect(mainOf(sql2, 1)).toBe(`${sql2}\nLIMIT 50`);
  });

  it('только OFFSET: страница 1 добавляет LIMIT, страница 2 оборачивает', () => {
    const sql = 'SELECT * FROM t OFFSET 10';
    expect(mainOf(sql, 1)).toBe('SELECT * FROM t OFFSET 10\nLIMIT 50');
    expect(mainOf(sql, 2)).toBe(`SELECT * FROM (\n${sql}\n) AS _limited_subquery LIMIT 50 OFFSET 50`);
  });

  it('UNION/EXCEPT/INTERSECT верхнего уровня оборачиваются в подзапрос', () => {
    const sql = 'SELECT 1 UNION ALL SELECT 2';
    expect(mainOf(sql, 1)).toBe(`SELECT * FROM (\n${sql}\n) AS _limited_subquery LIMIT 50`);
    expect(mainOf(sql, 2)).toBe(`SELECT * FROM (\n${sql}\n) AS _limited_subquery LIMIT 50 OFFSET 50`);
    expect(mainOf('(SELECT 1) EXCEPT (SELECT 2)', 1)).toContain('_limited_subquery LIMIT 50');
  });

  it('UNION только внутри подзапроса или строки не требует обёртки', () => {
    expect(mainOf('SELECT * FROM (SELECT 1 UNION SELECT 2) x', 1)).toBe('SELECT * FROM (SELECT 1 UNION SELECT 2) x\nLIMIT 50');
    expect(mainOf("SELECT 'a UNION b' AS s", 1)).toBe("SELECT 'a UNION b' AS s\nLIMIT 50");
  });

  it('размер страницы 0 (без ограничения): запрос не меняется, страница ≥ 2 не выполняется', () => {
    const r = buildPagedSql('SELECT * FROM t', P(1, { pageSize: 0 }));
    expect(r.main).toBe('SELECT * FROM t');
    expect(r.pageable).toBe(false);
    expect(buildPagedSql('SELECT * FROM t', P(2, { pageSize: 0 })).skip).toBe(true);
  });
});

describe('E: комментарии', () => {
  it('; и UNION внутри комментариев не делят скрипт и не требуют обёртки', () => {
    const sql = 'SELECT 1 /* a; b UNION c */ FROM t; -- tail; more\n';
    expect(splitStatements(sql)).toEqual(['SELECT 1 /* a; b UNION c */ FROM t']);
    expect(mainOf(sql, 1)).toBe('SELECT 1 /* a; b UNION c */ FROM t\nLIMIT 50');
  });

  it('splitStatements отбрасывает куски из одних комментариев и пробелов, но не трогает остальные', () => {
    expect(splitStatements('-- a\n;;  ; SELECT 1;\n/* x */\n; SELECT 2 -- y')).toEqual(['SELECT 1', 'SELECT 2 -- y']);
    expect(splitStatements('')).toEqual([]);
    expect(splitStatements('  \n -- only\n')).toEqual([]);
  });

  it('пустой или состоящий из комментариев текст не даёт запроса', () => {
    expect(buildPagedSql('', P(1))).toEqual({ setup: [], main: '', pageable: false, skip: false });
    expect(buildPagedSql('-- nothing', P(2)).skip).toBe(true);
  });
});

describe('F: ClickHouse (SETTINGS и FORMAT)', () => {
  const ch = (sql: string, page: number) => mainOf(sql, page, { dialect: 'clickhouse' });

  it('LIMIT ставится перед SETTINGS', () => {
    expect(ch('SELECT * FROM t SETTINGS max_threads = 1', 1)).toBe('SELECT * FROM t\nLIMIT 50\nSETTINGS max_threads = 1');
    expect(ch('SELECT * FROM t SETTINGS max_threads = 1', 2)).toBe('SELECT * FROM t\nLIMIT 50 OFFSET 50\nSETTINGS max_threads = 1');
  });

  it('LIMIT ставится перед FORMAT и перед SETTINGS … FORMAT', () => {
    expect(ch('SELECT * FROM t FORMAT CSV', 1)).toBe('SELECT * FROM t\nLIMIT 50\nFORMAT CSV');
    expect(ch('SELECT * FROM t SETTINGS a = 1 FORMAT JSON', 1)).toBe('SELECT * FROM t\nLIMIT 50\nSETTINGS a = 1 FORMAT JSON');
  });

  it('хвостовой комментарий после FORMAT остаётся в конце', () => {
    expect(ch('SELECT 1 FORMAT JSON -- c', 1)).toBe('SELECT 1\nLIMIT 50\nFORMAT JSON -- c');
  });

  it('столбец format / settings и слова в строках — не предложения запроса', () => {
    expect(ch('SELECT format FROM t', 1)).toBe('SELECT format FROM t\nLIMIT 50');
    expect(ch('SELECT * FROM t ORDER BY format DESC', 1)).toBe('SELECT * FROM t ORDER BY format DESC\nLIMIT 50');
    expect(ch("SELECT 'SETTINGS x = 1' AS s FROM t", 1)).toBe("SELECT 'SETTINGS x = 1' AS s FROM t\nLIMIT 50");
    expect(ch('SELECT * FROM t WHERE settings = 1', 1)).toBe('SELECT * FROM t WHERE settings = 1\nLIMIT 50');
  });

  it('собственный LIMIT и SETTINGS, страница 2: SETTINGS выносится из подзапроса наружу', () => {
    const sql = 'SELECT * FROM t LIMIT 1000 SETTINGS a = 1';
    expect(ch(sql, 1)).toBe(sql);
    expect(ch(sql, 2)).toBe('SELECT * FROM (\nSELECT * FROM t LIMIT 1000\n) AS _limited_subquery LIMIT 50 OFFSET 50\nSETTINGS a = 1');
  });

  it('UNION ALL с FORMAT: обёртка, FORMAT снаружи', () => {
    expect(ch('SELECT 1 UNION ALL SELECT 2 FORMAT CSV', 1)).toBe(
      'SELECT * FROM (\nSELECT 1 UNION ALL SELECT 2\n) AS _limited_subquery LIMIT 50\nFORMAT CSV'
    );
  });

  it('LIMIT n BY не является ограничением числа строк', () => {
    const sql = 'SELECT * FROM t ORDER BY a LIMIT 1 BY a';
    expect(hasOwnRowLimit(sql, 'clickhouse')).toBe(false);
    expect(ch(sql, 1)).toBe(`${sql}\nLIMIT 50`);
    expect(hasOwnRowLimit('SELECT * FROM t ORDER BY a LIMIT 1 BY a LIMIT 10', 'clickhouse')).toBe(true);
  });

  it('обратная косая черта в строке экранирует кавычку', () => {
    expect(ch("SELECT 'it\\'s LIMIT 5' AS x", 1)).toBe("SELECT 'it\\'s LIMIT 5' AS x\nLIMIT 50");
  });
});

describe('G: строки с ; , -- и обратной косой чертой', () => {
  it('; и -- внутри строки не делят запрос и не обрезают его', () => {
    expect(mainOf("SELECT 'a;b -- c' AS x", 1)).toBe("SELECT 'a;b -- c' AS x\nLIMIT 50");
    expect(mainOf("SELECT 'a;b -- c' AS x", 2)).toBe("SELECT 'a;b -- c' AS x\nLIMIT 50 OFFSET 50");
  });

  it('; в строке подготовительного оператора', () => {
    const r = buildPagedSql("SET v = 'a;b'; SELECT * FROM t", P(1, { mode: 'sequential' }));
    expect(r.setup).toEqual(["SET v = 'a;b'"]);
    expect(r.main).toBe('SELECT * FROM t\nLIMIT 50');
  });

  it("DuckDB: строка 'C:\\data\\' закрывается на последней кавычке, LIMIT после неё виден", () => {
    const sql = "SELECT 'C:\\data\\' AS p FROM t LIMIT 5";
    expect(hasOwnRowLimit(sql, 'duckdb')).toBe(true);
    expect(mainOf(sql, 1)).toBe(sql);
    const sql2 = "SELECT 'C:\\data\\' AS p FROM t";
    expect(mainOf(sql2, 1)).toBe(`${sql2}\nLIMIT 50`);
  });

  it('удвоенная кавычка и двойные кавычки идентификаторов', () => {
    expect(mainOf("SELECT 'it''s; ok' AS \"a;b\"", 1)).toBe("SELECT 'it''s; ok' AS \"a;b\"\nLIMIT 50");
  });
});

describe('H: режим parallel и устойчивость', () => {
  it('parallel: страница 1 не меняет запрос, страница ≥ 2 не выполняется', () => {
    const sql = 'SELECT 1; SELECT 2';
    expect(buildPagedSql(sql, P(1, { mode: 'parallel' }))).toEqual({ setup: [], main: sql, pageable: false, skip: false });
    expect(buildPagedSql(sql, P(2, { mode: 'parallel' })).skip).toBe(true);
  });

  it('незакрытые скобки и кавычки не вызывают исключений', () => {
    expect(() => buildPagedSql('SELECT (1', P(1))).not.toThrow();
    expect(() => buildPagedSql("SELECT 'abc", P(2))).not.toThrow();
    expect(() => buildPagedSql('SELECT 1 /* abc', P(1))).not.toThrow();
  });

  it('большой скрипт обрабатывается быстро', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `SELECT ${i} AS c${i}, 'x;--y' AS s`).join(';\n');
    const t0 = Date.now();
    const r = buildPagedSql(big, P(2));
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.main.startsWith('SELECT 2999')).toBe(true);
  });
});

describe('I: WITH … DML, FETCH FIRST, TABLE / VALUES / PIVOT', () => {
  it('WITH … INSERT/UPDATE/DELETE/MERGE/COPY/CREATE не листается и не получает LIMIT', () => {
    const cases = [
      'WITH s AS (SELECT range FROM range(1000)) INSERT INTO sink SELECT * FROM s',
      'WITH s AS (SELECT 1 x) DELETE FROM t WHERE x IN (SELECT x FROM s)',
      'WITH s AS (SELECT 1 x) UPDATE t SET y = 1 WHERE x IN (SELECT x FROM s)',
      'WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 5) INSERT INTO sink SELECT n FROM r',
      'WITH a AS (SELECT 1 x), b AS MATERIALIZED (SELECT 2 y) INSERT INTO sink SELECT * FROM a, b',
      'WITH a AS NOT MATERIALIZED (SELECT 1 x) INSERT INTO sink SELECT * FROM a',
      'WITH "copy" AS (SELECT 1 x) INSERT INTO sink SELECT * FROM "copy"',
      'with s as (select 1) insert into sink select * from s;',
      'WITH s AS (SELECT 1 x) MERGE INTO t USING s ON t.x = s.x WHEN MATCHED THEN DELETE',
      'WITH s AS (SELECT 1 x) CREATE TABLE c AS SELECT * FROM s',
    ];
    for (const sql of cases) {
      const r1 = buildPagedSql(sql, P(1));
      expect(r1.pageable, sql).toBe(false);
      expect(r1.main, sql).toBe(sql.trim());
      expect(buildPagedSql(sql, P(2)).skip, sql).toBe(true);
    }
  });

  it('WITH … SELECT (в том числе слова insert/update в CTE, строках и столбцах) по-прежнему листается', () => {
    const cases = [
      'WITH s AS (SELECT 1 x) SELECT * FROM s',
      'WITH s AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM s',
      "WITH s AS (SELECT 'insert' AS update) SELECT * FROM s",
      'WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a, b',
      'WITH s AS (SELECT 1) TABLE s',
      'WITH s AS (SELECT 1) -- insert\nSELECT * FROM s',
    ];
    for (const sql of cases) {
      const r = buildPagedSql(sql, P(1));
      expect(r.pageable, sql).toBe(true);
      expect(r.main.endsWith('\nLIMIT 50'), sql).toBe(true);
    }
  });

  it('в скрипте WITH … INSERT последним оператором: подготовка выполняется как есть, страница 2 ничего не запускает', () => {
    const sql = 'CREATE TABLE sink(x INT);\nWITH s AS (SELECT 1 x) INSERT INTO sink SELECT * FROM s';
    expect(buildPagedSql(sql, P(1)).main).toBe(sql);
    expect(buildPagedSql(sql, P(2)).skip).toBe(true);
    const seq = buildPagedSql(sql, P(1, { mode: 'sequential' }));
    expect(seq.setup).toEqual(['CREATE TABLE sink(x INT)']);
    expect(seq.main).toBe('WITH s AS (SELECT 1 x) INSERT INTO sink SELECT * FROM s');
  });

  it('FETCH FIRST/NEXT — собственный лимит: страница 1 без изменений, страница 2 оборачивает', () => {
    const sql = 'SELECT * FROM t ORDER BY x FETCH FIRST 5 ROWS ONLY';
    expect(buildPagedSql(sql, P(1)).main).toBe(sql);
    expect(hasOwnRowLimit(sql, 'duckdb')).toBe(true);
    expect(mainOf(sql, 2)).toBe(`SELECT * FROM (\n${sql}\n) AS _limited_subquery LIMIT 50 OFFSET 50`);
    const sql2 = 'select * from t offset 2 rows fetch next 3 rows only';
    expect(buildPagedSql(sql2, P(1)).main).toBe(sql2);
    expect(mainOf(sql2, 2)).toBe(`SELECT * FROM (\n${sql2}\n) AS _limited_subquery LIMIT 50 OFFSET 50`);
  });

  it('FETCH в подзапросе, строке, комментарии и как имя столбца не считается лимитом', () => {
    for (const sql of [
      'SELECT * FROM (SELECT * FROM t FETCH FIRST 1 ROWS ONLY) q',
      "SELECT 'FETCH FIRST 1 ROWS ONLY' AS x",
      'SELECT * FROM t -- FETCH FIRST 1 ROWS ONLY',
      'SELECT fetch, first FROM t',
    ]) {
      expect(hasOwnRowLimit(sql, 'duckdb'), sql).toBe(false);
      expect(buildPagedSql(sql, P(1)).main.includes('\nLIMIT 50'), sql).toBe(true);
    }
  });

  it('TABLE / VALUES / PIVOT (DuckDB) листаются и всегда оборачиваются в подзапрос', () => {
    for (const sql of ['TABLE t', 'table t', 'VALUES (1), (2), (3)', 'PIVOT t ON g USING sum(x)', 'PIVOT t ON g USING sum(x) GROUP BY x', '(TABLE t)']) {
      const r1 = buildPagedSql(sql, P(1));
      expect(r1.pageable, sql).toBe(true);
      expect(r1.main, sql).toBe(`SELECT * FROM (\n${sql}\n) AS _limited_subquery LIMIT 50`);
      expect(mainOf(sql, 3), sql).toBe(`SELECT * FROM (\n${sql}\n) AS _limited_subquery LIMIT 50 OFFSET 100`);
    }
  });

  it('собственный LIMIT у TABLE/VALUES — страница 1 без изменений', () => {
    expect(buildPagedSql('TABLE t LIMIT 5', P(1)).main).toBe('TABLE t LIMIT 5');
    expect(mainOf('VALUES (1), (2) LIMIT 1', 2)).toBe('SELECT * FROM (\nVALUES (1), (2) LIMIT 1\n) AS _limited_subquery LIMIT 50 OFFSET 50');
  });

  it('в скрипте TABLE последним оператором листается, подготовка не повторяется', () => {
    const sql = 'CREATE TABLE t AS SELECT 1 x;\nTABLE t';
    expect(buildPagedSql(sql, P(1)).main).toBe('CREATE TABLE t AS SELECT 1 x;\nSELECT * FROM (\nTABLE t\n) AS _limited_subquery LIMIT 50');
    expect(mainOf(sql, 2)).toBe('SELECT * FROM (\nTABLE t\n) AS _limited_subquery LIMIT 50 OFFSET 50');
  });

  it('для ClickHouse и для CREATE TABLE/VALUES внутри других операторов ничего не меняется', () => {
    for (const sql of ['TABLE t', 'VALUES (1)', 'PIVOT t ON g USING sum(x)']) {
      const r = buildPagedSql(sql, P(1, { dialect: 'clickhouse' }));
      expect(r.pageable, sql).toBe(false);
      expect(r.main, sql).toBe(sql);
    }
    for (const sql of ['CREATE TABLE t AS SELECT 1', 'INSERT INTO t VALUES (1)', 'DROP TABLE t', 'TABLESAMPLE', 'PIVOTED x']) {
      expect(buildPagedSql(sql, P(1)).pageable, sql).toBe(false);
    }
  });
});

describe('согласованность с признаком FORMAT из clickhouseFormat', () => {
  const samples = [
    'SELECT * FROM t FORMAT JSON',
    'SELECT * FROM t FORMAT CSV;',
    'SELECT 1 FORMAT TSV SETTINGS a = 1',
    'SELECT format FROM t',
    'SELECT * FROM t ORDER BY format DESC',
    "SELECT 'FORMAT JSON' AS x",
    'SELECT 1 -- FORMAT JSON',
  ];
  it('FORMAT остаётся последним, LIMIT ставится перед ним; без FORMAT хвоста нет', () => {
    for (const sql of samples) {
      const main = mainOf(sql, 1, { dialect: 'clickhouse' });
      if (hasFormatClause(sql)) {
        expect(main).toMatch(/\nLIMIT 50\n(SETTINGS [^\n]* )?FORMAT \w+|\nLIMIT 50\nFORMAT \w+( SETTINGS [^\n]*)?/);
      } else {
        expect(main).not.toMatch(/\n(FORMAT|SETTINGS) /);
      }
    }
  });
});

