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
});
