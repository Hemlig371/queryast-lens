import React, { useState, useEffect, useRef } from 'react';
import { 
  Code, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Copy, 
  Check, 
  Search, 
  FolderPlus, 
  Edit3, 
  Layers, 
  X, 
  FileSpreadsheet,
  FileJson,
  Play,
  CornerDownRight,
  Database,
  Star
} from 'lucide-react';
import { SqlEditor, highlightSqlHtml } from './SqlEditor';

export interface Snippet {
  id: string;
  title: string;
  category: string;
  sql: string;
  description?: string;
  dialect?: string;
  isCustom?: boolean;
}

export const POPULAR_SNIPPETS: Snippet[] = [
  // ==========================================
  // SELECT & ФИЛЬТРАЦИЯ (10 snippets)
  // ==========================================
  {
    id: 'gen-select-basic',
    title: 'SELECT — Базовый выбор с фильтром и сортировкой',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Основной синтаксис выборки колонок, условий WHERE и ограничения LIMIT.',
    sql: `SELECT id, first_name, last_name, email, created_at\nFROM users\nWHERE status = 'active'\n  AND age >= 18\nORDER BY created_at DESC\nLIMIT 50;`
  },
  {
    id: 'gen-case-when',
    title: 'CASE WHEN — Условная логика и разметка',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Аналог конструкции IF-ELSE для формирования вычисляемых категорий.',
    sql: `SELECT \n    id,\n    amount,\n    CASE \n        WHEN amount >= 100000 THEN 'VIP'\n        WHEN amount >= 25000 THEN 'Gold'\n        WHEN amount >= 5000 THEN 'Silver'\n        ELSE 'Standard'\n    END AS customer_tier\nFROM customer_balances;`
  },
  {
    id: 'gen-coalesce-nullif',
    title: 'COALESCE & NULLIF — Защита от NULL и деления на 0',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Подстановка первого не-NULL значения и предотвращение ошибки Division by Zero.',
    sql: `SELECT \n    user_id,\n    COALESCE(phone, mobile, email, 'Нет контактов') AS primary_contact,\n    total_revenue / NULLIF(total_clicks, 0) AS revenue_per_click\nFROM campaign_stats;`
  },
  {
    id: 'gen-like-ilike',
    title: 'LIKE & Wildcards — Поиск по подстроке',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Поиск по шаблону с использованием специального символа % (любая длина).',
    sql: `SELECT id, title, description\nFROM articles\nWHERE title LIKE '%SQL%'\n   OR description LIKE '%database%'\nORDER BY id DESC;`
  },
  {
    id: 'gen-between-in',
    title: 'BETWEEN & IN — Диапазоны и перечисления',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Лаконичная фильтрация значений в промежутке чисел/дат или из точного списка.',
    sql: `SELECT id, name, price, status\nFROM inventory\nWHERE price BETWEEN 1000 AND 5000\n  AND status IN ('in_stock', 'preorder', 'discounted');`
  },
  {
    id: 'gen-distinct',
    title: 'DISTINCT — Выборка уникальных значений',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Исключение дубликатов из результата выборки по указанным колонкам.',
    sql: `SELECT DISTINCT category_id, country_code\nFROM customers\nWHERE is_active = true;`
  },
  {
    id: 'gen-order-nulls',
    title: 'ORDER BY ... NULLS FIRST / LAST',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Явный контроль расположения не заведенных (NULL) значений при сортировке.',
    sql: `SELECT id, name, rating, priority\nFROM tasks\nORDER BY priority DESC NULLS LAST, rating DESC;`
  },
  {
    id: 'gen-limit-offset',
    title: 'LIMIT & OFFSET — Постраничный вывод (Pagination)',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Извлечение определенной порции данных со смещением для страниц списка.',
    sql: `SELECT id, title, price\nFROM products\nORDER BY id ASC\nLIMIT 20 OFFSET 40;`
  },
  {
    id: 'gen-where-or-and',
    title: 'Сложные скобочные условия WHERE (AND / OR)',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Правильная группировка логических условий скобками для исключения ошибок приоритета.',
    sql: `SELECT id, user_id, status, amount\nFROM orders\nWHERE (status = 'completed' OR status = 'shipped')\n  AND (amount > 5000 OR is_vip = true)\n  AND is_cancelled = false;`
  },
  {
    id: 'gen-cast-type',
    title: 'CAST / :: — Приведение типов данных',
    category: 'SELECT & Фильтрация',
    dialect: 'General',
    description: 'Преобразование текстовых значений в числа, даты или логические булевы типы.',
    sql: `SELECT \n    id,\n    CAST(price_str AS NUMERIC(10, 2)) AS clean_price,\n    CAST(created_str AS DATE) AS order_date\nFROM raw_imports;`
  },

  // ==========================================
  // АГРЕГАЦИЯ & GROUP BY (7 snippets)
  // ==========================================
  {
    id: 'gen-group-by',
    title: 'GROUP BY — Агрегация (COUNT, SUM, AVG, MIN, MAX)',
    category: 'Агрегация & GROUP BY',
    dialect: 'General',
    description: 'Группировка записей и вычисление итоговых метрик по категориям.',
    sql: `SELECT \n    category_id,\n    COUNT(*) AS total_items,\n    SUM(price) AS total_value,\n    ROUND(AVG(price), 2) AS avg_price,\n    MIN(price) AS min_price,\n    MAX(price) AS max_price\nFROM products\nWHERE is_available = true\nGROUP BY category_id\nORDER BY total_value DESC;`
  },
  {
    id: 'gen-having',
    title: 'HAVING — Фильтрация после группировки',
    category: 'Агрегация & GROUP BY',
    dialect: 'General',
    description: 'Фильтрация агрегированных результатов (в отличие от WHERE для строк).',
    sql: `SELECT \n    user_id,\n    COUNT(id) AS total_orders,\n    SUM(amount) AS total_spent\nFROM orders\nGROUP BY user_id\nHAVING COUNT(id) >= 5 AND SUM(amount) > 10000\nORDER BY total_spent DESC;`
  },
  {
    id: 'gen-count-distinct',
    title: 'COUNT(DISTINCT) — Подсчет уникальных элементов',
    category: 'Агрегация & GROUP BY',
    dialect: 'General',
    description: 'Подсчет количества неповторяющихся сущностей внутри каждой группы.',
    sql: `SELECT \n    region,\n    COUNT(DISTINCT user_id) AS unique_buyers,\n    COUNT(id) AS total_orders\nFROM sales_log\nGROUP BY region;`
  },
  {
    id: 'gen-grouping-sets',
    title: 'GROUPING SETS — Множественная группировка',
    category: 'Агрегация & GROUP BY',
    dialect: 'General',
    description: 'Вычисление нескольких агрегаций с разным уровнем детализации в одном запросе.',
    sql: `SELECT \n    year,\n    region,\n    category,\n    SUM(amount) AS total_sales\nFROM sales\nGROUP BY GROUPING SETS (\n    (year, region, category),\n    (year, region),\n    (year),\n    ()\n);`
  },
  {
    id: 'gen-rollup',
    title: 'ROLLUP — Иерархические подытоги',
    category: 'Агрегация & GROUP BY',
    dialect: 'General',
    description: 'Автоматическое формирование промежуточных и общих итогов сверху вниз.',
    sql: `SELECT \n    country,\n    city,\n    SUM(revenue) AS revenue\nFROM store_sales\nGROUP BY ROLLUP (country, city);`
  },
  {
    id: 'gen-cube',
    title: 'CUBE — Многомерный комбинаторный анализ',
    category: 'Агрегация & GROUP BY',
    dialect: 'General',
    description: 'Генерация абсолютно всех возможных перекрестных подытогов для колонок.',
    sql: `SELECT \n    department_id,\n    job_id,\n    AVG(salary) AS avg_sal\nFROM employees\nGROUP BY CUBE (department_id, job_id);`
  },
  {
    id: 'gen-conditional-agg',
    title: 'Условная агрегация через CASE в SUM / COUNT',
    category: 'Агрегация & GROUP BY',
    dialect: 'General',
    description: 'Подсчет выборочных показателей по категориям в одной и той же строке.',
    sql: `SELECT \n    merchant_id,\n    SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_total,\n    SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) AS refunded_total,\n    COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_count\nFROM payments\nGROUP BY merchant_id;`
  },

  // ==========================================
  // СОЕДИНЕНИЯ (JOIN) (6 snippets)
  // ==========================================
  {
    id: 'gen-inner-join',
    title: 'INNER JOIN — Соединение совпадающих строк',
    category: 'Соединения (JOIN)',
    dialect: 'General',
    description: 'Выборка данных только из тех строк, которые присутствуют в обеих таблицах.',
    sql: `SELECT \n    o.id AS order_id,\n    o.order_date,\n    u.name AS customer_name,\n    u.email\nFROM orders o\nINNER JOIN users u ON o.user_id = u.id\nWHERE o.status = 'completed';`
  },
  {
    id: 'gen-left-join',
    title: 'LEFT JOIN — Сохранение всех строк левой таблицы',
    category: 'Соединения (JOIN)',
    dialect: 'General',
    description: 'Поиск всех пользователей, включая тех, у кого нет ни одного заказа (IS NULL).',
    sql: `SELECT \n    u.id AS user_id,\n    u.name,\n    u.email\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE o.id IS NULL;`
  },
  {
    id: 'gen-full-outer-join',
    title: 'FULL OUTER JOIN — Полное внешнее соединение',
    category: 'Соединения (JOIN)',
    dialect: 'General',
    description: 'Возврат всех строк из обеих таблиц с подстановкой NULL при отсутствии связей.',
    sql: `SELECT \n    e.employee_id,\n    e.name AS employee_name,\n    d.department_id,\n    d.department_name\nFROM employees e\nFULL OUTER JOIN departments d ON e.department_id = d.id;`
  },
  {
    id: 'gen-cross-join',
    title: 'CROSS JOIN — Декартово произведение',
    category: 'Соединения (JOIN)',
    dialect: 'General',
    description: 'Генерация всех возможных комбинаций пар строк из двух таблиц.',
    sql: `SELECT \n    p.product_name,\n    s.size_code\nFROM products p\nCROSS JOIN sizes s\nWHERE p.category = 'Apparel';`
  },
  {
    id: 'gen-self-join',
    title: 'SELF JOIN — Соединение таблицы с самой собой',
    category: 'Соединения (JOIN)',
    dialect: 'General',
    description: 'Сравнение записей внутри одной таблицы (например, сотрудники и менеджеры).',
    sql: `SELECT \n    e.id AS emp_id,\n    e.name AS employee_name,\n    m.name AS manager_name\nFROM employees e\nLEFT JOIN employees m ON e.manager_id = m.id;`
  },
  {
    id: 'gen-multi-join',
    title: 'Множественное соединение цепочки таблиц',
    category: 'Соединения (JOIN)',
    dialect: 'General',
    description: 'Последовательное связывание заказов, клиентов, товаров и категорий.',
    sql: `SELECT \n    o.id AS order_id,\n    c.name AS customer_name,\n    p.title AS product_name,\n    cat.name AS category_name\nFROM orders o\nJOIN customers c ON o.customer_id = c.id\nJOIN order_items oi ON o.id = oi.order_id\nJOIN products p ON oi.product_id = p.id\nJOIN categories cat ON p.category_id = cat.id;`
  },

  // ==========================================
  // ПОДЗАПРОСЫ & CTE (7 snippets)
  // ==========================================
  {
    id: 'gen-cte-basic',
    title: 'WITH (CTE) — Временные обобщенные таблицы',
    category: 'Подзапросы & CTE',
    dialect: 'General',
    description: 'Улучшение читаемости сложных запросов за счет выделения логических блоков.',
    sql: `WITH monthly_sales AS (\n    SELECT \n        user_id,\n        SUM(amount) AS total_amount\n    FROM orders\n    WHERE order_date >= '2025-01-01'\n    GROUP BY user_id\n)\nSELECT \n    ms.user_id,\n    u.name,\n    ms.total_amount\nFROM monthly_sales ms\nJOIN users u ON ms.user_id = u.id\nWHERE ms.total_amount > 50000;`
  },
  {
    id: 'gen-multiple-ctes',
    title: 'Множественные CTE — Пошаговые подзапросы',
    category: 'Подзапросы & CTE',
    dialect: 'General',
    description: 'Цепочка нескольких временных таблиц в одном SQL запросе через запятую.',
    sql: `WITH active_users AS (\n    SELECT id, name FROM users WHERE is_active = true\n),\nuser_orders AS (\n    SELECT user_id, COUNT(*) AS order_count, SUM(total) AS revenue\n    FROM orders\n    GROUP BY user_id\n)\nSELECT \n    au.id,\n    au.name,\n    COALESCE(uo.order_count, 0) AS order_count,\n    COALESCE(uo.revenue, 0) AS revenue\nFROM active_users au\nLEFT JOIN user_orders uo ON au.id = uo.user_id;`
  },
  {
    id: 'gen-subquery-in',
    title: 'Подзапрос в WHERE (IN / NOT IN)',
    category: 'Подзапросы & CTE',
    dialect: 'General',
    description: 'Фильтрация строк на основе списка значений, полученного из другого подзапроса.',
    sql: `SELECT id, title, price\nFROM products\nWHERE category_id IN (\n    SELECT id \n    FROM categories \n    WHERE is_featured = true\n);`
  },
  {
    id: 'gen-subquery-exists',
    title: 'Подзапрос EXISTS / NOT EXISTS',
    category: 'Подзапросы & CTE',
    dialect: 'General',
    description: 'Быстрая проверка наличия связанных записей без выгрузки их в память.',
    sql: `SELECT c.id, c.company_name\nFROM customers c\nWHERE EXISTS (\n    SELECT 1 \n    FROM invoices i \n    WHERE i.customer_id = c.id \n      AND i.status = 'unpaid'\n);`
  },
  {
    id: 'gen-union-all',
    title: 'UNION & UNION ALL — Объединение множеств',
    category: 'Подзапросы & CTE',
    dialect: 'General',
    description: 'Объединение строк из нескольких таблиц с одинаковой структурой (ALL сохраняет дубликаты).',
    sql: `SELECT id, name, 'Customer' AS role FROM customers\nUNION ALL\nSELECT id, name, 'Supplier' AS role FROM suppliers\nORDER BY name;`
  },
  {
    id: 'gen-intersect-except',
    title: 'INTERSECT & EXCEPT — Пересечение и разность множеств',
    category: 'Подзапросы & CTE',
    dialect: 'General',
    description: 'Поиск общих строк (INTERSECT) или исключение строк из первого набора (EXCEPT).',
    sql: `SELECT user_id FROM newsletter_subscribers\nEXCEPT\nSELECT user_id FROM unsubscribed_users;`
  },
  {
    id: 'gen-correlated-subquery',
    title: 'Коррелированный подзапрос в проекции SELECT',
    category: 'Подзапросы & CTE',
    dialect: 'General',
    description: 'Подсчет точечных метрик для каждой отдельной строки внешнего запроса.',
    sql: `SELECT \n    u.id,\n    u.name,\n    (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id) AS last_order_date\nFROM users u;`
  },

  // ==========================================
  // ОКОННЫЕ ФУНКЦИИ (6 snippets)
  // ==========================================
  {
    id: 'gen-row-number',
    title: 'ROW_NUMBER() — Ранжирование и топ-1 в группе',
    category: 'Оконные функции',
    dialect: 'General',
    description: 'Присвоение уникального порядкового номера строке внутри каждой секции.',
    sql: `WITH ranked_orders AS (\n    SELECT \n        id,\n        user_id,\n        amount,\n        created_at,\n        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) AS rn\n    FROM orders\n)\nSELECT * \nFROM ranked_orders \nWHERE rn = 1;`
  },
  {
    id: 'gen-rank-dense-rank',
    title: 'RANK & DENSE_RANK — Порядковые ранги',
    category: 'Оконные функции',
    dialect: 'General',
    description: 'Ранжирование с пропуском повторов (RANK) или без пропусков (DENSE_RANK).',
    sql: `SELECT \n    employee_id,\n    department_id,\n    salary,\n    RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rank_num,\n    DENSE_RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS dense_rank_num\nFROM employees;`
  },
  {
    id: 'gen-running-total',
    title: 'Нарастающий итог (Running Total)',
    category: 'Оконные функции',
    dialect: 'General',
    description: 'Вычисление накопительного суммарного итога от начала периода до текущей строки.',
    sql: `SELECT \n    order_date,\n    amount,\n    SUM(amount) OVER (ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total\nFROM daily_sales;`
  },
  {
    id: 'gen-lead-lag',
    title: 'LEAD & LAG — Доступ к соседним строкам',
    category: 'Оконные функции',
    dialect: 'General',
    description: 'Получение значений из предыдущей (LAG) или следующей (LEAD) строки без JOIN.',
    sql: `SELECT \n    user_id,\n    created_at,\n    amount,\n    LAG(amount, 1) OVER (PARTITION BY user_id ORDER BY created_at) AS prev_amount,\n    LEAD(amount, 1) OVER (PARTITION BY user_id ORDER BY created_at) AS next_amount\nFROM orders;`
  },
  {
    id: 'gen-first-last-value',
    title: 'FIRST_VALUE & LAST_VALUE — Граничные значения группы',
    category: 'Оконные функции',
    dialect: 'General',
    description: 'Получение первого и последнего элемента в отсортированной группе.',
    sql: `SELECT \n    user_id,\n    amount,\n    FIRST_VALUE(amount) OVER (PARTITION BY user_id ORDER BY created_at) AS initial_purchase,\n    LAST_VALUE(amount) OVER (PARTITION BY user_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS latest_purchase\nFROM orders;`
  },
  {
    id: 'gen-moving-average',
    title: 'Скользящее среднее (Moving Average)',
    category: 'Оконные функции',
    dialect: 'General',
    description: 'Расчет сглаженного среднего показателя за окно из 3 предшествующих дней.',
    sql: `SELECT \n    sale_date,\n    revenue,\n    AVG(revenue) OVER (ORDER BY sale_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg_3d\nFROM daily_metrics;`
  },

  // ==========================================
  // МОДИФИКАЦИЯ ДАННЫХ (DML) (6 snippets)
  // ==========================================
  {
    id: 'gen-insert-values',
    title: 'INSERT INTO ... VALUES — Вставка нескольких строк',
    category: 'Модификация данных (DML)',
    dialect: 'General',
    description: 'Добавление сразу нескольких записей в таблицу за одну операцию.',
    sql: `INSERT INTO categories (name, slug, is_active, display_order)\nVALUES \n    ('Электроника', 'electronics', true, 1),\n    ('Одежда', 'apparel', true, 2),\n    ('Книги', 'books', false, 3);`
  },
  {
    id: 'gen-insert-select',
    title: 'INSERT INTO ... SELECT — Вставка из подзапроса',
    category: 'Модификация данных (DML)',
    dialect: 'General',
    description: 'Копирование или архивный перенос данных из одной таблицы в другую.',
    sql: `INSERT INTO archive_orders (id, user_id, amount, created_at)\nSELECT id, user_id, amount, created_at\nFROM orders\nWHERE created_at < '2024-01-01';`
  },
  {
    id: 'gen-update-basic',
    title: 'UPDATE — Изменение записей с фильтром',
    category: 'Модификация данных (DML)',
    dialect: 'General',
    description: 'Обновление значения полей для всех строк, удовлетворяющих условию WHERE.',
    sql: `UPDATE products\nSET \n    price = price * 1.10,\n    updated_at = CURRENT_TIMESTAMP\nWHERE category_id = 5 \n  AND stock_quantity > 0;`
  },
  {
    id: 'gen-update-join',
    title: 'UPDATE по условию подзапроса',
    category: 'Модификация данных (DML)',
    dialect: 'General',
    description: 'Изменение статуса пользователей на основе условий из связанной таблицы.',
    sql: `UPDATE users\nSET is_vip = true\nWHERE id IN (\n    SELECT user_id \n    FROM orders \n    GROUP BY user_id \n    HAVING SUM(amount) > 100000\n);`
  },
  {
    id: 'gen-delete-basic',
    title: 'DELETE FROM — Безопасное удаление строк',
    category: 'Модификация данных (DML)',
    dialect: 'General',
    description: 'Удаление устаревших данных с обязательным использованием условий WHERE.',
    sql: `DELETE FROM temp_sessions\nWHERE last_activity < CURRENT_TIMESTAMP - INTERVAL '7 days';`
  },
  {
    id: 'gen-upsert-generic',
    title: 'MERGE / UPSERT — Совмещенная вставка или обновление',
    category: 'Модификация данных (DML)',
    dialect: 'General',
    description: 'Обновление суествующих записей или добавление новых при отсутствии совпадений.',
    sql: `MERGE INTO target_table t\nUSING source_table s\nON (t.id = s.id)\nWHEN MATCHED THEN\n  UPDATE SET t.val = s.val, t.updated_at = CURRENT_TIMESTAMP\nWHEN NOT MATCHED THEN\n  INSERT (id, val, created_at) VALUES (s.id, s.val, CURRENT_TIMESTAMP);`
  },

  // ==========================================
  // СХЕМА И ТАБЛИЦЫ (DDL) (4 snippets)
  // ==========================================
  {
    id: 'gen-create-table',
    title: 'CREATE TABLE — Таблица с PK, FK и CHECK',
    category: 'Схема и Таблицы (DDL)',
    dialect: 'General',
    description: 'Создание таблицы с внешними ключами, каскадным удалением и валидацией.',
    sql: `CREATE TABLE IF NOT EXISTS orders (\n    id BIGINT PRIMARY KEY,\n    user_id BIGINT NOT NULL,\n    status VARCHAR(50) DEFAULT 'pending',\n    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE\n);`
  },
  {
    id: 'gen-alter-table',
    title: 'ALTER TABLE — Изменение колонок таблицы',
    category: 'Схема и Таблицы (DDL)',
    dialect: 'General',
    description: 'Добавление новых колонок, изменение ограничений и удаление неиспользуемых полей.',
    sql: `ALTER TABLE users \n    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),\n    ALTER COLUMN email SET NOT NULL,\n    DROP COLUMN IF EXISTS legacy_token;`
  },
  {
    id: 'gen-create-index',
    title: 'CREATE INDEX — Создание индексов',
    category: 'Схема и Таблицы (DDL)',
    dialect: 'General',
    description: 'Создание уникального или частичного индекса для ускорения поиска по колонкам.',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active \nON users (email) \nWHERE is_deleted = false;`
  },
  {
    id: 'gen-create-view',
    title: 'CREATE VIEW — Сохранение готового представления',
    category: 'Схема и Таблицы (DDL)',
    dialect: 'General',
    description: 'Виртуальная таблица на основе готового запроса для упрощения аналитики.',
    sql: `CREATE OR REPLACE VIEW v_active_customer_stats AS\nSELECT \n    u.id AS user_id,\n    u.email,\n    COUNT(o.id) AS total_orders,\n    COALESCE(SUM(o.amount), 0) AS total_spent\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id AND o.status = 'completed'\nWHERE u.status = 'active'\nGROUP BY u.id, u.email;`
  },

  // ==========================================
  // ФУНКЦИИ СТРОК & ДАТ (4 snippets)
  // ==========================================
  {
    id: 'gen-string-functions',
    title: 'Текстовые функции (CONCAT, LOWER, UPPER)',
    category: 'Функции строк & дат',
    dialect: 'General',
    description: 'Форматирование строк, сшивка полей, нормализация регистра и подстроки.',
    sql: `SELECT \n    id,\n    CONCAT(UPPER(last_name), ' ', first_name) AS full_name_formatted,\n    LOWER(email) AS clean_email,\n    SUBSTRING(phone FROM 1 FOR 4) AS country_code,\n    LENGTH(description) AS desc_length\nFROM client_profiles;`
  },
  {
    id: 'gen-date-functions',
    title: 'Работа с датами и интервалами времени',
    category: 'Функции строк & дат',
    dialect: 'General',
    description: 'Вычисление разницы дат, смещение временных меток через INTERVAL.',
    sql: `SELECT \n    id,\n    created_at,\n    CURRENT_DATE AS today,\n    created_at + INTERVAL '30 days' AS expiration_date\nFROM subscriptions\nWHERE created_at >= CURRENT_DATE - INTERVAL '90 days';`
  },
  {
    id: 'gen-string-split',
    title: 'Замена и зачистка подстрок (REPLACE, TRIM)',
    category: 'Функции строк & дат',
    dialect: 'General',
    description: 'Удаление лишних пробелов и замена символов в текстовых колонках.',
    sql: `SELECT \n    id,\n    TRIM(raw_phone) AS clean_phone,\n    REPLACE(REPLACE(raw_phone, ' ', ''), '-', '') AS digits_only\nFROM user_contacts;`
  },
  {
    id: 'gen-date-diff',
    title: 'Извлечение частей даты (EXTRACT / DATE_PART)',
    category: 'Функции строк & дат',
    dialect: 'General',
    description: 'Выделение года, месяца, дня недели или часа из метки времени.',
    sql: `SELECT \n    id,\n    EXTRACT(YEAR FROM created_at) AS order_year,\n    EXTRACT(MONTH FROM created_at) AS order_month,\n    EXTRACT(DOW FROM created_at) AS day_of_week\nFROM orders;`
  },

  // ==========================================
  // POSTGRESQL (20 snippets)
  // ==========================================
  {
    id: 'pg-jsonb-extract',
    title: 'JSONB — Извлечение и фильтрация по свойствам',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Работа с вложенными структурами JSONB, быстрый поиск по ключам и массивам.',
    sql: `SELECT \n    id,\n    metadata->>'device' AS device_type,\n    metadata->'user'->>'email' AS user_email,\n    metadata->'tags' AS tags_array\nFROM audit_logs\nWHERE metadata @> '{"status": "failed"}'\n  AND metadata->'settings'->>'notifications' = 'true';`
  },
  {
    id: 'pg-upsert-on-conflict',
    title: 'UPSERT — INSERT ... ON CONFLICT DO UPDATE',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Атомарное обновление записи при совпадении уникального ключа (ON CONFLICT).',
    sql: `INSERT INTO user_stats (user_id, views_count, last_visit)\nVALUES (1024, 1, NOW())\nON CONFLICT (user_id) \nDO UPDATE SET \n    views_count = user_stats.views_count + 1,\n    last_visit = EXCLUDED.last_visit;`
  },
  {
    id: 'pg-recursive-cte',
    title: 'Рекурсивный CTE — Иерархические структуры',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Обход древовидных структур (категории, орг. структура) через WITH RECURSIVE.',
    sql: `WITH RECURSIVE org_tree AS (\n    SELECT id, name, manager_id, 1 AS depth\n    FROM employees\n    WHERE manager_id IS NULL\n    UNION ALL\n    SELECT e.id, e.name, e.manager_id, t.depth + 1\n    FROM employees e\n    INNER JOIN org_tree t ON e.manager_id = t.id\n)\nSELECT * FROM org_tree ORDER BY depth, name;`
  },
  {
    id: 'pg-window-lead-lag',
    title: 'Оконные функции LEAD / LAG (Сравнение строк)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Сравнение текущего заказа с предыдущим и следующим для каждого пользователя.',
    sql: `SELECT \n    user_id,\n    created_at,\n    amount,\n    LAG(amount, 1) OVER (PARTITION BY user_id ORDER BY created_at) AS prev_amount,\n    LEAD(created_at, 1) OVER (PARTITION BY user_id ORDER BY created_at) AS next_order_date\nFROM orders;`
  },
  {
    id: 'pg-lateral-join',
    title: 'CROSS JOIN LATERAL — TOP-N записей в группе',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Выборка последних N товаров для каждой отдельной категории.',
    sql: `SELECT \n    c.id AS category_id,\n    c.name AS category_name,\n    p.id AS product_id,\n    p.name AS product_name,\n    p.price\nFROM categories c\nCROSS JOIN LATERAL (\n    SELECT id, name, price \n    FROM products \n    WHERE category_id = c.id \n    ORDER BY price DESC \n    LIMIT 3\n) p;`
  },
  {
    id: 'pg-array-agg',
    title: 'ARRAY_AGG и STRING_AGG (Сворачивание в списки)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Группировка связанных ролей в массивы или строки через разделитель.',
    sql: `SELECT \n    u.id AS user_id,\n    u.email,\n    ARRAY_AGG(r.role_name) AS roles_list,\n    STRING_AGG(r.role_name, ', ') AS roles_string\nFROM users u\nJOIN user_roles ur ON u.id = ur.user_id\nJOIN roles r ON ur.role_id = r.id\nGROUP BY u.id, u.email;`
  },
  {
    id: 'pg-date-trunc',
    title: 'DATE_TRUNC — Агрегация по месяцам/дням',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Усечение временных меток до начала периода для построения динамики продаж.',
    sql: `SELECT \n    DATE_TRUNC('month', created_at) AS order_month,\n    COUNT(id) AS total_orders,\n    SUM(amount) AS total_revenue\nFROM orders\nWHERE created_at >= NOW() - INTERVAL '1 year'\nGROUP BY DATE_TRUNC('month', created_at)\nORDER BY order_month DESC;`
  },
  {
    id: 'pg-explain-analyze',
    title: 'EXPLAIN ANALYZE BUFFERS — Профилирование запроса',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Детальный план выполнения запроса с замером времени и вычитки из кеша.',
    sql: `EXPLAIN (ANALYZE, BUFFERS, COSTS, VERBOSE)\nSELECT u.id, u.name, COUNT(o.id) AS orders_count\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE u.created_at >= '2025-01-01'\nGROUP BY u.id, u.name;`
  },
  {
    id: 'pg-full-outer-join',
    title: 'FULL OUTER JOIN + COALESCE (Сравнение периодов)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Полное внешнее соединение двух списков с подстановкой значения через COALESCE.',
    sql: `SELECT \n    COALESCE(a.user_id, b.user_id) AS user_id,\n    a.amount AS jan_amount,\n    b.amount AS feb_amount\nFROM sales_jan a\nFULL OUTER JOIN sales_feb b ON a.user_id = b.user_id;`
  },
  {
    id: 'pg-partial-index',
    title: 'CREATE INDEX (Частичный и Составной индекс)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Создание неблокирующего частичного индекса с условием WHERE.',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_active_users \nON orders (user_id, created_at DESC) \nWHERE status = 'active';`
  },
  {
    id: 'pg-gen-series',
    title: 'generate_series — Генератор последовательности дат',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Построение непрерывного календаря для соединения с пропущенными фактами.',
    sql: `SELECT generate_series('2025-01-01'::date, '2025-01-31'::date, '1 day'::interval)::date AS calendar_day;`
  },
  {
    id: 'pg-full-text-search',
    title: 'Полнотекстовый поиск (to_tsvector & to_tsquery)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Морфологический поиск по документам с ранжированием ts_rank.',
    sql: `SELECT title, ts_rank(to_tsvector('russian', body), query) AS rank\nFROM articles, to_tsquery('russian', 'база & данные') query\nWHERE to_tsvector('russian', body) @@ query\nORDER BY rank DESC;`
  },
  {
    id: 'pg-range-types',
    title: 'Диапазонные типы (DATERANGE & Оператор @>)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Проверка вхождения даты в забронированный интервал времени.',
    sql: `SELECT id, title, booking_range\nFROM reservations\nWHERE booking_range @> '2025-07-15'::date;`
  },
  {
    id: 'pg-distinct-on',
    title: 'DISTINCT ON — Выборка первой записи в группе',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Уникальная фича PostgreSQL для быстрого поиска свежей записи на юзера.',
    sql: `SELECT DISTINCT ON (user_id) user_id, amount, created_at\nFROM orders\nORDER BY user_id, created_at DESC;`
  },
  {
    id: 'pg-filter-clause',
    title: 'FILTER (WHERE ...) в агрегатных функциях',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Элегантная альтернатива CASE WHEN внутри SUM/COUNT.',
    sql: `SELECT \n    category_id,\n    COUNT(*) AS total_count,\n    COUNT(*) FILTER (WHERE price > 1000) AS expensive_count,\n    SUM(price) FILTER (WHERE is_active = true) AS active_sum\nFROM products\nGROUP BY category_id;`
  },
  {
    id: 'pg-materialized-view',
    title: 'Материализованные представления (CONCURRENTLY)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Сохранение тяжелого отчета на диск с фоновым обновлением.',
    sql: `CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_sales AS\nSELECT DATE_TRUNC('day', created_at) AS day, SUM(amount) AS total\nFROM orders GROUP BY 1;\n\nREFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales;`
  },
  {
    id: 'pg-partitioning',
    title: 'Партиционирование таблиц (PARTITION BY RANGE)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Декларативное деление огромной таблицы на секции по годам.',
    sql: `CREATE TABLE orders_y2025 PARTITION OF orders\nFOR VALUES FROM ('2025-01-01') TO ('2026-01-01');`
  },
  {
    id: 'pg-tablesample',
    title: 'TABLESAMPLE — Быстрый сэмплинг строк',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Случайная выборка 10% страниц таблицы без полного сканирования.',
    sql: `SELECT id, name, price\nFROM products TABLESAMPLE SYSTEM (10) REPEATABLE (42);`
  },
  {
    id: 'pg-jsonb-path',
    title: 'JSONB Path Queries (jsonb_path_exists)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Запросы к JSON с помощью синтаксиса JSONPath.',
    sql: `SELECT id, payload\nFROM audit_logs\nWHERE jsonb_path_exists(payload, '$.items[*].price ? (@ > 1000)');`
  },
  {
    id: 'pg-advisory-locks',
    title: 'Конкурентные блокировки (pg_try_advisory_lock)',
    category: 'PostgreSQL',
    dialect: 'PostgreSQL',
    description: 'Прикладные рекомендательные блокировки в коде приложений.',
    sql: `SELECT pg_try_advisory_lock(100200300) AS lock_acquired;\n-- По завершении работы: SELECT pg_advisory_unlock(100200300);`
  },

  // ==========================================
  // ORACLE (20 snippets)
  // ==========================================
  {
    id: 'ora-connect-by',
    title: 'CONNECT BY PRIOR — Иерархический запрос',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Классический синтаксис Oracle для работы с древовидными структурами данных.',
    sql: `SELECT \n    LEVEL,\n    employee_id,\n    first_name || ' ' || last_name AS name,\n    manager_id,\n    SYS_CONNECT_BY_PATH(last_name, '/') AS tree_path\nFROM employees\nSTART WITH manager_id IS NULL\nCONNECT BY PRIOR employee_id = manager_id\nORDER SIBLINGS BY last_name;`
  },
  {
    id: 'ora-listagg',
    title: 'LISTAGG — Объединение значений в строку',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Агрегатная функция Oracle для конкатенации текстовых значений с сортировкой.',
    sql: `SELECT \n    department_id,\n    LISTAGG(first_name || ' ' || last_name, ', ') \n        WITHIN GROUP (ORDER BY salary DESC) AS top_employees\nFROM employees\nGROUP BY department_id;`
  },
  {
    id: 'ora-merge-into',
    title: 'MERGE INTO — Атомарный Upsert в Oracle',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Слияние источника и приемника с обновлением или вставкой новых строк.',
    sql: `MERGE INTO target_customers t\nUSING source_customers s\nON (t.customer_id = s.customer_id)\nWHEN MATCHED THEN\n    UPDATE SET t.email = s.email, t.updated_at = SYSDATE\nWHEN NOT MATCHED THEN\n    INSERT (customer_id, email, created_at)\n    VALUES (s.customer_id, s.email, SYSDATE);`
  },
  {
    id: 'ora-offset-fetch',
    title: 'OFFSET FETCH — Постраничный вывод (Oracle 12c+)',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Современная пагинация в Oracle без громоздких подзапросов ROWNUM.',
    sql: `SELECT employee_id, first_name, salary\nFROM employees\nWHERE department_id = 50\nORDER BY salary DESC\nOFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;`
  },
  {
    id: 'ora-pivot',
    title: 'PIVOT — Переворот строк в столбцы',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Транспонирование значений категорий в отдельные динамические колонки.',
    sql: `SELECT * FROM (\n    SELECT department_id, job_id, salary \n    FROM employees\n)\nPIVOT (\n    AVG(salary) FOR job_id IN ('IT_PROG' AS IT, 'SA_REP' AS Sales, 'FI_ACCOUNT' AS Finance)\n);`
  },
  {
    id: 'ora-sys-refcursor',
    title: 'SYS_REFCURSOR — Хранимая процедура с курсором',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Возврат набора данных из PL/SQL процедуры через реф-курсор.',
    sql: `CREATE OR REPLACE PROCEDURE get_dept_employees (\n    p_dept_id IN NUMBER,\n    p_cursor  OUT SYS_REFCURSOR\n) AS\nBEGIN\n    OPEN p_cursor FOR\n        SELECT employee_id, first_name, salary\n        FROM employees\n        WHERE department_id = p_dept_id;\nEND;\n/`
  },
  {
    id: 'ora-json-table',
    title: 'JSON_TABLE — Распаковка JSON документов',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Преобразование элементов JSON массива в реляционную таблицу.',
    sql: `SELECT j.book_id, j.title, j.author\nFROM book_store b,\nJSON_TABLE(b.json_data, '$.books[*]'\n    COLUMNS (\n        book_id PATH '$.id',\n        title PATH '$.title',\n        author PATH '$.author'\n    )\n) j;`
  },
  {
    id: 'ora-flashback-query',
    title: 'FLASHBACK QUERY — Просмотр исторических данных',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Запрос состояния таблицы на момент времени в прошлом (AS OF TIMESTAMP).',
    sql: `SELECT * \nFROM employees AS OF TIMESTAMP (SYSTIMESTAMP - INTERVAL '30' MINUTE)\nWHERE employee_id = 101;`
  },
  {
    id: 'ora-decode-case',
    title: 'DECODE — Функция условного сопоставления',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Специфичная для Oracle компактная альтернатива CASE WHEN.',
    sql: `SELECT \n    first_name,\n    salary,\n    DECODE(department_id, 10, 'Administration', 20, 'Marketing', 30, 'Purchasing', 'Other') AS dept_name\nFROM employees;`
  },
  {
    id: 'ora-sequence-dates',
    title: 'Генерация календаря через DUAL и CONNECT BY',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Быстрое построение последовательности дат текущего месяца без реальной таблицы.',
    sql: `SELECT \n    LEVEL AS day_seq,\n    TRUNC(SYSDATE, 'MM') + LEVEL - 1 AS calc_date\nFROM DUAL\nCONNECT BY LEVEL <= 31;`
  },
  {
    id: 'ora-subquery-factoring',
    title: 'WITH FUNCTION — Встроенная PL/SQL функция в CTE',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Объявление локальной PL/SQL функции прямо внутри SQL запроса (12c+).',
    sql: `WITH FUNCTION calc_bonus(p_salary NUMBER) RETURN NUMBER IS\nBEGIN\n    RETURN p_salary * 0.15;\nEND;\nSELECT employee_id, salary, calc_bonus(salary) AS bonus\nFROM employees WHERE department_id = 10;`
  },
  {
    id: 'ora-match-recognize',
    title: 'MATCH_RECOGNIZE — Поиск паттернов в последовательностях',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Распознавание сложных трендов (падение и рост цен) в рядах данных.',
    sql: `SELECT * FROM stock_prices\nMATCH_RECOGNIZE (\n    PARTITION BY symbol ORDER BY trade_time\n    MEASURES STRT.price AS start_price, LAST(DOWN.price) AS bottom_price\n    PATTERN (STRT DOWN+ UP+)\n    DEFINE DOWN AS DOWN.price < PREV(DOWN.price),\n           UP AS UP.price > PREV(UP.price)\n);`
  },
  {
    id: 'ora-model-clause',
    title: 'MODEL Clause — Многомерные ячеистые расчёты',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Программирование формул как в электронных таблицах Excel внутри SQL.',
    sql: `SELECT country, year, sales\nFROM sales_data\nMODEL PARTITION BY (country)\n  DIMENSION BY (year)\n  MEASURES (sales)\n  RULES (sales[2026] = sales[2025] * 1.10);`
  },
  {
    id: 'ora-result-cache',
    title: 'Хинт RESULT_CACHE — Кеширование результатов',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Указание СУБД закешировать итоговый ответ запроса в SGA памяти.',
    sql: `SELECT /*+ RESULT_CACHE */ category_id, COUNT(*), AVG(price)\nFROM catalog_products\nGROUP BY category_id;`
  },
  {
    id: 'ora-global-temp-table',
    title: 'CREATE GLOBAL TEMPORARY TABLE',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Создание временной таблицы для изолированной сессионной работы.',
    sql: `CREATE GLOBAL TEMPORARY TABLE gtt_session_cart (\n    item_id NUMBER,\n    qty NUMBER\n) ON COMMIT PRESERVE ROWS;`
  },
  {
    id: 'ora-dbms-output',
    title: 'DBMS_OUTPUT.PUT_LINE — Отладочный вывод PL/SQL',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Печать служебных сообщений в анонимных блоках и процедурах.',
    sql: `BEGIN\n    DBMS_OUTPUT.PUT_LINE('Старт обработки финансовой партии...');\nEND;\n/`
  },
  {
    id: 'ora-compound-trigger',
    title: 'Составной триггер (COMPOUND TRIGGER)',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Объединение нескольких фаз срабатывания триггера в одной секции.',
    sql: `CREATE OR REPLACE TRIGGER trg_emp_audit\nFOR UPDATE ON employees\nCOMPOUND TRIGGER\n  BEFORE STATEMENT IS BEGIN NULL; END BEFORE STATEMENT;\nEND;\n/`
  },
  {
    id: 'ora-json-transform',
    title: 'JSON_TRANSFORM — Модификация документов JSON',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Точечное изменение свойств в сохраненных JSON полях.',
    sql: `UPDATE user_profiles\nSET profile_json = JSON_TRANSFORM(profile_json, SET '$.status' = 'ACTIVE', REMOVE '$.temp_token')\nWHERE user_id = 5001;`
  },
  {
    id: 'ora-invisible-index',
    title: 'Невидимые индексы (INVISIBLE INDEX)',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Отключение использования индекса оптимизатором перед его удалением.',
    sql: `ALTER INDEX idx_emp_salary INVISIBLE;`
  },
  {
    id: 'ora-identity-column',
    title: 'Колонки автоинкремента GENERATED AS IDENTITY',
    category: 'Oracle',
    dialect: 'Oracle',
    description: 'Стандартный синтаксис первичного ключа с последовательностью (12c+).',
    sql: `CREATE TABLE app_users (\n    user_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    username VARCHAR2(100) NOT NULL\n);`
  },

  // ==========================================
  // CLICKHOUSE (20 snippets)
  // ==========================================
  {
    id: 'ch-uniq-exact',
    title: 'uniqExact & toStartOfHour — Посещаемость по часам',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Быстрое вычисление точных уникальных пользователей (UAU) и объема событий.',
    sql: `SELECT \n    toStartOfHour(event_time) AS hour_bucket,\n    platform,\n    uniqExact(user_id) AS active_users,\n    count() AS total_hits\nFROM events_log\nWHERE event_date >= today() - 7\nGROUP BY hour_bucket, platform\nORDER BY hour_bucket DESC;`
  },
  {
    id: 'ch-array-join',
    title: 'ARRAY JOIN — Разворачивание массивов в строки',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Преобразование строк с массивами (Array) в множество отдельный строк.',
    sql: `SELECT \n    user_id,\n    tag,\n    event_time\nFROM user_actions\nARRAY JOIN tags AS tag\nWHERE event_date = today();`
  },
  {
    id: 'ch-argmax-argmin',
    title: 'argMax / argMin — Последнее состояние записи',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Получение значения поля, соответствующего максимальному времени обновления.',
    sql: `SELECT \n    user_id,\n    argMax(status, updated_at) AS current_status,\n    argMax(ip, updated_at) AS last_ip\nFROM user_status_logs\nGROUP BY user_id;`
  },
  {
    id: 'ch-replacing-mergetree',
    title: 'ReplacingMergeTree + FINAL / LIMIT BY',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Дедупликация версионированных записей на лету при чтении.',
    sql: `SELECT \n    user_id,\n    email,\n    updated_at\nFROM users_replica FINAL\nWHERE is_active = 1\nLIMIT 10 BY user_id;`
  },
  {
    id: 'ch-quantiles-exact',
    title: 'quantilesExact — Вычисление перцентилей p50, p95, p99',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Точный расчет распределения задержек (Latency metrics) для сервисов.',
    sql: `SELECT \n    service_name,\n    quantilesExact(0.50, 0.90, 0.95, 0.99)(response_time_ms) AS latency_p\nFROM http_requests_log\nWHERE event_date = today()\nGROUP BY service_name;`
  },
  {
    id: 'ch-dict-get',
    title: 'dictGet — Запрос внешних справочников из памяти',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Мгновенное подтягивание атрибутов из внешних словарей без тяжелых JOIN.',
    sql: `SELECT \n    user_id,\n    dictGet('users_dictionary', 'country_code', toUInt64(user_id)) AS country,\n    count() AS total_requests\nFROM requests_stream\nGROUP BY user_id, country;`
  },
  {
    id: 'ch-array-map-filter',
    title: 'arrayMap & arrayFilter — Операции над массивами',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Функциональная фильтрация и трансформационные лямбда-выражения.',
    sql: `SELECT \n    order_id,\n    prices,\n    arrayFilter(x -> x > 100, prices) AS expensive_items,\n    arrayMap(x -> x * 1.2, prices) AS prices_with_vat\nFROM orders_dump;`
  },
  {
    id: 'ch-qualify-window',
    title: 'WINDOW & QUALIFY — Оконная фильтрация',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Отбор первых N событий по времени прямо в блоке QUALIFY.',
    sql: `SELECT \n    user_id,\n    event_time,\n    action,\n    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY event_time DESC) AS rn\nFROM user_events\nQUALIFY rn <= 3;`
  },
  {
    id: 'ch-sample-by',
    title: 'SAMPLE BY — Вероятностное сэмплирование данных',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Быстрое приближенное вычисление метрик на огромных массивах логов.',
    sql: `SELECT \n    page_id,\n    count() * 10 AS estimated_views\nFROM web_analytics SAMPLE 0.1\nWHERE event_date = today()\nGROUP BY page_id;`
  },
  {
    id: 'ch-table-mergetree',
    title: 'CREATE TABLE ENGINE = MergeTree',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Создание оптимальной колонковой таблицы с партиционированием и TTL.',
    sql: `CREATE TABLE IF NOT EXISTS metrics_log (\n    metric_date Date,\n    device_id UUID,\n    value Float64,\n    created_at DateTime\n) ENGINE = MergeTree()\nPARTITION BY toYYYYMM(metric_date)\nORDER BY (device_id, metric_date, created_at)\nTTL metric_date + INTERVAL 3 MONTH;`
  },
  {
    id: 'ch-dictionary-ddl',
    title: 'CREATE DICTIONARY — Внешний кеширующий словарь',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Определение источника справочной информации в памяти СУБД.',
    sql: `CREATE DICTIONARY default.user_dict (\n    id UInt64,\n    country String\n) PRIMARY KEY id\nSOURCE(MYSQL(HOST '127.0.0.1' PORT 3306 USER 'root' PASSWORD 'pass' DB 'app' TABLE 'users'))\nLIFETIME(MIN 300 MAX 600)\nLAYOUT(HASHED());`
  },
  {
    id: 'ch-projections',
    title: 'Проекции таблиц (ALTER TABLE ADD PROJECTION)',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Создание скрытых предварительно отсортированных копий данных.',
    sql: `ALTER TABLE events ADD PROJECTION proj_by_user (\n    SELECT user_id, event_type, count() GROUP BY user_id, event_type\n);`
  },
  {
    id: 'ch-materialized-view',
    title: 'Материализованное представление SummingMergeTree',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Автоматическая суммирующая агрегация на лету при вставке новых логов.',
    sql: `CREATE MATERIALIZED VIEW mv_hourly_stats ENGINE = SummingMergeTree()\nORDER BY (hour, device) AS\nSELECT toStartOfHour(event_time) AS hour, device, count() AS cnt\nFROM events GROUP BY hour, device;`
  },
  {
    id: 'ch-neighbor',
    title: 'neighbor — Доступ к соседним строкам',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Быстрое извлечение предыдущего и следующего значения без тяжелых оконных функций.',
    sql: `SELECT \n    event_time,\n    user_id,\n    neighbor(event_time, -1) AS prev_event_time,\n    neighbor(event_time, 1) AS next_event_time\nFROM user_events ORDER BY event_time;`
  },
  {
    id: 'ch-group-array',
    title: 'groupArray / groupUniqArray — Сворачивание в массив',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Формирование массивов последовательности событий по юзерам.',
    sql: `SELECT user_id, groupArray(action) AS actions_seq, groupUniqArray(page_id) AS pages\nFROM user_clicks GROUP BY user_id;`
  },
  {
    id: 'ch-url-extract',
    title: 'Парсинг URL ссылок (domain, extractURLParameter)',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Извлечение домена и UTM-меток прямо при анализе кликстрима.',
    sql: `SELECT \n    domain(url) AS site_domain,\n    extractURLParameter(url, 'utm_source') AS utm_source,\n    count() AS visits\nFROM web_traffic GROUP BY site_domain, utm_source ORDER BY visits DESC;`
  },
  {
    id: 'ch-geo-distance',
    title: 'Гео-функция greatCircleDistance',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Расчет ортодромического расстояния между географическими координатами в метрах.',
    sql: `SELECT id, greatCircleDistance(37.6173, 55.7558, lon, lat) AS dist_m\nFROM locations WHERE dist_m < 5000;`
  },
  {
    id: 'ch-bitmap',
    title: 'Битовые карты groupBitmapState & bitmapAnd',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Мгновенный пересекающийся подсчет конверсий и воронок на битовых масках.',
    sql: `SELECT bitmapCardinality(bitmapAnd(groupBitmapState(user_id), (SELECT groupBitmapState(user_id) FROM user_actions WHERE action = 'purchase'))) AS conversion;`
  },
  {
    id: 'ch-mutations',
    title: 'Мутации данных (ALTER TABLE DELETE / UPDATE)',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Асинхронное фоновое удаление старых логов в колонковой СУБД.',
    sql: `ALTER TABLE log_events DELETE WHERE event_date < '2024-01-01';`
  },
  {
    id: 'ch-asof-join',
    title: 'ASOF JOIN — Неточное соединение временных меток',
    category: 'Clickhouse',
    dialect: 'Clickhouse',
    description: 'Привязка финансовой транзакции к ближайшему предшествующему клику.',
    sql: `SELECT p.user_id, p.payment_time, c.click_time\nFROM payments p ASOF LEFT JOIN clicks c ON p.user_id = c.user_id AND p.payment_time >= c.click_time;`
  },

  // ==========================================
  // DUCKDB (20 snippets)
  // ==========================================
  {
    id: 'duck-read-parquet-s3',
    title: 'read_parquet / read_csv — Прямое чтение S3 / HTTP',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Чтение файла Parquet по удаленной ссылке без предварительной загрузки в бд.',
    sql: `SELECT \n    country,\n    COUNT(*) AS total_rows,\n    ROUND(AVG(price), 2) AS avg_price\nFROM read_parquet('https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet')\nWHERE passenger_count > 0\nGROUP BY country\nORDER BY total_rows DESC\nLIMIT 20;`
  },
  {
    id: 'duck-pivot-unpivot',
    title: 'PIVOT / UNPIVOT — Встроенный свод таблиц',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Компактный синтаксис PIVOT для быстрых аналитических отчетов.',
    sql: `PIVOT sales_data \nON quarter \nUSING SUM(amount) \nGROUP BY year, region;`
  },
  {
    id: 'duck-qualify-clause',
    title: 'QUALIFY — Фильтрация оконных результатов',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Фильтрация строк по рангу без создания обертки подзапроса.',
    sql: `SELECT \n    user_id,\n    order_id,\n    amount,\n    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) AS rank\nFROM orders\nQUALIFY rank <= 2;`
  },
  {
    id: 'duck-columns-regex',
    title: 'COLUMNS(*) с регулярными выражениями',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Массовое применение трансформаций к колонкам по маске имени.',
    sql: `SELECT \n    id,\n    COLUMNS('^sales_.*') * 1.15 AS sales_with_bonus,\n    COLUMNS('date|time')\nFROM monthly_report;`
  },
  {
    id: 'duck-exclude-replace',
    title: 'EXCLUDE и REPLACE в проекции SELECT',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Выборка всех колонок за исключением секретных плюс модификация отдельных.',
    sql: `SELECT \n    * EXCLUDE (internal_hash, secret_key),\n    REPLACE (LOWER(email) AS email)\nFROM user_credentials;`
  },
  {
    id: 'duck-filter-aggregate',
    title: 'Условные агрегации FILTER (WHERE ...)',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Подсчет выборочных показателей в одной строке агрегата.',
    sql: `SELECT \n    category,\n    SUM(amount) FILTER (WHERE status = 'completed') AS paid_amount,\n    SUM(amount) FILTER (WHERE status = 'pending') AS pending_amount,\n    COUNT(*) FILTER (WHERE is_refunded) AS refunds_count\nFROM transactions\nGROUP BY category;`
  },
  {
    id: 'duck-union-by-name',
    title: 'UNION ALL BY NAME — Объединение по именам',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Соединение таблиц с разным порядком или составом колонок по совпадению имен.',
    sql: `SELECT * FROM sales_2023\nUNION ALL BY NAME\nSELECT * FROM sales_2024;`
  },
  {
    id: 'duck-list-transform',
    title: 'LIST_TRANSFORM & FILTER — Обработка списков',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Лямбда-преобразование элементов встроенных массивов.',
    sql: `SELECT \n    list_transform([1, 2, 3, 4, 5], x -> x * 2) AS doubled_numbers,\n    list_filter([10, 15, 20, 25], x -> x >= 18) AS adults_only;`
  },
  {
    id: 'duck-export-parquet',
    title: 'COPY TO Parquet — Экспорт выборки в файл',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Сохранение результата аналитического запроса в сжатый Parquet с ZSTD.',
    sql: `COPY (\n    SELECT year(order_date) AS yr, SUM(total) AS rev \n    FROM orders \n    GROUP BY yr\n) TO 'analytics_summary.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);`
  },
  {
    id: 'duck-generate-series',
    title: 'generate_series — Построение временных рядов',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Генерация календаря дат с шагом в 1 день для соединения с фактами.',
    sql: `SELECT \n    day::DATE AS calendar_date,\n    dayname(day) AS day_of_week\nFROM generate_series(DATE '2025-01-01', DATE '2025-01-31', INTERVAL '1 day') AS t(day);`
  },
  {
    id: 'duck-read-json',
    title: 'read_json_auto — Автоматический парсинг JSON/NDJSON',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Прямое сканирование сжатых NDJSON файлов из облачного хранилища.',
    sql: `SELECT * FROM read_json_auto('s3://my-bucket/logs/*.json.gz', format='newline_delimited');`
  },
  {
    id: 'duck-attach-db',
    title: 'ATTACH DATABASE — Соединение файлов SQLite / PostgreSQL',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Подключение внешнего SQLite или локального DuckDB файла к сессии.',
    sql: `ATTACH 'production.db' AS prod_db (READ_ONLY);\nSELECT * FROM prod_db.users LIMIT 10;`
  },
  {
    id: 'duck-asof-join',
    title: 'ASOF JOIN — Точное временное слияние биржевых котировок',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Соединение каждой сделки с самым свежим предложенным стаканом цен.',
    sql: `SELECT t.trade_id, t.trade_time, p.quote_time, p.price\nFROM trades t ASOF JOIN quotes p ON t.symbol = p.symbol AND t.trade_time >= p.quote_time;`
  },
  {
    id: 'duck-install-extension',
    title: 'Установка и загрузка расширений (INSTALL & LOAD)',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Подключение векторных гео-модулей (Spatial, FTS, ICU) на лету.',
    sql: `INSTALL spatial;\nLOAD spatial;\nSELECT ST_Point(lon, lat) AS geom FROM locations;`
  },
  {
    id: 'duck-summarize',
    title: 'SUMMARIZE — Мгновенный статистический профиль таблицы',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Генерация отчета по типам, min, max, avg, nulls и перцентилям всех полей.',
    sql: `SUMMARIZE SELECT * FROM read_parquet('analytics.parquet');`
  },
  {
    id: 'duck-describe',
    title: 'DESCRIBE SELECT — Анализ структуры результат запроса',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Инспекция типов колонок сложного подзапроса без его запуска.',
    sql: `DESCRIBE SELECT id, name, price, created_at FROM catalog;`
  },
  {
    id: 'duck-struct-pack',
    title: 'struct_pack & map — Работа со сложными структурами',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Формирование объектов STRUCT и картонированных словарей MAP.',
    sql: `SELECT struct_pack(id := 101, name := 'Item A', meta := map(['tag1', 'tag2'], [10, 20])) AS payload;`
  },
  {
    id: 'duck-union-by-name-files',
    title: 'Загрузка нескольких CSV файлов с автоматическим выравниванием',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Чтение всех файлов директории даже при различающемся наборе колонок.',
    sql: `SELECT * FROM read_csv_auto(['file1.csv', 'file2.csv'], union_by_name=true);`
  },
  {
    id: 'duck-copy-csv-options',
    title: 'COPY TO CSV — Настраиваемый экспорт в файлы',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Сохранение данных в CSV с разделителями и кодировкой UTF-8.',
    sql: `COPY (SELECT * FROM orders WHERE status = 'completed')\nTO 'completed_orders.csv' (HEADER, DELIMITER ';', ENCODING 'UTF-8');`
  },
  {
    id: 'duck-sniff-csv',
    title: 'sniff_csv — Автоопределение типов и разделителей CSV',
    category: 'DuckDB',
    dialect: 'DuckDB',
    description: 'Диагностика параметров непознанного текстового файла перед импортом.',
    sql: `SELECT * FROM sniff_csv('unstructured_data.csv');`
  }
];

import { UiVisibilitySettings } from './SettingsModal';

interface SqlSnippetsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSnippet: (snippetSql: string, replaceMode?: boolean) => void;
  theme: 'dark' | 'light';
  uiVisibility?: UiVisibilitySettings;
}

const LOCAL_STORAGE_KEY = 'sql_custom_snippets_v2';
const LOCAL_STORAGE_FAVORITES_KEY = 'sql_favorite_snippets_ids_v1';
const LOCAL_STORAGE_DELETED_KEY = 'sql_deleted_snippets_ids_v1';

export function SqlSnippetsManager({
  isOpen,
  onClose,
  onInsertSnippet,
  theme,
  uiVisibility
}: SqlSnippetsManagerProps) {
  const [customSnippets, setCustomSnippets] = useState<Snippet[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Избранное');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Запросы');
  const [formSql, setFormSql] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDialect, setFormDialect] = useState<string>('General');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // Load custom snippets, favorites and deleted IDs
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        setCustomSnippets(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to parse custom snippets from localStorage', e);
    }
    try {
      const savedFavs = localStorage.getItem(LOCAL_STORAGE_FAVORITES_KEY);
      if (savedFavs) {
        setFavoriteIds(JSON.parse(savedFavs));
      }
    } catch (e) {
      console.error('Failed to parse favorites from localStorage', e);
    }
    try {
      const savedDeleted = localStorage.getItem(LOCAL_STORAGE_DELETED_KEY);
      if (savedDeleted) {
        const parsed: string[] = JSON.parse(savedDeleted);
        // Only keep IDs that correspond to built-in popular snippets
        const popularIdsSet = new Set(POPULAR_SNIPPETS.map(s => s.id));
        const cleaned = parsed.filter(id => popularIdsSet.has(id));
        setDeletedIds(cleaned);
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(cleaned));
        }
      }
    } catch (e) {
      console.error('Failed to parse deleted snippets from localStorage', e);
    }
  }, []);

  const saveCustomSnippetsToStorage = (snippets: Snippet[]) => {
    setCustomSnippets(snippets);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snippets));
    } catch (e) {
      console.error('Failed to save custom snippets to localStorage', e);
    }
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updated: string[];
    if (favoriteIds.includes(id)) {
      updated = favoriteIds.filter(fId => fId !== id);
    } else {
      updated = [...favoriteIds, id];
    }
    setFavoriteIds(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_FAVORITES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save favorites to localStorage', e);
    }
  };

  if (!isOpen) return null;

  // Deduplicate and filter out deleted snippets
  const customIds = new Set(customSnippets.map(s => s.id));
  const popularFiltered = POPULAR_SNIPPETS.filter(s => !customIds.has(s.id));
  const rawSnippets = [...customSnippets, ...popularFiltered];
  const allSnippets = rawSnippets.filter(s => !deletedIds.includes(s.id));

  // Extract all distinct dialects and regular categories
  const rawDialects = Array.from(
    new Set(allSnippets.map(s => s.dialect).filter((d): d is string => Boolean(d)))
  );
  
  // Set of dialects to separate them into bottom group
  const knownDialectSet = new Set([
    'General', 'PostgreSQL', 'Oracle', 'Clickhouse', 'ClickHouse', 'DuckDB', 'MySQL', 'SQLite', 'MS SQL', 'Snowflake',
    ...rawDialects
  ]);

  const rawCategories = Array.from(new Set(allSnippets.map(s => s.category))).filter(Boolean);
  const regularCategories = rawCategories.filter(c => !knownDialectSet.has(c));
  const activeDialects = Array.from(new Set(allSnippets.map(s => s.dialect).filter((d): d is string => Boolean(d))));

  // Sort alphabetically
  const sortedCategories = [...regularCategories].sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
  const sortedDialects = [...activeDialects].sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));

  const categories = Array.from(new Set([
    'Все', 
    ...(uiVisibility?.showSnippetFavorites !== false ? ['Избранное'] : []), 
    ...sortedCategories,
    ...sortedDialects
  ]));

  const categorySuggestions = Array.from(new Set(['Запросы', 'Схемы', 'Агрегаты', 'Соединения (JOIN)', 'Транзакции', ...regularCategories]));
  const dialectSuggestions = Array.from(new Set(['General', 'PostgreSQL', 'MySQL', 'SQLite', 'Oracle', 'ClickHouse', 'DuckDB', 'MS SQL', ...activeDialects]));

  // Filter snippets
  const filteredSnippets = allSnippets.filter(s => {
    const matchesCat = 
      selectedCategory === 'Все' ? true :
      selectedCategory === 'Избранное' ? favoriteIds.includes(s.id) :
      s.category === selectedCategory || s.dialect === selectedCategory;

    const matchesSearch = 
      !searchQuery || 
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.sql.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.category && s.category.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCat && matchesSearch;
  });

  const handleSaveSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formSql.trim()) return;

    const finalCategory = formCategory.trim() || 'Общие';
    const finalDialect = formDialect.trim() || 'General';

    // If this snippet was in deleted list previously, remove it from deleted
    if (editingSnippetId && deletedIds.includes(editingSnippetId)) {
      const updatedDeleted = deletedIds.filter(dId => dId !== editingSnippetId);
      setDeletedIds(updatedDeleted);
      try {
        localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(updatedDeleted));
      } catch (err) {
        console.error('Failed to save deleted snippets to localStorage', err);
      }
    }

    if (editingSnippetId) {
      const existsInCustom = customSnippets.some(s => s.id === editingSnippetId);
      if (existsInCustom) {
        const updated = customSnippets.map(s => {
          if (s.id === editingSnippetId) {
            return {
              ...s,
              title: formTitle,
              category: finalCategory,
              sql: formSql,
              description: formDescription,
              dialect: finalDialect,
              isCustom: true
            };
          }
          return s;
        });
        saveCustomSnippetsToStorage(updated);
      } else {
        const newOverrideSnippet: Snippet = {
          id: editingSnippetId,
          title: formTitle,
          category: finalCategory,
          sql: formSql,
          description: formDescription,
          dialect: finalDialect,
          isCustom: true
        };
        saveCustomSnippetsToStorage([newOverrideSnippet, ...customSnippets]);
      }
    } else {
      const newSnippet: Snippet = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: formTitle,
        category: finalCategory,
        sql: formSql,
        description: formDescription,
        dialect: finalDialect,
        isCustom: true
      };
      saveCustomSnippetsToStorage([newSnippet, ...customSnippets]);
    }

    resetForm();
  };

  const handleDeleteSnippet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // 1. Remove from customSnippets array (for both custom created and custom overrides)
    const updatedCustom = customSnippets.filter(s => s.id !== id);
    saveCustomSnippetsToStorage(updatedCustom);

    // 2. Only store in deletedIds if it is a built-in template from POPULAR_SNIPPETS
    const isBuiltIn = POPULAR_SNIPPETS.some(s => s.id === id);
    if (isBuiltIn) {
      const updatedDeleted = Array.from(new Set([...deletedIds, id]));
      setDeletedIds(updatedDeleted);
      try {
        localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(updatedDeleted));
      } catch (err) {
        console.error('Failed to save deleted snippets to localStorage', err);
      }
    } else if (deletedIds.includes(id)) {
      const updatedDeleted = deletedIds.filter(dId => dId !== id);
      setDeletedIds(updatedDeleted);
      try {
        localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(updatedDeleted));
      } catch (err) {
        console.error('Failed to save deleted snippets to localStorage', err);
      }
    }

    // 3. Remove from favorites if present
    if (favoriteIds.includes(id)) {
      const updatedFavs = favoriteIds.filter(fId => fId !== id);
      setFavoriteIds(updatedFavs);
      try {
        localStorage.setItem(LOCAL_STORAGE_FAVORITES_KEY, JSON.stringify(updatedFavs));
      } catch (err) {
        console.error('Failed to save favorites to localStorage', err);
      }
    }

    if (editingSnippetId === id) {
      resetForm();
    }
  };

  const handleEditSnippet = (snippet: Snippet, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSnippetId(snippet.id);
    setFormTitle(snippet.title);
    setFormCategory(snippet.category);
    setFormSql(snippet.sql);
    setFormDescription(snippet.description || '');
    setFormDialect(snippet.dialect || 'General');
    setIsCreating(true);

    setTimeout(() => {
      if (rightPanelRef.current) {
        rightPanelRef.current.scrollTop = 0;
      }
    }, 0);
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingSnippetId(null);
    setFormTitle('');
    setFormCategory(selectedCategory !== 'Все' ? selectedCategory : 'Запросы');
    setFormSql('');
    setFormDescription('');
    setFormDialect('General');
  };

  const handleCopyCode = (id: string, code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export to JSON
  const handleExportJson = () => {
    const listToExport = customSnippets.length > 0 ? customSnippets : POPULAR_SNIPPETS;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(listToExport, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sql_snippets_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export to CSV
  const handleExportCsv = () => {
    const listToExport = customSnippets.length > 0 ? customSnippets : POPULAR_SNIPPETS;
    const headers = ['id', 'title', 'category', 'dialect', 'description', 'sql'];
    const csvRows = [headers.join(',')];

    listToExport.forEach(s => {
      const row = [
        `"${s.id.replace(/"/g, '""')}"`,
        `"${s.title.replace(/"/g, '""')}"`,
        `"${s.category.replace(/"/g, '""')}"`,
        `"${(s.dialect || 'General').replace(/"/g, '""')}"`,
        `"${(s.description || '').replace(/"/g, '""')}"`,
        `"${s.sql.replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvRows.join('\n'));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", csvContent);
    downloadAnchor.setAttribute("download", `sql_snippets_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import from JSON or CSV
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      try {
        let imported: Snippet[] = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            imported = parsed.map(item => ({
              id: item.id || `custom-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
              title: item.title || 'Импортированный шаблон',
              category: item.category || 'Импорт',
              sql: item.sql || '',
              description: item.description || '',
              dialect: item.dialect || 'General',
              isCustom: true
            }));
          }
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
          if (lines.length > 1) {
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i];
              const matches = line.match(/(?:^|,)(?:"([^"]*)"|([^,]*))/g);
              if (matches && matches.length >= 4) {
                const clean = matches.map(m => m.replace(/^,?"?|"$/g, '').replace(/""/g, '"'));
                imported.push({
                  id: clean[0] || `custom-${Date.now()}-${i}`,
                  title: clean[1] || 'Импортированный шаблон',
                  category: clean[2] || 'Импорт',
                  dialect: (clean[3] as any) || 'General',
                  description: clean[4] || '',
                  sql: clean[5] || clean[clean.length - 1] || '',
                  isCustom: true
                });
              }
            }
          }
        }

        if (imported.length > 0) {
          const existingIds = new Set(customSnippets.map(s => s.id));
          const newEntries = imported.filter(s => !existingIds.has(s.id));
          const merged = [...newEntries, ...customSnippets];
          saveCustomSnippetsToStorage(merged);
          alert(`Успешно импортировано шаблонов: ${newEntries.length}`);
        } else {
          alert('Файл не содержит корректных шаблонов');
        }
      } catch (err) {
        console.error('Import error:', err);
        alert('Ошибка при чтении файла. Проверьте валидность JSON/CSV.');
      }
    };

    if (file.name.endsWith('.json') || file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      alert('Пожалуйста, выберите файл .json или .csv');
    }

    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-2 sm:p-5 animate-in fade-in duration-200">
      <div className={`w-full max-w-5xl h-[90vh] border rounded-xl flex flex-col shadow-2xl overflow-hidden transition-colors ${
        theme === 'dark' ? 'bg-slate-850 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
      }`}>
        
        {/* HEADER */}
        <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b shrink-0 ${
          theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-200/80 border-slate-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-500 border border-blue-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                Библиотека SQL шаблонов
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* EXPORT JSON */}
            <button
              onClick={handleExportJson}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                theme === 'dark' 
                  ? 'bg-slate-750 border-slate-600 text-slate-200 hover:bg-slate-700' 
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs'
              }`}
              title="Экспортировать шаблоны в JSON файл"
            >
              <FileJson className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">Экспорт JSON</span>
            </button>

            {/* EXPORT CSV */}
            <button
              onClick={handleExportCsv}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                theme === 'dark' 
                  ? 'bg-slate-750 border-slate-600 text-slate-200 hover:bg-slate-700' 
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs'
              }`}
              title="Экспортировать шаблоны в CSV Таблицу"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">Экспорт CSV</span>
            </button>

            {/* IMPORT */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                theme === 'dark' 
                  ? 'bg-slate-750 border-slate-600 text-slate-200 hover:bg-slate-700' 
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs'
              }`}
              title="Импортировать шаблоны из файла"
            >
              <Upload className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Импорт</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImportFile} 
              accept=".json,.csv" 
              className="hidden" 
            />

            {uiVisibility?.showSnippetCreateBtn !== false && (
            <>
              <div className="h-5 w-px bg-slate-300 dark:bg-slate-700 my-auto" />

              {/* CREATE CUSTOM SNIPPET */}
              <button
                onClick={() => {
                  resetForm();
                  setIsCreating(true);
                  setTimeout(() => {
                    if (rightPanelRef.current) {
                      rightPanelRef.current.scrollTop = 0;
                    }
                  }, 0);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Создать шаблон</span>
              </button>
            </>
            )}

            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ml-1 ${
                theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-300 text-slate-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MAIN BODY */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* LEFT SIDEBAR: CATEGORIES & SEARCH */}
          {(uiVisibility?.showSnippetSearch !== false || uiVisibility?.showSnippetCategories !== false) && (
          <div className={`w-full md:w-60 border-r flex flex-col p-3 space-y-3 shrink-0 ${
            theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-200/50 border-slate-300'
          }`}>
            
            {/* SEARCH BAR */}
            {uiVisibility?.showSnippetSearch !== false && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск шаблонов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none transition-colors ${
                  theme === 'dark' 
                    ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400 focus:border-blue-500' 
                    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-blue-500 shadow-xs'
                }`}
              />
            </div>
            )}

            {/* CATEGORY LIST */}
            {uiVisibility?.showSnippetCategories !== false && (
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 pt-1 pb-1">
                Категории
              </div>
              {categories.map((cat) => {
                const count = allSnippets.filter(s => 
                  cat === 'Все' ? true :
                  cat === 'Избранное' ? favoriteIds.includes(s.id) :
                  s.category === cat || s.dialect === cat
                ).length;

                const isSelected = selectedCategory === cat;

                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white font-semibold'
                        : theme === 'dark' 
                          ? 'text-slate-300 hover:bg-slate-700/60' 
                          : 'text-slate-700 hover:bg-slate-300/60'
                    }`}
                  >
                    <span className="truncate flex items-center gap-1.5">
                      {cat === 'Избранное' && (
                        <Star className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'fill-amber-300 text-amber-300' : 'fill-amber-400 text-amber-400'}`} />
                      )}
                      {knownDialectSet.has(cat) && cat !== 'Все' && cat !== 'Избранное' && (
                        <Database className="w-3 h-3 text-blue-400 shrink-0" />
                      )}
                      <span>{cat}</span>
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected 
                        ? 'bg-blue-700 text-white' 
                        : theme === 'dark' ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            )}
          </div>
          )}

          {/* RIGHT PANEL: SNIPPETS LIST OR FORM */}
          <div ref={rightPanelRef} className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 relative">
            
            {/* CREATE / EDIT FORM */}
            {isCreating ? (
              <form onSubmit={handleSaveSnippet} className={`p-4 rounded-xl border space-y-3.5 mb-4 animate-in zoom-in-95 duration-150 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300 shadow-md'
              }`}>
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Code className="w-4 h-4 text-blue-500" />
                    <span>{editingSnippetId ? 'Редактировать шаблон' : 'Новый собственный шаблон'}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="p-1 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Название шаблона *</label>
                    <input
                      type="text"
                      required
                      placeholder="Например: JSONB поиск по тегам"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className={`w-full px-3 py-1.5 text-xs rounded-md border outline-none ${
                        theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Категория *</label>
                    <input
                      type="text"
                      required
                      list="category-suggestions"
                      placeholder="Выберите или введите..."
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className={`w-full px-3 py-1.5 text-xs rounded-md border outline-none ${
                        theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    />
                    <datalist id="category-suggestions">
                      {categorySuggestions.map(cat => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Диалект / СУБД</label>
                    <input
                      type="text"
                      list="dialect-suggestions"
                      placeholder="Выберите или введите..."
                      value={formDialect}
                      onChange={(e) => setFormDialect(e.target.value)}
                      className={`w-full px-3 py-1.5 text-xs rounded-md border outline-none ${
                        theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    />
                    <datalist id="dialect-suggestions">
                      {dialectSuggestions.map(d => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Описание (необязательно)</label>
                  <input
                    type="text"
                    placeholder="Краткое пояснение, для чего используется этот шаблон"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className={`w-full px-3 py-1.5 text-xs rounded-md border outline-none ${
                      theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">SQL Код с подсветкой синтаксиса *</label>
                  <div className="h-44 flex flex-col">
                    <SqlEditor
                      value={formSql}
                      onChange={setFormSql}
                      theme={theme}
                      placeholder="SELECT * FROM table_name..."
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                      theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-slate-200 border-slate-300 text-slate-700'
                    }`}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
                  >
                    {editingSnippetId ? 'Сохранить изменения' : 'Добавить шаблон'}
                  </button>
                </div>
              </form>
            ) : null}

            {/* SNIPPETS GRID */}
            <div className="space-y-3">
              {filteredSnippets.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  {selectedCategory === 'Избранное' ? (
                    <Star className="w-10 h-10 mx-auto mb-2 opacity-40 text-amber-400" />
                  ) : (
                    <Code className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  )}
                  <p className="text-sm font-medium">
                    {selectedCategory === 'Избранное' ? 'В избранном пока нет шаблонов' : 'шаблонов в этой категории не найдено'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedCategory === 'Избранное' 
                      ? 'Нажмите на звездочку у любого шаблона, чтобы добавить его в избранное'
                      : 'Нажмите "Создать шаблон" или выберите другую категорию'}
                  </p>
                </div>
              ) : (
                filteredSnippets.map((snippet) => {
                  const isFav = favoriteIds.includes(snippet.id);
                  return (
                    <div 
                      key={snippet.id} 
                      className={`p-3.5 rounded-xl border transition-all hover:border-blue-500/50 group ${
                        theme === 'dark' ? 'bg-slate-800/80 border-slate-700/80' : 'bg-white border-slate-300 shadow-xs'
                      }`}
                    >
                      {/* TOP TITLE & ACTIONS */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                              {snippet.title}
                            </h4>
                            {snippet.dialect && snippet.dialect !== 'General' && (
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono border font-semibold ${
                                snippet.dialect === 'PostgreSQL' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' :
                                snippet.dialect === 'Oracle' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                                snippet.dialect === 'Clickhouse' ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
                                snippet.dialect === 'DuckDB' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' :
                                'bg-slate-500/10 text-slate-500 border-slate-500/30'
                              }`}>
                                {snippet.dialect}
                              </span>
                            )}
                          </div>
                          {snippet.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {snippet.description}
                            </p>
                          )}
                        </div>

                        {/* BUTTONS: FAVORITE, INSERT, REPLACE, COPY, EDIT, DELETE */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* FAVORITE STAR BUTTON */}
                          {uiVisibility?.showSnippetFavorites !== false && (
                          <button
                            onClick={(e) => toggleFavorite(snippet.id, e)}
                            className={`p-1.5 rounded-md border transition-all ${
                              isFav
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
                                : theme === 'dark' 
                                  ? 'bg-slate-750 border-slate-600 text-slate-400 hover:text-amber-400 hover:border-amber-500/40' 
                                  : 'bg-slate-100 border-slate-300 text-slate-400 hover:text-amber-500 hover:border-amber-400'
                            }`}
                            title={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
                          >
                            <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>
                          )}

                          {/* INSERT BUTTON */}
                          <button
                            onClick={() => {
                              onInsertSnippet(snippet.sql, false);
                              onClose();
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-xs transition-all"
                            title="Добавить данный блок в конец редактора SQL"
                          >
                            <CornerDownRight className="w-3.5 h-3.5" />
                            <span>Вставить</span>
                          </button>

                          {/* REPLACE BUTTON */}
                          <button
                            onClick={() => {
                              onInsertSnippet(snippet.sql, true);
                              onClose();
                            }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-all ${
                              theme === 'dark' 
                                ? 'bg-slate-700/80 hover:bg-slate-700 text-slate-200 border-slate-600' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            }`}
                            title="Заменить весь текущий текст SQL данным шаблоном"
                          >
                            <Play className="w-3 h-3 text-emerald-500" />
                            <span>Заменить</span>
                          </button>

                          {/* COPY BUTTON */}
                          <button
                            onClick={(e) => handleCopyCode(snippet.id, snippet.sql, e)}
                            className={`p-1.5 rounded-md border transition-all ${
                              theme === 'dark' 
                                ? 'bg-slate-750 border-slate-600 text-slate-300 hover:text-white' 
                                : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
                            }`}
                            title="Скопировать SQL код"
                          >
                            {copiedId === snippet.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={(e) => handleEditSnippet(snippet, e)}
                            className={`p-1.5 rounded-md border transition-all ${
                              theme === 'dark' 
                                ? 'bg-slate-750 border-slate-600 text-slate-300 hover:text-blue-400' 
                                : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-blue-600'
                            }`}
                            title="Редактировать шаблон"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteSnippet(snippet.id, e)}
                            className={`p-1.5 rounded-md border transition-all ${
                              theme === 'dark' 
                                ? 'bg-slate-750 border-slate-600 text-slate-300 hover:text-red-400' 
                                : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-red-600'
                            }`}
                            title="Удалить шаблон"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* CODE PREVIEW BLOCK WITH SYNTAX HIGHLIGHTING */}
                    <div className={`p-2.5 rounded-lg font-mono text-[11px] leading-relaxed overflow-x-auto max-h-40 ${
                      theme === 'dark' ? 'bg-slate-900/90 border border-slate-800' : 'bg-slate-100/90 border border-slate-200'
                    }`}>
                      <div 
                        dangerouslySetInnerHTML={{ __html: highlightSqlHtml(snippet.sql, theme) }}
                        className="whitespace-pre"
                      />
                    </div>
                  </div>
                );
              })
            )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
