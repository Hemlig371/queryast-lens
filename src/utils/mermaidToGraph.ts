// @ts-nocheck
import dagre from 'dagre';

export interface MermaidParsedResult {
  nodes: any[];
  edges: any[];
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  error?: string;
}

interface RawNode {
  id: string;
  label: string;
  shape: string;
  subgraph?: string;
  style?: Record<string, string>;
  classes?: string[];
}

interface RawEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: Record<string, string>;
  lineType?: 'solid' | 'dotted' | 'thick';
  hasArrow?: boolean;
}

interface RawSubgraph {
  id: string;
  title: string;
  parentSubgraph?: string;
  nodeIds: string[];
}

/**
 * Parses Mermaid style strings like "fill:#f9f,stroke:#333,stroke-width:4px,color:#fff"
 * into a CSSProperties object.
 */
function parseStyleProperties(styleStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  if (!styleStr) return result;

  const parts = styleStr.split(/[,;]/);
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const key = part.substring(0, colonIdx).trim().toLowerCase();
    const val = part.substring(colonIdx + 1).trim();
    if (!key || !val) continue;

    if (key === 'fill' || key === 'background' || key === 'background-color') {
      result.backgroundColor = val;
    } else if (key === 'stroke' || key === 'border-color') {
      result.borderColor = val;
    } else if (key === 'stroke-width' || key === 'border-width') {
      result.borderWidth = val;
    } else if (key === 'stroke-dasharray') {
      result.borderStyle = 'dashed';
    } else if (key === 'color') {
      result.color = val;
    } else if (key === 'font-size') {
      result.fontSize = val;
    } else if (key === 'font-weight') {
      result.fontWeight = val;
    } else {
      // CamelCase any other property
      const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      result[camelKey] = val;
    }
  }
  return result;
}

/**
 * Extracts node shape and label from token text.
 */
function extractNodeShapeAndLabel(raw: string): { id: string; label: string; shape: string; className?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Check for class attachment :::className at end
  let className: string | undefined;
  let workingText = trimmed;
  const classMatch = workingText.match(/:::([a-zA-Z0-9_-]+)$/);
  if (classMatch) {
    className = classMatch[1];
    workingText = workingText.substring(0, workingText.length - classMatch[0].length).trim();
  }

  // Helper regex: Match shape open/close with support for internal quoted strings
  // Double circle (((label)))
  let match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\(\(\(\s*(.*?)\s*\)\)\)$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'double_circle', className };

  // Hexagon {{label}}
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\{\{\s*(.*?)\s*\}\}$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'hexagon', className };

  // Subroutine [[label]]
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\[\[\s*(.*?)\s*\]\]$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'subroutine', className };

  // Cylinder [(label)]
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\[\(\s*(.*?)\s*\)\]$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'cylinder', className };

  // Stadium ([label])
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\(\[\s*(.*?)\s*\]\)$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'stadium', className };

  // Circle ((label))
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\(\(\s*(.*?)\s*\)\)$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'circle', className };

  // Trapezoid [/label\] or [\label/]
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\[\/\s*(.*?)\s*\\\]$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'trapezoid', className };
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\[\\\s*(.*?)\s*\/\]$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'trapezoid_alt', className };

  // Parallelogram [/label/] or [\label\]
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\[\/\s*(.*?)\s*\/\]$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'parallelogram', className };
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\[\\\s*(.*?)\s*\\\]$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'parallelogram_alt', className };

  // Asymmetric >label]
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*>\s*(.*?)\s*\]$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'asymmetric', className };

  // Rhombus / Diamond {label}
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\{\s*(.*?)\s*\}$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'rhombus', className };

  // Rounded (label)
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\(\s*(.*?)\s*\)$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'rounded', className };

  // Rectangle [label]
  match = workingText.match(/^([a-zA-Z0-9_.-]+)\s*\[\s*(.*?)\s*\]$/s);
  if (match) return { id: match[1], label: cleanLabel(match[2]), shape: 'rectangle', className };

  // Plain identifier
  match = workingText.match(/^([a-zA-Z0-9_.-]+)$/);
  if (match) return { id: match[1], label: match[1], shape: 'rectangle', className };

  return null;
}

function cleanLabel(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();
  // Remove surrounding quotes if any
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.substring(1, str.length - 1);
  }
  return str;
}

/**
 * Parses Mermaid flowchart/graph code into React Flow nodes and edges.
 */
export function parseMermaidToGraph(
  mermaidText: string,
  preferredDirection?: 'TB' | 'LR'
): MermaidParsedResult {
  if (!mermaidText || !mermaidText.trim()) {
    return { nodes: [], edges: [], direction: preferredDirection || 'LR' };
  }

  const lines = mermaidText.split('\n');
  let detectedDirection: 'TB' | 'LR' | 'BT' | 'RL' = preferredDirection || 'LR';
  let isFlowchart = false;

  const rawNodesMap = new Map<string, RawNode>();
  const rawEdges: RawEdge[] = [];
  const classDefs = new Map<string, Record<string, any>>();
  const subgraphs: RawSubgraph[] = [];
  const subgraphStack: RawSubgraph[] = [];
  let edgeCounter = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    let line = lines[lineIndex].trim();
    
    // Skip empty lines and comments (%%)
    if (!line || line.startsWith('%%')) continue;

    // Check header: flowchart or graph
    const headerMatch = line.match(/^(?:flowchart|graph)\s+([A-Z]{2})/i);
    if (headerMatch) {
      isFlowchart = true;
      if (!preferredDirection) {
        const dir = headerMatch[1].toUpperCase();
        if (dir === 'TB' || dir === 'TD') detectedDirection = 'TB';
        else if (dir === 'LR') detectedDirection = 'LR';
        else if (dir === 'BT') detectedDirection = 'BT';
        else if (dir === 'RL') detectedDirection = 'RL';
      }
      continue;
    }

    if (/^(?:flowchart|graph)\b/i.test(line)) {
      isFlowchart = true;
      continue;
    }

    // Check classDef: classDef className fill:#f9f,stroke:#333...
    const classDefMatch = line.match(/^classDef\s+([a-zA-Z0-9_-]+)\s+(.+)$/i);
    if (classDefMatch) {
      const className = classDefMatch[1];
      const styleProps = parseStyleProperties(classDefMatch[2]);
      classDefs.set(className, styleProps);
      continue;
    }

    // Check class assignment: class A,B,C className
    const classAssignMatch = line.match(/^class\s+([a-zA-Z0-9_.,\s-]+)\s+([a-zA-Z0-9_-]+)$/i);
    if (classAssignMatch) {
      const nodeIds = classAssignMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      const className = classAssignMatch[2];
      const styles = classDefs.get(className) || {};
      for (const id of nodeIds) {
        let node = rawNodesMap.get(id);
        if (!node) {
          node = { id, label: id, shape: 'rectangle' };
          rawNodesMap.set(id, node);
        }
        node.classes = [...(node.classes || []), className];
        node.style = { ...(node.style || {}), ...styles };
      }
      continue;
    }

    // Check style assignment: style NodeId fill:#f9f,stroke:#333...
    const styleMatch = line.match(/^style\s+([a-zA-Z0-9_.-]+)\s+(.+)$/i);
    if (styleMatch) {
      const id = styleMatch[1];
      const styles = parseStyleProperties(styleMatch[2]);
      let node = rawNodesMap.get(id);
      if (!node) {
        node = { id, label: id, shape: 'rectangle' };
        rawNodesMap.set(id, node);
      }
      node.style = { ...(node.style || {}), ...styles };
      continue;
    }

    // Check subgraph start: subgraph title or subgraph id [title]
    const subgraphStartMatch = line.match(/^subgraph\s+(.+)$/i);
    if (subgraphStartMatch) {
      let rest = subgraphStartMatch[1].trim();
      let subId = '';
      let subTitle = '';
      
      const bracketMatch = rest.match(/^([a-zA-Z0-9_.-]+)\s*\[\s*(.*?)\s*\]$/);
      if (bracketMatch) {
        subId = bracketMatch[1];
        subTitle = cleanLabel(bracketMatch[2]);
      } else {
        subTitle = cleanLabel(rest);
        subId = `subgraph_${subgraphs.length + 1}_${subTitle.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      }

      const parentSub = subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1].id : undefined;
      const newSub: RawSubgraph = {
        id: subId,
        title: subTitle,
        parentSubgraph: parentSub,
        nodeIds: []
      };
      subgraphs.push(newSub);
      subgraphStack.push(newSub);
      continue;
    }

    // Check subgraph end
    if (line === 'end' || line.startsWith('end ')) {
      if (subgraphStack.length > 0) {
        subgraphStack.pop();
      }
      continue;
    }

    // Helper to register node inside current subgraph if active
    const registerNode = (extracted: { id: string; label: string; shape: string; className?: string }) => {
      let existing = rawNodesMap.get(extracted.id);
      if (!existing) {
        existing = {
          id: extracted.id,
          label: extracted.label,
          shape: extracted.shape,
          classes: extracted.className ? [extracted.className] : []
        };
        if (extracted.className && classDefs.has(extracted.className)) {
          existing.style = { ...classDefs.get(extracted.className) };
        }
        rawNodesMap.set(extracted.id, existing);
      } else {
        // Update shape / label if previously had fallback
        if (extracted.label && extracted.label !== extracted.id) existing.label = extracted.label;
        if (extracted.shape && extracted.shape !== 'rectangle') existing.shape = extracted.shape;
        if (extracted.className) {
          existing.classes = [...(existing.classes || []), extracted.className];
          if (classDefs.has(extracted.className)) {
            existing.style = { ...(existing.style || {}), ...classDefs.get(extracted.className) };
          }
        }
      }

      if (subgraphStack.length > 0) {
        const curSub = subgraphStack[subgraphStack.length - 1];
        if (!curSub.nodeIds.includes(extracted.id)) {
          curSub.nodeIds.push(extracted.id);
          existing.subgraph = curSub.title || curSub.id;
        }
      }
    };

    // Check edge statements with quote-awareness.
    // Edge connector regex handles:
    // -->, ---, -.->, -.-, ==>, ===, -- text -->, -->|text|, ---|text|, -. text .->, == text ==>
    const edgePattern = /(-->|---|-.->|-.-|==>|===|--\s*.*?\s*-->|-->\|.*?\||---\|.*?\||-\.\s*.*?\s*\.->|==\s*.*?\s*==>)/g;
    
    // Check if line contains any edge connectors outside of double quotes
    let hasEdge = false;
    let inQuote = false;
    let quoteChar = '';
    for (let cIdx = 0; cIdx < line.length; cIdx++) {
      const ch = line[cIdx];
      if ((ch === '"' || ch === "'") && (cIdx === 0 || line[cIdx - 1] !== '\\')) {
        if (!inQuote) {
          inQuote = true;
          quoteChar = ch;
        } else if (quoteChar === ch) {
          inQuote = false;
        }
      } else if (!inQuote) {
        if (line.substring(cIdx).match(/^(-->|---|-.->|-.-|==>|===|--|-->\||---\||-\.|==)/)) {
          hasEdge = true;
          break;
        }
      }
    }

    if (hasEdge && edgePattern.test(line)) {
      // Split line by edge arrows while preserving matches and ignoring matches inside quotes
      const tokens: string[] = [];
      const connectorTokens: string[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      edgePattern.lastIndex = 0;

      while ((match = edgePattern.exec(line)) !== null) {
        // Verify if match is inside quotes
        let quotesBefore = 0;
        for (let q = 0; q < match.index; q++) {
          if ((line[q] === '"' || line[q] === "'") && (q === 0 || line[q - 1] !== '\\')) {
            quotesBefore++;
          }
        }
        if (quotesBefore % 2 === 1) {
          // Inside quote, skip this regex match
          continue;
        }

        const textBefore = line.substring(lastIndex, match.index).trim();
        tokens.push(textBefore);
        connectorTokens.push(match[0].trim());
        lastIndex = match.index + match[0].length;
      }
      const textAfter = line.substring(lastIndex).trim();
      tokens.push(textAfter);

      // Now create edges between consecutive nodes (or node sets if & is used)
      for (let i = 0; i < connectorTokens.length; i++) {
        const fromExpr = tokens[i];
        const connector = connectorTokens[i];
        const toExpr = tokens[i + 1];

        // Parse edge label and styling from connector
        let edgeLabel = '';
        let lineType: 'solid' | 'dotted' | 'thick' = 'solid';
        let hasArrow = true;

        if (connector.includes('-.-') || connector.includes('-.->')) {
          lineType = 'dotted';
          hasArrow = connector.endsWith('>');
          const labelMatch = connector.match(/-\.\s*(.*?)\s*\.->/);
          if (labelMatch) edgeLabel = cleanLabel(labelMatch[1]);
        } else if (connector.includes('===') || connector.includes('==>')) {
          lineType = 'thick';
          hasArrow = connector.endsWith('>');
          const labelMatch = connector.match(/==\s*(.*?)\s*==>/);
          if (labelMatch) edgeLabel = cleanLabel(labelMatch[1]);
        } else if (connector.startsWith('-->|') || connector.startsWith('---|')) {
          hasArrow = connector.startsWith('-->');
          const pipeMatch = connector.match(/\|(.*?)\|/);
          if (pipeMatch) edgeLabel = cleanLabel(pipeMatch[1]);
        } else if (connector.match(/^--\s*(.*?)\s*-->$/)) {
          const textMatch = connector.match(/^--\s*(.*?)\s*-->$/);
          if (textMatch) edgeLabel = cleanLabel(textMatch[1]);
          hasArrow = true;
        } else if (connector === '---') {
          hasArrow = false;
        }

        // Support multiple targets via `A & B`
        const fromItems = fromExpr.split('&').map(s => s.trim()).filter(Boolean);
        const toItems = toExpr.split('&').map(s => s.trim()).filter(Boolean);

        for (const fItem of fromItems) {
          const fNode = extractNodeShapeAndLabel(fItem);
          if (fNode) {
            registerNode(fNode);
            for (const tItem of toItems) {
              const tNode = extractNodeShapeAndLabel(tItem);
              if (tNode) {
                registerNode(tNode);
                edgeCounter++;
                rawEdges.push({
                  id: `e_${fNode.id}_${tNode.id}_${edgeCounter}`,
                  source: fNode.id,
                  target: tNode.id,
                  label: edgeLabel || undefined,
                  lineType,
                  hasArrow
                });
              }
            }
          }
        }
      }
      continue;
    }

    // Single standalone node declaration
    const standalone = extractNodeShapeAndLabel(line);
    if (standalone) {
      registerNode(standalone);
    }
  }

  // Convert raw nodes to React Flow nodes with Dagre layout
  const isHorizontal = detectedDirection === 'LR' || detectedDirection === 'RL';

  const getNodeDimensions = (node: RawNode) => {
    const textLen = (node.label || node.id).length;
    let width = Math.max(140, Math.min(320, textLen * 10 + 40));
    let height = 50;

    switch (node.shape) {
      case 'circle':
        width = 112;
        height = 112;
        break;
      case 'double_circle':
        width = 128;
        height = 128;
        break;
      case 'rhombus':
      case 'diamond':
        width = 144;
        height = 144;
        break;
      case 'hexagon':
        width = Math.max(160, textLen * 10 + 60);
        height = 64;
        break;
      case 'cylinder':
      case 'database':
        width = Math.max(150, textLen * 9 + 40);
        height = 70;
        break;
      case 'stadium':
      case 'pill':
        width = Math.max(140, textLen * 9 + 50);
        height = 48;
        break;
      case 'subroutine':
        width = Math.max(150, textLen * 9 + 45);
        height = 50;
        break;
      default:
        width = Math.max(140, textLen * 9 + 40);
        height = 50;
    }

    return { width, height };
  };

  const dagreGraph = new dagre.graphlib.Graph({ compound: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: detectedDirection,
    nodesep: 40,
    ranksep: 70,
    ranker: 'tight-tree'
  });

  // Add subgraphs to dagre if any
  for (const sub of subgraphs) {
    if (sub.nodeIds.length > 0) {
      dagreGraph.setNode(sub.id, { label: sub.title, clusterNode: true });
      if (sub.parentSubgraph) {
        dagreGraph.setParent(sub.id, sub.parentSubgraph);
      }
    }
  }

  // Add nodes to dagre
  for (const node of rawNodesMap.values()) {
    const { width, height } = getNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
    if (node.subgraph) {
      const subObj = subgraphs.find(s => s.title === node.subgraph || s.id === node.subgraph);
      if (subObj) {
        dagreGraph.setParent(node.id, subObj.id);
      }
    }
  }

  // Add edges to dagre
  for (const edge of rawEdges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  try {
    dagre.layout(dagreGraph);
  } catch (err: any) {
    console.warn("Dagre layout warning:", err);
  }

  // Construct React Flow nodes
  const rfNodes: any[] = [];

  // Standard mermaid nodes first
  for (const node of rawNodesMap.values()) {
    const nodeLayout = dagreGraph.node(node.id);
    const { width, height } = getNodeDimensions(node);
    const pos = nodeLayout
      ? { x: nodeLayout.x - width / 2, y: nodeLayout.y - height / 2 }
      : { x: 0, y: 0 };

    rfNodes.push({
      id: node.id,
      type: 'mermaidNode',
      data: {
        rawId: node.id,
        label: node.label,
        shape: node.shape,
        subgraph: node.subgraph,
        style: node.style,
        classes: node.classes,
        nodeWidth: width,
        nodeHeight: height
      },
      position: pos,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom'
    });
  }

  // Group nodes (subgraphs) - calculate dynamic bounding box from members with fallback to dagre
  const groupNodes: any[] = [];
  for (const sub of subgraphs) {
    if (sub.nodeIds.length > 0) {
      const memberNodes = rfNodes.filter(n => sub.nodeIds.includes(n.id));
      if (memberNodes.length > 0) {
        const paddingX = 28;
        const paddingY = 24;
        const headerSpace = 24;

        const minX = Math.min(...memberNodes.map(n => n.position.x));
        const minY = Math.min(...memberNodes.map(n => n.position.y));
        const maxX = Math.max(...memberNodes.map(n => n.position.x + (n.data?.nodeWidth || 140)));
        const maxY = Math.max(...memberNodes.map(n => n.position.y + (n.data?.nodeHeight || 50)));

        const width = (maxX - minX) + paddingX * 2;
        const height = (maxY - minY) + paddingY * 2 + headerSpace;
        const posX = minX - paddingX;
        const posY = minY - paddingY - headerSpace;

        groupNodes.push({
          id: sub.id,
          type: 'mermaidGroupNode',
          data: {
            label: sub.title,
            width,
            height
          },
          position: {
            x: posX,
            y: posY
          },
          zIndex: -1
        });
      } else {
        const subLayout = dagreGraph.node(sub.id);
        if (subLayout && subLayout.width && subLayout.height) {
          groupNodes.push({
            id: sub.id,
            type: 'mermaidGroupNode',
            data: {
              label: sub.title,
              width: subLayout.width + 40,
              height: subLayout.height + 40
            },
            position: {
              x: subLayout.x - (subLayout.width + 40) / 2,
              y: subLayout.y - (subLayout.height + 40) / 2
            },
            zIndex: -1
          });
        }
      }
    }
  }

  // Prepend group nodes so they render under child nodes
  const allNodes = [...groupNodes, ...rfNodes];

  // Construct React Flow edges
  const rfEdges: any[] = rawEdges.map((edge) => {
    let edgeStyle: any = { strokeWidth: 2 };
    if (edge.lineType === 'dotted') {
      edgeStyle.strokeDasharray = '5 5';
    } else if (edge.lineType === 'thick') {
      edgeStyle.strokeWidth = 3.5;
    }

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      animated: edge.lineType === 'dotted',
      style: edgeStyle,
      markerEnd: edge.hasArrow !== false ? { type: 'arrowclosed', width: 15, height: 15 } : undefined
    };
  });

  return {
    nodes: allNodes,
    edges: rfEdges,
    direction: detectedDirection
  };
}
