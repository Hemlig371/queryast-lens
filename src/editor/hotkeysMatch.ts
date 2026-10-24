/** Минимальный набор полей события клавиатуры (подходит и для KeyboardEvent, и для React.KeyboardEvent). */
export type ComboEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/**
 * Единственная сборка строки сочетания из события: 'Ctrl+Alt+Shift+KEY'.
 * Её используют запись клавиши в настройках, глобальные обработчики и matchHotkeyCombo.
 */
export const buildComboString = (e: ComboEventLike): string => {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let keyName = e.key ? e.key.toUpperCase() : '';
  if (e.code && e.code.startsWith('Key')) {
    keyName = e.code.slice(3).toUpperCase();
  } else if (e.code && e.code.startsWith('Digit')) {
    keyName = e.code.slice(5);
  } else if (e.code === 'ArrowUp' || e.key === 'ArrowUp' || e.key === 'Up') {
    keyName = 'Up';
  } else if (e.code === 'ArrowDown' || e.key === 'ArrowDown' || e.key === 'Down') {
    keyName = 'Down';
  } else if (e.code === 'Space' || e.key === ' ') {
    keyName = 'Space';
  } else if (e.code === 'Enter' || e.key === 'Enter') {
    keyName = 'Enter';
  } else if (e.code === 'Escape' || e.key === 'Esc' || e.key === 'Escape') {
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
  } else if (e.code === 'Backquote' || e.key === '`' || e.key === '~' || e.key === 'ё' || e.key === 'Ё') {
    keyName = '`';
  }
  // «+» нельзя записать в строку как есть: '+' — разделитель частей сочетания
  if (keyName === '+') keyName = 'Plus';

  return parts.length > 0 ? `${parts.join('+')}+${keyName}` : keyName;
};

const normalizeToken = (t: string): string => {
  const upper = t.trim().toUpperCase();
  if (upper === 'CMD' || upper === 'META' || upper === 'CTRL') return 'CTRL';
  if (upper === 'ARROWUP' || upper === 'UP') return 'UP';
  if (upper === 'ARROWDOWN' || upper === 'DOWN') return 'DOWN';
  if (upper === 'ESCAPE' || upper === 'ESC') return 'ESC';
  if (upper === 'PLUS') return 'PLUS';
  return upper;
};

/** Приводит строку сочетания к виду для сравнения: регистр, синонимы (Cmd/Meta, ArrowUp/Up, Escape/Esc), порядок частей. */
export const normalizeCombo = (combo: string): string => {
  let c = (combo || '').trim();
  if (!c) return '';
  if (c === '+') return 'PLUS';
  if (c.endsWith('++')) c = `${c.slice(0, -2)}+Plus`; // запись «Ctrl++»: плюс как клавиша
  return c.split('+').map(normalizeToken).filter(Boolean).sort().join('+');
};

export const matchHotkeyCombo = (e: ComboEventLike, targetShortcut: string): boolean => {
  if (!targetShortcut) return false;
  const target = normalizeCombo(targetShortcut);
  return target !== '' && normalizeCombo(buildComboString(e)) === target;
};

/**
 * Другое действие, уже занимающее это сочетание (или null). `bindings` — все действия с сочетаниями по умолчанию,
 * `saved` — сохранённые пользовательские значения.
 */
export const findHotkeyConflict = (
  bindings: ReadonlyArray<{ id: string; defaultKey: string }>,
  saved: Record<string, string>,
  actionId: string,
  combo: string,
): string | null => {
  const target = normalizeCombo(combo);
  if (!target) return null;
  for (const b of bindings) {
    if (b.id === actionId || b.id === 'tabSwitchModifier') continue;
    if (normalizeCombo(saved[b.id] || b.defaultKey) === target) return b.id;
  }
  return null;
};
