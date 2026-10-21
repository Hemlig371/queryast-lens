import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {  
  Layers, 
  ChevronDown
} from 'lucide-react';
import { t } from '../utils/i18n';
import { isNodePropsEqual } from '../utils/nodePropsEqual';

interface CustomNodeProps {
  data: any;
  selected?: boolean;
  targetPosition?: Position;
  sourcePosition?: Position;
}

// TABLE NODE (Blue)
export const TableNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-blue-600 dark:border-blue-500 scale-102 ring-2 ring-blue-400/50' : 'border-blue-400/80 dark:border-blue-500/50'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-blue-100/90 dark:bg-blue-950/70 px-3 py-1.5 flex items-center border-b border-blue-300 dark:border-blue-800/60">
        <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 mr-2"></div>
        <span className="text-[10px] font-bold whitespace-nowrap uppercase text-blue-900 dark:text-blue-300 tracking-wider">
          {data.title || 'TABLE'}
        </span>
        {data.isSubquery && (
          <span className="ml-auto text-[9px] bg-blue-200 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200 px-1.5 py-0.2 rounded font-mono border border-blue-400/50 dark:border-blue-700/60 font-bold">
            {t('Подзапрос')}
          </span>
        )}
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate" title={typeof data.label === 'string' ? data.label : undefined}>
          {data.label}
        </div>
        {data.alias && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
            <span className="text-[9px] bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded font-mono border border-slate-400/60 dark:border-slate-600 font-semibold uppercase">{t('Псевдоним')}</span>
            <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold truncate">{data.alias}</span>
          </div>
        )}
        {data.subqueryTables && data.subqueryTables.length > 0 && (
          <div className="mt-2 text-[10px] text-slate-700 dark:text-slate-400">
            <span className="font-semibold">{t('Источники:')} </span>
            <span className="font-mono text-slate-900 dark:text-slate-100 font-bold">{data.subqueryTables.join(', ')}</span>
          </div>
        )}
        {data.columns && data.columns.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-slate-300 dark:border-slate-700/80 pt-2.5">
            <div className="text-[9px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">{t('Колонки / Поля вставки:')}</div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {data.columns.map((col: any, idx: number) => {
                const colName = typeof col === 'string' ? col : (col.name || '');
                return (
                  <div key={idx} className="flex flex-col bg-slate-200/90 dark:bg-slate-800/90 p-1.5 rounded border border-slate-300/80 dark:border-slate-700/70 text-[10px] font-mono">
                    <span className="text-slate-900 dark:text-slate-100 font-medium break-all">{colName}</span>
                    {col.alias && (
                      <span className="text-[9px] text-blue-800 dark:text-blue-400 font-bold mt-0.5">
                        as {col.alias}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

TableNode.displayName = 'TableNode';

// JOIN NODE (Purple)
export const JoinNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-purple-600 dark:border-purple-500 scale-102 ring-2 ring-purple-400/50' : 'border-purple-400/80 dark:border-purple-500/50'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-purple-100/90 dark:bg-purple-950/70 px-3 py-1.5 flex items-center border-b border-purple-300 dark:border-purple-800/60">
        <div className="w-2 h-2 rounded-full bg-purple-600 dark:bg-purple-400 mr-2"></div>
        <span className="text-[10px] font-bold uppercase text-purple-900 dark:text-purple-300 tracking-wider">{data.title || 'JOIN'}</span>
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90 space-y-2">
        <div className="text-xs font-bold whitespace-nowrap text-purple-950 dark:text-purple-200 bg-purple-200/90 dark:bg-purple-900/60 border border-purple-300 dark:border-purple-700/60 px-2 py-0.5 rounded inline-block">
          {data.joinType}
        </div>
        <div className="text-[10px] font-mono text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 p-2 rounded border border-slate-300/80 dark:border-slate-700/70 break-words max-h-24 overflow-y-auto">
          <span className="text-purple-900 dark:text-purple-400 font-bold">ON</span> {data.condition}
        </div>
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

JoinNode.displayName = 'JoinNode';

// FILTER NODE (Orange/Amber)
export const FilterNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-orange-600 dark:border-orange-500 scale-102 ring-2 ring-orange-400/50' : 'border-orange-400/80 dark:border-orange-500/50'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-orange-100/90 dark:bg-orange-950/70 px-3 py-1.5 flex items-center border-b border-orange-300 dark:border-orange-800/60">
        <div className="w-2 h-2 rounded-full bg-orange-600 dark:bg-orange-400 mr-2"></div>
        <span className="text-[10px] font-bold whitespace-nowrap uppercase text-orange-900 dark:text-orange-300 tracking-wider">
          {data.title || 'FILTER'}
        </span>
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {data.columns && data.columns.length > 0 ? (
            data.columns.map((col: any, idx: number) => {
              const colName = typeof col === 'string' ? col : (col?.name || (col ? String(col) : ''));
              const upperCol = typeof colName === 'string' ? colName.toUpperCase() : '';
              const isOp = upperCol.startsWith('AND ') || upperCol.startsWith('OR ');
              const text = isOp ? colName.substring(colName.indexOf(' ') + 1) : colName;
              const op = isOp ? colName.substring(0, colName.indexOf(' ')) : '';
              return (
                <div key={idx} className="flex flex-col">
                  {op && <span className="text-[9px] font-bold text-orange-800 dark:text-orange-400 mb-0.5 ml-1">{op}</span>}
                  <div className="bg-slate-200/90 dark:bg-slate-800/90 p-1.5 rounded border border-slate-300/80 dark:border-slate-700/70 text-[10px] font-mono text-slate-900 dark:text-slate-100 break-words">
                    {text}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-[10px] font-mono text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 p-2 rounded border border-slate-300/80 dark:border-slate-700/70 break-words">
              {data.condition || 'N/A'}
            </div>
          )}
        </div>
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

FilterNode.displayName = 'FilterNode';

// GROUP BY NODE (Pink)
export const GroupByNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-pink-600 dark:border-pink-500 scale-102 ring-2 ring-pink-400/50' : 'border-pink-400/80 dark:border-pink-500/50'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-pink-100/90 dark:bg-pink-950/70 px-3 py-1.5 flex items-center border-b border-pink-300 dark:border-pink-800/60">
        <div className="w-2 h-2 rounded-full bg-pink-600 dark:bg-pink-400 mr-2"></div>
        <span className="text-[10px] font-bold uppercase text-pink-900 dark:text-pink-300 tracking-wider">{data.title || 'GROUP BY'}</span>
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
        <div className="text-[10px] font-mono text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 p-2 rounded border border-slate-300/80 dark:border-slate-700/70 break-words">
          {data.columns}
        </div>
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

GroupByNode.displayName = 'GroupByNode';

// HAVING NODE (Rose)
export const HavingNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-rose-600 dark:border-rose-500 scale-102 ring-2 ring-rose-400/50' : 'border-rose-400/80 dark:border-rose-500/50'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-rose-100/90 dark:bg-rose-950/70 px-3 py-1.5 flex items-center border-b border-rose-300 dark:border-rose-800/60">
        <div className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400 mr-2"></div>
        <span className="text-[10px] font-bold uppercase text-rose-900 dark:text-rose-300 tracking-wider">{data.title || 'HAVING'}</span>
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {data.columns && data.columns.length > 0 ? (
            data.columns.map((col: any, idx: number) => {
              const colName = typeof col === 'string' ? col : (col?.name || (col ? String(col) : ''));
              const upperCol = typeof colName === 'string' ? colName.toUpperCase() : '';
              const isOp = upperCol.startsWith('AND ') || upperCol.startsWith('OR ');
              const text = isOp ? colName.substring(colName.indexOf(' ') + 1) : colName;
              const op = isOp ? colName.substring(0, colName.indexOf(' ')) : '';
              return (
                <div key={idx} className="flex flex-col">
                  {op && <span className="text-[9px] font-bold text-rose-800 dark:text-rose-400 mb-0.5 ml-1">{op}</span>}
                  <div className="bg-slate-200/90 dark:bg-slate-800/90 p-1.5 rounded border border-slate-300/80 dark:border-slate-700/70 text-[10px] font-mono text-slate-900 dark:text-slate-100 break-words">
                    {text}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-[10px] font-mono text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 p-2 rounded border border-slate-300/80 dark:border-slate-700/70 break-words">
              {data.condition || 'N/A'}
            </div>
          )}
        </div>
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

HavingNode.displayName = 'HavingNode';

// SORT NODE (Teal)
export const SortNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-teal-600 dark:border-teal-500 scale-102 ring-2 ring-teal-400/50' : 'border-teal-400/80 dark:border-teal-500/50'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-teal-100/90 dark:bg-teal-950/70 px-3 py-1.5 flex items-center border-b border-teal-300 dark:border-teal-800/60">
        <div className="w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400 mr-2"></div>
        <span className="text-[10px] font-bold uppercase text-teal-900 dark:text-teal-300 tracking-wider">{data.title || 'ORDER BY'}</span>
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
        <div className="text-[10px] font-mono text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 p-2 rounded border border-slate-300/80 dark:border-slate-700/70 break-words">
          {data.details}
        </div>
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

SortNode.displayName = 'SortNode';

// LIMIT NODE (Cyan)
export const LimitNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-cyan-600 dark:border-cyan-500 scale-102 ring-2 ring-cyan-400/50' : 'border-cyan-400/80 dark:border-cyan-500/50'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-cyan-100/90 dark:bg-cyan-950/70 px-3 py-1.5 flex items-center border-b border-cyan-300 dark:border-cyan-800/60">
        <div className="w-2 h-2 rounded-full bg-cyan-600 dark:bg-cyan-400 mr-2"></div>
        <span className="text-[10px] font-bold uppercase text-cyan-900 dark:text-cyan-300 tracking-wider">{data.title || 'LIMIT'}</span>
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
        <div className="text-[10px] font-mono text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 p-2 rounded border border-slate-300/80 dark:border-slate-700/70 break-words">
          {data.details}
        </div>
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

LimitNode.displayName = 'LimitNode';

// CONSTANT NODE (Slate)
export const ConstantNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-slate-600 dark:border-slate-400 scale-102 ring-2 ring-slate-400/50' : 'border-slate-400/80 dark:border-slate-600'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-slate-300/90 dark:bg-slate-800/90 px-3 py-1.5 flex items-center border-b border-slate-400 dark:border-slate-700">
        <div className="w-2 h-2 rounded-full bg-slate-600 dark:bg-slate-400 mr-2"></div>
        <span className="text-[10px] font-bold whitespace-nowrap uppercase text-slate-900 dark:text-slate-200 tracking-wider">
          {data.title || 'CONSTANT'}
        </span>
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
        <div className="text-[10px] font-mono text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 p-2 rounded border border-slate-300/80 dark:border-slate-700/70 break-words">
          {data.details || t('Только константные выражения')}
        </div>
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

ConstantNode.displayName = 'ConstantNode';

// RESULT NODE (Emerald Green)
export const ResultNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <div className={`w-64 rounded-lg bg-slate-200 dark:bg-slate-800 border-2 ${selected ? 'border-emerald-600 dark:border-emerald-500 scale-102 ring-2 ring-emerald-400/50' : 'border-emerald-400/80 dark:border-emerald-500/50'} transition-all duration-200 overflow-hidden`}>
      <div className="bg-emerald-100/90 dark:bg-emerald-950/70 px-3 py-1.5 flex items-center border-b border-emerald-300 dark:border-emerald-800/60">
        <div className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 mr-2"></div>
        <span className="text-[10px] font-bold uppercase text-emerald-900 dark:text-emerald-300 tracking-wider">{data.title || 'RESULT'}</span>
      </div>
      <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {data.columns && data.columns.length > 0 ? (
            data.columns.map((col: any, idx: number) => {
              // name бывает не строкой (объект в React-дочернем элементе роняет узел)
              const colName = typeof col === 'string' ? col : (typeof col?.name === 'string' ? col.name : String(col?.name ?? ''));
              return (
                <div key={idx} className="flex flex-col bg-slate-200/90 dark:bg-slate-800/90 p-1.5 rounded border border-slate-300/80 dark:border-slate-700/70 text-[10px] font-mono">
                  <span className="text-slate-900 dark:text-slate-100 font-medium break-all">{colName}</span>
                  {col?.alias && (
                    <span className="text-[9px] text-emerald-800 dark:text-emerald-400 font-bold mt-0.5">
                      as {col.alias}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-xs text-slate-700 dark:text-slate-400 italic p-1">{t('Нет столбцов в результате')}</div>
          )}
        </div>
      </div>
      <Handle type="target" position={targetPosition || Position.Left} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
      <Handle type="source" position={sourcePosition || Position.Right} className="w-3 h-3 !bg-slate-300 dark:!bg-slate-700 !border-slate-500 dark:!border-slate-400" />
    </div>
  );
}, isNodePropsEqual);

ResultNode.displayName = 'ResultNode';

// QUERY GROUP NODE
export const QueryGroupNode = memo(({ data, selected, targetPosition, sourcePosition }: CustomNodeProps) => {
  return (
    <>
      <Handle type="target" position={targetPosition || Position.Left} className="w-2 h-2 bg-slate-400 dark:bg-slate-500" />
      <div className={`bg-indigo-50 dark:bg-slate-800 border-2 ${selected ? 'border-indigo-600 dark:border-indigo-500' : 'border-indigo-300 dark:border-indigo-500/50'} rounded-lg overflow-hidden min-w-[280px] transition-all`}>
        <div className="bg-indigo-100 dark:bg-indigo-950/70 px-3 py-2 border-b border-indigo-200 dark:border-indigo-800/60 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
            <span className="font-mono text-xs font-bold whitespace-nowrap text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">
              {data.title || t('Блок запроса')}
            </span>
          </div>
        </div>
        <div className="p-3 bg-slate-100/90 dark:bg-slate-900/90">
          <p className="text-sm text-slate-900 dark:text-slate-100 font-mono truncate max-w-[250px] mb-3">
            {data.queryText || t('Выполнение сложного запроса')}
          </p>
          <button 
            onClick={() => data.onToggle?.(data.queryId)}
            className="w-full bg-indigo-200/90 dark:bg-indigo-900/60 hover:bg-indigo-300 dark:hover:bg-indigo-800 text-indigo-950 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 rounded py-1 px-2 text-xs font-bold transition-colors flex items-center justify-center gap-1"
          >
            <ChevronDown className="w-3 h-3" /> {t('Развернуть детали')}
          </button>
        </div>
      </div>
      <Handle type="source" position={sourcePosition || Position.Right} className="w-2 h-2 bg-slate-400 dark:bg-slate-500" />
    </>
  );
}, isNodePropsEqual);

QueryGroupNode.displayName = 'QueryGroupNode';

// COLLAPSE NODE
export const CollapseNode = memo(({ data, selected }: CustomNodeProps) => {
  // Компактный заголовок запроса: подпись и кнопка в одну строку. Не часть графа данных — без точек подключения.
  return (
    <div className={`flex items-center justify-between gap-3 h-8 px-2.5 rounded-md border ${selected ? 'border-amber-500' : 'border-slate-400 dark:border-slate-600'} bg-slate-200 dark:bg-slate-800 min-w-[200px] transition-all`}>
      <span className="font-mono text-[11px] font-bold whitespace-nowrap text-slate-900 dark:text-slate-100 uppercase tracking-wider">
        {data.title || t('Запрос')}
      </span>
      <button
        onClick={() => data.onToggle?.(data.queryId)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-200 border border-slate-400 dark:border-slate-600 transition-colors"
      >
        {t('Свернуть')} <ChevronDown className="w-3 h-3 rotate-180" />
      </button>
    </div>
  );
}, isNodePropsEqual);

CollapseNode.displayName = 'CollapseNode';

import { MermaidNode, MermaidEntityNode, MermaidGroupNode, MermaidEdge } from './MermaidNodes';

export const nodeTypes = {
  collapseNode: CollapseNode,
  queryGroupNode: QueryGroupNode,
  tableNode: TableNode,
  joinNode: JoinNode,
  filterNode: FilterNode,
  groupByNode: GroupByNode,
  havingNode: HavingNode,
  sortNode: SortNode,
  limitNode: LimitNode,
  constantNode: ConstantNode,
  resultNode: ResultNode,
  mermaidNode: MermaidNode,
  mermaidEntityNode: MermaidEntityNode,
  mermaidGroupNode: MermaidGroupNode,
};

// Типы рёбер (объект создаётся один раз: React Flow не должен получать новый на каждый рендер)
export const edgeTypes = {
  mermaidEdge: MermaidEdge,
};
