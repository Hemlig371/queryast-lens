import React, { useRef, useState, useLayoutEffect, useEffect, useCallback, useMemo } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, X, CaseSensitive, Zap, Table } from 'lucide-react';
import { getSavedHotkeys, getSavedUiVisibilitySettings, getQuickActionTemplates, QuickActionTemplate } from './SettingsModal';

export interface AutocompleteTemplate {
  id: string;
  keyword: string;
  insertion?: string;
  description?: string;
}

export const DEFAULT_AUTOCOMPLETE_TEMPLATES: AutocompleteTemplate[] = [
  { id: 'tpl-1', keyword: 'SELECT * FROM', insertion: 'SELECT * FROM ', description: 'Базовая выборка из таблицы' },
  { id: 'tpl-2', keyword: 'LEFT JOIN', insertion: 'LEFT JOIN ', description: 'Левое соединение таблиц' },
  { id: 'tpl-3', keyword: 'GROUP BY', insertion: 'GROUP BY ', description: 'Группировка по полю' },
  { id: 'tpl-4', keyword: 'ORDER BY', insertion: 'ORDER BY ', description: 'Сортировка по полю' },
  { id: 'tpl-5', keyword: 'COUNT(DISTINCT)', insertion: 'COUNT(DISTINCT )', description: 'Подсчет уникальных значений' },
];

export const getCustomAutocompleteTemplates = (): AutocompleteTemplate[] => {
  try {
    const raw = localStorage.getItem('sql_custom_autocomplete_templates');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((t: any) => t && typeof t.keyword === 'string');
      }
    }
  } catch (e) {
    console.error('Failed to load custom templates', e);
  }
  return DEFAULT_AUTOCOMPLETE_TEMPLATES;
};

// Common SQL Keywords and Functions for Autocomplete
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN', 'CROSS JOIN',
  'IS NULL', 'IS NOT NULL', 'LIKE', 'ILIKE', 'QUALIFY', 'RETURNING', 'ASC', 'DESC',
  'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'RECURSIVE',
  'UNION ALL', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'PARTITION BY',
  'OVER', 'ROW_NUMBER()', 'DENSE_RANK()', 'RANK()', 'COUNT(*)', 'SUM()', 'AVG()',
  'MIN()', 'MAX()', 'COALESCE()', 'DATE_TRUNC()', 'DISTINCT',
  'ENGINE', 'SETTINGS', 'BEGIN TRANSACTION', 'COMMIT', 'ROLLBACK', 'ABORT'
];

// Helper function to provide syntax highlighting for SQL queries (PostgreSQL, Oracle, Clickhouse, DuckDB)
export const getBaseHighlight = (sqlText: string, theme: 'dark' | 'light') => {
  if (!sqlText) return '';

  let html = sqlText
    .replace(/\r/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const isDark = theme === 'dark';
  const kwColor = isDark ? 'text-blue-400' : 'text-blue-700';
  const fnColor = isDark ? 'text-purple-400' : 'text-purple-700';
  const strColor = isDark ? 'text-emerald-400' : 'text-emerald-700';
  const identColor = isDark ? 'text-teal-500' : 'text-teal-800';
  const numColor = isDark ? 'text-orange-300' : 'text-orange-500';
  const engineColor = isDark ? 'text-amber-300' : 'text-amber-500'; 
  const commentColor = isDark ? 'text-slate-500' : 'text-slate-500';

  const tokenRegex = /(--.*$|\/\*[\s\S]*?\*\/)|('(?:''|[^'\\]|\\.)*')|("(?:""|[^"\\]|\\.)*"|`(?:``|[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(\b(?:ENGINE|SETTINGS|DEFAULT)\b)|(\b(?:COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|NOW|CONCAT|DATE_TRUNC|DATE|INT|INTEGER|DOUBLE|VARCHAR|TEXT|DECIMAL|TIME|TIMESTAMP|BOOLEAN|BLOB|INTERVAL|UUID|Float(?:64|32|16|8)|Int(?:64|32|16|8)|UInt(?:64|32|16|8)|STRING|LOWER|UPPER|CAST|ROW_NUMBER|DENSE_RANK|RANK|LEAD|LAG|FIRST_VALUE|LAST_VALUE|LISTAGG|TO_CHAR|TO_DATE|NVL|DECODE|UNIQEXACT|UNIQCOMBINED|ARGMAX|ARGMIN|TOSTARTOFHOUR|TOSTARTOFDAY|QUANTILESEXACT|DICTGET|READ_CSV_AUTO|READ_PARQUET|READ_CSV|LIST_TRANSFORM|FILTER|JSON_EXTRACT|ARRAY_JOIN|ARRAYMAP|ARRAYFILTER)\b)|(\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|INSERT|INTO|UPDATE|SET|DELETE|CREATE|TABLE|AS|WITH|RECURSIVE|AND|OR|NOT|IN|IS|NULL|LIKE|ILIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|ASC|DESC|OVER|PARTITION|WINDOW|DISTINCT|VALUES|QUALIFY|PIVOT|UNPIVOT|COLUMNS|EXCLUDE|REPLACE|ATTACH|COPY|MERGE|MATCHED|USING|RETURNING|LATERAL|CONNECT|PRIOR|START|FINAL|UPSERT|CONFLICT|DO|RETURNING|BEGIN|TRANSACTION|COMMIT|ROLLBACK|ABORT)\b)/gim;

  html = html.replace(tokenRegex, (match, comment, str, ident, num, engineKw, fn, kw) => {
    if (comment) {
      return `<span class="${commentColor}">${comment}</span>`;
    }
    if (str) {
      return `<span class="${strColor}">${str}</span>`;
    }
    if (ident) {
      return `<span class="${identColor}">${ident}</span>`;
    }
    if (num) {
      return `<span class="${numColor}">${num}</span>`;
    }
    if (engineKw) {
      return `<span class="${engineColor}">${engineKw}</span>`;
    }
    if (fn) {
      return `<span class="${fnColor}">${fn}</span>`;
    }
    if (kw) {
      return `<span class="${kwColor}">${kw}</span>`;
    }
    return match;
  });

  if (sqlText.endsWith('\n')) {
    html += ' ';
  }

  return html;
};

export const processEscapeSequences = (str: string): string => {
  return str
    .replace(/\\\\/g, '\0ESC_BS\0')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\0ESC_BS\0/g, '\\');
};

export const matchHotkeyCombo = (e: KeyboardEvent | React.KeyboardEvent, targetShortcut: string): boolean => {
  if (!targetShortcut) return false;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CTRL');
  if (e.altKey) parts.push('ALT');
  if (e.shiftKey) parts.push('SHIFT');

  let keyName = e.key ? e.key.toUpperCase() : '';
  if (e.code && e.code.startsWith('Key')) {
    keyName = e.code.slice(3).toUpperCase();
  } else if (e.code && e.code.startsWith('Digit')) {
    keyName = e.code.slice(5);
  } else if (e.code === 'ArrowUp' || e.key === 'ArrowUp' || e.key === 'Up') {
    keyName = 'UP';
  } else if (e.code === 'ArrowDown' || e.key === 'ArrowDown' || e.key === 'Down') {
    keyName = 'DOWN';
  } else if (e.code === 'Space' || e.key === ' ') {
    keyName = 'SPACE';
  } else if (e.code === 'Enter' || e.key === 'Enter') {
    keyName = 'ENTER';
  } else if (e.code === 'Escape' || e.key === 'Esc' || e.key === 'Escape') {
    keyName = 'ESC';
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

  const pressedCombo = [...parts, keyName].join('+');

  const normalizeToken = (t: string) => {
    const upper = t.trim().toUpperCase();
    if (upper === 'CMD' || upper === 'META' || upper === 'CTRL') return 'CTRL';
    if (upper === 'ARROWUP' || upper === 'UP') return 'UP';
    if (upper === 'ARROWDOWN' || upper === 'DOWN') return 'DOWN';
    return upper;
  };

  const targetTokens = targetShortcut.split('+').map(normalizeToken).filter(Boolean);
  const pressedTokens = pressedCombo.split('+').map(normalizeToken).filter(Boolean);

  return pressedTokens.sort().join('+') === targetTokens.sort().join('+');
};

export const applySearchAndSelectionToHtml = (
  html: string,
  theme: 'dark' | 'light',
  searchQuery: string,
  matchCase: boolean,
  currentMatchIndex: number,
  selectedText: string,
  showSearch: boolean,
  useRegex: boolean = false
) => {
  let resultHtml = html;
  const isDark = theme === 'dark';

  const normalHighlightClass = isDark
    ? 'bg-amber-400/25 ring-1 ring-amber-400/40 rounded-[2px]'
    : 'bg-yellow-200/90 ring-1 ring-yellow-400/60 rounded-[2px]';

  const currentHighlightClass = isDark
    ? 'bg-amber-500/60 text-slate-100 ring-2 ring-amber-400 rounded-[2px] font-semibold shadow-xs'
    : 'bg-amber-300 text-slate-950 ring-2 ring-amber-500 rounded-[2px] font-semibold shadow-xs';

  if (showSearch && searchQuery && searchQuery.length > 0) {
    try {
      let regexPattern = '';
      if (useRegex) {
        regexPattern = processEscapeSequences(searchQuery);
      } else {
        const qHtml = searchQuery
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regexPattern = qHtml;
      }

      const flags = matchCase ? 'g' : 'gi';
      const regex = new RegExp(`(${regexPattern})`, flags);

      let globalMatchCount = 0;
      const parts = resultHtml.split(/(<[^>]+>)/g);

      resultHtml = parts.map(part => {
        if (part.startsWith('<') && part.endsWith('>')) {
          return part;
        }

        return part.replace(regex, (match) => {
          const isCurrent = globalMatchCount === currentMatchIndex;
          globalMatchCount++;

          const cls = isCurrent ? currentHighlightClass : normalHighlightClass;
          return `<span class="${cls}">${match}</span>`;
        });
      }).join('');
    } catch (e) {
      // Ignore invalid regex during typing
    }
  }

  if (selectedText && selectedText.trim().length > 0 && (!showSearch || !searchQuery)) {
    resultHtml = applySelectionToHtml(resultHtml, theme, selectedText);
  }

  return resultHtml;
};

export const applySelectionToHtml = (html: string, theme: 'dark' | 'light', selectedText: string) => {
  if (!selectedText || selectedText.trim().length === 0) return html;
  
  const trimmed = selectedText.trim();
  const escapedSearch = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const isWord = /^\w+$/.test(trimmed);
  const pattern = isWord ? `\\b${escapedSearch}\\b` : escapedSearch;
  const isDark = theme === 'dark';

  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const highlightClass = isDark
      ? 'bg-amber-400/25 ring-1 ring-amber-400/40 rounded-[2px]'
      : 'bg-yellow-200/90 ring-1 ring-yellow-400/60 rounded-[2px]';

    const parts = html.split(/(<[^>]+>)/g);
    return parts.map(part => {
      if (part.startsWith('<') && part.endsWith('>')) {
        return part;
      }
      return part.replace(regex, `<span class="${highlightClass}">${'$1'}</span>`);
    }).join('');
  } catch (e) {
    return html;
  }
};

const OPEN_BRACKETS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSE_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

export const findMatchingBrackets = (sql: string, cursorPos: number): [number, number] | null => {
  if (!sql || cursorPos < 0 || cursorPos > sql.length) return null;

  let targetIdx = -1;
  if (cursorPos > 0 && (OPEN_BRACKETS[sql[cursorPos - 1]] || CLOSE_BRACKETS[sql[cursorPos - 1]])) {
    targetIdx = cursorPos - 1;
  } else if (cursorPos < sql.length && (OPEN_BRACKETS[sql[cursorPos]] || CLOSE_BRACKETS[sql[cursorPos]])) {
    targetIdx = cursorPos;
  } else {
    return null;
  }

  const char = sql[targetIdx];
  if (OPEN_BRACKETS[char]) {
    const closeChar = OPEN_BRACKETS[char];
    let depth = 1;
    for (let i = targetIdx + 1; i < sql.length; i++) {
      const c = sql[i];
      if (c === char) depth++;
      else if (c === closeChar) {
        depth--;
        if (depth === 0) return [targetIdx, i];
      }
    }
  } else if (CLOSE_BRACKETS[char]) {
    const openChar = CLOSE_BRACKETS[char];
    let depth = 1;
    for (let i = targetIdx - 1; i >= 0; i--) {
      const c = sql[i];
      if (c === char) depth++;
      else if (c === openChar) {
        depth--;
        if (depth === 0) return [i, targetIdx];
      }
    }
  }

  return null;
};

export const applyBracketHighlightToHtml = (html: string, theme: 'dark' | 'light', indices: [number, number] | null) => {
  if (!indices) return html;
  const [idx1, idx2] = indices;
  const isDark = theme === 'dark';

  const highlightClass = isDark
    ? 'bg-blue-500/35 text-blue-200 ring-1 ring-blue-400/80 rounded-[2px] font-bold'
    : 'bg-blue-200 text-blue-900 ring-1 ring-blue-500/80 rounded-[2px] font-bold';

  const parts = html.split(/(<[^>]+>)/g);
  let currentPlainIdx = 0;

  return parts.map(part => {
    if (part.startsWith('<') && part.endsWith('>')) {
      return part;
    }

    let result = '';
    let i = 0;
    while (i < part.length) {
      let charStr = part[i];
      let entityLen = 1;

      if (part[i] === '&') {
        const entityMatch = part.slice(i).match(/^(&(?:lt|gt|amp|quot|#39);)/);
        if (entityMatch) {
          charStr = entityMatch[1];
          entityLen = entityMatch[1].length;
        }
      }

      if (currentPlainIdx === idx1 || currentPlainIdx === idx2) {
        result += `<span class="${highlightClass}">${charStr}</span>`;
      } else {
        result += charStr;
      }

      currentPlainIdx++;
      i += entityLen;
    }

    return result;
  }).join('');
};

export const highlightSqlHtml = (sqlText: string, theme: 'dark' | 'light', selectedText?: string) => {
  let html = getBaseHighlight(sqlText, theme);
  if (selectedText) {
    html = applySelectionToHtml(html, theme, selectedText);
  }
  return html;
};

export const splitHtmlIntoLines = (html: string): string[] => {
  if (!html) return [''];
  const rawLines = html.split('\n');
  if (rawLines.length <= 1) return rawLines;

  const result: string[] = [];
  const openTags: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const prefix = openTags.join('');
    const tagRegex = /<(\/)?([a-zA-Z0-9]+)(?:\s+[^>]*?)?>/g;
    let match: RegExpExecArray | null;
    const currentLineOpenTags: string[] = [...openTags];

    while ((match = tagRegex.exec(line)) !== null) {
      const isClosing = match[1] === '/';
      const fullTag = match[0];
      if (isClosing) {
        currentLineOpenTags.pop();
      } else if (!fullTag.endsWith('/>')) {
        currentLineOpenTags.push(fullTag);
      }
    }

    const suffix = currentLineOpenTags.map(() => '</span>').join('');
    result.push((prefix ? prefix : '') + line + suffix);
    openTags.length = 0;
    openTags.push(...currentLineOpenTags);
  }

  return result;
};

// Unified SqlEditor component with synced scrolling, line numbers, syntax highlighting & autocomplete

export interface SqlEditorRef {
  getSelection: () => { start: number; end: number; text: string } | null;
  replaceSelection: (newText: string) => void;
  setSelectionRange: (start: number, end: number) => void;
  replaceRange: (newText: string, start: number, end: number, selectionMode?: 'select' | 'start' | 'end' | 'preserve') => void;
}

const editorStyles: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '12px',
  lineHeight: '20px',
  padding: '12px',
  margin: 0,
  border: 'none',
  boxSizing: 'border-box',
  tabSize: 4,
  WebkitTextSizeAdjust: 'none',
  fontVariantLigatures: 'none',
  letterSpacing: 'normal',
  wordSpacing: 'normal',
};

export function SqlEditor({ 
  value: propValue, 
  onChange, 
  isWrapSql = false, 
  theme, 
  placeholder = "Enter SQL Query here...",
  minHeightClass = "min-h-0",
  height,
  onCompactSql,
  onExecuteQuickAction,
  extractedTableName,
  isQuickActionsEnabled = true,
  isFullScreen = false,
  editorRef
}: {
  value: string;
  onChange?: (val: string) => void;
  isWrapSql?: boolean;
  theme: 'dark' | 'light';
  placeholder?: string;
  minHeightClass?: string;
  height?: string;
  onCompactSql?: () => void;
  onExecuteQuickAction?: (qa: QuickActionTemplate) => void;
  extractedTableName?: string;
  isQuickActionsEnabled?: boolean;
  isFullScreen?: boolean;
  editorRef?: React.MutableRefObject<SqlEditorRef | null>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastCopiedTextRef = useRef<string>('');
  const pendingPasteModeRef = useRef<'start' | 'end' | null>(null);
  const dragSelectionRef = useRef<{ start: number; end: number; text: string } | null>(null);
  const charWidthRef = useRef<number>(7.221875);

  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      const span = document.createElement('span');
      span.style.fontFamily = editorStyles.fontFamily as string;
      span.style.fontSize = editorStyles.fontSize as string;
      span.style.lineHeight = editorStyles.lineHeight as string;
      span.style.visibility = 'hidden';
      span.style.position = 'absolute';
      span.style.whiteSpace = 'pre';
      span.textContent = 'M'.repeat(100);
      document.body.appendChild(span);
      const measured = span.getBoundingClientRect().width / 100;
      document.body.removeChild(span);
      if (measured > 0) {
        charWidthRef.current = measured;
      }
    }
  }, []);

  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const lineElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [value, setValue] = useState(propValue);

  useEffect(() => {
    if (propValue !== value) {
      setValue(propValue);
    }
  }, [propValue]); // do not add value as dependency to avoid infinite loops

  const pushChange = useCallback((newVal: string) => {
    setValue(newVal);
    if (onChange) {
      onChange(newVal);
    }
  }, [onChange]);
  useEffect(() => {
    if (editorRef) {
      editorRef.current = {
        getSelection: () => {
          if (!textareaRef.current) return null;
          const start = textareaRef.current.selectionStart;
          const end = textareaRef.current.selectionEnd;
          if (start === null || end === null) return null;
          return { start, end, text: value.slice(start, end) };
        },
        replaceSelection: (newText: string) => {
          if (!textareaRef.current) return;
          textareaRef.current.focus();
          document.execCommand('insertText', false, newText);
        },
        setSelectionRange: (start: number, end: number) => {
          if (!textareaRef.current) return;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(start, end);
        },
        replaceRange: (newText: string, start: number, end: number, selectionMode: 'select' | 'start' | 'end' | 'preserve' = 'preserve') => {
          if (!textareaRef.current) return;
          const el = textareaRef.current;
          el.focus();
          el.setRangeText(newText, start, end, selectionMode);
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          nativeInputValueSetter?.call(el, el.value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };
    }
  }, [editorRef, value, pushChange]);


  const [lineHeights, setLineHeights] = useState<number[]>([]);


  // Quick actions state
  const [showQuickActionsPopup, setShowQuickActionsPopup] = useState<boolean>(false);

  // Autocomplete states
  const [customTemplates, setCustomTemplates] = useState<AutocompleteTemplate[]>(getCustomAutocompleteTemplates);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const showAutocompleteRef = useRef<boolean>(showAutocomplete);
  useLayoutEffect(() => {
    showAutocompleteRef.current = showAutocomplete;
  }, [showAutocomplete]);
  const [caretPos, setCaretPos] = useState<{ top: number; left: number; isAbove?: boolean }>({ top: 30, left: 30, isAbove: false });

  const lineHeightsRef = useRef<number[]>([]);
  useEffect(() => {
    lineHeightsRef.current = lineHeights;
  }, [lineHeights]);

  // Selection & bracket highlight state
  const [selectedText, setSelectedText] = useState<string>('');
  const [cursorPos, setCursorPos] = useState<number>(-1);

  const handleSelectionChange = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    if (start !== null) {
      setCursorPos(start);
    }
    if (start !== end && start !== null && end !== null) {
      setShowAutocomplete(false);
      const sel = value.slice(start, end).trim();
      if (sel.length >= 1 && sel.length <= 100 && !sel.includes('\n')) {
        setSelectedText(sel);
        return;
      }
    }
    setSelectedText('');
  };

  const matchedBracketIndices = useMemo(() => {
    if (cursorPos < 0 || selectedText) return null;
    return findMatchingBrackets(value, cursorPos);
  }, [value, cursorPos, selectedText]);

  // Search and Replace states
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [showReplace, setShowReplace] = useState<boolean>(false);
  const [dragCaretPos, setDragCaretPos] = useState<{ top: number; left: number; height: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [matchCase, setMatchCase] = useState<boolean>(false);
  const [useRegex, setUseRegex] = useState<boolean>(false);
  const [matches, setMatches] = useState<{ start: number; length: number }[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const openSearchBox = useCallback((withReplace: boolean = false) => {
    let selText = '';
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== null && end !== null && start < end) {
        selText = textareaRef.current.value.slice(start, end).trim();
      }
    }
    if (!selText && selectedText) {
      selText = selectedText.trim();
    }

    setShowSearch(true);
    setShowReplace(withReplace);

    if (selText && selText.length <= 200 && !selText.includes('\n')) {
      setSearchQuery(selText);
    }

    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    }, 50);
  }, [selectedText]);

  useEffect(() => {
    const refreshTemplates = () => {
      setCustomTemplates(getCustomAutocompleteTemplates());
    };
    window.addEventListener('storage', refreshTemplates);
    window.addEventListener('sql_templates_updated', refreshTemplates);
    return () => {
      window.removeEventListener('storage', refreshTemplates);
      window.removeEventListener('sql_templates_updated', refreshTemplates);
    };
  }, []);

  const handleCompactSqlInternal = () => {
    if (onCompactSql) {
      onCompactSql();
      return;
    }
    if (!onChange) return;

    const convertInlineDash = (sql: string) => {
      return sql
        .split('\n')
        .map((line) => {
          let inString: string | null = null;
          let inBlock = false;
          let codeFound = false;
          let dashIdx = -1;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const next = line[i + 1];
            if (inString) {
              if (char === inString && line[i - 1] !== '\\') inString = null;
            } else if (inBlock) {
              if (char === '*' && next === '/') { inBlock = false; i++; }
            } else if (char === "'" || char === '"' || char === '`') {
              inString = char; codeFound = true;
            } else if (char === '/' && next === '*') {
              inBlock = true; i++;
            } else if (char === '-' && next === '-') {
              dashIdx = i; break;
            } else if (char !== ' ' && char !== '\t' && char !== '\r') {
              codeFound = true;
            }
          }
          if (dashIdx !== -1 && codeFound) {
            const before = line.slice(0, dashIdx);
            const cText = line.slice(dashIdx + 2).replace(/\*\//g, '* /');
            return `${before}/* ${cText.trim()} */`;
          }
          return line;
        })
        .join('\n');
    };

    const compactText = (text: string) => {
      if (!text) return text;
      const pre = convertInlineDash(text);
      const lines = pre.split('\n');
      const chunks: Array<{ type: 'comment' | 'code'; lines: string[] }> = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('--')) {
          chunks.push({ type: 'comment', lines: [trimmed] });
        } else {
          if (chunks.length > 0 && chunks[chunks.length - 1].type === 'code') {
            chunks[chunks.length - 1].lines.push(line);
          } else {
            chunks.push({ type: 'code', lines: [line] });
          }
        }
      }
      const res: string[] = [];
      for (const c of chunks) {
        if (c.type === 'comment') {
          res.push(c.lines[0]);
        } else {
          const block = c.lines.join('\n').trim();
          if (block) {
            res.push(block.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' '));
          }
        }
      }
      return res.join('\n');
    };

    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== null && end !== null && start !== end) {
        const selected = value.slice(start, end);
        const compacted = compactText(selected);
        textareaRef.current.focus();
        document.execCommand('insertText', false, compacted);
        return;
      }
    }
    const compacted = compactText(value);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      document.execCommand('insertText', false, compacted);
    }
  };

  const performPaste = useCallback((clipText: string, atEnd: boolean) => {
    if (!clipText || !textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === null || end === null) return;

    const currentValue = textarea.value;
    const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1;
    const effectiveEnd = (end > start && currentValue[end - 1] === '\n') ? end - 1 : end;
    let lineEnd = currentValue.indexOf('\n', effectiveEnd);
    if (lineEnd === -1) lineEnd = currentValue.length;

    const selectedBlock = currentValue.slice(lineStart, lineEnd);
    const lines = selectedBlock.split('\n');

    const newLines = lines.map(line => atEnd ? line + clipText : clipText + line);
    const newBlock = newLines.join('\n');

    textarea.focus();
    textarea.setSelectionRange(lineStart, lineEnd);
    document.execCommand('insertText', false, newBlock);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(lineStart, lineStart + newBlock.length);
      }
    }, 0);
  }, []);

  const handleMultiLinePaste = useCallback((atEnd: boolean) => {
    if (!textareaRef.current) return;
    pendingPasteModeRef.current = atEnd ? 'end' : 'start';

    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      navigator.clipboard.readText().then(clipText => {
        if (clipText) {
          lastCopiedTextRef.current = clipText;
          performPaste(clipText, atEnd);
          pendingPasteModeRef.current = null;
        } else if (lastCopiedTextRef.current) {
          performPaste(lastCopiedTextRef.current, atEnd);
          pendingPasteModeRef.current = null;
        }
      }).catch(() => {
        if (lastCopiedTextRef.current) {
          performPaste(lastCopiedTextRef.current, atEnd);
        }
        pendingPasteModeRef.current = null;
      });
    } else {
      if (lastCopiedTextRef.current) {
        performPaste(lastCopiedTextRef.current, atEnd);
      }
      pendingPasteModeRef.current = null;
    }
  }, [performPaste]);

  const handleMoveLines = useCallback((dir: 'up' | 'down') => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === null || end === null) return;

    const currentValue = textarea.value;
    const allLines = currentValue.split('\n');

    const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1;
    const effectiveEnd = (end > start && currentValue[end - 1] === '\n') ? end - 1 : end;
    let lineEnd = currentValue.indexOf('\n', effectiveEnd);
    if (lineEnd === -1) lineEnd = currentValue.length;

    const startLineIdx = currentValue.slice(0, lineStart).split('\n').length - 1;
    const endLineIdx = currentValue.slice(0, effectiveEnd).split('\n').length - 1;

    if (dir === 'up') {
      if (startLineIdx === 0) return;
      const prevLineIdx = startLineIdx - 1;
      const prevLineLen = allLines[prevLineIdx].length + 1;

      const blockToReplaceStart = currentValue.lastIndexOf('\n', lineStart - 2) + 1;
      const blockToReplaceEnd = lineEnd;

      const movedBlock = allLines.slice(startLineIdx, endLineIdx + 1);
      const swappedLine = [allLines[prevLineIdx]];
      const newBlock = [...movedBlock, ...swappedLine].join('\n');

      textarea.focus();
      textarea.setSelectionRange(blockToReplaceStart, blockToReplaceEnd);
      document.execCommand('insertText', false, newBlock);

      const newStart = start - prevLineLen;
      const newEnd = end - prevLineLen;

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newStart, newEnd);
        }
      }, 0);
    } else {
      if (endLineIdx === allLines.length - 1) return;
      const nextLineIdx = endLineIdx + 1;
      const nextLineLen = allLines[nextLineIdx].length + 1;

      const blockToReplaceStart = lineStart;
      let blockToReplaceEnd = currentValue.indexOf('\n', lineEnd + 1);
      if (blockToReplaceEnd === -1) blockToReplaceEnd = currentValue.length;

      const swappedLine = [allLines[nextLineIdx]];
      const movedBlock = allLines.slice(startLineIdx, endLineIdx + 1);
      const newBlock = [...swappedLine, ...movedBlock].join('\n');

      textarea.focus();
      textarea.setSelectionRange(blockToReplaceStart, blockToReplaceEnd);
      document.execCommand('insertText', false, newBlock);

      const newStart = start + nextLineLen;
      const newEnd = end + nextLineLen;

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newStart, newEnd);
        }
      }, 0);
    }
  }, []);

  const handleChangeCase = useCallback((targetCase: 'upper' | 'lower') => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === null || end === null) return;

    const currentValue = textarea.value;

    if (start !== end) {
      const selected = currentValue.slice(start, end);
      const converted = targetCase === 'upper' ? selected.toUpperCase() : selected.toLowerCase();

      textarea.focus();
      textarea.setSelectionRange(start, end);
      document.execCommand('insertText', false, converted);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(start, start + converted.length);
        }
      }, 0);
    } else {
      let wordStart = start;
      let wordEnd = start;

      while (wordStart > 0 && /[\w$]/.test(currentValue[wordStart - 1])) {
        wordStart--;
      }
      while (wordEnd < currentValue.length && /[\w$]/.test(currentValue[wordEnd])) {
        wordEnd++;
      }

      if (wordStart < wordEnd) {
        const word = currentValue.slice(wordStart, wordEnd);
        const converted = targetCase === 'upper' ? word.toUpperCase() : word.toLowerCase();

        textarea.focus();
        textarea.setSelectionRange(wordStart, wordEnd);
        document.execCommand('insertText', false, converted);

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(start, start);
          }
        }, 0);
      }
    }
  }, []);

  useEffect(() => {
    const handleDocumentCopyCut = () => {
      const sel = window.getSelection()?.toString();
      if (sel) {
        lastCopiedTextRef.current = sel;
      }
    };
    document.addEventListener('copy', handleDocumentCopyCut);
    document.addEventListener('cut', handleDocumentCopyCut);
    return () => {
      document.removeEventListener('copy', handleDocumentCopyCut);
      document.removeEventListener('cut', handleDocumentCopyCut);
    };
  }, []);

  // Global capture keyboard listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInsideEditor = textareaRef.current === activeEl ||
                             (searchInputRef.current && activeEl && (searchInputRef.current === activeEl || searchInputRef.current.parentElement?.contains(activeEl)));

      if (!isInsideEditor) return;

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
      const savedHotkeys = getSavedHotkeys();

      if (matchHotkeyCombo(e, savedHotkeys.pasteAtEnd || 'Ctrl+Shift+V')) {
        e.preventDefault();
        e.stopPropagation();
        handleMultiLinePaste(true);
        return;
      }
      if (matchHotkeyCombo(e, savedHotkeys.pasteAtStart || 'Ctrl+Alt+V')) {
        e.preventDefault();
        e.stopPropagation();
        handleMultiLinePaste(false);
        return;
      }
      if (matchHotkeyCombo(e, savedHotkeys.moveLinesUp || 'Alt+Up')) {
        e.preventDefault();
        e.stopPropagation();
        handleMoveLines('up');
        return;
      }
      if (matchHotkeyCombo(e, savedHotkeys.moveLinesDown || 'Alt+Down')) {
        e.preventDefault();
        e.stopPropagation();
        handleMoveLines('down');
        return;
      }
      if (matchHotkeyCombo(e, savedHotkeys.toUpperCase || 'Ctrl+Shift+U')) {
        e.preventDefault();
        e.stopPropagation();
        handleChangeCase('upper');
        return;
      }
      if (matchHotkeyCombo(e, savedHotkeys.toLowerCase || 'Ctrl+Shift+L')) {
        e.preventDefault();
        e.stopPropagation();
        handleChangeCase('lower');
        return;
      }

      const targetSearchCombo = savedHotkeys.searchSql || 'Ctrl+F';
      const targetReplaceCombo = savedHotkeys.replaceSql || 'Ctrl+H';
      const targetCompactCombo = savedHotkeys.compactSql || 'Ctrl+Alt+M';
      const targetQuickActionsCombo = savedHotkeys.quickActionsMenu || 'Ctrl+Q';

      const isSearch = combo === targetSearchCombo || (!e.shiftKey && (e.ctrlKey || e.metaKey) && (e.code === 'KeyF' || e.key?.toLowerCase() === 'f' || e.key?.toLowerCase() === 'а'));
      const isReplace = combo === targetReplaceCombo || (!e.shiftKey && (e.ctrlKey || e.metaKey) && (e.code === 'KeyH' || e.key?.toLowerCase() === 'h' || e.key?.toLowerCase() === 'р'));
      const isCompact = combo === targetCompactCombo || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyU' || e.key?.toLowerCase() === 'u' || e.key?.toLowerCase() === 'г'));
      const isQuickActions = combo === targetQuickActionsCombo || (!e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey) && (e.code === 'KeyQ' || e.key?.toLowerCase() === 'q' || e.key?.toLowerCase() === 'й'));

      if (isSearch) {
        e.preventDefault();
        e.stopPropagation();
        openSearchBox(false);
      } else if (isReplace) {
        e.preventDefault();
        e.stopPropagation();
        openSearchBox(true);
      } else if (isCompact) {
        e.preventDefault();
        e.stopPropagation();
        handleCompactSqlInternal();
      } else if (isQuickActions) {
        if (!isQuickActionsEnabled || !onExecuteQuickAction) return;
        e.preventDefault();
        e.stopPropagation();
        if (textareaRef.current) {
          const textarea = textareaRef.current;
          const curVal = textarea.value;
          const cursor = textarea.selectionStart || 0;
          const textBefore = curVal.slice(0, cursor);
          const linesBefore = textBefore.split('\n');
          const lineIdx = linesBefore.length - 1;
          const colIdx = linesBefore[lineIdx].length;

          const scrollTop = textarea.scrollTop;
          const scrollLeft = textarea.scrollLeft;

          const currentHeights = lineHeightsRef.current;
          const prevHeightsSum = currentHeights.slice(0, lineIdx).reduce((acc, h) => acc + (h || 20), 0);
          const lHeight = currentHeights[lineIdx] || 20;

          const lineTop = 12 + prevHeightsSum - scrollTop;
          const lineBottom = lineTop + lHeight;
          let left = 12 + colIdx * charWidthRef.current - scrollLeft;

          const editorHeight = textarea.clientHeight;
          const editorWidth = textarea.clientWidth;

          const templates = getQuickActionTemplates();
          const estimatedPopupHeight = Math.min(220, 36 + templates.length * 28);

          const spaceBelow = editorHeight - lineBottom;
          const spaceAbove = lineTop;

          let top = lineBottom + 4;
          let isAbove = false;

          if (spaceBelow < estimatedPopupHeight) {
            if (spaceAbove > estimatedPopupHeight || spaceAbove > spaceBelow) {
              top = lineTop - 4;
              isAbove = true;
              
              // If it still doesn't fit above, just cap it so it doesn't go off top
              if (top - estimatedPopupHeight < 8) {
                // Remove isAbove and just anchor it to top or bottom safely
                isAbove = false;
                top = Math.max(8, editorHeight - estimatedPopupHeight - 8);
              }
            } else {
              // Not enough space above or below, just cap bottom
              top = Math.max(8, editorHeight - estimatedPopupHeight - 8);
            }
          }

          if (left + 240 > editorWidth) {
            left = Math.max(10, editorWidth - 240);
          }
          if (left < 10) left = 10;

          setCaretPos({ top, left, isAbove });
        }
        setShowQuickActionsPopup(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, []);

  const sqlLines = value.split('\n');

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setShowReplace(false);
    setSearchQuery('');
    setReplaceQuery('');
    setMatches([]);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Compute search matches when query or text changes
  useEffect(() => {
    if (!showSearch) return;
    if (!searchQuery) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    const matchIndices: { start: number; length: number }[] = [];
    const text = value;

    if (useRegex) {
      try {
        const processed = processEscapeSequences(searchQuery);
        const reg = new RegExp(processed, matchCase ? 'g' : 'gi');
        let match: RegExpExecArray | null;
        let lastIndex = -1;
        while ((match = reg.exec(text)) !== null) {
          matchIndices.push({ start: match.index, length: match[0].length });
          if (reg.lastIndex === lastIndex) {
            reg.lastIndex++;
          }
          lastIndex = reg.lastIndex;
          if (!reg.global) break;
        }
      } catch (e) {
        // Invalid regex during typing
      }
    } else {
      const q = matchCase ? searchQuery : searchQuery.toLowerCase();
      const src = matchCase ? text : text.toLowerCase();
      let pos = 0;
      while ((pos = src.indexOf(q, pos)) !== -1) {
        matchIndices.push({ start: pos, length: searchQuery.length });
        pos += Math.max(1, q.length);
      }
    }

    setMatches(matchIndices);
    if (matchIndices.length > 0) {
      setCurrentMatchIndex(0);
      selectMatch(matchIndices[0].start, matchIndices[0].length, false);
    } else {
      setCurrentMatchIndex(-1);
    }
  }, [showSearch, searchQuery, value, matchCase, useRegex]);

  const selectMatch = (startPos: number, matchLen: number, shouldFocusTextarea: boolean = false) => {
    if (textareaRef.current) {
      if (shouldFocusTextarea) {
        textareaRef.current.focus();
      }
      textareaRef.current.setSelectionRange(startPos, startPos + matchLen);
      const linesBefore = value.slice(0, startPos).split('\n');
      const lineIdx = linesBefore.length - 1;
      const lHeight = lineHeights[lineIdx] || 20;
      textareaRef.current.scrollTop = Math.max(0, lineIdx * lHeight - 60);
    }
  };

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIdx);
    selectMatch(matches[nextIdx].start, matches[nextIdx].length, false);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    selectMatch(matches[prevIdx].start, matches[prevIdx].length, false);
  };

  const handleReplaceCurrent = () => {
    if (currentMatchIndex < 0 || matches.length === 0 || !onChange) return;
    const match = matches[currentMatchIndex];
    const effectiveReplace = useRegex ? processEscapeSequences(replaceQuery) : replaceQuery;
    let replacementText = effectiveReplace;

    if (useRegex) {
      try {
        const matchedSubstring = value.slice(match.start, match.start + match.length);
        const processedSearch = processEscapeSequences(searchQuery);
        const reg = new RegExp(processedSearch, matchCase ? '' : 'i');
        replacementText = matchedSubstring.replace(reg, effectiveReplace);
      } catch (e) {
        // Fallback to direct replacement string on regex parse issue
      }
    }

    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(match.start, match.start + match.length);
      document.execCommand('insertText', false, replacementText);
    }
  };

  const handleReplaceAll = () => {
    if (matches.length === 0 || !onChange || !searchQuery) return;
    try {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const effectiveReplace = useRegex ? processEscapeSequences(replaceQuery) : replaceQuery;
      let reg: RegExp;
      if (useRegex) {
        const processed = processEscapeSequences(searchQuery);
        reg = new RegExp(processed, matchCase ? 'g' : 'gi');
      } else {
        const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        reg = new RegExp(escaped, matchCase ? 'g' : 'gi');
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const currentMatch = matches[currentMatchIndex];
      const isAutoSelectedMatch = currentMatch && start === currentMatch.start && end === (currentMatch.start + currentMatch.length);
      const hasManualSelection = start !== end && !isAutoSelectedMatch;

      textarea.focus();

      if (hasManualSelection) {
        const selectedText = value.slice(start, end);
        const newSelectedText = selectedText.replace(reg, effectiveReplace);
        textarea.setSelectionRange(start, end);
        document.execCommand('insertText', false, newSelectedText);
        textarea.setSelectionRange(start, start + newSelectedText.length);
      } else {
        const newValue = value.replace(reg, effectiveReplace);
        textarea.select();
        document.execCommand('insertText', false, newValue);
      }
    } catch (e) {
      // Invalid regex
    }
  };

  const [hScrollbarHeight, setHScrollbarHeight] = useState(0);

  const checkHScrollbar = useCallback(() => {
    if (isWrapSql || !textareaRef.current) {
      setHScrollbarHeight(0);
      return;
    }
    const el = textareaRef.current;
    const hasHScroll = el.scrollWidth > el.clientWidth;
    if (hasHScroll) {
      const sbHeight = el.offsetHeight - el.clientHeight;
      setHScrollbarHeight(sbHeight > 0 ? sbHeight : 15);
    } else {
      setHScrollbarHeight(0);
    }
  }, [isWrapSql]);

  const handleScroll = () => {
    if (textareaRef.current) {
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = textareaRef.current.scrollTop;
        highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
      checkHScrollbar();
    }
  };

  const recalculateHeights = useCallback(() => {
    const count = value.split('\n').length || 1;
    // Fast path: if word wrap is disabled, each line is standard 20px
    if (!isWrapSql) {
      setLineHeights(prev => {
        if (prev.length === count && prev.every(h => h === 20)) return prev;
        return new Array(count).fill(20);
      });
      return;
    }

    const els = lineElementsRef.current;
    if (!els || els.length === 0) {
      setLineHeights(prev => (prev.length === count && prev.every(h => h === 20)) ? prev : new Array(count).fill(20));
      return;
    }

    const heights: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const el = els[i];
      const h = el ? el.getBoundingClientRect().height : 20;
      const rawHeight = h && h > 0 ? h : 20;
      // Round to the nearest multiple of 20 (the fixed line height)
      heights[i] = Math.max(20, Math.round(rawHeight / 20) * 20);
    }

    setLineHeights(prev => {
      if (prev.length === heights.length && prev.every((h, idx) => h === heights[idx])) {
        return prev;
      }
      return heights;
    });
  }, [isWrapSql, value]);

  useLayoutEffect(() => {
    recalculateHeights();
    checkHScrollbar();
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        recalculateHeights();
        checkHScrollbar();
      });
    }
  }, [value, isWrapSql, recalculateHeights, checkHScrollbar]);

  const recalculateHeightsRef = useRef(recalculateHeights);
  useLayoutEffect(() => {
    recalculateHeightsRef.current = recalculateHeights;
  }, [recalculateHeights]);

  useEffect(() => {
    if (!textareaRef.current) return;
    let animFrameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(() => {
        recalculateHeightsRef.current();
        checkHScrollbar();
      });
    });
    observer.observe(textareaRef.current);
    if (highlightRef.current) {
      observer.observe(highlightRef.current);
    }
    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      observer.disconnect();
    };
  }, []);

  // Check cursor and compute suggestions
  const updateAutocomplete = (forceShow = false) => {
    if (!textareaRef.current || !onChange) return;
    const cursor = textareaRef.current.selectionStart;
    const cursorEnd = textareaRef.current.selectionEnd;

    // Do not show autocomplete dropdown if text range or multi-line selection is active
    if (cursor !== cursorEnd) {
      setShowAutocomplete(false);
      return;
    }

    const uiVis = getSavedUiVisibilitySettings();
    const autocompleteOnType = uiVis.autocompleteOnType ?? false;

    if (!showAutocompleteRef.current && !forceShow && !autocompleteOnType) {
      return;
    }

    const textBefore = value.slice(0, cursor);
    const match = textBefore.match(/([a-zA-Z_][a-zA-Z_0-9]*)$/);

    if (match || forceShow) {
      const typed = match ? match[1].toUpperCase() : '';
      const customKeywords = customTemplates
        .filter(t => t && typeof t.keyword === 'string')
        .map(t => t.keyword);
      const allKeywords = Array.from(new Set([...customKeywords, ...SQL_KEYWORDS]));
      const filtered = allKeywords.filter(kw => 
        kw && typeof kw === 'string' && (typed ? (kw.toUpperCase().startsWith(typed) && kw.toUpperCase() !== typed) : true)
      ).slice(0, 8);

      if (filtered.length > 0) {
        setSuggestions(filtered);
        setSelectedIndex(0);

        // Compute caret position under cursor
        const linesBefore = textBefore.split('\n');
        const lineIdx = linesBefore.length - 1;
        const colIdx = linesBefore[lineIdx].length;

        const scrollTop = textareaRef.current.scrollTop;
        const scrollLeft = textareaRef.current.scrollLeft;

        const prevHeightsSum = lineHeights.slice(0, lineIdx).reduce((acc, h) => acc + (h || 20), 0);
        const lHeight = lineHeights[lineIdx] || 20;

        const lineTop = 12 + prevHeightsSum - scrollTop;
        const lineBottom = lineTop + lHeight;
        let left = 12 + colIdx * charWidthRef.current - scrollLeft;

        const editorHeight = textareaRef.current.clientHeight;
        const editorWidth = textareaRef.current.clientWidth;

        // Estimate actual popup height: ~36px header/padding + ~28px per item (max 200px)
        const estimatedPopupHeight = Math.min(200, 36 + filtered.length * 28);

        const spaceBelow = editorHeight - lineBottom;
        const spaceAbove = lineTop;

        let top = lineBottom + 4;
        let isAbove = false;

        if (spaceBelow < estimatedPopupHeight) {
          if (spaceAbove > estimatedPopupHeight || spaceAbove > spaceBelow) {
            top = lineTop - 4;
            isAbove = true;
            
            // If it still doesn't fit above, just cap it so it doesn't go off top
            if (top - estimatedPopupHeight < 8) {
              isAbove = false;
              top = Math.max(8, editorHeight - estimatedPopupHeight - 8);
            }
          } else {
            // Not enough space above or below, just cap bottom
            top = Math.max(8, editorHeight - estimatedPopupHeight - 8);
          }
        }

        if (left + 240 > editorWidth) {
          left = Math.max(10, editorWidth - 240);
        }
        if (left < 10) left = 10;

        setCaretPos({ top, left, isAbove });
        setShowAutocomplete(true);
        return;
      }
    }
    setShowAutocomplete(false);
  };

  const applySuggestion = (keyword: string) => {
    if (!textareaRef.current || !onChange) return;
    const cursor = textareaRef.current.selectionStart;
    const textBefore = value.slice(0, cursor);
    const textAfter = value.slice(cursor);
    const match = textBefore.match(/([a-zA-Z_][a-zA-Z_0-9]*)$/);

    if (match) {
      const wordStart = cursor - match[1].length;
      // Check if keyword corresponds to a custom template insertion
      const customTpl = customTemplates.find(t => t.keyword === keyword);
      let insertion = keyword + ' ';
      if (customTpl && customTpl.insertion) {
        insertion = customTpl.insertion;
      } else if (keyword.endsWith('()')) {
        insertion = keyword.slice(0, -1);
      }

      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(wordStart, cursor);
      document.execCommand('insertText', false, insertion);
      setShowAutocomplete(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const savedHotkeys = getSavedHotkeys();

    if (matchHotkeyCombo(e, savedHotkeys.pasteAtEnd || 'Ctrl+Shift+V')) {
      e.preventDefault();
      e.stopPropagation();
      handleMultiLinePaste(true);
      return;
    }
    if (matchHotkeyCombo(e, savedHotkeys.pasteAtStart || 'Ctrl+Alt+V')) {
      e.preventDefault();
      e.stopPropagation();
      handleMultiLinePaste(false);
      return;
    }
    if (matchHotkeyCombo(e, savedHotkeys.moveLinesUp || 'Alt+Up')) {
      e.preventDefault();
      e.stopPropagation();
      handleMoveLines('up');
      return;
    }
    if (matchHotkeyCombo(e, savedHotkeys.moveLinesDown || 'Alt+Down')) {
      e.preventDefault();
      e.stopPropagation();
      handleMoveLines('down');
      return;
    }
    if (matchHotkeyCombo(e, savedHotkeys.toUpperCase || 'Ctrl+Shift+U')) {
      e.preventDefault();
      e.stopPropagation();
      handleChangeCase('upper');
      return;
    }
    if (matchHotkeyCombo(e, savedHotkeys.toLowerCase || 'Ctrl+Shift+L')) {
      e.preventDefault();
      e.stopPropagation();
      handleChangeCase('lower');
      return;
    }

    if (e.key === 'Escape') {
      if (showSearch) {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
        return;
      }
      if (showQuickActionsPopup) {
        e.preventDefault();
        e.stopPropagation();
        setShowQuickActionsPopup(false);
        return;
      }
    }

    if (showQuickActionsPopup) {
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        const actions = getQuickActionTemplates();
        if (actions[idx] && onExecuteQuickAction) {
          e.preventDefault();
          e.stopPropagation();
          setShowQuickActionsPopup(false);
          onExecuteQuickAction(actions[idx]);
          return;
        }
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      // Synchronous changes are already pushed, no action needed here
    }

    // Hotkeys Ctrl+F / Cmd+F and Ctrl+H / Cmd+H for Search & Replace
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key?.toLowerCase() === 'f') {
      e.preventDefault();
      openSearchBox(false);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key?.toLowerCase() === 'h') {
      e.preventDefault();
      openSearchBox(true);
      return;
    }

    if (matchHotkeyCombo(e, savedHotkeys.triggerAutocomplete || 'Ctrl+Space')) {
      e.preventDefault();
      e.stopPropagation();
      updateAutocomplete(true);
      return;
    }

    if (showAutocomplete && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        applySuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowAutocomplete(false);
        return;
      }
    }

    if (e.key === 'Tab') {
      const startPos = textareaRef.current?.selectionStart;
      const endPos = textareaRef.current?.selectionEnd;
      const hasSelection = startPos !== undefined && endPos !== undefined && startPos !== null && endPos !== null && startPos !== endPos;

      if (!hasSelection && showAutocomplete && suggestions.length > 0) {
        e.preventDefault();
        applySuggestion(suggestions[selectedIndex]);
        return;
      }

      if (hasSelection) {
        setShowAutocomplete(false);
      }

      if (!textareaRef.current || !onChange) return;
      e.preventDefault();

      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const isShift = e.shiftKey;
      const tabStr = '  ';

      if (start === end) {
        if (!isShift) {
          document.execCommand('insertText', false, tabStr);
        } else {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const lineText = value.slice(lineStart);
          let removeCount = 0;
          if (lineText.startsWith('  ')) {
            removeCount = 2;
          } else if (lineText.startsWith(' ') || lineText.startsWith('\t')) {
            removeCount = 1;
          }

          if (removeCount > 0) {
            textarea.setSelectionRange(lineStart, lineStart + removeCount);
            document.execCommand('insertText', false, '');
            const newCursor = Math.max(lineStart, start - removeCount);
            textarea.setSelectionRange(newCursor, newCursor);
          }
        }
      } else {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        // If selection ends right after a newline (i.e. at column 0 of next line),
        // do not include that next line in the indented block
        const effectiveEnd = (end > start && value[end - 1] === '\n') ? end - 1 : end;
        let lineEnd = value.indexOf('\n', effectiveEnd);
        if (lineEnd === -1) lineEnd = value.length;

        const selectedBlock = value.slice(lineStart, lineEnd);
        const lines = selectedBlock.split('\n');

        let startOffsetDelta = 0;
        let totalLengthDelta = 0;

        const newLines = lines.map((line, idx) => {
          if (!isShift) {
            if (idx === 0) startOffsetDelta = tabStr.length;
            totalLengthDelta += tabStr.length;
            return tabStr + line;
          } else {
            let rem = 0;
            if (line.startsWith('  ')) rem = 2;
            else if (line.startsWith(' ') || line.startsWith('\t')) rem = 1;

            if (idx === 0) startOffsetDelta = -rem;
            totalLengthDelta -= rem;
            return line.slice(rem);
          }
        });

        const newBlock = newLines.join('\n');
        const newValue = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
        pushChange(newValue);

        const newStart = Math.max(lineStart, start + startOffsetDelta);
        const newEnd = Math.max(newStart, end + totalLengthDelta);

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newStart, newEnd);
          }
        }, 0);
      }
    }

    const quotePairs: Record<string, string> = {
      "'": "'",
      '"': '"',
      '`': '`',
      '(': ')',
      '[': ']',
      '{': '}',
    };

    if (quotePairs[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        if (start !== null && end !== null && start < end) {
          e.preventDefault();
          const openChar = e.key;
          const closeChar = quotePairs[openChar];
          const selectedText = value.slice(start, end);
          const wrapped = openChar + selectedText + closeChar;

          document.execCommand('insertText', false, wrapped);

          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(start + 1, end + 1);
            }
          }, 0);
          return;
        }
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.replace(/\r/g, '');
    pushChange(val);
    handleSelectionChange();
  };

  useLayoutEffect(() => {
    const handleNativeScroll = () => {
      if (textareaRef.current) {
        if (lineNumbersRef.current) {
          lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
        if (highlightRef.current) {
          highlightRef.current.scrollTop = textareaRef.current.scrollTop;
          highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
        }
      }
    };
    
    const ta = textareaRef.current;
    const ln = lineNumbersRef.current;
    const handleLineNumbersWheel = (e: WheelEvent) => {
      if (ta) {
        ta.scrollTop += e.deltaY;
      }
    };

    if (ta) {
      ta.addEventListener('scroll', handleNativeScroll, { passive: true });
    }
    if (ln) {
      ln.addEventListener('wheel', handleLineNumbersWheel, { passive: true });
    }

    return () => {
      if (ta) ta.removeEventListener('scroll', handleNativeScroll);
      if (ln) ln.removeEventListener('wheel', handleLineNumbersWheel);
    };
  }, []);

  useEffect(() => {
    updateAutocomplete();
  }, [value]);


  const baseHighlightedHtml = useMemo(() => {
    return getBaseHighlight(value, theme);
  }, [value, theme]);

  const finalHtml = useMemo(() => {
    let html = applySearchAndSelectionToHtml(
      baseHighlightedHtml,
      theme,
      searchQuery,
      matchCase,
      currentMatchIndex,
      selectedText,
      showSearch,
      useRegex
    );
    if (matchedBracketIndices) {
      html = applyBracketHighlightToHtml(html, theme, matchedBracketIndices);
    }
    return html;
  }, [baseHighlightedHtml, theme, searchQuery, matchCase, currentMatchIndex, selectedText, showSearch, useRegex, matchedBracketIndices]);

  const lineHtmlArray = useMemo(() => {
    return splitHtmlIntoLines(finalHtml);
  }, [finalHtml]);

  const handleDragStart = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== null && end !== null && start < end) {
        const textToDrag = value.slice(start, end);
        dragSelectionRef.current = {
          start,
          end,
          text: textToDrag,
        };
        e.dataTransfer.setData('text/plain', textToDrag);
        (window as any).__currentDragText = textToDrag;
      }
    }
  };

  const handleDragEnd = () => {
    dragSelectionRef.current = null;
    setDragCaretPos(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : (dragSelectionRef.current ? 'move' : 'copy');
    if (!textareaRef.current) return;

    const rect = textareaRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const scrollTop = textareaRef.current.scrollTop;
    const scrollLeft = textareaRef.current.scrollLeft;

    const yWithScroll = relY + scrollTop - 12;
    const xWithScroll = relX + scrollLeft - 12;

    let currentY = 0;
    let targetLineIdx = 0;
    const lines = value.split('\n');
    for (let i = 0; i < lineHeights.length; i++) {
      const h = lineHeights[i] || 20;
      if (yWithScroll >= currentY && yWithScroll < currentY + h) {
        targetLineIdx = i;
        break;
      }
      currentY += h;
      if (i === lineHeights.length - 1) {
        targetLineIdx = i;
      }
    }

    const charWidth = charWidthRef.current;
    const lineText = lines[targetLineIdx] || '';
    const colIdx = Math.max(0, Math.min(lineText.length, Math.round(xWithScroll / charWidth)));

    const prevHeights = lineHeights.slice(0, targetLineIdx).reduce((acc, h) => acc + (h || 20), 0);
    const visualTop = 12 + prevHeights - scrollTop;
    const visualLeft = 12 + colIdx * charWidth - scrollLeft;
    const visualHeight = lineHeights[targetLineIdx] || 20;

    setDragCaretPos({
      top: visualTop,
      left: visualLeft,
      height: visualHeight,
    });
  };

  const handleDragLeave = () => {
    setDragCaretPos(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    setDragCaretPos(null);
    const droppedText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text') || (window as any).__currentDragText;
    if (!droppedText || !onChange || !textareaRef.current) return;
    e.preventDefault();

    const rect = textareaRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const scrollTop = textareaRef.current.scrollTop;
    const scrollLeft = textareaRef.current.scrollLeft;

    const yWithScroll = relY + scrollTop - 12;
    const xWithScroll = relX + scrollLeft - 12;

    let currentY = 0;
    let targetLineIdx = 0;
    const lines = value.split('\n');
    for (let i = 0; i < lineHeights.length; i++) {
      const h = lineHeights[i] || 20;
      if (yWithScroll >= currentY && yWithScroll < currentY + h) {
        targetLineIdx = i;
        break;
      }
      currentY += h;
      if (i === lineHeights.length - 1) {
        targetLineIdx = i;
      }
    }

    const charWidth = charWidthRef.current;
    const lineText = lines[targetLineIdx] || '';
    const colIdx = Math.max(0, Math.min(lineText.length, Math.round(xWithScroll / charWidth)));

    let charIndex = 0;
    for (let i = 0; i < targetLineIdx; i++) {
      charIndex += lines[i].length + 1;
    }
    charIndex += colIdx;

    const internalDrag = dragSelectionRef.current;
    dragSelectionRef.current = null;

    if (internalDrag && !e.ctrlKey) {
      const { start, end } = internalDrag;
      if (charIndex >= start && charIndex <= end) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start, end);
        return;
      }

      let newValue = '';
      let newSelStart = 0;
      if (charIndex < start) {
        newValue = value.slice(0, charIndex) + droppedText + value.slice(charIndex, start) + value.slice(end);
        newSelStart = charIndex;
      } else {
        const offset = end - start;
        newValue = value.slice(0, start) + value.slice(end, charIndex) + droppedText + value.slice(charIndex);
        newSelStart = charIndex - offset;
      }
      pushChange(newValue);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newSelStart, newSelStart + droppedText.length);
        }
      }, 0);
    } else {
      const newValue = value.slice(0, charIndex) + droppedText + value.slice(charIndex);
      pushChange(newValue);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = charIndex + droppedText.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
  };

  return (
    <div 
      style={{ height }}
      className={`flex-1 relative overflow-hidden font-mono text-xs leading-relaxed flex flex-col transition-colors ${
        !isFullScreen ? 'rounded-md border' : ''
      } ${minHeightClass} ${
        theme === 'dark' ? 'border-slate-600 bg-slate-850' : 'border-slate-300 bg-slate-100 shadow-sm'
      }`}
    >
      {/* INTEGRATED SEARCH & REPLACE BANNER AT TOP OF EDITOR */}
      {showSearch && (
        <div className={`p-2 border-b shrink-0 flex flex-col gap-1.5 font-mono text-xs z-30 transition-colors animate-in slide-in-from-top-1 duration-150 ${
          theme === 'dark' ? 'bg-slate-800/95 border-slate-700 text-slate-100 shadow-md' : 'bg-slate-200/90 border-slate-300 text-slate-900 shadow-sm'
        }`}>
          {/* SEARCH ROW */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Поиск (Ctrl+F)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.shiftKey) handlePrevMatch();
                    else handleNextMatch();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeSearch();
                  }
                }}
                className={`flex-1 min-w-[100px] px-2 py-1 rounded text-xs border outline-none font-mono ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              />
              <span className="text-[10px] text-slate-400 shrink-0 min-w-[45px] text-center font-mono">
                {searchQuery ? (matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : '0 совп.') : ''}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handlePrevMatch}
                title="Предыдущее совпадение (Shift+Enter)"
                className="p-1 rounded hover:bg-slate-700/40 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMatch}
                title="Следующее совпадение (Enter)"
                className="p-1 rounded hover:bg-slate-700/40 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMatchCase(!matchCase)}
                title={matchCase ? "Учитывать регистр (включено)" : "Учитывать регистр (выключено)"}
                className={`px-1.5 py-1 rounded transition-colors text-[10px] font-bold flex items-center gap-0.5 ${
                  matchCase
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
                }`}
              >
                <CaseSensitive className="w-3.5 h-3.5" />
                <span>Aa</span>
              </button>
              <button
                type="button"
                onClick={() => setUseRegex(!useRegex)}
                title={useRegex ? "Регулярные выражения и спецсимволы \\n, \\t (включено)" : "Регулярные выражения и спецсимволы \\n, \\t (выключено)"}
                className={`px-1.5 py-1 rounded transition-colors text-[10px] font-bold flex items-center gap-0.5 ${
                  useRegex
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
                }`}
              >
                <span className="font-mono text-[11px] font-extrabold">.*</span>
              </button>
              <button
                type="button"
                onClick={() => setShowReplace(!showReplace)}
                title="Переключить замену (Ctrl+H)"
                className={`px-1.5 py-1 rounded transition-colors text-[10px] font-semibold flex items-center gap-1 ${
                  showReplace
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
                }`}
              >
                <Replace className="w-3.5 h-3.5" />
                <span>Замена</span>
              </button>
              <button
                type="button"
                onClick={closeSearch}
                title="Закрыть панель (Esc)"
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700/40 transition-colors ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* REPLACE ROW */}
          {showReplace && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-700/40 animate-in fade-in duration-100">
              <Replace className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <input
                type="text"
                placeholder="Заменить на..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleReplaceCurrent();
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeSearch();
                  }
                }}
                className={`flex-1 min-w-[120px] px-2 py-1 rounded text-xs border outline-none font-mono ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100 focus:border-emerald-500' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                }`}
              />
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleReplaceCurrent}
                  title="Заменить текущее"
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[10px] font-semibold rounded transition-all"
                >
                  Заменить
                </button>
                <button
                  type="button"
                  onClick={handleReplaceAll}
                  title="Заменить все совпадения"
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white text-[10px] font-semibold rounded transition-all"
                >
                  Заменить всё
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CODE EDITOR BODY AREA */}
      <div className="flex-1 flex flex-row min-h-0 relative overflow-hidden">
        {/* LINE NUMBERS */}
        <div 
          ref={lineNumbersRef}
          style={{
            fontFamily: editorStyles.fontFamily,
            fontSize: editorStyles.fontSize,
            lineHeight: editorStyles.lineHeight,
            paddingTop: '12px',
            paddingBottom: '12px',
            paddingLeft: '4px',
            paddingRight: '8px',
            boxSizing: 'border-box',
            letterSpacing: editorStyles.letterSpacing,
            WebkitTextSizeAdjust: 'none',
          }}
          className={`w-10 border-r select-none overflow-hidden shrink-0 text-right transition-colors ${
            theme === 'dark' ? 'bg-slate-800/80 border-slate-700 text-slate-500' : 'bg-slate-200 border-slate-300 text-slate-500'
          }`}
        >
          {sqlLines.map((_, i) => (
            <div 
              key={i} 
              style={{
                height: lineHeights[i] ? `${lineHeights[i]}px` : '20px',
                minHeight: lineHeights[i] ? `${lineHeights[i]}px` : '20px',
                maxHeight: lineHeights[i] ? `${lineHeights[i]}px` : '20px',
                lineHeight: '20px',
              }}
              className="w-full text-right overflow-hidden select-none block shrink-0"
            >
              {i + 1}
            </div>
          ))}
          {!isWrapSql && hScrollbarHeight > 0 && (
            <div
              style={{ height: `${hScrollbarHeight}px` }}
              className="w-full shrink-0"
              aria-hidden="true"
            />
          )}
        </div>

        {/* EDITOR AREA & SYNTAX HIGHLIGHT LAYER */}
        <div className="flex-1 h-full relative overflow-hidden">
          <div
            ref={highlightRef}
            aria-hidden="true"
            className={`absolute inset-0 pointer-events-none overflow-auto select-none z-0 ${
              isWrapSql ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            style={{ ...editorStyles, color: theme === 'dark' ? '#cbd5e1' : '#1e293b' }}
          >
            {lineHtmlArray.map((lineHtml, i) => (
              <div
                key={i}
                ref={(el) => { lineElementsRef.current[i] = el; }}
                className="w-full"
                style={{ minHeight: '20px' }}
                dangerouslySetInnerHTML={{ __html: lineHtml || '<br>' }}
              />
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            wrap={isWrapSql ? "soft" : "off"}
            onChange={handleChange}
            onBlur={() => {
              // Synchronous changes are already pushed, no action needed on blur
            }}
            onKeyDown={handleKeyDown}
            onCopy={() => {
              const sel = window.getSelection()?.toString();
              if (sel) lastCopiedTextRef.current = sel;
            }}
            onCut={() => {
              const sel = window.getSelection()?.toString();
              if (sel) lastCopiedTextRef.current = sel;
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData?.getData('text/plain');
              if (pasted) {
                lastCopiedTextRef.current = pasted;
              }
              if (pendingPasteModeRef.current) {
                e.preventDefault();
                const mode = pendingPasteModeRef.current;
                pendingPasteModeRef.current = null;
                const clipText = pasted || lastCopiedTextRef.current;
                if (clipText) {
                  performPaste(clipText, mode === 'end');
                }
              }
            }}
            onSelect={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            onMouseUp={handleSelectionChange}
            onClick={() => {
              setShowAutocomplete(false);
              handleSelectionChange();
            }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onScroll={handleScroll}
            readOnly={!onChange}
            spellCheck="false"
            className={`absolute inset-0 w-full h-full bg-transparent text-transparent caret-blue-600 dark:caret-blue-400 resize-none outline-none overflow-auto selection:bg-blue-500/30 z-10 transition-colors ${
              isWrapSql ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            style={editorStyles}
            placeholder={placeholder}
          />

          {/* VISIBLE DROP CARET INDICATOR */}
          {dragCaretPos && (
            <div
              className="absolute pointer-events-none z-20"
              style={{
                top: `${dragCaretPos.top}px`,
                left: `${dragCaretPos.left}px`,
                height: `${dragCaretPos.height}px`,
                width: '2px',
                backgroundColor: theme === 'dark' ? '#38bdf8' : '#0284c7',
                borderRadius: '1px',
              }}
            />
          )}

          {/* AUTOCOMPLETE POPUP DROPDOWN UNDER CURSOR */}
          {showAutocomplete && suggestions.length > 0 && (
            <div 
              style={{ top: `${caretPos.top}px`, left: `${caretPos.left}px` }}
              onMouseDown={(e) => e.preventDefault()}
              className={`absolute z-30 rounded-lg border shadow-xl p-1.5 min-w-[180px] max-w-[260px] font-mono text-xs animate-in fade-in duration-100 ${
                caretPos.isAbove ? '-translate-y-full' : ''
              } ${
                theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800 shadow-slate-400/30'
              }`}
            >
              <div className="max-h-40 overflow-y-auto">
                {suggestions.map((kw, idx) => {
                  const customMatch = customTemplates.find(t => t.keyword === kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        applySuggestion(kw);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between transition-colors ${
                        idx === selectedIndex
                          ? 'bg-blue-600 text-white font-bold'
                          : theme === 'dark' ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="truncate pr-1">{kw}</span>
                      <span className={`text-[9px] shrink-0 ${idx === selectedIndex ? 'text-blue-200' : 'text-slate-400'}`}>
                        {customMatch ? 'шаблон' : 'ключевое слово'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* QUICK ACTIONS POPUP DROPDOWN (Ctrl+Q) */}
          {showQuickActionsPopup && isQuickActionsEnabled && (
            <>
              <div 
                className="fixed inset-0 z-30" 
                onClick={() => setShowQuickActionsPopup(false)} 
              />
              <div 
                style={{ top: `${caretPos.top}px`, left: `${caretPos.left}px` }}
                onMouseDown={(e) => e.preventDefault()}
                className={`absolute z-40 rounded-lg border shadow-xl p-1.5 w-56 animate-in fade-in duration-150 ${
                  caretPos.isAbove ? '-translate-y-full' : ''
                } ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-800 shadow-slate-400/30'
                }`}
              >
                <div className={`px-2 py-1 rounded text-xs flex items-center gap-2 border-b mb-0.5 font-mono min-w-0 ${
                  theme === 'dark' ? 'border-slate-700/60 text-slate-400' : 'border-slate-200 text-slate-500'
                }`} title={extractedTableName || 'table'}>
                  <Table className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <span className="truncate">{extractedTableName || 'table'}</span>
                </div>

                <div className="max-h-60 overflow-y-auto pr-0.5">
                  {getQuickActionTemplates().map((action, idx) => (
                    <button
                      key={action.id || idx}
                      type="button"
                      onClick={() => {
                        setShowQuickActionsPopup(false);
                        if (onExecuteQuickAction) onExecuteQuickAction(action);
                      }}
                      title={action.name}
                      className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors min-w-0 ${
                        theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <span className="truncate">{action.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
