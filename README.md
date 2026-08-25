# QueryAST Lens (SQL Visualizer)

## Описание (RU)

Техническое приложение для визуализации, форматирования и выполнения SQL-запросов. Предназначено для анализа структуры запросов (AST - Abstract Syntax Tree) в виде интерактивных графов, а также для прямого взаимодействия с аналитическими базами данных. Приложение работает как самостоятельный десктоп-клиент (на базе Tauri) и как мобильное приложение для Android (Capacitor).

### Ключевые возможности

* 🌳 **AST Графы и Mermaid**: Парсинг SQL-запросов (`node-sql-parser`) и генерация интерактивных графов (`@xyflow/react`). Поддержка двунаправленного синтаксиса Mermaid (`mermaidToGraph.ts`) для рендеринга.
* 🔗 **Отслеживание Data Lineage**: Динамическая подсветка связей (data lineage) при выборе узла. Позволяет быстро отследить зависимости между исходными таблицами, столбцами и алиасами в сложных запросах.
* 🗄️ **Интеграция с базами данных**: Подключение и выполнение запросов к DuckDB (локальный доступ к файлам в desktop-версии или in-memory через WASM) и ClickHouse (через HTTP API с поддержкой авторизации).
* 🗂️ **Управление схемой (Schema Management)**: UI для интроспекции баз данных (таблицы, представления, колонки, типы данных). Включает глубокую интеграцию с контекстным меню для быстрой вставки элементов.
* 📊 **Профилировщик данных (DataStatsViewer)**: Встроенная панель инспекции данных с автоматическим расчетом метрик столбцов, уникальных значений, типов данных и распределения (гистограммы, графики). Поддерживает пагинацию для быстрой отрисовки больших объемов данных.
* 🛠️ **Интерактивная модификация запросов**: Умные фильтры результатов (применение `WHERE IS NULL` / `IS NOT NULL` прямо из заголовков таблицы с автоматической синхронизацией SQL-кода и AST-графа).
* 📝 **Продвинутый SQL-редактор**: Многовкладочный редактор с полноэкранным режимом, подсветкой синтаксиса, автодополнением, автоформатированием (`sql-formatter`) и поддержкой нескольких кодировок (UTF-8, Windows-1251) для импорта локальных скриптов.
* ⚡️ **Меню быстрых действий (No-code)**: Визуальный дашборд для выполнения частых SQL-операций и сниппетов в один клик без ручного написания кода.
* 📚 **Библиотека сниппетов и шаблонов**: Менеджер для сохранения пользовательских SQL-сниппетов и встроенная библиотека аналитических пресетов.
* 🕰️ **История версий**: Полное отслеживание истории запросов с сохранением снапшотов версий и функцией быстрого отката (IndexedDB).
* 📤 **Возможности экспорта**: Экспорт визуальных графов в форматы изображений (PNG, SVG, JPEG) и структурные форматы (JSON, XML, Mermaid, Draw.io).
* 📑 **Генератор Excel-отчетов (Excel Engine)**: Полнофункциональный экспорт в `.xlsx` (`exceljs`) с кастомизацией: автоподбор ширины колонок, стилизация заголовков, "зебра", локализованное форматирование чисел и валют, закрепление областей и автоматические формулы итогов (SUM, AVERAGE, COUNT).
* 🔐 **Защищенное хранилище секретов (Vault)**: Аппаратно-ускоренное клиентское шифрование параметров подключения и секретов (AES-GCM Web Crypto API) с защитой мастер-паролем, in-memory безопасностью и настраиваемым таймером автоблокировки.
* 💾 **Кэш схемы БД и Офлайн-режим**: Кэширование метаданных схем и типов столбцов в IndexedDB, что обеспечивает мгновенный запуск приложения и работу автодополнения в офлайне без лишних запросов к БД.
* 📁 **Менеджер файлов WASM (VFS)**: Интерактивное графическое модальное окно для управления виртуальными файлами (Parquet, CSV, DuckDB) внутри in-memory файловой системы WebAssembly с поддержкой Drag-and-Drop.
* 🛡️ **Безопасное выполнение и надежность**: Встроенная поддержка отмены запросов (прерывание долгих операций). Изоляция компонентов (Редактор, Граф, Панель результатов) с помощью React Error Boundaries предотвращает падение всего приложения при ошибке в одном из модулей.
* 🎨 **Кастомизация UI и Workspace**: Тонкая настройка видимости элементов, глобальное масштабирование интерфейса (UI Scaling), переключение светлой/темной темы, локальное сохранение пользовательских сессий и полный экспорт/импорт состояния рабочего пространства (JSON).

### Архитектура и стек технологий

* **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.
* **Graph & AST Engine**: `@xyflow/react` (React Flow), `dagre` (авто-лейаут графов), `node-sql-parser` (AST парсер), `html-to-image`.
* **Desktop Native Layer (Tauri / Rust)**:
  * **Нативный движок DuckDB**: Прямая интеграция C/Rust биндингов в бекенде Tauri. Оптимизировано для высокопроизводительного чтения файлов (`.duckdb`, `.parquet`, `.csv`, `.json`) напрямую с диска без ограничений памяти WASM (zero-copy).
  * **ClickHouse HTTP & Streaming**: Высокопроизводительный асинхронный HTTP-клиент на базе Rust (`reqwest` и `tokio`), поддерживающий выполнение запросов, нативные потоковые пайплайны `COPY TO` / `COPY FROM` и серверные токены отмены (cancellation tokens).
* **Mobile Platform (Capacitor)**: Интеграция с нативными Android API для доступа к файловой системе и экспорта данных.
* **Web Runtime**: `@duckdb/duckdb-wasm` с использованием браузерных WebAssembly-воркеров для автономного выполнения в браузере.

### Ключевые архитектурные решения

* **Native DuckDB vs WASM Fallback**:
  * Десктоп-версия (Tauri) использует нативный C++ DuckDB через Rust IPC для многопоточного выполнения запросов к дисковым файлам.
  * Браузерная версия автоматически переключается на WebAssembly in-memory файловую систему (VFS).
* **Data Profiler & Advanced Visualizer (DataStatsViewer)**:
  * Интерактивные таблицы с поддержкой транспонирования (смена строк и колонок) и детальным просмотром ячеек (Cell Zoom).
  * Автоматический расчет метрик (количество значений, процент null, уникальные значения, min, max, mean, stddev).
* **Оптимизация производительности**:
  * **Делегирование профилирования БД**: Перенос статистических вычислений на сторону базы данных (нативный `SUMMARIZE` в DuckDB или агрегатные запросы ClickHouse), чтобы избежать блокировок UI-потока.
  * **128-bit Integer Safety**: Точная обработка типов `HugeInt` и `UBigInt` из DuckDB через прямую конвертацию в строки на стороне Rust.
  * **Локальные ETL-процессы**: Молниеносный импорт и экспорт данных (`COPY TO` / `COPY FROM`) в форматах Parquet и CSV напрямую через локальную файловую систему Tauri.
* **Кастомизация графов и AST**:
  * Переключение ориентации графа: слева-направо (`LR`) или сверху-вниз (`TB`).
  * Тонкое управление видимостью узлов для скрытия структурного шума (например, узлов `Sort`, `Limit`, `Join` в сложных деревьях).
* **Настройки SQL и шорткаты**:
  * Полностью настраиваемые клавиатурные сокращения (Hotkeys).
  * Детальные настройки форматирования SQL (регистр ключевых слов, стиль отступов, переносы строк).
* **Продвинутый экспорт в Excel (`excelExporter`)**:
  * Генерация высокоточных `.xlsx` книг с нативными формулами, сохранением числовых типов и корпоративными цветовыми палитрами.
* **Защищенное клиентское хранилище (Vault)**:
  * Надежное шифрование учетных данных ClickHouse и токенов на базе AES-GCM (256-bit) с использованием Web Crypto API.
  * Защита от попадания данных в открытый `localStorage` и поддержка настраиваемого времени автоблокировки.

### Плагины и расширения (Extensions)

* 🔌 **Список расширений**: В файле `extension_list.txt` находится перечень расширений DuckDB, которые были протестированы и гарантированно работают в приложении.
* 🛠️ **Интеграция сторонних систем**: Для быстрой выгрузки данных из нестандартных систем поддерживается связка расширения `shellfs` и утилиты [DB-Extractor-CLI](https://github.com/Hemlig371/DB-Extractor-CLI) (python + connectorx + polars) в качестве дополнительного инструмента.

---

## Description (EN)

A technical application for visualizing, formatting, and executing SQL queries. It is designed to analyze Abstract Syntax Tree (AST) query structures using interactive graphs and interface directly with analytical databases. The application runs as a standalone desktop client (powered by Tauri), and as a mobile application for Android (powered by Capacitor).

### Core Features

* 🌳 **AST Graph Visualization & Mermaid**: Parses SQL queries (`node-sql-parser`) to generate interactive, node-based abstract syntax trees (`@xyflow/react`). Features a bi-directional Mermaid syntax parser (`mermaidToGraph.ts`) for graph rendering.
* 🔗 **Interactive Data Lineage Tracing**: Dynamic highlighting of node relationships (data lineage) upon selection, enabling developers to quickly trace paths and dependencies between source tables, derived columns, and aliases across complex queries.
* 🗄️ **Database Integration**: Connects to and executes queries against DuckDB (local file access in desktop mode or in-memory via WASM) and ClickHouse (via HTTP API with credentials and custom settings).
* 🗂️ **Schema Management**: Database introspection UI to inspect tables, views, columns, and data types of the connected environment. Includes deep right-click context menu integration for rapid element injection.
* 📊 **Data & Statistics Viewer**: Built-in data inspection panel (DataStatsViewer) with automated calculation of column metrics, unique values, data types, and value distributions. Uses page-based chunking (Pagination) for fast rendering of large query results.
* 🛠️ **Interactive Query Modification**: Smart result filters (applying `WHERE IS NULL` / `IS NOT NULL` directly from data grid headers with automatic synchronization to the SQL code and AST graph).
* 📝 **Advanced SQL Editor**: Multi-tab SQL editor featuring a full-screen view mode, syntax highlighting, autocomplete, automatic code formatting (`sql-formatter`), and multi-encoding (UTF-8, Windows-1251) support for local script imports.
* ⚡️ **No-code Action Menu**: A visual action dashboard for executing common SQL pipelines and snippets with a single click, without requiring manual SQL writing.
* 📚 **SQL Snippets & Templates Library**: Manager for saving custom reusable SQL snippets alongside a built-in library of analytical query presets.
* 🕰️ **Version History**: Full query history tracking with saved version snapshots and fast rollback functionality (IndexedDB).
* 📤 **Export Capabilities**: Exports visual node graphs to image formats (PNG, SVG, JPEG) and structural/diagram formats (JSON, XML, Mermaid, Draw.io).
* 📑 **Advanced Excel Report Generator (Excel Engine)**: Full-featured `.xlsx` export (`exceljs`) with customizable styling: auto-fit column widths, styled header rows, zebra striping, localized number and currency formatting, freeze panes, and automatic formula totals (SUM, AVERAGE, COUNT).
* 🔐 **Secure Credentials Vault**: Hardware-backed client-side encryption for database connection parameters and secrets (AES-GCM Web Crypto API) featuring master password protection, in-memory security, and customizable auto-lock timeouts.
* 💾 **Database Schema Cache & Offline Mode**: IndexedDB metadata caching for database schemas and column types, enabling near-instant app startup and offline autocomplete capabilities without unnecessary database queries.
* 📁 **WASM Virtual File Manager**: Interactive graphical management modal for virtual files (Parquet, CSV, DuckDB) within the WebAssembly in-memory virtual filesystem (VFS) with Drag-and-Drop support.
* 🛡️ **Safe Query Execution & Reliability**: Built-in support for query cancellation (aborting long-running executions). Implementation of React Error Boundaries isolated by component (Editor, Graph, Results Panel) ensures that an unhandled crash in one module does not take down the entire application.
* 🎨 **UI Customization & Workspace Management**: Granular control over UI element visibility, Global UI scaling functionality, light/dark theme toggling, local persistence of user sessions and tabs, and full workspace state import/export (JSON).

### Architecture & Technology Stack

* **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.
* **Graph & AST Engine**: `@xyflow/react` (React Flow), `dagre` (graph auto-layout), `node-sql-parser` (AST parser), `html-to-image`.
* **Desktop Native Layer (Tauri / Rust)**:
  * **DuckDB Native Engine**: Direct C/Rust binding integration in the Tauri backend. Optimized for high-throughput zero-copy file querying (`.duckdb`, `.parquet`, `.csv`, `.json`) directly on disk without WASM memory constraints.
  * **ClickHouse HTTP & Streaming**: High-performance asynchronous HTTP client powered by Rust's `reqwest` and `tokio`, supporting query execution, native `COPY TO` / `COPY FROM` streaming pipelines, and server-side cancellation tokens for aborting queries in-flight.
* **Mobile Platform (Capacitor)**: Integration with native Android APIs for filesystem access and data exports.
* **Web Runtime**: `@duckdb/duckdb-wasm` utilizing browser WebAssembly workers for standalone in-browser execution.

### Key Architectural Highlights & Feature Deep-Dive

* **Native DuckDB Engine vs WASM Fallback**:
  * Desktop (Tauri) utilizes native C++ DuckDB via Rust IPC bindings for multi-threaded disk file querying.
  * Browser environment gracefully falls back to WebAssembly in-memory virtual filesystem (VFS).
* **Data Profiler & Advanced Visualizer (DataStatsViewer)**:
  * Interactive data tables with transposition support (swap rows and columns) and detailed Cell Zoom view.
  * Built-in visual chart modes including Column Histograms, Line Charts, Bar Charts, and Pie Charts (`Recharts`).
  * Automated statistical metrics calculation per field (value counts, null percentages, distinct counts, min, max, mean, stddev).
* **Performance Optimizations & Big Data Handling**:
  * **DB-Side Profiling Delegation**: Offloads statistical calculations to the database (DuckDB's native `SUMMARIZE` or targeted ClickHouse aggregate queries) to avoid UI-thread bottlenecks.
  * **128-bit Integer Safety**: Precise handling of `HugeInt` and `UBigInt` DuckDB types through direct string conversion in Rust, preventing precision loss in JSON serialization.
  * **Local ETL Workflows**: Blazing-fast importing and exporting of data (`COPY TO` / `COPY FROM`) using Parquet and CSV directly against the local filesystem via the Tauri desktop engine.
* **AST Layout & Graph Customization**:
  * Layout orientation switching between Left-to-Right (`LR`) and Top-to-Bottom (`TB`).
  * Granular node visibility controls to hide structural noise such as `Sort`, `Limit`, `Join` nodes for complex AST trees.
* **Custom Shortcuts & SQL Formatter Settings**:
  * Fully customizable keyboard shortcut (Hotkey) mappings.
  * Precise SQL formatting controls via `sql-formatter` (keyword case, indentation style, inter-statement line breaks).
  * Configurable Quick Action Templates for instant query snippet injection.
* **Advanced Excel Export Engine (`excelExporter`)**:
  * Generates high-fidelity `.xlsx` workbooks with native formula evaluation, preserved numeric data types, and custom enterprise color palettes.
  * Automatic column width calculations with safety caps, zebra-striping, and freeze-pane header pinning.
* **Secure Client-Side Secrets Vault**:
  * 256-bit AES-GCM encrypted persistence for ClickHouse connection secrets and sensitive credentials, preventing plaintext storage in `localStorage`.
  * Auto-lock timer and secure master password derivation.

### Extensions & Plugins

* 🔌 **Extension List**: The `extension_list.txt` file contains a list of DuckDB extensions that have been tested and verified to work within the application.
* 🛠️ **External Integrations**: For fast data extraction from non-standard systems, the `shellfs` extension can be combined with the [DB-Extractor-CLI](https://github.com/Hemlig371/DB-Extractor-CLI) utility (python + connectorx + polars) as an additional tool.

### Installation & Platform Notes

*for macos desktop app if security popup appears, run in terminal:*
`xattr -cr /Applications/"QueryAST Lens.app"`
