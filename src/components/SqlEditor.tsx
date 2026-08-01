import React, { useRef, useState, useLayoutEffect, useEffect, useCallback, useMemo } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, X, CaseSensitive, Zap, Table } from 'lucide-react';
import { getSavedHotkeys, getQuickActionTemplates, QuickActionTemplate } from './SettingsModal';

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
  'ON', 'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL', 'LIKE', 'ILIKE',
  'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'RECURSIVE',
  'UNION ALL', 'UNION', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'PARTITION BY',
  'OVER', 'ROW_NUMBER()', 'DENSE_RANK()', 'RANK()', 'COUNT(*)', 'SUM()', 'AVG()',
  'MIN()', 'MAX()', 'COALESCE()', 'NULLIF()', 'DATE_TRUNC()', 'DISTINCT',
  'QUALIFY', 'RETURNING', 'ASC', 'DESC', 'AS', 'PRIMARY KEY', 'FOREIGN KEY'
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
  const numColor = isDark ? 'text-amber-400' : 'text-amber-600';
  const commentColor = isDark ? 'text-slate-500' : 'text-slate-500';

  const tokenRegex = /(--.*$|\/\*[\s\S]*?\*\/)|('(?:''|[^'\\]|\\.)*'|"(?:""|[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b(?:COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|NOW|CONCAT|DATE_TRUNC|LOWER|UPPER|CAST|ROW_NUMBER|DENSE_RANK|RANK|LEAD|LAG|FIRST_VALUE|LAST_VALUE|LISTAGG|TO_CHAR|TO_DATE|NVL|DECODE|UNIQEXACT|UNIQCOMBINED|ARGMAX|ARGMIN|TOSTARTOFHOUR|TOSTARTOFDAY|QUANTILESEXACT|DICTGET|READ_CSV_AUTO|READ_PARQUET|READ_CSV|LIST_TRANSFORM|FILTER|JSON_EXTRACT|ARRAY_JOIN|ARRAYMAP|ARRAYFILTER)\b)|(\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|INSERT|INTO|UPDATE|SET|DELETE|CREATE|TABLE|AS|WITH|RECURSIVE|AND|OR|NOT|IN|IS|NULL|LIKE|ILIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|ASC|DESC|OVER|PARTITION|WINDOW|INTERVAL|DISTINCT|VALUES|QUALIFY|PIVOT|UNPIVOT|COLUMNS|EXCLUDE|REPLACE|ATTACH|COPY|MERGE|MATCHED|USING|RETURNING|LATERAL|CONNECT|PRIOR|START|FINAL|UPSERT|CONFLICT|DO|RETURNING)\b)/gim;

  html = html.replace(tokenRegex, (match, comment, str, num, fn, kw) => {
    if (comment) {
      return `<span class="${commentColor}">${comment}</span>`;
    }
    if (str) {
      return `<span class="${strColor}">${str}</span>`;
    }
    if (num) {
      return `<span class="${numColor}">${num}</span>`;
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

export const highlightSqlHtml = (sqlText: string, theme: 'dark' | 'light', selectedText?: string) => {
  let html = getBaseHighlight(sqlText, theme);
  if (selectedText) {
    html = applySelectionToHtml(html, theme, selectedText);
  }
  return html;
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
  editorRef?: React.MutableRefObject<SqlEditorRef | null>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
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
  const [caretPos, setCaretPos] = useState<{ top: number; left: number; isAbove?: boolean }>({ top: 30, left: 30, isAbove: false });

  const lineHeightsRef = useRef<number[]>([]);
  useEffect(() => {
    lineHeightsRef.current = lineHeights;
  }, [lineHeights]);

  // Selection highlight state
  const [selectedText, setSelectedText] = useState<string>('');

  const handleSelectionChange = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    if (start !== end && start !== null && end !== null) {
      const sel = value.slice(start, end).trim();
      if (sel.length >= 1 && sel.length <= 100 && !sel.includes('\n')) {
        setSelectedText(sel);
        return;
      }
    }
    setSelectedText('');
  };

  // Search and Replace states
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [showReplace, setShowReplace] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [matchCase, setMatchCase] = useState<boolean>(false);
  const [matches, setMatches] = useState<number[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Global capture keyboard listener to prevent browser hijack of Ctrl+H / Cmd+H / Ctrl+F / Ctrl+Q / Ctrl+Shift+U
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
      const targetSearchCombo = savedHotkeys.searchSql || 'Ctrl+F';
      const targetReplaceCombo = savedHotkeys.replaceSql || 'Ctrl+H';
      const targetCompactCombo = savedHotkeys.compactSql || 'Ctrl+Shift+U';
      const targetQuickActionsCombo = savedHotkeys.quickActionsMenu || 'Ctrl+Q';

      const isSearch = combo === targetSearchCombo || (!e.shiftKey && (e.ctrlKey || e.metaKey) && (e.code === 'KeyF' || e.key?.toLowerCase() === 'f' || e.key?.toLowerCase() === 'а'));
      const isReplace = combo === targetReplaceCombo || (!e.shiftKey && (e.ctrlKey || e.metaKey) && (e.code === 'KeyH' || e.key?.toLowerCase() === 'h' || e.key?.toLowerCase() === 'р'));
      const isCompact = combo === targetCompactCombo || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyU' || e.key?.toLowerCase() === 'u' || e.key?.toLowerCase() === 'г'));
      const isQuickActions = combo === targetQuickActionsCombo || (!e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey) && (e.code === 'KeyQ' || e.key?.toLowerCase() === 'q' || e.key?.toLowerCase() === 'й'));

      if (isSearch) {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch(true);
        setShowReplace(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (isReplace) {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch(true);
        setShowReplace(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
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
          let left = 12 + colIdx * 7.5 - scrollLeft;

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

  // Compute search matches when query or text changes
  useEffect(() => {
    if (!searchQuery) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    const matchIndices: number[] = [];
    const text = value;
    const q = matchCase ? searchQuery : searchQuery.toLowerCase();
    const src = matchCase ? text : text.toLowerCase();
    let pos = 0;
    while ((pos = src.indexOf(q, pos)) !== -1) {
      matchIndices.push(pos);
      pos += Math.max(1, q.length);
    }
    setMatches(matchIndices);
    if (matchIndices.length > 0) {
      setCurrentMatchIndex(0);
      selectMatch(matchIndices[0], searchQuery.length);
    } else {
      setCurrentMatchIndex(-1);
    }
  }, [searchQuery, value, matchCase]);

  const selectMatch = (startPos: number, matchLen: number) => {
    if (textareaRef.current) {
      textareaRef.current.focus();
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
    selectMatch(matches[nextIdx], searchQuery.length);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    selectMatch(matches[prevIdx], searchQuery.length);
  };

  const handleReplaceCurrent = () => {
    if (currentMatchIndex < 0 || matches.length === 0 || !onChange) return;
    const matchPos = matches[currentMatchIndex];
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(matchPos, matchPos + searchQuery.length);
      document.execCommand('insertText', false, replaceQuery);
    }
  };

  const handleReplaceAll = () => {
    if (matches.length === 0 || !onChange || !searchQuery) return;
    const flags = matchCase ? 'g' : 'gi';
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(escaped, flags);
    const newValue = value.replace(reg, replaceQuery);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      document.execCommand('insertText', false, newValue);
    }
  };

  const handleScroll = () => {
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

  const recalculateHeights = useCallback(() => {
    if (mirrorRef.current && textareaRef.current) {
      const divs = mirrorRef.current.querySelectorAll('div');
      const count = divs.length;
      if (count === 0) {
        setLineHeights([20]);
        return;
      }

      // Fast path: if word wrap is disabled, all lines have fixed single-line height (20px)
      if (!isWrapSql) {
        setLineHeights(new Array(count).fill(20));
        return;
      }

      // Word wrap is enabled: measure container width
      const containerWidth = textareaRef.current.clientWidth;
      if (containerWidth > 0) {
        mirrorRef.current.style.width = `${containerWidth}px`;
      }

      const usableWidth = Math.max(1, containerWidth - 24);
      // font-mono text-xs character width is ~7.5px
      const maxCharsPerLine = Math.floor(usableWidth / 7.5);

      const heights: number[] = new Array(count);
      let needsMeasurement = false;

      for (let i = 0; i < count; i++) {
        const text = divs[i].textContent || '';
        if (text.length <= maxCharsPerLine) {
          heights[i] = 20;
        } else {
          needsMeasurement = true;
          heights[i] = -1;
        }
      }

      if (needsMeasurement) {
        for (let i = 0; i < count; i++) {
          if (heights[i] === -1) {
            heights[i] = divs[i].getBoundingClientRect().height;
          }
        }
      }

      setLineHeights(heights);
    }
  }, [isWrapSql]);

  useLayoutEffect(() => {
    recalculateHeights();
  }, [value, isWrapSql, recalculateHeights]);

  useEffect(() => {
    if (!textareaRef.current) return;
    let animFrameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(() => {
        recalculateHeights();
      });
    });
    observer.observe(textareaRef.current);
    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      observer.disconnect();
    };
  }, [recalculateHeights]);

  // Check cursor and compute suggestions
  const updateAutocomplete = () => {
    if (!textareaRef.current || !onChange) return;
    const cursor = textareaRef.current.selectionStart;
    const textBefore = value.slice(0, cursor);
    const match = textBefore.match(/([a-zA-Z_][a-zA-Z_0-9]*)$/);

    if (match) {
      const typed = match[1].toUpperCase();
      const customKeywords = customTemplates
        .filter(t => t && typeof t.keyword === 'string')
        .map(t => t.keyword);
      const allKeywords = Array.from(new Set([...customKeywords, ...SQL_KEYWORDS]));
      const filtered = allKeywords.filter(kw => 
        kw && typeof kw === 'string' && kw.toUpperCase().startsWith(typed) && kw.toUpperCase() !== typed
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
        let left = 12 + colIdx * 7.5 - scrollLeft;

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
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowQuickActionsPopup(false);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      // Synchronous changes are already pushed, no action needed here
    }

    // Hotkeys Ctrl+F / Cmd+F and Ctrl+H / Cmd+H for Search & Replace
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key?.toLowerCase() === 'f') {
      e.preventDefault();
      setShowSearch(true);
      setShowReplace(false);
      setTimeout(() => searchInputRef.current?.focus(), 50);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key?.toLowerCase() === 'h') {
      e.preventDefault();
      setShowSearch(true);
      setShowReplace(true);
      setTimeout(() => searchInputRef.current?.focus(), 50);
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
      if (showAutocomplete && suggestions.length > 0) {
        e.preventDefault();
        applySuggestion(suggestions[selectedIndex]);
        return;
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
        let lineEnd = value.indexOf('\n', end);
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
    if (ta) {
      ta.addEventListener('scroll', handleNativeScroll, { passive: true });
      return () => ta.removeEventListener('scroll', handleNativeScroll);
    }
  }, []);

  useEffect(() => {
    updateAutocomplete();
  }, [value]);


  const baseHighlightedHtml = useMemo(() => {
    return getBaseHighlight(value, theme);
  }, [value, theme]);

  const finalHtml = useMemo(() => {
    return applySelectionToHtml(baseHighlightedHtml, theme, selectedText);
  }, [baseHighlightedHtml, theme, selectedText]);

  return (
    <div 
      style={{ height }}
      className={`flex-1 relative rounded-md border overflow-hidden font-mono text-xs leading-relaxed flex flex-col transition-colors ${minHeightClass} ${
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
                    setShowSearch(false);
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
                onClick={() => setShowSearch(false)}
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
                    setShowSearch(false);
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
        {/* HIDDEN MIRROR DIV FOR EXACT LINE HEIGHT MEASUREMENT */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className={`absolute opacity-0 pointer-events-none -z-50 font-mono text-xs leading-5 p-3 ${
            isWrapSql ? 'whitespace-pre-wrap [word-break:break-word]' : 'whitespace-pre'
          }`}
          style={{ top: 0, left: 0, visibility: 'hidden' }}
        >
          {sqlLines.map((line, i) => (
            <div key={i}>{line || '\u00A0'}</div>
          ))}
        </div>

        {/* LINE NUMBERS */}
        <div 
          ref={lineNumbersRef}
          className={`w-10 border-r flex flex-col items-end pr-2 pt-3 pb-3 font-mono select-none overflow-hidden shrink-0 transition-colors ${
            theme === 'dark' ? 'bg-slate-800/80 border-slate-700 text-slate-500' : 'bg-slate-200 border-slate-300 text-slate-500'
          }`}
        >
          {sqlLines.map((_, i) => (
            <div 
              key={i} 
              style={{ height: lineHeights[i] ? `${lineHeights[i]}px` : undefined }}
              className="text-xs font-mono leading-5 flex items-start justify-end w-full"
            >
              {i + 1}
            </div>
          ))}
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
            dangerouslySetInnerHTML={{ __html: finalHtml }}
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onBlur={() => {
              // Synchronous changes are already pushed, no action needed on blur
            }}
            onKeyDown={handleKeyDown}
            onSelect={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            onMouseUp={handleSelectionChange}
            onClick={() => {
              setShowAutocomplete(false);
              handleSelectionChange();
            }}
            readOnly={!onChange}
            spellCheck="false"
            className={`absolute inset-0 w-full h-full bg-transparent text-transparent caret-blue-600 dark:caret-blue-400 resize-none outline-none overflow-auto selection:bg-blue-500/30 z-10 transition-colors ${
              isWrapSql ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            style={editorStyles}
            placeholder={placeholder}
          />

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
