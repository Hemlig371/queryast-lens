/** Rename only identifiers, leaving SQL literals and comments byte-for-byte intact.
 * Replay uses its own temporary objects in the editor's existing connection.
 */
const tokens = /'(?:''|[^'])*'|"(?:""|[^"])*"|\$([A-Za-z_][A-Za-z_0-9]*|)\$[\s\S]*?\$\1\$|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9$]*/g;
const identifier = (value: string) => value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value;

export function isolateReplaySql(statements: string[], suffix = crypto.randomUUID().replaceAll('-', '')) {
  const names = new Map<string, string>();
  for (const sql of statements) {
    const match = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TEMP(?:ORARY)?\s+TABLE\s+("(?:""|[^"])+"|[A-Za-z_][A-Za-z_0-9$]*)/i.exec(sql);
    if (match) {
      const key = identifier(match[1]).toLowerCase();
      if (!names.has(key)) names.set(key, `lens_replay_${suffix}_${names.size}`);
    }
  }
  if (!names.size) throw new Error('No temporary View construction found; SQL replay is unavailable');
  const rewritten = statements.map(sql => sql.replace(tokens, token => {
    const name = names.get(identifier(token).toLowerCase());
    return name ? `"${name}"` : token;
  }).replace(/^(\s*CREATE\s+)(?!OR\s+REPLACE\b)(TEMP(?:ORARY)?\s+TABLE\b)/i, '$1OR REPLACE $2'));
  const sql = rewritten.map(statement => statement.trim().replace(/;+$/, '') + ';').join('\n\n');
  // Keep the data SELECT last. Cleanup is explicit, so the editor returns the result.
  const cleanup = [...names.values()].reverse().map(name => `-- DROP TABLE IF EXISTS "${name}";`).join('\n');
  return {sql: `${sql}\n\n-- Optional cleanup after using the result:\n${cleanup}`, statements: rewritten};
}
