import { t } from './i18n';
import { mermaidSvgCss } from './mermaidSvg';
import { safePixelRatio } from './canvasLimits';
import { downloadFileWithFallback } from './exportUtils';

// Экспорт документа Markdown картинкой (PNG/JPEG) целиком.
// Не снимает экран: HTML документа заново рисуется в скрытом контейнере фиксированной ширины,
// поэтому размер окна, прокрутка и видимая область на результат не влияют.

export type DocumentImageFormat = 'png' | 'jpeg';

/** Ширина документа в пикселях (внутренние поля 24+24). */
export const DOCUMENT_EXPORT_WIDTH = 900;
/** Ниже этого масштаба текст перестаёт читаться — предлагаем экспортировать фрагмент. */
const MIN_READABLE_RATIO = 0.4;

const SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'paint-order', 'font-weight'];

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

export async function exportDocumentImage(
  html: string,
  theme: 'dark' | 'light',
  format: DocumentImageFormat
): Promise<void> {
  const bg = theme === 'dark' ? '#0f172a' : '#ffffff';
  const host = document.createElement('div');
  host.className = `md-root ${theme === 'dark' ? 'md-dark' : 'md-light'}`;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    `position:fixed;left:-100000px;top:0;width:${DOCUMENT_EXPORT_WIDTH}px;background:${bg};pointer-events:none;`;
  host.innerHTML =
    `<style>${mermaidSvgCss(theme)}` +
    `.md-export .md-table-wrap,.md-export .md-mermaid-body,.md-export .md-code pre{overflow:visible!important}</style>` +
    `<div class="md-preview md-export" style="overflow:visible">${html}</div>`;

  // кнопки интерфейса в картинку не попадают
  host.querySelectorAll('[data-md-ui]').forEach(el => el.remove());

  document.body.appendChild(host);
  try {
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    await frame();
    await frame();

    // html-to-image надёжнее переносит SVG, если стили стоят атрибутами, а не только классами
    host.querySelectorAll('svg *').forEach(el => {
      const cs = getComputedStyle(el);
      for (const p of SVG_PROPS) {
        const v = cs.getPropertyValue(p);
        if (v && v !== 'none' && v !== 'normal') el.setAttribute(p, v);
      }
    });

    // широкие таблицы/блоки кода расширяют холст, а не обрезаются
    const width = Math.max(DOCUMENT_EXPORT_WIDTH, host.scrollWidth);
    host.style.width = `${width}px`;
    await frame();
    const height = host.scrollHeight;

    const ratio = safePixelRatio(width, height, 2);
    if (ratio < MIN_READABLE_RATIO) {
      throw new Error(t('Документ слишком длинный для одной картинки — выделите часть текста и повторите экспорт'));
    }

    const { toPng, toJpeg } = await import('html-to-image');
    const options: any = {
      width,
      height,
      pixelRatio: ratio,
      backgroundColor: bg,
      style: { position: 'static', left: '0', top: '0', margin: '0', width: `${width}px`, height: `${height}px` },
    };
    const dataUrl = format === 'png' ? await toPng(host, options) : await toJpeg(host, { ...options, quality: 0.95 });
    const blob = await (await fetch(dataUrl)).blob();
    await downloadFileWithFallback(blob, `markdown-export.${format}`);
  } finally {
    host.remove();
  }
}
