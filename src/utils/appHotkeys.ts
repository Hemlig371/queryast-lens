// Разбор глобальных сочетаний клавиш приложения: чистая функция вместо длинной цепочки if в App.tsx.
import { buildComboString, normalizeCombo, type ComboEventLike } from '../editor/hotkeysMatch';

export type HotkeyEventLike = ComboEventLike;

/** Действия, которыми управляют глобальные сочетания (порядок = порядок проверки). */
export const APP_HOTKEY_DEFAULTS = {
  visualize: 'Ctrl+Enter',
  saveFile: 'Ctrl+S',
  openFile: 'Ctrl+O',
  copySql: 'Ctrl+Shift+C',
  commentBlock: 'Ctrl+/',
  toggleWrap: 'Alt+W',
  formatSql: 'Ctrl+Shift+F',
  openSnippets: 'Ctrl+K',
  toggleMaximized: 'Alt+F',
  toggleTheme: 'Alt+T',
  openSettings: 'Ctrl+,',
  exportResultsCopy: 'Ctrl+Shift+E',
  saveAsFile: 'Ctrl+Shift+S',
  refreshSchema: 'Ctrl+R',
  escapeAction: 'Esc',
  toggleMiniMap: 'Alt+M',
  exportGraph: 'Ctrl+E',
  toggleColumnStats: 'Alt+Q',
  openActionMenu: 'Ctrl+`',
  exportSettings: 'Ctrl+Alt+S',
  importSettings: 'Ctrl+Alt+A',
  exportExcelReport: 'Ctrl+Alt+E',
  // не глобальное действие (обрабатывается в редакторе), нужно для подсказок
  compactSql: 'Ctrl+Alt+M',
} as const;

export type AppHotkeyId = keyof typeof APP_HOTKEY_DEFAULTS;
export type AppHotkeyAction = Exclude<AppHotkeyId, 'compactSql'> | 'selectTab';

export interface HotkeyResolution {
  action: AppHotkeyAction;
  /** Для selectTab: индекс вкладки с нуля. */
  tabIndex?: number;
}

export type HotkeyTargetKind = 'editor' | 'field' | 'other';

export interface HotkeyContext {
  /** Где находится фокус: редактор SQL, поле ввода или что-то другое (кнопка, таблица). */
  target: HotkeyTargetKind;
  /** Открыто одно из окон приложения (настройки, шаблоны, история, ClickHouse). */
  modalOpen: boolean;
  tabCount: number;
}

export interface HotkeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/** Класс элемента, на котором стоит фокус. Поля ввода (input/textarea/select и contenteditable вне редактора SQL) глобальные сочетания не перехватывают. */
export function classifyHotkeyTarget(target: HotkeyTargetLike | null | undefined): HotkeyTargetKind {
  if (!target) return 'other';
  const tag = (target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'field';
  if (target.closest && target.closest('.cm-editor')) return 'editor';
  if (target.isContentEditable) return 'field';
  return 'other';
}

const ORDER = (Object.keys(APP_HOTKEY_DEFAULTS) as AppHotkeyId[]).filter((id) => id !== 'compactSql') as Exclude<AppHotkeyId, 'compactSql'>[];

function tabDigit(e: HotkeyEventLike): number | null {
  if (e.code && e.code.startsWith('Digit')) {
    const d = parseInt(e.code.slice(5), 10);
    if (d >= 1 && d <= 9) return d;
    return null;
  }
  if (e.key && e.key >= '1' && e.key <= '9') return parseInt(e.key, 10);
  return null;
}

function tabModifierHeld(e: HotkeyEventLike, modifier: string): boolean {
  if (modifier === 'Ctrl') return e.ctrlKey || e.metaKey;
  if (modifier === 'Alt') return e.altKey;
  if (modifier === 'Shift') return e.shiftKey;
  if (modifier === 'Meta') return e.metaKey;
  return false;
}

/**
 * Какое действие приложения вызывает это нажатие (null — никакое).
 * - сочетание берётся только из настроек (или значения по умолчанию): жёстко заданные Ctrl+Enter/Ctrl+S отдельно не работают;
 * - в полях ввода ничего не перехватывается; пока открыто окно, доступен только Esc.
 */
export function resolveHotkeyAction(
  e: HotkeyEventLike,
  hotkeys: Record<string, string | undefined>,
  ctx: HotkeyContext
): HotkeyResolution | null {
  if (ctx.target === 'field') return null;

  const combo = normalizeCombo(buildComboString(e));

  if (!ctx.modalOpen) {
    const modifier = hotkeys.tabSwitchModifier || 'Ctrl';
    if (tabModifierHeld(e, modifier)) {
      const digit = tabDigit(e);
      if (digit !== null && digit - 1 < ctx.tabCount) return { action: 'selectTab', tabIndex: digit - 1 };
    }
  }

  for (const id of ORDER) {
    if (ctx.modalOpen && id !== 'escapeAction') continue;
    const target = hotkeys[id] || APP_HOTKEY_DEFAULTS[id];
    if (normalizeCombo(target) === combo) return { action: id };
  }
  return null;
}

/** Текст подсказки кнопки: «Название (сочетание из настроек)». */
export function hotkeyHint(label: string, hotkeys: Record<string, string | undefined>, id: AppHotkeyId): string {
  const combo = hotkeys[id] || APP_HOTKEY_DEFAULTS[id];
  return combo ? `${label} (${combo})` : label;
}
