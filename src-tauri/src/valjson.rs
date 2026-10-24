//! Значение DuckDB (`duckdb::types::Value`) → JSON.
//!
//! LIST, ARRAY, STRUCT, MAP, UNION и ENUM переводятся рекурсивно в `serde_json::Value` (а не в Rust Debug вроде `List([Int(1), Int(2)])`), а ячейка верхнего уровня
//! получает JSON-ТЕКСТ (`[1,2]`, `{"a":1}`) — строкой, как и остальные составные значения Tauri-режима (BIGINT, DECIMAL, даты),
//! и как делает WASM-нормализация (src/utils/wasmResult.ts): для таблицы, сортировки и Excel ячейка остаётся примитивом.
//!
//! Внутри вложенных значений: BIGINT, HUGEINT, UBIGINT и DECIMAL — строки (JS не держит их без потерь), даты и время — текст
//! как у chrono, NaN и ±Inf — строки `"NaN"`, `"Infinity"`, `"-Infinity"` (числом в JSON их записать нельзя),
//! BLOB — `"<blob N bytes>"`, ключи MAP — строки (не-строковый ключ записывается как его JSON-текст).
//! Те же функции (`float_json`, `date_cell`, `timestamp_cell`) используются для DATE, TIMESTAMP, FLOAT и DOUBLE на верхнем уровне:
//! даты до 1970 года и `infinity` не роняют запрос. Interval и TIMESTAMPTZ не затрагиваются.

use crate::timefmt;
use duckdb::types::{TimeUnit, Value};
use serde_json::{Number, Value as JsonValue};

fn per_second(unit: &TimeUnit) -> i64 {
    match unit {
        TimeUnit::Second => 1,
        TimeUnit::Millisecond => 1_000,
        TimeUnit::Microsecond => 1_000_000,
        TimeUnit::Nanosecond => 1_000_000_000,
    }
}

/// Число с плавающей точкой как JSON. NaN и ±Infinity числом не записать — они строки (null не отличался бы в таблице от NULL).
pub fn float_json(text_of_number: String, as_f64: f64) -> JsonValue {
    if as_f64.is_nan() {
        return JsonValue::String("NaN".to_string());
    }
    if as_f64.is_infinite() {
        return JsonValue::String(if as_f64 > 0.0 { "Infinity" } else { "-Infinity" }.to_string());
    }
    // f32 разворачивается через его собственную запись: 0.1f32 остаётся 0.1, а не 0.10000000149011612
    let parsed = text_of_number.parse::<f64>().unwrap_or(as_f64);
    Number::from_f64(parsed).map(JsonValue::Number).unwrap_or(JsonValue::Null)
}

/// DATE верхнего уровня по числу суток от 1970-01-01 (отрицательное — до 1970 года). Не использует chrono: `row.get::<NaiveDate>`
/// и `NaiveDateTime` для дат до 1970 с долей секунды и для `infinity` возвращали None и роняли запрос.
pub fn date_cell(days_since_epoch: i32) -> JsonValue {
    JsonValue::String(timefmt::format_date(i64::from(days_since_epoch)))
}

/// TIMESTAMP верхнего уровня (единица времени и значение от 1970-01-01 00:00:00), формат как у chrono: дробная часть 3/6/9 знаков.
pub fn timestamp_cell(unit: &TimeUnit, value: i64) -> JsonValue {
    let (secs, nanos) = timefmt::split_units(value, per_second(unit));
    JsonValue::String(timefmt::format_timestamp(secs, nanos))
}

/// Скалярное значение как JSON. Составные значения сюда не попадают (см. `write_json`); неизвестный тип — запасной текст.
fn scalar_to_json(v: &Value) -> JsonValue {
    match v {
        Value::Null => JsonValue::Null,
        Value::Boolean(b) => JsonValue::Bool(*b),
        Value::TinyInt(n) => JsonValue::from(*n),
        Value::SmallInt(n) => JsonValue::from(*n),
        Value::Int(n) => JsonValue::from(*n),
        Value::BigInt(n) => JsonValue::String(n.to_string()),
        Value::HugeInt(n) => JsonValue::String(n.to_string()),
        Value::UTinyInt(n) => JsonValue::from(*n),
        Value::USmallInt(n) => JsonValue::from(*n),
        Value::UInt(n) => JsonValue::from(*n),
        Value::UBigInt(n) => JsonValue::String(n.to_string()),
        Value::Float(n) => float_json(n.to_string(), f64::from(*n)),
        Value::Double(n) => float_json(n.to_string(), *n),
        Value::Decimal(n) => JsonValue::String(n.to_string()),
        Value::Text(s) => JsonValue::String(s.clone()),
        Value::Enum(s) => JsonValue::String(s.clone()),
        Value::Blob(b) => JsonValue::String(format!("<blob {} bytes>", b.len())),
        Value::Date32(days) => date_cell(*days),
        Value::Time64(unit, t) => {
            let (secs, nanos) = timefmt::split_units(*t, per_second(unit));
            JsonValue::String(timefmt::format_time(secs, nanos))
        }
        Value::Timestamp(unit, t) => timestamp_cell(unit, *t),
        Value::Interval { months, days, nanos } => JsonValue::String(format!("{}m {}d {}ns", months, days, nanos)),
        // Типы, которых здесь нет, и составные значения: безопасный запасной вариант, чтобы не терять значение.
        #[allow(unreachable_patterns)]
        other => JsonValue::String(format!("{:?}", other)),
    }
}

/// Записывает значение как JSON-текст. Текст собирается вручную, а не через `serde_json::Map`: без feature `preserve_order`
/// (она тянет indexmap, новая зависимость) Map сортирует ключи по алфавиту, а порядок полей STRUCT важен.
fn write_json(v: &Value, out: &mut String) {
    match v {
        Value::List(items) | Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_json(item, out);
            }
            out.push(']');
        }
        Value::Struct(fields) => {
            out.push('{');
            for (i, entry) in fields.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&JsonValue::String(entry.0.clone()).to_string());
                out.push(':');
                write_json(&entry.1, out);
            }
            out.push('}');
        }
        Value::Map(pairs) => {
            out.push('{');
            for (i, entry) in pairs.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                // ключ JSON — всегда строка: строковый ключ берётся как есть, остальные — их JSON-текстом
                let key = match &entry.0 {
                    Value::Text(s) | Value::Enum(s) => s.clone(),
                    other => {
                        let mut t = String::new();
                        write_json(other, &mut t);
                        t
                    }
                };
                out.push_str(&JsonValue::String(key).to_string());
                out.push(':');
                write_json(&entry.1, out);
            }
            out.push('}');
        }
        Value::Union(inner) => write_json(inner, out),
        other => out.push_str(&scalar_to_json(other).to_string()),
    }
}

/// Значение (в том числе вложенное) как JSON-текст.
pub fn value_to_json_text(v: &Value) -> String {
    let mut s = String::new();
    write_json(v, &mut s);
    s
}

/// Ячейка верхнего уровня для значений, которые execute_query не разбирает через `ValueRef`.
/// Составные значения — JSON-текст; ENUM и TEXT — их текст без кавычек; UNION — значение внутри; остальное — скаляр.
pub fn top_level_cell(v: &Value) -> JsonValue {
    match v {
        Value::Null => JsonValue::Null,
        Value::Text(s) | Value::Enum(s) => JsonValue::String(s.clone()),
        Value::Union(inner) => top_level_cell(inner),
        Value::List(_) | Value::Array(_) | Value::Struct(_) | Value::Map(_) => JsonValue::String(value_to_json_text(v)),
        other => scalar_to_json(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duckdb::types::OrderedMap;

    fn text(v: &Value) -> String {
        match top_level_cell(v) {
            JsonValue::String(s) => s,
            other => other.to_string(),
        }
    }

    #[test]
    fn list_of_ints() {
        let v = Value::List(vec![Value::Int(1), Value::Int(2)]);
        assert_eq!(text(&v), "[1,2]");
    }

    #[test]
    fn struct_with_one_field() {
        let v = Value::Struct(OrderedMap::from(vec![("a".to_string(), Value::Int(1))]));
        assert_eq!(text(&v), "{\"a\":1}");
    }

    #[test]
    fn struct_keeps_field_order_and_nests() {
        // порядок полей — как в запросе, не по алфавиту
        let v = Value::Struct(OrderedMap::from(vec![
            ("b".to_string(), Value::List(vec![Value::Text("x".into()), Value::Null])),
            ("a".to_string(), Value::Boolean(true)),
        ]));
        assert_eq!(text(&v), "{\"b\":[\"x\",null],\"a\":true}");
    }

    #[test]
    fn map_with_int_keys_becomes_object() {
        let v = Value::Map(OrderedMap::from(vec![(Value::Int(1), Value::Text("one".into())), (Value::Int(2), Value::Text("two".into()))]));
        assert_eq!(text(&v), "{\"1\":\"one\",\"2\":\"two\"}");
    }

    #[test]
    fn array_type() {
        let v = Value::Array(vec![Value::Double(1.5), Value::Double(2.0)]);
        assert_eq!(text(&v), "[1.5,2.0]");
    }

    #[test]
    fn bigint_decimal_inside_list_are_strings() {
        let v = Value::List(vec![Value::BigInt(9_007_199_254_740_993), Value::UBigInt(u64::MAX), Value::HugeInt(-170141183460469231731687303715884105728)]);
        assert_eq!(text(&v), "[\"9007199254740993\",\"18446744073709551615\",\"-170141183460469231731687303715884105728\"]");
    }

    #[test]
    fn nan_and_inf_become_strings() {
        let v = Value::List(vec![Value::Double(f64::NAN), Value::Double(f64::INFINITY), Value::Float(f32::NEG_INFINITY)]);
        assert_eq!(text(&v), "[\"NaN\",\"Infinity\",\"-Infinity\"]");
    }

    #[test]
    fn top_level_float_double_nan_inf() {
        assert_eq!(float_json(f64::NAN.to_string(), f64::NAN), JsonValue::String("NaN".into()));
        assert_eq!(float_json(f32::INFINITY.to_string(), f64::from(f32::INFINITY)), JsonValue::String("Infinity".into()));
        assert_eq!(float_json(f64::NEG_INFINITY.to_string(), f64::NEG_INFINITY), JsonValue::String("-Infinity".into()));
        // обычные значения: FLOAT 0.1 остаётся 0.1, а не 0.10000000149011612
        assert_eq!(float_json(0.1f32.to_string(), f64::from(0.1f32)).to_string(), "0.1");
        assert_eq!(float_json(1.5f64.to_string(), 1.5).to_string(), "1.5");
        assert_eq!(float_json(0.0f64.to_string(), 0.0).to_string(), "0.0");
    }

    #[test]
    fn top_level_dates_before_epoch_and_infinity_do_not_panic() {
        assert_eq!(date_cell(-1), JsonValue::String("1969-12-31".into()));
        assert_eq!(date_cell(19_723), JsonValue::String("2024-01-01".into()));
        // `infinity` у DATE — i32::MAX суток; главное, что есть текст, а не паника
        assert!(matches!(date_cell(i32::MAX), JsonValue::String(_)));
        // 1969-12-31 23:59:59.500
        assert_eq!(timestamp_cell(&TimeUnit::Millisecond, -500), JsonValue::String("1969-12-31 23:59:59.500".into()));
        // 1899-12-31 23:59:59.999999 (на микросекунду раньше 1900-01-01)
        assert_eq!(timestamp_cell(&TimeUnit::Microsecond, -2_208_988_800_000_001), JsonValue::String("1899-12-31 23:59:59.999999".into()));
        assert_eq!(timestamp_cell(&TimeUnit::Second, 1_706_704_496), JsonValue::String("2024-01-31 12:34:56".into()));
        assert_eq!(timestamp_cell(&TimeUnit::Nanosecond, 1), JsonValue::String("1970-01-01 00:00:00.000000001".into()));
        assert!(matches!(timestamp_cell(&TimeUnit::Microsecond, i64::MAX), JsonValue::String(_)));
        assert!(matches!(timestamp_cell(&TimeUnit::Microsecond, i64::MIN), JsonValue::String(_)));
    }

    #[test]
    fn float_keeps_short_form() {
        let v = Value::List(vec![Value::Float(0.1)]);
        assert_eq!(text(&v), "[0.1]");
    }

    #[test]
    fn dates_and_times_inside_list() {
        let v = Value::List(vec![
            Value::Date32(19_723),
            Value::Time64(TimeUnit::Microsecond, 45_296_000_000),
            Value::Timestamp(TimeUnit::Microsecond, 1_706_704_496_250_000_000 / 1000),
        ]);
        assert_eq!(text(&v), "[\"2024-01-01\",\"12:34:56\",\"2024-01-31 12:34:56.250\"]");
    }

    #[test]
    fn blob_and_interval_inside_list() {
        let v = Value::List(vec![Value::Blob(vec![1, 2, 3]), Value::Interval { months: 1, days: 2, nanos: 3 }]);
        assert_eq!(text(&v), "[\"<blob 3 bytes>\",\"1m 2d 3ns\"]");
    }

    #[test]
    fn union_at_top_level_shows_inner_value() {
        assert_eq!(text(&Value::Union(Box::new(Value::Text("abc".into())))), "abc");
        assert_eq!(text(&Value::Union(Box::new(Value::List(vec![Value::Int(7)])))), "[7]");
    }

    #[test]
    fn enum_at_top_level_is_plain_text_inside_list_is_string() {
        assert_eq!(text(&Value::Enum("happy".into())), "happy");
        assert_eq!(text(&Value::List(vec![Value::Enum("happy".into())])), "[\"happy\"]");
    }

    #[test]
    fn null_stays_null_at_top_level() {
        assert_eq!(top_level_cell(&Value::Null), JsonValue::Null);
    }

    #[test]
    fn text_with_quotes_is_escaped_inside_list() {
        let v = Value::List(vec![Value::Text("a\"b\\c\n".into())]);
        assert_eq!(text(&v), "[\"a\\\"b\\\\c\\n\"]");
    }

    #[test]
    fn deep_nesting() {
        let v = Value::List(vec![Value::List(vec![Value::List(vec![Value::Int(1)])])]);
        assert_eq!(text(&v), "[[[1]]]");
    }
}
