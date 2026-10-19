// Имя новой вкладки: «Вкладка N» с наименьшим свободным номером (после закрытия «Вкладка 2» новая снова получает «Вкладка 2»).

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `labels` — допустимые написания слова «Вкладка» (текущий язык и русский: вкладка могла быть создана при другом языке).
 * Первое из них используется в имени новой вкладки.
 */
export function nextTabName(existingTitles: readonly string[], ...labels: string[]): string {
  const uniq = Array.from(new Set(labels.filter(Boolean)));
  const used = new Set<number>();
  if (uniq.length > 0) {
    const re = new RegExp(`^(?:${uniq.map(escapeRe).join('|')}) (\\d+)$`);
    for (const title of existingTitles) {
      const m = re.exec(title);
      if (m) used.add(Number(m[1]));
    }
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${uniq[0] ?? ''} ${n}`.trim();
}
