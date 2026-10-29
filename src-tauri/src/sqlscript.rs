//! Разбор скрипта SQL на операторы по `;`.
//! Строки в одинарных и двойных кавычках (удвоенная кавычка не закрывает), комментарии `-- …` и `/* … */` пропускаются.
//! Обратная косая черта в строках не экранирует (как в DuckDB: `'C:\data\'` — законченная строка).
//! Строки в долларовых кавычках `$$…$$` и `$тег$…$тег$` пропускаются целиком (как `dollarQuoteEnd` на фронтенде).
//! Куски из одних пробелов и комментариев в результат не попадают. Только стандартная библиотека.

#[derive(Clone, Copy, PartialEq)]
enum State {
    Code,
    Single,
    Double,
    LineComment,
    BlockComment,
}

fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$' || (c as u32) >= 0x80
}

/// Индекс сразу после закрывающей границы строки в долларовых кавычках, которая начинается в `pos`; None — такой строки здесь нет или она не закрыта.
fn dollar_quote_end(chars: &[char], pos: usize) -> Option<usize> {
    if chars.get(pos) != Some(&'$') {
        return None;
    }
    // граница не может быть продолжением идентификатора (`a$$`, `x$tag$`) и параметром (`$1`)
    if pos > 0 && is_ident_char(chars[pos - 1]) {
        return None;
    }
    let mut j = pos + 1;
    if let Some(&first) = chars.get(j) {
        if first.is_ascii_alphabetic() || first == '_' || (first as u32) >= 0x80 {
            while j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '_' || (chars[j] as u32) >= 0x80) {
                j += 1;
            }
        }
    }
    if chars.get(j) != Some(&'$') {
        return None;
    }
    let delim = &chars[pos..=j];
    let start = j + 1;
    if start + delim.len() > chars.len() {
        return None;
    }
    (start..=chars.len() - delim.len())
        .find(|&k| &chars[k..k + delim.len()] == delim)
        .map(|k| k + delim.len())
}

/// Операторы скрипта без завершающей `;`, с исходными пробелами и комментариями внутри.
pub fn split_statements(sql: &str) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut has_code = false;
    let mut state = State::Code;
    let mut i = 0;

    let mut flush = |cur: &mut String, has_code: &mut bool| {
        if *has_code {
            out.push(cur.trim().to_string());
        }
        cur.clear();
        *has_code = false;
    };

    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        match state {
            State::Code => {
                if c == ';' {
                    flush(&mut cur, &mut has_code);
                    i += 1;
                    continue;
                }
                if c == '$' {
                    if let Some(end) = dollar_quote_end(&chars, i) {
                        cur.extend(chars[i..end].iter());
                        has_code = true;
                        i = end;
                        continue;
                    }
                    has_code = true;
                } else if c == '-' && next == Some('-') {
                    state = State::LineComment;
                } else if c == '/' && next == Some('*') {
                    state = State::BlockComment;
                    cur.push(c);
                    cur.push('*');
                    i += 2;
                    continue;
                } else if c == '\'' {
                    state = State::Single;
                    has_code = true;
                } else if c == '"' {
                    state = State::Double;
                    has_code = true;
                } else if !c.is_whitespace() {
                    has_code = true;
                }
                cur.push(c);
            }
            State::Single | State::Double => {
                let quote = if state == State::Single { '\'' } else { '"' };
                cur.push(c);
                if c == quote {
                    if next == Some(quote) {
                        cur.push(quote);
                        i += 2;
                        continue;
                    }
                    state = State::Code;
                }
            }
            State::LineComment => {
                cur.push(c);
                if c == '\n' {
                    state = State::Code;
                }
            }
            State::BlockComment => {
                cur.push(c);
                if c == '*' && next == Some('/') {
                    cur.push('/');
                    state = State::Code;
                    i += 2;
                    continue;
                }
            }
        }
        i += 1;
    }
    flush(&mut cur, &mut has_code);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_statement() {
        assert_eq!(split_statements("SELECT 1"), vec!["SELECT 1"]);
        assert_eq!(split_statements("SELECT 1;"), vec!["SELECT 1"]);
        assert_eq!(split_statements("  SELECT 1 ;  "), vec!["SELECT 1"]);
    }

    #[test]
    fn several_statements() {
        assert_eq!(
            split_statements("CREATE TABLE t(a INT); INSERT INTO t VALUES (1);\nSELECT * FROM t"),
            vec!["CREATE TABLE t(a INT)", "INSERT INTO t VALUES (1)", "SELECT * FROM t"]
        );
    }

    #[test]
    fn semicolon_in_string_or_identifier() {
        assert_eq!(split_statements("SELECT 'a;b'; SELECT 2"), vec!["SELECT 'a;b'", "SELECT 2"]);
        assert_eq!(split_statements("SELECT \"a;b\" FROM t; SELECT 2"), vec!["SELECT \"a;b\" FROM t", "SELECT 2"]);
        assert_eq!(split_statements("SELECT 'it''s;ok'; SELECT 2"), vec!["SELECT 'it''s;ok'", "SELECT 2"]);
    }

    #[test]
    fn backslash_does_not_escape() {
        // 'C:\data\' — законченная строка, второй оператор не склеивается с первым
        assert_eq!(split_statements("SELECT 'C:\\data\\'; SELECT 2"), vec!["SELECT 'C:\\data\\'", "SELECT 2"]);
    }

    #[test]
    fn semicolon_in_comments() {
        assert_eq!(split_statements("SELECT 1 -- a;b\n; SELECT 2"), vec!["SELECT 1 -- a;b", "SELECT 2"]);
        assert_eq!(split_statements("SELECT 1 /* a;b */; SELECT 2"), vec!["SELECT 1 /* a;b */", "SELECT 2"]);
    }

    #[test]
    fn comment_only_pieces_are_dropped() {
        assert_eq!(split_statements("SELECT 1; -- конец"), vec!["SELECT 1"]);
        assert_eq!(split_statements("-- только комментарий"), Vec::<String>::new());
        assert_eq!(split_statements(" ; ;; "), Vec::<String>::new());
        assert_eq!(split_statements(""), Vec::<String>::new());
    }

    #[test]
    fn comment_before_statement_is_kept() {
        assert_eq!(split_statements("-- заголовок\nSELECT 1"), vec!["-- заголовок\nSELECT 1"]);
    }

    #[test]
    fn dash_inside_string_is_not_comment() {
        assert_eq!(split_statements("SELECT 'a--b'; SELECT 2"), vec!["SELECT 'a--b'", "SELECT 2"]);
    }

    #[test]
    fn unterminated_string_runs_to_the_end() {
        assert_eq!(split_statements("SELECT 'abc; SELECT 2"), vec!["SELECT 'abc; SELECT 2"]);
    }

    #[test]
    fn non_ascii_text() {
        assert_eq!(split_statements("SELECT 'Иванов;'; SELECT 'Пётр'"), vec!["SELECT 'Иванов;'", "SELECT 'Пётр'"]);
    }

    #[test]
    fn dollar_quoted_string_is_one_piece() {
        assert_eq!(split_statements("SELECT $$a;b$$; SELECT 2"), vec!["SELECT $$a;b$$", "SELECT 2"]);
        assert_eq!(split_statements("SELECT $t$a;b$$c$t$; SELECT 2"), vec!["SELECT $t$a;b$$c$t$", "SELECT 2"]);
    }

    #[test]
    fn quote_inside_dollar_string_does_not_swallow_script() {
        // апостроф внутри $$…$$ не открывает «строку» до конца скрипта
        assert_eq!(
            split_statements("INSERT INTO t VALUES ($$it's$$); INSERT INTO t VALUES (2); SELEC 1"),
            vec!["INSERT INTO t VALUES ($$it's$$)", "INSERT INTO t VALUES (2)", "SELEC 1"]
        );
        assert_eq!(split_statements("SELECT $$\"x /* y$$; SELECT 2"), vec!["SELECT $$\"x /* y$$", "SELECT 2"]);
    }

    #[test]
    fn dollar_is_not_a_quote_in_params_identifiers_or_unclosed() {
        assert_eq!(split_statements("SELECT $1; SELECT $2"), vec!["SELECT $1", "SELECT $2"]);
        assert_eq!(split_statements("SELECT a$$b; SELECT 2"), vec!["SELECT a$$b", "SELECT 2"]);
        assert_eq!(split_statements("SELECT $$abc; SELECT 2"), vec!["SELECT $$abc", "SELECT 2"]);
    }
}
