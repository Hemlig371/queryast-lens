# User Guide

QueryAST Lens is a cross-platform SQL Workbench for local and cloud analytics (DuckDB, ClickHouse) with an AST graph, dependency highlighting (Data Lineage) and an Excel report generator.

---

## Table of Contents
1. [Quick Start & Engine Management](#1-quick-start--engine-management)
   * [DuckDB (WASM & VFS File Manager)](#duckdb-wasm--vfs-file-manager)
   * [ClickHouse (Connection, FORMAT JSON & Notes)](#clickhouse-connection-format-json--notes)
   * [Row Count Limit (Core LIMIT)](#row-count-limit-core-limit)
   * [Pre-configured Workspace Bundle (default_config.json)](#pre-configured-workspace-bundle-default_config_enjson)
2. [SQL Editor & Macros](#2-sql-editor--macros)
   * [Local Variables & Macros](#local-variables--macros)
   * [SQL Compression & Encodings](#sql-compression--encodings)
   * [Keyboard Shortcuts](#keyboard-shortcuts--advanced-editor-actions)
3. [Excel Report Engine & SQL Directives](#3-excel-report-engine--sql-directives)
   * [Block Comments Rule](#3-excel-report-engine--sql-directives)
   * [Directives Reference](#directives-reference)
   * [Comprehensive SQL Report Example](#comprehensive-sql-report-example)
4. [AST Graph & Data Lineage](#4-ast-graph--data-lineage)
   * [Dependency Lineage Analysis](#dependency-lineage-analysis)
   * [Bidirectional Mermaid](#bidirectional-mermaid)
   * [Markdown preview](#markdown-preview)
   * [Graph Export](#graph-export)
5. [Secure Vault & Secret Substitution](#5-secure-vault--secret-substitution)
6. [Action Menu, Snippets & Background Pipelines (@job)](#6-action-menu-snippets--background-pipelines-job)
7. [Data Inspection, Analytics & Export](#7-data-inspection-analytics--export)
8. [Settings, UI Customization & Synchronization](#8-settings-ui-customization--synchronization)
   * [DuckDB Engine Settings (Memory, Threads, Init SQL)](#duckdb-engine-settings-memory-threads-init-sql-extensions)
   * [Custom Autocomplete & Quick Actions](#custom-autocomplete--quick-actions)
   * [Custom Keyboard Shortcuts (Hotkeys)](#custom-keyboard-shortcuts-hotkeys)
   * [Workspace Auto-Synchronization (Workspace Sync Path)](#workspace-auto-synchronization-workspace-sync-path)
   * [Narrow Screens & Android](#narrow-screens--android)

---

## 1. Quick Start & Engine Management

Switching between engines is done via the top control panel (selector **DuckDB** / **ClickHouse**).

### DuckDB (WASM & VFS File Manager)
* **In Browser (WASM)**: The database runs locally in your browser's memory. You can query `.parquet`, `.csv`, and `.json` files:
  ```sql
  SELECT * FROM 'data.parquet' LIMIT 50;
  ```
  A `.duckdb` database file opened in WASM mode (including on Android) is read into memory as a whole: changes to the database live only in memory and are not written back to the file.
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
* The application supports streaming queries `COPY TO / COPY FROM`, (`COPY FROM` is not available in the Android version), as well as canceling a running query (the HTTP request is aborted and ClickHouse stops the execution).
* **The password is not saved**: host, user and database are remembered, but the password has to be entered again after a restart. To avoid typing it, store the connection string (URI with password) in the Vault (see section 5) under a name with the `ch_` prefix: the connection form then shows a list of such secrets, and choosing one fills in all fields.

### Row Count Limit (Core LIMIT)
* **Built-in Result Limit**: To protect the browser and system from memory overflow during accidental `SELECT *` without filters, the application caps the page size by default (typically **100 rows**).
* **Overriding the Limit**:
  1. **Via SQL Query**: If the query text contains `LIMIT` followed by a number (e.g., `LIMIT 500`), the engine assumes the limit is yours and does not append `LIMIT 100` on the first page. The check is simple: `LIMIT <number>` is searched anywhere in the query, including inside a CTE, subquery or comment. If `LIMIT` appears only inside a CTE, the outer query stays unrestricted. The table still shows one page of the configured size (100 rows by default).
  2. **Via UI Settings**: In **Settings**, you can change the global page size / max rows separately for DuckDB and ClickHouse.
  3. When navigating pagination pages (`> 1`), the engine automatically wraps the query into a safe subquery with `OFFSET` to prevent syntax conflicts.
  4. At most 500,000 rows per query are passed to the interface (desktop DuckDB, WASM, ClickHouse); above that the query ends with an error (add a LIMIT or save the result with COPY).

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
Before execution, the editor automatically performs safe variable substitution. The system variable `{{$timestamp}}` inserts the current time in Unix milliseconds. If a variable is not defined, the text `{{$name}}` stays in the query as is and the database returns a syntax error. A variable value cannot contain the `}` character.

### SQL Compression & Encodings
* **Single-line Compression**: The SQL compacting feature in the editor automatically converts single-line comments `--` into block comments `/* */` so your code doesn't break when merged into a single line.
* **Windows-1251 (ANSI) Encoding**: If you need to open an old corporate script file or a 1C export encoded in `cp1251`, use the dedicated Windows-1251 import button on the editor toolbar.

### Keyboard Shortcuts & Advanced Editor Actions
* `Ctrl + Enter` (or `Cmd + Enter`) — In graph mode (the editor is not maximized) only builds the AST graph and does not execute the query; in the maximized editor it executes the query (if the DuckDB or ClickHouse panel is enabled). A selected fragment is executed instead of the whole text.
* `Ctrl + Shift + C` — Copy the SQL text to the clipboard.
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
| `@preset: name` | Applies a styling preset by name (case-insensitive): the built-in "По умолчанию" (Default) or your own preset from Settings. If no preset has that name, the directive is silently ignored | `@preset: По умолчанию` |
| `@totals: function` | Sets the function of the native totals (`SUM`, `AVERAGE`/`AVG`, `COUNT`). The totals row is enabled in Settings by default, the totals column is not; the directive does not enable them | `@totals: SUM` |
| `@split: column` | Splits results into separate worksheets by column name or index (1-based) | `@split: department` |
| `@group: N` | Groups rows by column name or index | `@group: 1` |
| `@group_cols: N` | Number of category columns on the left | `@group_cols: 2` |
| `@group_hide: true` | Hides repeating values in grouped columns for a tree-like view | `@group_hide: true` |
| `@hide: column` | Visually hides the specified column in the Excel sheet | `@hide: internal_id` |
| `@skip: column` | Completely excludes the column from the generated file | `@skip: raw_payload` |
| `@protect: password` | Protects the worksheet from accidental editing | `@protect: readonly2024` |
| `@excel_save: path` | *(Desktop)* Direct report save to disk without dialog prompt | `@excel_save: /reports/out.xlsx` |

**Notes and limitations:**
* `@split`, `@skip`, `@hide` accept a single column (name or 1-based number). A name made only of digits (e.g. `2024`) is treated as a number.
* The title is taken from the first `#` in block comments, so do not use `#` in comment text for other purposes.
* No report is created if the result has more than 1.5 million cells (rows × columns): reduce the selection first.
* Detailed reference: [`EXCEL_DIRECTIVES_EN.md`](./EXCEL_DIRECTIVES_EN.md).
* **`@excel_save` (desktop)**: the file is created automatically when the result arrives and contains exactly the rows the query returned, i.e. one page (100 rows by default) or as many as your own `LIMIT` allows. Moving to another page or changing sorting or filters overwrites the file with the new data. To export everything, set the page size to `0` in Settings or use an explicit large `LIMIT`.

### Comprehensive SQL Report Example

```sql
/*
# Branch Sales Summary
## Export generated automatically
@file: monthly_sales
@sheet: Sales
@preset: По умолчанию
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
3. Clicking a node or clicking **Focus** highlights all nodes and edges upstream and downstream of the selected node (Data Lineage). Highlighting works on graph nodes (tables, CTEs, subqueries, `JOIN`s) within one query; there is no column-level lineage and no tracking between separate queries.
4. The graph controls panel allows toggling layout orientation (`LR` / `TB`) and showing/hiding `Sort` (ORDER BY) and `Limit` (LIMIT/OFFSET) nodes.
5. **Several queries separated by `;`**: each query is built as a separate block with a "Query N" header and a "Collapse" button (collapse/expand). With `LR` the blocks go one under another, with `TB` they go one after another from left to right. No links are drawn between queries, and lineage highlighting is limited to the query itself. A query that cannot be parsed is skipped without a message.
6. **SQL parsing**: the PostgreSQL grammar (`node-sql-parser`) is used, plus heuristic parsing for constructs it does not understand. DuckDB, ClickHouse and Oracle use the same parsing, so dialect-specific constructs may be shown in a simplified way.

### Bidirectional Mermaid
* You can export the query graph to a Mermaid diagram format via the export menu.
* **Reverse import & visualization is also supported**: paste Mermaid diagram syntax into the editor and click the **Markdown** button next to **Visualize** (pure Mermaid text opens as an interactive graph):
  ```mermaid
  graph TD
    A[Raw Events] --> B(Kafka Consumer)
    B --> C[(ClickHouse Staging)]
    C --> D[Data Mart]
  ```
  The app will automatically parse it and render an interactive node graph.
* Supported: `flowchart` / `graph` — all node shapes (including `A@{ shape: cyl, label: "DB" }`), arrows `-->`, `---`, `-.->`, `==>`, `<-->`, `--x`, `--o`, `~~~`, labels `-->|text|` and `-- text -->`, `&`, `;`, `%%` comments, quoted labels, Unicode identifiers, `subgraph` (nested, and links to a subgraph), `classDef` / `class` / `style` / `linkStyle`.
* `flowchart`/`graph` and `erDiagram` are supported (entities with attributes `type name PK, FK, UK "comment"`, `||--o{` relationships in crow's-foot notation, dotted `..` lines, labels, `direction`). Lines are orthogonal and merging edges join into a bus. `direction` inside a `subgraph` applies when its nodes have no links to outside nodes (as in Mermaid). Other diagram types (`sequenceDiagram`, `gantt`, ...) are not supported — the app tells you so.
* Statements that cannot be parsed are skipped; the list with **line numbers** is shown above the graph while the rest of the diagram is built.

### Markdown preview
Select a fragment (or leave the whole text) in the editor and click **Markdown** — the rendered document opens in the graph area. The graph is hidden meanwhile; use **Visualize** to return to it.
* Supported: headings, lists (nested, numbered, task lists), tables, quotes, code, links, images (`https:` and `data:image`), `**bold**`, `*italic*`, `~~strikethrough~~`. Raw HTML is never executed — it is shown as text (only simple tags such as `<br>`, `<kbd>`, `<sub>`, `<sup>`, `<mark>` are allowed).
* ` ```sql ` blocks are highlighted; ` ```mermaid ` blocks are drawn as diagrams (flowchart/graph, erDiagram). Each diagram has an **Open as graph** button in its corner that builds an interactive graph from that block.
* The document text can be selected with the mouse and copied. The clipboard receives HTML suitable for Word: headings, lists, tables with borders, monospaced code and diagrams as images (light palette). Buttons and language labels are not copied.
* **Export**: the "Export" menu offers `PNG Image` and `JPEG Image` — the whole document is saved as one picture (900 px wide, colors of the current theme) regardless of the window size. The other menu items are disabled in document mode. A document that is too long (hundreds of screens) is not exported as a whole — select part of the text.
* If the selected text is a pure Mermaid diagram, the button still builds the interactive graph as before.

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
4. Upon execution, `{{NAME}}` is replaced with the secret value right before the query is sent; the tab text, version history and snippets keep `{{NAME}}`.
5. After the PIN is entered, the vault stays unlocked for 12 hours and then locks automatically (an inactivity timer and a configurable period are not provided). You can lock it earlier with the "Lock" button in the Vault section. Unlocking only lasts for the current run of the application.
6. If the query text contains `{{` (including an unresolved `{{$variable}}`) while the vault is locked, the query is not executed and a message about the locked vault appears.

---

## 6. Action Menu, Snippets & Background Pipelines (@job)

The **Action Menu** tab is an interactive dashboard of action cards and no-code pipelines for frequently used analytical workflows.

### How to open the Action Menu:
1. **Via Keyboard Shortcut**: Press `Ctrl + \`` (or `Cmd + \`` on macOS) to switch to the Action Menu tab from anywhere in the application. Pressing it again toggles back to your previous active SQL editor tab.
2. **Via Tab Bar**: In maximized editor mode, the first static tab on the far left of the tab bar with the `<>` code icon (to the left of Tab 1) opens the **Action Menu**.
3. **Snippets Library (Template Manager)**: Press `Ctrl + K` or click the layers icon on the editor toolbar. In the snippets library modal, the full "Action Menu" category is also accessible for editing and adding templates.

### Action Menu Capabilities:
* **Quick Double-Click Card Editing**: Double-clicking any card in the Action Menu immediately opens the Snippets Constructor modal to edit that template's title, SQL code, category, or dialect.
* **Interactive Parameters on Cards**: When a query uses variables like `{{$Name=value}}`, the card renders interactive input fields before launch without needing to edit raw SQL.
* **Execution (`Play`)**: Run an action against the active engine (DuckDB / ClickHouse) with a click.
* Add frequently used queries to **Favorites** (star icon).
* **Multi-command pipelines (`-- @job`)**:
  If your snippet contains multiple commands separated by semicolons, add the `-- @job` directive at the top:
  ```sql
  -- @job: Refresh Data Mart
  CREATE OR REPLACE TABLE daily_summary AS 
  SELECT today() AS dt, count(*) AS total_events FROM events;

  OPTIMIZE TABLE daily_summary FINAL;
  ```
  The app runs the commands one by one: all except the last as preparatory ones (their result is not shown), and the result of the last one is displayed in the table. On an error the execution stops. Any snippet with several commands is run sequentially; the `-- @job` directive serves as a label and for the "Jobs" filter.
* **Running a selected fragment**: right-clicking the run button (under the editor) opens a menu with "Sequential execution" (as above) and "Parallel execution" (commands are started simultaneously; instead of a result, a table of statuses `Query` / `Status` for each command is shown).

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
* **Context Filters**:
  * Right-click or click on any cell value to immediately apply a filter (`=`, `!=`, `LIKE`, `IS NULL`, `IS NOT NULL`).
  * To preserve your initial complex query, the filtered result opens in a **new linked tab** while keeping the original SQL intact.
* **Column Sorting**: Click headers to sort datasets at the query level (`ASC` / `DESC`) with safe wrapper execution.
* **Analytics Panel & Embedded Charts (`Alt + Q`)**:
  * Interactive switching between the statistics list, bar chart, line graph, and pie chart.
  * **Bar Chart Layouts**: Vertical and horizontal column orientations (clicking Bar toggles orientation).
  * **Copy Chart as Image**: Click the copy icon above the chart container to copy the chart to your clipboard as a PNG (2x pixel ratio).
  * **Deep Column Statistics (Columns Stats / Aggregation)**: Computes essential metrics across the entire dataset without page limits (the row limit for the calculation is chosen in the panel: 1M by default, 10M, 50M, 100M or ALL): `total_count`, `null_count`, `null_percent`, `unique_count`, `min`, `max`, `avg`, `sum`.
* **Clipboard Exports**:
  * **Copy as Image**: Copy visible table cells as a clean Retina PNG image for messengers or documentation.
  * `Ctrl + Shift + E` — Copy the active result page formatted as Tab-Separated Values (TSV) for pasting into Google Sheets or Excel.

---

## 8. Settings, UI Customization & Synchronization

Open the Settings modal via `Ctrl + ,` or the gear icon in the top header.

### DuckDB Engine Settings (Memory, Threads, Init SQL, Extensions)
When DuckDB options are enabled in **UI Elements**, additional connection parameters are available:
* **Memory Limit**: Memory allocation ceiling for DuckDB (defaults to `8GB`).
* **Temp Directory**: Working directory for disk spillover when querying large datasets (defaults to `./tmp`).
* **Extensions Dir**: Directory for storing and auto-loading local extensions (defaults to `./extensions`).
* **Threads**: CPU worker threads (`0` = automatic detection of all available cores).
* **Init SQL Script (`duckDbInitSql`)**: Startup SQL executed automatically on every connection (e.g. `LOAD 'spatial';` or timezone setup `SET TimeZone='UTC';`).
* **allow_unsigned_extensions**: Toggle allowing installation and execution of community extensions.
* Engine parameters are applied when the connection to the database is made: changed values take effect on the next connection, not immediately in the open session.
* The default paths (`./tmp`, `./extensions`) are relative to the application's working directory; if the application is installed in a protected folder, set absolute paths. The application does not show errors in these parameters or in Init SQL: if an extension did not load, run the script manually in the editor to see the error.

#### Loading Custom DuckDB Extensions:
* Download or compile binary `.duckdb_extension` files for your platform.
* Place them into the folder designated by **Extensions Dir** (defaults to `./extensions`), or extract your extensions archive directly to disk.
* Check the **`allow_unsigned_extensions`** option if the binaries are not officially signed by DuckDB Labs.
* In the **Init SQL Script** field, specify the load directive: `LOAD 'extension_name';` (e.g. `LOAD 'spatial';` or `LOAD 'httpfs';`). The extension will automatically be initialized on startup.
* A categorized directory of tested official and community extensions is available in: [**docs/extension_list.md**](./extension_list.md).

### Custom Autocomplete & Quick Actions
* **Autocomplete Templates**: The **Formats** tab allows adding, editing, and deleting custom SQL snippets and macros that appear in the editor's autocomplete dropdown.
* **Quick Actions**: Template actions displayed in the schema tree context menu (e.g., "Duplicate rows", "Copy table", "Export to Parquet"). They support the `{table}` placeholder for dynamic substitution.
* **Schema and files**: the database-icon button opens a panel with a file tree at the bottom (folders are read when expanded; size shows as a badge and in the tooltip). Drag a file into the editor to insert its path in single quotes. On desktop, double-click opens text files (`sql, md, txt, py, sh, yml, yaml, toml, ini, log`) in a tab and Office/PDF documents in the external app. The root is set in Settings ("File tree root folder"), otherwise the open DB's folder, then the home folder. Browser and mobile builds show the DuckDB-WASM virtual file system list (drag only). The list refreshes via the button and when the window regains focus (at most once per 10 s); `Ctrl + R` refreshes only the database schema. Above the tree are a search box and three sort buttons (by name, by modified date, by size; clicking again reverses the direction, folders always come first; the choice is remembered). Search filters only what is already loaded: it does not expand folders or read the disk, but folders that contain a match are shown expanded. On desktop, right-clicking a file or folder opens a menu: "Open with…" (files only; Windows and macOS), "Show in file manager", "Rename" (in place; Enter or leaving the field applies, Esc cancels) and "Delete (move to trash)" — to the OS trash, without confirmation. A file or folder can be dragged into another folder of the tree (dropping on a file moves it into that file's folder; dropping on empty space in the list moves it to the root folder); the target is highlighted as on hover. If the move is impossible (a folder dropped into itself or a subfolder, the name is taken, another drive), the target flashes red for 1–2 seconds, nothing changes and no message appears; dropping into the same folder does nothing. Dragging a file into the editor still inserts its path; a folder inserts nothing. Open tabs follow a rename or move; a tab of a deleted file stays as unsaved.

### Custom Keyboard Shortcuts (Hotkeys)
The **Hotkeys** tab enables remapping all editor, tab, and graph shortcuts to match your preferred keybindings (DBeaver, DataGrip, VS Code). Click on any key binding button and press your desired shortcut.

### Workspace Auto-Synchronization (Workspace Sync Path)
The Desktop version (Tauri) provides background auto-synchronization across multiple machines:
1. In Settings, configure the sync path to a shared cloud folder (e.g. `D:\Dropbox\workspace.json` or `/Users/name/Cloud/lens_workspace.json`).
2. When launching the app, it reads the updated bundle if it is newer than the local state, while preserving machine-specific local hardware configurations.
3. The newer file wins: if the synchronized file was updated from another computer after your last synchronization, local changes are not written to it and are replaced with the file contents at the next launch. Vault secrets and the ClickHouse password are not included in the file.
4. Manual workspace backup and restoration are always accessible via the **Export** and **Import** buttons in the settings modal footer.

### Narrow Screens & Android
The narrow layout is switched on by window width (up to 767 px), not by platform, so it can be checked on desktop by narrowing the window.
* Either the editor or the graph is shown. **Visualize** and **Markdown** show the graph; to return to the editor use the "Show/hide editor panel" button in the graph header (it is always shown on a narrow screen).
* Headers and bottom bars are a single row scrolled by finger (no scrollbar): a button cut off at the edge means there are more buttons beyond it. The "Export" and "Connection" menus open under their buttons, and "Presets" opens as a bottom sheet.
* In the expanded editor the "Schema and files" panel slides in from the right: the database-icon button opens it, the cross in its header closes it. On a narrow screen, line wrapping is on by default and the graph minimap is hidden.
* The Settings, Template Library and Version History windows adapt to the width: settings tabs show icons only, the library and history have short titles, and history shows the version list above the code.
* The Android system Back button (app only) closes, in order: open menus and confirmations → windows (settings, library, history, connections, WASM file manager) → the selected cell → the result table in the expanded editor (first shrinking it, then hiding it); when there is nothing to close, the app is minimized. Back does not cancel a running query.
* A desktop window narrower than 768 px gets the same narrow layout.
