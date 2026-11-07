# Data and Security

Where the application stores data, what it sends over the network, and what protection the Vault provides. Русская версия: [DATA_AND_SECURITY.md](./DATA_AND_SECURITY.md).

## 1. Where data is stored

All data is stored locally, in the browser or WebView profile (desktop and Android), unencrypted except for the contents of the Vault.

### localStorage

| Key | Contents |
| :--- | :--- |
| `sql_visualizer_session_v2` | UI state: active tab, graph direction, theme, path of the open DuckDB database, ClickHouse connection parameters **without the password**, schema panel state. The `tabs` field in this record is a leftover from older versions and is not written: tab contents are stored in `sql_visualizer_tabs_session` |
| `sql_visualizer_tabs_session` | Tab contents (SQL, file name, modified flag). If localStorage overflows, tab texts move to IndexedDB `sql_visualizer_tabs_db` |
| `sql_visualizer_ui_visibility_v1` | UI and engine settings: page sizes, zoom, DuckDB parameters (memory, directories, threads), **Init SQL**, sync path |
| `sql_visualizer_hotkeys_v1`, `sql_visualizer_formatter_v1` | Hotkeys, formatter rules |
| `sql_quick_action_templates`, `sql_custom_autocomplete_templates` | Quick actions, autocomplete templates |
| `queryast_lens_excel_settings_v1`, `queryast_lens_excel_presets_v1` | Excel settings and presets |
| `sql_custom_snippets_v2`, `sql_custom_snippets_v2_migrated`, `sql_favorite_snippets_ids_v1`, `sql_deleted_snippets_ids_v1` | Old local copy of snippets (removed after migration to IndexedDB) and the migration marker, favorites, deleted |
| `app_lang` | Interface language |
| `sql_last_workspace_sync_time` | Time of the last workspace sync |
| `sessionStorage`: `sql_is_importing_session` | Internal flag used during import |

### IndexedDB

| Database | Contents | Limits |
| :--- | :--- | :--- |
| `sql_visualizer_results` | Last query result of each tab (table rows) | Removed for closed tabs |
| `SQL_VersionHistory_DB` | SQL version history (autosaves and manual snapshots) | Up to 500 automatic and 300 manual versions |
| `SQL_Snippets_DB` | Snippet library | — |
| `sql_visualizer_schema_cache` | Database schema cache | Entries older than 7 days are purged |
| `sql_visualizer_tabs_db` | Fallback tab storage | Used when localStorage overflows and for migration |
| `app_secure_vault_db` | Encrypted Vault secrets | Not part of export or sync |

### Files (desktop)

* The workspace sync file: the path from settings; if a folder is given, `sql_visualizer_workspace_sync.json` inside it. On desktop the file is written to a temporary `*.tmp` file in the same folder and then renamed, so an interrupted write (window closed, disk full) leaves the previous file intact; concurrent session saves run one after another.
* SQL files saved by the user; Excel reports (including those from `@excel_save`); Excel templates are read from the path in `@template` / `@template_values` (read only); ClickHouse `COPY TO` exports.
* DuckDB databases and temporary files: the `.duckdb` file and the `temp_directory` and `extension_directory` folders from settings.

## 2. What goes into export and workspace sync

The sync file and the manual export ("Export" in settings) contain:
* all localStorage keys **except** keys whose name contains `vault` or `secret`, and the internal `sql_last_workspace_sync_time` and `sql_is_importing_session`;
* up to 500 history versions and the snippets from IndexedDB.

Not included: Vault contents (stored in IndexedDB, not localStorage), the ClickHouse password (never saved), query results and the schema cache.

Consequences:
* **Init SQL and snippets are exported as plain text.** Do not put passwords, access keys or tokens in them (for example `CREATE SECRET … KEY_ID/SECRET`). Vault `{{NAME}}` substitution is not applied to Init SQL.
* Import preserves nondefault local DuckDB parameters: memory (other than `8GB`), temporary directory (other than `./tmp`), extension directory (other than `./extensions`), threads (other than `0`) and nonempty Init SQL. Nonempty sync and file-tree root paths are preserved too, as is the UI scale when set. Default DuckDB values can be replaced by imported values.
* The newer file wins; see the [User Guide](./USER_GUIDE_EN.md#workspace-auto-synchronization-workspace-sync-path) for details.
* The sync file lives in the folder you choose (for example a cloud-synced one). Protecting that folder is up to you.

### Import and save order

* Manual import checks the bundle envelope (`app`, numeric `version`, object `data`), clears localStorage and applies the data sequentially. The `app` check looks for the text `workspace bundle`, and the version is checked for a finite number; supported versions and all field contents are not strictly validated.
* Startup auto-import checks for `data` and `exportedAt`, compares the file timestamp with the last sync and applies data without first clearing localStorage. Both paths use `applyWorkspaceBundleSilently`.
* Import is not one transaction across localStorage and the IndexedDB databases; there is no automatic rollback on error. The temporary file protects sync-file writes, not the application of an import.
* The session is saved when the page becomes hidden, Android enters the background, the window closes and every 10 minutes. Tauri waits up to 2 seconds for asynchronous saving on close. `saveSessionTabs` errors are logged to the console and do not reject its returned Promise.

## 3. Vault (secret storage)

* Algorithms: PBKDF2-SHA256 (100,000 iterations) derives the key from the PIN; encryption is AES-256-GCM (Web Crypto API). All secrets are encrypted as one array in the `root_vault` record; a new random salt (16 bytes) and initialization vector (12 bytes) are generated on each encryption. The key is not exportable.
* PIN: digits only, at least 4. Without the PIN the data cannot be decrypted and **the PIN cannot be recovered** (you can only reset the Vault together with its secrets).
* Unlocking lasts for 12 hours after the PIN is entered. Expiry is checked on the next access to the Vault state (`isVaultUnlocked`); that check clears the in-memory state and blocks access. There is no separate cleanup timer, configurable duration or inactivity timer. Closing the application also locks the Vault. You can lock it manually with the button in the Vault section.
* Usage: `{{NAME}}` in SQL is replaced with the value right before execution; the tab, version history and snippets keep the `{{NAME}}` text. Allowed name characters: Latin letters, digits, `_`, `-`. Secrets with the `ch_` prefix are ClickHouse connection strings; they are offered as a list in the connection form.
* If the SQL contains `{{` while the Vault is locked (or not set up), the query is not executed — even if the query contains no secrets.

**What the Vault does not protect:**
* A 4–6 digit PIN can be brute-forced if an attacker obtains the IndexedDB database file, because the number of possible values is small. Use a long PIN.
* While the Vault is unlocked, secrets and the entered PIN are held in application memory. Expiry alone does not trigger cleanup; cleanup occurs on the next Vault-state check.
* After substitution the secret value becomes part of the query text sent to the database: it may appear in server logs (for example ClickHouse `system.query_log`), and a database error message may contain a fragment of the query.
* Init SQL, snippets, version history and query results are not encrypted.

## 4. Network

* The main network requests are to ClickHouse (over `http://` or `https://`; the password is sent in the `X-ClickHouse-Key` header, in plain text over `http://`) and the data sources your SQL queries access (`read_parquet('https://…')`, `httpfs`). The application's own code contains no analytics or telemetry calls.
* In development mode requests go to a local Express server (`server.ts`, binds to `0.0.0.0:3000`, CORS open to all). It is intended for local development only and must not be exposed to a network (there is no authentication).
* DuckDB-WASM normally loads local files from `public/duckdb`, copied during development startup and the build. If local bundle selection fails, the code tries a jsDelivr CDN bundle. DuckDB extension installation and autoloading can also contact extension repositories.
* Android: `cleartext: true` in `capacitor.config.json` allows HTTP connections (needed for ClickHouse without TLS).

## 5. Desktop permissions (Tauri)

`src-tauri/tauri.conf.json` grants the window broad permissions: `allowlist.all`, file read/write across the whole disk (`fs` scope `$HOME/**`, `/**`, `C:/**`…`F:/**`), HTTP to any address, and no content security policy (`csp`). The Rust commands `read_text_file` and `write_text_file` accept any path. The `list_dir` command returns the contents of any folder (for the file tree), and `open_path` launches in an external app only files whose extensions are on an allowlist (Office, PDF). The tree's context-menu commands accept any path: `rename_path` (rename within the folder; an existing file is never overwritten), `move_path` (move into another folder on the same drive; an existing entry is never overwritten), `trash_path` (move to the OS trash, not delete), `reveal_path` (show in the file manager) and `open_with` (system app chooser). Narrowing these permissions and enabling CSP are not currently done. In practice, code running in the interface has access to the user's files, so the interface is protected at the content level: Markdown and graph labels are sanitized with DOMPurify, SQL highlighting escapes text, and raw HTML is not executed.
