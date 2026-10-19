//! Разбор скрипта SQL на операторы по `;` (п. 3.10, находка RS-01).
//! Строки в одинарных и двойных кавычках (удвоенная кавычка не закрывает), комментарии `-- …` и `/* … */` пропускаются.
//! Обратная косая черта в строках не экранирует (как в DuckDB: `'C:\data\'` — законченная строка).
//! Куски из одних пробелов и комментариев в результат не попадают. Только стандартная библиотека.

#[derive(Clone, Copy, PartialEq)]
enum State {
    Code,
    Single,
    Double,
    LineComment,
    BlockComment,
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
                if c == '-' && next == Some('-') {
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
}
