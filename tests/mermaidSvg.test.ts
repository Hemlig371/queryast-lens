import { describe, it, expect } from 'vitest';
import { mermaidToSvg, renderMermaidBlock, mermaidSvgCss, svgToStandalone } from '../src/utils/mermaidSvg';

describe('mermaidSvg', () => {
  it('строит SVG для flowchart: узлы, рёбра, метки, подграф', () => {
    const r = mermaidToSvg('flowchart LR\nA[Старт] -->|да| B{Ок?}\nB -.-> C[(БД)]\nsubgraph S [Группа]\nC\nend');
    expect(r.error).toBeUndefined();
    const svg = r.svg as string;
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/class="mm-node"/g) || []).length).toBe(3);
    expect((svg.match(/class="mm-edge[ "]/g) || []).length).toBe(2);
    expect(svg).toContain('mm-dotted');
    expect(svg).toContain('mm-group');
    expect(svg).toContain('>да<');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('все фигуры рисуются без NaN', () => {
    const code = 'graph TD\nA[a]-->B(b)-->C([c])-->D[(d)]-->E[[e]]-->F((f))-->G(((g)))-->H{h}-->I{{i}}-->J>j]-->K[/k/]-->L[\\l\\]-->M[/m\\]-->N[\\n/]';
    const r = mermaidToSvg(code);
    expect(r.error).toBeUndefined();
    expect(r.svg).not.toMatch(/NaN|undefined|Infinity/);
    expect((r.svg!.match(/class="mm-node"/g) || []).length).toBe(14);
  });

  it('стрелки: обычная, двунаправленная, o/x рисуются головами', () => {
    const svg = mermaidToSvg('graph LR\nA --> B\nB <--> C\nC --x D\nD --o E\nE --- F').svg!;
    expect((svg.match(/class="mm-head"/g) || []).length).toBe(3); // A>B и две головы у B<->C
    expect(svg).toContain('mm-cross');
    expect(svg).toContain('mm-head-open');
  });

  it('невидимая связь ~~~ не рисуется', () => {
    const svg = mermaidToSvg('graph LR\nA ~~~ B').svg!;
    expect(svg).not.toMatch(/class="mm-edge[ "]/);
  });

  it('по умолчанию направление TB, явное LR уважается', () => {
    const w = (code: string) => {
      const m = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(mermaidToSvg(code).svg!)!;
      return { w: Number(m[1]), h: Number(m[2]) };
    };
    const tb = w('graph\nA --> B --> C');
    const lr = w('graph LR\nA --> B --> C');
    expect(tb.h).toBeGreaterThan(tb.w * 0.5);
    expect(lr.w).toBeGreaterThan(lr.h);
    expect(lr.w).toBeGreaterThan(tb.w);
  });

  it('текст подписей экранируется, теги вырезаются, <br> — перенос строки', () => {
    const svg = mermaidToSvg('graph TD\nA["<img src=x onerror=alert(1)>Привет<br/>мир & <b>друг</b>"]').svg!;
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('onerror');
    expect(svg).toContain('Привет');
    expect(svg).toContain('мир &amp;');
    expect((svg.match(/<tspan/g) || []).length).toBe(2);
  });

  it('id узла и подписи в атрибутах экранируются', () => {
    const svg = mermaidToSvg('graph TD\nA["x"] --> B\nsubgraph S ["a\\"><script>x</script>"]\nB\nend').svg || '';
    expect(svg).not.toContain('<script');
  });

  it('стили: допустимые цвета применяются, опасные значения отбрасываются', () => {
    const ok = mermaidToSvg('graph TD\nA\nstyle A fill:#ff0000,stroke:rgb(0,128,0)').svg!;
    expect(ok).toContain('fill:#ff0000');
    expect(ok).toContain('stroke:rgb(0,128,0)');
    const bad = mermaidToSvg('graph TD\nA\nstyle A fill:url(javascript:alert(1)),stroke:red"onload="x').svg!;
    expect(bad).not.toContain('url(');
    expect(bad).not.toContain('onload');
  });

  it('linkStyle применяется к ребру', () => {
    const svg = mermaidToSvg('graph TD\nA --> B\nlinkStyle 0 stroke:#f00,stroke-width:5px').svg!;
    expect(svg).toContain('stroke:#f00');
    expect(svg).toContain('stroke-width:5');
  });

  it('неподдерживаемый тип и пустая диаграмма — ошибка без SVG', () => {
    expect(mermaidToSvg('pie title X\n"a": 1').error).toContain('pie');
    expect(mermaidToSvg('graph TD').error).toBeDefined();
    expect(mermaidToSvg('graph TD\nA -->').svg).toBeUndefined();
  });

  it('предупреждения не мешают построению', () => {
    const r = mermaidToSvg('graph TD\nмусор (((\nA --> B');
    expect(r.svg).toBeDefined();
    expect(r.warnings).toHaveLength(1);
  });

  it('renderMermaidBlock: диаграмма или сообщение об ошибке с исходником', () => {
    const ok = renderMermaidBlock('graph TD\nA --> B', 3);
    expect(ok).toContain('data-mermaid-index="3"');
    expect(ok).toContain('data-md-action="open-graph" data-md-index="3"');
    expect((ok.match(/<button/g) || []).length).toBe(1);
    expect(ok).toContain('<svg');
    const warn = renderMermaidBlock('graph TD\nмусор (((\nA --> B', 0);
    expect(warn).toContain('md-mermaid-warn');
    const fail = renderMermaidBlock('graph TD\nA <b>-->', 0);
    expect(fail).toContain('md-mermaid-failed');
    expect(fail).toContain('&lt;b&gt;');
    expect(fail).not.toContain('<svg');
  });

  it('стили темы и самодостаточный SVG', () => {
    expect(mermaidSvgCss('dark')).not.toBe(mermaidSvgCss('light'));
    const standalone = svgToStandalone('<svg viewBox="0 0 1 1"><g/></svg>', 'light');
    expect(standalone.startsWith('<?xml')).toBe(true);
    expect(standalone).toContain('<style>.mm-svg');
  });
});
