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
| `@template: path` | path to `.xlsx` | *(Desktop)* Fills a ready-made template with the query result | See section 6. Native formatting (`@preset`, `@totals`, `@group`, `@split`, `@skip`, `@hide`, `@protect`) is not applied in this mode; `# Title` and `## Subtitle` are output only through the `[[title]]` and `[[subtitle]]` markers. |
| `@template_values: path` | path to `.xlsx` | *(Desktop)* Only writes values into a ready-made template, no formatting | See section 6. No rows are inserted and nothing is shifted. |

Column numbers in `@split`, `@skip`, `@hide` and `@group` refer to the original result columns (before `@skip` removal and before the `@split` column is dropped). A value consisting only of digits is always treated as a number, so a column named like `2024` cannot be referenced by name. If a name is not found, the directive is ignored.

## 3. Limits

* At most 1,500,000 cells (rows × columns). Above that, an error asks you to reduce the selection.
* No data produces the error "Нет данных для экспорта в Excel" (no data to export). Exception: export from a template (`@template`, `@template_values`, section 6) accepts an empty result when the column names are known.
* Column type (number, date) is taken from the type returned by the database; if it is missing, the first 50 non-empty values are inspected.
* `@protect` uses lightweight password hashing (100 iterations) so that the export does not hang.
* A string that starts with `=` is written to Excel as a formula, so Excel formulas and SQL can be mixed in one report, e.g. `SELECT 'Total' AS name, '=SUM(B2:B10)' AS value`. This also applies to data from the database: a value such as `=== total ===` or `=1+1` becomes a formula too (`=== total ===` gives a formula error).

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

## 6. `@template` (export from a template, desktop only)

A template is a regular `.xlsx` that you prepare yourself: header, category column, print setup, column widths, frozen rows. Put a marker for the start of the data area in **one cell**:

| Marker | What is inserted |
| :--- | :--- |
| `[[table]]` | The whole result: column names from SQL as the first row, then the data |
| `[[rows]]` | Data rows only (the column names are already in the template or are written by the `[[header]]` marker) |
| `[[header]]` | Column names of the SQL result only: written to the right of the marker cell, no rows are shifted. Used together with `[[rows]]` |
| `[[title]]`, `[[subtitle]]` | May be placed in any cell of any sheet, including inside text (`Report: [[title]]`). Replaced with `# Title` and `## Subtitle` from the query's block comments |

* Data goes from the marker cell to the right (SQL columns) and down (result rows).
* The row with the marker is the **lead row**: its formatting (number format, font, fill, borders, row height, merges inside the row) is applied to every inserted row. If the result has more columns than the template styles, the extra columns take the formatting of the marker cell.
* Everything below the lead row moves down. Merged cells, row heights, page breaks and the print area (it is extended so everything fits) move with it. Formulas on this sheet are adjusted as when inserting rows in Excel: a range that contains the lead row (`SUM(D7:D7)`) is extended over all inserted rows; references to other sheets are unchanged.
* Text in lead-row cells outside the data columns (for example a label in the category column on the left) stays in the lead row only and is not copied into the new rows.
* Values: numbers as numbers, dates as dates, NULL as an empty cell, a string starting with `=` as a formula.
* The template path is given the same way as the `@excel_save` path: used as is, a full path is recommended. The file is read on every export.
* `@sheet: name` selects the template sheet to fill; without it the first sheet with a marker is used. The first marker found is filled; other sheets are left unchanged. `@file` and `@excel_save` work as usual.
* Empty result: `[[table]]` writes only the column names, `[[rows]]` just removes the marker, `[[header]]` writes the column names. The result's column names must be known; otherwise the export stops with the error "Колонки таблицы не найдены" (columns not found).
* **`[[header]]`** is placed in its own cell; data starts at the `[[rows]]` cell. The markers must be in different rows; combining it with `[[table]]` is not allowed (error). No rows are inserted or shifted; if `[[header]]` is below `[[rows]]`, it moves together with the rest of the content. A cell to the right of the marker that already has formatting in the template keeps it; empty cells get the marker cell's formatting. The number of cells equals the number of result columns; existing values further to the right are overwritten. The marker is searched on the same sheet as `[[rows]]`.
* **`[[title]]` and `[[subtitle]]`** take their values from `# …` and `## …` (same rules as the regular export: a lone `## …` without `#` sets both title and subtitle). Lines starting with `@` are skipped when parsing, so a `#` in the template path does not become a title. If there is no value, the marker is replaced with an empty string. Formulas are not changed; in rich text, a marker that lies entirely within one text run is replaced; in merged cells the value is written to the top-left cell. The title is not inserted into the first rows of the sheet automatically: the template decides the place.
* **`@template_values: path`** — same marker and the same path/`@sheet` rules, but the result is only written as values starting at the marker cell. No formatting is copied, rows are not shifted, the print area, merges and formulas are not changed; everything else in the template stays as is. If the result is shorter than what the template had, old values below remain. A date format is set only if the cell is "General".
* `@excel_save` is the path for the **result** (a file or folder, used as is); `@template` is the path **to the template** (both are given the same way). If `@excel_save` equals the template, the export stops with an error so the template is not overwritten.
* Not supported: conditional formatting, data validation, images and cell notes below the lead row are not moved; a merge that crosses the lead row is not extended; shapes, text boxes, form controls and charts of the template are not kept in the result (the `exceljs` library does not preserve them); formulas on other sheets that refer to this sheet are not adjusted. A missing marker, sheet or file gives a clear error.

```sql
/*
@template: /forms/report.xlsx
@sheet: Sales
@file: sales
*/
SELECT region, revenue FROM sales ORDER BY region;
```
