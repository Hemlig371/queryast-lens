//! Дерево файлов в панели «Схема и файлы»: список папки, открытие документов внешней программой
//! и действия контекстного меню (показать в проводнике, «Открыть с помощью», переименовать, в корзину).
//! Ошибки чтения наружу не показываются: недоступная папка даёт пустой список.

use serde::Serialize;
use std::path::{Path, PathBuf};
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

/// Единый вид разделителей в пути для показа и дальнейших вызовов. На Windows `Path::join` к корню `./`
/// добавляет `\`, и получалось `./папка\файл`; здесь все `/` заменяются на `\`. На других ОС путь не меняется.
fn normalize_separators(path: String, windows: bool) -> String {
    if windows {
        path.replace('/', "\\")
    } else {
        path
    }
}

fn path_to_string(p: &Path) -> String {
    normalize_separators(p.to_string_lossy().into_owned(), cfg!(windows))
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
            path: path_to_string(&full),
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

/// Абсолютный путь без обращения к ФС: относительный считается от рабочей папки, `.` в середине убирается,
/// разделители приводятся к родному виду ОС. Ссылки не разворачиваются (в корзину уходит сама ссылка).
fn to_absolute(p: &str) -> PathBuf {
    let pb = Path::new(p);
    let abs = if pb.is_absolute() {
        pb.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|c| c.join(pb))
            .unwrap_or_else(|_| pb.to_path_buf())
    };
    abs.components().collect()
}

/// Проверка нового имени: непустое, без разделителей пути, не `.`/`..`; на Windows — без запрещённых символов
/// и без точки в конце. Тот же набор правил в `validateNewName` (src/utils/fileTree.ts).
fn validate_new_name(name: &str, windows: bool) -> Result<(), &'static str> {
    if name.is_empty() {
        return Err("empty");
    }
    if name == "." || name == ".." || name.chars().any(|c| c == '/' || c == '\\' || c == '\0') {
        return Err("invalid");
    }
    if windows
        && (name.chars().any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') || (c as u32) < 32)
            || name.ends_with('.'))
    {
        return Err("invalid");
    }
    Ok(())
}

/// Переименование в пределах той же папки. Существующий файл не перезаписывается (кроме смены регистра
/// на Windows/macOS, где такая запись — тот же файл). Возвращает новый путь.
pub fn rename_entry(path: &str, new_name: &str) -> Result<String, String> {
    let new_name = new_name.trim();
    validate_new_name(new_name, cfg!(windows)).map_err(|e| e.to_string())?;
    let from = Path::new(path);
    if from.symlink_metadata().is_err() {
        return Err("not_found".into());
    }
    let parent = from.parent().ok_or_else(|| "invalid".to_string())?;
    let to = parent.join(new_name);
    if to == from {
        return Ok(path_to_string(&to));
    }
    if to.symlink_metadata().is_ok() {
        let case_only = from
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase() == new_name.to_lowercase())
            .unwrap_or(false);
        if !(case_only && cfg!(any(windows, target_os = "macos"))) {
            return Err("exists".into());
        }
    }
    std::fs::rename(from, &to).map_err(|_| "failed".to_string())?;
    Ok(path_to_string(&to))
}

#[tauri::command]
pub async fn rename_path(path: String, new_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || rename_entry(&path, &new_name))
        .await
        .map_err(|_| "failed".to_string())?
}

/// Перемещение файла или папки в другую папку того же диска (без копирования: `std::fs::rename`).
/// Ошибки: `not_found` (нет источника или целевой папки), `invalid` (цель — сама папка или её потомок),
/// `exists` (в цели уже есть запись с таким именем; ничего не перезаписывается), `failed` (в т. ч. другой диск).
/// Если цель совпадает с текущей папкой — ничего не делает и возвращает прежний путь.
pub fn move_entry(path: &str, target_dir: &str) -> Result<String, String> {
    let from = Path::new(path);
    if from.symlink_metadata().is_err() {
        return Err("not_found".into());
    }
    let name = from.file_name().ok_or_else(|| "invalid".to_string())?.to_owned();
    let target = Path::new(target_dir);
    if !target.is_dir() {
        return Err("not_found".into());
    }
    // Сравнение — по каноническим путям (регистр и ссылки на родителя не обманут проверку «внутрь себя»).
    let abs_from = to_absolute(path);
    let canon_parent = abs_from
        .parent()
        .ok_or_else(|| "invalid".to_string())?
        .canonicalize()
        .map_err(|_| "failed".to_string())?;
    let canon_from = canon_parent.join(&name);
    let canon_target = to_absolute(target_dir)
        .canonicalize()
        .map_err(|_| "failed".to_string())?;
    if canon_target.starts_with(&canon_from) {
        return Err("invalid".into());
    }
    if canon_target == canon_parent {
        return Ok(path_to_string(from));
    }
    let dest = target.join(&name);
    if dest.symlink_metadata().is_ok() {
        return Err("exists".into());
    }
    std::fs::rename(from, &dest).map_err(|_| "failed".to_string())?;
    Ok(path_to_string(&dest))
}

#[tauri::command]
pub async fn move_path(path: String, target_dir: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || move_entry(&path, &target_dir))
        .await
        .map_err(|_| "failed".to_string())?
}

/// Перемещает файл или папку в корзину ОС (не удаляет насовсем).
#[tauri::command]
pub async fn trash_path(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let abs = to_absolute(&path);
        if abs.symlink_metadata().is_err() {
            return Err("not_found".to_string());
        }
        trash::delete(&abs).map_err(|_| "failed".to_string())
    })
    .await
    .map_err(|_| "failed".to_string())?
}

/// Показывает запись в проводнике: Windows — Explorer с выделением, macOS — Finder (`open -R`),
/// Linux — открывает папку, в которой лежит запись.
#[tauri::command]
pub async fn reveal_path(path: String) -> Result<(), String> {
    let abs = to_absolute(&path);
    if abs.symlink_metadata().is_err() {
        return Err("not_found".into());
    }
    #[cfg(target_os = "windows")]
    let res = {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("explorer");
        // Путь в кавычках передаём как есть: Explorer не разбирает аргумент, который Rust заключил бы в кавычки целиком.
        c.raw_arg(format!("/select,\"{}\"", abs.display()));
        c.spawn()
    };
    #[cfg(target_os = "macos")]
    let res = std::process::Command::new("open").arg("-R").arg(&abs).spawn();
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let res = {
        let dir = abs.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| abs.clone());
        std::process::Command::new("xdg-open").arg(dir).spawn()
    };
    res.map(|_| ()).map_err(|_| "failed".to_string())
}

/// Системный выбор программы для файла: Windows — «Как вы хотите открыть этот файл?», macOS — выбор приложения.
/// Linux: общего диалога нет, интерфейс пункт не показывает.
#[tauri::command]
pub async fn open_with(path: String) -> Result<(), String> {
    let abs = to_absolute(&path);
    if !abs.is_file() {
        return Err("not_found".into());
    }
    #[cfg(target_os = "windows")]
    let res = std::process::Command::new("rundll32.exe")
        .arg("shell32.dll,OpenAs_RunDLL")
        .arg(&abs)
        .spawn();
    #[cfg(target_os = "macos")]
    let res = {
        let mut c = std::process::Command::new("osascript");
        for line in [
            "on run argv",
            "set appPath to POSIX path of (choose file with prompt \"Open with\" of type {\"com.apple.application-bundle\"} default location (POSIX file \"/Applications\" as alias))",
            "do shell script \"open -a \" & quoted form of appPath & \" \" & quoted form of (item 1 of argv)",
            "end run",
        ] {
            c.arg("-e").arg(line);
        }
        c.arg(&abs).spawn()
    };
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let res: std::io::Result<std::process::Child> = Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "not supported",
    ));
    res.map(|_| ()).map_err(|_| "failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separators_are_unified_on_windows_only() {
        assert_eq!(normalize_separators("./folder\\file".into(), true), ".\\folder\\file");
        assert_eq!(normalize_separators("C:/a/b".into(), true), "C:\\a\\b");
        assert_eq!(normalize_separators("./folder/file".into(), false), "./folder/file");
    }

    #[test]
    fn new_name_validation() {
        assert_eq!(validate_new_name("", false), Err("empty"));
        assert_eq!(validate_new_name("..", false), Err("invalid"));
        assert_eq!(validate_new_name("a/b", false), Err("invalid"));
        assert_eq!(validate_new_name("a\\b", false), Err("invalid"));
        assert_eq!(validate_new_name("a:b", false), Ok(()));
        assert_eq!(validate_new_name("a:b", true), Err("invalid"));
        assert_eq!(validate_new_name("a.", true), Err("invalid"));
        assert_eq!(validate_new_name("a.", false), Ok(()));
        assert_eq!(validate_new_name("отчёт 1.sql", true), Ok(()));
    }

    #[test]
    fn rename_keeps_existing_files() {
        let dir = std::env::temp_dir().join(format!("qast_rename_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), b"a").unwrap();
        std::fs::write(dir.join("b.txt"), b"b").unwrap();
        let a = dir.join("a.txt");
        let a = a.to_str().unwrap();
        assert_eq!(rename_entry(a, "b.txt"), Err("exists".to_string()));
        assert_eq!(std::fs::read(dir.join("b.txt")).unwrap(), b"b");
        assert_eq!(rename_entry(a, "x/y"), Err("invalid".to_string()));
        assert_eq!(rename_entry(a, "a.txt").map(|_| ()), Ok(()));
        let new_path = rename_entry(a, "c.txt").unwrap();
        assert!(new_path.ends_with("c.txt"));
        assert!(!dir.join("a.txt").exists());
        assert!(dir.join("c.txt").exists());
        assert_eq!(
            rename_entry(dir.join("nope.txt").to_str().unwrap(), "z.txt"),
            Err("not_found".to_string())
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_entry_rules() {
        let dir = std::env::temp_dir().join(format!("qast_move_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("a/inner")).unwrap();
        std::fs::create_dir_all(dir.join("b")).unwrap();
        std::fs::write(dir.join("a/f.txt"), b"f").unwrap();
        std::fs::write(dir.join("b/f.txt"), b"other").unwrap();
        std::fs::write(dir.join("a/g.txt"), b"g").unwrap();
        let s = |p: &std::path::PathBuf| p.to_str().unwrap().to_string();

        // имя занято: ничего не перезаписывается
        assert_eq!(move_entry(&s(&dir.join("a/f.txt")), &s(&dir.join("b"))), Err("exists".to_string()));
        assert_eq!(std::fs::read(dir.join("b/f.txt")).unwrap(), b"other");
        assert!(dir.join("a/f.txt").exists());
        // в ту же папку — без изменений
        let same = move_entry(&s(&dir.join("a/f.txt")), &s(&dir.join("a"))).unwrap();
        assert!(same.ends_with("f.txt"));
        assert!(dir.join("a/f.txt").exists());
        // обычный перенос файла
        let moved = move_entry(&s(&dir.join("a/g.txt")), &s(&dir.join("b"))).unwrap();
        assert!(moved.ends_with("g.txt"));
        assert!(!dir.join("a/g.txt").exists());
        assert_eq!(std::fs::read(dir.join("b/g.txt")).unwrap(), b"g");
        // папку нельзя переместить в себя и в своего потомка (в том числе через «..»)
        assert_eq!(move_entry(&s(&dir.join("a")), &s(&dir.join("a"))), Err("invalid".to_string()));
        assert_eq!(move_entry(&s(&dir.join("a")), &s(&dir.join("a/inner"))), Err("invalid".to_string()));
        let tricky = format!("{}/a/inner/..", dir.to_str().unwrap());
        assert_eq!(move_entry(&s(&dir.join("a")), &tricky), Err("invalid".to_string()));
        assert!(dir.join("a/inner").exists());
        // перенос папки целиком
        let moved_dir = move_entry(&s(&dir.join("a/inner")), &s(&dir.join("b"))).unwrap();
        assert!(moved_dir.ends_with("inner"));
        assert!(dir.join("b/inner").is_dir());
        // нет источника / нет целевой папки / цель — файл
        assert_eq!(move_entry(&s(&dir.join("nope")), &s(&dir.join("b"))), Err("not_found".to_string()));
        assert_eq!(move_entry(&s(&dir.join("a/f.txt")), &s(&dir.join("nope"))), Err("not_found".to_string()));
        assert_eq!(move_entry(&s(&dir.join("a/f.txt")), &s(&dir.join("b/f.txt"))), Err("not_found".to_string()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn absolute_path_drops_dot_segments() {
        let p = to_absolute("./x/./y");
        assert!(p.is_absolute());
        assert!(!p.components().any(|c| matches!(c, std::path::Component::CurDir)));
        assert!(p.ends_with("x/y") || p.ends_with("x\\y"));
    }

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
