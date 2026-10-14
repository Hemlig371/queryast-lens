// Копирование отрендеренного Markdown-документа в буфер обмена (например, для вставки в Word).
// Диаграммы mermaid — это SVG, а Word надёжно принимает только растровые картинки, поэтому при копировании
// каждый SVG заменяется на PNG (data:-URI). PNG готовятся заранее (после отрисовки документа), потому что
// обработчик события copy должен заполнить буфер синхронно.

export interface RasterDiagram {
  url: string;
  width: number;
  height: number;
}

const MAX_WORD_WIDTH = 620; // px; шире страницы Word картинка не нужна

/** SVG-разметка (с встроенными стилями) -> PNG data-URL на белом фоне. Возвращает null при ошибке. */
export async function rasterizeSvg(standaloneSvg: string, width: number, height: number, scale = 2): Promise<string | null> {
  try {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const ratio = Math.min(scale, 4000 / Math.max(w, h));
    const blobUrl = URL.createObjectURL(new Blob([standaloneSvg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg image load failed'));
        img.src = blobUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    return null;
  }
}

const TABLE_CELL_STYLE = 'border:1px solid #999999;padding:4px 8px;';

/**
 * HTML для буфера из выделенного фрагмента: без элементов интерфейса, без тёмной темы (стили убраны, нужные
 * заданы заново inline), диаграммы — картинками. Возвращает null, если для какой-то диаграммы PNG ещё не готов
 * (тогда остаётся обычное копирование браузера).
 */
export function buildClipboardHtml(range: Range, diagrams: Map<number, RasterDiagram>): { html: string; text: string } | null {
  const holder = document.createElement('div');
  holder.appendChild(range.cloneContents());

  holder.querySelectorAll('[data-md-ui], .md-code-bar').forEach(el => el.remove());

  let incomplete = false;
  holder.querySelectorAll('svg').forEach(svg => {
    const fig = svg.closest('figure[data-mermaid-index]');
    const d = fig ? diagrams.get(Number(fig.getAttribute('data-mermaid-index'))) : undefined;
    if (!d) {
      incomplete = true;
      return;
    }
    const k = Math.min(1, MAX_WORD_WIDTH / d.width);
    const img = document.createElement('img');
    img.src = d.url;
    img.alt = 'diagram';
    img.width = Math.round(d.width * k);
    img.height = Math.round(d.height * k);
    svg.replaceWith(img);
  });
  if (incomplete) return null;

  // цвета и классы тёмной/светлой темы в Word не нужны
  holder.querySelectorAll<HTMLElement>('*').forEach(el => {
    el.removeAttribute('class');
    el.removeAttribute('style');
    el.removeAttribute('data-lang');
    el.removeAttribute('data-md-mermaid-slot');
  });
  holder.querySelectorAll('table').forEach(el => el.setAttribute('style', 'border-collapse:collapse;'));
  holder.querySelectorAll('td').forEach(el => el.setAttribute('style', TABLE_CELL_STYLE));
  holder.querySelectorAll('th').forEach(el => el.setAttribute('style', TABLE_CELL_STYLE + 'background:#eeeeee;'));
  holder.querySelectorAll('pre').forEach(el =>
    el.setAttribute('style', 'font-family:Consolas,"Courier New",monospace;background:#f5f5f5;padding:8px;white-space:pre-wrap;'));
  holder.querySelectorAll('code').forEach(el => {
    if (!el.closest('pre')) el.setAttribute('style', 'font-family:Consolas,"Courier New",monospace;background:#f5f5f5;');
  });
  holder.querySelectorAll('blockquote').forEach(el =>
    el.setAttribute('style', 'border-left:3px solid #999999;margin-left:0;padding-left:10px;color:#555555;'));

  // обычный текст: innerText даёт переводы строк между блоками и табы между ячейками, но только у элемента в документе
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-100000px;top:0;width:900px;white-space:normal;';
  probe.innerHTML = holder.innerHTML;
  document.body.appendChild(probe);
  const text = probe.innerText;
  probe.remove();

  return { html: `<meta charset="utf-8">${holder.innerHTML}`, text };
}
