import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, File as FileIcon, Folder, FolderOpen, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import { t } from '../utils/i18n';
import { getTableSizeBadge } from '../utils/tableSize';
import {
  buildEntryTooltip, foldersToReload, getDoubleClickAction, joinPath, quotePathForSql, shouldRefreshOnFocus, sortEntries,
  type FileEntry, type FileTreeProvider, type FilesSectionMode,
} from '../utils/fileTree';

interface Props {
  theme: 'dark' | 'light';
  provider: FileTreeProvider;
  /** Корневая папка (для VFS не используется). */
  root: string;
  mode: FilesSectionMode;
  onModeChange: (m: FilesSectionMode) => void;
  /** Без подключения к БД: панель целиком — «Файлы», со своей шапкой. */
  standalone: boolean;
  isZoomed: boolean;
  onToggleZoom: () => void;
  onClose: () => void;
  onOpenInTab?: (entry: FileEntry) => void;
  onOpenExternal?: (entry: FileEntry) => void;
}

const fmtBytes = (n: number) => getTableSizeBadge([{ table_bytes: n }]);
const fmtDate = (ms: number) => new Date(ms).toLocaleString();

export const FileTreePanel: React.FC<Props> = ({
  theme, provider, root, mode, onModeChange, standalone, isZoomed, onToggleZoom, onClose, onOpenInTab, onOpenExternal,
}) => {
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const lastLoadRef = useRef(0);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const isVfs = provider.kind === 'vfs';
  const dark = theme === 'dark';

  const loadFolders = useCallback(async (paths: string[]) => {
    const results = await Promise.all(paths.map(async p => [p, sortEntries(await provider.list(p))] as const));
    setChildren(prev => {
      const next = { ...prev };
      for (const [p, list] of results) next[p] = list;
      return next;
    });
  }, [provider]);

  const refresh = useCallback(async () => {
    setLoading(true);
    lastLoadRef.current = Date.now();
    try {
      await loadFolders(foldersToReload(root, expandedRef.current));
    } finally {
      setLoading(false);
    }
  }, [loadFolders, root]);

  // Смена корня или поставщика — чистое дерево.
  useEffect(() => {
    setChildren({});
    setExpanded({});
    expandedRef.current = {};
    refresh();
  }, [root, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // Возврат в окно: не чаще раза в 10 с, перечитываются только раскрытые папки.
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState === 'hidden') return;
      if (shouldRefreshOnFocus(Date.now(), lastLoadRef.current)) refresh();
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [refresh]);

  const toggle = (entry: FileEntry) => {
    const open = !expanded[entry.path];
    setExpanded(prev => ({ ...prev, [entry.path]: open }));
    if (open) loadFolders([entry.path]); // папка читается при каждом раскрытии
  };

  const btn = `h-6 w-6 flex items-center justify-center rounded transition-colors ${dark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`;
  const smallBtn = `p-1 rounded transition-colors ${dark ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`;
  const refreshBtn = (
    <button onClick={refresh} className={smallBtn} title={t('Обновить файлы')}>
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
    </button>
  );

  const renderList = (path: string, depth: number): React.ReactNode => {
    const list = children[path];
    if (!list) return null;
    return list.map(entry => {
      const badge = !entry.isDir && entry.size ? fmtBytes(entry.size) : null;
      const tip = buildEntryTooltip(entry, fmtBytes, fmtDate, { modified: t('Изменён'), created: t('Создан'), size: t('Размер') });
      const isOpen = !!expanded[entry.path];
      return (
        <div key={entry.path}>
          <div
            className={`flex items-center gap-1 pr-2 py-0.5 text-xs select-none rounded cursor-pointer ${dark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'}`}
            style={{ paddingLeft: 6 + depth * 12 }}
            title={tip}
            draggable={!entry.isDir}
            onDragStart={e => {
              if (entry.isDir) return;
              e.dataTransfer.setData('text/plain', quotePathForSql(entry.path));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => entry.isDir && toggle(entry)}
            onDoubleClick={() => {
              if (isVfs) return;
              const action = getDoubleClickAction(entry);
              if (action === 'tab') onOpenInTab?.(entry);
              else if (action === 'external') onOpenExternal?.(entry);
            }}
          >
            {entry.isDir
              ? (isOpen ? <ChevronDown className="w-3 h-3 shrink-0 opacity-70" /> : <ChevronRight className="w-3 h-3 shrink-0 opacity-70" />)
              : <span className="w-3 shrink-0" />}
            {entry.isDir
              ? (isOpen ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />)
              : <FileIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />}
            <span className="truncate flex-1">{entry.name}</span>
            {badge && <span className="shrink-0 text-[10px] opacity-60 font-mono">{badge}</span>}
          </div>
          {entry.isDir && isOpen && renderList(entry.path, depth + 1)}
        </div>
      );
    });
  };

  const rootLabel = isVfs ? t('Виртуальная ФС') : root;
  const tree = (
    <div className="flex-1 min-h-0 overflow-y-auto py-1 px-1">
      {(children[root]?.length ?? 0) === 0 && !loading
        ? <div className="py-4 text-center text-xs opacity-50">{t('Файлов нет')}</div>
        : renderList(root, 0)}
    </div>
  );

  if (standalone) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className={`px-3 h-[37px] border-b flex items-center justify-between shrink-0 ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
          <span className={`text-xs font-semibold flex items-center gap-2 min-w-0 ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
            <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{t('Файлы')}</span>
            <span className="font-normal opacity-60 truncate" title={rootLabel}>{rootLabel}</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {refreshBtn}
            <button onClick={onToggleZoom} className={smallBtn} title={isZoomed ? t('Стандартный размер') : t('Увеличить в 2 раза')}>
              {isZoomed ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onClose} className={smallBtn} title={t('Закрыть')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {tree}
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 border-t ${mode === 'collapsed' ? 'shrink-0' : 'flex-1 basis-0'} ${dark ? 'border-slate-700' : 'border-slate-300'}`}>
      <div className={`px-3 h-[30px] flex items-center justify-between shrink-0 ${dark ? 'bg-slate-800/60' : 'bg-slate-100/60'}`}>
        <span className={`text-xs font-semibold flex items-center gap-2 min-w-0 ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>{t('Файлы')}</span>
          <span className="font-normal opacity-60 truncate" title={rootLabel}>{rootLabel}</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {refreshBtn}
          {mode === 'split' && (
            <>
              <button className={btn} onClick={() => onModeChange('max')} title={t('Увеличить')}><ChevronUp className="w-4 h-4" /></button>
              <button className={btn} onClick={() => onModeChange('collapsed')} title={t('Свернуть')}><ChevronDown className="w-4 h-4" /></button>
            </>
          )}
          {mode === 'max' && (
            <button className={btn} onClick={() => onModeChange('split')} title={t('Уменьшить')}><ChevronDown className="w-4 h-4" /></button>
          )}
          {mode === 'collapsed' && (
            <button className={btn} onClick={() => onModeChange('split')} title={t('Развернуть')}><ChevronUp className="w-4 h-4" /></button>
          )}
        </div>
      </div>
      {mode !== 'collapsed' && tree}
    </div>
  );
};
