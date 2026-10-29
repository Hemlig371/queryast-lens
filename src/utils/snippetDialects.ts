// Названия диалектов шаблонов. Написание «Clickhouse» — единое по всему приложению (тип диалекта в App, sqlFormat, сессия, встроенные шаблоны),
// поэтому именно оно считается каноническим; отличающийся только регистром вариант («ClickHouse») приводится к нему.

export const KNOWN_DIALECTS = ['PostgreSQL', 'MySQL', 'SQLite', 'Oracle', 'Clickhouse', 'DuckDB', 'MS SQL', 'Snowflake'] as const;

const CANONICAL = new Map<string, string>([...KNOWN_DIALECTS, 'General'].map(d => [d.toLowerCase(), d]));

/** Известный диалект в каноническом написании (без учёта регистра); остальные названия возвращаются как есть, без пробелов по краям. */
export function canonicalDialect(name: string | undefined | null): string {
  const trimmed = (name ?? '').trim();
  return CANONICAL.get(trimmed.toLowerCase()) ?? trimmed;
}

/** Список без повторов, различающихся только регистром; остаётся первое написание, пустые строки отбрасываются. */
export function uniqueDialects(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = canonicalDialect(raw);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}
