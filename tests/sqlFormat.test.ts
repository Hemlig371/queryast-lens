import { describe, it, expect } from 'vitest';
import { compactSql, convertInlineDashComments } from '../src/utils/sqlFormat';

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

  // ---- п. 3.6 (C-01, C-02): compactSql и -- комментарии ----
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

  describe('convertInlineDashComments: строки и блочные комментарии на нескольких строках (C-02)', () => {
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
