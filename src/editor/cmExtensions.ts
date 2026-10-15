import { EditorView, Decoration, ViewPlugin, MatchDecorator } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import type { Extension, Range } from '@codemirror/state';
import { SQL_COLORS, VARIABLE_PATTERN, sqlHighlighting } from './sqlLanguage';
import { findMatchingBrackets } from './editorOps';

export const EDITOR_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/** Тема оформления редактора (цвета совпадают с прежним textarea-редактором). */
export const buildEditorTheme = (theme: 'dark' | 'light'): Extension => {
  const dark = theme === 'dark';
  const colors = SQL_COLORS[theme];
  const caret = dark ? '#60a5fa' : '#2563eb';
  return [
    EditorView.theme(
      {
        '&': {
          height: '100%',
          fontSize: '12px',
          color: dark ? '#cbd5e1' : '#1e293b',
          backgroundColor: 'transparent',
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          fontFamily: EDITOR_FONT_FAMILY,
          lineHeight: '20px',
          overflow: 'auto',
        },
        '.cm-content': { padding: '12px 0', caretColor: caret, fontVariantLigatures: 'none' },
        '.cm-line': { padding: '0 12px' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: caret, borderLeftWidth: '2px' },
        '.cm-dropCursor': { borderLeftColor: dark ? '#38bdf8' : '#0284c7' },
        '.cm-selectionBackground': { backgroundColor: dark ? 'rgba(59,130,246,0.30)' : 'rgba(59,130,246,0.28)' },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
          backgroundColor: dark ? 'rgba(59,130,246,0.42)' : 'rgba(59,130,246,0.36)',
        },
        '.cm-placeholder': { color: '#64748b' },
        '.cm-gutters': {
          backgroundColor: dark ? 'rgba(30,41,59,0.8)' : '#e2e8f0',
          color: '#64748b',
          border: 'none',
          borderRight: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
          minWidth: '40px',
          fontFamily: EDITOR_FONT_FAMILY,
        },
        '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px', minWidth: '40px', boxSizing: 'border-box' },
        // Подсветка совпадений поиска
        '.lens-match': {
          backgroundColor: dark ? 'rgba(251,191,36,0.25)' : 'rgba(254,240,138,0.9)',
          boxShadow: `0 0 0 1px ${dark ? 'rgba(251,191,36,0.4)' : 'rgba(250,204,21,0.6)'}`,
          borderRadius: '2px',
        },
        '.lens-match-current': {
          backgroundColor: dark ? 'rgba(245,158,11,0.6)' : '#fcd34d',
          boxShadow: `0 0 0 2px ${dark ? '#fbbf24' : '#f59e0b'}`,
          borderRadius: '2px',
          fontWeight: '600',
        },
        // Другие вхождения выделенного слова
        '.lens-occurrence': {
          backgroundColor: dark ? 'rgba(251,191,36,0.25)' : 'rgba(254,240,138,0.9)',
          boxShadow: `0 0 0 1px ${dark ? 'rgba(251,191,36,0.4)' : 'rgba(250,204,21,0.6)'}`,
          borderRadius: '2px',
        },
        // Парные скобки
        '.lens-bracket': {
          backgroundColor: dark ? 'rgba(59,130,246,0.35)' : '#bfdbfe',
          color: dark ? '#bfdbfe' : '#1e3a8a',
          boxShadow: `0 0 0 1px ${dark ? 'rgba(96,165,250,0.8)' : 'rgba(59,130,246,0.8)'}`,
          borderRadius: '2px',
          fontWeight: '700',
        },
        // Переменные внутри строк и комментариев: цвет токена (строка/комментарий) стоит во вложенном
        // <span>, поэтому красим и сам маркер, и его вложенные span-ы — иначе цвет строки перебивает цвет переменной.
        '.lens-var-param, .lens-var-param span': { color: colors.varParam },
        '.lens-var-secret, .lens-var-secret span': { color: colors.varSecret },
      },
      { dark }
    ),
    sqlHighlighting(theme),
  ];
};

// --------------------------- переменные {{...}} -----------------------------

const variableMatcher = new MatchDecorator({
  regexp: new RegExp(VARIABLE_PATTERN, 'g'),
  decoration: (match) =>
    Decoration.mark({ class: match[0].startsWith('{{$') ? 'lens-var-param' : 'lens-var-secret' }),
});

/** Подсветка {{$var}} и {{SECRET}} в любом месте текста, в том числе внутри комментариев и строк. */
export const variableDecorations: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = variableMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = variableMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations }
);

// ------------------------ подсветка совпадений поиска -----------------------

/** Эффект: заменить набор декораций поиска (формируется React-слоем). */
export const setSearchDecorations = StateEffect.define<DecorationSet>();
/** Эффект: активна ли панель поиска (пока активна — не подсвечиваем вхождения выделенного слова). */
export const setSearchActive = StateEffect.define<boolean>();

export const searchDecorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) if (e.is(setSearchDecorations)) value = e.value;
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const searchActiveField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSearchActive)) value = e.value;
    return value;
  },
});

export const buildSearchDecorations = (
  matches: { start: number; length: number }[],
  currentIndex: number,
  docLength: number
): DecorationSet => {
  const ranges: Range<Decoration>[] = [];
  matches.forEach((m, i) => {
    if (m.length <= 0 || m.start + m.length > docLength) return;
    ranges.push(
      Decoration.mark({ class: i === currentIndex ? 'lens-match-current' : 'lens-match' }).range(m.start, m.start + m.length)
    );
  });
  return Decoration.set(ranges, true);
};

// ----------- вхождения выделенного слова + парные скобки (по курсору) --------

const MAX_BRACKET_DOC = 150_000;

const buildCursorDecorations = (view: EditorView): DecorationSet => {
  const state = view.state;
  const sel = state.selection.main;
  const ranges: Range<Decoration>[] = [];

  if (!sel.empty) {
    const raw = state.sliceDoc(sel.from, sel.to).trim();
    const searchActive = state.field(searchActiveField, false);
    if (!searchActive && raw.length >= 1 && raw.length <= 100 && !raw.includes('\n')) {
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = /^\w+$/.test(raw) ? `\\b${escaped}\\b` : escaped;
      try {
        const re = new RegExp(pattern, 'gi');
        for (const { from, to } of view.visibleRanges) {
          const text = state.sliceDoc(from, to);
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            if (m[0].length === 0) { re.lastIndex++; continue; }
            ranges.push(Decoration.mark({ class: 'lens-occurrence' }).range(from + m.index, from + m.index + m[0].length));
          }
        }
      } catch {
        // некорректный шаблон — пропускаем
      }
    }
  } else if (state.doc.length < MAX_BRACKET_DOC) {
    const pair = findMatchingBrackets(state.doc.toString(), sel.head);
    if (pair) {
      for (const idx of pair) {
        ranges.push(Decoration.mark({ class: 'lens-bracket' }).range(idx, idx + 1));
      }
    }
  }
  return Decoration.set(ranges, true);
};

export const cursorDecorations: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCursorDecorations(view);
    }
    update(update: ViewUpdate) {
      const searchChanged = update.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchActive)));
      if (update.selectionSet || update.docChanged || update.viewportChanged || searchChanged) {
        this.decorations = buildCursorDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);