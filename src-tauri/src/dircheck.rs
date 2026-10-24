//! Проверка относительных папок DuckDB (`./tmp`, `./extensions`) перед PRAGMA.
//! В AppImage рабочая папка лежит внутри read-only образа: `PRAGMA temp_directory = './tmp'` проходит, а первый же запрос
//! со сбросом на диск падает с «IO Error: Cannot open file "./tmp/duckdb_temp_storage…": Read-only file system».
//! Только стандартная библиотека: модуль проверяется отдельно от остальных крейтов (`rustc --test src/dircheck.rs`).

use std::path::{Path, PathBuf};

/// Путь относительный и обычный: не `~/…`, не URL (`s3://…`), не абсолютный. Абсолютные пути пользователя не проверяются.
pub fn is_plain_relative(dir: &str) -> bool {
    let d = dir.trim();
    !d.is_empty() && !d.starts_with('~') && !d.contains("://") && Path::new(d).is_relative()
}

/// Ближайшая существующая папка на пути `path` (для `./tmp/a/b` — `./tmp`, если она есть, иначе `.`).
fn nearest_existing_dir(path: &Path) -> PathBuf {
    for ancestor in path.ancestors() {
        let candidate = if ancestor.as_os_str().is_empty() { Path::new(".") } else { ancestor };
        if candidate.is_dir() {
            return candidate.to_path_buf();
        }
    }
    PathBuf::from(".")
}

/// В папку можно записать файл.
fn can_write_in(dir: &Path) -> bool {
    let probe = dir.join(format!(".queryast_write_probe_{}", std::process::id()));
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// DuckDB сможет работать в этой папке: она есть и доступна на запись либо её можно создать в ближайшей существующей папке.
/// Ничего не создаёт: папки `./tmp` и `./extensions` DuckDB создаёт сам, когда они нужны.
pub fn dir_is_usable(dir: &str) -> bool {
    can_write_in(&nearest_existing_dir(Path::new(dir.trim())))
}

/// Папка для временных файлов DuckDB, если относительная недоступна: каталог в системной временной папке.
pub fn fallback_temp_dir() -> String {
    std::env::temp_dir().join("queryast-lens-duckdb-tmp").to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("dircheck_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn relative_paths_are_recognized() {
        assert!(is_plain_relative("./tmp"));
        assert!(is_plain_relative("tmp"));
        assert!(is_plain_relative("./extensions"));
        assert!(is_plain_relative("../x/y"));
        assert!(!is_plain_relative(""));
        assert!(!is_plain_relative("   "));
        assert!(!is_plain_relative("~/duck"));
        assert!(!is_plain_relative("s3://bucket/tmp"));
        #[cfg(unix)]
        assert!(!is_plain_relative("/var/tmp/duck"));
    }

    #[test]
    fn writable_existing_folder_is_usable() {
        let dir = scratch("ok");
        assert!(dir_is_usable(dir.to_str().unwrap()));
        // не созданная вложенная папка внутри доступной: можно создать
        assert!(dir_is_usable(dir.join("a").join("b").to_str().unwrap()));
        // проверка ничего не создала
        assert!(!dir.join("a").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn read_only_folder_is_not_usable() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch("ro");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
        // под root запись всё равно проходит: проверяем только когда запрет действует
        let writable_anyway = std::fs::File::create(dir.join("x")).is_ok();
        if !writable_anyway {
            assert!(!dir_is_usable(dir.to_str().unwrap()));
            assert!(!dir_is_usable(dir.join("tmp").to_str().unwrap()));
        }
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn fallback_is_absolute_and_inside_system_temp() {
        let f = fallback_temp_dir();
        assert!(Path::new(&f).is_absolute());
        assert!(f.contains("queryast-lens-duckdb-tmp"));
    }
}
