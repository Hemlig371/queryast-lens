import { describe, it, expect } from 'vitest';
import {
  buildComboString,
  matchHotkeyCombo,
  normalizeCombo,
  findHotkeyConflict,
  type ComboEventLike,
} from '../src/editor/hotkeysMatch';

/** Простое событие клавиатуры без DOM. */
const ev = (over: Partial<ComboEventLike>): ComboEventLike => ({
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});

const EVENTS: Record<string, ComboEventLike> = {
  'Ctrl+Enter': ev({ key: 'Enter', code: 'Enter', ctrlKey: true }),
  'Shift+Alt+Up': ev({ key: 'ArrowUp', code: 'ArrowUp', altKey: true, shiftKey: true }),
  'Alt+Down': ev({ key: 'ArrowDown', code: 'ArrowDown', altKey: true }),
  Esc: ev({ key: 'Escape', code: 'Escape' }),
  'Ctrl+S': ev({ key: 's', code: 'KeyS', ctrlKey: true }),
  'Ctrl+S (рус. раскладка)': ev({ key: 'ы', code: 'KeyS', ctrlKey: true }),
  'Ctrl+Shift+V': ev({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true }),
  'Ctrl+Space': ev({ key: ' ', code: 'Space', ctrlKey: true }),
  'Ctrl+/': ev({ key: '/', code: 'Slash', ctrlKey: true }),
  'Ctrl+1': ev({ key: '1', code: 'Digit1', ctrlKey: true }),
  'Ctrl+`': ev({ key: 'ё', code: 'Backquote', ctrlKey: true }),
  'Ctrl+= ': ev({ key: '=', code: 'Equal', ctrlKey: true }),
  'Ctrl+NumpadAdd (+)': ev({ key: '+', code: 'NumpadAdd', ctrlKey: true }),
  'Meta+K (Mac)': ev({ key: 'k', code: 'KeyK', metaKey: true }),
  F5: ev({ key: 'F5', code: 'F5' }),
  'Old IE Esc': ev({ key: 'Esc' }),
};

describe('buildComboString', () => {
  it('Ctrl+Enter', () => {
    expect(buildComboString(EVENTS['Ctrl+Enter'])).toBe('Ctrl+Enter');
  });
  it('Shift+Alt+Up собирается в Ctrl/Alt/Shift-порядке с именем Up', () => {
    expect(buildComboString(EVENTS['Shift+Alt+Up'])).toBe('Alt+Shift+Up');
    expect(buildComboString(EVENTS['Alt+Down'])).toBe('Alt+Down');
  });
  it('Esc без модификаторов', () => {
    expect(buildComboString(EVENTS.Esc)).toBe('Esc');
    expect(buildComboString(EVENTS['Old IE Esc'])).toBe('Esc');
  });
  it('буква берётся по физической клавише, а не по раскладке', () => {
    expect(buildComboString(EVENTS['Ctrl+S (рус. раскладка)'])).toBe('Ctrl+S');
  });
  it('Meta считается как Ctrl', () => {
    expect(buildComboString(EVENTS['Meta+K (Mac)'])).toBe('Ctrl+K');
  });
  it('«+» записывается как Plus и не ломает разбор', () => {
    expect(buildComboString(EVENTS['Ctrl+NumpadAdd (+)'])).toBe('Ctrl+Plus');
  });
});

describe('matchHotkeyCombo', () => {
  it('Ctrl+Enter совпадает с записями в любом регистре и с Cmd/Meta', () => {
    const e = EVENTS['Ctrl+Enter'];
    expect(matchHotkeyCombo(e, 'Ctrl+Enter')).toBe(true);
    expect(matchHotkeyCombo(e, 'ctrl+enter')).toBe(true);
    expect(matchHotkeyCombo(e, 'Cmd+Enter')).toBe(true);
    expect(matchHotkeyCombo(e, 'Enter+Ctrl')).toBe(true);
  });
  it('Shift+Alt+Up совпадает с Up и ArrowUp независимо от порядка модификаторов', () => {
    const e = EVENTS['Shift+Alt+Up'];
    expect(matchHotkeyCombo(e, 'Alt+Shift+Up')).toBe(true);
    expect(matchHotkeyCombo(e, 'Shift+Alt+ArrowUp')).toBe(true);
    expect(matchHotkeyCombo(e, 'Alt+Up')).toBe(false);
    expect(matchHotkeyCombo(e, 'Alt+Shift+Down')).toBe(false);
  });
  it('Esc совпадает с Esc и Escape', () => {
    expect(matchHotkeyCombo(EVENTS.Esc, 'Esc')).toBe(true);
    expect(matchHotkeyCombo(EVENTS.Esc, 'Escape')).toBe(true);
    expect(matchHotkeyCombo(EVENTS.Esc, 'Ctrl+Esc')).toBe(false);
  });
  it('лишний модификатор или другая клавиша — не совпадение', () => {
    expect(matchHotkeyCombo(EVENTS['Ctrl+Enter'], 'Ctrl+Shift+Enter')).toBe(false);
    expect(matchHotkeyCombo(EVENTS['Ctrl+Enter'], 'Enter')).toBe(false);
    expect(matchHotkeyCombo(EVENTS['Ctrl+S'], 'Ctrl+D')).toBe(false);
  });
  it('пустое сочетание не совпадает ни с чем', () => {
    expect(matchHotkeyCombo(EVENTS.F5, '')).toBe(false);
    expect(matchHotkeyCombo(ev({}), '')).toBe(false);
  });
  it('русская раскладка: Ctrl+Ы совпадает с Ctrl+S', () => {
    expect(matchHotkeyCombo(EVENTS['Ctrl+S (рус. раскладка)'], 'Ctrl+S')).toBe(true);
  });
  it('прежняя запись «Ctrl++» совпадает с клавишей «+»', () => {
    expect(matchHotkeyCombo(EVENTS['Ctrl+NumpadAdd (+)'], 'Ctrl++')).toBe(true);
    expect(matchHotkeyCombo(EVENTS['Ctrl+NumpadAdd (+)'], 'Ctrl+Plus')).toBe(true);
    expect(matchHotkeyCombo(EVENTS['Ctrl+= '], 'Ctrl++')).toBe(false);
  });
});

describe('круговая проверка buildComboString → matchHotkeyCombo', () => {
  for (const [name, e] of Object.entries(EVENTS)) {
    it(`событие «${name}» совпадает с собственной записью`, () => {
      expect(matchHotkeyCombo(e, buildComboString(e))).toBe(true);
    });
  }
  it('разные события не совпадают с чужими записями', () => {
    const names = Object.keys(EVENTS);
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue;
        const same = normalizeCombo(buildComboString(EVENTS[a])) === normalizeCombo(buildComboString(EVENTS[b]));
        // одна и та же клавиша в разных видах события (старый IE, русская раскладка)
        const SAME_KEY = ['Esc|Old IE Esc', 'Ctrl+S|Ctrl+S (рус. раскладка)'];
        if (same) expect(SAME_KEY).toContain([a, b].sort().join('|'));
        else expect(SAME_KEY).not.toContain([a, b].sort().join('|'));
      }
    }
  });
});

describe('normalizeCombo', () => {
  it('синонимы и порядок', () => {
    expect(normalizeCombo('Cmd+Shift+ArrowUp')).toBe(normalizeCombo('shift+ctrl+up'));
    expect(normalizeCombo('')).toBe('');
    expect(normalizeCombo('+')).toBe('PLUS');
  });
});

describe('findHotkeyConflict', () => {
  const bindings = [
    { id: 'visualize', defaultKey: 'Ctrl+Enter' },
    { id: 'saveFile', defaultKey: 'Ctrl+S' },
    { id: 'moveLinesUp', defaultKey: 'Alt+Up' },
    { id: 'tabSwitchModifier', defaultKey: 'Ctrl' },
  ];
  it('находит действие, уже занявшее сочетание (по умолчанию)', () => {
    expect(findHotkeyConflict(bindings, {}, 'saveFile', 'Ctrl+Enter')).toBe('visualize');
  });
  it('учитывает сохранённые значения вместо умолчаний', () => {
    expect(findHotkeyConflict(bindings, { visualize: 'Ctrl+R' }, 'saveFile', 'Ctrl+Enter')).toBeNull();
    expect(findHotkeyConflict(bindings, { visualize: 'Ctrl+R' }, 'saveFile', 'Ctrl+R')).toBe('visualize');
  });
  it('своё же сочетание конфликтом не считается', () => {
    expect(findHotkeyConflict(bindings, {}, 'saveFile', 'Ctrl+S')).toBeNull();
  });
  it('синонимы записи считаются тем же сочетанием', () => {
    expect(findHotkeyConflict(bindings, {}, 'saveFile', 'Alt+ArrowUp')).toBe('moveLinesUp');
  });
  it('tabSwitchModifier — не сочетание, пустое сочетание — не конфликт', () => {
    expect(findHotkeyConflict(bindings, {}, 'saveFile', 'Ctrl')).toBeNull();
    expect(findHotkeyConflict(bindings, {}, 'saveFile', '')).toBeNull();
  });
});
