import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  History, 
  RotateCcw, 
  Trash2, 
  Plus, 
  Search, 
  Clock, 
  FileText, 
  Check, 
  Download, 
  ArrowLeftRight,
  Info
} from 'lucide-react';
import { 
  SqlVersionItem, 
  getVersions, 
  saveVersion, 
  deleteVersion, 
  clearAllVersions 
} from '../utils/versionHistory';

import { UiVisibilitySettings } from './SettingsModal';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSql: string;
  onRestoreVersion?: (sql: string, dialect?: string) => void;
  theme: 'dark' | 'light';
  uiVisibility?: UiVisibilitySettings;
  currentDialect?: string;
}

interface DiffLine {
  type: 'add' | 'remove' | 'same';
  value: string;
  oldNum?: number;
  newNum?: number;
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const M = oldLines.length;
  const N = newLines.length;

  const dp = Array.from({ length: M + 1 }, () => new Int32Array(N + 1));
  for (let i = M - 1; i >= 0; i--) {
    for (let j = N - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = 0, j = 0;
  let oldNum = 1, newNum = 1;

  while (i < M && j < N) {
    if (oldLines[i] === newLines[j]) {
      diff.push({ type: 'same', value: oldLines[i], oldNum: oldNum++, newNum: newNum++ });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ type: 'remove', value: oldLines[i], oldNum: oldNum++ });
      i++;
    } else {
      diff.push({ type: 'add', value: newLines[j], newNum: newNum++ });
      j++;
    }
  }

  while (i < M) {
    diff.push({ type: 'remove', value: oldLines[i], oldNum: oldNum++ });
    i++;
  }
  while (j < N) {
    diff.push({ type: 'add', value: newLines[j], newNum: newNum++ });
    j++;
  }

  return diff;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  currentSql: rawCurrentSql,
  onRestoreVersion,
  theme,
  uiVisibility,
  currentDialect
}) => {
  const currentSql = typeof rawCurrentSql === 'string' ? rawCurrentSql : '';
  const [versions, setVersions] = useState<SqlVersionItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<SqlVersionItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [restoredId, setRestoredId] = useState<string | null>(null);

  const loadHistory = async () => {
    const list = await getVersions();
    setVersions(list);
    if (list.length > 0 && !selectedVersion) {
      setSelectedVersion(list[0]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const diffResult = useMemo(() => {
    if (!selectedVersion) return [];
    return computeLineDiff(selectedVersion.sql, currentSql);
  }, [selectedVersion, currentSql]);

  if (!isOpen) return null;

  const handleCreateSnapshot = async () => {
    if (!currentSql.trim()) return;
    try {
      const item = await saveVersion(currentSql, newLabel.trim() || 'Ручной снимок', false);
      setNewLabel('');
      await loadHistory();
      setSelectedVersion(item);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteVersion = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteVersion(id);
    if (selectedVersion?.id === id) {
      setSelectedVersion(null);
    }
    await loadHistory();
  };

  const handleClearAll = async () => {
    if (window.confirm('Вы уверены, что хотите полностью очистить всю историю версий?')) {
      await clearAllVersions();
      setSelectedVersion(null);
      await loadHistory();
    }
  };

  const handleRestore = (ver: SqlVersionItem) => {
    onRestoreVersion?.(ver.sql, currentDialect);
    setRestoredId(ver.id);
    setTimeout(() => {
      setRestoredId(null);
      onClose();
    }, 600);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(versions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sql-history-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredVersions = versions.filter(v => 
    (v.label && v.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
    v.sql.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.formattedTime.includes(searchQuery)
  );

  const formatRelativeTime = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Только что';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} ч назад`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} дн назад`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 animate-fadeIn">
      <div 
        className={`w-full max-w-5xl h-[85vh] rounded-xl border shadow-2xl flex flex-col overflow-hidden transition-all ${
          theme === 'dark' 
            ? 'bg-slate-900 border-slate-700 text-slate-100' 
            : 'bg-slate-100 border-slate-300 text-slate-800'
        }`}
      >
        {/* HEADER */}
        <div className={`px-5 py-3 border-b flex items-center justify-between shrink-0 ${
          theme === 'dark' ? 'bg-slate-850 border-slate-700' : 'bg-slate-200 border-slate-300'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${
              theme === 'dark' ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-100 text-blue-700'
            }`}>
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-sm ${
                theme === 'dark' ? 'text-slate-100' : 'text-slate-800'
              }`}>
                История версий SQL
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {uiVisibility?.showHistoryExport !== false && (
            <button
              onClick={handleExportJson}
              disabled={versions.length === 0}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors disabled:opacity-40 ${
                theme === 'dark' 
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' 
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800 shadow-2xs'
              }`}
              title="Экспорт снимков в JSON файл"
            >
              <Download className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`} />
              <span>Экспорт</span>
            </button>
            )}

            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-700'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT PANEL: VERSIONS LIST */}
          <div className={`w-[340px] border-r flex flex-col shrink-0 ${
            theme === 'dark' ? 'bg-slate-850/60 border-slate-700' : 'bg-white border-slate-300'
          }`}>
            {/* ACTIONS & SEARCH */}
            {(uiVisibility?.showHistoryManualSnapshot !== false || uiVisibility?.showHistorySearch !== false) && (
            <div className={`p-3 border-b space-y-2 ${
              theme === 'dark' ? 'border-slate-700/50' : 'border-slate-200'
            }`}>
              {uiVisibility?.showHistoryManualSnapshot !== false && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Метка снимка..."
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className={`flex-1 text-xs px-2.5 py-1.5 rounded border focus:outline-hidden ${
                    theme === 'dark' 
                      ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' 
                      : 'bg-white border-slate-300 text-slate-800 focus:border-blue-600'
                  }`}
                />
                <button
                  onClick={handleCreateSnapshot}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded flex items-center gap-1 shadow-xs transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Снимок</span>
                </button>
              </div>
              )}

              {uiVisibility?.showHistorySearch !== false && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Поиск по истории..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full text-xs pl-8 pr-2.5 py-1.5 rounded border focus:outline-hidden ${
                    theme === 'dark' 
                      ? 'bg-slate-800/80 border-slate-700 text-slate-200' 
                      : 'bg-white border-slate-300 text-slate-800'
                  }`}
                />
              </div>
              )}
            </div>
            )}

            {/* LIST */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredVersions.length === 0 ? (
                <div className="text-center py-12 px-4 text-xs text-slate-400 space-y-2">
                  <Clock className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
                  <p className={theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}>
                    История версий пуста
                  </p>
                </div>
              ) : (
                filteredVersions.map((ver) => {
                  const isSelected = selectedVersion?.id === ver.id;
                  return (
                    <div
                      key={ver.id}
                      onClick={() => setSelectedVersion(ver)}
                      className={`p-2.5 pr-9 rounded-lg border text-xs cursor-pointer transition-all relative group ${
                        isSelected
                          ? theme === 'dark'
                            ? 'border-blue-500 bg-blue-500/10 shadow-xs'
                            : 'border-blue-500 bg-blue-50 shadow-xs'
                          : theme === 'dark'
                          ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${ver.isAutoSave ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          <span className={`truncate font-medium ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'}`}>
                            {ver.label}
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono shrink-0 ${
                          theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          {formatRelativeTime(ver.timestamp)}
                        </span>
                      </div>

                      <div className={`flex items-center justify-between text-[11px] ${
                        theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        <span>{ver.formattedTime}</span>
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span className={theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}></span>
                          <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>{ver.lineCount} строк</span>
                        </div>
                      </div>

                      {/* DELETE BUTTON */}
                      <button
                        onClick={(e) => handleDeleteVersion(ver.id, e)}
                        className="absolute right-1.5 top-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition-all z-10"
                        title="Удалить запись"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* FOOTER CLEAR */}
            {versions.length > 0 && (
              <div className={`p-2.5 border-t flex items-center justify-between text-[11px] ${
                theme === 'dark' ? 'border-slate-700/50 text-slate-400' : 'border-slate-200 text-slate-600'
              }`}>
                <span>Записей: {versions.length}</span>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: CODE PREVIEW & RESTORE */}
          <div className={`flex-1 flex flex-col min-w-0 transition-colors ${
            theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-800'
          }`}>
            {selectedVersion ? (
              <>
                <div className={`px-4 py-2.5 border-b flex items-center justify-between shrink-0 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-200/70 border-slate-300'
                }`}>
                  <div className="flex items-center gap-3">
                  </div>

                  <div className="flex items-center gap-2">
                    {uiVisibility?.showHistoryDiff !== false && (
                    <button
                      onClick={() => setShowDiff(!showDiff)}
                      className={`px-2.5 py-1 text-xs rounded border flex items-center gap-1.5 transition-colors ${
                        showDiff 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : theme === 'dark'
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-2xs'
                      }`}
                      title="Сравнить снимок с текущим кодом в редакторе"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>{showDiff ? 'Код версии' : 'Сравнить (Diff)'}</span>
                    </button>
                    )}

                    <button
                      onClick={() => handleRestore(selectedVersion)}
                      className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 shadow-xs transition-all ${
                        restoredId === selectedVersion.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
                      }`}
                    >
                      {restoredId === selectedVersion.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Восстановлено!</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Восстановить в редактор</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className={`flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed ${
                  theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-800'
                }`}>
                  {showDiff ? (
                    <div className="space-y-2">
                      <div className={`text-[11px] pb-2 mb-2 border-b flex items-center justify-between ${
                        theme === 'dark' ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-700'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Info className="w-3.5 h-3.5 text-blue-500" />
                          <span>Сравнение: <span className={theme === 'dark' ? 'text-red-400' : 'text-red-600'}>Снимок (-)</span> VS <span className={theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}>Текущий редактор (+)</span></span>
                        </div>
                      </div>

                      <div className={`border rounded-lg overflow-hidden font-mono text-xs ${
                        theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                      }`}>
                        {diffResult.map((line, idx) => {
                          if (line.type === 'add') {
                            return (
                              <div key={idx} className={`px-3 py-0.5 flex items-start gap-3 ${
                                theme === 'dark' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-800'
                              }`}>
                                <span className="w-8 text-right shrink-0 select-none opacity-50">{line.newNum}</span>
                                <span className={`select-none ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>+</span>
                                <span className="whitespace-pre-wrap flex-1">{line.value}</span>
                              </div>
                            );
                          } else if (line.type === 'remove') {
                            return (
                              <div key={idx} className={`px-3 py-0.5 flex items-start gap-3 ${
                                theme === 'dark' ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-800'
                              }`}>
                                <span className="w-8 text-right shrink-0 select-none opacity-50">{line.oldNum}</span>
                                <span className={`select-none ${theme === 'dark' ? 'text-red-400' : 'text-red-700'}`}>-</span>
                                <span className="whitespace-pre-wrap flex-1">{line.value}</span>
                              </div>
                            );
                          } else {
                            return (
                              <div key={idx} className={`px-3 py-0.5 flex items-start gap-3 ${
                                theme === 'dark' ? 'text-slate-300 opacity-80' : 'text-slate-800'
                              }`}>
                                <span className="w-8 text-right shrink-0 select-none opacity-40 font-mono">{line.oldNum}</span>
                                <span className="select-none opacity-30">&nbsp;</span>
                                <span className="whitespace-pre-wrap flex-1">{line.value}</span>
                              </div>
                            );
                          }
                        })}
                      </div>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap select-text font-mono text-xs leading-relaxed selection:bg-blue-600 selection:text-white">
                      {selectedVersion.sql}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className={`flex-1 flex flex-col items-center justify-center text-xs ${
                theme === 'dark' ? 'text-slate-500' : 'text-slate-500'
              }`}>
                <FileText className="w-12 h-12 mb-2 opacity-30" />
                <p>Выберите снимок из списка слева для просмотра</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
