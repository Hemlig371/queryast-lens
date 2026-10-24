//! Текст даты и времени для значений внутри вложенных типов DuckDB.
//! Формат такой же, как у `Display` типов chrono, которыми execute_query выводит те же значения на верхнем уровне:
//! `2024-01-31`, `12:34:56[.123|.123456|.123456789]`, `2024-01-31 12:34:56[.fraction]`.
//! Только стандартная библиотека: модуль проверяется отдельно от остальных крейтов (`rustc --test src/timefmt.rs`).

/// Число секунд в сутках.
const SECS_PER_DAY: i64 = 86_400;

/// Календарная дата по числу суток от 1970-01-01 (алгоритм Говарда Хиннанта, григорианский календарь).
pub fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097); // [0, 146096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn format_year(year: i64) -> String {
    if (0..=9999).contains(&year) {
        format!("{:04}", year)
    } else if year < 0 {
        format!("-{:04}", -year)
    } else {
        format!("+{}", year)
    }
}

/// `YYYY-MM-DD` по числу суток от 1970-01-01.
pub fn format_date(days_since_epoch: i64) -> String {
    let (y, m, d) = civil_from_days(days_since_epoch);
    format!("{}-{:02}-{:02}", format_year(y), m, d)
}

/// Дробная часть секунды: ничего при 0, иначе 3, 6 или 9 знаков (как chrono).
fn format_fraction(nanos: u32) -> String {
    if nanos == 0 {
        String::new()
    } else if nanos % 1_000_000 == 0 {
        format!(".{:03}", nanos / 1_000_000)
    } else if nanos % 1_000 == 0 {
        format!(".{:06}", nanos / 1_000)
    } else {
        format!(".{:09}", nanos)
    }
}

/// `HH:MM:SS[.дробь]` по секундам от полуночи и наносекундам.
pub fn format_time(secs_of_day: i64, nanos: u32) -> String {
    let s = secs_of_day.rem_euclid(SECS_PER_DAY);
    format!("{:02}:{:02}:{:02}{}", s / 3600, (s % 3600) / 60, s % 60, format_fraction(nanos))
}

/// `YYYY-MM-DD HH:MM:SS[.дробь]` по секундам от 1970-01-01 00:00:00 и наносекундам.
pub fn format_timestamp(secs_since_epoch: i64, nanos: u32) -> String {
    let days = secs_since_epoch.div_euclid(SECS_PER_DAY);
    format!("{} {}", format_date(days), format_time(secs_since_epoch.rem_euclid(SECS_PER_DAY), nanos))
}

/// Делит значение в единицах `per_second` (1, 1000, 1_000_000, 1_000_000_000 в секунду) на целые секунды и наносекунды.
/// Секунды округляются вниз, наносекунды всегда неотрицательны (для моментов до 1970 года тоже).
pub fn split_units(value: i64, per_second: i64) -> (i64, u32) {
    let per_second = per_second.max(1);
    let secs = value.div_euclid(per_second);
    let rem = value.rem_euclid(per_second);
    (secs, (rem * (1_000_000_000 / per_second)) as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_basic() {
        assert_eq!(format_date(0), "1970-01-01");
        assert_eq!(format_date(19_723), "2024-01-01");
        assert_eq!(format_date(19_782), "2024-02-29"); // високосный год
        assert_eq!(format_date(-1), "1969-12-31");
        assert_eq!(format_date(-719_162), "0001-01-01");
    }

    #[test]
    fn date_far_years() {
        // 10000-01-01 = 2_932_897 суток от эпохи
        assert_eq!(format_date(2_932_897), "+10000-01-01");
        assert_eq!(format_date(-719_528), "0000-01-01"); // нулевой год — високосный
        assert_eq!(format_date(-719_528 - 365), "-0001-01-01");
    }

    #[test]
    fn time_fraction_like_chrono() {
        assert_eq!(format_time(0, 0), "00:00:00");
        assert_eq!(format_time(45_296, 0), "12:34:56");
        assert_eq!(format_time(45_296, 123_000_000), "12:34:56.123");
        assert_eq!(format_time(45_296, 123_456_000), "12:34:56.123456");
        assert_eq!(format_time(45_296, 123_456_789), "12:34:56.123456789");
        assert_eq!(format_time(45_296, 500_000_000), "12:34:56.500");
    }

    #[test]
    fn timestamp_basic() {
        assert_eq!(format_timestamp(0, 0), "1970-01-01 00:00:00");
        assert_eq!(format_timestamp(1_706_704_496, 0), "2024-01-31 12:34:56");
        assert_eq!(format_timestamp(1_706_704_496, 250_000), "2024-01-31 12:34:56.000250");
    }

    #[test]
    fn timestamp_before_epoch() {
        // 1969-12-31 23:59:59.5
        let (s, n) = split_units(-500, 1_000);
        assert_eq!((s, n), (-1, 500_000_000));
        assert_eq!(format_timestamp(s, n), "1969-12-31 23:59:59.500");
    }

    #[test]
    fn split_units_all_scales() {
        assert_eq!(split_units(5, 1), (5, 0));
        assert_eq!(split_units(1_500, 1_000), (1, 500_000_000));
        assert_eq!(split_units(1_000_001, 1_000_000), (1, 1_000));
        assert_eq!(split_units(1_000_000_001, 1_000_000_000), (1, 1));
    }
}
