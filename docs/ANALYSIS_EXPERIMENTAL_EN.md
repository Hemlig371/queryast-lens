# Exploring data with Perspective (experimental)

Choose **Explore** from a physical DuckDB table's context menu. Perspective fills
the workspace; use its own controls for pivots, filters, aggregates, expressions
and charts. Sources use the existing Desktop/Tauri or WASM (Web/Android) connection.
Express/DuckDB and ClickHouse are not supported by this mode. Prepare a physical
table in the editor first; arbitrary SQL, VIEW and TEMP sources are out of scope.

## Navigation and state

**Back to editor** hides the live Viewer and preserves its in-memory state.
Exploring the same table resumes it; choosing another table replaces it. **Close exploration**
releases its Viewer/client resources through Perspective APIs, keeping the source
and shared connection. Reconnecting, including to the same file, closes exploration
before replacing the connection. Android Back returns to the editor.

**Refresh** rereads the source and restores the in-memory workspace, including its
panels. Refresh after editing source data. If a changed schema invalidates the
configuration, close exploration and reopen it. No persistent autosave is used:
restarting starts a clean sandbox; use Viewer exports to save work.

The Lens toolbar provides back, close, refresh and SQL actions. New Viewers default
to Pro Light/Pro Dark according to Lens; refresh retains manual Viewer settings.
The host inherits the Lens font. Closing shows a themed spinner only after a short
delay. Perspective code/WASM loads lazily on first use; modules remain cached.

## Replaying SQL

Select a panel/chart and choose **View SQL** to see its technical script.
**Copy SQL** copies that script. Execute it in the Lens editor on the same database. Lens does not edit the editor for
you. SQL captures the active View's construction/dependencies, expansion operations
and final SELECT for its entire result. Showing SQL does not export all data.
Temporary object names are isolated from the live Viewer; rerunning the same script
replaces only its own temporary tables.

SQL reproduces the slice and metrics, including chart data; chart type, styling and
axis labels belong to Viewer configuration. Grouping metadata columns can appear
in the result. Reproducing identical values requires the same unchanged source.
The editor's normal 500,000-row display limit is unchanged. Replay creates separate
`lens_replay_*` temporary tables; optional DROP commands follow as comments. Run
these separately after using the result. They do not belong to the live exploration.

## Architecture and limitations

Editor and Virtual Server share one DuckDB instance and connection. The source is
not preloaded into JavaScript; DuckDBHandler requests computed windows/results.
Native IPC uses the existing Tauri connection/mutex. The analysis transport has no
separate Lens row or byte cap. The normal editor result limit remains 500,000 rows.
Datagrid requests data windows; charts and exports can request large responses
and need sufficient resources. This does not guarantee protection against
out-of-memory failures. The transport changes no SET
options; existing connection Arrow compatibility settings remain in place.

- Perspective may lose BIGINT/DECIMAL precision even when IPC preserves it.
- Perspective controls are English; Lens controls support RU/EN.
- CSV/JSON/NDJSON/Arrow fetch pages but assemble the export in JS memory.
  HTML delegates to the stock Perspective SDK and exports the active panel with its
  data and configuration. It loads its runtime from a CDN and requires internet
  when opened. No DuckDB-WASM runtime is embedded by Lens. This is intended for small
  demonstrations; SQL expressions and engine-specific features require manual
  compatibility testing. It is not a full multi-panel workspace archive.
- LZ4/ZSTD compress actual Arrow IPC buffers for the View, full source or selected
  region, without recomputing data or schema. Independent PyArrow verifies output.
  Full support for every Viewer feature has not been established; capabilities
  depend on the DuckDB Virtual Server.
- Pinned SDK internal APIs and date-header compatibility require revalidation
  before any Perspective upgrade. Web downloads do not validate Android/Desktop.

## Installation and verification

Use Node.js 22+ and `npm ci`. `.npmrc` retains the existing DuckDB-WASM prerelease
against Perspective's stable peer range. Explicit `react-is` 19.3.1 supplies the
existing Recharts peer skipped by this installation mode. Perspective
client/server/viewer/datagrid/charts are pinned to 5.8.0; JS Arrow is 17.0.0.
Rust `arrow-ipc` 58 shares the Arrow family of pinned duckdb-rs 1.10505.0.
lz4js 0.2.0 and @bokuweb/zstd-wasm 0.0.27 provide lazy IPC codecs; flatbuffers
24.12.23 is now explicit, retaining its existing locked version. Existing dependency
versions are unchanged. predev/prestart/prebuild/pretest:analysis copy the ZSTD
WASM asset only; it loads lazily when ZSTD export is requested.

Run `npm run lint`, `npm run test:analysis`, `npm run test:analysis-sql` and
`npm run build` (Web only). Existing `npm test` remains separate. SQL tests compare
filter/average/count with reference SQL, replay twice in the shared connection,
and cover dates, splits, expand/collapse and 730 columns.

The **Analysis native Arrow** workflow runs for relevant pushes/PRs and manually.
It compiles Tauri without a release build, tests native IPC types/limits/DDL/empty
results, prepares SDK SQL like the editor, and decodes actual Rust IPC using JS
Arrow 17, comparing results with WASM. Passing CI still requires manual Tauri and
Android testing for UI/platform acceptance.

The **Analysis export compatibility** workflow verifies compressed IPC via PyArrow,
then opens stock HTML as file:// in a fresh online browser context, comparing the
active panel grouping, filters and metrics. CDN availability is required. The npm
Viewer sources are unchanged; the DuckDBHandler patch is documented below.
HTML, PNG and configuration delegate to the SDK.

## Interface and HTML follow-up

Perspective defaults to 14 px. The Lens toolbar and SQL dialog use the Lens UI
size and scale; the Viewer has an outer gutter. Export/copy menus are constrained
to the visible area and scroll, including with Lens UI zoom. Stock HTML requests
a default source view; the scoped adapter supplies source columns for ungrouped
views without a projection. The Viewer and shared connection are unchanged; see the DuckDBHandler patch below.

WASM disconnect closes the connection but retains the database instance in the
current page. Reload the browser page to start with a clean memory database.
Restarting the dev server alone does not destroy WASM in an already open page.

The first panel of a new exploration uses the table name; refresh preserves a
manual rename. HTML keeps the stock SDK document and the filename selected in
the menu. Back/source/SQL sit on the left; messages/refresh/close sit on the right.
The Viewer border is removed; its gutter follows the active panel theme. Menu
observers do not watch grid cell changes during scrolling. A blank New Column
draft validates inline without executing empty SQL. `countif` is offered only
for BOOLEAN; use `count` for text values. DuckDB expressions require separate
compatibility checks when replayed by the stock HTML's built-in Perspective engine.

## HTML replay and wide group headers

HTML still comes from the stock SDK with full source data and active panel config.
Lens repairs only the pinned 5.8 bootstrap: register the embedded table under its
configured name, then await client loading and panel restoration in order. This
preserves pivots/filters/metrics rather than falling back to a flat table. Unknown
SDK templates fail explicitly. CDN internet remains required; no DuckDB runtime
is embedded. Cross-engine expression compatibility still needs validation.

Initial measured widths use regular-table's public `addStyleListener`, `getMeta`,
`saveColumnSizes` and `restoreColumnSizes` APIs. No internal fields/methods are
patched. Manual widths remain unrestricted. The subscription is released on
plugin removal and exploration close.

Export CI also compares wide-label scrolling in plain and Lens containers and
writes grid-scroll.json. The actual installed planning algorithm is tested locally;
full browser and platform acceptance remains required.

## Verified HTML and chart scope

HTML exports the full source and active Datagrid configuration. Only the verified
5.8 bootstrap correction remains: name the embedded table as configured and await
load/restore in order. Extra plugin-registry waits, flush/resize/animation-frame
calls and the custom error overlay added while investigating charts were removed.
SDK data/config are unchanged.

Charts in file:// HTML are outside confirmed support: CI recorded a renderer worker
load failure on blob:null. The SDK menu is unchanged; its HTML item on a chart does
not guarantee working replay. Use PNG to demonstrate a chart. Charts inside Lens
remain available.

PNG/TXT keep the stock plugin payload and selected filename. Required CI retains
Datagrid HTML config/metrics, X Bar/Y Line PNG from Lens, wide-group scrolling,
Arrow compression and separate native Arrow verification. HTML-chart tests were
removed from required acceptance to match this scope. The scroll probe loads as a
Vite module so package imports are transformed. CI artifacts retain diagnostics.

DuckDB expressions and some aggregates differ from the built-in HTML engine.
A field removed from an axis may still exist in expressions. Formulas/metrics are
not silently removed or substituted; SQL-expression/window HTML needs separate
validation and has no general compatibility guarantee.

Exports from the stock menu use the existing Lens file-saving path: the save dialog
and filesystem in Tauri, Filesystem/Share on Android, and downloads on Web.

## Exact SQL and unused code cleanup

One whole-SQL whitespace normalization operation is removed from DuckDBHandler
5.8.0: it changed string literals and quoted identifiers. The preparation script
`scripts/patch-perspective-duckdb.mjs` reproducibly patches the installed ESM
module before dev/start/build and analysis unit/SQL tests. It checks version
5.8.0 and a single expected template; unknown versions/templates fail explicitly.
The menu, Viewer, SQL model and dependency versions are unchanged.

SQL integration compares filters against reference SQL for repeated spaces,
tabs, newlines and apostrophes, and checks quoted column names and expressions
with significant spaces. The same fixtures feed native Arrow CI.
The unused ZSTD URL override and unused ResizeObserver notice filter/test are
removed. The ZSTD codec and lazy WASM loading remain available.

## Split By column ranges

Opening a split metric's settings computes MIN/MAX over its physical
`split-value|metric` columns in DuckDB. ROLLUP subtotal rows are excluded using
the SDK's grouping semantics; empty/all-NULL data produces an empty range.
Table values and Viewer settings are unchanged. Unsplit metrics keep the stock
handler. SQL integration fixtures also cover these ranges for native Arrow CI.

Internal temporary tables live in the shared DuckDB connection while their
View is alive. Returning to the editor retains the exploration; closing it
releases its Views. Returning does not automatically refresh the schema tree.
Refresh the tree or query
`SELECT database_name, schema_name, table_name FROM duckdb_tables() WHERE temporary AND NOT internal;`.

## SQL formatting and common labels

The technical script uses the Lens formatter and user preferences. Unsupported
formatter syntax retains the original script. Common RU labels use CSS variables;
context menu commands use a scoped content observer disposed on exploration close.
User names, SQL terms and long messages remain unchanged. Button captions fit their
text and export menu labels retain their left edge. Initial automatic column widths
are capped at 320 px (less on narrow screens). Manual widths take priority and may
exceed this default. Themes and settings panel dimensions remain unchanged.

The exploration uses Segoe UI 13 px with Arial/sans-serif fallback. JSON buttons
retain their full labels and occupy additional rows when needed.

Initial widths are applied after the SDK draw completes, followed by horizontal
viewport replanning. The browser check allows merged total headers and verifies
metric visibility. Technical SQL formatting retains the original SDK script if
the sequence of lexical tokens changes beyond whitespace, comments or unquoted
name case. Literals and quoted names must match exactly. Live queries are unchanged.
