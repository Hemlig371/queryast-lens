#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use duckdb::{Connection, Result, types::{Value, ValueRef}};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use tauri::{State, Manager};
use reqwest::Client;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;

pub struct DbState(pub Arc<Mutex<Option<Connection>>>);

pub struct DuckDbCancelState {
    pub interrupt_handle: Arc<Mutex<Option<duckdb::InterruptHandle>>>,
}

pub struct ClickhouseState {
    pub cancel_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

#[derive(Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<JsonValue>>,
}

#[tauri::command]
fn connect_db(state: State<'_, DbState>, path: String) -> Result<String, String> {
    let path_buf = path.trim().to_string();

    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<Connection, String> {
        let conn = if path_buf.is_empty() {
            Connection::open_in_memory().map_err(|e| e.to_string())?
        } else {
            Connection::open(&path_buf).map_err(|e| e.to_string())?
        };
        
        // Disable Arrow StringView and ListView to prevent duckdb-rs from panicking
        // on unsupported Arrow types (introduced in DuckDB 1.0/1.1)
        let _ = conn.execute_batch("SET produce_arrow_string_view=false;");
        let _ = conn.execute_batch("SET arrow_output_list_view=false;");
        let _ = conn.execute_batch("SET arrow_output_version='1.0';");
        let _ = conn.execute_batch("SET arrow_lossless_conversion=false;");
        
        Ok(conn)
    }));

    match res {
        Ok(Ok(conn)) => {
            let mut db_guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
            *db_guard = Some(conn);
            Ok(path_buf)
        }
        Ok(Err(err_msg)) => Err(err_msg),
        Err(_) => Err("Не удалось открыть или создать файл базы данных DuckDB.".to_string()),
    }
}

#[tauri::command]
fn disconnect_db(state: State<'_, DbState>) -> Result<(), String> {
    let mut db_guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    *db_guard = None;
    Ok(())
}

#[tauri::command]
async fn execute_query(
    db_state: State<'_, DbState>,
    cancel_state: State<'_, DuckDbCancelState>,
    sql: String,
) -> Result<QueryResult, String> {
    let interrupt_handle = {
        let mut db_guard = db_state.0.lock().unwrap_or_else(|e| e.into_inner());
        let conn = db_guard
            .as_mut()
            .ok_or_else(|| "No active database connection".to_string())?;
        conn.interrupt_handle()
    };

    {
        let mut guard = cancel_state.interrupt_handle.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(interrupt_handle);
    }

    let db_arc = db_state.0.clone();
    let cancel_arc = cancel_state.interrupt_handle.clone();

    let res = tokio::task::spawn_blocking(move || {
        let mut db_guard = db_arc.lock().unwrap_or_else(|e| e.into_inner());
        let conn = db_guard
            .as_mut()
            .ok_or_else(|| "No active database connection".to_string())?;

        let panic_res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<QueryResult, String> {
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

            let mut rows_iter = stmt.query([]).map_err(|e| e.to_string())?;
            let mut rows = Vec::new();

            while let Ok(Some(row)) = rows_iter.next() {
                let mut row_vals = Vec::new();
                let mut col_idx = 0;
                loop {
                    let val_res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<JsonValue, String> {
                        let val_ref = match row.get_ref(col_idx) {
                            Ok(r) => r,
                            Err(_) => return Err("NO_MORE_COLS".to_string()),
                        };
                        let v = match val_ref {
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
                            ValueRef::Date32(_) => {
                                if let Ok(d) = row.get::<_, chrono::NaiveDate>(col_idx) {
                                    JsonValue::String(d.to_string())
                                } else if let Ok(s) = row.get::<_, String>(col_idx) {
                                    JsonValue::String(s)
                                } else {
                                    JsonValue::Null
                                }
                            }
                            ValueRef::Time64(_, _) => {
                                if let Ok(t) = row.get::<_, chrono::NaiveTime>(col_idx) {
                                    JsonValue::String(t.to_string())
                                } else if let Ok(s) = row.get::<_, String>(col_idx) {
                                    JsonValue::String(s)
                                } else {
                                    JsonValue::Null
                                }
                            }
                            ValueRef::Timestamp(_, _) => {
                                if let Ok(dt) = row.get::<_, chrono::NaiveDateTime>(col_idx) {
                                    JsonValue::String(dt.to_string())
                                } else if let Ok(dt) = row.get::<_, chrono::DateTime<chrono::Utc>>(col_idx) {
                                    JsonValue::String(dt.to_string())
                                } else if let Ok(s) = row.get::<_, String>(col_idx) {
                                    JsonValue::String(s)
                                } else {
                                    JsonValue::Null
                                }
                            }
                            ValueRef::Interval { months, days, nanos } => {
                                JsonValue::String(format!("{}m {}d {}ns", months, days, nanos))
                            }
                            _ => {
                                if let Ok(val) = row.get::<_, Value>(col_idx) {
                                    match val {
                                        Value::Null => JsonValue::Null,
                                        Value::Text(s) => JsonValue::String(s),
                                        other => {
                                            let s = format!("{:?}", other);
                                            JsonValue::String(s)
                                        }
                                    }
                                } else if let Ok(s) = row.get::<_, String>(col_idx) {
                                    JsonValue::String(s)
                                } else {
                                    JsonValue::Null
                                }
                            }
                        };
                        Ok(v)
                    }));

                    match val_res {
                        Ok(Ok(v)) => {
                            row_vals.push(v);
                            col_idx += 1;
                        }
                        Ok(Err(err_msg)) if err_msg == "NO_MORE_COLS" => {
                            break;
                        }
                        Ok(Err(e)) => {
                            row_vals.push(JsonValue::String(format!("<error: {}>", e)));
                            col_idx += 1;
                        }
                        Err(_) => {
                            row_vals.push(JsonValue::String("<Unsupported Type>".to_string()));
                            col_idx += 1;
                        }
                    }
                }
                rows.push(row_vals);
            }

            drop(rows_iter);

            let column_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();

            Ok(QueryResult {
                columns: column_names,
                rows,
            })
        }));

        match panic_res {
            Ok(r) => r,
            Err(e) => {
                let msg = if let Some(s) = e.downcast_ref::<&str>() {
                    s.to_string()
                } else if let Some(s) = e.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "Unknown panic payload".to_string()
                };
                Err(format!("Критический сбой: {}", msg))
            }
        }
    }).await;

    {
        let mut guard = cancel_arc.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
    }

    match res {
        Ok(query_res) => query_res,
        Err(e) => Err(format!("Ошибка выполнения запроса: {}", e)),
    }
}

#[tauri::command]
fn cancel_duckdb_query(state: State<'_, DuckDbCancelState>) -> Result<(), String> {
    let mut guard = state.interrupt_handle.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(handle) = guard.take() {
        handle.interrupt();
    }
    Ok(())
}

#[tauri::command]
fn cancel_query(state: State<'_, DuckDbCancelState>) -> Result<(), String> {
    cancel_duckdb_query(state)
}

#[derive(Serialize)]
pub struct ClickhouseCopyResult {
    pub success: bool,
    pub message: String,
    pub bytes: u64,
}

#[tauri::command]
async fn clickhouse_copy_to(
    state: State<'_, ClickhouseState>,
    url: String,
    method: String,
    headers: std::collections::HashMap<String, String>,
    body: String,
    file_path: String,
) -> Result<ClickhouseCopyResult, String> {
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut guard = state.cancel_tx.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(cancel_tx);
    }

    let client = Client::builder()
        // we might not need to configure certs, but in case let's just let defaults apply
        .build()
        .map_err(|e| e.to_string())?;

    let req_method = if method.to_uppercase() == "POST" { reqwest::Method::POST } else { reqwest::Method::GET };
    let mut req = client.request(req_method, &url);
    
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let req = req.body(body);

    let res = req.send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(text);
    }

    let mut file = File::create(&file_path).await.map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut bytes_written: u64 = 0;

    while let Some(chunk_res) = tokio::select! {
        chunk_opt = stream.next() => chunk_opt,
        _ = &mut cancel_rx => {
            drop(file);
            let _ = tokio::fs::remove_file(&file_path).await;
            return Err("Запрос отменен пользователем".to_string());
        }
    } {
        let chunk = chunk_res.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        bytes_written += chunk.len() as u64;
    }

    Ok(ClickhouseCopyResult {
        success: true,
        message: format!("Файл успешно сохранен: {}", file_path),
        bytes: bytes_written,
    })
}

#[tauri::command]
async fn clickhouse_copy_from(
    state: State<'_, ClickhouseState>,
    url: String,
    method: String,
    headers: std::collections::HashMap<String, String>,
    file_path: String,
) -> Result<ClickhouseCopyResult, String> {
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut guard = state.cancel_tx.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(cancel_tx);
    }

    let client = Client::builder().build().map_err(|e| e.to_string())?;

    let file = File::open(&file_path).await.map_err(|e| e.to_string())?;
    let file_size = file.metadata().await.map_err(|e| e.to_string())?.len();

    let stream = tokio_util::codec::FramedRead::new(file, tokio_util::codec::BytesCodec::new());
    let stream = stream.map(|res| res.map(|b| b.freeze()));

    let req_method = if method.to_uppercase() == "POST" { reqwest::Method::POST } else { reqwest::Method::GET };
    let mut req = client.request(req_method, &url);
    
    for (k, v) in headers {
        req = req.header(k, v);
    }
    
    let req = req.body(reqwest::Body::wrap_stream(stream));
    
    let send_fut = req.send();
    tokio::pin!(send_fut);
    
    let res = tokio::select! {
        res_val = &mut send_fut => res_val,
        _ = &mut cancel_rx => {
            return Err("Запрос отменен пользователем".to_string());
        }
    };

    let res = res.map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(text);
    }

    Ok(ClickhouseCopyResult {
        success: true,
        message: format!("Данные из файла {} успешно загружены в Clickhouse", file_path),
        bytes: file_size,
    })
}

#[derive(Serialize)]
pub struct ClickhouseQueryResponse {
    pub success: bool,
    pub text: Option<String>,
}

#[tauri::command]
async fn execute_clickhouse_query_rust(
    state: State<'_, ClickhouseState>,
    url: String,
    method: String,
    headers: std::collections::HashMap<String, String>,
    body: String,
) -> Result<ClickhouseQueryResponse, String> {
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut guard = state.cancel_tx.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(cancel_tx);
    }

    let client = Client::builder().build().map_err(|e| e.to_string())?;
    let req_method = if method.to_uppercase() == "POST" { reqwest::Method::POST } else { reqwest::Method::GET };
    
    let mut req = client.request(req_method, &url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let req = req.body(body);
    
    let send_fut = req.send();
    tokio::pin!(send_fut);
    
    let res = tokio::select! {
        res_val = &mut send_fut => res_val,
        _ = &mut cancel_rx => {
            return Err("Запрос отменен пользователем".to_string());
        }
    };

    let res = res.map_err(|e| e.to_string())?;
    let status = res.status();
    
    let mut stream = res.bytes_stream();
    let mut body_bytes = Vec::new();
    
    loop {
        tokio::select! {
            chunk_opt = stream.next() => {
                match chunk_opt {
                    Some(Ok(chunk)) => body_bytes.extend_from_slice(&chunk),
                    Some(Err(e)) => return Err(e.to_string()),
                    None => break,
                }
            }
            _ = &mut cancel_rx => {
                return Err("Запрос отменен пользователем".to_string());
            }
        }
    }
    
    let text = String::from_utf8_lossy(&body_bytes).to_string();
    
    if !status.is_success() {
        return Err(text);
    }
    
    Ok(ClickhouseQueryResponse {
        success: true,
        text: Some(text),
    })
}

#[tauri::command]
fn cancel_clickhouse_query(state: State<'_, ClickhouseState>) -> Result<(), String> {
    let mut guard = state.cancel_tx.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}

fn convert_arrow_batches_to_query_result(batches: &[arrow::record_batch::RecordBatch]) -> Result<QueryResult, String> {
    if batches.is_empty() {
        return Ok(QueryResult {
            columns: Vec::new(),
            rows: Vec::new(),
        });
    }

    let schema = batches[0].schema();
    let columns: Vec<String> = schema.fields().iter().map(|f| f.name().clone()).collect();
    let mut rows = Vec::new();

    for batch in batches {
        let num_rows = batch.num_rows();
        let num_cols = batch.num_columns();
        for r in 0..num_rows {
            let mut row_vals = Vec::with_capacity(num_cols);
            for c in 0..num_cols {
                let col = batch.column(c);
                let json_val = if col.is_null(r) {
                    JsonValue::Null
                } else {
                    use arrow::array::*;
                    if let Some(arr) = col.as_any().downcast_ref::<Int64Array>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<Int32Array>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<Int16Array>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<Int8Array>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<UInt64Array>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<UInt32Array>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<Float64Array>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<Float32Array>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<StringArray>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<LargeStringArray>() {
                        json!(arr.value(r))
                    } else if let Some(arr) = col.as_any().downcast_ref::<BooleanArray>() {
                        json!(arr.value(r))
                    } else {
                        let formatter = arrow::util::display::ArrayFormatter::try_new(col.as_ref(), &arrow::util::display::FormatOptions::default());
                        if let Ok(fmt) = formatter {
                            json!(fmt.value(r).to_string())
                        } else {
                            json!(format!("{:?}", col))
                        }
                    }
                };
                row_vals.push(json_val);
            }
            rows.push(row_vals);
        }
    }

    Ok(QueryResult { columns, rows })
}

#[tauri::command]
async fn query_connectorx_preview(
    conn_str: String,
    query: String,
) -> Result<QueryResult, String> {
    tokio::task::spawn_blocking(move || {
        let source_conn = connectorx::source_router::SourceConn::try_from(conn_str.as_str())
            .map_err(|e| format!("Ошибка строки подключения ConnectorX: {}", e))?;

        let queries = vec![connectorx::prelude::CXQuery::from(query.as_str())];
        let mut destination = connectorx::destinations::arrow::ArrowDestination::new();

        let dispatcher = connectorx::dispatcher::Dispatcher::<_, _, connectorx::destinations::arrow::ArrowDestination>::new(
            source_conn,
            &mut destination,
            queries,
            None,
        );

        dispatcher.run().map_err(|e| format!("Ошибка выполнения запроса ConnectorX: {}", e))?;

        let batches = destination.finish().map_err(|e| format!("Ошибка получения результата Arrow: {}", e))?;

        convert_arrow_batches_to_query_result(&batches)
    }).await.map_err(|e| format!("Ошибка потока выполнения: {}", e))?
}

#[derive(Serialize)]
pub struct ConnectorxCopyResult {
    pub success: bool,
    pub message: String,
    pub bytes: u64,
}

#[tauri::command]
async fn connectorx_copy_to(
    conn_str: String,
    query: String,
    file_path: String,
) -> Result<ConnectorxCopyResult, String> {
    tokio::task::spawn_blocking(move || {
        let source_conn = connectorx::source_router::SourceConn::try_from(conn_str.as_str())
            .map_err(|e| format!("Ошибка строки подключения ConnectorX: {}", e))?;

        let queries = vec![connectorx::prelude::CXQuery::from(query.as_str())];
        let mut destination = connectorx::destinations::arrow::ArrowDestination::new();

        let dispatcher = connectorx::dispatcher::Dispatcher::<_, _, connectorx::destinations::arrow::ArrowDestination>::new(
            source_conn,
            &mut destination,
            queries,
            None,
        );

        dispatcher.run().map_err(|e| format!("Ошибка выполнения запроса ConnectorX: {}", e))?;

        let batches = destination.finish().map_err(|e| format!("Ошибка формирования пакетов Arrow: {}", e))?;

        if batches.is_empty() {
            return Err("Запрос ConnectorX не вернул данных для экспорта в Parquet".to_string());
        }

        let schema = batches[0].schema();
        let file = std::fs::File::create(&file_path)
            .map_err(|e| format!("Не удалось создать файл {}: {}", file_path, e))?;

        let mut writer = parquet::arrow::ArrowWriter::try_new(file, schema, None)
            .map_err(|e| format!("Ошибка создания ParquetWriter: {}", e))?;

        for batch in &batches {
            writer.write(batch).map_err(|e| format!("Ошибка записи пакета в Parquet: {}", e))?;
        }

        writer.close().map_err(|e| format!("Ошибка закрытия Parquet файла: {}", e))?;

        let metadata = std::fs::metadata(&file_path)
            .map_err(|e| format!("Ошибка получения сведений о файле: {}", e))?;

        Ok(ConnectorxCopyResult {
            success: true,
            message: format!("Файл Parquet успешно создан: {}", file_path),
            bytes: metadata.len(),
        })
    }).await.map_err(|e| format!("Ошибка потока выполнения: {}", e))?
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        if let Some(window) = app.get_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }))
    .manage(DbState(Arc::new(Mutex::new(None))))
    .manage(DuckDbCancelState {
        interrupt_handle: Arc::new(Mutex::new(None)),
    })
    .manage(ClickhouseState { cancel_tx: Mutex::new(None) })
    .invoke_handler(tauri::generate_handler![
      connect_db,
      disconnect_db,
      execute_query,
      cancel_duckdb_query,
      cancel_query,
      clickhouse_copy_to,
      clickhouse_copy_from,
      execute_clickhouse_query_rust,
      cancel_clickhouse_query,
      query_connectorx_preview,
      connectorx_copy_to
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
