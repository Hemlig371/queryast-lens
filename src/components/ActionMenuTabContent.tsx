import React, { useState, useEffect, useMemo } from 'react';
import { 
  Play, 
  Loader2, 
  Copy, 
  Check, 
  Search, 
  Plus, 
  Layers, 
  Zap, 
  FileCode, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw 
} from 'lucide-react';
import { Snippet, POPULAR_SNIPPETS, ACTION_MENU_CATEGORY } from './SqlSnippetsManager';
import { loadSnippetsFromDB } from '../utils/snippetsStorage';
import { splitBySemicolonIgnoringQuotes } from '../lib/sqlUtils';

interface ActionMenuTabContentProps {
  theme: 'dark' | 'light';
  activeEngine: 'duckdb' | 'clickhouse' | null;
  isDuckDbRunning: boolean;
  onExecuteSql: (sql: string, dialect?: string, isSequential?: boolean) => void;
  onOpenSnippetsManager: (category?: string, snippetId?: string) => void;
  onInsertIntoEditor?: (sql: string) => void;
}

export const ACTION_MENU_TAB_ID = '__action_menu_tab__';

let cachedActionMenuSnippets: Snippet[] | null = null;

export const ActionMenuTabContent: React.FC<ActionMenuTabContentProps> = ({
  theme,
  activeEngine,
  isDuckDbRunning,
  onExecuteSql,
  onOpenSnippetsManager,
  onInsertIntoEditor
}) => {
  const [snippets, setSnippets] = useState<Snippet[]>(() => {
    if (cachedActionMenuSnippets) return cachedActionMenuSnippets;
    let deletedIds: string[] = [];
    try {
      const rawDel = localStorage.getItem('sql_deleted_snippets_ids_v1');
      if (rawDel) deletedIds = JSON.parse(rawDel);
    } catch (e) {
      // ignore
    }
    return POPULAR_SNIPPETS
      .filter(s => s.category === ACTION_MENU_CATEGORY)
      .filter(s => !deletedIds.includes(s.id));
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDialectFilter, setSelectedDialectFilter] = useState<string>('Все');
  const [onlyPipelines, setOnlyPipelines] = useState<boolean>(false);
  const [runningSnippetId, setRunningSnippetId] = useState<string | null>(null);

  const reloadSnippets = async (showSpinner: boolean = false) => {
    if (showSpinner && snippets.length === 0) {
      setLoading(true);
    }
    try {
      const customSnippets = await loadSnippetsFromDB();
      const customIds = new Set(customSnippets.map(s => s.id));
      const popularFiltered = POPULAR_SNIPPETS.filter(s => !customIds.has(s.id));
      const all = [...customSnippets, ...popularFiltered];

      // Read deleted IDs from localStorage
      let deletedIds: string[] = [];
      try {
        const rawDel = localStorage.getItem('sql_deleted_snippets_ids_v1');
        if (rawDel) deletedIds = JSON.parse(rawDel);
      } catch (e) {
        // ignore
      }

      const activeList = all.filter(s => !deletedIds.includes(s.id));
      // Filter for Action Menu category
      const actionMenuSnippets = activeList.filter(s => s.category === ACTION_MENU_CATEGORY);
      cachedActionMenuSnippets = actionMenuSnippets;
      setSnippets(actionMenuSnippets);
    } catch (e) {
      console.error('Failed to load action menu snippets:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadSnippets();
    const handleSnippetsUpdated = () => {
      reloadSnippets();
    };
    window.addEventListener('sql_snippets_updated', handleSnippetsUpdated);
    return () => window.removeEventListener('sql_snippets_updated', handleSnippetsUpdated);
  }, []);

  // Reset running snippet state when engine finishes execution
  useEffect(() => {
    if (!isDuckDbRunning && runningSnippetId) {
      setRunningSnippetId(null);
    }
  }, [isDuckDbRunning, runningSnippetId]);

  const handleExecute = (snippet: Snippet) => {
    if (isDuckDbRunning) return;
    setRunningSnippetId(snippet.id);
    
    // Check if multi-statement pipeline
    const statements = splitBySemicolonIgnoringQuotes(snippet.sql)
      .map(s => s.trim())
      .filter(Boolean);
    const isSequential = statements.length > 1;

    onExecuteSql(snippet.sql, snippet.dialect, isSequential);
  };

  // Stats & Filters
  const { stats, availableDialects } = useMemo(() => {
    let duckdbCount = 0;
    let clickhouseCount = 0;
    let pipelineCount = 0;
    const dialectsSet = new Set<string>();

    snippets.forEach(s => {
      const d = (s.dialect || 'General').trim();
      dialectsSet.add(d);
      
      const dLower = d.toLowerCase();
      if (dLower.includes('duck')) duckdbCount++;
      if (dLower.includes('click')) clickhouseCount++;
      
      const stmts = splitBySemicolonIgnoringQuotes(s.sql).map(st => st.trim()).filter(Boolean);
      if (stmts.length > 1) pipelineCount++;
    });

    // Sort dialects: 'General' first, then alphabetical
    const dialectsArr = Array.from(dialectsSet).sort((a, b) => {
      if (a === 'General') return -1;
      if (b === 'General') return 1;
      return a.localeCompare(b, 'ru', { sensitivity: 'base' });
    });

    return { 
      stats: { total: snippets.length, duckdbCount, clickhouseCount, pipelineCount },
      availableDialects: ['Все', ...dialectsArr]
    };
  }, [snippets]);

  const filteredSnippets = useMemo(() => {
    return snippets.filter(s => {
      // Dialect filter
      if (selectedDialectFilter !== 'Все') {
        const d = (s.dialect || 'General').trim();
        if (d !== selectedDialectFilter) return false;
      }

      // Pipeline filter
      if (onlyPipelines) {
        const stmts = splitBySemicolonIgnoringQuotes(s.sql).map(st => st.trim()).filter(Boolean);
        if (stmts.length <= 1) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = s.title.toLowerCase().includes(q);
        const matchesDesc = (s.description || '').toLowerCase().includes(q);
        const matchesSql = s.sql.toLowerCase().includes(q);
        const matchesDialect = (s.dialect || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesSql && !matchesDialect) return false;
      }

      return true;
    });
  }, [snippets, selectedDialectFilter, onlyPipelines, searchQuery]);

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden select-none ${
      theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`}>
      {/* FILTER & SEARCH BAR */}
      <div className={`px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 ${
        theme === 'dark' ? 'bg-slate-850/50 border-b border-slate-800' : 'bg-slate-100/70 border-b border-slate-200'
      }`}>
        {/* DIALECT & TYPE FILTERS */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {availableDialects.map(dialectOption => {
            const isSelected = selectedDialectFilter === dialectOption;
            return (
              <button
                key={dialectOption}
                onClick={() => setSelectedDialectFilter(dialectOption)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium outline-hidden focus:outline-hidden focus:ring-0 select-none transition-colors border ${
                  isSelected
                    ? theme === 'dark' 
                        ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' 
                        : 'bg-blue-50 border-blue-300 text-blue-700 shadow-2xs'
                    : theme === 'dark'
                      ? 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-750 border-slate-700/60'
                      : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-300/80 shadow-2xs'
                }`}
              >
                {dialectOption}
              </button>
            );
          })}

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

          <button
            onClick={() => setOnlyPipelines(!onlyPipelines)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium outline-hidden focus:outline-hidden focus:ring-0 select-none transition-colors border ${
              onlyPipelines
                ? theme === 'dark'
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                    : 'bg-purple-50 border-purple-300 text-purple-700 shadow-2xs'
                : theme === 'dark'
                  ? 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-750 border-slate-700/60'
                  : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-300/80 shadow-2xs'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Пайплайны ({stats.pipelineCount})</span>
          </button>
        </div>

        {/* SEARCH INPUT */}
        <div className="relative min-w-[110px] max-w-[160px] w-full sm:w-auto">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск"
            className={`w-full pl-8 pr-3 py-1 rounded-md text-xs border outline-none transition-all ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
            }`}
          />
        </div>
      </div>

      {/* ACTION CARDS GRID */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-3">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              Загрузка быстрых действий...
            </span>
          </div>
        ) : filteredSnippets.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-56 p-6 text-center border border-dashed rounded-xl ${
            theme === 'dark' ? 'bg-slate-850/40 border-slate-700' : 'bg-white border-slate-300'
          }`}>
            <div className={`p-3 rounded-full mb-3 ${theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold mb-1">Действия не найдены</h3>
            <p className={`text-xs max-w-sm ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              {searchQuery || selectedDialectFilter !== 'Все' || onlyPipelines
                ? 'Попробуйте изменить параметры поиска или сбросить фильтры.'
                : 'Добавьте свои действия и пайплайны в Библиотеке шаблонов с категорией "Меню действий".'}
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {filteredSnippets.map((snippet) => {
              const statements = splitBySemicolonIgnoringQuotes(snippet.sql)
                .map(s => s.trim())
                .filter(Boolean);
              const isPipeline = statements.length > 1;
              const isExecutingThis = isDuckDbRunning && runningSnippetId === snippet.id;

              return (
                <div
                  key={snippet.id}
                  onDoubleClick={() => onOpenSnippetsManager(ACTION_MENU_CATEGORY, snippet.id)}
                  title={snippet.description ? `${snippet.title}\n\n${snippet.description}` : snippet.title}
                  className={`flex flex-col gap-2.5 rounded-xl border p-2.5 transition-all shadow-2xs group cursor-default ${
                    theme === 'dark'
                      ? 'bg-slate-850/90 border-slate-700/80 hover:border-blue-500/40 hover:bg-slate-850'
                      : 'bg-white border-slate-200/90 hover:border-blue-400/50 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 w-full">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {isPipeline && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded border flex items-center gap-1 ${
                            theme === 'dark'
                              ? 'bg-purple-900/30 text-purple-300 border-purple-800/50'
                              : 'bg-purple-50 text-purple-700 border-purple-200'
                          }`}>
                            <Zap className="w-2.5 h-2.5" />
                            <span>Пайплайн ({statements.length} ст.)</span>
                          </span>
                        </div>
                      )}
                      {/* TITLE */}
                      <h3 className="text-xs font-bold leading-tight text-slate-900 dark:text-slate-100 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                        {snippet.title}
                      </h3>
                    </div>

                    <div className="flex flex-col items-end shrink-0 pt-0.5">
                      <button
                      onClick={() => handleExecute(snippet)}
                      disabled={isDuckDbRunning}
                      className={`relative flex items-center justify-center px-3 py-1 rounded-md text-xs font-medium border transition-colors select-none ${
                        isExecutingThis
                          ? theme === 'dark'
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 cursor-wait'
                            : 'bg-amber-50 border-amber-400 text-amber-700 cursor-wait'
                          : isDuckDbRunning
                            ? theme === 'dark'
                              ? 'opacity-40 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-400'
                              : 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-300 text-slate-500'
                            : theme === 'dark'
                              ? 'bg-slate-800 border-slate-700/80 text-emerald-400 hover:bg-emerald-950/40 hover:border-emerald-700/60 hover:text-emerald-300 active:scale-98'
                              : 'bg-white border-slate-300/90 text-emerald-700 hover:bg-emerald-50/70 hover:border-emerald-400 hover:text-emerald-800 shadow-2xs active:scale-98'
                      }`}
                      title={isPipeline ? "Запустить цепочку запросов (Sequential Pipeline)" : "Выполнить запрос"}
                    >
                      <div className={`flex items-center gap-1.5 transition-opacity ${isExecutingThis ? 'opacity-0' : 'opacity-100'}`}>
                        <Play className="w-3 h-3 fill-current opacity-80" />
                        <span>Запустить</span>
                      </div>
                      {isExecutingThis && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-current" />
                        </div>
                      )}
                    </button>
                  </div>
                  </div>

                  {/* DESCRIPTION */}
                  {snippet.description && (
                    <p 
                      title={snippet.description}
                      className={`text-[11px] leading-relaxed line-clamp-2 ${
                        theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {snippet.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
