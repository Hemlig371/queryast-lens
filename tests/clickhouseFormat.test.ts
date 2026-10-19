import { describe, it, expect } from 'vitest';
import {
  stripCommentsAndLiterals, needsJsonFormat, appendJsonFormat,
  getFormatClause, hasFormatClause, isJsonResponseExpected, copyFormatForPath, appendCopyFormat, stripTrailingNoise,
} from '../src/utils/clickhouseFormat';

describe('needsJsonFormat', () => {
  it('обычный SELECT — да', () => {
    expect(needsJsonFormat('SELECT 1')).toBe(true);
    expect(needsJsonFormat('  with a as (select 1) select * from a')).toBe(true);
    expect(needsJsonFormat('SHOW TABLES')).toBe(true);
  });
  it('комментарий перед запросом не мешает (запуск всей вкладки)', () => {
    expect(needsJsonFormat('-- {{$per="default"."actors"}}\nSELECT * FROM x')).toBe(true);
    expect(needsJsonFormat('/* a */\n-- b\nSELECT 1')).toBe(true);
  });
  it('формат задан пользователем — нет', () => {
    expect(needsJsonFormat('SELECT 1 FORMAT CSV')).toBe(false);
    expect(needsJsonFormat('SELECT 1\nformat TabSeparated;')).toBe(false);
  });
  it('слово format в комментарии или строке формат не задаёт', () => {
    expect(needsJsonFormat('-- format later\nSELECT 1')).toBe(true);
    expect(needsJsonFormat("SELECT 'format' AS a")).toBe(true);
    expect(needsJsonFormat('SELECT 1 /* FORMAT CSV */')).toBe(true);
    expect(needsJsonFormat('SELECT "format" FROM t')).toBe(true);
  });
  it('COPY ... TO / FROM не получает FORMAT JSON (в том числе с комментарием в начале)', () => {
    expect(needsJsonFormat("COPY (SELECT 1) TO 'out.csv'")).toBe(false);
    expect(needsJsonFormat("-- выгрузка\nCOPY (SELECT 1) TO 'out.parquet'")).toBe(false);
    expect(needsJsonFormat("COPY t FROM 'in.csv'")).toBe(false);
  });
  it('формат пользователя не перебивается и при комментарии в начале', () => {
    expect(needsJsonFormat('-- csv\nSELECT 1 FORMAT CSVWithNames')).toBe(false);
  });
  it('не запрос на чтение — нет', () => {
    expect(needsJsonFormat('INSERT INTO t VALUES (1)')).toBe(false);
    expect(needsJsonFormat('-- c\nCREATE TABLE t (a Int8) ENGINE=Memory')).toBe(false);
    expect(needsJsonFormat('')).toBe(false);
  });
});

describe('stripCommentsAndLiterals', () => {
  it('убирает комментарии, содержимое строк оставляет пустым, учитывает экранирование', () => {
    expect(stripCommentsAndLiterals("SELECT 'a\\'b -- x' -- tail\n, 2")).toBe("SELECT '' \n, 2");
    expect(stripCommentsAndLiterals("SELECT 'it''s' /* c */ 1")).toBe("SELECT ''   1");
    expect(stripCommentsAndLiterals('/* не закрыт')).toBe(' ');
  });
});

describe('appendJsonFormat', () => {
  it('добавляет с новой строки и убирает ; в конце', () => {
    expect(appendJsonFormat('SELECT 1;')).toBe('SELECT 1\nFORMAT JSON');
    expect(appendJsonFormat('SELECT 1 \n')).toBe('SELECT 1\nFORMAT JSON');
  });
  it('хвостовой -- комментарий не съедает FORMAT', () => {
    expect(appendJsonFormat('SELECT 1 -- c')).toBe('SELECT 1 -- c\nFORMAT JSON');
  });
});

// п. 2.20: единый признак «в конце оператора есть FORMAT»
describe('hasFormatClause / getFormatClause', () => {
  it('FORMAT в конце оператора (регистр, ;, перевод строки, SETTINGS после)', () => {
    expect(getFormatClause('SELECT 1 FORMAT CSV')).toBe('CSV');
    expect(getFormatClause('SELECT 1\nformat TabSeparated;')).toBe('TabSeparated');
    expect(getFormatClause('SELECT 1 FORMAT JSON SETTINGS max_threads=1')).toBe('JSON');
    expect(hasFormatClause('INSERT INTO t FORMAT CSVWithNames')).toBe(true);
  });
  it('после -- комментария FORMAT всё ещё виден; внутри комментария и строки — нет', () => {
    expect(hasFormatClause('SELECT 1 FORMAT CSV -- csv\n')).toBe(true);
    expect(hasFormatClause('SELECT 1 -- FORMAT CSV')).toBe(false);
    expect(hasFormatClause("SELECT 'x FORMAT CSV'")).toBe(false);
    expect(hasFormatClause('SELECT 1 /* FORMAT CSV */')).toBe(false);
  });
  it('столбец с именем format формата не задаёт (B-09)', () => {
    expect(hasFormatClause('SELECT format FROM t')).toBe(false);
    expect(hasFormatClause('SELECT x AS format FROM t')).toBe(false);
    expect(hasFormatClause('SELECT a FROM t ORDER BY format DESC')).toBe(false);
    expect(hasFormatClause('SELECT a FROM t WHERE format = 1')).toBe(false);
    expect(hasFormatClause('SELECT a AS format SETTINGS max_threads=1')).toBe(false);
  });
  it('FORMAT в середине запроса (не в конце) формата не задаёт', () => {
    expect(hasFormatClause('SELECT format, b FROM t')).toBe(false);
  });
});

describe('needsJsonFormat: столбец format (B-09)', () => {
  it('SELECT format FROM t и SELECT x AS format получают FORMAT JSON', () => {
    expect(needsJsonFormat('SELECT format FROM t')).toBe(true);
    expect(needsJsonFormat('SELECT x AS format FROM t')).toBe(true);
    expect(needsJsonFormat('SELECT a FROM t ORDER BY format DESC')).toBe(true);
  });
  it('явный FORMAT после -- комментария в конце не перебивается', () => {
    expect(needsJsonFormat('SELECT 1 FORMAT CSV -- csv')).toBe(false);
  });
});

describe('isJsonResponseExpected', () => {
  it('строки с FORMAT JSON — да; другой формат, INSERT и DDL — нет', () => {
    expect(isJsonResponseExpected('SELECT 1\nFORMAT JSON')).toBe(true);
    expect(isJsonResponseExpected('-- c\nSELECT 1 FORMAT json')).toBe(true);
    expect(isJsonResponseExpected('SELECT 1 FORMAT CSV')).toBe(false);
    expect(isJsonResponseExpected('SELECT 1')).toBe(false);
    expect(isJsonResponseExpected('CREATE TABLE t (a Int8) ENGINE=Memory')).toBe(false);
  });
});

describe('copyFormatForPath / appendCopyFormat', () => {
  it('формат по расширению', () => {
    expect(copyFormatForPath('out.csv')).toBe('CSVWithNames');
    expect(copyFormatForPath('C:\\dir.v2\\OUT.TSV')).toBe('TSVWithNames');
    expect(copyFormatForPath('/tmp/a.tab')).toBe('TSVWithNames');
    expect(copyFormatForPath('a.json')).toBe('JSONEachRow');
    expect(copyFormatForPath('a.parquet')).toBe('Parquet');
    expect(copyFormatForPath('a.xlsx')).toBe('Parquet');
  });
  it('FORMAT дописывается с новой строки и убирает ; в конце', () => {
    expect(appendCopyFormat('SELECT 1;', 'x.csv')).toBe('SELECT 1\nFORMAT CSVWithNames');
  });
  it('хвостовой -- комментарий не съедает FORMAT (CK-01)', () => {
    const out = appendCopyFormat('SELECT 1 -- выгрузка', 'x.csv');
    expect(out).toBe('SELECT 1 -- выгрузка\nFORMAT CSVWithNames');
    expect(hasFormatClause(out)).toBe(true);
  });
  it('заданный пользователем FORMAT не перебивается (в том числе после -- комментария)', () => {
    expect(appendCopyFormat('SELECT 1 FORMAT Parquet;', 'x.csv')).toBe('SELECT 1 FORMAT Parquet');
    expect(appendCopyFormat('SELECT 1 FORMAT JSON -- c', 'x.csv')).toBe('SELECT 1 FORMAT JSON -- c');
  });
  it('слово format в комментарии, строке и имени столбца формат не задаёт', () => {
    expect(appendCopyFormat('-- format csv\nSELECT 1', 'x.csv')).toBe('-- format csv\nSELECT 1\nFORMAT CSVWithNames');
    expect(appendCopyFormat("SELECT 'format' AS a", 'x.json')).toBe("SELECT 'format' AS a\nFORMAT JSONEachRow");
    expect(appendCopyFormat('SELECT format FROM t', 'x.csv')).toBe('SELECT format FROM t\nFORMAT CSVWithNames');
  });
  it('INSERT для COPY FROM', () => {
    expect(appendCopyFormat('INSERT INTO t', 'in.tsv')).toBe('INSERT INTO t\nFORMAT TSVWithNames');
  });
});

describe('stripTrailingNoise', () => {
  it('убирает хвостовые пробелы, ; и комментарии', () => {
    expect(stripTrailingNoise("COPY t TO 'x.csv'; -- готово")).toBe("COPY t TO 'x.csv'");
    expect(stripTrailingNoise("COPY t TO 'x.csv' /* a */ ; /* b */\n")).toBe("COPY t TO 'x.csv'");
  });
  it('-- и ; внутри кавычек сохраняются', () => {
    expect(stripTrailingNoise("COPY t TO 'a--b;c.csv'")).toBe("COPY t TO 'a--b;c.csv'");
    expect(stripTrailingNoise("SELECT 'it''s' -- tail")).toBe("SELECT 'it''s'");
  });
  it('текст без хвоста не меняется', () => {
    expect(stripTrailingNoise('SELECT 1')).toBe('SELECT 1');
  });
});
