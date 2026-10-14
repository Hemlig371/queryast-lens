# QueryAST Lens

Cross-platform SQL Query Workbench and analytical database client (DuckDB, ClickHouse) with an AST graph visualizer and dependency highlighting.

### 📥 Downloads & Platforms

| Platform | Type / Arch | Package / Download |
| :--- | :--- | :--- |
| **Windows** | x64 | [Windows: Native Desktop (`.msi` / `.exe`)](https://github.com/Hemlig371/queryast-lens/releases/download/v8.0.0/QueryAST.Lens_8.0.0_x64-setup.exe) |
| **macOS** | Apple Silicon (arm64) | [macOS: Desktop (`.dmg`)](https://github.com/Hemlig371/queryast-lens/releases/download/v8.0.0/QueryAST.Lens_8.0.0_aarch64.dmg) |
| **Linux** | x86_64 / Wayland & X11 | [Linux: Standalone (`.AppImage` / `.deb`)](https://github.com/Hemlig371/queryast-lens/releases/download/v8.0.0/query-ast-lens_8.0.0_amd64.AppImage) |
| **Android** | APK (debug build) | [Android APK: Mobile Application (`.apk`)](https://github.com/Hemlig371/queryast-lens/releases/download/v8.0.0/QueryAST-Lens-v8.0.0-android.apk) |

<p align="center">
  <img src="https://github.com/user-attachments/assets/b6d62bb3-5282-4539-85f3-157314eab3a6" alt="Interactive AST & Data Lineage Graph" width="100%" />
</p>

📖 **Documentation:**
* [User Guide](docs/USER_GUIDE_EN.md)
* [Development & Build Guide](docs/CONTRIBUTING.md)
* [Tested DuckDB Extensions](docs/extension_list.md)
* [License (MIT)](LICENSE)

---

### Core Features

#### 💻 SQL Query Workbench & Editor
* **Multi-tab SQL Editor**: Syntax highlighting, Regex find & replace, schema-aware autocomplete, and custom hotkeys.
* **SQL Variables & Macros**: Parameterize your queries using local variables directly in SQL comments (e.g., `{{$limit=100}}`).
* **Engine Support**:
  * **DuckDB**: Direct disk file querying (`.duckdb`, `.parquet`, `.csv`, `.json`) on Desktop via C++/Rust IPC, or in-memory execution via WebAssembly (VFS).
  * **ClickHouse**: HTTP API integration with authentication, `COPY TO / COPY FROM` streaming pipelines, and cancellation of running queries. `COPY FROM` is not available on Android. Native Capacitor HTTP support for CORS bypass on Android. URI connection string parser with double-escaping support (`@@` / `::` for special characters in passwords).
* **DuckDB Init Script (`duckDbInitSql`)**: Custom startup SQL execution for PRAGMAs, timezone setup, and auto-loading extensions upon connecting.
* **Schema Introspection**: Object explorer for tables, views, and column data types with quick-injection context menus.
* **Encoding & Minification**: Support for opening scripts in Windows-1251 (ANSI) encoding, plus SQL compacting to a single line with automatic `--` to `/* */` comment conversion.

<p align="center">
  <img src="https://github.com/user-attachments/assets/234f87fd-bdb0-45d5-becc-77df3d97d15a" alt="QueryAST Lens SQL Workbench & Schema" width="100%" />
</p>

#### 📊 Data Profiling & Visualization
* **Result Inspector (DataStatsViewer)**: Table pagination, transposition (row ↔ column swap), and Cell Zoom detailed viewing.
* **Automated Column Statistics**: Offloaded metric calculations (Null %, distinct count, min/max, mean, stddev) run directly on the database side.
* **Interactive Filtering**: Filter application (`WHERE IS NULL` / `IS NOT NULL`) directly from data grid column headers.
* **Built-in Charts**: Bar (vertical / horizontal), line, and pie charts powered by Recharts, plus a column / category statistics list.
* **Copy Table as Image**: Copy query results to the clipboard as a PNG image.

<p align="center">
  <img src="https://github.com/user-attachments/assets/63819d3a-9fc6-466e-84a0-b6c2b8c12e5e" alt="Data Profiling, Column Statistics and Interactive Charts" width="100%" />
</p>

#### 📑 Excel Report Engine & Export
* **Excel (`.xlsx`) Exporter**: Auto-column width calculation, header styling, zebra striping, freeze panes, and native formula totals (`SUM`, `AVERAGE`, `COUNT`).
* **SQL-Driven Report Directives**: Configure Excel formatting directly inside SQL code comments using directives (`@preset`, `@sheet`, `@totals`, `@split`, `@group`, `@skip`, `@hide`, `@protect`, `@file`, `@group_cols`, `@group_hide`, and Markdown `#` / `##` titles).
* **Direct Desktop Saving**: Silent export directly to disk via `@excel_save: <path>` in Desktop mode without save dialogs.

#### 🌳 AST Visualization & Data Lineage
* **Interactive AST Graphs**: Parses SQL into abstract syntax trees with customizable layout orientation (Left-to-Right / Top-to-Bottom).
* **Data Lineage Tracing**: Selecting a node highlights everything upstream and downstream of it in the graph (tables, CTEs, subqueries, JOINs). Works on graph nodes within one query; there is no column-level lineage and no tracking between separate queries.
* **Diagram & Schema Exports**: Export node graphs to PNG, SVG, JPEG, JSON, Mermaid, Draw.io, and raw XML Schema formats.
* **Two-way Mermaid Support**: In addition to export, paste raw Mermaid diagrams (`graph TD; ...`) into the editor to visualize them directly as interactive node graphs.
* **Markdown Preview**: The **Markdown** button renders notes with tables, highlighted SQL blocks and ```` ```mermaid ```` diagrams (static SVG, openable as an interactive graph). Pure Mermaid text still opens as a graph.

#### 🛠️ Productivity, i18n & Security Vault
* **Snippets & Quick Actions**: Manage reusable SQL snippets with natural string sorting and clipboard copying. ZIP exports group snippets into virtual folders. Multi-statement pipeline execution via `-- @job` directive.
* **Encrypted Vault (AES-256 GCM)**: Client-side connection secret encryption using Web Crypto API with PIN-code protection; the vault stays unlocked for 8 hours after the PIN is entered. Supports dynamic macro substitution (`{{SECRET_NAME}}`) directly inside queries.
* **WASM VFS File Manager**: Visual GUI modal for DuckDB WebAssembly to drag-and-drop, inspect, delete, and upload `.parquet`, `.csv`, `.json`, and `.duckdb` files.
* **Workspace Synchronization**: Automatic background import/export of workspace sessions and tabs via a shared directory or cloud storage path (Dropbox, local NAS) in Desktop mode.
* **Version History & Schema Cache**: Automatic query snapshot tracking and IndexedDB schema caching with automated stale record cleanup.
* **Localization & UI Zoom**: Built-in interface language toggling (RU/EN) and adjustable UI scaling (70%–150%).

---

### Architecture & Tech Stack

* **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.
* **AST & Graph Engine**: `@xyflow/react` (React Flow), `dagre`, `node-sql-parser`.
* **Desktop Native Layer (Tauri / Rust)**: Direct C++/Rust IPC for DuckDB and async HTTP client (`tokio` / `reqwest`) for ClickHouse.
* **Storage & Encryption**: Web Crypto API (AES-256 GCM), IndexedDB, JSZip.

---

### Installation & OS Notes

#### macOS
If a security popup appears on launch, run in terminal:
```bash
xattr -cr /Applications/"QueryAST Lens.app"
```

#### Linux (AppImage & libwayland conflicts)
On some Linux distributions with Wayland, bundled `libwayland-*.so` libraries inside the AppImage might conflict with host graphics drivers. If the application crashes on launch, extract the AppImage, remove bundled Wayland libraries so it uses system ones, and run:
```bash
# 1. Extract the AppImage
./QueryAST-Lens.AppImage --appimage-extract

# 2. Remove bundled libwayland libraries
rm -f squashfs-root/usr/lib/libwayland-*.so*

# 3. Launch from extracted folder
./squashfs-root/AppRun
```

---

## Description (RU)

Локальный кроссплатформенный SQL Workbench и клиент аналитических баз данных (DuckDB, ClickHouse) с графом AST и подсветкой зависимостей.

Приложение доступно в виде десктоп-клиента (Tauri / Rust), мобильного приложения (Android / Capacitor - WASM).

📖 **Документация:**
* [Руководство пользователя](docs/USER_GUIDE.md)
* [Руководство по разработке и сборке](docs/CONTRIBUTING.md)
* [Справочник расширений DuckDB](docs/extension_list.md)
* [Лицензия (MIT)](LICENSE)

---

### Ключевые возможности

#### 💻 SQL Query Workbench & Редактор
* **Многовкладочный SQL-редактор**: Подсветка синтаксиса, поиск/замена с поддержкой регулярных выражений, автодополнение на основе кэша схем БД и настраиваемые горячие клавиши.
* **Локальные SQL-переменные**: Поддержка макросов в комментариях. Подстановка значений вида `{{$limit=100}}` перед выполнением запроса.
* **Локальный и сетевой движки**:
  * **DuckDB**: Прямое чтение дисковых файлов (`.duckdb`, `.parquet`, `.csv`, `.json`) в десктоп-версии через C++/Rust IPC без ограничений памяти WASM или работа в браузере через WebAssembly (VFS).
  * **ClickHouse**: Подключение по HTTP API с поддержкой авторизации, потоковых операций `COPY TO / COPY FROM` и отмены долгих запросов. `COPY FROM` на Android недоступен. Нативная поддержка Capacitor HTTP для обхода CORS на мобильных устройствах. Парсер URI-строк подключения с двойным экранированием спецсимволов (`@@` / `::` в паролях).
* **Скрипт инициализации DuckDB (`duckDbInitSql`)**: Возможность задания стартовых PRAGMA-параметров, часовых поясов и подключения расширений при старте сессии.
* **Управление схемой БД (Introspection)**: Браузер таблиц, представлений и колонок с типами данных. Включает контекстное меню для быстрой вставки имен объектов в редактор.
* **Кодировки и сжатие**: Открытие скриптов в кодировке Windows-1251 (ANSI), а также безопасное сжатие SQL в одну строку с автоматической конвертацией однострочных комментариев `--` в блочные `/* */`.

#### 📊 Профилирование и анализ данных (Data Visualizer)
* **Инспекция результатов (DataStatsViewer)**: Просмотр таблиц с поддержкой пагинации, транспонирования (строки ↔ колонки) и режима детального просмотра ячеек (Cell Zoom).
* **Автоматический расчёт статистики**: Вычисление метрик колонок (Null %, уникальные значения, min/max, среднее, стандартное отклонение) с переносом вычислений на сторону базы данных.
* **Быстрые интерактивные фильтры**: Применение условных фильтров (`WHERE IS NULL` / `IS NOT NULL`) прямо из заголовков таблицы результатов.
* **Визуализация результатов**: Столбчатые (вертикальные / горизонтальные), линейные и круговые диаграммы на основе результатов запроса, а также список статистики по колонкам и категориям.
* **Копирование таблицы как изображения**: Копирование данных в буфер обмена в виде готового PNG-изображения высокого разрешения (Retina 2x).

#### 📑 Движок отчётов Excel & Экспорт
* **Экспорт в Excel (`.xlsx`)**: Поддержка автоматического подбора ширины колонок, закрепления областей, стилизации заголовков и нативных формул итогов (`SUM`, `AVERAGE`, `COUNT`).
* **Управление отчётами через SQL-директивы**: Конфигурация выгрузки прямо в SQL-комментариях с помощью спец-тегов (`@preset`, `@sheet`, `@totals`, `@split`, `@group`, `@skip`, `@hide`, `@protect`, `@file`, `@group_cols`, `@group_hide` и Markdown-заголовков `#` / `##`).
* **Прямое сохранение на диск**: Экспорт отчёта напрямую по заданному пути (`@excel_save: <путь>`) в Desktop-версии в обход диалоговых окон.

#### 🌳 AST-Визуализация & Data Lineage
* **Интерактивный граф запроса**: Разбор SQL-запросов на узлы AST (`node-sql-parser`) и построение интерактивных графов (`@xyflow/react`) с возможностью переключения ориентации (слева-направо / сверху-вниз).
* **Отслеживание Data Lineage**: При выборе узла подсвечивается всё, что находится выше и ниже него по графу (таблицы, CTE, подзапросы, JOIN). Работает по узлам графа внутри одного запроса; построчного (по колонкам) lineage и связей между отдельными запросами нет.
* **Экспорт графов и схем**: Сохранение диаграмм в форматы PNG, SVG, JPEG, JSON, Mermaid, Draw.io и сырую схему XML Schema.
* **Двусторонний Mermaid**: Помимо экспорта, поддержка визуализации вставленных в редактор Mermaid-диаграмм (`graph TD; ...`) в виде интерактивного графа узлов.
* **Markdown-предпросмотр**: кнопка **Markdown** показывает заметки с таблицами, подсвеченными SQL-блоками и диаграммами ```` ```mermaid ```` (статичный SVG, можно открыть как интерактивный граф). Чистый Mermaid по-прежнему открывается как граф.

#### 🛠️ Инструменты продуктивности и хранилище
* **Библиотека сниппетов и действий (No-code Action Menu)**: Сохранение часто используемых запросов с поддержкой естественной алфавитной сортировки. Экспорт в ZIP распределяет сниппеты по папкам ("Избранное", "Jobs"). Поддержка многокомандных пайплайнов выполнения через директиву `-- @job`.
* **Защищённый Vault (AES-256 GCM)**: Шифрование параметров подключения и секретов в браузере с защитой пин-кодом; после ввода PIN хранилище остаётся разблокированным 8 часов. Подстановка секретов в SQL-запросы в формате `{{SECRET_NAME}}`.
* **Файловый менеджер WASM VFS**: Графический интерфейс для управления виртуальной файловой системой DuckDB WASM (Drag & Drop загрузка, инспекция и удаление `.parquet`, `.csv`, `.json`, `.duckdb`).
* **Синхронизация рабочего пространства**: Фоновый автоматический обмен сессиями, вкладками и настройками через общий файл/папку (Dropbox, сетевой диск) в десктоп-версии (Tauri).
* **История версий и кэш**: Автоматическое сохранение снимков запросов и кэширование схем в IndexedDB с процедурами автоочистки устаревших записей.
* **Мультиязычный интерфейс и зум**: Поддержка переключения языков интерфейса (RU/EN) и масштабирование интерфейса (70%–150%).

---

### Архитектура и стек технологий

* **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.
* **AST & Graph Engine**: `@xyflow/react` (React Flow), `dagre` (авто-лейаут графов), `node-sql-parser`.
* **Desktop Native Layer (Tauri / Rust)**: Direct C++/Rust IPC для DuckDB и асинхронный HTTP-клиент (tokio/reqwest) для ClickHouse.
* **Storage & Encryption**: Web Crypto API (AES-256 GCM), IndexedDB, JSZip.

---

### Примечания по установке и запуску (ОС)

#### macOS
Если при первом запуске десктоп-версии блокируется запуск системой безопасности, выполните в терминале:
```bash
xattr -cr /Applications/"QueryAST Lens.app"
```

#### Linux (AppImage и конфликты с libwayland)
В некоторых дистрибутивах Linux с графической средой Wayland встроенные в AppImage библиотеки `libwayland-*.so` могут конфликтовать с системными драйверами графики. Если приложение аварийно завершается при запуске, распакуйте AppImage, удалите встроенные библиотеки Wayland (чтобы приложение использовало системные) и запустите:
```bash
# 1. Распаковка AppImage
./QueryAST-Lens.AppImage --appimage-extract

# 2. Удаление встроенных библиотек libwayland
rm -f squashfs-root/usr/lib/libwayland-*.so*

# 3. Запуск из распакованной директории
./squashfs-root/AppRun
```

