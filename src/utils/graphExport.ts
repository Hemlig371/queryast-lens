import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { downloadFileWithFallback } from './exportUtils';
import { safePixelRatio } from './canvasLimits';
import { scopedHideScrollbarsCss } from './graphExportStyle';

// Экспорт графа AST/Lineage. Вынесено из App.tsx (этап A2) без изменения логики.
// Состояние (isExporting, error, меню) остаётся в App; здесь только работа с графом и DOM.

export type GraphImageFormat = 'png' | 'svg' | 'jpeg';

/**
 * Ждёт, пока React Flow дорисует все узлы (при включённом onlyRenderVisibleElements узлы за экраном
 * отсутствуют в DOM и не попали бы в картинку) и измерит их. Лучшее усилие: по таймауту продолжаем.
 */
export async function waitForGraphRendered(expectedNodes: number, timeoutMs = 3000): Promise<void> {
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const t0 = performance.now();
  await frame();
  await frame();
  while (performance.now() - t0 < timeoutMs) {
    const els = Array.from(document.querySelectorAll('.react-flow__viewport .react-flow__node'));
    if (els.length >= expectedNodes && els.every(e => getComputedStyle(e).visibility !== 'hidden')) {
      await frame();
      await frame();
      return;
    }
    await frame();
  }
}

/** Рендерит .react-flow__viewport в картинку и скачивает файл. Бросает исключение при ошибке. */
export async function exportGraphImage(
  nodes: any[],
  theme: 'dark' | 'light',
  format: GraphImageFormat,
  transparent: boolean = false
): Promise<void> {
  const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement;
  if (!viewportElement) {
    throw new Error('Graph canvas element not found');
  }

  const nodesBounds = getNodesBounds(nodes);
  const padding = 80;
  const width = Math.max(1200, Math.ceil(nodesBounds.width + padding * 2));
  const height = Math.max(800, Math.ceil(nodesBounds.height + padding * 2));

  const viewport = getViewportForBounds(
    nodesBounds,
    width,
    height,
    0.1,
    4,
    0.1
  );

  const defaultBgColor = theme === 'dark' ? '#172033' : '#e2e8f0';
  const bgColor = transparent ? undefined : defaultBgColor;

  const options: any = {
    width: width,
    height: height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
    // масштаб снижается для очень больших графов, иначе холст превышает лимиты браузера/WebView
    pixelRatio: safePixelRatio(width, height, 2),
    filter: (node: Element) => {
      if (!node) return true;
      const className = typeof node.className === 'string'
        ? node.className
        : (node.className && typeof (node.className as any).baseVal === 'string' ? (node.className as any).baseVal : '');

      if (className) {
        if (
          className.includes('react-flow__handle') ||
          className.includes('react-flow__controls') ||
          className.includes('react-flow__minimap') ||
          className.includes('react-flow__attribution') ||
          className.includes('react-flow__panel')
        ) {
          return false;
        }
      }
      return true;
    }
  };

  if (bgColor) {
    options.backgroundColor = bgColor;
  }

  // Inline styles & attributes for SVG element export rendering
  const cleanupTasks: Array<() => void> = [];

  // 1. Hide scrollbars and arrows in nodes during capture
  const styleEl = document.createElement('style');
  styleEl.id = 'export-hide-scrollbars-style';
  // только внутри графа: полосы прокрутки редактора и таблицы на время экспорта не пропадают
  styleEl.textContent = scopedHideScrollbarsCss('.react-flow__viewport');
  document.head.appendChild(styleEl);
  cleanupTasks.push(() => styleEl.remove());

  // 2. Prepare edge paths (<path class="react-flow__edge-path">)
  const edgePaths = viewportElement.querySelectorAll('.react-flow__edges path, .react-flow__edge-path, .react-flow__edge path');
  edgePaths.forEach((path) => {
    const pathEl = path as HTMLElement;
    const computed = window.getComputedStyle(pathEl);
    const origStroke = path.getAttribute('stroke');
    const origStrokeWidth = path.getAttribute('stroke-width');
    const origStrokeDasharray = path.getAttribute('stroke-dasharray');
    const origFill = path.getAttribute('fill');
    
    const origInlineStroke = pathEl.style.getPropertyValue('stroke');
    const origInlineStrokePriority = pathEl.style.getPropertyPriority('stroke');
    const origInlineStrokeWidth = pathEl.style.getPropertyValue('stroke-width');
    const origInlineStrokeWidthPriority = pathEl.style.getPropertyPriority('stroke-width');

    let stroke = computed.stroke;
    if (!stroke || stroke === 'none' || stroke === 'rgba(0, 0, 0, 0)') {
      stroke = '#94a3b8';
    }

    if (transparent && theme === 'dark') {
      // In dark mode, lines are very light (e.g. #f8fafc). On a transparent export, 
      // they disappear against typical light viewers. Force them to a neutral visible gray.
      if (stroke !== '#3b82f6' && stroke !== 'rgb(59, 130, 246)') {
        stroke = '#64748b'; 
      }
    }

    let strokeWidth = computed.strokeWidth;
    if (!strokeWidth || strokeWidth === '0px') {
      strokeWidth = '1.5px';
    }

    path.setAttribute('stroke', stroke);
    path.setAttribute('stroke-width', strokeWidth.replace('px', ''));
    path.setAttribute('fill', 'none');
    pathEl.style.setProperty('stroke', stroke, 'important');
    pathEl.style.setProperty('stroke-width', strokeWidth, 'important');

    const dashArray = pathEl.style.strokeDasharray || computed.strokeDasharray;
    if (dashArray && dashArray !== 'none') {
      path.setAttribute('stroke-dasharray', dashArray);
    }

    cleanupTasks.push(() => {
      if (origStroke !== null) path.setAttribute('stroke', origStroke); else path.removeAttribute('stroke');
      if (origStrokeWidth !== null) path.setAttribute('stroke-width', origStrokeWidth); else path.removeAttribute('stroke-width');
      if (origStrokeDasharray !== null) path.setAttribute('stroke-dasharray', origStrokeDasharray); else path.removeAttribute('stroke-dasharray');
      if (origFill !== null) path.setAttribute('fill', origFill); else path.removeAttribute('fill');
      
      if (origInlineStroke) {
         pathEl.style.setProperty('stroke', origInlineStroke, origInlineStrokePriority);
      } else {
         pathEl.style.removeProperty('stroke');
      }
      if (origInlineStrokeWidth) {
         pathEl.style.setProperty('stroke-width', origInlineStrokeWidth, origInlineStrokeWidthPriority);
      } else {
         pathEl.style.removeProperty('stroke-width');
      }
    });
  });

  // 2.5 Prepare marker colors (arrow heads)
  if (transparent && theme === 'dark') {
    const flowContainer = viewportElement.closest('.react-flow');
    if (flowContainer) {
      const markerPaths = flowContainer.querySelectorAll('marker path, marker polyline, marker polygon');
      markerPaths.forEach((marker) => {
        const m = marker as HTMLElement;
        const origFill = m.getAttribute('fill');
        const origStroke = m.getAttribute('stroke');
        
        const origInlineFill = m.style.getPropertyValue('fill');
        const origInlineFillPriority = m.style.getPropertyPriority('fill');
        const origInlineStroke = m.style.getPropertyValue('stroke');
        const origInlineStrokePriority = m.style.getPropertyPriority('stroke');
        
        // Only modify markers that aren't the blue highlight ones
        const currentFill = window.getComputedStyle(m).fill;
        if (currentFill !== '#3b82f6' && currentFill !== 'rgb(59, 130, 246)') {
          m.setAttribute('fill', '#64748b');
          m.style.setProperty('fill', '#64748b', 'important');
          if (origStroke || window.getComputedStyle(m).stroke !== 'none') {
             m.setAttribute('stroke', '#64748b');
             m.style.setProperty('stroke', '#64748b', 'important');
          }
        }
        
        cleanupTasks.push(() => {
          if (origFill !== null) m.setAttribute('fill', origFill); else m.removeAttribute('fill');
          if (origStroke !== null) m.setAttribute('stroke', origStroke); else m.removeAttribute('stroke');
          
          if (origInlineFill) {
            m.style.setProperty('fill', origInlineFill, origInlineFillPriority);
          } else {
            m.style.removeProperty('fill');
          }
          if (origInlineStroke) {
            m.style.setProperty('stroke', origInlineStroke, origInlineStrokePriority);
          } else {
            m.style.removeProperty('stroke');
          }
        });
      });
    }
  }

  // 3. Prepare edge label background rects (<rect class="react-flow__edge-textbg">)
  const edgeRects = viewportElement.querySelectorAll('.react-flow__edge-textbg, .react-flow__edge rect');
  edgeRects.forEach((rect) => {
    const origFill = rect.getAttribute('fill');
    const origFillOpacity = rect.getAttribute('fill-opacity');
    const origStroke = rect.getAttribute('stroke');
    const origStrokeWidth = rect.getAttribute('stroke-width');
    const origRx = rect.getAttribute('rx');
    const origRy = rect.getAttribute('ry');

    rect.setAttribute('fill', (transparent && theme === 'dark') ? '#1e293b' : '#ffffff');
    rect.setAttribute('fill-opacity', '1');
    rect.setAttribute('stroke', (transparent && theme === 'dark') ? '#94a3b8' : '#cbd5e1');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('rx', '4');
    rect.setAttribute('ry', '4');

    cleanupTasks.push(() => {
      if (origFill !== null) rect.setAttribute('fill', origFill); else rect.removeAttribute('fill');
      if (origFillOpacity !== null) rect.setAttribute('fill-opacity', origFillOpacity); else rect.removeAttribute('fill-opacity');
      if (origStroke !== null) rect.setAttribute('stroke', origStroke); else rect.removeAttribute('stroke');
      if (origStrokeWidth !== null) rect.setAttribute('stroke-width', origStrokeWidth); else rect.removeAttribute('stroke-width');
      if (origRx !== null) rect.setAttribute('rx', origRx); else rect.removeAttribute('rx');
      if (origRy !== null) rect.setAttribute('ry', origRy); else rect.removeAttribute('ry');
    });
  });

  // 4. Prepare edge label text (<text class="react-flow__edge-text">)
  const edgeTexts = viewportElement.querySelectorAll('.react-flow__edge-text, .react-flow__edge text');
  edgeTexts.forEach((text) => {
    const origFill = text.getAttribute('fill');
    const origFontSize = text.getAttribute('font-size');
    const origFontWeight = text.getAttribute('font-weight');
    const origFontFamily = text.getAttribute('font-family');

    text.setAttribute('fill', (transparent && theme === 'dark') ? '#f8fafc' : '#0f172a');
    text.setAttribute('font-size', '10px');
    text.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
    text.setAttribute('font-weight', '600');

    cleanupTasks.push(() => {
      if (origFill !== null) text.setAttribute('fill', origFill); else text.removeAttribute('fill');
      if (origFontSize !== null) text.setAttribute('font-size', origFontSize); else text.removeAttribute('font-size');
      if (origFontWeight !== null) text.setAttribute('font-weight', origFontWeight); else text.removeAttribute('font-weight');
      if (origFontFamily !== null) text.setAttribute('font-family', origFontFamily); else text.removeAttribute('font-family');
    });
  });

  // 5. HTML edge labels if present
  const htmlEdgeLabels = viewportElement.querySelectorAll('.react-flow__edge-label, .react-flow__edge-text-wrapper');
  htmlEdgeLabels.forEach((el) => {
    const htmlEl = el as HTMLElement;
    const origBg = htmlEl.style.backgroundColor;
    const origColor = htmlEl.style.color;

    htmlEl.style.backgroundColor = (transparent && theme === 'dark') ? '#1e293b' : '#ffffff';
    htmlEl.style.color = (transparent && theme === 'dark') ? '#f8fafc' : '#0f172a';

    cleanupTasks.push(() => {
      htmlEl.style.backgroundColor = origBg;
      htmlEl.style.color = origColor;
    });
  });

  // 6. Inlining computed SVG polygon / path styles for Mermaid nodes to ensure accurate colors on export
  const nodeSvgElements = viewportElement.querySelectorAll('.react-flow__node svg polygon, .react-flow__node svg path');
  nodeSvgElements.forEach((el) => {
    const svgEl = el as HTMLElement;
    const computed = window.getComputedStyle(svgEl);
    const origFill = el.getAttribute('fill');
    const origStroke = el.getAttribute('stroke');

    if (computed.fill && computed.fill !== 'none' && computed.fill !== 'rgba(0, 0, 0, 0)') {
      el.setAttribute('fill', computed.fill);
    }
    if (computed.stroke && computed.stroke !== 'none' && computed.stroke !== 'rgba(0, 0, 0, 0)') {
      el.setAttribute('stroke', computed.stroke);
    }

    cleanupTasks.push(() => {
      if (origFill !== null) el.setAttribute('fill', origFill); else el.removeAttribute('fill');
      if (origStroke !== null) el.setAttribute('stroke', origStroke); else el.removeAttribute('stroke');
    });
  });

  let dataUrl = '';
  try {
    const { toPng, toSvg, toJpeg } = await import('html-to-image');
    if (format === 'png') {
      dataUrl = await toPng(viewportElement, options);
    } else if (format === 'svg') {
      dataUrl = await toSvg(viewportElement, options);
    } else if (format === 'jpeg') {
      dataUrl = await toJpeg(viewportElement, { ...options, quality: 0.95 });
    }
  } finally {
    cleanupTasks.forEach(cb => cb());
  }
  if (dataUrl) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const suffix = transparent ? "-transparent" : "";
      await downloadFileWithFallback(blob, `sql-graph-export${suffix}.${format}`);
    } catch (e) {
      // ошибку записи файла показывает вызывающий код (иначе пользователь видит «успех» без файла)
      console.error("Data URL to blob conversion failed", e);
      throw e;
    }
  }
}

// Текстовые форматы (json/xml/drawio/mermaid) строятся чистой функцией в graphTextExport.ts
export { buildGraphTextExport } from './graphTextExport';
export type { GraphTextFormat, GraphTextExportInput, GraphTextExportResult } from './graphTextExport';
