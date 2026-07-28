# QueryAST Lens (SQL Visualizer)

## Описание (RU)

Техническое приложение для визуализации, форматирования и выполнения SQL-запросов. Предназначено для анализа структуры запросов (AST - Abstract Syntax Tree) в виде интерактивных графов, а также для прямого взаимодействия с аналитическими базами данных. Поддерживает работу в веб-браузере (на базе WebAssembly) и как нативное десктопное приложение (на базе фреймворка Tauri).

### Основные возможности
* **Визуализация AST графов**: Синтаксический разбор SQL-запросов (`node-sql-parser`) и построение интерактивных узловых графов (`@xyflow/react`).
* **Поддержка баз данных**: Подключение и выполнение запросов к DuckDB (работа с локальными файлами в десктоп-версии или in-memory через WASM) и Clickhouse (через HTTP API).
* **Просмотр схемы данных (Schema Viewer)**: Интроспекция подключенных баз данных (отображение таблиц, представлений, колонок и типов данных).
* **Редактирование SQL**: Многовкладочный редактор с функциями автодополнения (autocomplete), истории версий (IndexedDB) и автоматического форматирования кода (`sql-formatter`).
* **Экспорт данных**: Сохранение графов в графических форматах (PNG, SVG, JPEG) и структурных текстовых форматах (JSON, XML, Mermaid, Draw.io).
* **Управление рабочим пространством**: Локальное сохранение сессий, открытых вкладок и конфигураций подключения, а также возможность полного импорта/экспорта состояния приложения (JSON).

---

## Description (EN)

A technical application for visualizing, formatting, and executing SQL queries. It is designed to analyze Abstract Syntax Tree (AST) query structures using interactive graphs and interface directly with analytical databases. The application runs in both web browsers (via WebAssembly) and as a standalone desktop client (powered by Tauri).

### Core Features
* **AST Graph Visualization**: Parses SQL queries (`node-sql-parser`) to generate interactive, node-based abstract syntax trees (`@xyflow/react`).
* **Database Integration**: Connects to and executes queries against DuckDB (local file access in desktop mode or in-memory via WASM) and Clickhouse (via HTTP API).
* **Schema Management**: Database introspection UI to inspect tables, views, columns, and data types of the connected environment.
* **SQL Editing**: Multi-tab SQL editor featuring autocomplete, version history tracking (IndexedDB), and automatic code formatting (`sql-formatter`).
* **Export Capabilities**: Exports visual node graphs to image formats (PNG, SVG, JPEG) and structural data formats (JSON, XML, Mermaid, Draw.io).
* **Workspace Management**: Local persistence of user sessions, active tabs, and database configurations, including full workspace state import/export (JSON).
