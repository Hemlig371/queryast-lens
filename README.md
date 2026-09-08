# QueryAST Lens

QueryAST Lens is a cross-platform SQL Query Workbench and analytical database client (DuckDB, ClickHouse) with an integrated AST (Abstract Syntax Tree) visualizer and Data Lineage engine.

Available as a native Desktop Client (Tauri / Rust), Mobile App (Android / Capacitor - WASM).

---

### Core Features

#### 💻 SQL Query Workbench & Editor
* **Multi-tab SQL Editor**: Syntax highlighting, Regex find & replace, schema-aware autocomplete, and custom hotkeys.
* **Engine Support**:
  * **DuckDB**: Direct disk file querying (`.duckdb`, `.parquet`, `.csv`, `.json`) on Desktop via C++/Rust IPC, or in-memory execution via WebAssembly (VFS) in browser.
  * **ClickHouse**: HTTP API integration with authentication, `COPY TO / COPY FROM` streaming pipelines, and server-side query cancellation tokens.
* **DuckDB Init Script (`duckDbInitSql`)**: Custom startup SQL execution for PRAGMAs, timezone setup, and auto-loading extensions upon connecting.
* **Schema Introspection**: Object explorer for tables, views, and column data types with quick-injection context menus.

#### 📊 Data Profiling & Visualization
* **Result Inspector (DataStatsViewer)**: Table pagination, transposition (row ↔ column swap), and Cell Zoom detailed viewing.
* **Automated Column Statistics**: Offloaded metric calculations (Null %, distinct count, min/max, mean, stddev) run directly on the database side.
* **Interactive Filtering**: Instant filter application (`WHERE IS NULL` / `IS NOT NULL`) directly from data grid column headers.
* **Built-in Charts**: Histogram, line, bar, and pie chart rendering powered by Recharts.

#### 📑 Excel Report Engine & Export
* **Excel (`.xlsx`) Exporter**: Auto-column width calculation, header styling, zebra striping, freeze panes, and native formula totals (`SUM`, `AVERAGE`, `COUNT`).
* **SQL-Driven Report Directives**: Configure Excel formatting directly inside SQL code comments using directives (`@preset`, `@sheet`, `@totals`, `@split`, `@group`, `@skip`, `@protect`).
* **Archive Exports**: Batch export packaging using JSZip.

#### 🌳 AST Visualization & Data Lineage
* **Interactive AST Graphs**: Parses SQL into abstract syntax trees with customizable layout orientation (Left-to-Right / Top-to-Bottom).
* **Data Lineage Tracing**: Dynamic relationship highlighting between source tables, CTEs, columns, and aliases across complex queries.
* **Diagram Exports**: Export node graphs to PNG, SVG, JPEG, JSON, Mermaid, and Draw.io formats.

#### 🛠️ Productivity, i18n & Security Vault
* **Snippets & Quick Actions**: Manage reusable SQL snippets with natural string sorting and clipboard copying.
* **Encrypted Vault (AES-256 GCM)**: Client-side connection secret encryption using Web Crypto API with pin-code protection and auto-lock timeouts.
* **Version History & Schema Cache**: Automatic query snapshot tracking and IndexedDB schema caching with automated stale record cleanup.
* **Localization (i18n)**: Built-in interface language toggling (RU/EN).

---

### Architecture & Tech Stack

* **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.
* **AST & Graph Engine**: `@xyflow/react` (React Flow), `dagre`, `node-sql-parser`.
* **Desktop Native Layer (Tauri / Rust)**: Direct C++/Rust IPC for DuckDB and async HTTP client (`tokio` / `reqwest`) for ClickHouse.
* **Storage & Encryption**: Web Crypto API (AES-256 GCM), IndexedDB, JSZip.

---

### Installation & macOS Notes

For macOS Desktop build if a security popup appears on launch, run in terminal:
```bash
xattr -cr /Applications/"QueryAST Lens.app"
```

---

## Description (RU)

Локальный кроссплатформенный SQL Workbench и клиент аналитических баз данных (DuckDB, ClickHouse) с встроенным модулем визуализации AST (Abstract Syntax Tree) и Data Lineage.

Приложение доступно в виде десктоп-клиента (Tauri / Rust), мобильного приложения (Android / Capacitor).

---

### Ключевые возможности

#### 💻 SQL Query Workbench & Редактор
* **Многовкладочный SQL-редактор**: Подсветка синтаксиса, поиск/замена с поддержкой регулярных выражений, автодополнение на основе кэша схем БД и настраиваемые горячие клавиши.
* **Локальный и сетевой движки**:
  * **DuckDB**: Прямое чтение дисковых файлов (`.duckdb`, `.parquet`, `.csv`, `.json`) в десктоп-версии через C++/Rust IPC без ограничений памяти WASM или работа в браузере через WebAssembly (VFS).
  * **ClickHouse**: Подключение по HTTP API с поддержкой авторизации, потоковых операций `COPY TO / COPY FROM` и сервер-отмены долгих операций.
* **Скрипт инициализации DuckDB (`duckDbInitSql`)**: Возможность задания стартовых PRAGMA-параметров, часовых поясов и подключения расширений при старте сессии.
* **Управление схемой БД (Introspection)**: Браузер таблиц, представлений и колонок с типами данных. Включает контекстное меню для быстрой вставки имен объектов в редактор.

#### 📊 Профилирование и анализ данных (Data Visualizer)
* **Инспекция результатов (DataStatsViewer)**: Просмотр таблиц с поддержкой пагинации, транспонирования (строки ↔ колонки) и режима детального просмотра ячеек (Cell Zoom).
* **Автоматический расчёт статистики**: Вычисление метрик колонок (Null %, уникальные значения, min/max, среднее, стандартное отклонение) с переносом вычислений на сторону базы данных.
* **Быстрые интерактивные фильтры**: Применение условных фильтров (`WHERE IS NULL` / `IS NOT NULL`) прямо из заголовков таблицы результатов.
* **Визуализация результатов**: Построение гистограмм, линейных, столбчатых и круговых диаграмм на основе результатов запроса.

#### 📑 Движок отчётов Excel & Экспорт
* **Экспорт в Excel (`.xlsx`)**: Поддержка автоматического подбора ширины колонок, закрепления областей, стилизации заголовков и нативных формул итогов (`SUM`, `AVERAGE`, `COUNT`).
* **Управление отчётами через SQL-директивы**: Конфигурация выгрузки прямо в SQL-комментариях с помощью спец-тегов (`@preset`, `@sheet`, `@totals`, `@split`, `@group`, `@skip`, `@protect`).
* **Пакетная архивация**: Поддержка группового экспорта и формирования ZIP-архивов с отчетами (`jszip`).

#### 🌳 AST-Визуализация & Data Lineage
* **Интерактивный граф запроса**: Разбор SQL-запросов на узлы AST (`node-sql-parser`) и построение интерактивных графов (`@xyflow/react`) с возможностью переключения ориентации (слева-направо / сверху-вниз).
* **Отслеживание Data Lineage**: Динамическая подсветка связей между исходными таблицами, промежуточными CTE, колонками и алиасами.
* **Экспорт графов**: Сохранение диаграмм в форматы PNG, SVG, JPEG, а также в структурированный JSON, Mermaid и Draw.io.

#### 🛠️ Инструменты продуктивности и хранилище
* **Библиотека сниппетов и действий (No-code Action Menu)**: Сохранение часто используемых запросов с поддержкой естественной алфавитной сортировки и быстрой вставкой.
* **Защищённый Vault (AES-256 GCM)**: Шифрование параметров подключения и секретов в браузере с защитой пин-кодом и автоблокировкой по таймеру.
* **История версий и кэш**: Автоматическое сохранение снимков запросов и кэширование схем в IndexedDB с процедурами автоочистки устаревших записей.
* **Мультиязычный интерфейс (i18n)**: Поддержка переключения языков интерфейса (RU/EN) с динамическим переводом компонентов.

---

### Архитектура и стек технологий

* **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.
* **AST & Graph Engine**: `@xyflow/react` (React Flow), `dagre` (авто-лейаут графов), `node-sql-parser`.
* **Desktop Native Layer (Tauri / Rust)**: Direct C++/Rust IPC для DuckDB и асинхронный HTTP-клиент (tokio/reqwest) для ClickHouse.
* **Storage & Encryption**: Web Crypto API (AES-256 GCM), IndexedDB, JSZip.
