# Excel SQL Directives Reference

This document describes how the application reads directives from SQL comments when exporting a result to `.xlsx`. For a general overview and an example, see the [User Guide](./USER_GUIDE_EN.md#3-excel-report-engine--sql-directives). Русская версия: [EXCEL_DIRECTIVES.md](./EXCEL_DIRECTIVES.md).

## 1. How directives are read

* Directives are taken **only from block comments** `/* ... */`. Line comments `-- ...` are ignored by the Excel engine (they are used for editor variables and `-- @job`).
* The texts of all block comments in a query are concatenated, so directives can be spread over several blocks and placed anywhere in the query.
* A directive value is read to the end of the line but stops at the characters `@` and `*`. Therefore the values of `@file`, `@sheet`, `@preset`, `@split`, `@skip`, `@hide`, `@group` and `@protect` cannot contain these characters (this includes the `@protect` password).
* Case: all directives except `@file` and `@sheet` are case-insensitive; `@file` and `@sheet` must be written in lowercase.
* Directives override the **Settings → Excel** options for the current export only; saved settings are not changed.
* Order of application: `@preset` first (it replaces all settings with the preset's settings), then the other directives on top of it.

## 2. Reference

| Directive | Value | What it does | Notes |
| :--- | :--- | :--- | :--- |
| `# Title` | text | Report title in the first rows of the sheet; enables the title | The first `#` found in block comments is used (including one inside ordinary comment text). |
| `## Subtitle` | text | Subtitle under the title | Shown only together with a title. If only `## ...` is present without `#`, the text is used as both title and subtitle. |
| `@file: name` | text without extension | File name | The date is appended: `name_YYYY-MM-DD.xlsx`. Without the directive, the "File name" setting is used (default `report`). |
| `@sheet: name` | text | Sheet name | Up to 31 characters; the characters `\ / ? * : [ ]` are replaced with `_`. Ignored with `@split` (sheet names come from column values). Default: `Отчет`. |
| `@preset: name` | preset name | Applies a style preset | Matched by name, case-insensitive. The built-in preset is named "По умолчанию". If no preset has that name, the directive is silently ignored. |
| `@totals: function` | `SUM`, `AVERAGE`/`AVG`, `COUNT`/`COUNTA` | Sets the totals function | Sets the function for both the totals row and the totals column, but does **not enable** them: the totals row is on by default, the totals column is off; both are toggled in Settings → Excel. `COUNT` is exported as the `COUNTA` formula. |
| `@split: column` | name or number (from 1) | One sheet per value of the column | The column is not written to the sheets. An empty value goes to the "Пусто" sheet. Sheet names are limited to 31 characters, invalid characters become `_`, duplicates get the suffix ` (2)`, ` (3)`. One column only. |
| `@skip: column` | name or number | Excludes a column from the file | One column only. |
| `@hide: column` | name or number | Hides a column on the sheet | Data and formulas are kept. One column only. |
| `@group: column` | name or number; `0` disables | Groups consecutive rows with the same value | Rows inside a group get an Excel outline level (collapsible). No sorting is performed: equal values must be adjacent (use `ORDER BY`). |
| `@group_cols: N` | number | Number of category columns on the left | Takes effect when the first-column style (`enableFirstColumnStyle`) is enabled in Settings → Excel (off by default). Also affects frozen columns. |
| `@group_hide: true` | `true`/`false`/`1`/`0` | Do not repeat the group value in child rows | Works together with `@group`. |
| `@protect: password` | text | Protects the sheet with a password | Enables protection; sorting, auto-filter, column width and row height changes remain allowed. The password must not contain `@` or `*`. This protects against accidental edits; it is not encryption. |
| `@excel_save: path` | path | *(Desktop)* Saves the file without a dialog | See section 4. |

Column numbers in `@split`, `@skip`, `@hide` and `@group` refer to the original result columns (before `@skip` removal and before the `@split` column is dropped). A value consisting only of digits is always treated as a number, so a column named like `2024` cannot be referenced by name. If a name is not found, the directive is ignored.

## 3. Limits

* At most 1,500,000 cells (rows × columns). Above that, an error asks you to reduce the selection.
* No data produces the error "Нет данных для экспорта в Excel" (no data to export).
* Column type (number, date) is taken from the type returned by the database; if it is missing, the first 50 non-empty values are inspected.
* `@protect` uses lightweight password hashing (100 iterations) so that the export does not hang.

## 4. `@excel_save` (desktop only)

* Works only in the desktop version (Tauri). In other versions the directive is ignored and the file is downloaded normally.
* The path can be a file name (`/reports/out.xlsx`, `D:\reports\out.xlsx`) or a folder ending with `/` or `\` (`/reports/`); in the latter case the file name is built as usual (`name_YYYY-MM-DD.xlsx`).
* The file is created automatically **every time a query result arrives in the active tab**, including when you change the page, sorting or filter. The file contains exactly the rows the query returned: one page (100 rows by default) or as many as your `LIMIT` allows. To export everything, set the page size to `0` in settings or use an explicit `LIMIT`.
* Queries running in background tabs do not trigger an export.
* If writing to the given path fails, the application falls back to a regular browser-style download.

## 5. Example

```sql
/*
# Продажи по регионам
## Данные за 2024 год
@file: sales_by_region
@sheet: Продажи
@preset: По умолчанию
@totals: SUM
@group: 1
@group_hide: true
@skip: internal_id
*/
SELECT region, city, revenue, internal_id
FROM sales
ORDER BY region, city;
```

Result: the file `sales_by_region_<date>.xlsx`, sheet "Продажи", a title and subtitle at the top, the `internal_id` column is not exported, rows are grouped by `region` without repeated values, and a totals row with sums.
