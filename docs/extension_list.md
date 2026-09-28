# Tested DuckDB Extensions

> Quick reference & installation cheat-sheet for verified DuckDB official & community extensions.  

---

## Description

### 1. File Formats, Documents & Reports
* `INSTALL parquet;` — High-performance read and write support for compressed columnar Apache Parquet files.
* `INSTALL json;` — Parsing, extraction, and generation of JSON structures with JSONPath and `->` / `->>` operators.
* `INSTALL avro;` — Read binary serialized Apache Avro files and event streams.
* `INSTALL excel;` — Direct reading and analytical processing of Microsoft Excel workbooks and sheets (`.xlsx`).
* `INSTALL pdf FROM community;` — Extract plain text, tabular data, and metadata directly from PDF documents via SQL.
* `INSTALL pbix FROM community;` — Read internal data model tables directly from Microsoft Power BI report files (`.pbix`).
* `INSTALL read_dbf FROM community;` — Read legacy database table files from dBase / FoxPro (`.dbf`).
* `INSTALL markdown FROM community;` — Parse Markdown files into structured tables and analyze text documents.
* `INSTALL nsv FROM community;` — Parse and import non-standard and complex delimited values (Non-Standard Values).
* `INSTALL read_lines FROM community;` — Stream any text files line-by-line into a single-column SQL table.

### 2. External DBMS, Connectors & Scanners
* `INSTALL postgres_scanner;` — Direct live queries to PostgreSQL servers with transparent filter pushdown.
* `INSTALL mysql_scanner;` — Connect to MySQL and MariaDB databases to scan tables without disk exports.
* `INSTALL sqlite_scanner;` — Seamlessly read and modify local SQLite database files.
* `INSTALL oracle_scanner FROM community;` — Scan and query remote tables from Oracle DBMS instances.
* `INSTALL odbc_scanner;` — Universal scanner for any enterprise data sources via system-installed ODBC drivers.
* `INSTALL adbc FROM community;` — Standard Arrow Database Connectivity for zero-overhead columnar data exchange.
* `INSTALL adbc_scanner FROM community;` — Direct scanner over any ADBC-compliant database connection.
* `INSTALL gsheets FROM community;` — Query online Google Sheets spreadsheets directly by URL or document ID.
* `INSTALL rusty_sheet FROM community;` — High-speed Rust-based reader for various spreadsheet formats.

### 3. File Systems, Networking, Web & Archives (I/O & Web)
* `INSTALL httpfs;` — Read and write remote files over HTTP(S), Amazon S3, Google Cloud Storage, and MinIO.
* `INSTALL zipfs FROM community;` — Transparently query files inside compressed ZIP archives without manual extraction.
* `INSTALL hostfs FROM community;` — Extended local host filesystem operations and inspection directly from SQL.
* `INSTALL shellfs FROM community;` — Execute system shell commands and capture their standard output (`stdout`) as tables.
* `INSTALL crawler FROM community;` — Web crawler to fetch web pages, follow links, and store raw HTML directly via SQL.
* `INSTALL web_search FROM community;` — Execute web search engine queries and retrieve result rows into a table.

### 4. Core Functions, Autocomplete, UI & Internationalization
* `INSTALL core_functions;` — Core extended mathematical, string, array, and distributive aggregate functions.
* `INSTALL autocomplete;` — Lexical analysis engine and contextual SQL keyword/table autocompletion.
* `INSTALL icu;` — Full Unicode collation support, internationalization rules, and complex time zone operations.
* `INSTALL encodings;` — Transcode and parse legacy character sets (ANSI/Windows-1251, KOI8-R, Shift-JIS).
* `INSTALL ui;` — Built-in visual UI components and interactive helpers for terminal and web interfaces.
* `INSTALL quack;` — Built-in DuckDB mascot demonstration extension with duck sound effects.

### 5. Geospatial Analytics (GIS)
* `INSTALL spatial;` — Full geospatial analysis suite with geometry types, ST_* spatial functions, GeoJSON, Shapefile, and GeoParquet.

### 6. Full-Text Search & NLP
* `INSTALL fts;` — Build inverted indices and run ranked full-text searches using BM25 scoring.
* `INSTALL inflector FROM community;` — Text pluralization, singularization, and naming case conversion (camelCase, snake_case, kebab-case).
* `INSTALL polyglot FROM community;` — Multi-language text analytics, stemming, and language detection across text columns.

### 7. Time Series, Forecasting & Analytics (Anofox Suite)
* `INSTALL anofox_forecast FROM community;` — Time series forecasting using built-in statistical models directly inside SQL.
* `INSTALL anofox_similarity FROM community;` — Vector and string similarity metrics, distance scoring, and clustering.
* `INSTALL anofox_statistics FROM community;` — Advanced descriptive, inferential, and regression statistical calculations.
* `INSTALL anofox_tabular FROM community;` — Tabular feature analysis, data profiling, and preprocessing.
* `INSTALL anofox_scenario FROM community;` — What-if scenario simulation and sensitivity analysis over tabular datasets.

### 8. Machine Learning, AI & LLMs
* `INSTALL ml FROM community;` — Train, evaluate, and predict with classic machine learning models (classification/regression) inside DuckDB.
* `INSTALL open_prompt FROM community;` — Connect to Large Language Models (LLMs) to enrich and classify text columns via prompts.
* `INSTALL agent_data FROM community;` — Synthetic dataset generation and data preparation workflows for AI agents.

### 9. Advanced Data Transformation, Parsing & Templating
* `INSTALL pivot_table FROM community;` — Dynamic pivot tables generation without requiring manual hardcoded column lists.
* `INSTALL duck_diff FROM community;` — Detailed row-level and column-level diff comparison between two tables or queries.
* `INSTALL finetype FROM community;` — Advanced type inference, validation, and schema coercion for messy incoming data.
* `INSTALL semantic_views FROM community;` — Build semantic data layers and centralized business metric definitions over raw tables.
* `INSTALL parser_tools FROM community;` — Low-level code, grammar, and text tokenization and AST parsing tools.
* `INSTALL minijinja FROM community;` — Render dynamic text, templates, and parameterized SQL queries using Jinja2 syntax.

### 10. Visualization, Utilities & Orchestration
* `INSTALL textplot FROM community;` — Render clean ASCII and Unicode charts directly within query output cells.
* `INSTALL stats_duck FROM community;` — Comprehensive dataset health profiling, distribution charts, and column metrics.
* `INSTALL sitting_duck FROM community;` — Lightweight health-check, monitoring, and introspection utilities for tables.
* `INSTALL tsid FROM community;` — Fast generator for compact 64-bit Time-Sorted Unique Identifiers (TSID).
* `INSTALL python_udf FROM community;` — Define and execute arbitrary Python User-Defined Functions directly inside SQL statements.
* `INSTALL cronjob FROM community;` — Schedule and trigger recurring background SQL execution using cron expressions.
* `INSTALL duckorch FROM community;` — Pipeline orchestration and analytical DAG workflow management inside DuckDB.
* `INSTALL duck_block_utils FROM community;` — Low-level block memory utilities and storage layout helpers.

---

# Протестированные расширения DuckDB

> Справочник и шпаргалка по проверенным официальным расширениям и расширениям сообщества DuckDB.

## Description (RU)

### 1. Форматы файлов, документов и отчётов
* `INSTALL parquet;` — высокопроизводительное чтение и сохранение сжатых колоночных файлов Apache Parquet.
* `INSTALL json;` — разбор, извлечение и создание JSON-структур с поддержкой JSONPath и операторов `->` / `->>`.
* `INSTALL avro;` — чтение бинарных сериализованных файлов и потоков Apache Avro.
* `INSTALL excel;` — прямое чтение и аналитическая обработка книг и листов Microsoft Excel (`.xlsx`).
* `INSTALL pdf FROM community;` — извлечение текста, таблиц и метаданных напрямую из PDF-документов через SQL.
* `INSTALL pbix FROM community;` — чтение внутренних данных, таблиц и моделей из файлов отчётов Microsoft Power BI (`.pbix`).
* `INSTALL read_dbf FROM community;` — чтение устаревших табличных файлов баз данных dBase / FoxPro (`.dbf`).
* `INSTALL markdown FROM community;` — парсинг Markdown-разметки и извлечение из неё структурных данных и таблиц.
* `INSTALL nsv FROM community;` — чтение и парсинг файлов с разделителями нестандартного или сложного формата (Non-Standard Values).
* `INSTALL read_lines FROM community;` — построчное чтение текстовых файлов любого размера в виде единого строкового потока.

### 2. Подключение к внешним СУБД, источникам и сервисам (Connectors & Scanners)
* `INSTALL postgres_scanner;` — прямое подключение к PostgreSQL и выполнение запросов к удаленным таблицам с пушдауном фильтров.
* `INSTALL mysql_scanner;` — подключение к базам данных MySQL и MariaDB для чтения таблиц без предварительной выгрузки на диск.
* `INSTALL sqlite_scanner;` — прозрачное чтение и изменение локальных баз данных SQLite.
* `INSTALL oracle_scanner FROM community;` — сканирование и прямое чтение таблиц из СУБД Oracle.
* `INSTALL odbc_scanner;` — универсальное подключение к любым корпоративным источникам данных через системные ODBC-драйверы.
* `INSTALL adbc FROM community;` — интеграция Arrow Database Connectivity для быстрой передачи колоночных данных между языками и драйверами.
* `INSTALL adbc_scanner FROM community;` — чтение данных из любых ADBC-совместимых баз данных без накладных расходов на сериализацию.
* `INSTALL gsheets FROM community;` — чтение данных напрямую из онлайн-таблиц Google Sheets по ссылке или идентификатору таблицы.
* `INSTALL rusty_sheet FROM community;` — высокоскоростной движок на Rust для чтения различных форматов электронных таблиц.

### 3. Файловые системы, сеть, веб и архивы (I/O & Web)
* `INSTALL httpfs;` — чтение и запись файлов по протоколам HTTP(S), а также нативная работа с облаками S3, GCS и MinIO.
* `INSTALL zipfs FROM community;` — прозрачное чтение содержимого и файлов из сжатых ZIP-архивов без их предварительной распаковки.
* `INSTALL hostfs FROM community;` — расширенный доступ к операциям файловой системы локального хоста из SQL-контекста.
* `INSTALL shellfs FROM community;` — выполнение консольных команд и чтение их стандартного вывода (stdout) напрямую в SQL-таблицы.
* `INSTALL crawler FROM community;` — веб-краулинг, обход ссылок и сбор HTML-страниц в таблицы прямо через SQL-запросы.
* `INSTALL web_search FROM community;` — выполнение поисковых запросов в интернете и получение результатов поиска в виде строк таблицы.

### 4. Встроенные функции, ядро, UI и язык
* `INSTALL core_functions;` — базовый расширенный набор математических, строковых и агрегатных функций ядра DuckDB.
* `INSTALL autocomplete;` — движок лексического анализа и контекстных автоподсказок для SQL-кода.
* `INSTALL icu;` — поддержка Unicode, интернационализации, корректной сортировки строк с учётом локалей и сложных таймзон.
* `INSTALL encodings;` — перекодирование и чтение строк в различных национальных кодировках (включая ANSI/Windows-1251, KOI8-R).
* `INSTALL ui;` — встроенные графические компоненты и элементы интерактивного интерфейса для терминала и веба.
* `INSTALL quack;` — демонстрационное и тестовое расширение DuckDB с фирменным звуком утки.

### 5. Геоданные и пространственный анализ (GIS)
* `INSTALL spatial;` — полноценная работа с геопространственными данными, типами Geometry, функциями ST_* и форматами GeoJSON, SHP, GeoParquet.

### 6. Полнотекстовый поиск и обработка текста (NLP)
* `INSTALL fts;` — построение инвертированных индексов и ранжированный полнотекстовый поиск по алгоритму BM25.
* `INSTALL inflector FROM community;` — плюрализация, сингуляризация и преобразование регистра идентификаторов (camelCase, snake_case, Title Case).
* `INSTALL polyglot FROM community;` — многоязычный анализ текста, лемматизация и определение языков в текстовых колонках.

### 7. Аналитика, временные ряды и прогнозирование (Anofox Suite)
* `INSTALL anofox_forecast FROM community;` — прогнозирование временных рядов с использованием статистических моделей прямо в SQL.
* `INSTALL anofox_similarity FROM community;` — вычисление мер сходства, расстояний и кластеризация векторов и строк.
* `INSTALL anofox_statistics FROM community;` — расширенный набор дескриптивных и математических статистических функций.
* `INSTALL anofox_tabular FROM community;` — продвинутый анализ и предобработка структурированных табличных признаков.
* `INSTALL anofox_scenario FROM community;` — моделирование сценариев «что если» (what-if analysis) и расчет вариаций данных.

### 8. Машинное обучение, AI и языковые модели
* `INSTALL ml FROM community;` — обучение и применение базовых алгоритмов машинного обучения (классификация, регрессия) внутри DuckDB.
* `INSTALL open_prompt FROM community;` — интеграция с LLM и отправка промптов к языковым моделям для обогащения строковых колонок.
* `INSTALL agent_data FROM community;` — генерация синтетических данных и подготовка датасетов для автономных AI-агентов.

### 9. Продвинутая трансформация данных, парсинг и шаблонизация
* `INSTALL pivot_table FROM community;` — построение динамических сводных таблиц (Pivot Tables) без ручного перечисления колонок.
* `INSTALL duck_diff FROM community;` — сравнение двух таблиц или результатов запросов с детальным выводом разницы (diff) по строкам и колонкам.
* `INSTALL finetype FROM community;` — расширенная типизация, валидация и автоматическое приведение сложных форматов данных.
* `INSTALL semantic_views FROM community;` — создание семантических представлений и описаний бизнес-метрик над сырыми таблицами.
* `INSTALL parser_tools FROM community;` — низкоуровневый разбор, токенизация и трансформация произвольных текстовых структур и кода.
* `INSTALL minijinja FROM community;` — рендеринг динамических текстовых и SQL-шаблонов с использованием синтаксиса шаблонизатора Jinja2.

### 10. Визуализация, утилиты и системная оркестрация
* `INSTALL textplot FROM community;` — генерация ASCII/Unicode графиков и диаграмм прямо в текстовом выводе консоли или ячейки.
* `INSTALL stats_duck FROM community;` — сбор и наглядная визуализация профилей распределения данных и системных метрик.
* `INSTALL sitting_duck FROM community;` — легковесные утилиты для инспекции и мониторинга состояния таблиц DuckDB.
* `INSTALL tsid FROM community;` — генерация компактных 64-битных уникальных идентификаторов с временной сортировкой (Time-Sorted ID).
* `INSTALL python_udf FROM community;` — объявление и выполнение пользовательских функций на языке Python (UDF) прямо из SQL-запроса.
* `INSTALL cronjob FROM community;` — запуск периодических фоновых задач и выполнение SQL-скриптов по расписанию cron.
* `INSTALL duckorch FROM community;` — оркестрация последовательностей выполнения аналитических пайплайнов и DAG внутри DuckDB.
* `INSTALL duck_block_utils FROM community;` — набор вспомогательных функций для блочных операций с памятью и внутренними структурами DuckDB.
