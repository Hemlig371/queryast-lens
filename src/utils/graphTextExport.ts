// Текстовые форматы экспорта графа (json / xml / drawio / mermaid). Чистые функции без DOM.

import { getNodeDimensions } from './graphNodeSize';

export type GraphTextFormat = 'json' | 'xml' | 'mermaid' | 'drawio';

/** Текст внутри CDATA: последовательность `]]>` закрыла бы секцию раньше времени, поэтому она режется на две секции. */
const cdata = (text: string): string => `<![CDATA[${String(text ?? '').split(']]>').join(']]]]><![CDATA[>')}]]>`;

/** Цвета ячеек Draw.io по типу узла приложения (как у карточек в CustomNodes). Неизвестный тип — нейтральные. */
const DRAWIO_COLORS: Record<string, { fill: string; stroke: string }> = {
  tableNode: { fill: '#eff6ff', stroke: '#3b82f6' },
  joinNode: { fill: '#faf5ff', stroke: '#a855f7' },
  filterNode: { fill: '#fff7ed', stroke: '#f97316' },
  resultNode: { fill: '#ecfdf5', stroke: '#10b981' },
  queryGroupNode: { fill: '#eef2ff', stroke: '#6366f1' },
};
const DRAWIO_DEFAULT_COLORS = { fill: '#f8fafc', stroke: '#94a3b8' };

/** Идентификаторы Mermaid: [A-Za-z0-9_]; разные id узлов всегда дают разные идентификаторы. */
const buildMermaidIds = (nodes: any[]): Map<string, string> => {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const plain = /^[A-Za-z0-9_]+$/;
  for (const n of nodes) {
    const id = String(n.id);
    if (plain.test(id) && !ids.has(id)) { ids.set(id, id); used.add(id); }
  }
  for (const n of nodes) {
    const id = String(n.id);
    if (ids.has(id)) continue;
    const base = id.replace(/[^a-zA-Z0-9_]/g, '_') || 'n';
    let candidate = base;
    for (let i = 2; used.has(candidate); i++) candidate = `${base}_${i}`;
    ids.set(id, candidate);
    used.add(candidate);
  }
  return ids;
};

/** Замена для JSON.stringify: bigint — строкой, циклические ссылки — маркером (функции JSON.stringify пропускает сам). */
const makeJsonReplacer = () => {
  const seen = new WeakSet<object>();
  return (_key: string, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function') return undefined;
    if (value && typeof value === 'object') {
      if (seen.has(value as object)) return '[Circular]';
      seen.add(value as object);
    }
    return value;
  };
};

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
  { nodes: allNodes, edges, dialect, direction, sql }: GraphTextExportInput
): GraphTextExportResult {
  // рамки CTE/подзапросов — оформление экрана, не данные графа
  const nodes = allNodes.filter((n: any) => n?.type !== 'frameNode');
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
    content = JSON.stringify(exportData, makeJsonReplacer(), 2);
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
    xml += `  <query>${cdata(sql)}</query>\n`;
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

      const { fill: fillColor, stroke: strokeColor } = DRAWIO_COLORS[n.type] ?? DRAWIO_DEFAULT_COLORS;

      const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=2;shadow=1;fontFamily=Helvetica;fontSize=12;align=center;verticalAlign=middle;`;
      // размеры — как у узла на экране (измеренные React Flow), иначе расчётные из раскладки
      const dims = getNodeDimensions(n);
      const width = Math.round(n.measured?.width || n.width || dims.width);
      const height = Math.round(n.measured?.height || n.height || dims.height);

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

    const mermaidIds = buildMermaidIds(nodes);
    const mermaidId = (id: any) => mermaidIds.get(String(id)) ?? String(id).replace(/[^a-zA-Z0-9_]/g, '_');

    nodes.forEach((node: any) => {
      const data = node.data || {};
      const label = data.label || node.id;
      const title = data.title || label;
      
      let detail = '';
      if (data.tableName) detail = `Table: ${data.tableName}`;
      else if (data.alias) detail = `Alias: ${data.alias}`;
      else if (data.condition) detail = `Cond: ${data.condition}`;

      const display = detail ? `${title} [${detail}]` : title;
      const cleanId = mermaidId(node.id);
      lines.push(`  ${cleanId}["${sanitize(display)}"]`);
    });

    edges.forEach((edge: any) => {
      const source = mermaidId(edge.source);
      const target = mermaidId(edge.target);
      const label = edge.label ? `|"${sanitize(String(edge.label))}"|` : '';
      lines.push(`  ${source} -->${label} ${target}`);
    });

    content = lines.join('\n');
    filename = 'sql-graph-export.mmd';
    mimeType = 'text/plain;charset=utf-8';
  }


  return { content, filename, mimeType };
}
