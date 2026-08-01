# QueryAST Lens (SQL Visualizer)

## Описание (RU)

Техническое приложение для визуализации, форматирования и выполнения SQL-запросов. Предназначено для анализа структуры запросов (AST - Abstract Syntax Tree) в виде интерактивных графов, а также для прямого взаимодействия с аналитическими базами данных. Поддерживает работу в веб-браузере (на базе WebAssembly) и как нативное десктопное приложение (на базе фреймворка Tauri).

### Основные возможности
* **Визуализация AST графов**: Синтаксический разбор SQL-запросов (`node-sql-parser`) и построение интерактивных узловых графов (`@xyflow/react`) с возможностью изменения ориентации и масштабирования.
* **Поддержка баз данных**: Подключение и выполнение запросов к DuckDB (работа с локальными файлами в десктоп-версии или in-memory через WASM) и ClickHouse (через HTTP API с поддержкой аутентификации и кастомных настроек).
* **Просмотр схемы данных (Schema Viewer)**: Интроспекция подключенных баз данных (отображение таблиц, представлений, колонок, типов данных и метаинформации).
* **Анализ результатов и статистика**: Встроенный модуль просмотра данных и статистики (DataStatsViewer) с расчетом метрик по колонкам, уникальным значениям, типам и распределению данных.
* **Многофункциональный SQL-редактор**: Многовкладочный редактор с поддержкой полноэкранного режима, подсветкой синтаксиса, функциями автодополнения (autocomplete) и автоматического форматирования кода (`sql-formatter`).
* **Библиотека шаблонов и фрагментов (SQL Snippets)**: Менеджер кастомных SQL-фрагментов и готовая библиотека пресетов аналитических запросов для быстрого использования.
* **История версий (Version History)**: Полное отслеживание изменений и сохраненные снимки запросов с возможностью быстрого отката (IndexedDB).
* **Экспорт данных и диаграмм**: Сохранение графов в графических форматах (PNG, SVG, JPEG) и структурных форматах (JSON, XML, Mermaid, Draw.io).
* **Кастомизация UI и управление рабочим пространством**: Гибкое управление отображением элементов интерфейса (настройка видимости панелей и кнопок), поддержка светлой и темной тем оформления, локальное сохранение сессий и полный импорт/экспорт состояния приложения (JSON).

### Технологический стек и архитектура
* **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.
* **Визуализация графов и AST**: `@xyflow/react` (React Flow), `dagre` (авто-лейаут графов), `node-sql-parser` (генерация AST-дерева), `html-to-image`.
* **Нативный десктоп-слой (Tauri / Rust)**:
  * **DuckDB Native**: Нативная интеграция C/Rust API DuckDB в Tauri-сервере. Оптимизирован для прямого чтения локальных файлов (`.duckdb`, `.parquet`, `.csv`, `.json`) без ограничений по памяти браузерного WASM.
  * **ClickHouse HTTP & Streaming**: Высокопроизводительный асинхронный HTTP-клиент на базе `reqwest` и `tokio` с поддержкой выполнения стандартных запросов и операций `COPY TO` / `COPY FROM`.
* **Веб-версия (Browser WASM)**: `@duckdb/duckdb-wasm` с WebAssembly-воркерами для работы прямо в браузере.

### Ключевые особенности архитектуры и детальный разбор
* **Нативный движок DuckDB vs WASM**:
  * В десктопной версии Tauri запросы выполняются напрямую через нативный Rust-модуль DuckDB с прямым доступом к файловой системе и многопоточной обработкой.
  * В веб-режиме автоматически активируется WebAssembly-режим с виртуальной файловой системой in-memory.
* **Интерактивный аналитический дата-профайлер (DataStatsViewer)**:
  * Визуальное представление результатов в виде интерактивных таблиц с поддержкой транспонирования (столбцы <-> строки) и масштабирования ячеек (Cell Zoom View).
  * Построение гистограмм распределения, столбчатых, линейных и круговых диаграмм (`Recharts`).
  * Автоматический расчет аналитических метрик по каждому полю (количество значений, NULL-значения, уникальность, минимумы, максимумы, среднее и стандартное отклонение).
* **Управление авто-лейаутом графов AST**:
  * Переключение топологии графа: слева-направо (`LR`) или сверху-вниз (`TB`).
  * Интерактивная фильтрация элементов графа (возможность скрыть узлы `Sort`, `Limit`, `Join` для упрощения сложных схем).
* **Гибкая настройка горячих клавиш и форматирования**:
  * Полное перенаправление комбинаций клавиш (Hotkeys) под свои нужды.
  * Детализированная настройка правил форматирования кода (`sql-formatter`): регистр ключевых слов, отступы, пустые строки между запросами.
  * Настраиваемое меню быстрой вставки пользовательских команд и префиксов (Quick Action Templates).

---

## Description (EN)

A technical application for visualizing, formatting, and executing SQL queries. It is designed to analyze Abstract Syntax Tree (AST) query structures using interactive graphs and interface directly with analytical databases. The application runs in both web browsers (via WebAssembly) and as a standalone desktop client (powered by Tauri).

### Core Features
* **AST Graph Visualization**: Parses SQL queries (`node-sql-parser`) to generate interactive, node-based abstract syntax trees (`@xyflow/react`) with customizable layout direction and scaling.
* **Database Integration**: Connects to and executes queries against DuckDB (local file access in desktop mode or in-memory via WASM) and ClickHouse (via HTTP API with credentials and custom settings).
* **Schema Management**: Database introspection UI to inspect tables, views, columns, and data types of the connected environment.
* **Data & Statistics Viewer**: Built-in data inspection panel (DataStatsViewer) with automated calculation of column metrics, unique values, data types, and value distributions.
* **Advanced SQL Editor**: Multi-tab SQL editor featuring a full-screen view mode, syntax highlighting, autocomplete, and automatic code formatting (`sql-formatter`).
* **SQL Snippets & Templates Library**: Manager for saving custom reusable SQL snippets alongside a built-in library of analytical query presets.
* **Version History**: Full query history tracking with saved version snapshots and fast rollback functionality (IndexedDB).
* **Export Capabilities**: Exports visual node graphs to image formats (PNG, SVG, JPEG) and structural/diagram formats (JSON, XML, Mermaid, Draw.io).
* **UI Customization & Workspace Management**: Granular control over UI element visibility, light/dark theme toggling, local persistence of user sessions and tabs, and full workspace state import/export (JSON).

### Architecture & Technology Stack
* **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.
* **Graph & AST Engine**: `@xyflow/react` (React Flow), `dagre` (graph auto-layout), `node-sql-parser` (AST parser), `html-to-image`.
* **Desktop Native Layer (Tauri / Rust)**:
  * **DuckDB Native Engine**: Direct C/Rust binding integration in the Tauri backend. Optimized for high-throughput zero-copy file querying (`.duckdb`, `.parquet`, `.csv`, `.json`) directly on disk without WASM memory constraints.
  * **ClickHouse HTTP & Streaming**: High-performance asynchronous HTTP client powered by Rust's `reqwest` and `tokio`, supporting query execution as well as native `COPY TO` / `COPY FROM` streaming pipelines.
* **Web Runtime**: `@duckdb/duckdb-wasm` utilizing browser WebAssembly workers for standalone in-browser execution.

### Key Architectural Highlights & Feature Deep-Dive
* **Native DuckDB Engine vs WASM Fallback**:
  * Desktop (Tauri) utilizes native C++ DuckDB via Rust IPC bindings for multi-threaded disk file querying.
  * Browser environment gracefully falls back to WebAssembly in-memory virtual filesystem (VFS).
* **Data Profiler & Advanced Visualizer (DataStatsViewer)**:
  * Interactive data tables with transposition support (swap rows and columns) and detailed Cell Zoom view.
  * Built-in visual chart modes including Column Histograms, Line Charts, Bar Charts, and Pie Charts (`Recharts`).
  * Automated statistical metrics calculation per field (value counts, null percentages, distinct counts, min, max, mean, stddev).
* **AST Layout & Graph Customization**:
  * Layout orientation switching between Left-to-Right (`LR`) and Top-to-Bottom (`TB`).
  * Granular node visibility controls to hide structural noise such as `Sort`, `Limit`, or `Join` nodes for complex AST trees.
* **Custom Shortcuts & SQL Formatter Settings**:
  * Fully customizable keyboard shortcut (Hotkey) mappings.
  * Precise SQL formatting controls via `sql-formatter` (keyword case, indentation style, inter-statement line breaks).
  * Configurable Quick Action Templates for instant query snippet injection.

### Installation & Platform Notes

*for macos desktop app if security popup appears, run in terminal:*
`xattr -cr /Applications/"QueryAST Lens.app"`
