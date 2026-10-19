import { describe, it, expect } from 'vitest';
import { shouldLeaveCopyToBrowser } from '../src/utils/copyGuard';

// Ctrl+C по выбранной ячейке или столбцу таблицы результатов: когда обработчик приложения уступает браузеру.
// Раньше он уступал при любом выделенном тексте на странице, в том числе остатке выделения в редакторе после запуска
// выделенного фрагмента: ячейка не копировалась, пока пользователь не кликнет в редактор.

const base = { activeTag: 'body', activeIsEditable: false, selectionText: '', selectionInEditor: false };

describe('shouldLeaveCopyToBrowser', () => {
  it('нет выделения, фокус на странице — копирует приложение', () => {
    expect(shouldLeaveCopyToBrowser(base)).toBe(false);
  });

  it('фокус в поле ввода — копирует браузер', () => {
    expect(shouldLeaveCopyToBrowser({ ...base, activeTag: 'input' })).toBe(true);
    expect(shouldLeaveCopyToBrowser({ ...base, activeTag: 'textarea' })).toBe(true);
  });

  it('фокус в редакторе (contenteditable) — копирует браузер', () => {
    expect(shouldLeaveCopyToBrowser({ ...base, activeIsEditable: true })).toBe(true);
  });

  it('остаток выделения в редакторе при фокусе вне него не мешает копировать ячейку', () => {
    expect(shouldLeaveCopyToBrowser({ ...base, selectionText: 'SELECT 1', selectionInEditor: true })).toBe(false);
  });

  it('выделенный текст вне редактора (например, в описании) — копирует браузер, как раньше', () => {
    expect(shouldLeaveCopyToBrowser({ ...base, selectionText: 'текст', selectionInEditor: false })).toBe(true);
  });

  it('пустое выделение не считается', () => {
    expect(shouldLeaveCopyToBrowser({ ...base, selectionText: '', selectionInEditor: false })).toBe(false);
  });

  it('тег в верхнем регистре и пустой тег', () => {
    expect(shouldLeaveCopyToBrowser({ ...base, activeTag: 'INPUT' })).toBe(true);
    expect(shouldLeaveCopyToBrowser({ ...base, activeTag: '' })).toBe(false);
  });
});
