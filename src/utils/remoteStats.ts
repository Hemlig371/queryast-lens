// Статистика по набору данных в БД («Обновить по БД» в DataStatsViewer): текст запроса и разбор ответа. Отдельно от компонента ради тестов.

export interface RemoteColumnStats {
  count: number;
  nullPct: number;
  uniqueCount: any;
  sum?: number;
  avg?: number;
  min?: any;
  max?: any;
}

/**
 * Запрос статистики по всем столбцам источника `target`.
 * `total_count` — число строк (`count(*)`), а не число значений без NULL: от него зависят «Строк», среднее и доля NULL.
 */
export function buildRemoteStatsQuery(target: string, limitClause: string, isClickhouse: boolean): string {
  if (isClickhouse) {
    // первый SELECT задаёт имена столбцов результата (`toFloat64(count(<имя>))`), по ним в parseRemoteStatsRows восстанавливаются имена
    return `WITH src AS (
    SELECT * FROM ${target} ${limitClause}
)

SELECT 'non_null_count' AS metric, COLUMNS('.*') APPLY (x -> toFloat64(count(x)))
FROM src

UNION ALL

SELECT 'total_count' AS metric, COLUMNS('.*') APPLY (x -> toFloat64(countIf(isNull(x) OR NOT isNull(x))))
FROM src

UNION ALL

SELECT 'null_count' AS metric, COLUMNS('.*') APPLY (x -> toFloat64(countIf(isNull(x) OR toString(x) = '')))
FROM src

UNION ALL

SELECT 'null_percent' AS metric, COLUMNS('.*') APPLY (x -> round(toFloat64(countIf(isNull(x) OR toString(x) = '')) * 100.0 / count(), 2))
FROM src

UNION ALL

SELECT 'unique_count' AS metric, COLUMNS('.*') APPLY (x -> toFloat64(uniqExact(x)))
FROM src

UNION ALL

SELECT 'sum' AS metric, COLUMNS('.*') APPLY (x -> round(sum(toFloat64OrDefault(toString(x), 0.0)), 4))
FROM src`;
  }
  return `WITH src AS (
    SELECT * FROM ${target} ${limitClause}
)

SELECT 'metric' AS metric, COLUMNS(*)::DOUBLE FROM src WHERE 1=0

UNION ALL

SELECT 'total_count' AS metric, count(CASE WHEN COLUMNS(*) IS NULL OR TRUE THEN 1 END)::DOUBLE FROM src

UNION ALL

SELECT 'null_count' AS metric, sum(CASE WHEN COLUMNS(*) IS NULL OR CAST(COLUMNS(*) AS VARCHAR) = '' THEN 1 ELSE 0 END)::DOUBLE FROM src

UNION ALL

SELECT 'null_percent' AS metric, round(sum(CASE WHEN COLUMNS(*) IS NULL OR CAST(COLUMNS(*) AS VARCHAR) = '' THEN 1 ELSE 0 END) * 100.0 / NULLIF(count(*), 0), 2)::DOUBLE FROM src

UNION ALL

SELECT 'unique_count' AS metric, count(DISTINCT COLUMNS(*))::DOUBLE FROM src

UNION ALL

SELECT 'sum' AS metric, round(COALESCE(sum(TRY_CAST(COLUMNS(*) AS DOUBLE)), 0), 4)::DOUBLE FROM src`;
}

/** Разбор ответа: статистика по столбцам и общее число строк (из `total_count`, если ответ в формате запроса выше). */
export function parseRemoteStatsRows(
  rows: Record<string, any>[],
  isClickhouse: boolean
): { parsed: Record<string, RemoteColumnStats>; totalRows?: number } {
  let processedRows = rows;
  if (isClickhouse) {
    const prefix = 'toFloat64(count(';
    const suffix = '))';
    processedRows = rows.map((row) => {
      const newRow: Record<string, any> = {};
      Object.entries(row).forEach(([key, val]) => {
        if (key === 'metric') {
          newRow[key] = val;
        } else if (key.startsWith(prefix) && key.endsWith(suffix)) {
          const cleanKey = key.slice(prefix.length, key.length - suffix.length);
          newRow[cleanKey] = val;
        } else {
          newRow[key] = val;
        }
      });
      return newRow;
    });
  }

  const parsed: Record<string, RemoteColumnStats> = {};
  let totalRows: number | undefined;

  const metricMap: Record<string, Record<string, any>> = {};
  processedRows.forEach((r) => {
    if (r.metric) metricMap[String(r.metric)] = r;
  });

  if (metricMap['total_count'] || metricMap['null_count']) {
    const totalCountRow = metricMap['total_count'] || {};
    const nullCountRow = metricMap['null_count'] || {};
    const nullPctRow = metricMap['null_percent'] || {};
    const uniqueCountRow = metricMap['unique_count'] || {};
    const sumRow = metricMap['sum'] || {};

    const firstRow = processedRows[0] || {};
    const colKeys = Object.keys(firstRow).filter((k) => k !== 'metric');

    colKeys.forEach((col) => {
      const cnt = Number(totalCountRow[col]) || 0;
      const nCnt = Number(nullCountRow[col]) || 0;
      const nPct = Number(nullPctRow[col]) || 0;
      const uCnt = uniqueCountRow[col] !== undefined ? uniqueCountRow[col] : '-';
      const sVal = sumRow[col] !== undefined && sumRow[col] !== null ? Number(sumRow[col]) : undefined;
      // среднее по значениям без NULL и пустых строк: сумма / (все строки − null_count)
      const validCount = cnt - nCnt;
      const aVal = sVal !== undefined && validCount > 0 ? Number((sVal / validCount).toFixed(2)) : undefined;

      parsed[col] = {
        count: cnt,
        nullPct: nPct,
        uniqueCount: uCnt,
        sum: sVal,
        avg: aVal,
      };
    });
    if (colKeys.length > 0 && totalCountRow[colKeys[0]] !== undefined) totalRows = Number(totalCountRow[colKeys[0]]) || 0;
  } else {
    const getVal = (row: Record<string, any>, ...keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null) return row[k];
        const lowerK = k.toLowerCase();
        for (const rk of Object.keys(row)) {
          if (rk.toLowerCase() === lowerK && row[rk] !== undefined && row[rk] !== null) {
            return row[rk];
          }
        }
      }
      return undefined;
    };

    processedRows.forEach((row) => {
      const colName = String(getVal(row, 'column_name', 'name') ?? '');
      if (!colName) return;

      const countVal = Number(getVal(row, 'count')) || 0;
      const rawNullPct = getVal(row, 'null_percentage', 'null_pct', 'null_percent');
      let nullPct = 0;
      if (typeof rawNullPct === 'number') {
        nullPct = rawNullPct;
      } else if (typeof rawNullPct === 'string') {
        nullPct = parseFloat(rawNullPct.replace('%', '')) || 0;
      }

      const approxUniq = getVal(row, 'approx_unique', 'unique_count', 'unique');
      const minVal = getVal(row, 'min');
      const maxVal = getVal(row, 'max');
      const avgVal = getVal(row, 'avg');

      parsed[colName] = {
        count: countVal,
        nullPct: Number(nullPct.toFixed(2)),
        uniqueCount: approxUniq !== undefined && approxUniq !== null ? approxUniq : '-',
        min: minVal,
        max: maxVal,
        avg: avgVal !== undefined && avgVal !== null && !isNaN(Number(avgVal)) ? Number(Number(avgVal).toFixed(2)) : undefined,
      };
    });
  }

  return { parsed, totalRows };
}
