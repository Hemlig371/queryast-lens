import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownAZ, ArrowDownWideNarrow, ArrowDownZA, ArrowUpNarrowWide, CalendarArrowDown, CalendarArrowUp,
  ChevronDown, ChevronRight, ChevronUp, File as FileIcon, Folder, FolderOpen, Maximize2, Minimize2, RefreshCw, Search, X,
} from 'lucide-react';
import { t, currentLang, localeForLang } from '../utils/i18n';
import { getTableSizeBadge } from '../utils/tableSize';
import {
  buildEntryTooltip, defaultSortDir, dropPathKeys, filterEntries, foldersToReload, getDoubleClickAction, hasMatchingDescendant,
  nameTaken, nextSort, planMove, quotePathForSql, renameSelectionEnd, shouldRefreshOnFocus, sortEntries, TREE_DRAG_MIME, validateNewName,
  type FileEntry, type FileSort, type FileSortKey, type FileTreeProvider, type FilesSectionMode,
} from '../utils/fileTree';

interface Props {
  theme: 'dark' | 'light';
  provider: FileTreeProvider;
  /** Корневая папка (для VFS не используется). */
  root: string;
  mode: FilesSectionMode;
  onModeChange: (m: FilesSectionMode) => void;
  /** Порядок записей: имя, дата изменения или размер (папки всегда первыми). */
  sort: FileSort;
  onSortChange: (s: FileSort) => void;
  /** Масштаб интерфейса в процентах (как у контекстного меню схемы БД). */
  uiScale?: number;
  /** Без подключения к БД: панель целиком — «Файлы», со своей шапкой. */
  standalone: boolean;
  isZoomed: boolean;
  onToggleZoom: () => void;
  onClose: () => void;
  onOpenInTab?: (entry: FileEntry) => void;
  onOpenExternal?: (entry: FileEntry) => void;
  /** Файл или папка переименованы (newPath) либо удалены в корзину (null): обновить открытые вкладки. */
  onPathChanged?: (oldPath: string, newPath: string | null) => void;
}

const fmtBytes = (n: number) => getTableSizeBadge([{ table_bytes: n }]);
const fmtDate = (ms: number) => new Date(ms).toLocaleString(localeForLang(currentLang));

interface MenuState { x: number; y: number; entry: FileEntry; parentKey: string }
interface RenameState { path: string; parentKey: string }

export const FileTreePanel: React.FC<Props> = ({
  theme, provider, root, mode, onModeChange, sort, onSortChange, uiScale = 100, standalone, isZoomed, onToggleZoom, onClose,
  onOpenInTab, onOpenExternal, onPathChanged,
}) => {
  // Списки папок хранятся как пришли; порядок применяется при показе (смена сортировки не перечитывает диск).
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Папки, которые пользователь свернул, пока идёт поиск (сам по себе поиск раскрывает папки с найденным).
  // Сбрасывается при изменении запроса; `expanded` поиск не трогает.
  const [searchCollapsed, setSearchCollapsed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameBusyRef = useRef(false);
  // Перетаскивание внутри дерева (перенос в другую папку). Что именно тащат — в ref: во время dragover браузер не отдаёт данные.
  const dragRef = useRef<{ entry: FileEntry; parentKey: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Папка (или корень), в которую перенос не удался: кратко подсвечивается красным.
  const [flashTarget, setFlashTarget] = useState<string | null>(null);
  const flashTimerRef = useRef<number | undefined>(undefined);
  const lastLoadRef = useRef(0);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const isVfs = provider.kind === 'vfs';
  const ops = provider.ops;
  const dark = theme === 'dark';
  const term = searchTerm.trim();

  const loadFolders = useCallback(async (paths: string[]) => {
    const results = await Promise.all(paths.map(async p => [p, await provider.list(p)] as const));
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
    setMenu(null);
    setRenaming(null);
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

  // Контекстное меню закрывается кликом в любом месте, Esc и потерей фокуса окна (как меню схемы БД).
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => { setSearchCollapsed({}); }, [term]);

  // Бросок вне дерева (например, в редактор) или Esc: подсветка цели и запомненная запись сбрасываются.
  useEffect(() => {
    const clear = () => { dragRef.current = null; setDropTarget(null); };
    window.addEventListener('dragend', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  const sortedChildren = useMemo(() => {
    const out: Record<string, FileEntry[]> = {};
    for (const k of Object.keys(children)) out[k] = sortEntries(children[k], sort);
    return out;
  }, [children, sort]);

  const toggle = (entry: FileEntry, isOpenNow: boolean, autoOpen: boolean) => {
    const open = !isOpenNow;
    if (autoOpen) { // раскрыта поиском: сворачивание действует только пока не изменился запрос
      setSearchCollapsed(prev => ({ ...prev, [entry.path]: !open }));
      return;
    }
    setExpanded(prev => ({ ...prev, [entry.path]: open }));
    if (open) loadFolders([entry.path]); // папка читается при каждом раскрытии
  };

  // --- Действия контекстного меню ---

  /** После переименования или удаления папки её раскрытие и загруженное содержимое теряют смысл. */
  const forgetFolder = (entry: FileEntry) => {
    if (!entry.isDir) return;
    setExpanded(prev => dropPathKeys(prev, entry.path));
    setChildren(prev => dropPathKeys(prev, entry.path));
  };

  const startRename = (entry: FileEntry, parentKey: string) => {
    renameBusyRef.current = false;
    setRenaming({ path: entry.path, parentKey });
    setRenameValue(entry.name);
    setRenameError(null);
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameError(null);
  };

  const commitRename = async (entry: FileEntry, parentKey: string) => {
    if (!ops || renameBusyRef.current) return;
    const name = renameValue.trim();
    if (!name || name === entry.name) { cancelRename(); return; }
    const bad = validateNewName(name, ops.platform);
    if (bad) { setRenameError(bad); return; }
    renameBusyRef.current = true;
    try {
      const newPath = await ops.rename(entry.path, name);
      forgetFolder(entry);
      onPathChanged?.(entry.path, newPath);
      setRenaming(null);
      setRenameError(null);
      await loadFolders([parentKey]);
    } catch (e: any) {
      setRenameError(e?.message || 'failed');
    } finally {
      renameBusyRef.current = false;
    }
  };

  const doTrash = async (entry: FileEntry, parentKey: string) => {
    if (!ops) return;
    try {
      await ops.trash(entry.path);
      forgetFolder(entry);
      onPathChanged?.(entry.path, null);
      await loadFolders([parentKey]);
    } catch (e) {
      console.warn('trash error:', e);
      alert(`${t('Не удалось переместить в корзину:')} ${entry.name}`);
    }
  };

  // --- Перенос перетаскиванием ---

  const flashError = (target: string) => {
    setFlashTarget(target);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashTarget(null), 1500);
  };

  /** Перенос в папку `target`. Ничего не сообщает: «та же папка» — тишина, недопустимо или имя занято — красная вспышка цели. */
  const doMove = async (entry: FileEntry, parentKey: string, target: string) => {
    if (!ops) return;
    const plan = planMove(entry.path, parentKey, target);
    if (plan === 'same') return;
    if (plan === 'into_self' || nameTaken(children[target], entry.name, ops.platform !== 'linux')) { flashError(target); return; }
    try {
      const newPath = await ops.move(entry.path, target);
      forgetFolder(entry);
      onPathChanged?.(entry.path, newPath);
      const reload = [parentKey];
      if (target === root || expandedRef.current[target]) reload.push(target);
      await loadFolders(reload);
    } catch {
      flashError(target);
    }
  };

  const isTreeDrag = (e: React.DragEvent) =>
    !!ops && !!dragRef.current && Array.from(e.dataTransfer.types).includes(TREE_DRAG_MIME);

  const onTargetDragOver = (e: React.DragEvent, target: string) => {
    if (!isTreeDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  };

  const onTargetDrop = (e: React.DragEvent, target: string) => {
    if (!isTreeDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const drag = dragRef.current;
    dragRef.current = null;
    setDropTarget(null);
    if (drag) doMove(drag.entry, drag.parentKey, target);
  };

  const runMenuAction = (action: 'openWith' | 'reveal' | 'rename' | 'trash') => {
    if (!menu || !ops) return;
    const { entry, parentKey } = menu;
    setMenu(null);
    if (action === 'rename') startRename(entry, parentKey);
    else if (action === 'trash') doTrash(entry, parentKey);
    else if (action === 'reveal') ops.reveal(entry.path).catch(e => console.warn('reveal error:', e));
    else ops.openWith(entry.path).catch(e => console.warn('open with error:', e));
  };

  // --- Оформление ---

  const btn = `h-[22px] w-[22px] flex items-center justify-center rounded transition-colors ${dark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`;
  const smallBtn = `p-1 rounded transition-colors ${dark ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'}`;
  // Одна шапка для обоих режимов (и по виду как у Schema Browser): высота, фон, граница, отступы.
  const headerCls = `px-3 h-[37px] border-b flex items-center justify-between shrink-0 ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`;
  const refreshBtn = (
    <button onClick={refresh} className={smallBtn} title={t('Обновить файлы')}>
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
    </button>
  );

  const sortButtons: Array<{ key: FileSortKey; label: string; icons: { asc: React.ElementType; desc: React.ElementType }; dirLabels: { asc: string; desc: string } }> = [
    { key: 'name', label: t('По имени'), icons: { asc: ArrowDownAZ, desc: ArrowDownZA }, dirLabels: { asc: t('А → Я'), desc: t('Я → А') } },
    { key: 'date', label: t('По дате изменения'), icons: { asc: CalendarArrowUp, desc: CalendarArrowDown }, dirLabels: { asc: t('сначала старые'), desc: t('сначала новые') } },
    { key: 'size', label: t('По размеру'), icons: { asc: ArrowUpNarrowWide, desc: ArrowDownWideNarrow }, dirLabels: { asc: t('сначала мелкие'), desc: t('сначала крупные') } },
  ];

  const searchRow = (
    <div className={`p-2 border-b flex items-center gap-1 shrink-0 transition-colors ${dark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-300 bg-slate-100/50'}`}>
      <div className="relative flex-1">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 opacity-50 pointer-events-none" />
        <input
          type="text"
          placeholder={t('Поиск...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`w-full pl-7 ${searchTerm ? 'pr-7' : 'pr-2'} py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${dark ? 'bg-slate-900 border-slate-700 text-slate-300 placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-700 placeholder-slate-400'}`}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors ${dark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}`}
            title={t('Очистить поиск')}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {sortButtons.map(({ key, label, icons, dirLabels }) => {
        const active = sort.key === key;
        const dir: 'asc' | 'desc' = active ? sort.dir : defaultSortDir(key);
        const Icon = icons[dir];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSortChange(nextSort(sort, key))}
            className={`p-1.5 rounded transition-colors ${active
              ? (dark ? 'bg-slate-700 text-blue-400' : 'bg-slate-200 text-blue-600')
              : (dark ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800')}`}
            title={`${label}: ${dirLabels[dir]}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );

  const renderList = (path: string, depth: number): React.ReactNode => {
    const list = sortedChildren[path];
    if (!list) return null;
    return filterEntries(list, children, term).map(entry => {
      const badge = !entry.isDir && entry.size ? fmtBytes(entry.size) : null;
      const tip = buildEntryTooltip(entry, fmtBytes, fmtDate, { modified: t('Изменён'), created: t('Создан'), size: t('Размер') });
      // При поиске папка с найденным внутри (из загруженного) раскрыта, пока пользователь её не свернул; иначе — как раскрыл пользователь.
      const autoOpen = !!term && entry.isDir && hasMatchingDescendant(children, entry.path, term);
      const isOpen = autoOpen ? !searchCollapsed[entry.path] : !!expanded[entry.path];
      const isRenaming = renaming?.path === entry.path;
      const isMenuTarget = menu?.entry.path === entry.path;
      // Цель переноса: сама папка; для файла — папка, в которой он лежит (как в проводнике и редакторах кода).
      const dropKey = entry.isDir ? entry.path : path;
      const isDropTarget = entry.isDir && dropTarget === entry.path;
      const isFlash = entry.isDir && flashTarget === entry.path;
      return (
        <div key={entry.path}>
          <div
            className={`flex items-center gap-1 pr-2 py-0.5 text-xs select-none rounded cursor-pointer transition-colors ${isMenuTarget || isDropTarget ? (dark ? 'bg-slate-800' : 'bg-slate-200') : ''} ${isFlash ? (dark ? 'bg-red-500/25' : 'bg-red-300/60') : ''} ${dark ? 'text-slate-300' : 'text-slate-700'} ${isFlash ? '' : (dark ? 'hover:bg-slate-800' : 'hover:bg-slate-200')}`}
            style={{ paddingLeft: 6 + depth * 12 }}
            title={isRenaming ? undefined : tip}
            // Реальная ФС: тащить можно и файлы, и папки (перенос в папку дерева); виртуальная ФС: только файлы в редактор.
            draggable={(ops ? true : !entry.isDir) && !isRenaming}
            onDragStart={e => {
              if (!ops) {
                if (entry.isDir) return;
                e.dataTransfer.setData('text/plain', quotePathForSql(entry.path));
                e.dataTransfer.effectAllowed = 'copy';
                return;
              }
              dragRef.current = { entry, parentKey: path };
              e.dataTransfer.setData(TREE_DRAG_MIME, entry.path);
              if (entry.isDir) {
                // Папка в редактор ничего не вставляет: text/plain не задаём.
                e.dataTransfer.effectAllowed = 'move';
              } else {
                e.dataTransfer.setData('text/plain', quotePathForSql(entry.path)); // вставка пути в редактор — как раньше
                e.dataTransfer.effectAllowed = 'copyMove';
              }
            }}
            onDragEnd={() => { dragRef.current = null; setDropTarget(null); }}
            onDragOver={e => onTargetDragOver(e, dropKey)}
            onDrop={e => onTargetDrop(e, dropKey)}
            onClick={() => { if (entry.isDir && !isRenaming) toggle(entry, isOpen, autoOpen); }}
            onDoubleClick={() => {
              if (isVfs || isRenaming) return;
              const action = getDoubleClickAction(entry);
              if (action === 'tab') onOpenInTab?.(entry);
              else if (action === 'external') onOpenExternal?.(entry);
            }}
            onContextMenu={e => {
              if (!ops) return;
              e.preventDefault();
              e.stopPropagation();
              setMenu({ x: e.clientX, y: e.clientY, entry, parentKey: path });
            }}
          >
            {entry.isDir
              ? (isOpen ? <ChevronDown className="w-3 h-3 shrink-0 opacity-70" /> : <ChevronRight className="w-3 h-3 shrink-0 opacity-70" />)
              : <span className="w-3 shrink-0" />}
            {entry.isDir
              ? (isOpen ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />)
              : <FileIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />}
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                spellCheck={false}
                title={renameError ? (renameError === 'exists' ? t('Уже существует') : t('Недопустимое имя')) : undefined}
                onChange={e => { setRenameValue(e.target.value); setRenameError(null); }}
                onFocus={e => e.currentTarget.setSelectionRange(0, renameSelectionEnd(entry.name, entry.isDir))}
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                onContextMenu={e => e.stopPropagation()}
                onKeyDown={e => {
                  e.stopPropagation(); // горячие клавиши приложения не должны срабатывать при вводе имени
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(entry, renaming!.parentKey); }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                }}
                // Потеря фокуса: корректное новое имя применяется (как в проводнике), ошибка или то же имя — отмена.
                onBlur={() => { if (renameError) cancelRename(); else commitRename(entry, renaming!.parentKey); }}
                className={`flex-1 min-w-0 px-1 py-0 text-xs rounded border focus:outline-none focus:ring-1 ${renameError ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500'} ${dark ? 'bg-slate-900 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
              />
            ) : (
              <span className="truncate flex-1">{entry.name}</span>
            )}
            {!isRenaming && badge && <span className="shrink-0 text-[10px] opacity-60 font-mono">{badge}</span>}
          </div>
          {entry.isDir && isOpen && renderList(entry.path, depth + 1)}
        </div>
      );
    });
  };

  const rootLabel = isVfs ? t('Виртуальная ФС') : root;
  const rootList = sortedChildren[root];
  const rootTotal = rootList?.length ?? 0;
  const rootShown = rootList ? filterEntries(rootList, children, term).length : 0;
  const body = (
    <>
      {searchRow}
      <div
        className={`flex-1 min-h-0 overflow-y-auto py-1 px-1 transition-colors ${dropTarget === root ? (dark ? 'bg-slate-800' : 'bg-slate-200') : ''} ${flashTarget === root ? (dark ? 'bg-red-500/25' : 'bg-red-300/60') : ''}`}
        // Пустое место списка — корневая папка дерева.
        onDragOver={e => onTargetDragOver(e, root)}
        onDrop={e => onTargetDrop(e, root)}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null); }}
      >
        {rootTotal === 0 && !loading
          ? <div className="py-4 text-center text-xs opacity-50">{t('Файлов нет')}</div>
          : rootShown === 0 && term
            ? (
              <div className="py-8 text-center opacity-70 flex flex-col items-center justify-center gap-1.5 text-xs">
                <Search className="w-5 h-5 opacity-40" />
                <span>{t('Ничего не найдено по запросу')}</span>
                <button onClick={() => setSearchTerm('')} className="text-[11px] text-blue-400 hover:underline mt-1">
                  {t('Сбросить фильтр')}
                </button>
              </div>
            )
            : renderList(root, 0)}
      </div>
    </>
  );

  // Контекстное меню: те же размеры, фон и отступы, что у меню таблиц схемы БД, но без значков.
  const menuEl = menu && ops && (() => {
    const scale = uiScale / 100;
    const itemCls = `text-left px-3 py-1.5 whitespace-nowrap transition-colors ${dark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`;
    return (
      <div
        className={`fixed z-50 flex flex-col w-max min-w-[10rem] max-w-[calc(100vw-16px)] rounded-lg border shadow-xl py-1 text-xs select-none ${dark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
        style={{
          left: Math.max(8, Math.min(menu.x / scale, (window.innerWidth / scale) - 200)),
          top: Math.max(8, Math.min(menu.y / scale, (window.innerHeight / scale) - 150)),
        }}
        onClick={e => e.stopPropagation()}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
      >
        {!menu.entry.isDir && ops.platform !== 'linux' && (
          <button type="button" className={itemCls} onClick={() => runMenuAction('openWith')}>{t('Открыть с помощью…')}</button>
        )}
        <button type="button" className={itemCls} onClick={() => runMenuAction('reveal')}>{t('Показать в проводнике')}</button>
        <button type="button" className={itemCls} onClick={() => runMenuAction('rename')}>{t('Переименовать')}</button>
        <button type="button" className={itemCls} onClick={() => runMenuAction('trash')}>{t('Удалить (в корзину)')}</button>
      </div>
    );
  })();

  if (standalone) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className={headerCls}>
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
        {body}
        {menuEl}
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 ${mode === 'collapsed' ? 'shrink-0' : 'flex-1 basis-0'}`}>
      {/* Верхняя линия — внутренней тенью, а не border-t: высота и центровка содержимого шапки совпадают с шапкой Schema Browser. */}
      <div
        className={`${headerCls}${mode === 'collapsed' ? ' border-b-0' : ''}`}
        style={mode === 'max' ? undefined : { boxShadow: `inset 0 1px 0 0 ${dark ? '#334155' : '#cbd5e1'}` }}
      >
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
      {mode !== 'collapsed' && body}
      {menuEl}
    </div>
  );
};
