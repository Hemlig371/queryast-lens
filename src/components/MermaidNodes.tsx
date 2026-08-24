// @ts-nocheck
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface MermaidNodeProps {
  data: {
    label: string;
    shape?: string;
    subgraph?: string;
    style?: React.CSSProperties;
    classes?: string[];
    rawId?: string;
  };
  selected?: boolean;
  targetPosition?: Position;
  sourcePosition?: Position;
}

function isMermaidNodePropsEqual(prevProps: MermaidNodeProps, nextProps: MermaidNodeProps): boolean {
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
    return <span dangerouslySetInnerHTML={{ __html: lines[0] }} />;
  }
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 leading-tight">
      {lines.map((line, idx) => (
        <span key={idx} className="whitespace-normal break-words text-center" dangerouslySetInnerHTML={{ __html: line }} />
      ))}
    </div>
  );
}

export const MermaidNode = memo(({ data, selected, targetPosition = Position.Left, sourcePosition = Position.Right }: MermaidNodeProps) => {
  const shape = data.shape || 'rectangle';
  const customStyle = data.style || {};

  // Base handle styling
  const handleClass = "!w-2.5 !h-2.5 !bg-slate-400 dark:!bg-slate-500 !border-2 !border-slate-100 dark:!border-slate-800 transition-transform";

  const renderShapeContent = () => {
    switch (shape) {
      case 'circle': {
        return (
          <div 
            style={customStyle}
            className={`w-28 h-28 rounded-full border-2 flex items-center justify-center p-3 text-center text-xs font-semibold shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
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
            className={`w-32 h-32 rounded-full border-2 p-1.5 flex items-center justify-center shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
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
          <div className="w-36 h-36 relative flex items-center justify-center">
            <div 
              style={customStyle}
              className={`absolute inset-3 rotate-45 border-2 rounded-sm shadow-md transition-all ${
                selected 
                  ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
                  : 'border-amber-500/80 dark:border-amber-400/70 bg-amber-50 dark:bg-amber-950/40'
              }`}
            />
            <div className="relative z-10 p-3 text-center text-xs font-semibold text-slate-900 dark:text-slate-100 max-w-[100px] break-words">
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
            <svg className="absolute inset-0 w-full h-full drop-shadow-md overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
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
            className={`min-w-[150px] relative rounded-t-xl rounded-b-xl border-2 flex flex-col items-center justify-center p-3 pt-4 text-center text-xs font-semibold shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
                : 'border-teal-500/80 dark:border-teal-400/70 bg-teal-50/80 dark:bg-teal-950/40 text-teal-950 dark:text-teal-100'
            }`}
          >
            <div className="absolute top-0 left-0 right-0 h-3.5 border-b border-teal-400/60 dark:border-teal-600/60 rounded-t-[10px] bg-teal-200/50 dark:bg-teal-900/50" />
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
            className={`min-w-[140px] max-w-[280px] px-6 py-2.5 rounded-full border-2 flex items-center justify-center text-center text-xs font-semibold shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
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
            className={`min-w-[150px] max-w-[280px] px-6 py-2.5 rounded-md border-2 border-slate-400/80 dark:border-slate-600 relative flex items-center justify-center text-center text-xs font-semibold shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
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
            className={`min-w-[150px] max-w-[280px] px-6 py-2.5 rounded border-2 flex items-center justify-center text-center text-xs font-semibold shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
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
            className={`min-w-[150px] max-w-[280px] px-6 py-2.5 rounded border-2 flex items-center justify-center text-center text-xs font-semibold shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
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
            <svg className="absolute inset-0 w-full h-full drop-shadow-md overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
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
            <svg className="absolute inset-0 w-full h-full drop-shadow-md overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
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
            <svg className="absolute inset-0 w-full h-full drop-shadow-md overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
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
            className={`min-w-[140px] max-w-[280px] px-5 py-2.5 rounded-2xl border-2 flex items-center justify-center text-center text-xs font-semibold shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
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
            className={`min-w-[140px] max-w-[280px] px-4 py-2.5 rounded-none border-2 flex items-center justify-center text-center text-xs font-semibold shadow-md transition-all ${
              selected 
                ? 'ring-2 ring-blue-400/80 border-blue-500 shadow-xl' 
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
    <div className="relative">
      <Handle type="target" position={targetPosition} className={handleClass} />
      {renderShapeContent()}
      <Handle type="source" position={sourcePosition} className={handleClass} />
    </div>
  );
}, isMermaidNodePropsEqual);

MermaidNode.displayName = 'MermaidNode';

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
          ? 'border-blue-500 bg-blue-50/15 dark:bg-blue-950/20 shadow-lg' 
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
