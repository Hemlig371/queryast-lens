import { describe, it, expect } from 'vitest';
import { getBaseHighlight, highlightSqlHtml } from '../src/utils/sqlHighlight';

describe('sqlHighlight (HTML-подсветка для статических представлений)', () => {
  it('подсвечивает ключевые слова, строки и числа', () => {
    const html = getBaseHighlight("SELECT 1, 'a' FROM t", 'dark');
    expect(html).toContain('text-blue-400">SELECT');
    expect(html).toContain('text-orange-300">1');
    expect(html).toContain("text-emerald-400\">'a'");
  });
  it('экранирует HTML', () => {
    expect(getBaseHighlight('a < b', 'dark')).toContain('&lt;');
  });
  it('highlightSqlHtml подсвечивает вхождения выбранного текста', () => {
    expect(highlightSqlHtml('select x from x', 'dark', 'x')).toContain('bg-amber-400/25');
  });

  it('подсвечивает переменные с кириллическими именами', () => {
    const html = getBaseHighlight('SELECT {{$дата}}', 'dark');
    expect(html).toContain('{{$дата}}');
    expect(html).toContain('<span');
  });

  it('незакрытая переменная с длинным значением не вешает подсветку', () => {
    const started = Date.now();
    const html = getBaseHighlight('{{$q=' + 'SELECT a, b, c FROM some_table WHERE x = 1 AND y = 2 '.repeat(3), 'dark');
    expect(Date.now() - started < 500).toBe(true);
    expect(html).toContain('{{$q=');
  });

  it('закрытая переменная со значением по-прежнему подсвечивается целиком', () => {
    const html = getBaseHighlight("SELECT '{{$d=2024-01-01}}'", 'dark');
    expect(html).toContain('{{$d=2024-01-01}}');
  });
});
