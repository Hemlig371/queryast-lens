# User Guide

QueryAST Lens is a cross-platform SQL Workbench for local and cloud analytics (DuckDB, ClickHouse) with a built-in AST data lineage visualization engine and an advanced Excel report generator.

---

## Table of Contents
1. [Quick Start & Engine Management](#1-quick-start--engine-management)
   * [DuckDB (WASM & VFS File Manager)](#duckdb-wasm--vfs-file-manager)
   * [ClickHouse (Connection, FORMAT JSON & Notes)](#clickhouse-connection-format-json--notes)
   * [Row Count Limit (Core LIMIT)](#row-count-limit-core-limit)
   * [Pre-configured Workspace Bundle (default_config.json)](#pre-configured-workspace-bundle-default_configjson)
2. [SQL Editor & Macros](#2-sql-editor--macros)
   * [Local Variables & Macros](#local-variables--macros)
   * [SQL Compression & Encodings](#sql-compression--encodings)
   * [Keyboard Shortcuts](#keyboard-shortcuts)
3. [Excel Report Engine & SQL Directives](#3-excel-report-engine--sql-directives)
   * [Block Comments Rule](#3-excel-report-engine--sql-directives)
   * [Directives Reference](#directives-reference)
   * [Comprehensive SQL Report Example](#comprehensive-sql-report-example)
4. [AST Graph & Data Lineage](#4-ast-graph--data-lineage)
   * [Dependency Lineage Analysis](#dependency-lineage-analysis)
   * [Bidirectional Mermaid](#bidirectional-mermaid)
   * [Graph Export](#graph-export)
5. [Secure Vault & Secret Substitution](#5-secure-vault--secret-substitution)
6. [Action Menu, Snippets & Background Pipelines (@job)](#6-action-menu-snippets--background-pipelines-job)
7. [Data Inspection & Clipboard Export](#7-data-inspection--clipboard-export)
8. [Settings, UI Customization & Synchronization](#8-settings-ui-customization--synchronization)
   * [DuckDB Engine Settings (Memory, Threads, Init SQL)](#duckdb-engine-settings-memory-threads-init-sql)
   * [Custom Autocomplete & Quick Actions](#custom-autocomplete--quick-actions)
   * [Custom Keyboard Shortcuts (Hotkeys)](#custom-keyboard-shortcuts-hotkeys)
   * [Workspace Auto-Synchronization (Workspace Sync Path)](#workspace-auto-synchronization-workspace-sync-path)

---

## 1. Quick Start & Engine Management

Switching between engines is done via the top control panel (selector **DuckDB** / **ClickHouse**).

### DuckDB (WASM & VFS File Manager)
* **In Browser (WASM)**: The database runs locally in your browser's memory. You can query `.parquet`, `.csv`, and `.json` files:
  ```sql
  SELECT * FROM 'data.parquet' LIMIT 50;
  ```
* **VFS File Manager**: Open the VFS modal via settings or the file panel to drag and drop your Parquet/CSV files into the virtual file system.
* **In Desktop Version (Tauri)**: Queries access the local file system directly without browser memory limits. You can open local `.duckdb` database files or read absolute paths from disk.

### ClickHouse (Connection, FORMAT JSON & Notes)
* Switch the engine selector to **ClickHouse**.
* In the settings modal, set your connection parameters (host, port, user, password, database) or use a connection URI string:
  ```
  https://user:password@clickhouse-host:8443/default
  ```
  > **Tip:** If your password contains special characters like `@` or `:`, use double escaping: `@@` and `::`.
* **Automatic `FORMAT JSON`**: For select queries (`SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`), the client automatically appends `FORMAT JSON` if no format is explicitly provided. This is required for correct column type parsing and grid rendering.
* **Custom FORMAT**: If you explicitly specify another format in your query (e.g., `FORMAT Pretty` or `FORMAT CSV`), the client will not overwrite it and will output the raw text response.
* The application supports streaming queries `COPY TO / COPY FROM`, as well as canceling hanging queries on the ClickHouse server side using cancellation tokens.

### Row Count Limit (Core LIMIT)
* **Built-in Result Limit**: To protect the browser and system from memory overflow during accidental `SELECT *` without filters, the application caps the page size by default (typically **100 rows**).
* **Overriding the Limit**:
  1. **Via SQL Query**: If you explicitly provide your own `LIMIT` in the query (e.g., `LIMIT 500`), the engine respects your limit and does not append the default `LIMIT 100` on the first page.
  2. **Via UI Settings**: In **Settings**, you can change the global page size / max rows separately for DuckDB and ClickHouse, or set `0` to disable auto-capping.
  3. When navigating pagination pages (`> 1`), the engine automatically wraps the query into a safe subquery with `OFFSET` to prevent syntax conflicts.

### Pre-configured Workspace Bundle (default_config_en.json)
For a quick jump-start with tuned SQL formatting, rich Excel report presets, and analytical templates, reference bundles are provided:
👉 **English configuration:** [`docs/default_config_en.json`](./default_config_en.json)  
👉 **Russian configuration:** [`docs/default_config.json`](./default_config.json)

**What is included in this bundle:**
* Polished SQL formatter rules (uppercase keywords, tab indentation).
* Complete Excel export styling presets ("Flat Table", "Report (No Totals)", "Report (Formula Totals)", "Formatted (All Totals)", "Formatted (Subtotals)").
* Custom autocomplete snippets (Unpivot, Columns regex, getvariable/setvariable, CTE, Read Parquet/CSV).
* Quick action templates and ready-to-run queries (Window functions, ClickHouse MergeTree/Bitmap/Quantiles, Mermaid system architectures).

**How to import:**
1. Download or copy [`docs/default_config_en.json`](./default_config_en.json) (or `default_config.json`) to your computer.
2. In the app, press `Ctrl + ,` (or click the gear icon at the top) to open **Settings**.
3. In the lower-left corner of the modal, click the **Import** button (upload icon).
4. Select the `.json` configuration file. All settings, templates, and presets will be applied immediately.

---

## 2. SQL Editor & Macros

### Local Variables & Macros
You can parameterize your queries using expressions inside comments:
```sql
-- {{$limit=200}}
-- {{$status='ACTIVE'}}

SELECT *
FROM orders
WHERE status = {{$status}}
LIMIT {{$limit}};
```
Before execution, the editor automatically performs safe variable substitution.

### SQL Compression & Encodings
* **Single-line Compression**: The SQL compacting feature in the editor automatically converts single-line comments `--` into block comments `/* */` so your code doesn't break when merged into a single line.
* **Windows-1251 (ANSI) Encoding**: If you need to open an old corporate script file or a 1C export encoded in `cp1251`, use the dedicated Windows-1251 import button on the editor toolbar.

### Keyboard Shortcuts & Advanced Editor Actions
* `Ctrl + Enter` (or `Cmd + Enter`) — Execute current SQL query / update AST graph.
* `Ctrl + Space` — Manually trigger autocomplete dropdown (tables, schema columns, keywords).
* `Ctrl + F` / `Ctrl + H` — Open in-editor search / search & replace panel.
* `Ctrl + Shift + F` — Format SQL code (respecting keyword casing and expression wrapping rules).
* `Ctrl + Alt + M` — Compact SQL into a single line (with auto-conversion of single-line comments to block comments).
* `Ctrl + S` (or `Cmd + S`) — Save current query to file / history.
* `Ctrl + Shift + S` — Save As new file.
* `Ctrl + O` — Open SQL file from disk.
* `Ctrl + K` — Open snippets library (Snippets Manager).
* `Ctrl + \`` (or `Cmd + \``) — Open / close **Action Menu**.
* `Ctrl + Q` — Open Quick Actions contextual menu under cursor.
* `Ctrl + /` — Comment / uncomment line or block (`--` / `/* ... */`).
* `Ctrl + Shift + U` / `Ctrl + Shift + L` — Convert selection or word under cursor to UPPERCASE / lowercase.
* `Alt + Up` / `Alt + Down` — Move line or selected block of lines up / down.
* `Ctrl + Shift + V` — Paste clipboard content at the **end** of each selected line.
* `Ctrl + Alt + V` — Paste clipboard content at the **beginning** of each selected line (convenient for mass quotation or prefixing).
* `Ctrl + 1` .. `Ctrl + 9` — Switch directly to tab 1 through 9 (modifier configurable in Hotkeys settings).
* **Mouse Tab Management**: Middle-click (mouse wheel click) on a tab header closes it; the `+` button creates a new tab.
* `Alt + W` — Toggle word wrap in editor.
* `Alt + F` — Maximize editor to fullscreen.
* `Alt + T` — Toggle theme (Dark / Light).
* `Ctrl + ,` — Open app settings.
* `Alt + Q` — Open data analytics and charts panel (Data Stats).
* `Ctrl + Shift + E` — Copy result dataset in TSV format to clipboard.
* `Ctrl + Alt + E` — Generate and download styled Excel report from current results.
* `Ctrl + E` — Open graph export menu (PNG, SVG, JSON, XML, Mermaid, Draw.io).
* `Alt + M` — Toggle graph navigator minimap.
* `Ctrl + Alt + S` / `Ctrl + Alt + A` — Export / import full workspace configuration (Workspace JSON).
* `Ctrl + R` — Refresh database schema and table list.
* `Esc` — Cancel running query, reset cell zoom, or close open modal window.

---

## 3. Excel Report Engine & SQL Directives

When exporting query results to `.xlsx` (via the **Export to Excel** button), you can control the appearance, structure, and formatting of the document directly through comments in your SQL code.

> ⚠️ **Critical Syntax Rule:**  
> The Excel directive parser looks for settings **exclusively inside block comments `/* ... */`**. Single-line comments `--` are **not processed** by the Excel parser (they are only used for editor local variables `{{$var}}`). All report directives must be placed inside a `/* ... */` block.

### Directives Reference

| Directive | Purpose | Example inside `/* ... */` |
| :--- | :--- | :--- |
| `# Title` | Main report title on the first row of the sheet | `# Revenue Report` |
| `## Subtitle` | Subtitle with metadata or date range | `## Period: 2024 Q1-Q3` |
| `@file: name` | Overrides the generated filename | `@file: revenue_report_2024` |
| `@sheet: name` | Sets the Excel worksheet name | `@sheet: Sales Summary` |
| `@preset: name` | Applies a color styling preset (e.g., `classic` or custom preset name from Settings) | `@preset: classic` |
| `@totals: function` | Enables native totals row (`SUM`, `AVERAGE`/`AVG`, `COUNT`) | `@totals: SUM` |
| `@split: column` | Splits results into separate worksheets by column name or index (1-based) | `@split: department` |
| `@group: N` | Groups rows by column name or index | `@group: 1` |
| `@group_cols: N` | Number of category columns on the left | `@group_cols: 2` |
| `@group_hide: true` | Hides repeating values in grouped columns for a tree-like view | `@group_hide: true` |
| `@hide: column` | Visually hides the specified column in the Excel sheet | `@hide: internal_id` |
| `@skip: column` | Completely excludes the column from the generated file | `@skip: raw_payload` |
| `@protect: password` | Protects the worksheet from accidental editing | `@protect: readonly2024` |
| `@excel_save: path` | *(Desktop)* Direct report save to disk without dialog prompt | `@excel_save: /reports/out.xlsx` |

### Comprehensive SQL Report Example

```sql
/*
# Branch Sales Summary
## Export generated automatically
@file: monthly_sales
@sheet: Sales
@preset: classic
@totals: SUM
@group: 1
@group_hide: true
*/

SELECT 
    region AS "Region",
    city AS "City",
    manager_name AS "Manager",
    deal_count AS "Deals Count",
    total_revenue AS "Revenue",
    margin_pct AS "Margin (%)"
FROM sales_data
ORDER BY region, city;
```

### Custom Excel Presets & Visual Style Builder
In addition to built-in presets, the **Settings $\to$ Excel** tab provides a complete visual formatting designer:
* Font family selection (Segoe UI, Aptos, Calibri, Arial, etc.), row heights, and font sizes for headers and data cells.
* Granular color customization: header background/text, totals accent fill, alternating row striping ("zebra"), and gridline colors.
* Excel table features: AutoFilter toggle, auto column width fitting, and sticky header pinning (`Freeze Panes`).
* Print settings: page orientation (portrait/landscape), print scaling, and header/footer stamps with date, time, and page numbers.
* **Saving to Custom Presets**: enter a name and click **Save**. The saved preset is immediately available in SQL via `@preset: MyPreset`.
* **Copy SQL Directives Template**: the "Copy Template" button places a ready-to-use block comment with all supported directives into your clipboard.

---

## 4. AST Graph & Data Lineage

### Dependency Lineage Analysis
To build the graph, click the **Visualize** button on the panel below the editor or press `Ctrl + Enter`:
1. All tables, views, subqueries, and CTEs (`WITH cte AS (...)`) are parsed out.
2. An oriented dependency graph is built.
3. Clicking a node or clicking **Focus** highlights all incoming and outgoing data flows (Data Lineage), helping you understand complex multi-page queries with dozens of `JOIN`s.
4. The graph controls panel allows toggling layout orientation (`LR` / `TB`) and showing/hiding `Sort` (ORDER BY) and `Limit` (LIMIT/OFFSET) nodes.

### Bidirectional Mermaid
* You can export the query graph to a Mermaid diagram format via the export menu.
* **Reverse import & visualization is also supported**: paste Mermaid diagram syntax into the editor and click the Mermaid icon button next to **Visualize**:
  ```mermaid
  graph TD
    A[Raw Events] --> B(Kafka Consumer)
    B --> C[(ClickHouse Staging)]
    C --> D[Data Mart]
  ```
  The app will automatically parse it and render an interactive node graph.

### Graph Export
Graphs can be saved in the following formats:
* Raster and vector images: **PNG**, **SVG**, **JPEG**.
* Schema formats: **Mermaid (.mmd)**, **Draw.io XML (.drawio)**, **JSON Data**, **XML Schema**.

---

## 5. Secure Vault & Secret Substitution

The application includes an encrypted secrets vault (**Encrypted Vault**) using the hardware standard **AES-256 GCM** via the Web Crypto API:
1. Open **Settings -> Vault** and set a master PIN code.
2. Add secrets, such as `CLICKHOUSE_PASS` or `PROD_TOKEN`.
3. In your SQL queries, you can reference saved keys:
   ```sql
   SELECT * 
   FROM read_parquet('https://my-bucket.s3.amazonaws.com/data.parquet?token={{PROD_TOKEN}}');
   ```
4. Upon execution, the secret is dynamically substituted into runtime memory without exposing your script when saved or shared.
5. You can configure an auto-lock timer to seal the vault after inactivity.

---

## 6. Action Menu, Snippets & Background Pipelines (@job)

The **Action Menu** tab is an interactive dashboard of action cards and no-code pipelines for frequently used analytical workflows.

### How to open the Action Menu:
1. **Via Keyboard Shortcut**: Press `Ctrl + \`` (or `Cmd + \`` on macOS) to instantly switch to the Action Menu tab from anywhere in the application. Pressing it again toggles back to your previous active SQL editor tab.
2. **Via Tab Bar**: In maximized editor mode, the first static tab on the far left of the tab bar with the `<>` code icon (to the left of Tab 1) opens the **Action Menu**.
3. **Snippets Library (Template Manager)**: Press `Ctrl + K` or click the layers icon on the editor toolbar. In the snippets library modal, the full "Action Menu" category is also accessible for editing and adding templates.

### Action Menu Capabilities:
* **Quick Double-Click Card Editing**: Double-clicking any card in the Action Menu immediately opens the Snippets Constructor modal to edit that template's title, SQL code, category, or dialect.
* **Interactive Parameters on Cards**: When a query uses variables like `{{$Name=value}}`, the card renders interactive input fields before launch without needing to edit raw SQL.
* **One-click Execution (`Play`)**: Run any action directly against the active engine (DuckDB / ClickHouse) with a single click.
* Add frequently used queries to **Favorites** (star icon).
* **Multi-command pipelines (`-- @job`)**:
  If your snippet contains multiple commands separated by semicolons, add the `-- @job` directive at the top:
  ```sql
  -- @job: Refresh Data Mart
  CREATE OR REPLACE TABLE daily_summary AS 
  SELECT today() AS dt, count(*) AS total_events FROM events;

  OPTIMIZE TABLE daily_summary FINAL;
  ```
  The app will execute the entire script chain step by step with progress indicators for each stage.

### Exporting Templates Library & Code History:
1. **Templates Library Export (Snippets Manager — `Ctrl + K`)**:
   * **ZIP Export**: Click **"Export ZIP"** to package all snippets into a structured archive categorized by directory folders (`Favorites/`, `Jobs/`, and custom categories). Each file keeps its appropriate extension (`.sql`, `.py`, `.sh`, `.md`) with metadata comments.
   * **JSON Export**: Export all active templates into a unified JSON file for full workspace transfer or backup.
2. **Version History Export (Version History Modal — clock icon)**:
   * **ZIP Export**: Download all saved revisions organized into `Auto-save/` or `Manual snapshot/` folders, tagged subdirectories, and timestamped filenames.
   * **JSON Export**: Export the full version history dump with ISO timestamps.

---

## 7. Data Inspection, Analytics & Export

The results table (**DataStatsViewer**) is designed for datasets of any size:
* **Transposing (`Row ↔ Col`)**: Quick pivot of tabular results to inspect wide records with dozens of attributes.
* **Cell Zoom**: Detailed modal inspection of lengthy text, formatted JSON structures, and arrays.
* **Smart Context Filters**:
  * Right-click or click on any cell value to immediately apply a filter (`=`, `!=`, `LIKE`, `IS NULL`, `IS NOT NULL`).
  * To preserve your initial complex query, the filtered result opens seamlessly in a **new linked tab** while keeping the original SQL intact.
* **Column Sorting**: Click headers to sort datasets at the query level (`ASC` / `DESC`) with safe wrapper execution.
* **Analytics Panel & Embedded Charts (`Alt + Q`)**:
  * Interactive switching between bar charts, line graphs, area charts, and pie charts.
  * **Bar Chart Layouts**: Full support for both vertical and horizontal column orientations (clicking Bar toggles orientation).
  * **Copy Chart as Image**: Click the copy icon above the chart container to copy a high-resolution transparent Retina 2x PNG directly to your clipboard.
  * **Deep Column Statistics (Columns Stats / Aggregation)**: Computes essential metrics across the entire dataset without page limits (up to 100M rows): `total_count`, `null_count`, `null_percent`, `unique_count`, `min`, `max`, `avg`, `sum`.
* **Clipboard Exports**:
  * **Copy as Image**: Copy visible table cells as a clean Retina PNG image for messengers or documentation.
  * `Ctrl + Shift + E` — Copy the active result page formatted as Tab-Separated Values (TSV) for pasting into Google Sheets or Excel.

---

## 8. Settings, UI Customization & Synchronization

Open the Settings modal via `Ctrl + ,` or the gear icon in the top header.

### DuckDB Engine Settings (Memory, Threads, Init SQL, Extensions)
When DuckDB options are enabled in **UI Elements**, advanced connection parameters are available:
* **Memory Limit**: Memory allocation ceiling for DuckDB (defaults to `8GB`).
* **Temp Directory**: Working directory for disk spillover when querying large datasets (defaults to `./tmp`).
* **Extensions Dir**: Directory for storing and auto-loading local extensions (defaults to `./extensions`).
* **Threads**: CPU worker threads (`0` = automatic detection of all available cores).
* **Init SQL Script (`duckDbInitSql`)**: Startup SQL executed automatically on every connection (e.g. `LOAD 'spatial';` or timezone setup `SET TimeZone='UTC';`).
* **allow_unsigned_extensions**: Toggle allowing installation and execution of community extensions.

#### Loading Custom DuckDB Extensions:
* Download or compile binary `.duckdb_extension` files for your platform.
* Place them into the folder designated by **Extensions Dir** (defaults to `./extensions`), or extract your extensions archive directly to disk.
* Check the **`allow_unsigned_extensions`** option if the binaries are not officially signed by DuckDB Labs.
* In the **Init SQL Script** field, specify the load directive: `LOAD 'extension_name';` (e.g. `LOAD 'spatial';` or `LOAD 'httpfs';`). The extension will automatically be initialized on startup.
* A categorized directory of tested official and community extensions is available in: [**docs/extension_list.md**](./extension_list.md).

### Custom Autocomplete & Quick Actions
* **Autocomplete Templates**: The **Formats** tab allows adding, editing, and deleting custom SQL snippets and macros that appear in the editor's autocomplete dropdown.
* **Quick Actions**: Template actions displayed in the schema tree context menu (e.g., "Duplicate rows", "Copy table", "Export to Parquet"). They support the `{table}` placeholder for dynamic substitution.

### Custom Keyboard Shortcuts (Hotkeys)
The **Hotkeys** tab enables remapping all editor, tab, and graph shortcuts to match your preferred keybindings (DBeaver, DataGrip, VS Code). Click on any key binding button and press your desired shortcut.

### Workspace Auto-Synchronization (Workspace Sync Path)
The Desktop version (Tauri) provides background auto-synchronization across multiple machines:
1. In Settings, configure the sync path to a shared cloud folder (e.g. `D:\Dropbox\workspace.json` or `/Users/name/Cloud/lens_workspace.json`).
2. When launching the app, it reads the updated bundle if it is newer than the local state, while preserving machine-specific local hardware configurations.
3. Manual workspace backup and restoration are always accessible via the **Export** and **Import** buttons in the settings modal footer.

