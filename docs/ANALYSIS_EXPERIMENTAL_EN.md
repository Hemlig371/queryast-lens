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

Select a panel/chart and choose **View SQL → Copy SQL**. Paste and execute the entire
script in the Lens editor on the same database. Lens does not edit the editor for
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
Native IPC uses the existing Tauri connection/mutex with a per-response limit of
100,000 rows and 32 MiB, not a source-size limit. The transport changes no SET
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
component sources are unchanged. HTML, PNG and configuration delegate to the SDK.

## Interface and HTML follow-up

Perspective defaults to 14 px. The Lens toolbar and SQL dialog use the Lens UI
size and scale; the Viewer has an outer gutter. Export/copy menus are constrained
to the visible area and scroll, including with Lens UI zoom. Stock HTML requests
a default source view; the scoped adapter supplies source columns for ungrouped
views without a projection. SDK sources and the shared connection are unchanged.

WASM disconnect closes the connection but retains the database instance in the
current page. Reload the browser page to start with a clean memory database.
Restarting the dev server alone does not destroy WASM in an already open page.
