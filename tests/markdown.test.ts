import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderInline, safeUrl, escapeHtml } from '../src/utils/markdown';

const md = (s: string) => renderMarkdown(s).html;

describe('markdown: блоки', () => {
  it('заголовки ATX и setext, якоря', () => {
    expect(md('# Привет мир')).toBe('<h1 id="md-привет-мир">Привет мир</h1>');
    expect(md('## A ##')).toBe('<h2 id="md-a">A</h2>');
    expect(md('Заголовок\n====')).toBe('<h1 id="md-заголовок">Заголовок</h1>');
    expect(md('Заголовок\n----')).toBe('<h2 id="md-заголовок">Заголовок</h2>');
    expect(md('# A\n# A')).toContain('id="md-a-1"');
  });
  it('абзацы и переносы строк', () => {
    expect(md('a\nb\n\nc')).toBe('<p>a\nb</p><p>c</p>');
    expect(md('a  \nb')).toBe('<p>a<br>\nb</p>');
    expect(md('a\\\nb')).toBe('<p>a<br>\nb</p>');
  });
  it('горизонтальная линия', () => {
    expect(md('---')).toBe('<hr>');
    expect(md('a\n\n***\n\nb')).toBe('<p>a</p><hr><p>b</p>');
  });
  it('цитаты, в том числе вложенные', () => {
    expect(md('> a\n> b')).toBe('<blockquote><p>a\nb</p></blockquote>');
    expect(md('> a\n>> b')).toContain('<blockquote><p>a</p><blockquote><p>b</p></blockquote></blockquote>');
  });
  it('блоки кода: ``` и ~~~, язык, экранирование', () => {
    const r = renderMarkdown('```sql\nSELECT * FROM t WHERE a < 1;\n```');
    expect(r.codeBlocks).toEqual(['SELECT * FROM t WHERE a < 1;']);
    expect(r.html).toContain('data-lang="sql"');
    expect(r.html).toContain('a &lt; 1');
    expect(r.html).not.toContain('<button');
    expect(renderMarkdown('~~~\n<b>x</b>\n~~~').html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
  it('незакрытый блок кода идёт до конца текста', () => {
    expect(renderMarkdown('```\na\nb').codeBlocks).toEqual(['a\nb']);
  });
  it('внутри кода разметка не разбирается', () => {
    expect(renderMarkdown('```\n# не заголовок **не жирный**\n```').html).not.toContain('<h1');
  });
  it('highlightCode подставляет подсвеченный HTML', () => {
    const r = renderMarkdown('```sql\nSELECT 1\n```', { highlightCode: (c, l) => `<i>${l}:${c}</i>` });
    expect(r.html).toContain('<i>sql:SELECT 1</i>');
  });
  it('mermaid-блоки собираются и отдаются в renderMermaid', () => {
    const r = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```\n\n```mermaid\ngraph LR\nC-->D\n```', {
      renderMermaid: (code, i) => `<figure data-i="${i}"></figure>`,
    });
    expect(r.mermaidBlocks).toHaveLength(2);
    expect(r.html).toBe('<figure data-i="0"></figure><figure data-i="1"></figure>');
    // без renderMermaid блок показывается как обычный код
    expect(renderMarkdown('```mermaid\nA-->B\n```').html).toContain('md-code');
  });
});

describe('markdown: списки', () => {
  it('маркированный и нумерованный', () => {
    expect(md('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(md('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
    expect(md('3. a\n4. b')).toContain('<ol start="3">');
  });
  it('вложенные', () => {
    expect(md('- a\n  - b\n  - c\n- d')).toBe('<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
  });
  it('рыхлый список даёт <p>', () => {
    expect(md('- a\n\n- b')).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
  });
  it('чекбоксы', () => {
    const h = md('- [ ] a\n- [x] b');
    expect(h).toContain('☐');
    expect(h).toContain('☑');
    expect(h).not.toContain('<input');
  });
  it('код внутри пункта', () => {
    expect(renderMarkdown('- шаг\n\n  ```sql\n  SELECT 1\n  ```').codeBlocks).toEqual(['SELECT 1']);
  });
  it('смена маркера начинает новый список; `---` — не пункт', () => {
    expect(md('- a\n* b')).toBe('<ul><li>a</li></ul><ul><li>b</li></ul>');
    expect(md('- a\n\n---')).toContain('<hr>');
  });
});

describe('markdown: таблицы', () => {
  it('GFM таблица с выравниванием и экранированным |', () => {
    const h = md('| A | B | C |\n|:--|:-:|--:|\n| 1 | `x\\|y` | 3 |\n| 4 | 5 |');
    expect(h).toContain('<th style="text-align:left">A</th>');
    expect(h).toContain('<th style="text-align:center">B</th>');
    expect(h).toContain('<th style="text-align:right">C</th>');
    expect(h).toContain('<code>x|y</code>');
    // короткая строка добивается пустыми ячейками
    expect(h).toContain('<td style="text-align:right"></td>');
  });
  it('строка с | без разделителя — обычный абзац', () => {
    expect(md('a | b')).toBe('<p>a | b</p>');
  });
});

describe('markdown: инлайн', () => {
  it('жирный, курсив, зачёркнутый, код', () => {
    expect(renderInline('**a** *b* _c_ ~~d~~ `e`')).toBe('<strong>a</strong> <em>b</em> <em>c</em> <del>d</del> <code>e</code>');
    expect(renderInline('***a***')).toBe('<em><strong>a</strong></em>');
    expect(renderInline('**жирный *и курсив***')).toBe('<strong>жирный <em>и курсив</em></strong>');
  });
  it('snake_case и умножение не превращаются в курсив', () => {
    expect(renderInline('my_table_name и a * b * c')).toBe('my_table_name и a * b * c');
    expect(renderInline('2 * 3 = 6')).toBe('2 * 3 = 6');
  });
  it('код не парсится, `` позволяет вставить обратный апостроф', () => {
    expect(renderInline('`**a**`')).toBe('<code>**a**</code>');
    expect(renderInline('`` a`b ``')).toBe('<code>a`b</code>');
  });
  it('экранирование \\* и литерал *', () => {
    expect(renderInline('\\*a\\*')).toBe('*a*');
  });
  it('ссылки, якоря, картинки, автоссылки', () => {
    expect(renderInline('[t](https://x.y "ti")')).toBe('<a href="https://x.y" target="_blank" rel="noopener noreferrer" title="ti">t</a>');
    expect(renderInline('[к](#Мой Раздел)')).toContain('href="#md-мой-раздел"');
    expect(renderInline('![a](https://x.y/i.png)')).toBe('<img src="https://x.y/i.png" alt="a" loading="lazy">');
    expect(renderInline('<https://x.y>')).toContain('href="https://x.y"');
    expect(renderInline('см. https://x.y/z?a=1&b=2.')).toContain('href="https://x.y/z?a=1&amp;b=2"');
    expect(renderInline('[a [b] c](https://x.y)')).toContain('>a [b] c</a>');
  });
  it('некорректный % в якоре не роняет рендер', () => {
    expect(renderInline('[a](#100%)')).toContain('href="#md-100"');
    expect(renderInline('[a](#%E0%A4%A)')).toContain('<a href="#md-');
  });
  it('опасные схемы отбрасываются', () => {
    expect(renderInline('[x](javascript:alert(1))')).toBe('x');
    expect(renderInline('[x](JaVaScRiPt:alert(1))')).toBe('x');
    expect(renderInline('[x](vbscript:1)')).toBe('x');
    expect(renderInline('![x](javascript:1)')).toBe('x');
    expect(renderInline('![x](data:text/html;base64,AAAA)')).toBe('x');
    expect(safeUrl('data:image/png;base64,iVBOR', true)).not.toBeNull();
    expect(safeUrl('data:image/png;base64,iVBOR', false)).toBeNull();
    expect(safeUrl('mailto:a@b.c')).not.toBeNull();
    expect(safeUrl('docs/readme.md')).toBe('docs/readme.md');
  });
  it('HTML экранируется, простые теги без атрибутов разрешены', () => {
    expect(renderInline('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(renderInline('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(renderInline('a<br>b <kbd>Ctrl</kbd>')).toBe('a<br>b <kbd>Ctrl</kbd>');
    expect(renderInline('<b onclick="x()">t</b>')).toContain('&lt;b onclick');
    expect(renderInline('a & b "q"')).toBe('a &amp; b &quot;q&quot;');
  });
  it('escapeHtml', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('markdown: документ', () => {
  it('YAML front matter скрывается', () => {
    expect(md('---\ntitle: x\n---\n# H')).toBe('<h1 id="md-h">H</h1>');
  });
  it('пустой текст и CRLF', () => {
    expect(md('')).toBe('');
    expect(md('# a\r\n\r\ntext')).toBe('<h1 id="md-a">a</h1><p>text</p>');
  });
  it('смешанный документ', () => {
    const r = renderMarkdown('# Отчёт\n\nТекст с `кодом`.\n\n```sql\nSELECT 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n- y');
    expect(r.html).toContain('<h1');
    expect(r.html).toContain('<table>');
    expect(r.html).toContain('<ul>');
    expect(r.codeBlocks).toEqual(['SELECT 1']);
  });
  it('патологический ввод обрабатывается быстро', () => {
    const t0 = Date.now();
    renderMarkdown('*'.repeat(20000));
    renderMarkdown('['.repeat(5000) + '](' + ')'.repeat(5000));
    renderMarkdown('`'.repeat(10000));
    renderMarkdown('_a '.repeat(5000));
    renderMarkdown('- a\n'.repeat(5000));
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});
