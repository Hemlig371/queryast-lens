import { describe, it, expect } from 'vitest';
import { splitSqlSegments, maskSql, dollarQuoteTag } from '../src/utils/sqlTokens';
import { splitBySemicolonIgnoringQuotes } from '../src/lib/sqlUtils';
import { buildPagedSql, hasOwnRowLimit } from '../src/utils/pagedSql';

const CMD = `cd .. && "bin/tool.exe"
    --conn X --query-file "./a.sql"
    --out "./a.parquet" | `;
const paged = (sql: string) => buildPagedSql(sql, { page: 1, pageSize: 200, mode: 'normal', dialect: 'duckdb' } as any);

describe('строки в долларовых кавычках', () => {
  it('`$$…$$` — одна строка, `--` и `;` внутри не комментарий и не разделитель', () => {
    const sql = `SELECT * FROM shell($$ ${CMD} $$);`;
    const strings = splitSqlSegments(sql).filter((s) => s.type === 'string');
    expect(strings).toHaveLength(1);
    expect(strings[0].text.startsWith('$$')).toBe(true);
    expect(splitSqlSegments(sql).some((s) => s.type === 'line-comment')).toBe(false);
    expect(maskSql(sql)).not.toContain('--');
    expect(splitBySemicolonIgnoringQuotes(`SELECT $$a;b$$; SELECT 2`)).toEqual(['SELECT $$a;b$$', ' SELECT 2']);
  });

  it('`$тег$…$тег$`: `$$` внутри не закрывает строку', () => {
    const sql = `SELECT $q$ a $$ -- b ; $q$ AS x`;
    expect(splitSqlSegments(sql).filter((s) => s.type === 'string').map((s) => s.text)).toEqual(['$q$ a $$ -- b ; $q$']);
    expect(splitBySemicolonIgnoringQuotes(sql)).toEqual([sql]);
  });

  it('не метки: `$1`, `$name`, `a$b$`; незакрытая строка тянется до конца', () => {
    expect(dollarQuoteTag('$1 + $2', 0)).toBeNull();
    expect(dollarQuoteTag('x $name', 2)).toBeNull();
    expect(dollarQuoteTag('a$b$', 1)).toBeNull();
    expect(dollarQuoteTag('$_t1$', 0)).toBe('$_t1$');
    const open = splitSqlSegments('SELECT $$ abc -- d');
    expect(open[open.length - 1]).toEqual({ type: 'string', text: '$$ abc -- d' });
  });

  it('LIMIT дописывается после запроса, а не внутрь команды', () => {
    const sql = `SELECT * FROM shell($$ ${CMD} $$);`;
    const out = paged(sql).main;
    expect(out).toContain(`${CMD} $$)`);
    expect(out).toContain('LIMIT 200');
    expect(out.indexOf('LIMIT 200')).toBeGreaterThan(out.indexOf('$$)'));
  });

  it('собственный LIMIT после `$$…$$)` виден и запрос не меняется', () => {
    const sql = `SELECT * FROM shell($$ ${CMD} $$) LIMIT 1000;`;
    expect(hasOwnRowLimit(sql, 'duckdb')).toBe(true);
    expect(paged(sql).main).toBe(sql);
  });

  it('`LIMIT` внутри `$$…$$` собственным лимитом не считается', () => {
    expect(hasOwnRowLimit(`SELECT $$ LIMIT 5 $$ AS x`, 'duckdb')).toBe(false);
  });
});
