import { describe, it, expect } from 'vitest';
import { compactSql, convertInlineDashComments, formatSqlText } from '../src/utils/sqlFormat';

describe('sqlFormat', () => {
  it('convertInlineDashComments превращает хвостовой -- в /* */', () => {
    expect(convertInlineDashComments('SELECT 1 -- one')).toBe('SELECT 1 /* one */');
  });

  it('не трогает -- внутри строки и отдельные комментарии', () => {
    expect(convertInlineDashComments("SELECT '--x'")).toBe("SELECT '--x'");
    expect(convertInlineDashComments('-- full line')).toBe('-- full line');
  });

  it('compactSql схлопывает код в одну строку и сохраняет отдельные комментарии', () => {
    const out = compactSql('-- head\nSELECT a,\n  b\nFROM t');
    expect(out).toBe('-- head\nSELECT a, b FROM t');
  });

  // ---- compactSql и -- комментарии ----
  describe('compactSql: характеризующие', () => {
    it('пустой ввод возвращается как есть', () => {
      expect(compactSql('')).toBe('');
    });

    it('хвостовые -- комментарии в середине запроса превращаются в /* */ (в том числе до FROM)', () => {
      expect(compactSql('SELECT a, -- c1\n  b -- c2\nFROM t -- end')).toBe('SELECT a, /* c1 */ b /* c2 */ FROM t /* end */');
    });

    it('отдельная строка-комментарий остаётся на своей строке между кусками кода', () => {
      expect(compactSql('SELECT a,\n-- note\n b\nFROM t')).toBe('SELECT a,\n-- note\nb FROM t');
    });

    it('пустые строки склеиваются; между комментариями пустых строк нет', () => {
      expect(compactSql('SELECT 1\n\n\nFROM t\n')).toBe('SELECT 1 FROM t');
      expect(compactSql('-- a\n\n-- b\nSELECT 1')).toBe('-- a\n-- b\nSELECT 1');
    });

    it('однострочный блочный комментарий и -- внутри строки не меняются', () => {
      expect(compactSql('SELECT /* hi */ 1')).toBe('SELECT /* hi */ 1');
      expect(compactSql("SELECT 'a--b' AS x\nFROM t")).toBe("SELECT 'a--b' AS x FROM t");
    });

    it('CRLF и завершающий комментарий после ;', () => {
      expect(compactSql('SELECT a,\r\n b\r\nFROM t')).toBe('SELECT a, b FROM t');
      expect(compactSql('-- a\r\nSELECT 1')).toBe('-- a\nSELECT 1');
      expect(compactSql('SELECT 1;\n-- done')).toBe('SELECT 1;\n-- done');
    });

    it('*/ внутри хвостового -- комментария не закрывает блок раньше времени', () => {
      expect(compactSql('SELECT a -- done */ x\nFROM t')).toBe('SELECT a /* done * / x */ FROM t');
    });
  });

  describe('compactSql: новое поведение (3.6)', () => {
    it("SELECT 'a  b' остаётся в одну строку и не меняет содержимое строки", () => {
      expect(compactSql("SELECT 'a  b' AS x")).toBe("SELECT 'a  b' AS x");
    });

    it('идентификаторы в двойных кавычках и удвоенные кавычки сохраняются', () => {
      expect(compactSql('SELECT "a  b" FROM t')).toBe('SELECT "a  b" FROM t');
      expect(compactSql("SELECT 'it''s  ok'")).toBe("SELECT 'it''s  ok'");
    });

    it('многострочная строка не схлопывается, а строка с -- внутри не становится комментарием', () => {
      expect(compactSql("SELECT 'line1\n   line2' FROM t")).toBe("SELECT 'line1\n   line2' FROM t");
      expect(compactSql("SELECT 'x\n   -- y  z' FROM t")).toBe("SELECT 'x\n   -- y  z' FROM t");
    });

    it('многострочный блочный комментарий сохраняется как есть, -- в нём не трогается', () => {
      expect(compactSql('SELECT 1 /* a\n   b */ FROM t')).toBe('SELECT 1 /* a\n   b */ FROM t');
      expect(compactSql('SELECT 1 /* a\n -- b */ FROM t')).toBe('SELECT 1 /* a\n -- b */ FROM t');
    });

    it('-- после блочного комментария на той же строке не съедает следующую строку кода', () => {
      expect(compactSql('/* a */ -- b\nSELECT 1')).toBe('/* a */ /* b */ SELECT 1');
    });

    it('повторное сжатие ничего не меняет', () => {
      const src = "-- head\nSELECT a, -- c1\n  'x  y' AS b /* m\n n */\nFROM t\n-- tail";
      const once = compactSql(src);
      expect(compactSql(once)).toBe(once);
    });
  });

  describe('convertInlineDashComments: строки и блочные комментарии на нескольких строках', () => {
    it('-- на второй строке многострочной строки не считается комментарием', () => {
      expect(convertInlineDashComments("SELECT 'x\ny -- z' FROM t")).toBe("SELECT 'x\ny -- z' FROM t");
    });

    it('-- внутри многострочного блочного комментария не трогается', () => {
      expect(convertInlineDashComments('/* a\n b -- c */ SELECT 1')).toBe('/* a\n b -- c */ SELECT 1');
    });

    it('-- после блочного комментария на той же строке становится блочным', () => {
      expect(convertInlineDashComments('/* x */ -- y')).toBe('/* x */ /* y */');
    });
  });
});

// ---- форматтер и «в одну строку» не меняют содержимое литералов ----
describe('литералы и //', () => {
  const cfg = { keywordCase: 'upper' as const, tabWidth: 2, useTabs: false, expressionWidth: 120, denseOperators: false, leadingCommas: false };
  const fmt = (sql: string, dialect = 'DuckDB') => formatSqlText(sql, dialect, cfg);

  it('многострочный литерал: пустые строки и отступы внутри сохраняются', async () => {
    const out = await fmt("select a, 'x\n\n   y\n\n\n  z' as s from t where b = 1");
    expect(out).toContain("'x\n\n   y\n\n\n  z'");
    expect(out).toBe("SELECT a, 'x\n\n   y\n\n\n  z' AS s\nFROM t\nWHERE b = 1");
  });

  it('CRLF внутри литерала сохраняется', async () => {
    expect(await fmt("select 'a\r\n\r\nb' as s from t")).toContain("'a\r\n\r\nb'");
  });

  it('$$…$$ и $тег$…$тег$: апострофы, --, ; и пустые строки внутри не меняются', async () => {
    const body = "line 1\n\n  it's -- not a comment; ok";
    const out = await fmt(`select $$${body}$$ as a, $t$ $$ ${body} $t$ as b from x`);
    expect(out).toContain(`$$${body}$$`);
    expect(out).toContain(`$t$ $$ ${body} $t$`);
    expect(out).toMatch(/^SELECT /);
    expect(out).toMatch(/\nFROM x$/);
  });

  it('// остаётся целочисленным делением, а не превращается в / /', async () => {
    expect(await fmt('select 7 // 2 as a, 9//4 as b')).toBe('SELECT 7 // 2 AS a, 9 // 4 AS b');
  });

  it('// внутри строки, идентификатора и комментария не трогается', async () => {
    const out = await fmt("select '//' as a, \"c//d\" from t /* x // y */");
    expect(out).toContain("'//'");
    expect(out).toContain('"c//d"');
    expect(out).toContain('/* x // y */');
  });

  it('строки с ; и -- внутри и удвоенные кавычки возвращаются как были', async () => {
    const out = await fmt("select 'a;b' as x, '--not comment' as y, 'it''s' as z from t; select 2");
    expect(out).toContain("'a;b'");
    expect(out).toContain("'--not comment'");
    expect(out).toContain("'it''s'");
    expect(out).toContain('SELECT 2');
  });

  it('текст пользователя, похожий на плейсхолдер, не портится', async () => {
    const out = await fmt("select __qs0__, 'lit' as y from __qs1__");
    expect(out).toBe("SELECT __qs0__, 'lit' AS y\nFROM __qs1__");
  });

  it('незакрытая строка по-прежнему даёт ошибку форматирования', async () => {
    await expect(fmt("select 'abc from t")).rejects.toThrow();
  });

  it('форматирование без литералов не изменилось', async () => {
    expect(await fmt('select a,b from t where x=1 and y=2 order by a desc')).toBe(
      'SELECT a, b\nFROM t\nWHERE x = 1\n  AND y = 2\nORDER BY a DESC'
    );
  });

  it('compactSql: $$-блок с переводами строк, апострофом и -- внутри остаётся как есть, код вокруг схлопывается', () => {
    const body = "line1\n\n   it's -- keep ; me";
    expect(compactSql(`select a,\n   b from t where x = $$${body}$$ and y = 1`)).toBe(`select a, b from t where x = $$${body}$$ and y = 1`);
  });
});

