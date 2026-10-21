import React, { memo } from 'react';
import { Handle, Position, BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react';
import DOMPurify from 'dompurify';
import { erEntityMetrics, erCommentShown, ER_HEADER_H, ER_ROW_H } from '../utils/erParse';
import type { ErAttribute } from '../utils/mermaidParse';
import { edgeGeometry, labelBeside, orthoFallback, type EdgeGeometry, type HeadKind, type HeadShape, type LabelPlacement, type PathSpec, type Pt, type RoutedEdge } from '../utils/edgePath';

interface MermaidNodeProps {
  data: {
    label: string;
    shape?: string;
    subgraph?: string;
    style?: React.CSSProperties;
    classes?: string[];
    rawId?: string;
    /** размер узла в раскладке: рисуем ровно его, иначе линии начинаются не у края фигуры */
    nodeWidth?: number;
    nodeHeight?: number;
  };
  selected?: boolean;
  targetPosition?: Position;
  sourcePosition?: Position;
}

function isMermaidNodePropsEqual(prevProps: { selected?: boolean; targetPosition?: Position; sourcePosition?: Position; data: Record<string, any> }, nextProps: { selected?: boolean; targetPosition?: Position; sourcePosition?: Position; data: Record<string, any> }): boolean {
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.targetPosition !== nextProps.targetPosition) return false;
  if (prevProps.sourcePosition !== nextProps.sourcePosition) return false;
  if (prevProps.data === nextProps.data) return true;
  if (!prevProps.data || !nextProps.data) return prevProps.data === nextProps.data;
  
  const keysA = Object.keys(prevProps.data);
  const keysB = Object.keys(nextProps.data);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (prevProps.data[key] !== nextProps.data[key]) return false;
  }
  return true;
}

/**
 * Format label text, converting <br/> or \n to line breaks and stripping basic tags if needed
 */
function renderLabel(text: string) {
  if (!text) return '';
  const lines = text.split(/<br\s*\/?>|\n/gi);
  if (lines.length === 1) {
    return <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(lines[0]) }} />;
  }
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 leading-tight">
      {lines.map((line, idx) => (
        <span key={idx} className="whitespace-normal break-words text-center" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(line) }} />
      ))}
    </div>
  );
}

export const MermaidNode = memo(({ data, selected, targetPosition = Position.Left, sourcePosition = Position.Right }: MermaidNodeProps) => {
  const shape = data.shape || 'rectangle';
  const customStyle = data.style || {};

  // Точки подключения невидимы: рёбра сами выбирают точки на стороне узла (см. MermaidEdge и utils/edgePath.ts).
  // Сами Handle нужны React Flow, чтобы ребро вообще отрисовывалось.
  const handleClass = "!w-px !h-px !min-w-0 !min-h-0 !opacity-0 !border-0 !pointer-events-none";

  const renderShapeContent = () => {
    switch (shape) {
      case 'circle': {
        return (
          <div 
            style={customStyle}
            className={`w-28 h-28 rounded-full border-2 flex items-center justify-center p-3 text-center text-xs font-semibold transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'border-slate-400/80 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
            }`}
          >
            {renderLabel(data.label)}
          </div>
        );
      }

      case 'double_circle': {
        return (
          <div 
            style={customStyle}
            className={`w-32 h-32 rounded-full border-2 p-1.5 flex items-center justify-center transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'border-slate-400/80 dark:border-slate-600 bg-slate-100 dark:bg-slate-800'
            }`}
          >
            <div className="w-full h-full rounded-full border-2 border-slate-400/80 dark:border-slate-600 flex items-center justify-center p-2 text-center text-xs font-semibold text-slate-900 dark:text-slate-100">
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'rhombus':
      case 'diamond': {
        return (
          <div className="w-[170px] h-[170px] relative flex items-center justify-center">
            <div 
              style={customStyle}
              className={`absolute inset-[25px] rotate-45 border-2 rounded-sm transition-all ${
                selected 
                  ? 'ring-2 ring-blue-400/80 border-blue-500' 
                  : 'border-amber-500/80 dark:border-amber-400/70 bg-amber-50 dark:bg-amber-950/40'
              }`}
            />
            <div className="relative z-10 p-1.5 text-center text-xs font-semibold text-slate-900 dark:text-slate-100 max-w-[124px] break-words">
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'hexagon': {
        const svgFill = customStyle?.backgroundColor;
        const svgStroke = customStyle?.borderColor;
        const textColor = customStyle?.color;
        return (
          <div className="relative min-w-[160px] min-h-[64px] flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
               <polygon 
                 points="15,0 85,0 100,50 85,100 15,100 0,50" 
                 vectorEffect="non-scaling-stroke"
                 style={{
                   fill: svgFill,
                   stroke: svgStroke
                 }}
                 className={`transition-all ${
                   selected
                     ? 'fill-blue-50 stroke-blue-500 dark:fill-blue-950/50'
                     : svgFill
                       ? ''
                       : 'fill-slate-100 stroke-slate-400 dark:fill-slate-800 dark:stroke-slate-600'
                 }`}
                 strokeWidth="2"
                 strokeLinejoin="round"
               />
            </svg>
            <div 
              style={{ color: textColor }}
              className="relative z-10 px-8 py-3 text-center text-xs font-semibold text-slate-900 dark:text-slate-100 max-w-[280px]"
            >
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'cylinder':
      case 'database': {
        return (
          <div 
            style={customStyle}
            className={`min-w-[150px] relative rounded-t-xl rounded-b-xl border-2 flex flex-col items-center justify-center p-3 pt-4 text-center text-xs font-semibold transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'border-slate-400/80 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
            }`}
          >
            <div className="absolute top-0 left-0 right-0 h-3.5 border-b border-slate-400/60 dark:border-slate-600/60 rounded-t-[10px] bg-slate-200/70 dark:bg-slate-700/50" />
            <div className="mt-1">
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'stadium':
      case 'pill': {
        return (
          <div 
            style={customStyle}
            className={`min-w-[140px] max-w-[280px] px-6 py-2.5 rounded-full border-2 flex items-center justify-center text-center text-xs font-semibold transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'border-blue-400/80 dark:border-blue-500/70 bg-blue-50/80 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100'
            }`}
          >
            {renderLabel(data.label)}
          </div>
        );
      }

      case 'subroutine': {
        return (
          <div 
            style={customStyle}
            className={`min-w-[150px] max-w-[280px] px-6 py-2.5 rounded-md border-2 border-slate-400/80 dark:border-slate-600 relative flex items-center justify-center text-center text-xs font-semibold transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
            }`}
          >
            <div className="absolute top-0 bottom-0 left-2 w-px bg-slate-400 dark:bg-slate-600" />
            <div className="absolute top-0 bottom-0 right-2 w-px bg-slate-400 dark:bg-slate-600" />
            {renderLabel(data.label)}
          </div>
        );
      }

      case 'parallelogram': {
        return (
          <div 
            style={{
              transform: 'skewX(-15deg)',
              ...customStyle
            }}
            className={`min-w-[150px] max-w-[280px] px-6 py-2.5 rounded border-2 flex items-center justify-center text-center text-xs font-semibold transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'border-purple-400/80 dark:border-purple-500/70 bg-purple-50/80 dark:bg-purple-950/40 text-purple-950 dark:text-purple-100'
            }`}
          >
            <div style={{ transform: 'skewX(15deg)' }}>
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'parallelogram_alt': {
        return (
          <div 
            style={{
              transform: 'skewX(15deg)',
              ...customStyle
            }}
            className={`min-w-[150px] max-w-[280px] px-6 py-2.5 rounded border-2 flex items-center justify-center text-center text-xs font-semibold transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'border-purple-400/80 dark:border-purple-500/70 bg-purple-50/80 dark:bg-purple-950/40 text-purple-950 dark:text-purple-100'
            }`}
          >
            <div style={{ transform: 'skewX(-15deg)' }}>
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'asymmetric': {
        const svgFill = customStyle?.backgroundColor;
        const svgStroke = customStyle?.borderColor;
        const textColor = customStyle?.color;
        return (
          <div className="relative min-w-[150px] min-h-[44px] max-w-[280px] flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
               <polygon 
                 points="0,0 85,0 100,50 85,100 0,100" 
                 vectorEffect="non-scaling-stroke"
                 style={{
                   fill: svgFill,
                   stroke: svgStroke
                 }}
                 className={`transition-all ${
                   selected
                     ? 'fill-blue-50 stroke-blue-500 dark:fill-blue-950/50'
                     : svgFill
                       ? ''
                       : 'fill-slate-100 stroke-slate-400 dark:fill-slate-800 dark:stroke-slate-600'
                 }`}
                 strokeWidth="2"
                 strokeLinejoin="round"
               />
            </svg>
            <div 
              style={{ color: textColor }}
              className="relative z-10 pl-5 pr-8 py-2.5 text-center text-xs font-semibold text-slate-900 dark:text-slate-100"
            >
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'trapezoid': {
        const svgFill = customStyle?.backgroundColor;
        const svgStroke = customStyle?.borderColor;
        const textColor = customStyle?.color;
        return (
          <div className="relative min-w-[160px] min-h-[50px] flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
               <polygon 
                 points="15,0 85,0 100,100 0,100" 
                 vectorEffect="non-scaling-stroke"
                 style={{
                   fill: svgFill,
                   stroke: svgStroke
                 }}
                 className={`transition-all ${
                   selected
                     ? 'fill-blue-50 stroke-blue-500 dark:fill-blue-950/50'
                     : svgFill
                       ? ''
                       : 'fill-indigo-50 stroke-indigo-400 dark:fill-indigo-950/40 dark:stroke-indigo-500/70'
                 }`}
                 strokeWidth="2"
                 strokeLinejoin="round"
               />
            </svg>
            <div 
              style={{ color: textColor }}
              className="relative z-10 px-8 py-2.5 text-center text-xs font-semibold text-slate-900 dark:text-slate-100 max-w-[280px]"
            >
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'trapezoid_alt': {
        const svgFill = customStyle?.backgroundColor;
        const svgStroke = customStyle?.borderColor;
        const textColor = customStyle?.color;
        return (
          <div className="relative min-w-[160px] min-h-[50px] flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
               <polygon 
                 points="0,0 100,0 85,100 15,100" 
                 vectorEffect="non-scaling-stroke"
                 style={{
                   fill: svgFill,
                   stroke: svgStroke
                 }}
                 className={`transition-all ${
                   selected
                     ? 'fill-blue-50 stroke-blue-500 dark:fill-blue-950/50'
                     : svgFill
                       ? ''
                       : 'fill-indigo-50 stroke-indigo-400 dark:fill-indigo-950/40 dark:stroke-indigo-500/70'
                 }`}
                 strokeWidth="2"
                 strokeLinejoin="round"
               />
            </svg>
            <div 
              style={{ color: textColor }}
              className="relative z-10 px-8 py-2.5 text-center text-xs font-semibold text-slate-900 dark:text-slate-100 max-w-[280px]"
            >
              {renderLabel(data.label)}
            </div>
          </div>
        );
      }

      case 'rounded': {
        return (
          <div 
            style={customStyle}
            className={`min-w-[140px] max-w-[280px] px-5 py-2.5 rounded-2xl border-2 flex items-center justify-center text-center text-xs font-semibold transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'border-slate-400/80 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
            }`}
          >
            {renderLabel(data.label)}
          </div>
        );
      }

      case 'rectangle':
      default: {
        return (
          <div 
            style={customStyle}
            className={`min-w-[140px] max-w-[280px] px-4 py-2.5 rounded-none border-2 flex items-center justify-center text-center text-xs font-semibold transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500' 
                : 'border-slate-400/80 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
            }`}
          >
            {renderLabel(data.label)}
          </div>
        );
      }
    }
  };

  return (
    // Выделенный узел масштабируется целиком (как в CustomNodes), а не только его рамка
    // Размер — как в раскладке: рёбра рассчитаны на него (порты на краю фигуры), а оценка ширины по тексту неточна
    <div
      style={data.nodeWidth && data.nodeHeight ? { width: data.nodeWidth, height: data.nodeHeight } : undefined}
      className={`relative flex transition-transform duration-200 [&>div:not(.react-flow__handle)]:!w-full [&>div:not(.react-flow__handle)]:!h-full [&>div:not(.react-flow__handle)]:!min-w-0 [&>div:not(.react-flow__handle)]:!max-w-none ${selected ? 'scale-102' : ''}`}
    >
      <Handle type="target" position={targetPosition} className={handleClass} isConnectable={false} />
      {renderShapeContent()}
      <Handle type="source" position={sourcePosition} className={handleClass} isConnectable={false} />
    </div>
  );
}, isMermaidNodePropsEqual);

MermaidNode.displayName = 'MermaidNode';

interface MermaidEntityNodeProps {
  data: { label: string; entity?: ErAttribute[]; rawId?: string };
  selected?: boolean;
  targetPosition?: Position;
  sourcePosition?: Position;
}

const KEY_CLASS: Record<string, string> = {
  PK: 'text-amber-600 dark:text-amber-300',
  FK: 'text-blue-700 dark:text-blue-400',
  UK: 'text-violet-700 dark:text-violet-300',
};

/** Сущность ER-диаграммы: таблица «заголовок + строки атрибутов». Размеры — по тем же метрикам, что у раскладки и SVG. */
export const MermaidEntityNode = memo(({ data, selected, targetPosition = Position.Top, sourcePosition = Position.Bottom }: MermaidEntityNodeProps) => {
  const attrs = data.entity || [];
  const m = erEntityMetrics(data.label, attrs);
  const hidden = "!w-px !h-px !min-w-0 !min-h-0 !opacity-0 !border-0 !pointer-events-none";
  return (
    <div className={`relative transition-transform duration-200 ${selected ? 'scale-102' : ''}`}>
      <Handle type="target" position={targetPosition} className={hidden} isConnectable={false} />
      <div
        style={{ width: m.width, height: m.height }}
        className={`box-border overflow-hidden rounded-md border-[1.5px] bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs transition-all ${
          selected ? 'ring-2 ring-blue-400/80 border-blue-500' : 'border-slate-400/80 dark:border-slate-600'
        }`}
      >
        <div
          style={{ height: ER_HEADER_H - 1.5 }}
          className={`flex items-center justify-center px-2 font-bold text-[13px] bg-slate-200 dark:bg-slate-700 whitespace-nowrap ${attrs.length > 0 ? 'border-b border-slate-400/80 dark:border-slate-600' : ''}`}
        >
          {data.label}
        </div>
        {attrs.map((a, i) => (
          <div
            key={i}
            style={{ height: ER_ROW_H }}
            className={`relative whitespace-nowrap leading-[22px] ${i % 2 === 1 ? 'bg-slate-900/[0.035] dark:bg-white/[0.035]' : ''}`}
          >
            <span className="absolute text-slate-500 dark:text-slate-400" style={{ left: m.colX[0] }}>{a.type}</span>
            <span className="absolute" style={{ left: m.colX[1] }}>{a.name}</span>
            {a.keys.length > 0 ? (
              <span className={`absolute font-bold text-[11px] ${KEY_CLASS[a.keys.includes('PK') ? 'PK' : a.keys.includes('FK') ? 'FK' : 'UK']}`} style={{ left: m.colX[2] }}>
                {a.keys.join(', ')}
              </span>
            ) : null}
            {a.comment ? (
              <span className="absolute italic text-slate-500 dark:text-slate-400" style={{ left: m.colX[3] }} title={a.comment}>
                {erCommentShown(a.comment)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <Handle type="source" position={sourcePosition} className={hidden} isConnectable={false} />
    </div>
  );
}, isMermaidNodePropsEqual);

MermaidEntityNode.displayName = 'MermaidEntityNode';

export const MermaidGroupNode = memo(({ data, selected }: { data: any; selected?: boolean }) => {
  return (
    <div 
      style={{
        width: data.width || 200,
        height: data.height || 150,
        ...(data.style || {})
      }}
      className={`rounded-xl border-2 border-dashed transition-all p-3 pointer-events-none ${
        selected 
          ? 'border-blue-500 bg-blue-50/15 dark:bg-blue-950/20' 
          : 'border-slate-400/60 dark:border-slate-600/60 bg-slate-200/20 dark:bg-slate-800/20'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 select-none uppercase tracking-wider">
        <span className="w-2 h-2 rounded-full bg-slate-500 dark:bg-slate-400" />
        <span>{data.label || 'Subgraph'}</span>
      </div>
    </div>
  );
});

MermaidGroupNode.displayName = 'MermaidGroupNode';

interface MermaidEdgeData {
  route?: RoutedEdge;
  headStart?: HeadKind | 'none';
  headEnd?: HeadKind | 'none';
}

const neg = (p: Pt): Pt => ({ x: -p.x, y: -p.y });
const POS_VEC: Record<string, Pt> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

function HeadSvg({ head, color, style }: { head: HeadShape; color?: string; style?: React.CSSProperties }) {
  const common = { style: { pointerEvents: 'none' as const, ...style } };
  const pts = (list: Pt[]) => list.map(p => `${p.x},${p.y}`).join(' ');
  if (head.polygon) return <polygon points={pts(head.polygon)} fill={color || 'currentColor'} stroke="none" {...common} />;
  if (head.lines || head.circle) {
    // ER: засечки/«лапка» и кольцо «ноль»
    const stroke = color || 'currentColor';
    return (
      <g {...common}>
        {head.lines ? <path d={head.lines.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join('')} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" /> : null}
        {head.circle ? <circle cx={head.circle.c.x} cy={head.circle.c.y} r={head.circle.r} fill="none" stroke={stroke} strokeWidth={1.5} /> : null}
      </g>
    );
  }
  if (head.cross) {
    const [a, b, c, d] = head.cross;
    return <path d={`M${a.x} ${a.y}L${b.x} ${b.y}M${c.x} ${c.y}L${d.x} ${d.y}`} fill="none" stroke={color || 'currentColor'} strokeWidth={2} {...common} />;
  }
  return null;
}

/**
 * Ребро Mermaid: начало и конец — в портах на сторонах узлов (разные точки для разных рёбер, на контуре фигуры),
 * линия строгая: прямые отрезки со скруглёнными углами, изломы — в зазорах между колонками (см. routeEdges).
 * Стрелки рисуем сами (того же размера, что в SVG документа). Если узел перетащили, порт едет вместе с ним:
 * при сдвиге обоих узлов на одно и то же маршрут просто сдвигается, иначе строится простой ортогональный путь.
 * Подпись стоит рядом с линией, без плашки (контур цвета холста, чтобы текст читался поверх чужих линий).
 */
export const MermaidEdge = memo(({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, label, data }: EdgeProps) => {
  const d = data as MermaidEdgeData | undefined;
  const route = d?.route;
  const srcNode = useInternalNode(source);
  const dstNode = useInternalNode(target);

  let spec: PathSpec;
  let labelAt: LabelPlacement | undefined;
  if (route && srcNode && dstNode) {
    const sp = srcNode.internals.positionAbsolute;
    const dp = dstNode.internals.positionAbsolute;
    const dsx = sp.x - route.srcPos.x;
    const dsy = sp.y - route.srcPos.y;
    const ddx = dp.x - route.dstPos.x;
    const ddy = dp.y - route.dstPos.y;
    const start = { x: sp.x + route.srcOffset.x, y: sp.y + route.srcOffset.y };
    const end = { x: dp.x + route.dstOffset.x, y: dp.y + route.dstOffset.y };
    const still = Math.abs(dsx) < 0.5 && Math.abs(dsy) < 0.5 && Math.abs(ddx) < 0.5 && Math.abs(ddy) < 0.5;
    const together = Math.abs(dsx - ddx) < 0.5 && Math.abs(dsy - ddy) < 0.5; // например, петля или оба узла сдвинуты вместе
    const inner = still ? route.inner : together ? route.inner.map(p => ({ x: p.x + dsx, y: p.y + dsy })) : orthoFallback(start, end, route.outDir);
    spec = { start, end, startDir: route.outDir, endDir: neg(route.inDir), inner };
    if (label) labelAt = still || together ? (route.label ? { ...route.label, x: route.label.x + (still ? 0 : dsx), y: route.label.y + (still ? 0 : dsy) } : undefined) : undefined;
    if (label && !labelAt) labelAt = labelBeside([start, ...inner, end]);
  } else {
    // запасной вариант (узлы ещё не измерены): точки подключения React Flow
    const start = { x: sourceX, y: sourceY };
    const end = { x: targetX, y: targetY };
    const out = POS_VEC[sourcePosition as string] || { x: 1, y: 0 };
    spec = { start, end, startDir: out, endDir: neg(POS_VEC[targetPosition as string] || { x: -1, y: 0 }), inner: orthoFallback(start, end, out) };
    if (label) labelAt = labelBeside([start, ...spec.inner, end]);
  }
  const geo: EdgeGeometry = edgeGeometry(spec, d?.headStart ?? 'none', d?.headEnd ?? 'arrow');
  const color = (style?.stroke as string | undefined) || undefined;
  const headStyle = { opacity: style?.opacity, transition: style?.transition } as React.CSSProperties;
  const shift = labelAt ? (labelAt.anchor === 'start' ? '0, -50%' : labelAt.anchor === 'end' ? '-100%, -50%' : '-50%, -50%') : '';
  return (
    <>
      <BaseEdge id={id} path={geo.d} style={style} />
      {geo.startHead ? <HeadSvg head={geo.startHead} color={color} style={headStyle} /> : null}
      {geo.endHead ? <HeadSvg head={geo.endHead} color={color} style={headStyle} /> : null}
      {label && labelAt ? (
        <EdgeLabelRenderer>
          <div
            style={{ position: 'absolute', transform: `translate(${shift}) translate(${labelAt.x}px, ${labelAt.y}px)`, pointerEvents: 'none' }}
            className="text-xs leading-none font-medium whitespace-nowrap text-slate-700 dark:text-slate-200 [text-shadow:-1.5px_0_#e2e8f0,1.5px_0_#e2e8f0,0_-1.5px_#e2e8f0,0_1.5px_#e2e8f0,-1.5px_-1.5px_#e2e8f0,1.5px_-1.5px_#e2e8f0,-1.5px_1.5px_#e2e8f0,1.5px_1.5px_#e2e8f0] dark:[text-shadow:-1.5px_0_#172033,1.5px_0_#172033,0_-1.5px_#172033,0_1.5px_#172033,-1.5px_-1.5px_#172033,1.5px_-1.5px_#172033,-1.5px_1.5px_#172033,1.5px_1.5px_#172033]"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

MermaidEdge.displayName = 'MermaidEdge';
