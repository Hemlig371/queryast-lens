import { describe, it, expect } from 'vitest';
import { resolveHotkeyAction, classifyHotkeyTarget, hotkeyHint, APP_HOTKEY_DEFAULTS, type HotkeyEventLike } from '../src/utils/appHotkeys';

// п. 3.9 (H-01, H-02, H-04): одна точка разбора сочетаний, не перехватывать поля ввода и окна, подсказки из настроек.

const ev = (over: Partial<HotkeyEventLike> = {}): HotkeyEventLike => ({
  key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over,
});
const ctrl = (key: string, code: string, extra: Partial<HotkeyEventLike> = {}) => ev({ key, code, ctrlKey: true, ...extra });
const ctx = (over: Partial<Parameters<typeof resolveHotkeyAction>[2]> = {}) => ({ target: 'editor' as const, modalOpen: false, tabCount: 3, ...over });

describe('resolveHotkeyAction: сочетания по умолчанию', () => {
  it('Ctrl+Enter, Ctrl+S, Ctrl+Shift+S, Ctrl+Shift+F', () => {
    expect(resolveHotkeyAction(ctrl('Enter', 'Enter'), {}, ctx())?.action).toBe('visualize');
    expect(resolveHotkeyAction(ctrl('s', 'KeyS'), {}, ctx())?.action).toBe('saveFile');
    expect(resolveHotkeyAction(ctrl('S', 'KeyS', { shiftKey: true }), {}, ctx())?.action).toBe('saveAsFile');
    expect(resolveHotkeyAction(ctrl('F', 'KeyF', { shiftKey: true }), {}, ctx())?.action).toBe('formatSql');
  });

  it('русская раскладка: Ctrl+S по физической клавише', () => {
    expect(resolveHotkeyAction(ctrl('ы', 'KeyS'), {}, ctx())?.action).toBe('saveFile');
  });

  it('metaKey считается как Ctrl', () => {
    expect(resolveHotkeyAction(ev({ key: 's', code: 'KeyS', metaKey: true }), {}, ctx())?.action).toBe('saveFile');
  });

  it('несвязанное сочетание — null', () => {
    expect(resolveHotkeyAction(ctrl('q', 'KeyQ', { shiftKey: true }), {}, ctx())).toBeNull();
    expect(resolveHotkeyAction(ev({ key: 'a', code: 'KeyA' }), {}, ctx())).toBeNull();
  });
});

describe('H-01: переназначенное сочетание заменяет прежнее, а не дополняет', () => {
  it('visualize переназначен на Alt+R: Ctrl+Enter больше ничего не делает, Alt+R срабатывает', () => {
    const hk = { visualize: 'Alt+R' };
    expect(resolveHotkeyAction(ctrl('Enter', 'Enter'), hk, ctx())).toBeNull();
    expect(resolveHotkeyAction(ev({ key: 'r', code: 'KeyR', altKey: true }), hk, ctx())?.action).toBe('visualize');
  });
  it('saveFile переназначен: Ctrl+S свободно', () => {
    const hk = { saveFile: 'Ctrl+Alt+W' };
    expect(resolveHotkeyAction(ctrl('s', 'KeyS'), hk, ctx())).toBeNull();
  });
  it('запись сочетания в другом порядке/регистре распознаётся', () => {
    const hk = { formatSql: 'shift+ctrl+f' };
    expect(resolveHotkeyAction(ctrl('F', 'KeyF', { shiftKey: true }), hk, ctx())?.action).toBe('formatSql');
  });
});

describe('H-02: поля ввода и окна', () => {
  it('в обычном поле ввода (input/textarea) сочетания приложения не перехватываются, включая Esc', () => {
    expect(resolveHotkeyAction(ctrl('/', 'Slash'), {}, ctx({ target: 'field' }))).toBeNull();
    expect(resolveHotkeyAction(ctrl('r', 'KeyR'), {}, ctx({ target: 'field' }))).toBeNull();
    expect(resolveHotkeyAction(ev({ key: 'Escape', code: 'Escape' }), {}, ctx({ target: 'field' }))).toBeNull();
  });
  it('в редакторе SQL сочетания работают', () => {
    expect(resolveHotkeyAction(ctrl('/', 'Slash'), {}, ctx({ target: 'editor' }))?.action).toBe('commentBlock');
  });
  it('вне полей ввода (кнопки, таблица) работают', () => {
    expect(resolveHotkeyAction(ctrl('r', 'KeyR'), {}, ctx({ target: 'other' }))?.action).toBe('refreshSchema');
  });
  it('пока открыто окно, работает только Esc', () => {
    expect(resolveHotkeyAction(ctrl('s', 'KeyS'), {}, ctx({ target: 'other', modalOpen: true }))).toBeNull();
    expect(resolveHotkeyAction(ctrl('Enter', 'Enter'), {}, ctx({ target: 'other', modalOpen: true }))).toBeNull();
    expect(resolveHotkeyAction(ev({ key: 'Escape', code: 'Escape' }), {}, ctx({ target: 'other', modalOpen: true }))?.action).toBe('escapeAction');
  });
});

describe('переключение вкладок', () => {
  it('Ctrl+2 выбирает вторую вкладку, если она есть', () => {
    const r = resolveHotkeyAction(ctrl('2', 'Digit2'), {}, ctx({ tabCount: 3 }));
    expect(r).toEqual({ action: 'selectTab', tabIndex: 1 });
  });
  it('вкладки с таким номером нет: сочетание свободно для других действий', () => {
    expect(resolveHotkeyAction(ctrl('9', 'Digit9'), {}, ctx({ tabCount: 3 }))).toBeNull();
  });
  it('другой модификатор в настройках', () => {
    const hk = { tabSwitchModifier: 'Alt' };
    expect(resolveHotkeyAction(ctrl('2', 'Digit2'), hk, ctx())).toBeNull();
    expect(resolveHotkeyAction(ev({ key: '2', code: 'Digit2', altKey: true }), hk, ctx())).toEqual({ action: 'selectTab', tabIndex: 1 });
  });
  it('в окне и в поле ввода вкладки не переключаются', () => {
    expect(resolveHotkeyAction(ctrl('2', 'Digit2'), {}, ctx({ modalOpen: true }))).toBeNull();
    expect(resolveHotkeyAction(ctrl('2', 'Digit2'), {}, ctx({ target: 'field' }))).toBeNull();
  });
});

describe('classifyHotkeyTarget', () => {
  const el = (tagName: string, extra: any = {}) => ({ tagName, isContentEditable: false, closest: () => null, ...extra });
  it('input / textarea / select — поле', () => {
    expect(classifyHotkeyTarget(el('INPUT'))).toBe('field');
    expect(classifyHotkeyTarget(el('TEXTAREA'))).toBe('field');
    expect(classifyHotkeyTarget(el('SELECT'))).toBe('field');
  });
  it('contenteditable внутри редактора SQL — редактор; вне его — поле', () => {
    expect(classifyHotkeyTarget(el('DIV', { isContentEditable: true, closest: (sel: string) => (sel === '.cm-editor' ? {} : null) }))).toBe('editor');
    expect(classifyHotkeyTarget(el('DIV', { isContentEditable: true }))).toBe('field');
  });
  it('поле поиска внутри редактора остаётся полем', () => {
    expect(classifyHotkeyTarget(el('INPUT', { closest: () => ({}) }))).toBe('field');
  });
  it('прочие элементы и отсутствие цели — other', () => {
    expect(classifyHotkeyTarget(el('BUTTON'))).toBe('other');
    expect(classifyHotkeyTarget(null)).toBe('other');
  });
});

describe('H-04: подсказки берут сочетание из настроек', () => {
  it('сочетание по умолчанию', () => {
    expect(hotkeyHint('Форматировать SQL', {}, 'formatSql')).toBe('Форматировать SQL (Ctrl+Shift+F)');
    expect(hotkeyHint('Обновить схему', {}, 'refreshSchema')).toBe('Обновить схему (Ctrl+R)');
    expect(hotkeyHint('Формат в одну строку', {}, 'compactSql')).toBe('Формат в одну строку (Ctrl+Alt+M)');
  });
  it('переназначенное сочетание', () => {
    expect(hotkeyHint('Форматировать SQL', { formatSql: 'Alt+L' }, 'formatSql')).toBe('Форматировать SQL (Alt+L)');
  });
  it('пустое значение в настройках — берётся сочетание по умолчанию', () => {
    expect(hotkeyHint('Форматировать SQL', { formatSql: '' }, 'formatSql')).toBe('Форматировать SQL (Ctrl+Shift+F)');
  });
  it('таблица умолчаний содержит все действия приложения', () => {
    for (const id of ['visualize', 'saveFile', 'openFile', 'copySql', 'commentBlock', 'toggleWrap', 'formatSql', 'openSnippets', 'toggleMaximized', 'toggleTheme', 'openSettings', 'exportResultsCopy', 'saveAsFile', 'refreshSchema', 'escapeAction', 'toggleMiniMap', 'exportGraph', 'toggleColumnStats', 'openActionMenu', 'exportSettings', 'importSettings', 'exportExcelReport']) {
      expect(typeof (APP_HOTKEY_DEFAULTS as any)[id]).toBe('string');
    }
  });
});

// Страховка от возврата прежней схемы (путь от process.cwd())
import fs from 'node:fs';
import path from 'node:path';
describe('App.tsx: обработчик горячих клавиш', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  it('использует resolveHotkeyAction и не держит второй обработчик Ctrl+Enter / Ctrl+S', () => {
    expect(src).toContain('resolveHotkeyAction(e, currentHotkeys');
    expect(src).not.toContain('выполнение по Ctrl+Enter — только в развёрнутом редакторе');
    expect(src).not.toMatch(/combo === \(currentHotkeys\./);
  });
  it('подсказки не содержат зашитых сочетаний', () => {
    expect(src).not.toContain('Форматировать SQL (Ctrl+Shift+F)');
    expect(src).not.toContain('Обновить схему (Ctrl+R)');
    expect(src).not.toContain('Формат в одну строку (Ctrl+Alt+M)');
  });
});
