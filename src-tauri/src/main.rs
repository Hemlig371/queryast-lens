#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::sync::Mutex;
use duckdb::{Config, AccessMode, Connection, Result, types::ValueRef};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use tauri::State;

pub struct DbState(pub Mutex<Option<Connection>>);

#[derive(Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<JsonValue>>,
}

#[tauri::command]
fn connect_db(state: State<'_, DbState>, path: String) -> Result<String, String> {
    let path_buf = path.trim().to_string();

    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if path_buf.is_empty() {
            Connection::open_in_memory().map_err(|e| e.to_string())
        } else {
            Connection::open(&path_buf).map_err(|e| e.to_string())
        }
    }));

    match res {
        Ok(Ok(conn)) => {
            let mut db_guard = state.0.lock().map_err(|e| e.to_string())?;
            *db_guard = Some(conn);
            Ok(path_buf)
        }
        Ok(Err(err_msg)) => Err(err_msg),
        Err(_) => Err("Не удалось открыть или создать файл базы данных DuckDB.".to_string()),
    }
}

#[tauri::command]
fn disconnect_db(state: State<'_, DbState>) -> Result<(), String> {
    let mut db_guard = state.0.lock().map_err(|e| e.to_string())?;
    *db_guard = None;
    Ok(())
}

#[tauri::command]
fn execute_query(state: State<'_, DbState>, sql: String) -> Result<QueryResult, String> {
    let mut db_guard = state.0.lock().map_err(|e| e.to_string())?;
    let conn = db_guard
        .as_mut()
        .ok_or_else(|| "No active database connection".to_string())?;

    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<QueryResult, String> {
        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(e) => {
                // Fallback for multi-statement scripts (e.g., CREATE ...; COPY ...)
                match conn.execute_batch(&sql) {
                    Ok(_) => {
                        return Ok(QueryResult {
                            columns: Vec::new(),
                            rows: Vec::new(),
                        });
                    }
                    Err(_) => return Err(e.to_string()),
                }
            }
        };
        let column_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();

        let mut rows_iter = stmt.query([]).map_err(|e| e.to_string())?;
        let mut rows = Vec::new();

        while let Ok(Some(row)) = rows_iter.next() {
            let mut row_vals = Vec::with_capacity(column_names.len());
            for i in 0..column_names.len() {
                let val_ref = row.get_ref(i).map_err(|e| e.to_string())?;
                let val = match val_ref {
                    ValueRef::Null => JsonValue::Null,
                    ValueRef::Boolean(b) => JsonValue::Bool(b),
                    ValueRef::TinyInt(n) => json!(n),
                    ValueRef::SmallInt(n) => json!(n),
                    ValueRef::Int(n) => json!(n),
                    ValueRef::BigInt(n) => json!(n.to_string()),
                    ValueRef::HugeInt(n) => json!(n.to_string()),
                    ValueRef::UTinyInt(n) => json!(n),
                    ValueRef::USmallInt(n) => json!(n),
                    ValueRef::UInt(n) => json!(n),
                    ValueRef::UBigInt(n) => json!(n.to_string()),
                    ValueRef::Float(n) => json!(n),
                    ValueRef::Double(n) => json!(n),
                    ValueRef::Decimal(n) => json!(n.to_string()),
                    ValueRef::Text(t) => {
                        let s = String::from_utf8_lossy(t).to_string();
                        JsonValue::String(s)
                    }
                    ValueRef::Blob(b) => JsonValue::String(format!("<blob {} bytes>", b.len())),
                    ValueRef::Date32(_)
                    | ValueRef::Time64(_, _)
                    | ValueRef::Timestamp(_, _)
                    | ValueRef::Interval { .. } => {
                        let s: Result<String, _> = row.get(i);
                        s.map(JsonValue::String).unwrap_or_else(|_| JsonValue::Null)
                    }
                    _ => {
                        let s: Result<String, _> = row.get(i);
                        s.map(JsonValue::String).unwrap_or_else(|_| JsonValue::Null)
                    }
                };
                row_vals.push(val);
            }
            rows.push(row_vals);
        }

        Ok(QueryResult {
            columns: column_names,
            rows,
        })
    }));

    match res {
        Ok(r) => r,
        Err(_) => Err("Критический сбой выполнения SQL-запроса в движке DuckDB.".to_string()),
    }
}

fn main() {
  tauri::Builder::default()
    .manage(DbState(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![
      connect_db,
      disconnect_db,
      execute_query
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
