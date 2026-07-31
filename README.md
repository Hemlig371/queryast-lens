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


*for macos need terminal cmd `xattr -cr /Applications/"QueryAST Lens.app"`*

