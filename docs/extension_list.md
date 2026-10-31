# Tested DuckDB Extensions

> Quick reference & installation cheat-sheet for verified DuckDB official & community extensions.  

---

## Description

### 1. File Formats, Documents & Reports
* `INSTALL parquet;` — High-performance read and write support for compressed columnar Apache Parquet files.
* `INSTALL json;` — Parsing, extraction, and generation of JSON structures with JSONPath and `->` / `->>` operators.
* `INSTALL avro;` — Read binary serialized Apache Avro files and event streams.
* `INSTALL excel;` — Direct reading and analytical processing of Microsoft Excel workbooks and sheets (`.xlsx`).
* `INSTALL pdf FROM community;` — Extract text from, OCR, inspect, modify and generate PDF files with SQL.
* `INSTALL pbix FROM community;` — Read internal data model tables directly from Microsoft Power BI report files (`.pbix`).
* `INSTALL read_dbf FROM community;` — Read legacy database table files from dBase / FoxPro (`.dbf`).
* `INSTALL markdown FROM community;` — Parse Markdown files into structured tables and analyze text documents.
* `INSTALL nsv FROM community;` — Read and write NSV (Newline-Separated Values) files.
* `INSTALL read_lines FROM community;` — Stream any text files line-by-line into a single-column SQL table.

### 2. External DBMS, Connectors & Scanners

> Note: `postgres_scanner`, `mysql_scanner`, `sqlite_scanner` and `odbc_scanner` are the former names of the core extensions; the DuckDB 2.0 documentation calls them `postgres`, `mysql`, `sqlite` and `odbc`.
* `INSTALL postgres_scanner;` — Direct live queries to PostgreSQL servers with transparent filter pushdown.
* `INSTALL mysql_scanner;` — Connect to MySQL and MariaDB databases to scan tables without disk exports.
* `INSTALL sqlite_scanner;` — Seamlessly read and modify local SQLite database files.
* `INSTALL oracle_scanner FROM community;` — Scan and query remote tables from Oracle DBMS instances.
* `INSTALL odbc_scanner;` — Universal scanner for any enterprise data sources via system-installed ODBC drivers.
* `INSTALL adbc FROM community;` — Standard Arrow Database Connectivity for zero-overhead columnar data exchange.
* `INSTALL adbc_scanner FROM community;` — Direct scanner over any ADBC-compliant database connection.
* `INSTALL gsheets FROM community;` — Query Google Sheets and write tables back to them with SQL.
* `INSTALL rusty_sheet FROM community;` — Reader for Excel / WPS / OpenDocument spreadsheet files.

### 3. File Systems, Networking, Web & Archives (I/O & Web)
* `INSTALL httpfs;` — Read and write remote files over HTTP(S), Amazon S3, Google Cloud Storage, and MinIO.
* `INSTALL zipfs FROM community;` — Transparently query files inside compressed ZIP archives without manual extraction.
* `INSTALL hostfs FROM community;` — Browse and inspect files and folders of the local system from SQL.
* `INSTALL shellfs FROM community;` — Use shell commands as data sources and destinations (read their `stdout`, write to a command).
* `INSTALL crawler FROM community;` — Web crawler to fetch web pages, follow links, and store raw HTML directly via SQL.
* `INSTALL web_search FROM community;` — Run Google Custom Search queries from SQL, with filter pushdown.

### 4. Core Functions, Autocomplete, UI & Internationalization
* `INSTALL core_functions;` — Core extended mathematical, string, array, and distributive aggregate functions.
* `INSTALL autocomplete;` — Lexical analysis engine and contextual SQL keyword/table autocompletion.
* `INSTALL icu;` — Full Unicode collation support, internationalization rules, and complex time zone operations.
* `INSTALL encodings;` — Transcode and parse legacy character sets (ANSI/Windows-1251, KOI8-R, Shift-JIS).
* `INSTALL ui;` — Graphical web UI (notebook) for the current DuckDB session; queries and data stay on your machine.
* `INSTALL quack;` — Adds support for the Quack remote protocol; loads automatically on first use.

### 5. Geospatial Analytics (GIS)
* `INSTALL spatial;` — Full geospatial analysis suite with geometry types, ST_* spatial functions, GeoJSON, Shapefile, and GeoParquet.

### 6. Full-Text Search & NLP
* `INSTALL fts;` — Build inverted indices and run ranked full-text searches using BM25 scoring.
* `INSTALL inflector FROM community;` — Text pluralization, singularization, and naming case conversion (camelCase, snake_case, kebab-case).

### 7. Time Series, Forecasting & Analytics (Anofox Suite)
* `INSTALL anofox_forecast FROM community;` — Statistical time-series forecasting (ARIMA, ETS, Theta, TBATS, MFLES, MSTL, Croston, GARCH).
* `INSTALL anofox_similarity FROM community;` — Find comparable products by combining bill-of-materials overlap, graph structure, text and transaction patterns (e.g. predecessor parts, demand for new items).
* `INSTALL anofox_statistics FROM community;` — Regression modeling in SQL (linear, penalized, robust, generalized, mixed-effects, survival, time series) with diagnostics and inference.
* `INSTALL anofox_tabular FROM community;` — Data quality checks and preparation of tabular datasets.
* `INSTALL anofox_scenario FROM community;` — Git-style branching: attach isolated what-if scenarios as separate catalogs, edit them with SQL, compare and merge back into the base data.

### 8. Machine Learning, AI & LLMs
* `INSTALL ml FROM community;` — Train, evaluate, and predict with classic machine learning models (classification/regression) inside DuckDB.
* `INSTALL open_prompt FROM community;` — Send prompts to self-hosted OpenAI-compatible LLM APIs from SQL.
* `INSTALL agent_data FROM community;` — Query the history of AI coding agents (conversations, plans, todos, usage statistics) from local data directories.

### 9. Advanced Data Transformation, Parsing & Templating
* `INSTALL pivot_table FROM community;` — Dynamic pivot tables generation without requiring manual hardcoded column lists.
* `INSTALL duck_diff FROM community;` — Detailed row-level and column-level diff comparison between two tables or queries.
* `INSTALL finetype FROM community;` — Infer the semantic type of string values (emails, URLs, dates, identifiers and other kinds).
* `INSTALL semantic_views FROM community;` — Build semantic data layers and centralized business metric definitions over raw tables.
* `INSTALL parser_tools FROM community;` — Extract referenced tables and the context of their use from SQL queries using DuckDB's own parser.
* `INSTALL minijinja FROM community;` — Render dynamic text, templates, and parameterized SQL queries using Jinja2 syntax.
* `INSTALL polyglot FROM community;` — SQL transpiler between dialects (`polyglot_transpile`, `polyglot_validate`, `polyglot_parse`, `polyglot_optimize`, `polyglot_lineage`, `polyglot_diff`); it is not text analysis.

### 10. Visualization, Utilities & Orchestration
* `INSTALL textplot FROM community;` — Render clean ASCII and Unicode charts directly within query output cells.
* `INSTALL stats_duck FROM community;` — Statistics in SQL: descriptive statistics, hypothesis tests, distributions, regression, Vega-Lite charts, reading and writing SAS/SPSS/Stata files.
* `INSTALL sitting_duck FROM community;` — Parse source code into syntax trees with tree-sitter grammars and analyze code structure with SQL.
* `INSTALL tsid FROM community;` — Fast generator for compact 64-bit Time-Sorted Unique Identifiers (TSID).
* `INSTALL python_udf FROM community;` — Define and execute arbitrary Python User-Defined Functions directly inside SQL statements.
* `INSTALL cronjob FROM community;` — Schedule and trigger recurring background SQL execution using cron expressions.
* `INSTALL duckorch FROM community;` — Asset-based data orchestration inside DuckDB: JSON ingestion, partitioning, automatic triggers, MCP server, lineage tracking.
* `INSTALL duck_block_utils FROM community;` — Create, transform, validate and extract data from structured documents through a unified `duck_block` type.

---

# Протестированные расширения DuckDB

> Справочник и шпаргалка по проверенным официальным расширениям и расширениям сообщества DuckDB.

## Description (RU)

### 1. Форматы файлов, документов и отчётов
* `INSTALL parquet;` — высокопроизводительное чтение и сохранение сжатых колоночных файлов Apache Parquet.
* `INSTALL json;` — разбор, извлечение и создание JSON-структур с поддержкой JSONPath и операторов `->` / `->>`.
* `INSTALL avro;` — чтение бинарных сериализованных файлов и потоков Apache Avro.
* `INSTALL excel;` — прямое чтение и аналитическая обработка книг и листов Microsoft Excel (`.xlsx`).
* `INSTALL pdf FROM community;` — извлечение текста, OCR, инспекция, изменение и создание PDF-файлов через SQL.
* `INSTALL pbix FROM community;` — чтение внутренних данных, таблиц и моделей из файлов отчётов Microsoft Power BI (`.pbix`).
* `INSTALL read_dbf FROM community;` — чтение устаревших табличных файлов баз данных dBase / FoxPro (`.dbf`).
* `INSTALL markdown FROM community;` — парсинг Markdown-разметки и извлечение из неё структурных данных и таблиц.
* `INSTALL nsv FROM community;` — чтение и запись файлов NSV (Newline-Separated Values).
* `INSTALL read_lines FROM community;` — построчное чтение текстовых файлов любого размера в виде единого строкового потока.

### 2. Подключение к внешним СУБД, источникам и сервисам (Connectors & Scanners)

> Примечание: `postgres_scanner`, `mysql_scanner`, `sqlite_scanner` и `odbc_scanner` — прежние имена core-расширений; в документации DuckDB 2.0 они называются `postgres`, `mysql`, `sqlite`, `odbc`.
* `INSTALL postgres_scanner;` — прямое подключение к PostgreSQL и выполнение запросов к удаленным таблицам с пушдауном фильтров.
* `INSTALL mysql_scanner;` — подключение к базам данных MySQL и MariaDB для чтения таблиц без предварительной выгрузки на диск.
* `INSTALL sqlite_scanner;` — прозрачное чтение и изменение локальных баз данных SQLite.
* `INSTALL oracle_scanner FROM community;` — сканирование и прямое чтение таблиц из СУБД Oracle.
* `INSTALL odbc_scanner;` — универсальное подключение к любым корпоративным источникам данных через системные ODBC-драйверы.
* `INSTALL adbc FROM community;` — интеграция Arrow Database Connectivity для быстрой передачи колоночных данных между языками и драйверами.
* `INSTALL adbc_scanner FROM community;` — чтение данных из любых ADBC-совместимых баз данных без накладных расходов на сериализацию.
* `INSTALL gsheets FROM community;` — чтение данных Google Sheets и запись таблиц обратно через SQL.
* `INSTALL rusty_sheet FROM community;` — чтение электронных таблиц Excel / WPS / OpenDocument.

### 3. Файловые системы, сеть, веб и архивы (I/O & Web)
* `INSTALL httpfs;` — чтение и запись файлов по протоколам HTTP(S), а также нативная работа с облаками S3, GCS и MinIO.
* `INSTALL zipfs FROM community;` — прозрачное чтение содержимого и файлов из сжатых ZIP-архивов без их предварительной распаковки.
* `INSTALL hostfs FROM community;` — просмотр и инспекция файлов и папок локальной системы из SQL.
* `INSTALL shellfs FROM community;` — shell-команды как источник и приёмник данных (чтение `stdout`, запись в команду).
* `INSTALL crawler FROM community;` — веб-краулинг, обход ссылок и сбор HTML-страниц в таблицы прямо через SQL-запросы.
* `INSTALL web_search FROM community;` — поисковые запросы Google Custom Search из SQL с пушдауном фильтров.

### 4. Встроенные функции, ядро, UI и язык
* `INSTALL core_functions;` — базовый расширенный набор математических, строковых и агрегатных функций ядра DuckDB.
* `INSTALL autocomplete;` — движок лексического анализа и контекстных автоподсказок для SQL-кода.
* `INSTALL icu;` — поддержка Unicode, интернационализации, корректной сортировки строк с учётом локалей и сложных таймзон.
* `INSTALL encodings;` — перекодирование и чтение строк в различных национальных кодировках (включая ANSI/Windows-1251, KOI8-R).
* `INSTALL ui;` — графический веб-интерфейс (ноутбук) для текущей сессии DuckDB; запросы и данные остаются на вашем компьютере.
* `INSTALL quack;` — поддержка удалённого протокола Quack; загружается автоматически при первом использовании.

### 5. Геоданные и пространственный анализ (GIS)
* `INSTALL spatial;` — полноценная работа с геопространственными данными, типами Geometry, функциями ST_* и форматами GeoJSON, SHP, GeoParquet.

### 6. Полнотекстовый поиск и обработка текста (NLP)
* `INSTALL fts;` — построение инвертированных индексов и ранжированный полнотекстовый поиск по алгоритму BM25.
* `INSTALL inflector FROM community;` — плюрализация, сингуляризация и преобразование регистра идентификаторов (camelCase, snake_case, Title Case).

### 7. Аналитика, временные ряды и прогнозирование (Anofox Suite)
* `INSTALL anofox_forecast FROM community;` — статистическое прогнозирование временных рядов (ARIMA, ETS, Theta, TBATS, MFLES, MSTL, Croston, GARCH).
* `INSTALL anofox_similarity FROM community;` — поиск сопоставимых изделий по пересечению составов (BOM), структуре графа, тексту и характеру транзакций (например, предшественники деталей, спрос на новые позиции).
* `INSTALL anofox_statistics FROM community;` — регрессионное моделирование в SQL (линейная, регуляризованная, робастная, обобщённая, со смешанными эффектами, анализ выживаемости, временные ряды) с диагностикой и выводами.
* `INSTALL anofox_tabular FROM community;` — проверка качества данных и подготовка табличных наборов.
* `INSTALL anofox_scenario FROM community;` — ветвление в стиле Git: изолированные сценарии «что если» подключаются как отдельные каталоги, правятся обычным SQL, сравниваются и сливаются с базовыми данными.

### 8. Машинное обучение, AI и языковые модели
* `INSTALL ml FROM community;` — обучение и применение базовых алгоритмов машинного обучения (классификация, регрессия) внутри DuckDB.
* `INSTALL open_prompt FROM community;` — отправка промптов в самостоятельно развёрнутые LLM-API, совместимые с OpenAI, прямо из SQL.
* `INSTALL agent_data FROM community;` — запросы к истории AI-агентов для программирования (диалоги, планы, задачи, статистика использования) из локальных каталогов данных.

### 9. Продвинутая трансформация данных, парсинг и шаблонизация
* `INSTALL pivot_table FROM community;` — построение динамических сводных таблиц (Pivot Tables) без ручного перечисления колонок.
* `INSTALL duck_diff FROM community;` — сравнение двух таблиц или результатов запросов с детальным выводом разницы (diff) по строкам и колонкам.
* `INSTALL finetype FROM community;` — определение смыслового типа строковых значений (e-mail, URL, даты, идентификаторы и другие).
* `INSTALL semantic_views FROM community;` — создание семантических представлений и описаний бизнес-метрик над сырыми таблицами.
* `INSTALL parser_tools FROM community;` — извлечение таблиц, на которые ссылается SQL-запрос, и контекста их использования средствами парсера DuckDB.
* `INSTALL minijinja FROM community;` — рендеринг динамических текстовых и SQL-шаблонов с использованием синтаксиса шаблонизатора Jinja2.
* `INSTALL polyglot FROM community;` — транспилятор SQL между диалектами (`polyglot_transpile`, `polyglot_validate`, `polyglot_parse`, `polyglot_optimize`, `polyglot_lineage`, `polyglot_diff`), а не анализ текста.

### 10. Визуализация, утилиты и системная оркестрация
* `INSTALL textplot FROM community;` — генерация ASCII/Unicode графиков и диаграмм прямо в текстовом выводе консоли или ячейки.
* `INSTALL stats_duck FROM community;` — статистика в SQL: описательная статистика, проверка гипотез, распределения, регрессия, графики Vega-Lite, чтение и запись файлов SAS/SPSS/Stata.
* `INSTALL sitting_duck FROM community;` — разбор исходного кода в синтаксические деревья на грамматиках tree-sitter и анализ структуры кода через SQL.
* `INSTALL tsid FROM community;` — генерация компактных 64-битных уникальных идентификаторов с временной сортировкой (Time-Sorted ID).
* `INSTALL python_udf FROM community;` — объявление и выполнение пользовательских функций на языке Python (UDF) прямо из SQL-запроса.
* `INSTALL cronjob FROM community;` — запуск периодических фоновых задач и выполнение SQL-скриптов по расписанию cron.
* `INSTALL duckorch FROM community;` — оркестрация данных на основе ассетов внутри DuckDB: загрузка JSON, партиционирование, автоматические триггеры, MCP-сервер, учёт lineage.
* `INSTALL duck_block_utils FROM community;` — создание, преобразование, проверка и извлечение данных из структурированных документов через единый тип `duck_block`.
