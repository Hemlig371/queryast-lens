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
* On import to another computer, local values of DuckDB parameters (memory, directories, threads, Init SQL), the sync path and the UI scale are preserved if they are set.
* The newer file wins; see the [User Guide](./USER_GUIDE_EN.md#workspace-auto-synchronization-workspace-sync-path) for details.
* The sync file lives in the folder you choose (for example a cloud-synced one). Protecting that folder is up to you.

## 3. Vault (secret storage)

* Algorithms: PBKDF2-SHA256 (100,000 iterations) derives the key from the PIN; encryption is AES-256-GCM (Web Crypto API). A random salt (16 bytes) and initialization vector (12 bytes) are generated for each entry. The key is not exportable.
* PIN: digits only, at least 4. Without the PIN the data cannot be decrypted and **the PIN cannot be recovered** (you can only reset the Vault together with its secrets).
* Unlocking: after the PIN is entered, decrypted secrets are kept in memory for 12 hours, then the Vault locks. There is no setting for the duration and no inactivity timer. Closing the application also locks the Vault. You can lock it manually with the button in the Vault section.
* Usage: `{{NAME}}` in SQL is replaced with the value right before execution; the tab, version history and snippets keep the `{{NAME}}` text. Allowed name characters: Latin letters, digits, `_`, `-`. Secrets with the `ch_` prefix are ClickHouse connection strings; they are offered as a list in the connection form.
* If the SQL contains `{{` while the Vault is locked (or not set up), the query is not executed — even if the query contains no secrets.

**What the Vault does not protect:**
* A 4–6 digit PIN can be brute-forced if an attacker obtains the IndexedDB database file, because the number of possible values is small. Use a long PIN.
* While the Vault is unlocked, secrets are held in application memory.
* After substitution the secret value becomes part of the query text sent to the database: it may appear in server logs (for example ClickHouse `system.query_log`), and a database error message may contain a fragment of the query.
* Init SQL, snippets, version history and query results are not encrypted.

## 4. Network

* The application contacts only the servers you configure: ClickHouse (over `http://` or `https://`; the password is sent in the `X-ClickHouse-Key` header, in plain text over `http://`) and the data sources your SQL queries access (`read_parquet('https://…')`, `httpfs`). The application's own code contains no analytics or telemetry calls.
* In development mode requests go to a local Express server (`server.ts`, port 3000, CORS open to all). It is intended for local development only and must not be exposed to a network (there is no authentication).
* Android: `cleartext: true` in `capacitor.config.json` allows HTTP connections (needed for ClickHouse without TLS).

## 5. Desktop permissions (Tauri)

`src-tauri/tauri.conf.json` grants the window broad permissions: `allowlist.all`, file read/write across the whole disk (`fs` scope `$HOME/**`, `/**`, `C:/**`…`F:/**`), HTTP to any address, and no content security policy (`csp`). The Rust commands `read_text_file` and `write_text_file` accept any path. The `list_dir` command returns the contents of any folder (for the file tree), and `open_path` launches in an external app only files whose extensions are on an allowlist (Office, PDF). The tree's context-menu commands accept any path: `rename_path` (rename within the folder; an existing file is never overwritten), `move_path` (move into another folder on the same drive; an existing entry is never overwritten), `trash_path` (move to the OS trash, not delete), `reveal_path` (show in the file manager) and `open_with` (system app chooser). Narrowing these permissions and enabling CSP are not currently done. In practice, code running in the interface has access to the user's files, so the interface is protected at the content level: Markdown and graph labels are sanitized with DOMPurify, SQL highlighting escapes text, and raw HTML is not executed.

## 6. Recommendations

1. Keep secrets in the Vault (`{{NAME}}`), not in SQL text, Init SQL or snippets.
2. Use a long, numeric PIN, and remember it cannot be recovered.
3. Sync the workspace to a private folder; the file contains your queries, snippets and history.
4. Use `https://` for ClickHouse.
5. Open SQL files and Markdown only from trusted sources.
