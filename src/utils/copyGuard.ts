// Ctrl+C по выбранной ячейке или столбцу таблицы результатов: когда обработчик приложения должен уступить браузеру.

export interface CopyGuardState {
  /** Тег элемента в фокусе (document.activeElement.tagName), любой регистр. */
  activeTag: string;
  /** Элемент в фокусе редактируемый (contenteditable, в том числе редактор SQL). */
  activeIsEditable: boolean;
  /** Выделенный на странице текст (window.getSelection().toString()). */
  selectionText: string;
  /** Выделение находится внутри редактора SQL. */
  selectionInEditor: boolean;
}

/**
 * true — копирует браузер (поле ввода, редактор, обычный выделенный текст), false — копирует приложение (ячейка, столбец).
 * Остаток выделения в редакторе при фокусе вне него не считается: иначе после запуска выделенного фрагмента ячейка
 * не копировалась бы, пока пользователь не кликнет в редактор.
 */
export function shouldLeaveCopyToBrowser(s: CopyGuardState): boolean {
  const tag = (s.activeTag || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || s.activeIsEditable) return true;
  return s.selectionText.length > 0 && !s.selectionInEditor;
}

/** Выделение находится внутри редактора SQL (CodeMirror). */
export function isSelectionInEditor(selection: Selection | null): boolean {
  const node = selection?.anchorNode;
  const el = node instanceof Element ? node : node?.parentElement;
  return !!el?.closest?.('.cm-editor');
}
