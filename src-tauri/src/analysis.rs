//! Perspective IPC transport over the editor's existing connection.
use crate::{sqlscript, DbState};
use arrow_ipc::writer::StreamWriter;
use duckdb::Connection;
use tauri::State;

const MAX_IPC_BYTES: usize = 32 * 1024 * 1024;
const MAX_ARROW_ROWS: usize = 100_000;

// The same function is exercised by native CI, including DDL and typed IPC.
fn query_arrow_ipc(conn: &Connection, sql: &str) -> Result<Vec<u8>, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let statements = sqlscript::split_statements(sql);
        let (last, head) = statements.split_last().ok_or("Empty analysis query")?;
        for statement in head {
            conn.execute_batch(statement).map_err(|e| e.to_string())?;
        }
        let mut stmt = conn.prepare(last).map_err(|e| e.to_string())?;
        let mut batches = stmt.query_arrow([]).map_err(|e| e.to_string())?;
        let schema = batches.get_schema();
        let mut bytes = Vec::new();
        {
            let mut writer = StreamWriter::try_new(&mut bytes, &schema).map_err(|e| e.to_string())?;
            let mut rows = 0;
            let mut estimated_bytes = 0;
            for batch in &mut batches {
                rows += batch.num_rows();
                estimated_bytes += batch.get_array_memory_size();
                if rows > MAX_ARROW_ROWS || estimated_bytes > MAX_IPC_BYTES {
                    return Err("Analysis response exceeds 100,000 rows or 32 MiB. Filter or group the view before exporting.".to_string());
                }
                writer.write(&batch).map_err(|e| e.to_string())?;
            }
            writer.finish().map_err(|e| e.to_string())?;
        }
        if bytes.len() > MAX_IPC_BYTES {
            return Err("Analysis Arrow response exceeds 32 MiB".to_string());
        }
        Ok(bytes)
    }))
    .unwrap_or_else(|_| Err("DuckDB Arrow conversion failed".to_string()))
}

#[tauri::command]
pub async fn analysis_query_arrow(state: State<'_, DbState>, sql: String) -> Result<Vec<u8>, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || {
        let guard = db.lock().map_err(|_| "Database mutex poisoned".to_string())?;
        let conn = guard.as_ref().ok_or("No active database connection")?;
        query_arrow_ipc(conn, &sql)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow_ipc::reader::StreamReader;
    use std::io::Cursor;

    fn connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // Match the existing connect_db compatibility settings; transport changes none.
        for sql in ["SET produce_arrow_string_view=false", "SET arrow_output_list_view=false",
                    "SET arrow_output_version='1.0'", "SET arrow_lossless_conversion=false"] {
            let _ = conn.execute_batch(sql);
        }
        conn
    }

    #[test]
    fn typed_ipc_is_readable_and_shared_source_survives() {
        let conn = connection();
        conn.execute_batch("CREATE TABLE source AS SELECT 42::INTEGER AS id, 'Москва' AS label,\
            DATE '2025-01-02' AS day, TIMESTAMP '2025-01-02 03:04:05' AS stamp,\
            9007199254740993::BIGINT AS big, 12345.67::DECIMAL(18,2) AS amount,\
            NULL::INTEGER AS missing, true AS flag").unwrap();
        let bytes = query_arrow_ipc(&conn, "SELECT * FROM source").unwrap();
        let mut reader = StreamReader::try_new(Cursor::new(&bytes), None).unwrap();
        let batch = reader.next().unwrap().unwrap();
        assert_eq!(batch.num_rows(), 1);
        assert_eq!(batch.num_columns(), 8);
        assert_eq!(batch.column(6).null_count(), 1);
        assert!(reader.next().is_none());
        assert_eq!(conn.query_row("SELECT count(*) FROM source", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
        // CI also decodes these actual Rust bytes using Lens's JS Arrow dependency.
        if let Ok(folder) = std::env::var("LENS_ARROW_FIXTURE_DIR") {
            std::fs::create_dir_all(&folder).unwrap();
            std::fs::write(std::path::Path::new(&folder).join("native.arrow"), &bytes).unwrap();
        }
    }

    #[test]
    fn ddl_multi_statement_empty_results_and_errors() {
        let conn = connection();
        query_arrow_ipc(&conn, "CREATE TEMP TABLE analysis_test_result AS SELECT 2 AS value").unwrap();
        let bytes = query_arrow_ipc(&conn, "UPDATE analysis_test_result SET value=3; SELECT * FROM analysis_test_result WHERE false").unwrap();
        let mut reader = StreamReader::try_new(Cursor::new(bytes), None).unwrap();
        assert_eq!(reader.schema().fields().len(), 1);
        assert_eq!(reader.by_ref().map(|batch| batch.unwrap().num_rows()).sum::<usize>(), 0);
        assert_eq!(conn.query_row("SELECT value FROM analysis_test_result", [], |r| r.get::<_, i32>(0)).unwrap(), 3);
        assert!(query_arrow_ipc(&conn, "SELECT * FROM missing_source").is_err());
        assert!(query_arrow_ipc(&conn, "-- no query").is_err());
        query_arrow_ipc(&conn, "DROP TABLE analysis_test_result").unwrap();
    }

    #[test]
    fn response_limits_do_not_truncate_or_break_the_connection() {
        let conn = connection();
        assert!(query_arrow_ipc(&conn, "SELECT i FROM range(100001) t(i)").unwrap_err().contains("100,000"));
        assert!(query_arrow_ipc(&conn, "SELECT repeat('x', 34000000) AS large").unwrap_err().contains("32 MiB"));
        assert!(query_arrow_ipc(&conn, "SELECT 1 AS still_usable").is_ok());
    }
    #[test]
    fn replay_sdk_sql_in_the_editor_connection() {
        let Ok(folder) = std::env::var("LENS_ARROW_FIXTURE_DIR") else { return; };
        let conn = connection();
        conn.execute_batch("CREATE TABLE demo AS SELECT i::INTEGER AS id, \
            ['Москва','Казань','Санкт-Петербург','Новосибирск'][1+i%4] AS region, \
            ['Hardware','Software','Services'][1+i%3] AS category, \
            DATE '2025-01-01'+(i%365)::INTEGER AS day, \
            ((i%10000)/100.0)::DOUBLE AS revenue, (1+i%8)::INTEGER AS quantity \
            FROM range(12000) t(i)").unwrap();
        let path = std::path::Path::new(&folder);
        let cases: serde_json::Value = serde_json::from_slice(&std::fs::read(path.join("cases.json")).unwrap()).unwrap();
        for case in cases.as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let sql = std::fs::read_to_string(path.join(format!("{name}.sql"))).unwrap();
            // Match execute_query's normal editor path: prepare the whole copied script.
            {
                let mut stmt = conn.prepare(&sql).unwrap();
                let rows: usize = stmt.query_arrow([]).unwrap().map(|batch| batch.num_rows()).sum();
                assert_eq!(rows, case["rows"].as_u64().unwrap() as usize, "editor replay {name}");
            }
            // Repeated execution must work in the same connection, without duplicate objects.
            query_arrow_ipc(&conn, &sql).unwrap();
            let bytes = query_arrow_ipc(&conn, &sql).unwrap();
            let reader = StreamReader::try_new(Cursor::new(&bytes), None).unwrap();
            let rows: usize = reader.map(|batch| batch.unwrap().num_rows()).sum();
            assert_eq!(rows, case["rows"].as_u64().unwrap() as usize, "{name}");
            std::fs::write(path.join(format!("{name}.native.arrow")), bytes).unwrap();
        }
    }

}

