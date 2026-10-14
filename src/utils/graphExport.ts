import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { downloadFileWithFallback } from './exportUtils';
import { safePixelRatio } from './canvasLimits';

// Экспорт графа AST/Lineage. Вынесено из App.tsx (этап A2) без изменения логики.
// Состояние (isExporting, error, меню) остаётся в App; здесь только работа с графом и DOM.

export type GraphImageFormat = 'png' | 'svg' | 'jpeg';
export type GraphTextFormat = 'json' | 'xml' | 'mermaid' | 'drawio';

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
  styleEl.innerHTML = `
    ::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
    }
    ::-webkit-scrollbar-button {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
    }
    ::-webkit-scrollbar-thumb {
      display: none !important;
    }
    ::-webkit-scrollbar-track {
      display: none !important;
    }
    * {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
  `;
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
      console.error("Data URL to blob conversion failed", e);
    }
  }
}

export interface GraphTextExportInput {
  nodes: any[];
  edges: any[];
  dialect: string;
  direction: 'LR' | 'TB';
  /** Текст SQL активной вкладки (попадает в XML-экспорт). */
  sql: string;
}

export interface GraphTextExportResult {
  content: string;
  filename: string;
  mimeType: string;
}

/** Строит текстовое представление графа (json/xml/drawio/mermaid). Без побочных эффектов. */
export function buildGraphTextExport(
  format: GraphTextFormat,
  { nodes, edges, dialect, direction, sql }: GraphTextExportInput
): GraphTextExportResult {
  let content = '';
  let filename = '';
  let mimeType = 'text/plain;charset=utf-8';

  if (format === 'json') {
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        dialect,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
      nodes: nodes.map((n: any) => ({
        id: n.id,
        type: n.type,
        label: n.data?.label || n.data?.title || '',
        data: n.data,
        position: n.position
      })),
      edges: edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || '',
        type: e.type
      }))
    };
    content = JSON.stringify(exportData, null, 2);
    filename = 'sql-graph-export.json';
    mimeType = 'application/json;charset=utf-8';
  } else if (format === 'xml') {
    const escapeXml = (str: any) => {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<sqlGraph dialect="${escapeXml(dialect)}" exportedAt="${new Date().toISOString()}">\n`;
    xml += `  <query><![CDATA[${sql}]]></query>\n`;
    xml += `  <nodes count="${nodes.length}">\n`;
    nodes.forEach((n: any) => {
      const title = n.data?.title || n.data?.label || n.id;
      const nodeType = n.data?.type || n.type || 'node';
      xml += `    <node id="${escapeXml(n.id)}" type="${escapeXml(nodeType)}">\n`;
      xml += `      <title>${escapeXml(title)}</title>\n`;
      if (n.data?.tableName) xml += `      <tableName>${escapeXml(n.data.tableName)}</tableName>\n`;
      if (n.data?.condition) xml += `      <condition>${escapeXml(n.data.condition)}</condition>\n`;
      if (n.data?.columns && Array.isArray(n.data.columns)) {
        xml += `      <columns>\n`;
        n.data.columns.forEach((col: any) => {
          const colName = typeof col === 'string' ? col : col.name || String(col);
          xml += `        <column>${escapeXml(colName)}</column>\n`;
        });
        xml += `      </columns>\n`;
      }
      xml += `    </node>\n`;
    });
    xml += `  </nodes>\n`;
    xml += `  <edges count="${edges.length}">\n`;
    edges.forEach((e: any) => {
      xml += `    <edge id="${escapeXml(e.id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">\n`;
      if (e.label) xml += `      <label>${escapeXml(String(e.label))}</label>\n`;
      xml += `    </edge>\n`;
    });
    xml += `  </edges>\n`;
    xml += `</sqlGraph>`;
    content = xml;
    filename = 'sql-graph-export.xml';
    mimeType = 'application/xml;charset=utf-8';
  } else if (format === 'drawio') {
    const escapeXml = (str: any) => {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const escapeHtmlText = (str: any) => {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<mxfile host="QueryAST Lens" modified="${new Date().toISOString()}" agent="QueryAST Lens" version="21.0.0" type="device">\n`;
    xml += `  <diagram id="sql-data-flow" name="SQL Data Flow">\n`;
    xml += `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">\n`;
    xml += `      <root>\n`;
    xml += `        <mxCell id="0" />\n`;
    xml += `        <mxCell id="1" parent="0" />\n`;

    nodes.forEach((n: any, idx: number) => {
      const title = n.data?.title || n.data?.label || n.id;
      const nodeType = n.data?.type || n.type || 'table';
      const posX = Math.round(n.position?.x ?? (idx * 220));
      const posY = Math.round(n.position?.y ?? 100);

      let labelHtml = `<b>${escapeHtmlText(title)}</b>`;
      if (n.data?.tableName) {
        labelHtml += `<br/><font color="#64748b">Table: ${escapeHtmlText(n.data.tableName)}</font>`;
      }
      if (n.data?.condition) {
        labelHtml += `<br/><font color="#3b82f6">ON: ${escapeHtmlText(n.data.condition)}</font>`;
      }
      if (n.data?.columns && Array.isArray(n.data.columns) && n.data.columns.length > 0) {
        const colList = n.data.columns.map((col: any) => typeof col === 'string' ? col : col.name || String(col)).join(', ');
        labelHtml += `<br/><font color="#10b981">Cols: ${escapeHtmlText(colList)}</font>`;
      }

      let fillColor = '#f8fafc';
      let strokeColor = '#94a3b8';
      if (nodeType === 'source' || nodeType === 'table') {
        fillColor = '#eff6ff';
        strokeColor = '#3b82f6';
      } else if (nodeType === 'cte') {
        fillColor = '#faf5ff';
        strokeColor = '#a855f7';
      } else if (nodeType === 'join') {
        fillColor = '#fff7ed';
        strokeColor = '#f97316';
      } else if (nodeType === 'select' || nodeType === 'output') {
        fillColor = '#ecfdf5';
        strokeColor = '#10b981';
      }

      const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=2;shadow=1;fontFamily=Helvetica;fontSize=12;align=center;verticalAlign=middle;`;
      const width = 200;
      const height = 90;

      xml += `        <mxCell id="${escapeXml(n.id)}" value="${escapeXml(labelHtml)}" style="${style}" vertex="1" parent="1">\n`;
      xml += `          <mxGeometry x="${posX}" y="${posY}" width="${width}" height="${height}" as="geometry" />\n`;
      xml += `        </mxCell>\n`;
    });

    edges.forEach((e: any) => {
      const edgeLabel = e.label ? escapeXml(String(e.label)) : '';
      const style = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#64748b;strokeWidth=2;endArrow=classic;endSize=6;`;

      xml += `        <mxCell id="${escapeXml(e.id)}" value="${edgeLabel}" style="${style}" edge="1" parent="1" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">\n`;
      xml += `          <mxGeometry relative="1" as="geometry" />\n`;
      xml += `        </mxCell>\n`;
    });

    xml += `      </root>\n`;
    xml += `    </mxGraphModel>\n`;
    xml += `  </diagram>\n`;
    xml += `</mxfile>`;

    content = xml;
    filename = 'sql-graph-export.drawio.xml';
    mimeType = 'application/xml;charset=utf-8';
  } else if (format === 'mermaid') {
    const dir = direction === 'LR' ? 'LR' : 'TD';
    const lines: string[] = [`graph ${dir}`];

    const sanitize = (text: any) => {
      return String(text || '')
        .replace(/"/g, "'")
        .replace(/[\r\n]+/g, ' ')
        .replace(/[<>]/g, '');
    };

    nodes.forEach((node: any) => {
      const data = node.data || {};
      const label = data.label || node.id;
      const title = data.title || label;
      
      let detail = '';
      if (data.tableName) detail = `Table: ${data.tableName}`;
      else if (data.alias) detail = `Alias: ${data.alias}`;
      else if (data.condition) detail = `Cond: ${data.condition}`;

      const display = detail ? `${title} [${detail}]` : title;
      const cleanId = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`  ${cleanId}["${sanitize(display)}"]`);
    });

    edges.forEach((edge: any) => {
      const source = edge.source.replace(/[^a-zA-Z0-9_]/g, '_');
      const target = edge.target.replace(/[^a-zA-Z0-9_]/g, '_');
      const label = edge.label ? `|"${sanitize(String(edge.label))}"|` : '';
      lines.push(`  ${source} -->${label} ${target}`);
    });

    content = lines.join('\n');
    filename = 'sql-graph-export.mmd';
    mimeType = 'text/plain;charset=utf-8';
  }


  return { content, filename, mimeType };
}
