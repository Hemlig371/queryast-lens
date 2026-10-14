import type React from 'react';

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
  } else if (e.code === 'Backquote' || e.key === '`' || e.key === '~' || e.key === 'ё' || e.key === 'Ё') {
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


/** Строка вида 'Ctrl+Alt+Shift+KEY' для сравнения с сохранёнными хоткеями (вынесено без изменений из прежнего глобального обработчика). */
export const buildComboString = (e: KeyboardEvent): string => {
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
  } else if (e.code === 'Backquote' || e.key === '`' || e.key === '~' || e.key === 'ё' || e.key === 'Ё') {
    keyName = '`';
  }

  const combo = parts.length > 0 ? `${parts.join('+')}+${keyName}` : keyName;
  return combo;
};
