// Размеры узлов графа. Раскладка (getLayoutedElements) и экспорт Draw.io используют одну функцию.

export interface SizedNodeLike {
  type?: string;
  data?: any;
}

// --- Оценка высоты карточек ---
// Стрелки прикрепляются к сторонам карточек по расчётным размерам, поэтому оценка близка к реальной
// вёрстке (Tailwind: рамка 2px, шапка 28px, отступы тела 12px, строки 10px при line-height 1.5).
const BOX = 4; // border-2 с двух сторон
const HEAD = 28; // шапка карточки
const BODY_PAD = 24; // p-3
const TEXT_LINE = 15; // text-[10px]
const LIST_CAP = 224; // max-h-56
const CHARS_PER_LINE = 32; // знаков моноширинного 10px-текста в строке внутри карточки
const CHIP_H = 21;
const CHIP_GAP = 4;

// Число строк при переносе по словам (как рисует браузер): слово, не влезшее в строку, уходит на следующую
const textLines = (s: unknown, perLine = CHARS_PER_LINE): number => {
  const words = String(s ?? '').split(/\s+/).filter(Boolean);
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    if (w.length > perLine) {
      if (cur > 0) lines++;
      lines += Math.ceil(w.length / perLine) - 1;
      cur = w.length % perLine || perLine;
    } else if (cur === 0) cur = w.length;
    else if (cur + 1 + w.length <= perLine) cur += 1 + w.length;
    else { lines++; cur = w.length; }
  }
  return lines;
};

const chipsHeight = (data: any): number => {
  const n = Array.isArray(data?.chips) ? data.chips.length : 0;
  return n > 0 ? 8 + n * CHIP_H + (n - 1) * CHIP_GAP : 0;
};

const colName = (col: any): string => (typeof col === 'string' ? col : String(col?.name ?? ''));

const preciseHeight = (node: SizedNodeLike): number | null => {
  const data = node.data || {};
  switch (node.type) {
    case 'tableNode': {
      let h = BOX + HEAD + BODY_PAD + 20; // название
      if (data.alias) h += 24;
      if (Array.isArray(data.subqueryTables) && data.subqueryTables.length > 0) h += 23;
      const cols: any[] = Array.isArray(data.columns) ? data.columns : [];
      if (cols.length > 0) {
        const list = cols.reduce((sum, c) => sum + 29 + (c?.alias ? 15.5 : 0), 0) + 4 * (cols.length - 1);
        h += 17 + Math.min(192, list); // отступ 8 + линия 1 + отступ 8
      }
      return Math.ceil(h + chipsHeight(data));
    }
    case 'resultNode': {
      const cols: any[] = Array.isArray(data.columns) ? data.columns : [];
      let list = /^(Operation:|Source rows)/.test(String(data.title || '')) ? 0 : 24;
      if (cols.length > 0) {
        list = cols.reduce((sum, c) => sum + 14 + TEXT_LINE * textLines(colName(c), c?.src ? 26 : CHARS_PER_LINE) + (c?.alias ? 15.5 : 0), 0) + 6 * (cols.length - 1);
      }
      return Math.ceil(BOX + HEAD + BODY_PAD + Math.min(LIST_CAP, list) + chipsHeight(data));
    }
    case 'filterNode': {
      const cols: any[] = Array.isArray(data.columns) ? data.columns : [];
      let body: number;
      if (cols.length > 0) {
        body = cols.reduce((sum, c) => {
          const name = colName(c);
          return sum + 14 + TEXT_LINE * textLines(name) + (/^(AND|OR)\s/i.test(name) ? 15.5 : 0);
        }, 0) + 6 * (cols.length - 1);
      } else {
        body = 18 + TEXT_LINE * textLines(data.condition || 'N/A');
      }
      return Math.ceil(BOX + HEAD + BODY_PAD + Math.min(LIST_CAP, body));
    }
    case 'constantNode':
      return Math.ceil(BOX + HEAD + BODY_PAD + 18 + TEXT_LINE * textLines(data.details || 'Только константные выражения'));
    case 'joinNode':
      return data.condition === '' ? 78 : 112; // без строки ON (операции над множествами) карточка ниже
    default:
      return null;
  }
};

/** Размер узла по содержимому карточки. */
export const getNodeDimensions = (node: SizedNodeLike): { width: number; height: number } => {
  if (node.type === 'frameNode') {
    return { width: Number(node.data?.width) || 200, height: Number(node.data?.height) || 150 };
  }
  if (node.type === 'collapseNode') return { width: 220, height: 32 }; // компактный заголовок запроса
  const precise = preciseHeight(node);
  return { width: 256, height: precise !== null ? precise : 90 }; // 256 = Tailwind w-64
};
