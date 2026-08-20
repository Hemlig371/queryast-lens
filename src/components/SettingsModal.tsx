import React, { useState, useEffect } from 'react';
import { X, Keyboard, RotateCcw, Settings, AlignLeft, Eye, Download, Upload, Plus, Trash2, Edit3, Check, Code, Zap, FileSpreadsheet, Palette, Columns, Calculator, Printer } from 'lucide-react';
import { downloadFileWithFallback } from '../utils/exportUtils';
import { AutocompleteTemplate, DEFAULT_AUTOCOMPLETE_TEMPLATES, getCustomAutocompleteTemplates } from './SqlEditor';
import { getVersions, importVersions, SqlVersionItem } from '../utils/versionHistory';
import { getAllSchemaCacheEntries, importSchemaCacheEntries, SchemaCacheEntry } from '../utils/schemaDbCache';
import { loadSnippetsFromDB, saveSnippetsToDB } from '../utils/snippetsStorage';
import { Snippet } from './SqlSnippetsManager';
import { getSessionTabs, saveSessionTabs } from '../utils/sessionStorage';
import { EditorTab } from '../App';
import { VaultSettingsSection } from './VaultSettingsSection';
import { ExcelSettings } from '../types/excelSettings';
import { getSavedExcelSettings, saveExcelSettings, resetExcelSettings } from '../utils/excelSettingsStorage';
import { ExcelSettingsTab } from './ExcelSettingsTab';

export interface QuickActionTemplate {
  id: string;
  name: string;
  template: string;
}

export const DEFAULT_QUICK_ACTIONS: QuickActionTemplate[] = [
  {
    id: 'qa-1',
    name: 'Количество строк',
    template: 'SELECT COUNT(*) FROM {table};',
  },
  {
    id: 'qa-2',
    name: 'Структура таблицы',
    template: 'DESCRIBE {table};',
  },
];

export function getQuickActionTemplates(): QuickActionTemplate[] {
  try {
    const raw = localStorage.getItem('sql_quick_action_templates');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Failed to load quick action templates', e);
  }
  return DEFAULT_QUICK_ACTIONS;
}

export interface HotkeyBinding {
  id: string;
  label: string;
  description: string;
  category: 'Редактор' | 'Вкладки' | 'Граф' | 'Общие';
  defaultKey: string;
}

export interface FormatterSettings {
  keywordCase: 'upper' | 'lower' | 'preserve';
  tabWidth: number;
  useTabs: boolean;
  expressionWidth: number;
  denseOperators: boolean;
}

export interface UiVisibilitySettings {
  showEditorToggleBtn?: boolean;
  showPresets: boolean;
  showSnippets: boolean;
  showHistory: boolean;
  showDuckDbConfig?: boolean;
  duckDbMaxRows?: number;
  duckDbAllowUnsignedExtensions?: boolean;
  duckDbMemoryLimit?: string;
  duckDbTempDirectory?: string;
  duckDbExtensionDirectory?: string;
  duckDbThreads?: number;
  showClickhouseConfig?: boolean;
  clickhouseMaxRows?: number;
  showExcelExport?: boolean;
  autoUpdateSchema?: boolean;
  showSearchSql?: boolean;
  showOpenFile: boolean;
  showWin1251Button?: boolean;
  showSaveFile: boolean;
  showFormatSql: boolean;
  showCompactSql?: boolean;
  showCopySql: boolean;
  showMaximizeButton: boolean;
  showLayoutDirection: boolean;
  showSortLimitToggle: boolean;
  showLineageFocus: boolean;
  showMiniMapButton: boolean;
  showThemeToggle: boolean;
  showExportButton: boolean;
  showGraphFooter: boolean;
  // Snippets settings
  showSnippetSearch: boolean;
  showSnippetCategories: boolean;
  showSnippetFavorites: boolean;
  showSnippetCreateBtn: boolean;
  // History settings
  showHistorySearch: boolean;
  showHistoryManualSnapshot: boolean;
  showHistoryExport: boolean;
  showHistoryDiff: boolean;
  // Export Menu Settings
  showExportPngBg: boolean;
  showExportPngTransparent: boolean;
  showExportSvgBg: boolean;
  showExportSvgTransparent: boolean;
  showExportJpeg: boolean;
  showExportJson: boolean;
  showExportXml: boolean;
  showExportMermaid: boolean;
  showExportDrawio: boolean;
  autocompleteOnType?: boolean;
  uiScale?: number;
}

export const DEFAULT_FORMATTER_SETTINGS: FormatterSettings = {
  keywordCase: 'upper',
  tabWidth: 2,
  useTabs: false,
  expressionWidth: 120,
  denseOperators: false,
};

export const DEFAULT_UI_VISIBILITY: UiVisibilitySettings = {
  showEditorToggleBtn: true,
  showPresets: true,
  showSnippets: true,
  showHistory: true,
  showDuckDbConfig: true,
  duckDbMaxRows: 100,
  duckDbAllowUnsignedExtensions: false,
  duckDbMemoryLimit: '8GB',
  duckDbTempDirectory: './tmp',
  duckDbExtensionDirectory: './extensions',
  duckDbThreads: 0,
  showClickhouseConfig: true,
  clickhouseMaxRows: 100,
  showExcelExport: true,
  autoUpdateSchema: true,
  showSearchSql: true,
  showOpenFile: true,
  showWin1251Button: true,
  showSaveFile: true,
  showFormatSql: true,
  showCompactSql: true,
  showCopySql: true,
  showMaximizeButton: true,
  showLayoutDirection: true,
  showSortLimitToggle: true,
  showLineageFocus: true,
  showMiniMapButton: true,
  showThemeToggle: true,
  showExportButton: true,
  showGraphFooter: true,
  showSnippetSearch: true,
  showSnippetCategories: true,
  showSnippetFavorites: true,
  showSnippetCreateBtn: true,
  showHistorySearch: true,
  showHistoryManualSnapshot: true,
  showHistoryExport: true,
  showHistoryDiff: true,
  showExportPngBg: true,
  showExportPngTransparent: true,
  showExportSvgBg: true,
  showExportSvgTransparent: true,
  showExportJpeg: true,
  showExportJson: true,
  showExportXml: true,
  showExportMermaid: true,
  showExportDrawio: true,
  autocompleteOnType: false,
  uiScale: 100,
};

const FORMATTER_STORAGE_KEY = 'sql_visualizer_formatter_v1';
const UI_VISIBILITY_STORAGE_KEY = 'sql_visualizer_ui_visibility_v1';

export function getSavedFormatterSettings(): FormatterSettings {
  try {
    const saved = localStorage.getItem(FORMATTER_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_FORMATTER_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load formatter settings', e);
  }
  return DEFAULT_FORMATTER_SETTINGS;
}

export function getSavedUiVisibilitySettings(): UiVisibilitySettings {
  try {
    const saved = localStorage.getItem(UI_VISIBILITY_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_UI_VISIBILITY, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load UI visibility settings', e);
  }
  return DEFAULT_UI_VISIBILITY;
}

export const DEFAULT_HOTKEYS: HotkeyBinding[] = [
  {
    id: 'triggerAutocomplete',
    label: 'Вызвать автодополнение',
    description: 'Открыть список подсказок автодополнения под курсором',
    category: 'Редактор',
    defaultKey: 'Ctrl+Space'
  },
  {
    id: 'visualize',
    label: 'Визуализировать SQL (Visualize)',
    description: 'Запустить парсинг и построить граф выполнения',
    category: 'Редактор',
    defaultKey: 'Ctrl+Enter'
  },
  {
    id: 'openFile',
    label: 'Открыть SQL файл с диска',
    description: 'Загрузить файл .sql или .txt в редактор',
    category: 'Редактор',
    defaultKey: 'Ctrl+O'
  },
  {
    id: 'saveFile',
    label: 'Сохранить SQL в файл',
    description: 'Сохранить текущий запрос в файл .sql',
    category: 'Редактор',
    defaultKey: 'Ctrl+S'
  },
  {
    id: 'saveAsFile',
    label: 'Сохранить как...',
    description: 'Сохранить текущий запрос в новый файл .sql',
    category: 'Редактор',
    defaultKey: 'Ctrl+Shift+S'
  },
  {
    id: 'copySql',
    label: 'Скопировать SQL в буфер',
    description: 'Скопировать текст запроса',
    category: 'Редактор',
    defaultKey: 'Ctrl+Shift+C'
  },
  {
    id: 'commentBlock',
    label: 'Комментирование выделения (/* */)',
    description: 'Обернуть выделенный фрагмент в /* ... */ или раскомментировать его',
    category: 'Редактор',
    defaultKey: 'Ctrl+/'
  },
  {
    id: 'toggleWrap',
    label: 'Перенос строк в редакторе',
    description: 'Включить/выключить перенос длинных строк',
    category: 'Редактор',
    defaultKey: 'Alt+W'
  },
  {
    id: 'searchSql',
    label: 'Поиск в редакторе',
    description: 'Открыть панель поиска по тексту запроса',
    category: 'Редактор',
    defaultKey: 'Ctrl+F'
  },
  {
    id: 'replaceSql',
    label: 'Замена в редакторе',
    description: 'Открыть панель поиска и замены в редакторе',
    category: 'Редактор',
    defaultKey: 'Ctrl+H'
  },
  {
    id: 'formatSql',
    label: 'Форматировать SQL',
    description: 'Автоматическое форматирование запроса',
    category: 'Редактор',
    defaultKey: 'Ctrl+Shift+F'
  },
  {
    id: 'compactSql',
    label: 'Формат в одну строку',
    description: 'Заменить переносы строк на пробелы и удалить двойные пробелы',
    category: 'Редактор',
    defaultKey: 'Ctrl+Alt+M'
  },
  {
    id: 'pasteAtEnd',
    label: 'Вставить буфер в конец выделенных строк',
    description: 'Вставить содержимое буфера обмена в конец каждой выделенной строки',
    category: 'Редактор',
    defaultKey: 'Ctrl+Shift+V'
  },
  {
    id: 'pasteAtStart',
    label: 'Вставить буфер в начало выделенных строк',
    description: 'Вставить содержимое буфера обмена в начало каждой выделенной строки',
    category: 'Редактор',
    defaultKey: 'Ctrl+Alt+V'
  },
  {
    id: 'moveLinesUp',
    label: 'Переместить строки вверх',
    description: 'Переместить выделенные строки (или текущую строку) на одну позицию вверх',
    category: 'Редактор',
    defaultKey: 'Alt+Up'
  },
  {
    id: 'moveLinesDown',
    label: 'Переместить строки вниз',
    description: 'Переместить выделенные строки (или текущую строку) на одну позицию вниз',
    category: 'Редактор',
    defaultKey: 'Alt+Down'
  },
  {
    id: 'toUpperCase',
    label: 'Преобразовать в ВЕРХНИЙ регистр',
    description: 'Перевести выделенный текст или слово в верхний регистр',
    category: 'Редактор',
    defaultKey: 'Ctrl+Shift+U'
  },
  {
    id: 'toLowerCase',
    label: 'Преобразовать в нижний регистр',
    description: 'Перевести выделенный текст или слово в нижний регистр',
    category: 'Редактор',
    defaultKey: 'Ctrl+Shift+L'
  },
  {
    id: 'quickActionsMenu',
    label: 'Меню быстрых действий',
    description: 'Вызвать меню быстрых действий под курсором в редакторе',
    category: 'Редактор',
    defaultKey: 'Ctrl+Q'
  },
  {
    id: 'openSnippets',
    label: 'Конструктор и шаблоны',
    description: 'Открыть окно готовых шаблонов кода',
    category: 'Редактор',
    defaultKey: 'Ctrl+K'
  },
  {
    id: 'toggleMaximized',
    label: 'Полноэкранный режим редактора',
    description: 'Развернуть/свернуть редактор на весь экран',
    category: 'Редактор',
    defaultKey: 'Alt+F'
  },
  {
    id: 'toggleTheme',
    label: 'Переключить тему (Dark / Light)',
    description: 'Сменить темную и светлую тему интерфейса',
    category: 'Общие',
    defaultKey: 'Alt+T'
  },
  {
    id: 'openSettings',
    label: 'Открыть настройки',
    description: 'Открыть модальное окно настроек',
    category: 'Общие',
    defaultKey: 'Ctrl+,'
  },
  {
    id: 'toggleColumnStats',
    label: 'Графики: Статистика по столбцам',
    description: 'Открыть графики в режиме статистики по столбцам',
    category: 'Общие',
    defaultKey: 'Alt+Q'
  },
  {
    id: 'exportResultsCopy',
    label: 'Копировать результаты в TSV',
    description: 'Копирование содержимого таблицы результатов в буфер обмена',
    category: 'Общие',
    defaultKey: 'Ctrl+Shift+E'
  },
  {
    id: 'refreshSchema',
    label: 'Обновить схему базы данных',
    description: 'Запустить повторное сканирование таблиц и метаданных активного подключения',
    category: 'Общие',
    defaultKey: 'Ctrl+R'
  },
  {
    id: 'escapeAction',
    label: 'Клавиша Esc (Отмена / Закрытие)',
    description: 'Отмена выполняющегося запроса, закрытие настроек и шаблонов',
    category: 'Общие',
    defaultKey: 'Esc'
  },
  {
    id: 'toggleMiniMap',
    label: 'Показать / скрыть миникарту',
    description: 'Включить навигатор-миникарту графа',
    category: 'Граф',
    defaultKey: 'Alt+M'
  },
  {
    id: 'exportGraph',
    label: 'Экспорт графа',
    description: 'Открыть меню экспорта в PNG, SVG, JSON, XML, Mermaid',
    category: 'Граф',
    defaultKey: 'Ctrl+E'
  },
  {
    id: 'tabSwitchModifier',
    label: 'Переключение вкладок (1–9)',
    description: 'Модификатор клавиш для быстрого перехода на вкладки от 1 до 9',
    category: 'Вкладки',
    defaultKey: 'Ctrl'
  }
];

const STORAGE_KEY = 'sql_visualizer_hotkeys_v1';

export function getSavedHotkeys(): Record<string, string> {
  const defaults: Record<string, string> = {};
  DEFAULT_HOTKEYS.forEach((h) => {
    defaults[h.id] = h.defaultKey;
  });
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...defaults, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load hotkeys', e);
  }
  return defaults;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  hotkeys: Record<string, string>;
  onUpdateHotkeys: (newHotkeys: Record<string, string>) => void;
  formatterSettings: FormatterSettings;
  onUpdateFormatterSettings: (newSettings: FormatterSettings) => void;
  uiVisibility: UiVisibilitySettings;
  onUpdateUiVisibility: (newSettings: UiVisibilitySettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  hotkeys,
  onUpdateHotkeys,
  formatterSettings,
  onUpdateFormatterSettings,
  uiVisibility,
  onUpdateUiVisibility
}) => {
  const [activeTab, setActiveTab] = useState<'formatter' | 'ui' | 'hotkeys' | 'excel'>('ui');
  const [listeningActionId, setListeningActionId] = useState<string | null>(null);

  // Excel Settings State
  const [excelSettings, setExcelSettings] = useState<ExcelSettings>(getSavedExcelSettings);

  const updateExcel = (partial: Partial<ExcelSettings>) => {
    const updated = { ...excelSettings, ...partial };
    setExcelSettings(updated);
    saveExcelSettings(updated);
  };

  const handleResetExcel = () => {
    const defaultSet = resetExcelSettings();
    setExcelSettings(defaultSet);
  };

  // Custom Autocomplete Templates State
  const [templates, setTemplates] = useState<AutocompleteTemplate[]>(getCustomAutocompleteTemplates);
  const [newKeyword, setNewKeyword] = useState<string>('');
  const [newInsertion, setNewInsertion] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKeyword, setEditKeyword] = useState<string>('');
  const [editInsertion, setEditInsertion] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');

  // Quick Action Templates State
  const [quickActions, setQuickActions] = useState<QuickActionTemplate[]>(getQuickActionTemplates);
  const [newQaName, setNewQaName] = useState<string>('');
  const [newQaTemplate, setNewQaTemplate] = useState<string>('');
  const [editingQaId, setEditingQaId] = useState<string | null>(null);
  const [editQaName, setEditQaName] = useState<string>('');
  const [editQaTemplate, setEditQaTemplate] = useState<string>('');

  const saveQuickActionsToStorage = (newActions: QuickActionTemplate[]) => {
    setQuickActions(newActions);
    localStorage.setItem('sql_quick_action_templates', JSON.stringify(newActions));
    window.dispatchEvent(new Event('sql_quick_actions_updated'));
  };

  const handleAddQuickAction = () => {
    if (!newQaName.trim() || !newQaTemplate.trim()) return;
    const newQa: QuickActionTemplate = {
      id: `qa-${Date.now()}`,
      name: newQaName.trim(),
      template: newQaTemplate.trim(),
    };
    const updated = [...quickActions, newQa];
    saveQuickActionsToStorage(updated);
    setNewQaName('');
    setNewQaTemplate('');
  };

  const handleDeleteQuickAction = (id: string) => {
    const updated = quickActions.filter(q => q.id !== id);
    saveQuickActionsToStorage(updated);
  };

  const handleResetQuickActions = () => {
    saveQuickActionsToStorage(DEFAULT_QUICK_ACTIONS);
  };

  const handleStartEditQuickAction = (qa: QuickActionTemplate) => {
    setEditingQaId(qa.id);
    setEditQaName(qa.name);
    setEditQaTemplate(qa.template);
  };

  const handleSaveEditQuickAction = () => {
    if (!editingQaId) return;
    const updated = quickActions.map(q => q.id === editingQaId ? {
      ...q,
      name: editQaName.trim() || q.name,
      template: editQaTemplate.trim() || q.template
    } : q);
    saveQuickActionsToStorage(updated);
    setEditingQaId(null);
  };

  const saveTemplatesToStorage = (newTpls: AutocompleteTemplate[]) => {
    setTemplates(newTpls);
    localStorage.setItem('sql_custom_autocomplete_templates', JSON.stringify(newTpls));
    window.dispatchEvent(new Event('sql_templates_updated'));
  };

  const handleAddTemplate = () => {
    if (!newKeyword.trim()) return;
    const kw = newKeyword.trim().toUpperCase();
    const newTpl: AutocompleteTemplate = {
      id: `tpl-${Date.now()}`,
      keyword: kw,
      insertion: newInsertion.trim() || `${kw} `,
      description: newDesc.trim() || undefined,
    };
    const updated = [...templates, newTpl];
    saveTemplatesToStorage(updated);
    setNewKeyword('');
    setNewInsertion('');
    setNewDesc('');
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    saveTemplatesToStorage(updated);
  };

  const handleStartEditTemplate = (tpl: AutocompleteTemplate) => {
    setEditingId(tpl.id);
    setEditKeyword(tpl.keyword);
    setEditInsertion(tpl.insertion || '');
    setEditDesc(tpl.description || '');
  };

  const handleSaveEditTemplate = () => {
    if (!editingId || !editKeyword.trim()) return;
    const kw = editKeyword.trim().toUpperCase();
    const updated = templates.map(t => {
      if (t.id === editingId) {
        return {
          ...t,
          keyword: kw,
          insertion: editInsertion.trim() || `${kw} `,
          description: editDesc.trim() || undefined,
        };
      }
      return t;
    });
    saveTemplatesToStorage(updated);
    setEditingId(null);
  };

  const handleResetTemplatesToDefault = () => {
    saveTemplatesToStorage(DEFAULT_AUTOCOMPLETE_TEMPLATES);
  };

  useEffect(() => {
    if (!listeningActionId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore standalone modifier keys
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let keyName = e.key ? e.key.toUpperCase() : '';
      if (e.code && e.code.startsWith('Key')) {
        keyName = e.code.slice(3).toUpperCase();
      } else if (e.code && e.code.startsWith('Digit')) {
        keyName = e.code.slice(5);
      } else if (e.code === 'Space' || e.key === ' ') {
        keyName = 'Space';
      } else if (e.code === 'Enter' || e.key === 'Enter') {
        keyName = 'Enter';
      } else if (e.code === 'Escape' || e.key === 'Escape') {
        keyName = 'Esc';
      } else if (e.code === 'Slash') {
        keyName = '/';
      } else if (e.code === 'Backslash') {
        keyName = '\\';
      } else if (e.code === 'Period') {
        keyName = '.';
      } else if (e.code === 'Comma') {
        keyName = ',';
      } else if (e.code === 'Semicolon') {
        keyName = ';';
      } else if (e.code === 'Quote') {
        keyName = "'";
      } else if (e.code === 'BracketLeft') {
        keyName = '[';
      } else if (e.code === 'BracketRight') {
        keyName = ']';
      } else if (e.code === 'Minus') {
        keyName = '-';
      } else if (e.code === 'Equal') {
        keyName = '=';
      } else if (e.code === 'Backquote') {
        keyName = '`';
      }

      const combo = parts.length > 0 ? `${parts.join('+')}+${keyName}` : keyName;

      const updated = { ...hotkeys, [listeningActionId]: combo };
      onUpdateHotkeys(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setListeningActionId(null);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [listeningActionId, hotkeys, onUpdateHotkeys]);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    if (activeTab === 'formatter') {
      onUpdateFormatterSettings(DEFAULT_FORMATTER_SETTINGS);
      localStorage.setItem(FORMATTER_STORAGE_KEY, JSON.stringify(DEFAULT_FORMATTER_SETTINGS));
    } else if (activeTab === 'ui') {
      onUpdateUiVisibility(DEFAULT_UI_VISIBILITY);
      localStorage.setItem(UI_VISIBILITY_STORAGE_KEY, JSON.stringify(DEFAULT_UI_VISIBILITY));
    } else {
      const defaults: Record<string, string> = {};
      DEFAULT_HOTKEYS.forEach((h) => {
        defaults[h.id] = h.defaultKey;
      });
      onUpdateHotkeys(defaults);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      setListeningActionId(null);
    }
  };

  const handleExportLocalStorage = async () => {
    try {
      // First, trigger immediate session save so current in-memory tabs and state are saved
      await new Promise<void>((resolve) => {
        window.dispatchEvent(new CustomEvent('sql_save_session_now', { detail: { onComplete: resolve } }));
      });

      const backupData: Record<string, unknown> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !key.toLowerCase().includes('vault') && !key.toLowerCase().includes('secret')) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            try {
              backupData[key] = JSON.parse(value);
            } catch (_) {
              backupData[key] = value;
            }
          }
        }
      }

      // Add IndexedDB version history
      try {
        const versions = await getVersions();
        backupData['sql_visualizer_version_history'] = versions;
      } catch (err) {
        console.warn('Failed to get IndexedDB versions for export:', err);
      }

      // Add IndexedDB schema cache at the very end of the JSON file
      try {
        const schemaCaches = await getAllSchemaCacheEntries();
        backupData['sql_visualizer_schema_cache_data'] = schemaCaches;
      } catch (err) {
        console.warn('Failed to get IndexedDB schema caches for export:', err);
      }

      // Add IndexedDB custom snippets
      try {
        const snippets = await loadSnippetsFromDB();
        backupData['sql_visualizer_snippets'] = snippets;
      } catch (err) {
        console.warn('Failed to get IndexedDB snippets for export:', err);
      }

      // Add IndexedDB session tabs
      try {
        const sessionTabs = await getSessionTabs();
        if (sessionTabs) {
          backupData['sql_visualizer_tabs_session'] = sessionTabs;
        }
      } catch (err) {
        console.warn('Failed to get IndexedDB session tabs for export:', err);
      }

      const workspaceBundle = {
        version: 1,
        app: 'QueryAST Lens Workspace Bundle',
        exportedAt: new Date().toISOString(),
        data: backupData
      };

      const blob = new Blob([JSON.stringify(workspaceBundle, null, 2)], { type: 'application/json' });
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadFileWithFallback(blob, `sql_visualizer_workspace_${dateStr}.json`);
    } catch (e) {
      console.error('Failed to export workspace', e);
      alert('Ошибка при экспорте данных');
    }
  };

  const handleImportLocalStorage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Invalid backup file format');
        }

        const dataObj: Record<string, unknown> = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;

        // Extract existing explicitly configured (non-default) DuckDB engine settings before clearing localStorage
        let existingDuckDbSettings: Partial<UiVisibilitySettings> = {};
        try {
          const rawUiVisibility = localStorage.getItem(UI_VISIBILITY_STORAGE_KEY) || localStorage.getItem('sql_visualizer_ui_visibility');
          if (rawUiVisibility) {
            const currentVis = JSON.parse(rawUiVisibility) as Partial<UiVisibilitySettings>;
            // Only preserve if explicitly set to a non-default value by the user
            if (currentVis.duckDbMemoryLimit && currentVis.duckDbMemoryLimit !== '8GB') {
              existingDuckDbSettings.duckDbMemoryLimit = currentVis.duckDbMemoryLimit;
            }
            if (currentVis.duckDbTempDirectory && currentVis.duckDbTempDirectory !== './tmp') {
              existingDuckDbSettings.duckDbTempDirectory = currentVis.duckDbTempDirectory;
            }
            if (currentVis.duckDbExtensionDirectory && currentVis.duckDbExtensionDirectory !== './extensions') {
              existingDuckDbSettings.duckDbExtensionDirectory = currentVis.duckDbExtensionDirectory;
            }
            if (currentVis.duckDbThreads !== undefined && Number(currentVis.duckDbThreads) !== 0) {
              existingDuckDbSettings.duckDbThreads = Number(currentVis.duckDbThreads);
            }
          }
        } catch {
          // Ignore parse errors on pre-existing localStorage
        }

        // Ensure session key compatibility (if old key exists without _v2)
        if (dataObj['sql_visualizer_session'] && !dataObj['sql_visualizer_session_v2']) {
          dataObj['sql_visualizer_session_v2'] = dataObj['sql_visualizer_session'];
        }

        // Merge existing explicit DuckDB settings into imported ui_visibility if present
        if (Object.keys(existingDuckDbSettings).length > 0) {
          const importedVisKey = dataObj[UI_VISIBILITY_STORAGE_KEY] ? UI_VISIBILITY_STORAGE_KEY : (dataObj['sql_visualizer_ui_visibility'] ? 'sql_visualizer_ui_visibility' : UI_VISIBILITY_STORAGE_KEY);
          let importedVisObj: Partial<UiVisibilitySettings> = {};
          if (dataObj[importedVisKey]) {
            try {
              importedVisObj = typeof dataObj[importedVisKey] === 'string'
                ? JSON.parse(dataObj[importedVisKey] as string)
                : (dataObj[importedVisKey] as Partial<UiVisibilitySettings>);
            } catch {
              importedVisObj = {};
            }
          }
          dataObj[UI_VISIBILITY_STORAGE_KEY] = {
            ...importedVisObj,
            ...existingDuckDbSettings,
          };
        }

        // Clear existing local storage so obsolete keys from before the import are removed
        localStorage.clear();

        let importedCount = 0;
        for (const [key, value] of Object.entries(dataObj)) {
          if (key === 'sql_visualizer_version_history' || key === 'versionHistory') {
            if (Array.isArray(value)) {
              await importVersions(value as SqlVersionItem[]);
            }
          } else if (key === 'sql_visualizer_schema_cache_data' || key === 'schemaCache' || key === 'schemaCacheData') {
            if (Array.isArray(value)) {
              await importSchemaCacheEntries(value as SchemaCacheEntry[]);
            }
          } else if (key === 'sql_visualizer_snippets' || key === 'snippets') {
            if (Array.isArray(value)) {
              await saveSnippetsToDB(value as Snippet[]);
            }
          } else if (key === 'sql_visualizer_tabs_session' || key === 'tabsSession') {
            if (Array.isArray(value)) {
              await saveSessionTabs(value as EditorTab[]);
            }
          } else if (typeof value === 'string') {
            localStorage.setItem(key, value);
            importedCount++;
          } else if (value !== null && typeof value === 'object') {
            localStorage.setItem(key, JSON.stringify(value));
            importedCount++;
          } else if (typeof value === 'boolean' || typeof value === 'number') {
            localStorage.setItem(key, JSON.stringify(value));
            importedCount++;
          }
        }

        // Mark session import flag so App.tsx unload listener doesn't overwrite imported session on page reload
        sessionStorage.setItem('sql_is_importing_session', 'true');

        alert(`Успешно импортировано рабочее пространство! Страница перезагружается...`);
        window.location.reload();
      } catch (err) {
        console.error('Failed to import workspace', err);
        alert('Ошибка при импорте. Проверьте формат JSON файла.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const updateFormatter = (partial: Partial<FormatterSettings>) => {
    const updated = { ...formatterSettings, ...partial };
    onUpdateFormatterSettings(updated);
    localStorage.setItem(FORMATTER_STORAGE_KEY, JSON.stringify(updated));
  };

  const toggleUiElement = (key: keyof UiVisibilitySettings) => {
    const updated = { ...uiVisibility, [key]: !uiVisibility[key] };
    onUpdateUiVisibility(updated);
    localStorage.setItem(UI_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
  };

  const updateDuckDbMaxRows = (val: number) => {
    const updated = { ...uiVisibility, duckDbMaxRows: val };
    onUpdateUiVisibility(updated);
    localStorage.setItem(UI_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
  };

  const updateDuckDbSettings = (partial: Partial<UiVisibilitySettings>) => {
    const updated = { ...uiVisibility, ...partial };
    onUpdateUiVisibility(updated);
    localStorage.setItem(UI_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
  };

  const updateClickhouseMaxRows = (val: number) => {
    const updated = { ...uiVisibility, clickhouseMaxRows: val };
    onUpdateUiVisibility(updated);
    localStorage.setItem(UI_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
  };

  const updateUiScale = (val: number) => {
    const updated = { ...uiVisibility, uiScale: val };
    onUpdateUiVisibility(updated);
    localStorage.setItem(UI_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
  };

  const categories: ('Редактор' | 'Вкладки' | 'Граф' | 'Общие')[] = ['Редактор', 'Вкладки', 'Граф', 'Общие'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 p-3 sm:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div
        style={{
          width: 'calc(min(735px, 78vw) / var(--zoom-scale, 1))',
          height: 'calc(85vh / var(--zoom-scale, 1))',
          maxWidth: 'calc(96vw / var(--zoom-scale, 1))',
          maxHeight: 'calc(95vh / var(--zoom-scale, 1))',
        }}
        className={`border rounded-xl flex flex-col shadow-2xl overflow-hidden transition-colors ${
          theme === 'dark'
            ? 'bg-slate-850 border-slate-700 text-slate-200'
            : 'bg-white border-slate-300 text-slate-800'
        }`}
      >
        {/* HEADER */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-b shrink-0 ${
            theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-blue-500" />
            <div className={`flex gap-1 p-1 rounded-lg border transition-colors ${
              theme === 'dark'
                ? 'bg-slate-900/40 border-slate-700/50'
                : 'bg-slate-200/80 border-slate-300'
            }`}>
              <button
                onClick={() => setActiveTab('ui')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  activeTab === 'ui'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/60'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Элементы UI</span>
              </button>
              <button
                onClick={() => setActiveTab('formatter')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  activeTab === 'formatter'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/60'
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span>Форматирование</span>
              </button>
              <button
                onClick={() => setActiveTab('hotkeys')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  activeTab === 'hotkeys'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/60'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Горячие клавиши</span>
              </button>
              {uiVisibility.showExcelExport !== false && (
                <button
                  onClick={() => setActiveTab('excel')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    activeTab === 'excel'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : theme === 'dark'
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-300/60'
                  }`}
                >
                  <FileSpreadsheet className={`w-3.5 h-3.5 ${activeTab === 'excel' ? 'text-white' : 'text-emerald-500'}`} />
                  <span>Экспорт Excel</span>
                </button>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-md transition-colors ${
              theme === 'dark'
                ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 p-5 overflow-y-auto space-y-6">
          {activeTab === 'ui' ? (
            <div className="space-y-6">
              {/* EDITOR PANEL UI TOGGLES */}
              <div className="space-y-3">
                <div className={`flex items-center justify-between border-b pb-1 ${
                  theme === 'dark' ? 'border-slate-700/50' : 'border-slate-300'
                }`}>
                  <h3 className={`text-xs uppercase font-bold tracking-wider ${
                    theme === 'dark' ? 'text-slate-400' : 'text-slate-900'
                  }`}>
                    Панель редактора SQL (слева)
                  </h3>
                  <button
                    onClick={handleResetDefaults}
                    className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border transition-colors ${
                      theme === 'dark'
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                        : 'bg-slate-100 border-slate-300 text-slate-900 font-bold hover:bg-slate-200 hover:text-slate-950'
                    }`}
                    title="Сбросить параметры к исходным значениям"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-500" />
                    <span>Сбросить</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { key: 'showDuckDbConfig', label: 'Интеграция DuckDB', desc: 'Кнопки подключения и выполнения кода' },
                    { key: 'showClickhouseConfig', label: 'Интеграция Clickhouse (http/https)', desc: 'Кнопки подключения и выполнения Clickhouse HTTP(S) запросов' },
                    { key: 'showExcelExport', label: 'Генерация Excel отчетов', desc: 'Экспорт результатов в Excel (.xlsx) и настройки форматирования' },
                    { key: 'autoUpdateSchema', label: 'Автообновление схемы базы', desc: 'Обновлять дерево схемы при изменении структуры БД (не применяется последовательно и параллельно)' },
                    { key: 'autocompleteOnType', label: 'Автокомплит при наборе текста', desc: 'Автоматически показывать подсказки при вводе каждого символа' },
                    { key: 'showEditorToggleBtn', label: 'Кнопка «Скрыть редактор»', desc: 'Кнопка скрытия левой панели' },
                    { key: 'showSearchSql', label: 'Кнопка «Поиск»', desc: 'Поиск и замена текста в редакторе (Ctrl+F)' },
                    { key: 'showOpenFile', label: 'Открыть файл (.sql)', desc: 'Загрузка файла с диска' },
                    { key: 'showWin1251Button', label: 'Кнопка «Win-1251»', desc: 'Открытие файла в кодировке Windows-1251' },
                    { key: 'showSaveFile', label: 'Сохранить файл (.sql)', desc: 'Скачивание текущего SQL' },
                    { key: 'showSnippets', label: 'Шаблоны и Конструктор', desc: 'Библиотека готовых фрагментов' },
                    { key: 'showHistory', label: 'История версий', desc: 'История снимков и автосохранений' },
                    { key: 'showMaximizeButton', label: 'Кнопка «Развернуть»', desc: 'Разворот редактора на весь экран' },
                    { key: 'showPresets', label: 'Кнопка «Пресеты»', desc: 'Быстрый выбор готовых SQL запросов' },
                    { key: 'showFormatSql', label: 'Кнопка «Формат»', desc: 'Авто-форматирование SQL' },
                    { key: 'showCompactSql', label: 'Кнопка «Формат в одну строку»', desc: 'Замена переносов строк на пробелы' },
                    { key: 'showCopySql', label: 'Кнопка «Copy SQL»', desc: 'Копирование текста в буфер обмена' },
                  ].map((item) => {
                    const isChecked = Boolean(uiVisibility[item.key as keyof UiVisibilitySettings]);
                    return (
                      <div
                        key={item.key}
                        className={`p-2.5 rounded-lg border transition-all ${
                          isChecked
                            ? theme === 'dark'
                              ? 'bg-slate-800/80 border-blue-500/50 text-slate-100'
                              : 'bg-blue-50/60 border-blue-300 text-slate-900'
                            : theme === 'dark'
                              ? 'bg-slate-850/40 border-slate-700/50 text-slate-400 opacity-60'
                              : 'bg-slate-50 border-slate-200 text-slate-500 opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            id={`toggle-${item.key}`}
                            checked={isChecked}
                            onChange={() => toggleUiElement(item.key as keyof UiVisibilitySettings)}
                            className="mt-0.5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <label htmlFor={`toggle-${item.key}`} className="cursor-pointer select-none block">
                              <div className="text-xs font-semibold">{item.label}</div>
                              <div className="text-[10px] opacity-75 mb-1">{item.desc}</div>
                            </label>
                            {item.key === 'showDuckDbConfig' && isChecked && (
                              <div className="mt-2.5 pt-2 border-t border-slate-700/40 space-y-2 text-[11px]" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-2">
                                  <span className="opacity-80 shrink-0">Max rows:</span>
                                  <input 
                                    type="number" 
                                    min="1" 
                                    step="10"
                                    value={uiVisibility.duckDbMaxRows ?? 100} 
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      if (!isNaN(val) && val > 0) updateDuckDbMaxRows(val);
                                    }}
                                    className={`w-20 px-1.5 py-0.5 text-xs rounded border outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                                  />
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={uiVisibility.duckDbAllowUnsignedExtensions ?? false}
                                    onChange={e => updateDuckDbSettings({ duckDbAllowUnsignedExtensions: e.target.checked })}
                                    className="rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                  />
                                  <span>allow_unsigned_extensions</span>
                                </label>

                                <div className="grid grid-cols-1 gap-1.5 pt-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="opacity-80 shrink-0">Memory Limit:</span>
                                    <input 
                                      type="text" 
                                      placeholder="8GB"
                                      value={uiVisibility.duckDbMemoryLimit ?? '8GB'} 
                                      onChange={e => updateDuckDbSettings({ duckDbMemoryLimit: e.target.value })}
                                      className={`w-28 px-1.5 py-0.5 text-xs rounded border outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                                    />
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <span className="opacity-80 shrink-0">Temp Directory:</span>
                                    <input 
                                      type="text" 
                                      placeholder="./tmp"
                                      value={uiVisibility.duckDbTempDirectory ?? './tmp'} 
                                      onChange={e => updateDuckDbSettings({ duckDbTempDirectory: e.target.value })}
                                      className={`w-28 px-1.5 py-0.5 text-xs rounded border outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                                    />
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <span className="opacity-80 shrink-0">Extensions Dir:</span>
                                    <input 
                                      type="text" 
                                      placeholder="./extensions"
                                      value={uiVisibility.duckDbExtensionDirectory ?? './extensions'} 
                                      onChange={e => updateDuckDbSettings({ duckDbExtensionDirectory: e.target.value })}
                                      className={`w-28 px-1.5 py-0.5 text-xs rounded border outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                                    />
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <span className="opacity-80 shrink-0">Threads (0 = auto):</span>
                                    <input 
                                      type="number" 
                                      min="0"
                                      max="128"
                                      value={uiVisibility.duckDbThreads ?? 0} 
                                      onChange={e => updateDuckDbSettings({ duckDbThreads: parseInt(e.target.value) || 0 })}
                                      className={`w-28 px-1.5 py-0.5 text-xs rounded border outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                            {item.key === 'showClickhouseConfig' && isChecked && (
                              <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <span className="text-[10px]">Max rows:</span>
                                <input 
                                  type="number" 
                                  min="1" 
                                  step="10"
                                  value={uiVisibility.clickhouseMaxRows ?? 100} 
                                  onChange={e => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val > 0) updateClickhouseMaxRows(val);
                                  }}
                                  className={`w-16 px-1.5 py-0.5 text-xs rounded border outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* GRAPH CANVAS UI TOGGLES */}
              <div className="space-y-3">
                <h3 className={`text-xs uppercase font-bold tracking-wider border-b pb-1 ${
                  theme === 'dark' ? 'text-slate-400 border-slate-700/50' : 'text-slate-900 border-slate-300'
                }`}>
                  Панель графа и холста (справа)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { key: 'showLayoutDirection', label: 'Переключатель Layout', desc: 'Ориентация Left-Right / Top-Bottom' },
                    { key: 'showSortLimitToggle', label: 'Кнопки Sort / Limit Nodes', desc: 'Фильтры отображения узлов' },
                    { key: 'showLineageFocus', label: 'Кнопка Lineage Focus', desc: 'Подсветка связей выделенного узла' },
                    { key: 'showMiniMapButton', label: 'Кнопка Миникарты', desc: 'Переключатель видимости миникарты' },
                    { key: 'showThemeToggle', label: 'Переключатель темы', desc: 'Смена Dark / Light темы' },
                    { key: 'showExportButton', label: 'Кнопка «Export» графа', desc: 'Экспорт схемы в PNG, SVG, JSON' },
                    { key: 'showGraphFooter', label: 'Подвал графа (Детали узлов)', desc: 'Нижняя панель информации о выбранном узле' },
                  ].map((item) => {
                    const isChecked = Boolean(uiVisibility[item.key as keyof UiVisibilitySettings]);
                    return (
                      <label
                        key={item.key}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          isChecked
                            ? theme === 'dark'
                              ? 'bg-slate-800/80 border-blue-500/50 text-slate-100'
                              : 'bg-blue-50/60 border-blue-300 text-slate-900'
                            : theme === 'dark'
                              ? 'bg-slate-850/40 border-slate-700/50 text-slate-400 opacity-60'
                              : 'bg-slate-50 border-slate-200 text-slate-500 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleUiElement(item.key as keyof UiVisibilitySettings)}
                          className="mt-0.5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0"
                        />
                        <div>
                          <div className="text-xs font-semibold">{item.label}</div>
                          <div className="text-[10px] opacity-75">{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* SNIPPETS LIBRARY UI TOGGLES */}
              <div className="space-y-3">
                <h3 className={`text-xs uppercase font-bold tracking-wider border-b pb-1 ${
                  theme === 'dark' ? 'text-slate-400 border-slate-700/50' : 'text-slate-900 border-slate-300'
                }`}>
                  Библиотека шаблонов (Окно)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { key: 'showSnippetSearch', label: 'Поиск по шаблонам', desc: 'Поле глобального поиска шаблонов' },
                    { key: 'showSnippetCategories', label: 'Категории шаблонов', desc: 'Вкладки диалектов и разделов' },
                    { key: 'showSnippetFavorites', label: 'Избранное', desc: 'Возможность отмечать шаблоны звездочкой' },
                    { key: 'showSnippetCreateBtn', label: 'Конструктор шаблонов', desc: 'Кнопка и форма «+ Создать шаблон»' },
                  ].map((item) => {
                    const isChecked = Boolean(uiVisibility[item.key as keyof UiVisibilitySettings]);
                    return (
                      <label
                        key={item.key}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          isChecked
                            ? theme === 'dark'
                              ? 'bg-slate-800/80 border-blue-500/50 text-slate-100'
                              : 'bg-blue-50/60 border-blue-300 text-slate-900'
                            : theme === 'dark'
                              ? 'bg-slate-850/40 border-slate-700/50 text-slate-400 opacity-60'
                              : 'bg-slate-50 border-slate-200 text-slate-500 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleUiElement(item.key as keyof UiVisibilitySettings)}
                          className="mt-0.5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0"
                        />
                        <div>
                          <div className="text-xs font-semibold">{item.label}</div>
                          <div className="text-[10px] opacity-75">{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* HISTORY MODAL UI TOGGLES */}
              <div className="space-y-3">
                <h3 className={`text-xs uppercase font-bold tracking-wider border-b pb-1 ${
                  theme === 'dark' ? 'text-slate-400 border-slate-700/50' : 'text-slate-900 border-slate-300'
                }`}>
                  История версий (Окно)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { key: 'showHistorySearch', label: 'Поиск по истории', desc: 'Строка поиска по прошлым версиям' },
                    { key: 'showHistoryManualSnapshot', label: 'Ручной снимок', desc: 'Поле ввода и кнопка «+ Снимок»' },
                    { key: 'showHistoryExport', label: 'Экспорт истории', desc: 'Кнопка сохранения всех снимков в JSON' },
                    { key: 'showHistoryDiff', label: 'Сравнение кодов (Diff)', desc: 'Переключатель просмотра изменений' },
                  ].map((item) => {
                    const isChecked = Boolean(uiVisibility[item.key as keyof UiVisibilitySettings]);
                    return (
                      <label
                        key={item.key}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          isChecked
                            ? theme === 'dark'
                              ? 'bg-slate-800/80 border-blue-500/50 text-slate-100'
                              : 'bg-blue-50/60 border-blue-300 text-slate-900'
                            : theme === 'dark'
                              ? 'bg-slate-850/40 border-slate-700/50 text-slate-400 opacity-60'
                              : 'bg-slate-50 border-slate-200 text-slate-500 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleUiElement(item.key as keyof UiVisibilitySettings)}
                          className="mt-0.5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0"
                        />
                        <div>
                          <div className="text-xs font-semibold">{item.label}</div>
                          <div className="text-[10px] opacity-75">{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* EXPORT MENU UI TOGGLES */}
              <div className="space-y-3">
                <h3 className={`text-xs uppercase font-bold tracking-wider border-b pb-1 ${
                  theme === 'dark' ? 'text-slate-400 border-slate-700/50' : 'text-slate-900 border-slate-300'
                }`}>
                  Меню Экспорта (Кнопка Export)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { key: 'showExportPngBg', label: 'PNG с фоном', desc: 'Растровая картинка с фоном темы' },
                    { key: 'showExportPngTransparent', label: 'PNG прозрачный', desc: 'Растровая картинка без фона' },
                    { key: 'showExportSvgBg', label: 'SVG с фоном', desc: 'Векторная картинка с фоном темы' },
                    { key: 'showExportSvgTransparent', label: 'SVG прозрачный', desc: 'Векторная картинка без фона' },
                    { key: 'showExportJpeg', label: 'JPEG с фоном', desc: 'Растровая картинка с фоном темы (JPEG)' },
                    { key: 'showExportJson', label: 'JSON Data', desc: 'Экспорт схемы в JSON формат' },
                    { key: 'showExportXml', label: 'XML Schema', desc: 'Экспорт схемы в XML формат' },
                    { key: 'showExportMermaid', label: 'Mermaid', desc: 'Экспорт графа в формат Mermaid' },
                    { key: 'showExportDrawio', label: 'Draw.io', desc: 'Экспорт графа для Draw.io (.drawio.xml)' },
                  ].map((item) => {
                    const isChecked = Boolean(uiVisibility[item.key as keyof UiVisibilitySettings]);
                    return (
                      <label
                        key={item.key}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          isChecked
                            ? theme === 'dark'
                              ? 'bg-slate-800/80 border-blue-500/50 text-slate-100'
                              : 'bg-blue-50/60 border-blue-300 text-slate-900'
                            : theme === 'dark'
                              ? 'bg-slate-850/40 border-slate-700/50 text-slate-400 opacity-60'
                              : 'bg-slate-50 border-slate-200 text-slate-500 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleUiElement(item.key as keyof UiVisibilitySettings)}
                          className="mt-0.5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0"
                        />
                        <div>
                          <div className="text-xs font-semibold">{item.label}</div>
                          <div className="text-[10px] opacity-75">{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* UI SCALE / ZOOM SETTING */}
              <div className="space-y-3 pt-1">
                <h3 className={`text-xs uppercase font-bold tracking-wider border-b pb-1 ${
                  theme === 'dark' ? 'text-slate-400 border-slate-700/50' : 'text-slate-900 border-slate-300'
                }`}>
                  Масштаб интерфейса (Zoom)
                </h3>
                <div className={`p-3.5 rounded-lg border space-y-3 ${
                  theme === 'dark' ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold">Масштаб всего приложения</div>                    </div>
                    <div className="flex items-center gap-2">
                      {(uiVisibility.uiScale ?? 100) !== 100 && (
                        <button
                          onClick={() => updateUiScale(100)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300 hover:text-white' : 'bg-slate-200 border-slate-300 text-slate-700 hover:text-black'
                          }`}
                        >
                          Сбросить (100%)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[67, 75, 80, 90, 100, 110, 125, 150].map((scaleVal) => (
                      <button
                        key={scaleVal}
                        onClick={() => updateUiScale(scaleVal)}
                        className={`px-2.5 py-1 text-xs rounded border transition-all ${
                          (uiVisibility.uiScale ?? 100) === scaleVal
                            ? 'bg-blue-600 border-blue-500 text-white font-bold shadow-2xs'
                            : theme === 'dark'
                            ? 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {scaleVal}%
                      </button>
                    ))}
                  </div>

                  {/* Range Slider */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[10px] opacity-60">50%</span>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={5}
                      value={uiVisibility.uiScale ?? 100}
                      onChange={(e) => updateUiScale(Number(e.target.value))}
                      className="flex-1 accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                    />
                    <span className="text-[10px] opacity-60">200%</span>
                  </div>
                </div>
              </div>

              {/* SECRETS VAULT SECTION */}
              <VaultSettingsSection theme={theme} />
            </div>
          ) : activeTab === 'formatter' ? (
            <div className="space-y-5">
              {/* EXPRESSION WIDTH / COLUMNS ON ONE LINE */}
              <div className={`p-4 rounded-xl border space-y-3 ${
                theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <label className={`font-bold text-xs block ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>
                      Перечисление столбцов и выражений в одну строку
                    </label>
                    <p className={`text-[11px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      Управляет порогом переноса строк (Expression Width). Повысьте значение, чтобы список столбцов `SELECT a, b, c` оставался в одну компактную строку.
                    </p>
                  </div>
                  <button
                    onClick={handleResetDefaults}
                    className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border transition-colors shrink-0 ${
                      theme === 'dark'
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                        : 'bg-slate-100 border-slate-300 text-slate-900 font-bold hover:bg-slate-200 hover:text-slate-950'
                    }`}
                    title="Сбросить параметры к исходным значениям"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-500" />
                    <span>Сбросить</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    { width: 1, label: 'По столбцам', desc: 'Каждый столбец с новой строки' },
                    { width: 80, label: '80 симв.', desc: 'Заполнение строк до 80 символов' },
                    { width: 120, label: '120 симв.', desc: 'Заполнение строк до 120 символов' }
                  ].map((preset) => (
                    <button
                      key={preset.width}
                      onClick={() => updateFormatter({ expressionWidth: preset.width })}
                      className={`flex-1 min-w-[140px] px-3 py-2 rounded-lg border text-left transition-all ${
                        formatterSettings.expressionWidth === preset.width
                          ? theme === 'dark'
                            ? 'border-blue-500 bg-blue-500/20 text-blue-400 shadow-xs'
                            : 'border-blue-600 bg-blue-100/90 text-blue-950 shadow-2xs'
                          : theme === 'dark'
                          ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                          : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">{preset.label}</div>
                      <div className={`text-[10px] ${
                        formatterSettings.expressionWidth === preset.width
                          ? theme === 'dark' ? 'text-blue-300' : 'text-blue-800'
                          : 'opacity-75'
                      }`}>{preset.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Макс. длина строки:</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={formatterSettings.expressionWidth}
                    onChange={(e) => updateFormatter({ expressionWidth: Math.max(1, parseInt(e.target.value) || 1) })}
                    className={`w-24 px-2.5 py-1 text-xs font-mono rounded border ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500">символов (1 = каждый столбец с новой строки)</span>
                </div>
              </div>

              {/* KEYWORD CASE */}
              <div className={`p-4 rounded-xl border space-y-3 ${
                theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <label className={`font-bold text-xs block ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>
                    Регистр ключевых слов (SELECT, FROM, WHERE...)
                  </label>
                  <p className={`text-[11px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    Приведение ключевых слов к верхнему или нижнему регистру
                  </p>
                </div>

                <div className="flex gap-2">
                  {[
                    { id: 'upper', label: 'UPPERCASE', example: 'SELECT * FROM' },
                    { id: 'lower', label: 'lowercase', example: 'select * from' },
                    { id: 'preserve', label: 'Сохранять', example: 'как написано' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => updateFormatter({ keywordCase: opt.id as any })}
                      className={`flex-1 px-3 py-2 rounded-lg border text-center transition-all ${
                        formatterSettings.keywordCase === opt.id
                          ? theme === 'dark'
                            ? 'border-blue-500 bg-blue-500/20 text-blue-400 shadow-xs'
                            : 'border-blue-600 bg-blue-100/90 text-blue-950 shadow-2xs'
                          : theme === 'dark'
                          ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                          : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className={`text-[10px] font-mono ${
                        formatterSettings.keywordCase === opt.id
                          ? theme === 'dark' ? 'text-blue-300' : 'text-blue-800'
                          : 'opacity-75'
                      }`}>{opt.example}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* INDENTATION & OPERATORS */}
              <div className={`p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-2 gap-4 ${
                theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <label className={`font-bold text-xs block mb-1.5 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>
                    Размер отступа
                  </label>
                  <select
                    value={formatterSettings.useTabs ? 'tab' : formatterSettings.tabWidth}
                    onChange={(e) => {
                      if (e.target.value === 'tab') {
                        updateFormatter({ useTabs: true, tabWidth: 2 });
                      } else {
                        updateFormatter({ useTabs: false, tabWidth: parseInt(e.target.value) || 2 });
                      }
                    }}
                    className={`w-full px-3 py-1.5 text-xs rounded border ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="2">2 пробела</option>
                    <option value="4">4 пробела</option>
                    <option value="tab">Табуляция (Tab)</option>
                  </select>
                </div>

                <div>
                  <label className={`font-bold text-xs block mb-1.5 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>
                    Плотные операторы
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={formatterSettings.denseOperators}
                      onChange={(e) => updateFormatter({ denseOperators: e.target.checked })}
                      className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className={`text-xs ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      Без пробелов вокруг операторов (`a+b`)
                    </span>
                  </label>
                </div>
              </div>

              {/* AUTOCOMPLETE TEMPLATES MANAGER */}
              <div className={`p-4 rounded-xl border space-y-4 ${
                theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <label className={`font-bold text-xs block ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>
                      Шаблоны автодополнения SQL (Autocomplete)
                    </label>
                    <p className={`text-[11px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      Добавляет, редактирует и удаляет пользовательские шаблоны для выпадающего списка автокомплита
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetTemplatesToDefault}
                    className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border font-semibold transition-colors shrink-0 ${
                      theme === 'dark'
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                    title="Восстановить стандартные шаблоны"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-500" />
                    <span>Сбросить шаблоны</span>
                  </button>
                </div>

                {/* ADD NEW TEMPLATE FORM */}
                <div className={`p-3 rounded-lg border space-y-2.5 ${
                  theme === 'dark' ? 'bg-slate-900/60 border-slate-700/60' : 'bg-white border-slate-200'
                }`}>
                  <div className="text-xs font-bold flex items-center gap-1.5 text-blue-500">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить новый шаблон</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Триггер (SELECT)"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      className={`w-full sm:w-28 px-2 py-1.5 text-xs font-mono rounded border outline-none shrink-0 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                    />
                    <input
                      type="text"
                      placeholder="Текст вставки (напр. SELECT * FROM )"
                      value={newInsertion}
                      onChange={(e) => setNewInsertion(e.target.value)}
                      className={`w-full sm:flex-1 px-2 py-1.5 text-xs font-mono rounded border outline-none min-w-0 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                    />
                    <input
                      type="text"
                      placeholder="Описание"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className={`w-full sm:w-32 px-2 py-1.5 text-xs rounded border outline-none shrink-0 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddTemplate}
                      disabled={!newKeyword.trim()}
                      className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded transition-colors shrink-0 flex items-center justify-center h-8 w-8"
                      title="Добавить шаблон"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* TEMPLATES LIST */}
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono ${
                        theme === 'dark' ? 'bg-slate-850/70 border-slate-700/60' : 'bg-white border-slate-250 shadow-2xs'
                      }`}
                    >
                      {editingId === tpl.id ? (
                        <div className="flex-1 flex flex-col sm:flex-row gap-1.5 items-center w-full min-w-0">
                          <input
                            type="text"
                            placeholder="Триггер"
                            value={editKeyword}
                            onChange={(e) => setEditKeyword(e.target.value)}
                            className={`w-full sm:w-28 shrink-0 px-2 py-1 text-xs font-mono rounded border min-w-0 ${
                              theme === 'dark' ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                          <input
                            type="text"
                            placeholder="Текст вставки"
                            value={editInsertion}
                            onChange={(e) => setEditInsertion(e.target.value)}
                            className={`w-full sm:flex-1 px-2 py-1 text-xs font-mono rounded border min-w-0 ${
                              theme === 'dark' ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                          <input
                            type="text"
                            placeholder="Описание"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className={`w-full sm:w-28 shrink-0 px-2 py-1 text-xs rounded border min-w-0 ${
                              theme === 'dark' ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                          <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={handleSaveEditTemplate}
                              className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-500 transition-colors"
                              title="Сохранить изменения"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 bg-slate-600 text-white rounded hover:bg-slate-500 transition-colors"
                              title="Отмена"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 overflow-hidden flex-1">
                            <Code className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="font-bold text-blue-400 shrink-0">{tpl.keyword}</span>
                            <span className={`text-[11px] truncate ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                              → {tpl.insertion || tpl.keyword}
                            </span>
                            {tpl.description && (
                              <span className={`text-[10px] italic truncate shrink-0 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                                ({tpl.description})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleStartEditTemplate(tpl)}
                              className={`p-1 rounded transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                              }`}
                              title="Редактировать шаблон"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(tpl.id)}
                              className="p-1 rounded text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                              title="Удалить шаблон"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* QUICK ACTIONS MANAGER */}
              <div className={`p-4 rounded-xl border space-y-4 ${
                theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <label className={`font-bold text-xs block ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>
                      Быстрые действия над результатами запроса (Quick Actions)
                    </label>
                    <p className={`text-[11px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      Настройка шаблонов быстрых действий для кнопки «Быстрые действия» (использует <code className="font-mono text-amber-500">{"{table}"}</code>)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetQuickActions}
                    className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border font-semibold transition-colors shrink-0 ${
                      theme === 'dark'
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                    title="Восстановить быстрые действия по умолчанию"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-500" />
                    <span>Сбросить действия</span>
                  </button>
                </div>

                {/* ADD QUICK ACTION FORM */}
                <div className={`p-3 rounded-lg border space-y-2.5 ${
                  theme === 'dark' ? 'bg-slate-900/60 border-slate-700/60' : 'bg-white border-slate-200'
                }`}>
                  <div className="text-xs font-bold flex items-center gap-1.5 text-amber-500">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить быстрое действие</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Название (напр. Схема)"
                      value={newQaName}
                      onChange={(e) => setNewQaName(e.target.value)}
                      className={`w-full sm:w-36 px-2 py-1.5 text-xs rounded border outline-none shrink-0 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-amber-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                      }`}
                    />
                    <input
                      type="text"
                      placeholder="Запрос (напр. SELECT * FROM {table} LIMIT 10;)"
                      value={newQaTemplate}
                      onChange={(e) => setNewQaTemplate(e.target.value)}
                      className={`w-full sm:flex-1 px-2 py-1.5 text-xs font-mono rounded border outline-none min-w-0 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-amber-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddQuickAction}
                      disabled={!newQaName.trim() || !newQaTemplate.trim()}
                      className="p-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs rounded transition-colors shrink-0 flex items-center justify-center h-8 w-8"
                      title="Добавить действие"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* QUICK ACTIONS LIST */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {quickActions.map((qa) => (
                    <div
                      key={qa.id}
                      className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono ${
                        theme === 'dark' ? 'bg-slate-850/70 border-slate-700/60' : 'bg-white border-slate-250 shadow-2xs'
                      }`}
                    >
                      {editingQaId === qa.id ? (
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 items-center w-full">
                          <input
                            type="text"
                            value={editQaName}
                            onChange={(e) => setEditQaName(e.target.value)}
                            className={`px-2 py-1 text-xs rounded border ${
                              theme === 'dark' ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editQaTemplate}
                              onChange={(e) => setEditQaTemplate(e.target.value)}
                              className={`flex-1 px-2 py-1 text-xs font-mono rounded border ${
                                theme === 'dark' ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={handleSaveEditQuickAction}
                              className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-500 transition-colors"
                              title="Сохранить изменения"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingQaId(null)}
                              className="p-1 bg-slate-600 text-white rounded hover:bg-slate-500 transition-colors"
                              title="Отмена"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 overflow-hidden flex-1">
                            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="font-bold text-amber-500 shrink-0">{qa.name}</span>
                            <span className={`text-[11px] font-mono truncate ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                              → {qa.template}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleStartEditQuickAction(qa)}
                              className={`p-1 rounded transition-colors ${
                                theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                              }`}
                              title="Редактировать действие"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuickAction(qa.id)}
                              className="p-1 rounded text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                              title="Удалить действие"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (activeTab === 'excel' && uiVisibility.showExcelExport !== false) ? (
            <ExcelSettingsTab
              theme={theme}
              excelSettings={excelSettings}
              updateExcel={updateExcel}
              handleResetExcel={handleResetExcel}
            />
          ) : (
            <div className="space-y-6">
              {categories.map((cat, index) => {
                const items = DEFAULT_HOTKEYS.filter((h) => h.category === cat);
                if (items.length === 0) return null;

                return (
                  <div key={cat} className="space-y-2">
                    <div className={`flex items-center justify-between border-b pb-1 ${
                      theme === 'dark' ? 'border-slate-700/50' : 'border-slate-300'
                    }`}>
                      <h3 className={`text-xs uppercase font-bold tracking-wider ${
                        theme === 'dark' ? 'text-slate-400' : 'text-slate-900'
                      }`}>
                        {cat}
                      </h3>
                      {index === 0 && (
                        <button
                          onClick={handleResetDefaults}
                          className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border transition-colors ${
                            theme === 'dark'
                              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                              : 'bg-slate-100 border-slate-300 text-slate-900 font-bold hover:bg-slate-200 hover:text-slate-950'
                          }`}
                          title="Сбросить параметры к исходным значениям"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-500" />
                          <span>Сбросить</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {items.map((item) => {
                        const currentKey = hotkeys[item.id] || item.defaultKey;
                        const isListening = listeningActionId === item.id;

                        return (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                              isListening
                                ? 'border-amber-500 bg-amber-500/10'
                                : theme === 'dark'
                                ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="pr-4">
                              <div className={`font-semibold text-xs ${
                                theme === 'dark' ? 'text-slate-100' : 'text-slate-900 font-bold'
                              }`}>
                                {item.label}
                              </div>
                              <div className={`text-[11px] ${
                                theme === 'dark' ? 'text-slate-400' : 'text-slate-700'
                              }`}>{item.description}</div>
                            </div>

                            {item.id === 'tabSwitchModifier' ? (
                              <select
                                value={hotkeys.tabSwitchModifier || 'Ctrl'}
                                onChange={(e) => {
                                  const updated = { ...hotkeys, tabSwitchModifier: e.target.value };
                                  onUpdateHotkeys(updated);
                                  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                                }}
                                className={`px-3 py-1.5 rounded font-mono text-xs font-bold border shadow-xs outline-none transition-all cursor-pointer ${
                                  theme === 'dark'
                                    ? 'bg-slate-750 border-slate-600 text-blue-400 hover:bg-slate-700'
                                    : 'bg-white border-slate-300 text-blue-800 font-bold hover:bg-slate-100'
                                }`}
                              >
                                <option value="Ctrl">Ctrl (Ctrl+1 .. Ctrl+9)</option>
                                <option value="Alt">Alt (Alt+1 .. Alt+9)</option>
                                <option value="Shift">Shift (Shift+1 .. Shift+9)</option>
                                <option value="Meta">Cmd / Win (Meta+1 .. Meta+9)</option>
                              </select>
                            ) : (
                              <button
                                onClick={() => setListeningActionId(isListening ? null : item.id)}
                                className={`px-3 py-1.5 rounded font-mono text-xs font-bold border shadow-xs transition-all shrink-0 min-w-[100px] text-center ${
                                  isListening
                                    ? 'bg-amber-500 text-slate-900 border-amber-400 animate-pulse'
                                    : theme === 'dark'
                                    ? 'bg-slate-750 hover:bg-slate-700 border-slate-600 text-blue-400 hover:text-blue-300'
                                    : 'bg-white hover:bg-slate-100 border-slate-300 text-blue-800 font-bold shadow-2xs'
                                }`}
                              >
                                {isListening ? 'Нажмите клавиши...' : currentKey}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          className={`p-3.5 px-5 border-t flex items-center justify-between shrink-0 gap-3 ${
            theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportLocalStorage}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition-all ${
                theme === 'dark'
                  ? 'bg-slate-750 hover:bg-slate-700 border-slate-600 text-slate-200'
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800 shadow-2xs'
              }`}
              title="Экспортировать все настройки, шаблоны и историю в JSON файл"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>Экспорт данных</span>
            </button>

            <label
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-750 hover:bg-slate-700 border-slate-600 text-slate-200'
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800 shadow-2xs'
              }`}
              title="Импортировать резервную копию JSON для переноса на другой ПК"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-500" />
              <span>Импорт данных</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportLocalStorage}
                className="hidden"
              />
            </label>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-md shadow-sm transition-colors"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

