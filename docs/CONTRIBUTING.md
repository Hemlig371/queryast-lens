# Development & Build Guide

### Prerequisites
* **Node.js**: v18.x or newer (LTS 20+ recommended)
* **npm**: v9.x+
* **Rust / Cargo** *(for Tauri Desktop target)*: with active toolchain
  * *Linux build packages:* `sudo apt-get install -y libwebkit2gtk-4.0-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
* **Android Studio / SDK** *(for Android Capacitor target)*

### Project Architecture & Key Files

Understanding the file structure helps navigate and extend the application:

* **Entry Points & Core**:
  * `src/App.tsx`: Central application state, tab lifecycle, query execution, graph orchestration, and hotkeys.
  * `src/main.tsx` & `src/index.css`: React entry point and Tailwind CSS v4 styling rules.
  * `server.ts`: Express backend proxy for local DuckDB IPC, ClickHouse API requests, and VFS synchronization.
* **UI Components (`src/components/`)**:
  * `SqlEditor.tsx`: Custom SQL editor with syntax highlighting overlay, snippet injection, variable evaluation, and line-level controls.
  * `DataStatsViewer.tsx`: Results data table, pagination, cell zoom, quick filters, column stats, and chart visualization.
  * `SettingsModal.tsx`: Comprehensive configuration (DuckDB, ClickHouse, UI scaling, export presets, sync paths).
  * `ActionMenuTabContent.tsx`: Quick snippet library, favorite queries, and sequential multi-statement `-- @job` pipelines.
  * `WasmFileManagerModal.tsx`: GUI file manager for DuckDB WASM virtual file system (VFS).
  * `CustomNodes.tsx` & `MermaidNodes.tsx`: Node and edge rendering for AST Lineage and Mermaid diagrams.
  * `VersionHistoryModal.tsx`: Local snapshot restore and diff viewer.
* **Core Logic & Utilities (`src/utils/` & `src/lib/`)**:
  * `src/utils/astToGraph.ts`: SQL parsing, CTE extraction, column lineage mapping, and graph building.
  * `src/utils/mermaidToGraph.ts`: Parser translating raw Mermaid syntax into canvas node graphs.
  * `src/utils/excelExporter.ts`: Excel report generator (`exceljs`), SQL directive parsing (`@sheet`, `@totals`, `@file`, etc.).
  * `src/utils/vaultStorage.ts`: AES-256 GCM Web Crypto implementation for secure credential storage.
  * `src/utils/i18n.ts`: Localization dictionaries (RU/EN).
  * `src/lib/duckdbWasm.ts`: Browser-based DuckDB WebAssembly engine with Parquet/CSV/JSON VFS support.
  * `src/lib/clickhouse.ts`: ClickHouse HTTP protocol client with auth, cancellation tokens, and URI parser.
* **Native Targets**:
  * `src-tauri/`: Rust desktop layer (IPC commands, direct disk DuckDB access, file dialogs).
  * `capacitor.config.json`: Mobile wrapper configuration for Android builds.
* **Tests (`tests/`)**: Unit and integration test suites executed with Vitest.

### Setup & Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start web development server**:
   ```bash
   npm run dev
   ```
   *Default address:* `http://localhost:3000`

3. **Start desktop development mode (Tauri)**:
   ```bash
   npm run tauri dev
   ```

### Quality Assurance & Testing

* **TypeScript type check and linting**:
  ```bash
  npm run lint
  ```

* **Run test suite (Vitest)**:
  ```bash
  npx vitest run
  ```

* **Self-Verification Checklist before Build**:
  1. `npm run lint` — verify no missing types, bad imports, or TypeScript errors.
  2. `npx vitest run` — all parsing, storage, and engine unit tests pass.
  3. `npm run build` — confirm production bundle compiles cleanly.

### Coding Rules & Conventions

* **Localization (i18n)**: All user-facing strings must have corresponding keys in `src/utils/i18n.ts` for both Russian (`ru`) and English (`en`).
* **Security & Secrets**: Never hardcode connection strings or tokens. Use the encrypted `vaultStorage` or environment variables.
* **Styling**: Use utility classes via Tailwind CSS (`@import "tailwindcss";`). Avoid inline styles and separate `.css` files.
* **SQL Directives**: Any modifications to report exporting must preserve backwards compatibility with `@sheet`, `@totals`, `@split`, `@group`, `@file`, `@protect`, and `@excel_save`.

### Build Commands

#### 1. Web / Full-Stack Output
```bash
npm run build
```
Compiles client SPA assets and server payload into the `dist/` folder.

Test production server execution:
```bash
npm run start
```

#### 2. Desktop Output (Tauri Native)
```bash
npm run tauri build
```
Built binaries (.dmg / .exe / .AppImage) are output to `src-tauri/target/release/bundle/`.

#### 3. Android Output (Capacitor)
```bash
npm run build

# Initial Android platform creation (if android folder does not exist yet):
npx cap add android

# Sync web assets and open project in Android Studio:
npx cap sync android
npx cap open android
```

---

# Руководство по разработке и сборке (RU)

### Требования к окружению
* **Node.js**: v18.x или новее (рекомендуется LTS 20+)
* **npm**: v9.x+
* **Rust / Cargo** *(для сборки Tauri Desktop)*: с установленным тулчейном `cargo`
  * *Системные зависимости для Linux:* `sudo apt-get install -y libwebkit2gtk-4.0-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
* **Android Studio / SDK** *(для сборки Android Capacitor)*

### Архитектура проекта и ключевые файлы

Структура для быстрой ориентации в кодовой базе:

* **Точки входа и основа**:
  * `src/App.tsx`: Главный компонент состояния, вкладки редактора, запуск запросов, визуализация графа и горячие клавиши.
  * `src/main.tsx` и `src/index.css`: Точка входа React и стили Tailwind CSS v4.
  * `server.ts`: Сервер Express для локального DuckDB IPC, проксирования ClickHouse и синхронизации VFS.
* **UI-компоненты (`src/components/`)**:
  * `SqlEditor.tsx`: Кастомный SQL-редактор с оверлеем подсветки синтаксиса, подстановкой макросов, автодополнением и сниппетами.
  * `DataStatsViewer.tsx`: Таблица результатов, пагинация, zoom ячеек, быстрые фильтры, профилирование и графики.
  * `SettingsModal.tsx`: Окно настроек (параметры DuckDB, ClickHouse, масштабирование интерфейса, экспорт, пути синхронизации).
  * `ActionMenuTabContent.tsx`: Библиотека сниппетов, избранные скрипты и последовательные пайплайны `-- @job`.
  * `WasmFileManagerModal.tsx`: Файловый менеджер виртуальной памяти DuckDB WASM (VFS).
  * `CustomNodes.tsx` и `MermaidNodes.tsx`: Рендеринг узлов и связей графа AST и диаграмм Mermaid.
  * `VersionHistoryModal.tsx`: Просмотр истории снимков и diff запросов.
* **Бизнес-логика и утилиты (`src/utils/` и `src/lib/`)**:
  * `src/utils/astToGraph.ts`: Парсинг SQL, извлечение CTE, построение графа Data Lineage.
  * `src/utils/mermaidToGraph.ts`: Парсер для преобразования синтаксиса Mermaid в интерактивный граф.
  * `src/utils/excelExporter.ts`: Генерация Excel-отчетов (`exceljs`), разбор SQL-директив (`@sheet`, `@totals`, `@file` и др.).
  * `src/utils/vaultStorage.ts`: Клиентское шифрование AES-256 GCM через Web Crypto API.
  * `src/utils/i18n.ts`: Словари локализации (RU/EN).
  * `src/lib/duckdbWasm.ts`: Движок DuckDB WebAssembly для браузера с поддержкой файлов Parquet/CSV/JSON.
  * `src/lib/clickhouse.ts`: Клиент ClickHouse HTTP с авторизацией, отменой запросов и парсером URI.
* **Нативные платформы**:
  * `src-tauri/`: Слой Rust для десктопа (системные вызовы, прямой доступ к DuckDB на диске, диалоги файлов).
  * `capacitor.config.json`: Конфигурация мобильной сборки Android.
* **Тесты (`tests/`)**: Набор модульных тестов Vitest.

### Развертывание и локальный запуск

1. **Установка зависимостей**:
   ```bash
   npm install
   ```

2. **Запуск веб-сервера разработки**:
   ```bash
   npm run dev
   ```
   *Порт по умолчанию:* `http://localhost:3000`

3. **Запуск десктоп-версии (Tauri Dev)**:
   ```bash
   npm run tauri dev
   ```

### Проверка кода и автотесты

* **Проверка типов TypeScript и линтинг**:
  ```bash
  npm run lint
  ```

* **Запуск тестового сюита (Vitest)**:
  ```bash
  npx vitest run
  ```

* **Чек-лист перед сборкой**:
  1. `npm run lint` — отсутствие ошибок компиляции и типов.
  2. `npx vitest run` — успешное прохождение всех тестов парсера, экспорта и хранилищ.
  3. `npm run build` — корректная компиляция продакшн-бандла.

### Правила и соглашения по коду

* **Локализация (i18n)**: Любой новый пользовательский текст должен добавляться в словарь `src/utils/i18n.ts` одновременно для русской (`ru`) и английской (`en`) версий.
* **Безопасность**: Запрещено жестко прописывать учетные данные или токены в коде. Используйте шифрованный Vault или переменные окружения.
* **Стилизация**: Использование утилитных классов Tailwind CSS (`@import "tailwindcss";`). Не использовать инлайн-стили и отдельные `.css` файлы.
* **Директивы SQL**: Любые правки движка отчетов должны сохранять обратную совместимость с директивами `@sheet`, `@totals`, `@split`, `@group`, `@file`, `@protect`, `@excel_save`.

### Сборка приложения (Build Targets)

#### 1. Web / Full-Stack
```bash
npm run build
```
Сборка статических файлов клиентского приложения и сервера в директорию `dist/`.

Проверка продакшн-запуска:
```bash
npm run start
```

#### 2. Desktop (Tauri Native Package)
```bash
npm run tauri build
```
Результаты сборки (.dmg / .exe / .AppImage) сохраняются в `src-tauri/target/release/bundle/`.

#### 3. Android (Capacitor)
```bash
npm run build

# Первоначальная инициализация Android платформы (если папка android еще не создана):
npx cap add android

# Синхронизация ассетов и открытие проекта в Android Studio:
npx cap sync android
npx cap open android
```
