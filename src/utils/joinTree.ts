// Соединения графа: чистые помощники без зависимостей от парсера.
// Схема базы не нужна — всё определяется по тексту запроса (алиасы в виде alias.колонка).

const STR_LITERAL = /'(?:[^']|'')*'/g;

/** Квалификаторы (alias в `alias.колонка`) в порядке упоминания, как написаны в тексте. Строковые литералы игнорируются. */
export function qualifiersIn(text: string): string[] {
  const clean = String(text ?? '').replace(STR_LITERAL, "''");
  const out: string[] = [];
  // идентификатор: "кавычки", `кавычки` или обычное слово; сразу после него точка и начало следующего имени
  const re = /(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w$]*))\s*\.\s*(?=["`A-Za-z_*])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

/** Родитель присоединяемого источника: первый ранее объявленный алиас из ON (не он сам); иначе — корень (первый в FROM). */
export function pickJoinParent(
  onText: string,
  ownKeys: string[],
  known: Map<string, string>,
  rootId: string
): string {
  const own = new Set(ownKeys.filter(Boolean).map(k => k.toLowerCase()));
  for (const q of qualifiersIn(onText)) {
    const key = q.toLowerCase();
    if (own.has(key)) continue;
    const id = known.get(key);
    if (id) return id;
  }
  return rootId;
}

/** Первый известный алиас, упомянутый в тексте (как написан в запросе) и узел, которому он принадлежит. */
export function firstKnownQualifier(
  text: string,
  known: Map<string, string>
): { alias: string; nodeId: string } | null {
  for (const q of qualifiersIn(text)) {
    const id = known.get(q.toLowerCase());
    if (id) return { alias: q, nodeId: id };
  }
  return null;
}

const MAX_JOIN_LABEL = 84;

/** Подпись стрелки соединения: «LEFT JOIN · условие». Без условия (CROSS, запятая) — только тип. */
export function joinEdgeLabel(joinType: string, condition: string): string {
  const cond = String(condition ?? '').replace(/\s+/g, ' ').trim();
  const head = String(joinType ?? '').trim();
  if (!cond || /^NO CONDITION/i.test(cond)) return head;
  const text = `${head} · ${cond}`;
  return text.length > MAX_JOIN_LABEL ? `${text.slice(0, MAX_JOIN_LABEL - 1)}…` : text;
}

/**
 * Колонки каждого источника, которые запрос упоминает как `alias.колонка` (или `alias.*`), в порядке первого упоминания.
 * Ключ результата — id узла. Колонки без алиаса не разбираются: без схемы их источник не определить.
 */
export function columnsByAlias(texts: string[], known: Map<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const seen = new Map<string, Set<string>>();
  const qualRe = /(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w$]*))\s*\.\s*/g;
  const colRe = /^(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w$]*)|(\*))/;
  for (const raw of texts) {
    const clean = String(raw ?? '').replace(STR_LITERAL, "''");
    qualRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = qualRe.exec(clean)) !== null) {
      const alias = (m[1] ?? m[2] ?? m[3]).toLowerCase();
      const rest = clean.slice(qualRe.lastIndex);
      const c = colRe.exec(rest);
      if (!c) continue;
      const colLen = c[0].length;
      // цепочка schema.table.column: текущее имя — не алиас, следующая итерация разберёт «table.»
      if (/^\s*\./.test(rest.slice(colLen))) continue;
      const nodeId = known.get(alias);
      if (!nodeId) continue;
      const col = c[1] ?? c[2] ?? c[3] ?? c[4];
      const key = col.toLowerCase();
      if (!seen.has(nodeId)) seen.set(nodeId, new Set());
      if (seen.get(nodeId)!.has(key)) continue;
      seen.get(nodeId)!.add(key);
      if (!out.has(nodeId)) out.set(nodeId, []);
      out.get(nodeId)!.push(col);
    }
  }
  return out;
}

/** Условие WHERE для чипов: части по верхнеуровневому AND. Если есть OR — одно условие целиком (иначе чипы читались бы как AND). */
export function conditionChipTexts(parts: { name: string }[], whole: string): string[] {
  const flat = (t: string) => t.replace(/\s+/g, ' ').trim();
  const texts = parts.map(p => flat(p.name)).filter(Boolean);
  if (texts.some(t => /^OR\s/i.test(t))) return [flat(whole)];
  return texts.map(t => t.replace(/^AND\s+/i, ''));
}

/** Сколько источников (элементов FROM) в запросе; для UNION — сумма по частям. */
export function countSources(ast: any): number {
  if (!ast) return 0;
  if (Array.isArray(ast)) return countSources(ast[0]);
  if (ast.type === 'union' && Array.isArray(ast.queries)) {
    return ast.queries.reduce((n: number, q: any) => n + countSources(q), 0);
  }
  return Array.isArray(ast.from) ? ast.from.length : 0;
}
