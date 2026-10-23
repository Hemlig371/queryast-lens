import { describe, it, expect } from 'vitest';
import { protectLiterals, dollarQuoteEnd } from '../src/utils/sqlLiterals';

// F-26: литералы прячутся от форматтера и возвращаются точным исходным текстом.

describe('dollarQuoteEnd', () => {
  it('$$…$$ и $тег$…$тег$: позиция после закрывающей границы', () => {
    expect(dollarQuoteEnd('$$ab$$ x', 0)).toBe(6);
    expect(dollarQuoteEnd('x = $tag$a$$b$tag$', 4)).toBe(18);
  });
  it('не строка: параметры, часть идентификатора, не закрытый блок', () => {
    expect(dollarQuoteEnd('$1 + $2', 0)).toBe(-1);
    expect(dollarQuoteEnd('$name', 0)).toBe(-1);
    expect(dollarQuoteEnd('a$$b$$', 1)).toBe(-1);
    expect(dollarQuoteEnd('$$ без конца', 0)).toBe(-1);
    expect(dollarQuoteEnd('abc', 0)).toBe(-1);
  });
});

describe('protectLiterals', () => {
  const roundTrip = (sql: string, opts = {}) => {
    const p = protectLiterals(sql, opts);
    return p.restore(p.text);
  };

  it('строки в апострофах заменяются плейсхолдерами и возвращаются без изменений', () => {
    const sql = "SELECT 'a', 'it''s', 'x\n\n  y' FROM t";
    const p = protectLiterals(sql);
    expect(p.text).not.toContain('it');
    expect(p.text.split("'").length - 1).toBe(6);
    expect(p.restore(p.text)).toBe(sql);
  });

  it('однострочный плейсхолдер не короче литерала (ширина для форматтера сохраняется), многострочный — короткий', () => {
    const long = "'" + 'x'.repeat(60) + "'";
    expect(protectLiterals(`SELECT ${long}`).text).toHaveLength(`SELECT ${long}`.length);
    const multi = "'" + 'line\n'.repeat(40) + "'";
    expect(protectLiterals(multi).text.length).toBeLessThan(20);
  });

  it('$$…$$ и $тег$…$тег$ прячутся целиком, вместе с апострофами, -- и ; внутри', () => {
    const sql = "SELECT $$it's -- not a comment; \n\n ok$$, $t$ $$ inner $$ $t$ FROM x";
    const p = protectLiterals(sql);
    expect(p.text).toBe("SELECT '" + p.text.split("'")[1] + "', '" + p.text.split("'")[3] + "' FROM x");
    expect(p.restore(p.text)).toBe(sql);
  });

  it('комментарии и идентификаторы в кавычках не трогаются и не сбивают разбор', () => {
    const sql = "SELECT \"a'b\", `c'd` -- it's\n, 'z' /* don't */ FROM t";
    const p = protectLiterals(sql);
    expect(p.text).toContain("\"a'b\"");
    expect(p.text).toContain('`c\'d`');
    expect(p.text).toContain("-- it's");
    expect(p.text).toContain("/* don't */");
    expect(p.text).not.toContain("'z'");
    expect(p.restore(p.text)).toBe(sql);
  });

  it('обратная косая черта: экранирует только при backslashEscapes или после E', () => {
    const win = "SELECT 'C:\\data\\', 'x' FROM t";
    expect(protectLiterals(win, { backslashEscapes: false }).text).not.toContain('data');
    expect(roundTrip(win)).toBe(win);
    const esc = "SELECT 'it\\'s' FROM t";
    expect(protectLiterals(esc, { backslashEscapes: true }).text).not.toContain('it');
    const e = "SELECT E'it\\'s', 1 FROM t";
    expect(protectLiterals(e).text).toBe("SELECT E'" + protectLiterals(e).text.split("'")[1] + "', 1 FROM t");
    expect(roundTrip(e)).toBe(e);
  });

  it('незакрытая строка остаётся как есть (форматтер сообщит об ошибке, как раньше)', () => {
    expect(protectLiterals("SELECT 'abc FROM t").text).toBe("SELECT 'abc FROM t");
    expect(protectLiterals('SELECT $$abc FROM t').text).toBe('SELECT $$abc FROM t');
  });

  it('protectDivision: // вне строк и комментариев заменяется, внутри — нет; обратно становится //', () => {
    const sql = "SELECT 7 // 2, 9//4, '//' -- a // b\n, \"c//d\" /* e // f */";
    const p = protectLiterals(sql, { protectDivision: true });
    expect(p.text.match(/__qdiv__/g)?.length).toBe(2);
    expect(p.text).toContain('-- a // b');
    expect(p.text).toContain('"c//d"');
    expect(p.text).toContain('/* e // f */');
    expect(p.restore(p.text.replace(/\s+__qdiv__\s+/g, ' __qdiv__ '))).toContain('7 // 2, 9 // 4');
    expect(roundTrip('SELECT 7 // 2', { protectDivision: true })).toBe('SELECT 7  //  2');
  });

  it('dollarOnly: строки в апострофах остаются на месте, а $$ внутри них не принимается за блок', () => {
    const sql = "SELECT 'a $$ b', $$x$$ FROM t";
    const p = protectLiterals(sql, { dollarOnly: true });
    expect(p.text.startsWith("SELECT 'a $$ b', '")).toBe(true);
    expect(p.restore(p.text)).toBe(sql);
  });

  it('плейсхолдер не совпадает с текстом пользователя', () => {
    const sql = "SELECT __qs0__, '__qs0__', 'a' FROM __qs1__ -- '__qs0__x__'";
    const p = protectLiterals(sql);
    expect(p.restore(p.text)).toBe(sql);
    const sqlDiv = 'SELECT __qdiv__, 7 // 2';
    const pd = protectLiterals(sqlDiv, { protectDivision: true });
    expect(pd.restore(pd.text)).toBe('SELECT __qdiv__, 7  //  2');
  });

  it('спецпоследовательности $& и $1 в литерале при возврате не раскрываются', () => {
    const sql = "SELECT '$& $1 $$ $`', 2";
    expect(roundTrip(sql)).toBe(sql);
  });
});
