import React, { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { renderMarkdown } from '../utils/markdown';
import { renderMermaidBlock, mermaidSvgCss, svgToStandalone } from '../utils/mermaidSvg';
import { rasterizeSvg, buildClipboardHtml, type RasterDiagram } from '../utils/documentClipboard';
import { highlightSqlHtml } from '../utils/sqlHighlight';
import { exportDocumentImage, type DocumentImageFormat } from '../utils/documentExport';

// Отрендеренный Markdown-документ в панели графа (вместо графа). Только документ: без шапки и кнопок,
// текст выделяется и копируется. Ни таймеров, ни подписок: все вычисления — в useMemo от исходного текста.

const SQL_LANGS = new Set(['sql', 'duckdb', 'clickhouse', 'postgres', 'postgresql', 'mysql', 'sqlite', 'pgsql']);

/** Методы, доступные родителю через ref (экспорт документа из общего меню «Экспорт»). */
export interface MarkdownPreviewHandle {
  exportImage: (format: DocumentImageFormat) => Promise<void>;
}

interface Props {
  ref?: React.Ref<MarkdownPreviewHandle>;
  source: string;
  theme: 'dark' | 'light';
  /** «Открыть как граф»: код mermaid-блока уходит в интерактивный граф */
  onOpenMermaid: (code: string) => void;
}

const SLOT_RE = /<div data-md-mermaid-slot="(\d+)"><\/div>/g;

export default function MarkdownPreview({ ref, source, theme, onOpenMermaid }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  // PNG-версии диаграмм для копирования в Word (см. documentClipboard.ts)
  const diagramsRef = useRef(new Map<number, RasterDiagram>());

  const rendered = useMemo(() => {
    const res = renderMarkdown(source, {
      // mermaid-блок — заглушка: готовый SVG подставляем уже после санитайзера (он собран из экранированного текста)
      renderMermaid: (_code, index) => `<div data-md-mermaid-slot="${index}"></div>`,
      highlightCode: (code, lang) => (SQL_LANGS.has(lang) ? highlightSqlHtml(code, theme) : null),
    });
    const clean = DOMPurify.sanitize(res.html, {
      ADD_ATTR: ['target'],
      FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'object', 'embed'],
    });
    const blocks = res.mermaidBlocks.map((code, i) => renderMermaidBlock(code, i));
    return { html: clean.replace(SLOT_RE, (_m, i) => blocks[Number(i)] ?? ''), mermaidBlocks: res.mermaidBlocks };
  }, [source, theme]);

  // Экспорт рисует документ заново в скрытом контейнере и от размера окна/прокрутки не зависит
  useImperativeHandle(ref, () => ({ exportImage: (format) => exportDocumentImage(rendered.html, theme, format) }), [rendered, theme]);

  // После отрисовки один раз готовим PNG диаграмм (светлая палитра на белом: для Word). Без таймеров и подписок.
  useEffect(() => {
    let cancelled = false;
    const store = diagramsRef.current;
    store.clear();
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<SVGSVGElement>('figure[data-mermaid-index] svg').forEach(svg => {
      const index = Number(svg.closest('figure')?.getAttribute('data-mermaid-index'));
      const width = Number(svg.getAttribute('width')) || svg.viewBox.baseVal.width;
      const height = Number(svg.getAttribute('height')) || svg.viewBox.baseVal.height;
      const markup = svgToStandalone(svg.outerHTML, 'light').replace('font-family="inherit"', 'font-family="Segoe UI, Arial, sans-serif"');
      rasterizeSvg(markup, width, height).then(url => {
        if (url && !cancelled) store.set(index, { url, width, height });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [rendered]);

  // Копирование выделенного: без кнопок, диаграммы — картинками, светлое оформление (вставка в Word)
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    const root = rootRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const payload = buildClipboardHtml(range, diagramsRef.current);
    if (payload === null) return; // PNG ещё не готов — обычное копирование браузера
    e.clipboardData.setData('text/html', payload.html);
    e.clipboardData.setData('text/plain', payload.text);
    e.preventDefault();
  };

  // «Открыть как граф» и якоря внутри документа (#md-…)
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const root = rootRef.current;
    if (!target || !root) return;
    const btn = target.closest('[data-md-action="open-graph"]');
    if (btn) {
      const code = rendered.mermaidBlocks[Number(btn.getAttribute('data-md-index'))];
      if (code !== undefined) onOpenMermaid(code);
      e.preventDefault();
      return;
    }
    const anchor = target.closest('a');
    const href = anchor?.getAttribute('href');
    if (anchor && href && href.startsWith('#md-')) {
      e.preventDefault();
      const el = Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(n => n.id === href.slice(1));
      el?.scrollIntoView({ block: 'start' });
    }
  };

  return (
    <div
      ref={rootRef}
      className={`absolute inset-0 overflow-auto select-text md-root ${theme === 'dark' ? 'md-dark bg-slate-900 text-slate-200' : 'md-light bg-white text-slate-800'}`}
      onClick={handleClick}
      onCopy={handleCopy}
      // HTML собран из экранированного текста и прошёл DOMPurify; SVG диаграмм подставлен после (собран из экранированного текста)
    >
      <style>{mermaidSvgCss(theme)}</style>
      <div className="md-preview" dangerouslySetInnerHTML={{ __html: rendered.html }} />
    </div>
  );
}
