//! Дерево файлов в панели «Схема и файлы»: список папки и открытие документов внешней программой.
//! Ошибки чтения наружу не показываются: недоступная папка даёт пустой список.

use serde::Serialize;
use std::path::Path;
use std::time::SystemTime;

/// Больше записей в одной папке не отдаём (защита от огромных каталогов).
const MAX_ENTRIES: usize = 5000;

/// Расширения, которые разрешено открывать внешней программой.
/// Список должен совпадать с EXTERNAL_EXTENSIONS в src/utils/fileTree.ts.
const OPENABLE_EXTENSIONS: &[&str] = &[
    "xlsx", "xls", "xlsb", "xlsm", "xltx", "xltm",
    "docx", "doc", "docm", "dotx", "rtf", "odt", "ods",
    "pptx", "ppt", "pptm", "odp",
    "pdf",
];

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<u64>,
}

fn to_millis(t: std::io::Result<SystemTime>) -> Option<u64> {
    t.ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

/// Содержимое папки (без сортировки: её делает интерфейс). Любая ошибка — пустой список.
pub fn read_entries(path: &str) -> Vec<DirEntryInfo> {
    let rd = match std::fs::read_dir(path) {
        Ok(rd) => rd,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    for item in rd.flatten().take(MAX_ENTRIES) {
        let name = item.file_name().to_string_lossy().into_owned();
        let full = item.path();
        // metadata() идёт по ссылкам; если не вышло (битая ссылка, нет прав) — запись всё равно показываем.
        let meta = std::fs::metadata(&full).ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        out.push(DirEntryInfo {
            name,
            path: full.to_string_lossy().into_owned(),
            is_dir,
            size: if is_dir { None } else { meta.as_ref().map(|m| m.len()) },
            modified: meta.as_ref().and_then(|m| to_millis(m.modified())),
            created: meta.as_ref().and_then(|m| to_millis(m.created())),
        });
    }
    out
}

pub fn is_openable(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| OPENABLE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    Ok(tauri::async_runtime::spawn_blocking(move || read_entries(&path))
        .await
        .unwrap_or_default())
}

/// Открывает документ программой по умолчанию. Только файлы из белого списка расширений.
#[tauri::command]
pub async fn open_path(path: String) -> Result<(), String> {
    if !is_openable(&path) || !Path::new(&path).is_file() {
        return Err("not allowed".into());
    }
    #[cfg(target_os = "windows")]
    let mut cmd = {
        // explorer открывает файл программой по умолчанию без разбора командной строки; код возврата у него не показатель.
        let mut c = std::process::Command::new("explorer");
        c.arg(&path);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&path);
        c
    };
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&path);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openable_whitelist() {
        assert!(is_openable("C:\\a\\Report.XLSX"));
        assert!(is_openable("/x/old.xls"));
        assert!(is_openable("/x/bin.xlsb"));
        assert!(!is_openable("/x/data.csv"));
        assert!(!is_openable("/x/run.exe"));
        assert!(!is_openable("/x/noext"));
    }

    #[test]
    fn reads_dir_and_survives_missing() {
        let dir = std::env::temp_dir().join(format!("qast_fstree_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.txt"), b"hello").unwrap();
        let mut got = read_entries(dir.to_str().unwrap());
        got.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].name, "a.txt");
        assert!(!got[0].is_dir);
        assert_eq!(got[0].size, Some(5));
        assert!(got[1].is_dir);
        assert_eq!(got[1].size, None);
        assert!(read_entries(dir.join("nope").to_str().unwrap()).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
