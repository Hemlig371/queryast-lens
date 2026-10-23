// Действия над таблицей результата (сортировка, фильтр, GROUP BY, «оставить», «удалить», DISTINCT) дописывают блок SQL
// в конец текущей вкладки вместо создания новой (этап E плана 32). Здесь — чистая логика дописывания и замены блока.

export type TableActionKind = 'sort' | 'filter' | 'group' | 'keep' | 'remove' | 'distinct';

/** Дописанный блок: с какой позиции начинается текст блока (вместе с разделителем) и его точный текст. */
export interface TableActionBlock {
  kind: TableActionKind;
  start: number;
  text: string;
}

export const TABLE_ACTION_SEPARATOR = '\n\n/* ------ */\n';

/** Только блоки сортировки и фильтра подряд заменяют друг друга; группировка и прочее всегда дают новый блок. */
const isReplaceable = (kind: TableActionKind): boolean => kind === 'sort' || kind === 'filter';

export interface AppendedBlock {
  /** Новый текст вкладки. */
  sql: string;
  /** Запоминаемый блок (его начало и текст в новом тексте). */
  block: TableActionBlock;
  /** Предыдущий блок заменён, а не дописан. */
  replaced: boolean;
}

/**
 * Дописывает `newSql` в конец `currentSql`.
 * Предыдущий блок заменяется, только если и он, и новый — сортировка/фильтр, и текст от начала блока до конца вкладки
 * в точности равен запомненному (пользователь не правил блок и не печатал под ним). Иначе дописывается новый блок.
 * Текст выше заменяемого блока не затрагивается. В пустую вкладку блок пишется без разделителя.
 */
export function appendTableActionBlock(
  currentSql: string,
  newSql: string,
  kind: TableActionKind,
  previous?: TableActionBlock | null
): AppendedBlock {
  const canReplace =
    !!previous &&
    isReplaceable(kind) &&
    isReplaceable(previous.kind) &&
    Number.isInteger(previous.start) &&
    previous.start >= 0 &&
    previous.start <= currentSql.length &&
    currentSql.slice(previous.start) === previous.text;

  const head = canReplace ? currentSql.slice(0, previous!.start) : currentSql;
  const text = head.trim() === '' ? newSql : TABLE_ACTION_SEPARATOR + newSql;
  const start = head.trim() === '' ? 0 : head.length;
  return {
    sql: (head.trim() === '' ? '' : head) + text,
    block: { kind, start, text },
    replaced: canReplace,
  };
}
