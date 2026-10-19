import { describe, it, expect } from 'vitest';
import { splitSqlSegments, maskSql } from '../src/utils/sqlTokens';

const SAMPLES = [
  '',
  'SELECT 1',
  "SELECT 'a--b', \"c/*d*/\", `e;f` -- tail\nFROM t",
  "SELECT 'it''s' /* a\n -- b */ ;",
  "SELECT 'unterminated",
  '/* unterminated block',
  "SELECT 'a\\'b' -- x",
  '-- only comment',
  'SELECT 1 -- c\r\nFROM t\r\n',
];

describe('splitSqlSegments', () => {
  it('сегменты без потерь склеиваются в исходный текст', () => {
    for (const s of SAMPLES) {
      expect(splitSqlSegments(s).map((x) => x.text).join('')).toBe(s);
    }
  });

  it('различает код, строки, строчные и блочные комментарии', () => {
    const segs = splitSqlSegments("SELECT 'a--b' -- c\n/* d */ x");
    expect(segs.map((x) => x.type)).toEqual(['code', 'string', 'code', 'line-comment', 'code', 'block-comment', 'code']);
    expect(segs[1].text).toBe("'a--b'");
    expect(segs[3].text).toBe('-- c'); // перевод строки остаётся в code
  });

  it('удвоенная кавычка не закрывает строку', () => {
    const segs = splitSqlSegments("'it''s' x");
    expect(segs[0]).toEqual({ type: 'string', text: "'it''s'" });
  });

  it('обратная косая черта экранирует кавычку по умолчанию и не экранирует при backslashEscapes: false', () => {
    const a = splitSqlSegments("'a\\' b' c");
    expect(a[0].text).toBe("'a\\' b'");
    const b = splitSqlSegments("'C:\\data\\' c", { backslashEscapes: false });
    expect(b[0].text).toBe("'C:\\data\\'");
    expect(b[1].text).toBe(' c');
  });

  it('незакрытая строка и незакрытый блочный комментарий идут до конца текста', () => {
    expect(splitSqlSegments("SELECT 'abc")[1]).toEqual({ type: 'string', text: "'abc" });
    expect(splitSqlSegments('x /* abc')[1]).toEqual({ type: 'block-comment', text: '/* abc' });
  });

  it('-- внутри строки и /* внутри -- комментария не начинают комментарий', () => {
    const segs = splitSqlSegments("-- a /* b\nSELECT '/* c'");
    expect(segs.map((x) => x.type)).toEqual(['line-comment', 'code', 'string']);
  });
});

describe('maskSql', () => {
  it('длина сохраняется, комментарии и строки заменяются пробелами, переводы строк остаются', () => {
    for (const s of SAMPLES) {
      expect(maskSql(s).length).toBe(s.length);
    }
    const m = maskSql("SELECT 'a;b' -- x\n/* y\nz */ FROM t");
    expect(m).not.toContain(';');
    expect(m).not.toContain('x');
    expect(m.split('\n').length).toBe(3);
    expect(m.replace(/\s+/g, ' ')).toBe('SELECT FROM t');
  });
});
