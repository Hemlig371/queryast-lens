import { t } from "../utils/i18n";
import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, X, CaseSensitive, Table } from 'lucide-react';
import { EditorState, EditorSelection, Compartment, Prec, Annotation } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap, drawSelection, dropCursor, lineNumbers, Decoration } from '@codemirror/view';
import { history, historyKeymap, standardKeymap, insertNewline } from '@codemirror/commands';
import { getSavedHotkeys, getSavedUiVisibilitySettings, getQuickActionTemplates, QuickActionTemplate } from './SettingsModal';
import { SchemaTableItem } from '../utils/schemaDbCache';
import { compactSql } from '../utils/sqlFormat';
import { SQL_KEYWORDS, getCustomAutocompleteTemplates } from '../editor/templates';
import type { AutocompleteTemplate } from '../editor/templates';
import { sqlLanguage } from '../editor/sqlLanguage';
import {
  buildEditorTheme,
  variableDecorations,
  cursorDecorations,
  searchDecorationField,
  searchActiveField,
  setSearchDecorations,
  setSearchActive,
  buildSearchDecorations,
} from '../editor/cmExtensions';
import {
  type TextEdit,
  computeMoveLines,
  computeChangeCase,
  computePasteLines,
  computeIndent,
  computeWrapSelection,
  diffReplace,
  findAllMatches,
  computeReplacementText,
  replaceAllInText,
  AUTOCOMPLETE_WORD_RE,
} from '../editor/editorOps';
import { matchHotkeyCombo } from '../editor/hotkeysMatch';

// Реэкспорт прежнего публичного API модуля (на него завязаны App, SettingsModal, SqlSnippetsManager).
export { DEFAULT_AUTOCOMPLETE_TEMPLATES, getCustomAutocompleteTemplates } from '../editor/templates';
export type { AutocompleteTemplate } from '../editor/templates';
export { getBaseHighlight, getChunkedHighlight, applySelectionToHtml, highlightSqlHtml } from '../utils/sqlHighlight';
export { processEscapeSequences, findMatchingBrackets } from '../editor/editorOps';
export { matchHotkeyCombo } from '../editor/hotkeysMatch';

export interface SqlEditorRef {
  getSelection: () => { start: number; end: number; text: string } | null;
  replaceSelection: (newText: string) => void;
  setSelectionRange: (start: number, end: number) => void;
  replaceRange: (newText: string, start: number, end: number, selectionMode?: 'select' | 'start' | 'end' | 'preserve') => void;
  /** Перевести фокус в редактор. */
  focus: () => void;
  /** Открыть панель поиска (или поиска и замены). */
  openSearch: (withReplace?: boolean) => void;
}

/** Помечает транзакции, пришедшие снаружи (смена value из App): они не вызывают onChange. */
const externalChange = Annotation.define<boolean>();

interface SqlEditorProps {
  value: string;
  onChange?: (val: string) => void;
  isWrapSql?: boolean;
  theme: 'dark' | 'light';
  minHeightClass?: string;
  height?: string;
  onCompactSql?: () => void;
  onExecuteQuickAction?: (qa: QuickActionTemplate) => void;
  extractedTableName?: string;
  isQuickActionsEnabled?: boolean;
  isFullScreen?: boolean;
  editorRef?: React.MutableRefObject<SqlEditorRef | null>;
  schemaTables?: SchemaTableItem[];
  /**
   * Идентификатор документа (например, id вкладки). При смене редактор сбрасывает undo-историю,
   * чтобы Ctrl+Z не «перетаскивал» текст из другой вкладки. Выделение и скролл запоминаются по docId.
   */
  docId?: string;
}

type PopupPos = { top: number; left: number; isAbove?: boolean };

const ECHO_WINDOW_MS = 1500;

export const SqlEditor = React.memo(function SqlEditor(props: SqlEditorProps) {
  const {
    value: propValue,
    onChange,
    isWrapSql = false,
    theme,
    minHeightClass = "min-h-0",
    height,
    onExecuteQuickAction,
    extractedTableName,
    isQuickActionsEnabled = true,
    isFullScreen = false,
    editorRef,
    schemaTables,
    docId,
  } = props;

  const latest = useRef(props);
  latest.current = props;

  const bodyRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteContainerRef = useRef<HTMLDivElement>(null);
  const lastCopiedTextRef = useRef<string>('');
  const docIdRef = useRef<string | undefined>(docId);
  const docViewStates = useRef(new Map<string | undefined, { anchor: number; head: number; scrollTop: number }>());
  // Значения, которые мы сами отдали в onChange: App возвращает их в value с задержкой (debounce 200 мс),
  // и такое «эхо» нельзя применять обратно — иначе перетрётся текст, набранный за это время.
  const recentEmitted = useRef(new Map<string, number>());

  const compartments = useRef({
    theme: new Compartment(),
    wrap: new Compartment(),
    dynamic: new Compartment(),
  }).current;

  const [value, setValue] = useState(propValue);

  // Search state
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [showReplace, setShowReplace] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [matchCase, setMatchCase] = useState<boolean>(false);
  const [useRegex, setUseRegex] = useState<boolean>(false);
  const [matches, setMatches] = useState<{ start: number; length: number }[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const lastSearchQueryRef = useRef<string>('');
  const hasNavigatedSearchRef = useRef<boolean>(false);

  // Quick actions & autocomplete state
  const [showQuickActionsPopup, setShowQuickActionsPopup] = useState<boolean>(false);
  const [customTemplates, setCustomTemplates] = useState<AutocompleteTemplate[]>(getCustomAutocompleteTemplates);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const [caretPos, setCaretPos] = useState<PopupPos>({ top: 30, left: 30, isAbove: false });

  // Актуальное UI-состояние для обработчиков, живущих внутри CodeMirror
  const ui = useRef({ showSearch, showQuickActionsPopup, showAutocomplete, suggestions, selectedIndex, customTemplates });
  ui.current = { showSearch, showQuickActionsPopup, showAutocomplete, suggestions, selectedIndex, customTemplates };
  // результат исчез (или пошёл новый запрос) при открытом попапе — закрыть, чтобы он не перехватывал цифры 1–9
  useEffect(() => {
    if (!isQuickActionsEnabled) setShowQuickActionsPopup(false);
  }, [isQuickActionsEnabled]);

  // ------------------------------------------------------------------ утилиты

  const markEmitted = (text: string) => {
    const now = Date.now();
    const map = recentEmitted.current;
    map.set(text, now);
    for (const [k, ts] of map) if (now - ts > ECHO_WINDOW_MS) map.delete(k);
  };

  const isRecentEcho = (text: string): boolean => {
    const map = recentEmitted.current;
    const ts = map.get(text);
    if (ts === undefined) return false;
    if (Date.now() - ts > ECHO_WINDOW_MS) {
      map.delete(text);
      return false;
    }
    return true;
  };

  const applyEdit = (view: EditorView, edit: TextEdit) => {
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: { anchor: edit.selStart, head: edit.selEnd },
      scrollIntoView: true,
      userEvent: 'input',
    });
  };

  /**
   * Позиция всплывающего окна (автокомплит / quick actions) под курсором.
   * Координаты CodeMirror — экранные; переводим в систему контейнера и компенсируем CSS zoom интерфейса.
   */
  const computePopupPos = (view: EditorView, pos: number, estimatedPopupHeight: number, popupWidth: number = 240): PopupPos | null => {
    const body = bodyRef.current;
    const coords = view.coordsAtPos(pos);
    if (!body || !coords) return null;
    const rect = body.getBoundingClientRect();
    const scale = body.offsetWidth ? rect.width / body.offsetWidth || 1 : 1;
    const lineTop = (coords.top - rect.top) / scale;
    const lineBottom = (coords.bottom - rect.top) / scale;
    let left = (coords.left - rect.left) / scale;

    const editorHeight = body.clientHeight;
    const editorWidth = body.clientWidth;
    const spaceBelow = editorHeight - lineBottom;
    const spaceAbove = lineTop;

    let top = lineBottom + 4;
    let isAbove = false;

    if (spaceBelow < estimatedPopupHeight) {
      if (spaceAbove > estimatedPopupHeight || spaceAbove > spaceBelow) {
        top = lineTop - 4;
        isAbove = true;
        if (top - estimatedPopupHeight < 8) {
          isAbove = false;
          top = Math.max(8, editorHeight - estimatedPopupHeight - 8);
        }
      } else {
        top = Math.max(8, editorHeight - estimatedPopupHeight - 8);
      }
    }
    if (left + popupWidth > editorWidth) left = Math.max(10, editorWidth - popupWidth);
    if (left < 10) left = 10;
    return { top, left, isAbove };
  };

  // ------------------------------------------------------------ автокомплит

  const updateAutocomplete = (forceShow = false) => {
    const view = viewRef.current;
    const L = latest.current;
    if (!view || !L.onChange) return;
    const sel = view.state.selection.main;

    if (!sel.empty) {
      setShowAutocomplete(false);
      return;
    }

    const uiVis = getSavedUiVisibilitySettings();
    const autocompleteOnType = uiVis.autocompleteOnType ?? false;
    if (!ui.current.showAutocomplete && !forceShow && !autocompleteOnType) return;

    const line = view.state.doc.lineAt(sel.head);
    const textBefore = line.text.slice(0, sel.head - line.from);
    const match = textBefore.match(AUTOCOMPLETE_WORD_RE);

    if (match || forceShow) {
      const typed = match ? match[1].toUpperCase() : '';
      const customKeywords = ui.current.customTemplates
        .filter(tpl => tpl && typeof tpl.keyword === 'string')
        .map(tpl => tpl.keyword);
      const allKeywords = Array.from(new Set([...customKeywords, ...SQL_KEYWORDS]));
      let filtered = allKeywords.filter(kw =>
        kw && typeof kw === 'string' && (typed ? (kw.toUpperCase().startsWith(typed) && kw.toUpperCase() !== typed) : true)
      );
      filtered.sort();
      filtered = filtered.slice(0, 8);

      const tables = L.schemaTables;
      if (tables && tables.length > 0 && filtered.length < 15) {
        const tableKeywords = tables.map(tb => tb.schema_name ? `${tb.schema_name}.${tb.table_name}` : tb.table_name);
        const filteredTables = tableKeywords.filter(kw =>
          kw && typeof kw === 'string' && (typed ? (kw.toUpperCase().startsWith(typed) && kw.toUpperCase() !== typed) : true)
        );
        filteredTables.sort();
        filtered = [...filtered, ...filteredTables.slice(0, 15 - filtered.length)];
      }

      if (filtered.length > 0) {
        const pos = computePopupPos(view, sel.head, Math.min(200, 36 + filtered.length * 28));
        if (pos) {
          setSuggestions(filtered);
          setSelectedIndex(0);
          setCaretPos(pos);
          setShowAutocomplete(true);
          return;
        }
      }
    }
    setShowAutocomplete(false);
  };

  const applySuggestion = (keyword: string) => {
    const view = viewRef.current;
    const L = latest.current;
    if (!view || !L.onChange) return;
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    const textBefore = line.text.slice(0, sel.head - line.from);
    const match = textBefore.match(AUTOCOMPLETE_WORD_RE);
    if (!match) return;

    const wordStart = sel.head - match[1].length;
    const customTpl = ui.current.customTemplates.find(tpl => tpl.keyword === keyword);
    const tableTpl = L.schemaTables?.find(tb => (tb.schema_name ? `${tb.schema_name}.${tb.table_name}` : tb.table_name) === keyword);

    let insertion = keyword + ' ';
    if (customTpl && customTpl.insertion) {
      insertion = customTpl.insertion;
    } else if (tableTpl) {
      const isMacro = tableTpl.table_type?.toLowerCase() === 'macros';
      const suffix = isMacro ? '()' : ' ';
      insertion = tableTpl.schema_name
        ? `"${tableTpl.schema_name}"."${tableTpl.table_name}"${suffix}`
        : `"${tableTpl.table_name}"${suffix}`;
    } else if (keyword.endsWith('()')) {
      insertion = keyword.slice(0, -1);
    }

    view.focus();
    view.dispatch({
      changes: { from: wordStart, to: sel.head, insert: insertion },
      selection: { anchor: wordStart + insertion.length },
      scrollIntoView: true,
      userEvent: 'input.complete',
    });
    setShowAutocomplete(false);
  };

  // ------------------------------------------------------- операции с текстом

  const runTextOp = (compute: (text: string, start: number, end: number) => TextEdit | null) => {
    const view = viewRef.current;
    if (!view || !latest.current.onChange) return;
    const sel = view.state.selection.main;
    const edit = compute(view.state.doc.toString(), sel.from, sel.to);
    view.focus();
    if (edit) applyEdit(view, edit);
  };

  const handleMoveLines = (dir: 'up' | 'down') => runTextOp((text, s, e) => computeMoveLines(text, s, e, dir));
  const handleChangeCase = (target: 'upper' | 'lower') => runTextOp((text, s, e) => computeChangeCase(text, s, e, target));
  const performPaste = (clipText: string, atEnd: boolean) =>
    runTextOp((text, s, e) => computePasteLines(text, s, e, clipText, atEnd));

  const handleMultiLinePaste = (atEnd: boolean) => {
    if (!viewRef.current) return;
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      navigator.clipboard.readText().then(clipText => {
        if (clipText) {
          lastCopiedTextRef.current = clipText;
          performPaste(clipText, atEnd);
        } else if (lastCopiedTextRef.current) {
          performPaste(lastCopiedTextRef.current, atEnd);
        }
      }).catch(() => {
        if (lastCopiedTextRef.current) performPaste(lastCopiedTextRef.current, atEnd);
      });
    } else if (lastCopiedTextRef.current) {
      performPaste(lastCopiedTextRef.current, atEnd);
    }
  };

  const handleCompactSqlInternal = () => {
    if (latest.current.onCompactSql) {
      latest.current.onCompactSql();
      return;
    }
    const view = viewRef.current;
    if (!view || !latest.current.onChange) return;
    const sel = view.state.selection.main;
    view.focus();
    if (!sel.empty) {
      const compacted = compactSql(view.state.sliceDoc(sel.from, sel.to));
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: compacted },
        selection: { anchor: sel.from + compacted.length },
        userEvent: 'input',
      });
      return;
    }
    const text = view.state.doc.toString();
    const d = diffReplace(text, compactSql(text));
    if (d) view.dispatch({ changes: d, userEvent: 'input' });
  };

  // ------------------------------------------------------------------ поиск

  const openSearchBoxRef = useRef<(withReplace?: boolean) => void>(() => {});

  const openSearchBox = (withReplace: boolean = false) => {
    let selText = '';
    const view = viewRef.current;
    if (view) {
      const sel = view.state.selection.main;
      if (!sel.empty) selText = view.state.sliceDoc(sel.from, sel.to).trim();
    }
    // Текст для поиска берём из документа один раз при открытии панели (дальше — по изменениям, пока панель открыта)
    setValue(view ? view.state.doc.toString() : propValue);
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
  };

  openSearchBoxRef.current = openSearchBox;

  const closeSearch = () => {
    setShowSearch(false);
    setShowReplace(false);
    setSearchQuery('');
    setReplaceQuery('');
    setMatches([]);
    hasNavigatedSearchRef.current = false;
    viewRef.current?.focus();
  };

  // Пересчёт совпадений при изменении запроса / текста / опций
  useEffect(() => {
    if (!showSearch) return;
    if (!searchQuery) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      lastSearchQueryRef.current = '';
      hasNavigatedSearchRef.current = false;
      return;
    }
    const matchIndices = findAllMatches(value, searchQuery, matchCase, useRegex);
    const isNewSearch = lastSearchQueryRef.current !== searchQuery;
    lastSearchQueryRef.current = searchQuery;
    if (isNewSearch) hasNavigatedSearchRef.current = false;

    setMatches(matchIndices);
    if (matchIndices.length > 0) {
      setCurrentMatchIndex(prevIdx => {
        if (isNewSearch || prevIdx < 0) return 0;
        return prevIdx >= matchIndices.length ? matchIndices.length - 1 : prevIdx;
      });
    } else {
      setCurrentMatchIndex(-1);
    }
  }, [showSearch, searchQuery, value, matchCase, useRegex]);

  // Подсветка совпадений в редакторе
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const active = showSearch && !!searchQuery;
    view.dispatch({
      effects: [
        setSearchActive.of(active),
        setSearchDecorations.of(active ? buildSearchDecorations(matches, currentMatchIndex, view.state.doc.length) : Decoration.none),
      ],
    });
  }, [showSearch, searchQuery, matches, currentMatchIndex]);

  const selectMatch = (startPos: number, matchLen: number) => {
    const view = viewRef.current;
    if (!view) return;
    const docLen = view.state.doc.length;
    if (startPos + matchLen > docLen) return;
    view.dispatch({
      selection: { anchor: startPos, head: startPos + matchLen },
      effects: EditorView.scrollIntoView(startPos, { y: 'center' }),
    });
  };

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    if (!hasNavigatedSearchRef.current) {
      hasNavigatedSearchRef.current = true;
      selectMatch(matches[currentMatchIndex].start, matches[currentMatchIndex].length);
    } else {
      const nextIdx = (currentMatchIndex + 1) % matches.length;
      setCurrentMatchIndex(nextIdx);
      selectMatch(matches[nextIdx].start, matches[nextIdx].length);
    }
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    if (!hasNavigatedSearchRef.current) {
      hasNavigatedSearchRef.current = true;
      selectMatch(matches[currentMatchIndex].start, matches[currentMatchIndex].length);
    } else {
      const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
      setCurrentMatchIndex(prevIdx);
      selectMatch(matches[prevIdx].start, matches[prevIdx].length);
    }
  };

  const handleReplaceCurrent = () => {
    const view = viewRef.current;
    if (!view || currentMatchIndex < 0 || matches.length === 0 || !onChange) return;
    const match = matches[currentMatchIndex];
    const docLen = view.state.doc.length;
    if (match.start + match.length > docLen) return;
    const matched = view.state.sliceDoc(match.start, match.start + match.length);
    const replacementText = computeReplacementText(
      matched, searchQuery, replaceQuery, matchCase, useRegex,
      useRegex ? { text: view.state.doc.toString(), start: match.start } : undefined,
    );
    view.focus();
    view.dispatch({
      changes: { from: match.start, to: match.start + match.length, insert: replacementText },
      selection: { anchor: match.start + replacementText.length },
      userEvent: 'input.replace',
    });
  };

  const handleReplaceAll = () => {
    const view = viewRef.current;
    if (!view || matches.length === 0 || !onChange || !searchQuery) return;
    try {
      const sel = view.state.selection.main;
      const start = sel.from;
      const end = sel.to;
      const currentMatch = matches[currentMatchIndex];
      const isAutoSelectedMatch = currentMatch && start === currentMatch.start && end === (currentMatch.start + currentMatch.length);
      const hasManualSelection = start !== end && !isAutoSelectedMatch;

      view.focus();
      if (hasManualSelection) {
        const replaced = replaceAllInText(view.state.sliceDoc(start, end), searchQuery, replaceQuery, matchCase, useRegex);
        view.dispatch({
          changes: { from: start, to: end, insert: replaced },
          selection: { anchor: start, head: start + replaced.length },
          userEvent: 'input.replace',
        });
      } else {
        const text = view.state.doc.toString();
        const next = replaceAllInText(text, searchQuery, replaceQuery, matchCase, useRegex);
        const d = diffReplace(text, next);
        if (d) {
          view.dispatch({
            changes: d,
            selection: { anchor: Math.min(start, next.length) },
            userEvent: 'input.replace',
          });
        }
      }
    } catch {
      // некорректный regex
    }
  };

  // --------------------------------------------------- клавиатура (внутри CM)

  const handleEditorKeyDown = (e: KeyboardEvent, view: EditorView): boolean => {
    const L = latest.current;
    const u = ui.current;
    const savedHotkeys = getSavedHotkeys();

    if (e.key === 'Escape') {
      if (u.showSearch) {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
        return true;
      }
      if (u.showQuickActionsPopup) {
        e.preventDefault();
        e.stopPropagation();
        setShowQuickActionsPopup(false);
        return true;
      }
    }

    if (u.showQuickActionsPopup && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      const actions = getQuickActionTemplates();
      if (actions[idx] && L.onExecuteQuickAction) {
        e.preventDefault();
        e.stopPropagation();
        setShowQuickActionsPopup(false);
        L.onExecuteQuickAction(actions[idx]);
        return true;
      }
    }

    if (matchHotkeyCombo(e, savedHotkeys.triggerAutocomplete || 'Ctrl+Space')) {
      e.preventDefault();
      e.stopPropagation();
      updateAutocomplete(true);
      return true;
    }

    if (u.showAutocomplete && u.suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % u.suggestions.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + u.suggestions.length) % u.suggestions.length);
        return true;
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        applySuggestion(u.suggestions[u.selectedIndex]);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowAutocomplete(false);
        return true;
      }
    }

    if (e.key === 'Tab') {
      const sel = view.state.selection.main;
      if (sel.empty && u.showAutocomplete && u.suggestions.length > 0) {
        e.preventDefault();
        applySuggestion(u.suggestions[u.selectedIndex]);
        return true;
      }
      if (!sel.empty) setShowAutocomplete(false);
      if (!L.onChange) return false;
      e.preventDefault();
      const edit = computeIndent(view.state.doc.toString(), sel.from, sel.to, e.shiftKey);
      if (edit) applyEdit(view, edit);
      return true;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && L.onChange) {
      const sel = view.state.selection.main;
      if (!sel.empty) {
        const edit = computeWrapSelection(view.state.doc.toString(), sel.from, sel.to, e.key);
        if (edit) {
          e.preventDefault();
          applyEdit(view, edit);
          return true;
        }
      }
    }

    return false;
  };

  // ------------------------------------------------------ создание редактора

  const buildDynamicExtensions = (): Extension => [
    EditorState.readOnly.of(!latest.current.onChange),
  ];

  const buildExtensions = (): Extension[] => [
    history(),
    drawSelection(),
    dropCursor(),
    lineNumbers(),
    EditorState.allowMultipleSelections.of(false),
    sqlLanguage,
    variableDecorations,
    cursorDecorations,
    searchDecorationField,
    searchActiveField,
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (e, view) => handleEditorKeyDown(e, view),
        mousedown: () => {
          setShowAutocomplete(false);
          return false;
        },
        paste: (e) => {
          const pasted = e.clipboardData?.getData('text/plain');
          if (pasted) lastCopiedTextRef.current = pasted;
          return false;
        },
      })
    ),
    keymap.of([
      { key: 'Enter', run: insertNewline },
      ...standardKeymap.filter(b => b.key !== 'Enter'),
      ...historyKeymap,
    ]),
    EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const text = update.state.doc.toString();
        // Состояние value нужно только панели поиска: без неё не перерисовываем компонент на каждый ввод
        if (ui.current.showSearch) setValue(text);
        const isExternal = update.transactions.some(tr => tr.annotation(externalChange));
        if (!isExternal) {
          markEmitted(text);
          latest.current.onChange?.(text);
          // Измерения макета нельзя делать внутри update — откладываем на кадр
          requestAnimationFrame(() => updateAutocomplete(false));
        }
      } else if (update.selectionSet && !update.state.selection.main.empty) {
        setShowAutocomplete(false);
      }
    }),
    compartments.theme.of(buildEditorTheme(latest.current.theme)),
    compartments.wrap.of(latest.current.isWrapSql ? EditorView.lineWrapping : []),
    compartments.dynamic.of(buildDynamicExtensions()),
  ];

  useLayoutEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({ doc: latest.current.value, extensions: buildExtensions() }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Внешнее изменение value / смена документа (вкладки)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (docIdRef.current !== docId) {
      const sel = view.state.selection.main;
      docViewStates.current.set(docIdRef.current, { anchor: sel.anchor, head: sel.head, scrollTop: view.scrollDOM.scrollTop });
      docIdRef.current = docId;
      recentEmitted.current.clear();
      const saved = docViewStates.current.get(docId);
      const len = propValue.length;
      view.setState(EditorState.create({
        doc: propValue,
        selection: saved ? EditorSelection.single(Math.min(saved.anchor, len), Math.min(saved.head, len)) : undefined,
        extensions: buildExtensions(),
      }));
      if (ui.current.showSearch) setValue(propValue);
      if (saved) {
        requestAnimationFrame(() => {
          if (viewRef.current === view) view.scrollDOM.scrollTop = saved.scrollTop;
        });
      }
      return;
    }

    const current = view.state.doc.toString();
    if (current === propValue) return;
    if (isRecentEcho(propValue)) return;
    const d = diffReplace(current, propValue);
    if (!d) return;
    view.dispatch({
      changes: d,
      annotations: externalChange.of(true),
    });
    if (ui.current.showSearch) setValue(propValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propValue, docId]);

  // Динамические настройки
  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.theme.reconfigure(buildEditorTheme(theme)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.wrap.reconfigure(isWrapSql ? EditorView.lineWrapping : []) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWrapSql]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.dynamic.reconfigure(buildDynamicExtensions()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!onChange]);

  // Программный API для App
  useEffect(() => {
    if (!editorRef) return;
    const api: SqlEditorRef = {
      focus: () => viewRef.current?.focus(),
      openSearch: (withReplace: boolean = false) => {
        viewRef.current?.focus();
        openSearchBoxRef.current(withReplace);
      },
      getSelection: () => {
        const view = viewRef.current;
        if (!view) return null;
        const sel = view.state.selection.main;
        return { start: sel.from, end: sel.to, text: view.state.sliceDoc(sel.from, sel.to) };
      },
      replaceSelection: (newText: string) => {
        const view = viewRef.current;
        if (!view) return;
        view.focus();
        view.dispatch(view.state.replaceSelection(newText), { scrollIntoView: true, userEvent: 'input' });
      },
      setSelectionRange: (start: number, end: number) => {
        const view = viewRef.current;
        if (!view) return;
        const len = view.state.doc.length;
        view.focus();
        view.dispatch({ selection: { anchor: Math.min(start, len), head: Math.min(end, len) } });
      },
      replaceRange: (newText, start, end, selectionMode = 'preserve') => {
        const view = viewRef.current;
        if (!view) return;
        const len = view.state.doc.length;
        const from = Math.min(start, len);
        const to = Math.min(end, len);
        view.focus();
        const spec: any = { changes: { from, to, insert: newText }, userEvent: 'input' };
        if (selectionMode === 'select') spec.selection = { anchor: from, head: from + newText.length };
        else if (selectionMode === 'start') spec.selection = { anchor: from };
        else if (selectionMode === 'end') spec.selection = { anchor: from + newText.length };
        view.dispatch(spec);
      },
    };
    editorRef.current = api;
    return () => {
      if (editorRef.current === api) editorRef.current = null;
    };
  }, [editorRef]);

  // Пользовательские шаблоны автокомплита
  useEffect(() => {
    const refreshTemplates = () => setCustomTemplates(getCustomAutocompleteTemplates());
    window.addEventListener('storage', refreshTemplates);
    window.addEventListener('sql_templates_updated', refreshTemplates);
    return () => {
      window.removeEventListener('storage', refreshTemplates);
      window.removeEventListener('sql_templates_updated', refreshTemplates);
    };
  }, []);

  // Последний скопированный текст (для вставки в начало/конец строк, если clipboard API недоступен)
  useEffect(() => {
    const handleDocumentCopyCut = () => {
      const sel = window.getSelection()?.toString();
      if (sel) lastCopiedTextRef.current = sel;
    };
    document.addEventListener('copy', handleDocumentCopyCut);
    document.addEventListener('cut', handleDocumentCopyCut);
    return () => {
      document.removeEventListener('copy', handleDocumentCopyCut);
      document.removeEventListener('cut', handleDocumentCopyCut);
    };
  }, []);

  // Прокрутка выбранного пункта автокомплита
  useEffect(() => {
    if (showAutocomplete && autocompleteContainerRef.current) {
      const activeItem = autocompleteContainerRef.current.children[selectedIndex] as HTMLElement;
      if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, showAutocomplete]);

  // Глобальные хоткеи (capture): работают независимо от раскладки и когда фокус в поле поиска
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const view = viewRef.current;
      if (!view) return;
      const activeEl = document.activeElement;
      const search = searchInputRef.current;
      const isInsideEditor =
        (activeEl && view.contentDOM.contains(activeEl)) ||
        (search && activeEl && (search === activeEl || search.parentElement?.contains(activeEl)));
      if (!isInsideEditor) return;

      const savedHotkeys = getSavedHotkeys();
      const L = latest.current;

      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (matchHotkeyCombo(e, savedHotkeys.pasteAtEnd || 'Ctrl+Shift+V')) { consume(); handleMultiLinePaste(true); return; }
      if (matchHotkeyCombo(e, savedHotkeys.pasteAtStart || 'Ctrl+Alt+V')) { consume(); handleMultiLinePaste(false); return; }
      if (matchHotkeyCombo(e, savedHotkeys.moveLinesUp || 'Alt+Up')) { consume(); handleMoveLines('up'); return; }
      if (matchHotkeyCombo(e, savedHotkeys.moveLinesDown || 'Alt+Down')) { consume(); handleMoveLines('down'); return; }
      if (matchHotkeyCombo(e, savedHotkeys.toUpperCase || 'Ctrl+Shift+U')) { consume(); handleChangeCase('upper'); return; }
      if (matchHotkeyCombo(e, savedHotkeys.toLowerCase || 'Ctrl+Shift+L')) { consume(); handleChangeCase('lower'); return; }

      const targetSearchCombo = savedHotkeys.searchSql || 'Ctrl+F';
      const targetReplaceCombo = savedHotkeys.replaceSql || 'Ctrl+H';
      const targetCompactCombo = savedHotkeys.compactSql || 'Ctrl+Alt+M';
      const targetQuickActionsCombo = savedHotkeys.quickActionsMenu || 'Ctrl+Q';

      const isSearch = matchHotkeyCombo(e, targetSearchCombo);
      const isReplace = matchHotkeyCombo(e, targetReplaceCombo);
      const isCompact = matchHotkeyCombo(e, targetCompactCombo);
      const isQuickActions = matchHotkeyCombo(e, targetQuickActionsCombo);

      if (isSearch) {
        consume();
        openSearchBox(false);
      } else if (isReplace) {
        consume();
        openSearchBox(true);
      } else if (isCompact) {
        consume();
        handleCompactSqlInternal();
      } else if (isQuickActions) {
        if (!(L.isQuickActionsEnabled ?? true) || !L.onExecuteQuickAction) return;
        consume();
        const sel = view.state.selection.main;
        const templates = getQuickActionTemplates();
        const pos = computePopupPos(view, sel.head, Math.min(220, 36 + templates.length * 28));
        if (pos) setCaretPos(pos);
        setShowQuickActionsPopup(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                placeholder={t("Поиск (Ctrl+F)...")}
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
                {searchQuery ? (matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : t('0 совп.')) : ''}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handlePrevMatch}
                title={t("Предыдущее совпадение (Shift+Enter)")}
                className="p-1 rounded hover:bg-slate-700/40 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMatch}
                title={t("Следующее совпадение (Enter)")}
                className="p-1 rounded hover:bg-slate-700/40 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMatchCase(!matchCase)}
                title={matchCase ? t("Учитывать регистр (включено)") : t("Учитывать регистр (выключено)")}
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
                title={useRegex ? t("Регулярные выражения и спецсимволы \\n, \\t (включено)") : t("Регулярные выражения и спецсимволы \\n, \\t (выключено)")}
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
                title={t("Переключить замену (Ctrl+H)")}
                className={`px-1.5 py-1 rounded transition-colors text-[10px] font-semibold flex items-center gap-1 ${
                  showReplace
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
                }`}
              >
                <Replace className="w-3.5 h-3.5" />
                <span>{t("Замена")}</span>
              </button>
              <button
                type="button"
                onClick={closeSearch}
                title={t("Закрыть панель (Esc)")}
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
                placeholder={t("Заменить на...")}
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
                  title={t("Заменить текущее")}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[10px] font-semibold rounded transition-all"
                >
                  {t("Заменить")}
                </button>
                <button
                  type="button"
                  onClick={handleReplaceAll}
                  title={t("Заменить все совпадения")}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white text-[10px] font-semibold rounded transition-all"
                >
                  {t("Заменить всё")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CODE EDITOR BODY AREA */}
      <div className="flex-1 flex flex-row min-h-0 relative overflow-hidden">
        {/* EDITOR (CodeMirror 6) + POPUPS */}
        <div ref={bodyRef} className="flex-1 h-full relative overflow-hidden">
          <div ref={hostRef} className="absolute inset-0" />

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
              <div ref={autocompleteContainerRef} className="max-h-40 overflow-y-auto">
                {suggestions.map((kw, idx) => {
                  const customMatch = customTemplates.find(t => t.keyword === kw);
                  const tableMatch = schemaTables?.find(t => (t.schema_name ? `${t.schema_name}.${t.table_name}` : t.table_name) === kw);
                  let tableBadge = '[tbl]';
                  if (tableMatch?.table_type) {
                    const ttype = tableMatch.table_type.toLowerCase();
                    if (ttype === 'views') tableBadge = '[view]';
                    else if (ttype === 'material views') tableBadge = '[mat_view]';
                    else if (ttype === 'macros') tableBadge = '[macro]';
                    else if (ttype === 'dictionaries') tableBadge = '[dict]';
                  }

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
                      <span className={`text-[10px] shrink-0 font-medium ${idx === selectedIndex ? 'text-blue-200' : 'text-slate-400'}`}>
                        {tableMatch ? tableBadge : (customMatch ? t('шаблон') : t('ключевое слово'))}
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
                      title={t(action.name)}
                      className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors min-w-0 ${
                        theme === 'dark' ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <span className="truncate">{t(action.name)}</span>
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
});
