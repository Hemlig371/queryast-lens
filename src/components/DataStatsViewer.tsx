import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toBlob } from 'html-to-image';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { BarChart3, PieChart as PieIcon, TrendingUp, Info, List, Copy, Check, TableProperties, RefreshCw, Loader2, Image as ImageIcon, Code } from 'lucide-react';
import { formatColumnType } from '../lib/sqlUtils';

interface DataStatsViewerProps {
  data: Record<string, any>[];
  theme: 'dark' | 'light';
  columnTypes?: Record<string, string>;
  initialChartType?: 'bar' | 'line' | 'pie' | 'list';
  initialListSubMode?: 'categories' | 'columns';
  onSubModeChange?: (chartType: 'bar' | 'line' | 'pie' | 'list', listSubMode: 'categories' | 'columns') => void;
  isSummarizeMode?: boolean;
  tableName?: string;
  lastExecutedSql?: string;
  activeEngine?: 'duckdb' | 'clickhouse' | null;
  onExecuteQuery?: (sql: string) => Promise<any[]>;
  onInsertSql?: (cols: string[]) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];
const DATE_REGEX = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|^\d{4}-\d{2}-\d{2}/;

const getNullPctColor = (pct: number, isDark: boolean) => {
  if (pct === 0) return isDark ? '#4ade80' : '#16a34a'; // green
  if (pct >= 90) return isDark ? '#f87171' : '#dc2626'; // red
  return isDark ? '#94a3b8' : '#64748b'; // neutral gray for mid-range
};

export const DataStatsViewer: React.FC<DataStatsViewerProps> = ({
  data,
  theme,
  columnTypes,
  initialChartType,
  initialListSubMode,
  onSubModeChange,
  isSummarizeMode = false,
  tableName,
  lastExecutedSql,
  activeEngine,
  onExecuteQuery,
  onInsertSql,
}) => {
  if (!data || data.length === 0) {
    return (
      <div className={`p-4 text-center text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
        Нет данных для визуализации.
      </div>
    );
  }

  const rawColumns = useMemo(() => Object.keys(data[0] || {}), [data]);

  // Classify column types
  const colAnalysis = useMemo(() => {
    const res: Record<
      string,
      {
        type: 'number' | 'string' | 'date';
        nullCount: number;
        nullPct: number;
        uniqueCount: number;
        count: number;
        min?: number;
        max?: number;
        avg?: number;
        sum?: number;
      }
    > = {};

    const isDateValue = (val: any) => {
      if (val instanceof Date) return true;
      if (typeof val === 'string') {
        const s = val.trim();
        if (s.length >= 6 && isNaN(Number(s))) {
          if (DATE_REGEX.test(s) && !isNaN(Date.parse(s))) {
            return true;
          }
        }
      }
      return false;
    };

    rawColumns.forEach((col) => {
      let numCount = 0;
      let dateCount = 0;
      let nullCount = 0;
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      const values = new Set();

      data.forEach((row) => {
        const val = row[col];
        if (val === null || val === undefined || val === '') {
          nullCount++;
        } else {
          values.add(val);
          const num = Number(val);
          if (!isNaN(num) && typeof val !== 'boolean') {
            numCount++;
            sum += num;
            if (num < min) min = num;
            if (num > max) max = num;
          }
          if (isDateValue(val)) {
            dateCount++;
          }
        }
      });

      const totalVal = data.length - nullCount;
      const isNumeric = totalVal > 0 && numCount / totalVal > 0.8;
      const isDate = !isNumeric && totalVal > 0 && dateCount / totalVal > 0.8;

      res[col] = {
        type: isNumeric ? 'number' : isDate ? 'date' : 'string',
        nullCount,
        nullPct: data.length > 0 ? Number(((nullCount / data.length) * 100).toFixed(1)) : 0,
        uniqueCount: values.size,
        count: data.length,
        min: isNumeric && min !== Infinity ? min : undefined,
        max: isNumeric && max !== -Infinity ? max : undefined,
        avg: isNumeric && numCount > 0 ? Number((sum / numCount).toFixed(2)) : undefined,
        sum: isNumeric && numCount > 0 ? Number(sum.toFixed(2)) : undefined,
      };
    });

    return res;
  }, [data, rawColumns]);

  // Check if data is already in DuckDB SUMMARIZE output format
  const isSummarizeResultFormat = useMemo(() => {
    if (!data || data.length === 0) return false;
    const firstRow = data[0];
    const keys = Object.keys(firstRow).map((k) => k.toLowerCase());
    return keys.includes('column_name') || keys.includes('column_type') || keys.includes('approx_unique');
  }, [data]);

  // Summarize normalized data extraction
  const summarizeList = useMemo(() => {
    if (!isSummarizeMode || !data || data.length === 0) return [];

    if (isSummarizeResultFormat) {
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

      return data.map((row) => {
        const colName = String(getVal(row, 'column_name', 'name') ?? 'col');
        const rawType = String(getVal(row, 'column_type', 'type') ?? 'VARCHAR').toUpperCase();
        const countVal = Number(getVal(row, 'count')) || 0;

        const rawNullPct = getVal(row, 'null_percentage', 'null_pct', 'null_percent');
        let nullPct = 0;
        if (typeof rawNullPct === 'number') {
          nullPct = rawNullPct;
        } else if (typeof rawNullPct === 'string') {
          nullPct = parseFloat(rawNullPct.replace('%', '')) || 0;
        }

        const approxUniq = getVal(row, 'approx_unique', 'unique_count', 'unique');
        const uniqueCount = approxUniq !== undefined && approxUniq !== null ? approxUniq : '-';

        const minVal = getVal(row, 'min');
        const maxVal = getVal(row, 'max');
        const avgVal = getVal(row, 'avg');
        const stdVal = getVal(row, 'std');
        const q25Val = getVal(row, 'q25');
        const q50Val = getVal(row, 'q50');
        const q75Val = getVal(row, 'q75');

        return {
          colName,
          rawType,
          count: countVal,
          nullPct: Number(nullPct.toFixed(1)),
          uniqueCount,
          min: minVal,
          max: maxVal,
          avg: avgVal,
          std: stdVal,
          q25: q25Val,
          q50: q50Val,
          q75: q75Val,
        };
      });
    } else {
      return rawColumns.map((col) => {
        const info = colAnalysis[col];
        return {
          colName: col,
          rawType: columnTypes?.[col] || (info?.type === 'number' ? 'BIGINT' : info?.type === 'date' ? 'DATE' : 'VARCHAR'),
          count: data.length,
          nullPct: info?.nullPct ?? 0,
          uniqueCount: info?.uniqueCount ?? '-',
          min: info?.min,
          max: info?.max,
          avg: info?.avg !== undefined ? Number(info.avg.toFixed(2)) : undefined,
        };
      });
    }
  }, [data, isSummarizeMode, isSummarizeResultFormat, colAnalysis, rawColumns]);

  const columns = useMemo(() => {
    if (isSummarizeMode) {
      return summarizeList.map((s) => s.colName);
    }
    return rawColumns;
  }, [isSummarizeMode, summarizeList, rawColumns]);

  const numericCols = useMemo(() => columns.filter((c) => colAnalysis[c]?.type === 'number'), [columns, colAnalysis]);
  const stringCols = useMemo(() => columns.filter((c) => colAnalysis[c]?.type !== 'number'), [columns, colAnalysis]);

  const [xAxisCol, setXAxisCol] = useState<string>(stringCols[0] || columns[0] || '');
  const [yAxisCol, setYAxisCol] = useState<string>(numericCols[0] || columns[1] || columns[0] || '');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie' | 'list'>(initialChartType || 'list');
  const [listSubMode, setListSubMode] = useState<'categories' | 'columns'>(initialListSubMode || 'categories');
  const [barLayout, setBarLayout] = useState<'horizontal' | 'vertical'>('horizontal');

  const handleBarClick = () => {
    if (chartType !== 'bar') {
      setChartType('bar');
    } else {
      setBarLayout((prev) => (prev === 'horizontal' ? 'vertical' : 'horizontal'));
    }
  };
  const [categoryLimit, setCategoryLimit] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'alphabet' | 'desc' | 'asc'>('alphabet');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [copiedCols, setCopiedCols] = useState<boolean>(false);
  const [copiedChartImage, setCopiedChartImage] = useState<boolean>(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const handleCopyChartAsImage = () => {
    if (!chartContainerRef.current) return;
    const chartEl =
      chartContainerRef.current.querySelector<HTMLElement>('.recharts-responsive-container') ||
      chartContainerRef.current.querySelector<HTMLElement>('.recharts-wrapper') ||
      chartContainerRef.current;

    try {
      const blobPromise = toBlob(chartEl, {
        pixelRatio: 2,
        backgroundColor: undefined, // transparent background
        filter: (node) => {
          if (node instanceof HTMLElement) {
            if (node.tagName === 'BUTTON' || node.classList.contains('recharts-tooltip-wrapper')) {
              return false;
            }
          }
          return true;
        },
      }).then(blob => {
        if (!blob) throw new Error('Failed to generate blob');
        return blob;
      });

      try {
        const item = new ClipboardItem({ 'image/png': blobPromise });
        navigator.clipboard.write([item])
          .then(() => {
            setCopiedChartImage(true);
            setTimeout(() => setCopiedChartImage(false), 2000);
          })
          .catch((err) => console.error('Failed to copy chart image using html-to-image:', err));
      } catch (e) {
        // Fallback for browsers that don't support Promise in ClipboardItem
        blobPromise.then((blob) => {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(() => {
              setCopiedChartImage(true);
              setTimeout(() => setCopiedChartImage(false), 2000);
            })
            .catch((err) => console.error('Fallback clipboard write failed:', err));
        });
      }
    } catch (err) {
      console.error('Failed to copy chart image:', err);
    }
  };
  const [aggMode, setAggMode] = useState<'sum' | 'avg' | 'min' | 'max' | 'count' | 'uniqueCount' | 'nullPct'>(() => {
    const initialY = numericCols[0] || columns[1] || columns[0] || '';
    return colAnalysis[initialY]?.type !== 'number' ? 'count' : 'sum';
  });

  const [selectedLimit, setSelectedLimit] = useState<'1M' | '10M' | '50M' | '100M' | 'ALL'>('1M');
  const [isFetchingRemote, setIsFetchingRemote] = useState<boolean>(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteStats, setRemoteStats] = useState<Record<string, { count: number; nullPct: number; uniqueCount: any; sum?: number; avg?: number; min?: any; max?: any }> | null>(null);
  const [remoteStatsInfo, setRemoteStatsInfo] = useState<{ limit: string; totalCount?: number } | null>(null);

  const handleFetchDatasetStats = async () => {
    if (!onExecuteQuery || isFetchingRemote) return;

    setIsFetchingRemote(true);
    setRemoteError(null);

    try {
      const isClickhouse = activeEngine === 'clickhouse';

      let target = tableName?.trim();
      if (!target || target.toLowerCase() === 'table') {
        const stripped = (lastExecutedSql || '').trim().replace(/;+$/, '');
        if (stripped) {
          target = `(${stripped})`;
        }
      } else {
        if (/^\s*SELECT\b/i.test(target)) {
          target = `(${target})`;
        } else if (target.includes(' ') && !/^\s*\(/.test(target)) {
          target = `(${target})`;
        }
      }


      if (!target) {
        throw new Error('Не указано имя таблицы или SQL-запрос для выполнения агрегации');
      }

      let limitClause = '';
      switch (selectedLimit) {
        case '1M':
          limitClause = 'LIMIT 1000000';
          break;
        case '10M':
          limitClause = 'LIMIT 10000000';
          break;
        case '50M':
          limitClause = 'LIMIT 50000000';
          break;
        case '100M':
          limitClause = 'LIMIT 100000000';
          break;
        case 'ALL':
          limitClause = '';
          break;
      }

      let query = '';
      if (isClickhouse) {
        query = `WITH src AS (
    SELECT * FROM ${target} ${limitClause}
)

SELECT 'total_count' AS metric, COLUMNS('.*') APPLY (x -> toFloat64(count(x)))
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
      } else {
        query = `WITH src AS (
    SELECT * FROM ${target} ${limitClause}
)

SELECT 'metric' AS metric, COLUMNS(*)::DOUBLE FROM src WHERE 1=0

UNION ALL

SELECT 'total_count' AS metric, count(COLUMNS(*))::DOUBLE FROM src

UNION ALL

SELECT 'null_count' AS metric, sum(CASE WHEN COLUMNS(*) IS NULL OR CAST(COLUMNS(*) AS VARCHAR) = '' THEN 1 ELSE 0 END)::DOUBLE FROM src

UNION ALL

SELECT 'null_percent' AS metric, round(sum(CASE WHEN COLUMNS(*) IS NULL OR CAST(COLUMNS(*) AS VARCHAR) = '' THEN 1 ELSE 0 END) * 100.0 / NULLIF(count(*), 0), 2)::DOUBLE FROM src

UNION ALL

SELECT 'unique_count' AS metric, count(DISTINCT COLUMNS(*))::DOUBLE FROM src

UNION ALL

SELECT 'sum' AS metric, round(COALESCE(sum(TRY_CAST(COLUMNS(*) AS DOUBLE)), 0), 4)::DOUBLE FROM src`;
      }

      const rows = await onExecuteQuery(query);

      if (!rows || rows.length === 0) {
        throw new Error('База данных вернула пустой результат');
      }

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

      const parsed: Record<string, { count: number; nullPct: number; uniqueCount: any; sum?: number; avg?: number; min?: any; max?: any }> = {};

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
      } else {
        // Fallback for any standard column-wise summarize result
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
            nullPct: Number(nullPct.toFixed(1)),
            uniqueCount: approxUniq !== undefined && approxUniq !== null ? approxUniq : '-',
            min: minVal,
            max: maxVal,
            avg: avgVal !== undefined && avgVal !== null && !isNaN(Number(avgVal)) ? Number(Number(avgVal).toFixed(2)) : undefined,
          };
        });
      }

      setRemoteStats(parsed);
      const sampleCol = Object.keys(parsed)[0];
      setRemoteStatsInfo({
        limit: selectedLimit,
        totalCount: sampleCol ? parsed[sampleCol]?.count : undefined,
      });
    } catch (err: any) {
      const rawMsg = err?.message !== undefined ? String(err.message) : String(err);
      setRemoteError(rawMsg || 'Ошибка выполнения SQL запроса');
    } finally {
      setIsFetchingRemote(false);
    }
  };

  useEffect(() => {
    if (initialChartType) {
      setChartType(initialChartType);
    }
  }, [initialChartType]);

  useEffect(() => {
    if (initialListSubMode) {
      setListSubMode(initialListSubMode);
    }
  }, [initialListSubMode]);

  useEffect(() => {
    onSubModeChange?.(chartType, listSubMode);
  }, [chartType, listSubMode, onSubModeChange]);

  const handleYAxisChange = (col: string) => {
    setYAxisCol(col);
    if (colAnalysis[col]?.type !== 'number') {
      setAggMode('count');
    } else {
      setAggMode('sum');
    }
  };

  const handleListClick = () => {
    if (chartType === 'list') {
      setListSubMode((prev) => (prev === 'categories' ? 'columns' : 'categories'));
    } else {
      setChartType('list');
    }
  };

  const handleCardClick = (col: string) => {
    setSelectedColumns((prev) => {
      if (prev.includes(col)) {
        return prev.filter((c) => c !== col);
      } else {
        return [...prev, col];
      }
    });
  };

  const handleCopyColumns = () => {
    const allCols = columns && columns.length > 0 ? columns : rawColumns;
    const colsToCopy = selectedColumns.length > 0 ? selectedColumns : allCols;
    if (colsToCopy.length > 0) {
      navigator.clipboard.writeText(colsToCopy.join(', '));
      setCopiedCols(true);
      setTimeout(() => setCopiedCols(false), 2000);
    }
  };

  const handleInsertSqlAction = () => {
    const allCols = columns && columns.length > 0 ? columns : rawColumns;
    const colsToUse = selectedColumns.length > 0 ? selectedColumns : allCols;
    if (onInsertSql) {
      onInsertSql(colsToUse);
    } else {
      handleCopyColumns();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isSummarizeMode && (chartType !== 'list' || listSubMode !== 'columns')) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        if (selectedColumns.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          handleCopyColumns();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [chartType, listSubMode, isSummarizeMode, selectedColumns, columns, summarizeList]);

  const totalCategoryCount = useMemo(() => {
    if (!xAxisCol) return 0;
    const isCategorical =
      chartType === 'pie' ||
      chartType === 'list' ||
      colAnalysis[xAxisCol]?.type !== 'number' ||
      (colAnalysis[xAxisCol]?.uniqueCount || 0) < data.length;

    let count = 0;
    if (isCategorical) {
      const set = new Set();
      data.forEach((row) => set.add(String(row[xAxisCol] ?? 'null')));
      count = set.size;
    } else {
      count = data.length;
    }
    const maxCap = isCategorical ? 60 : 50;
    return Math.min(count, maxCap);
  }, [data, xAxisCol, chartType, colAnalysis]);

  // Prepare chart data with category limit and sorting
  const chartData = useMemo(() => {
    if (!xAxisCol) return [];

    const isCategorical =
      chartType === 'pie' ||
      chartType === 'list' ||
      colAnalysis[xAxisCol]?.type !== 'number' ||
      (colAnalysis[xAxisCol]?.uniqueCount || 0) < data.length;

    const maxCap = isCategorical ? 60 : 50;
    const limitNum = (chartType === 'list' || categoryLimit === 'all') ? maxCap : Math.min(Number(categoryLimit), maxCap);

    let rawItems: { name: string; value: number; [key: string]: any }[] = [];

    if (isCategorical) {
      const groups: Record<string, any[]> = {};
      data.forEach((row) => {
        const key = String(row[xAxisCol] ?? 'null');
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      });

      rawItems = Object.entries(groups).map(([name, rows]) => {
        let val = 0;
        if (aggMode === 'count') {
          val = rows.length;
        } else if (aggMode === 'uniqueCount') {
          const uniqs = new Set(
            rows
              .map((r) => r[yAxisCol])
              .filter((v) => v !== null && v !== undefined && v !== '')
          );
          val = uniqs.size;
        } else if (aggMode === 'nullPct') {
          const nulls = rows.filter(
            (r) => r[yAxisCol] === null || r[yAxisCol] === undefined || r[yAxisCol] === ''
          ).length;
          val = Number(((nulls / rows.length) * 100).toFixed(1));
        } else {
          const nums = rows
            .map((row) => row[yAxisCol])
            .filter(
              (val) =>
                val !== null &&
                val !== undefined &&
                val !== '' &&
                !isNaN(Number(val))
            )
            .map(Number);

          if (nums.length === 0) {
            val = 0;
          } else if (aggMode === 'avg') {
            const sum = nums.reduce((a, b) => a + b, 0);
            val = Number((sum / nums.length).toFixed(2));
          } else if (aggMode === 'min') {
            val = Math.min(...nums);
          } else if (aggMode === 'max') {
            val = Math.max(...nums);
          } else {
            val = Number(nums.reduce((a, b) => a + b, 0).toFixed(2));
          }
        }
        return { name, value: val };
      });
    } else {
      // Direct mapping
      rawItems = data.map((row, i) => ({
        name: String(row[xAxisCol] ?? `#${i + 1}`),
        value: Number(row[yAxisCol]) || 0,
        ...row,
      }));
    }

    // Sort items before slicing
    rawItems.sort((a, b) => {
      if (sortMode === 'desc') {
        return b.value - a.value || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (sortMode === 'asc') {
        return a.value - b.value || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      // 'alphabet' default
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return rawItems.slice(0, limitNum);
  }, [data, xAxisCol, yAxisCol, chartType, colAnalysis, aggMode, categoryLimit, sortMode]);

  const maxVal = useMemo(() => {
    let m = 0;
    chartData.forEach((d) => {
      if (d.value > m) m = d.value;
    });
    return m || 1;
  }, [chartData]);

  const formatStatVal = (val: any) => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') {
      if (isNaN(val)) return null;
      if (Number.isInteger(val)) return val.toLocaleString('ru-RU');
      return Number(val.toFixed(2)).toLocaleString('ru-RU');
    }
    const num = Number(val);
    if (!isNaN(num) && typeof val !== 'boolean' && String(val).trim() !== '') {
      if (Number.isInteger(num)) return num.toLocaleString('ru-RU');
      return Number(num.toFixed(2)).toLocaleString('ru-RU');
    }
    return String(val);
  };

  const isDark = theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#334155' : '#e2e8f0';

  return (
    <div className="flex flex-col h-full overflow-hidden pt-1.5 px-3 pb-3 gap-3">
      {/* Control Toolbar */}
      <div className={`flex flex-col gap-2 p-2 rounded-md text-xs border ${
        isDark ? 'bg-slate-800/80 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}>
        {/* Row 1: Chart Selector + Info Line */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isSummarizeMode ? (
            <>
              <div className={`text-[11px] flex items-center gap-2 flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {selectedColumns.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedColumns([])}
                      className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline transition-opacity shrink-0"
                    >
                      Сбросить выбор
                    </button>
                    <span>•</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleInsertSqlAction}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors shrink-0 ${
                    selectedColumns.length > 0
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                      : isDark
                        ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/40'
                        : 'bg-slate-200/60 text-slate-700 hover:bg-slate-200 border border-slate-300/60'
                  }`}
                  title={
                    selectedColumns.length > 0
                      ? `Вставить SELECT с выбранными столбцами (${selectedColumns.length}) в редактор`
                      : 'Вставить SELECT со всеми столбцами в редактор'
                  }
                >
                  <Code className="w-3 h-3 shrink-0" />
                  <span>Вставить SQL</span>
                </button>
                <span>•</span>
                <span>Столбцов: <b className="font-semibold text-teal-600 dark:text-teal-400">{summarizeList.length}</b></span>
                <span>•</span>
                <span>Строк: <b className="font-semibold text-teal-600 dark:text-teal-400">{summarizeList[0]?.count || 0}</b></span>
              </div>
            </>
          ) : (
            <>
              {/* Chart Type Selector */}
              <div className="flex items-center gap-1 bg-slate-700/20 p-0.5 rounded border border-slate-600/30">
                <button
                  onClick={handleListClick}
                  className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                    chartType === 'list'
                      ? listSubMode === 'columns'
                        ? 'bg-amber-600 text-white'
                        : 'bg-teal-600 text-white'
                      : 'hover:bg-slate-500/20'
                  }`}
                  title="Нажмите повторно для переключения между статистикой по категориям и по столбцам"
                >
                  <List className="w-3.5 h-3.5" /> Список
                </button>
                <button
                  onClick={handleBarClick}
                  className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                    chartType === 'bar'
                      ? barLayout === 'vertical'
                        ? 'bg-amber-600 text-white'
                        : 'bg-teal-600 text-white'
                      : 'hover:bg-slate-500/20'
                  }`}
                  title="Нажмите повторно для переключения ориентации (вертикальная / горизонтальная)"
                >
                  <BarChart3 className="w-3.5 h-3.5" /> Столбцы
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                    chartType === 'line' ? (isDark ? 'bg-teal-600 text-white' : 'bg-teal-600 text-white') : 'hover:bg-slate-500/20'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Линия
                </button>
                <button
                  onClick={() => setChartType('pie')}
                  className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                    chartType === 'pie' ? (isDark ? 'bg-teal-600 text-white' : 'bg-teal-600 text-white') : 'hover:bg-slate-500/20'
                  }`}
                >
                  <PieIcon className="w-3.5 h-3.5" /> Круговая
                </button>
              </div>

              {/* Reference Info Line */}
              {chartType === 'list' && listSubMode === 'columns' ? (
                <div className="flex flex-col gap-1">
                  <div className={`text-[11px] flex items-center gap-2 flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {selectedColumns.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedColumns([])}
                          className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline transition-opacity shrink-0"
                        >
                          Сбросить выбор
                        </button>
                        <span>•</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleInsertSqlAction}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors shrink-0 ${
                        selectedColumns.length > 0
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                          : isDark
                            ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/40'
                            : 'bg-slate-200/60 text-slate-700 hover:bg-slate-200 border border-slate-300/60'
                      }`}
                      title={
                        selectedColumns.length > 0
                          ? `Вставить SELECT с выбранными столбцами (${selectedColumns.length}) в редактор`
                          : 'Вставить SELECT со всеми столбцами в редактор'
                      }
                    >
                      <Code className="w-3 h-3 shrink-0" />
                      <span>Вставить SQL</span>
                    </button>
                    <span>•</span>
                    <span>Столбцов: <b className="font-semibold text-teal-600 dark:text-teal-400">{columns.length}</b></span>
                    <span>•</span>
                    <span>Строк: <b className="font-semibold text-teal-600 dark:text-teal-400">{((remoteStatsInfo?.totalCount !== undefined ? remoteStatsInfo.totalCount : data.length) || 0).toLocaleString('ru-RU')}</b></span>

                    {onExecuteQuery && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            value={selectedLimit}
                            onChange={(e) => setSelectedLimit(e.target.value as any)}
                            disabled={isFetchingRemote}
                            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-medium border focus:outline-hidden transition-colors ${
                              isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-700'
                            }`}
                            title="Лимит сканирования датасета в БД"
                          >
                            <option value="1M">1 млн</option>
                            <option value="10M">10 млн</option>
                            <option value="50M">50 млн</option>
                            <option value="100M">100 млн</option>
                            <option value="ALL">ALL</option>
                          </select>

                          <button
                            type="button"
                            onClick={handleFetchDatasetStats}
                            disabled={isFetchingRemote}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors border shrink-0 ${
                              isFetchingRemote
                                ? 'bg-amber-600/50 text-white border-amber-600 cursor-not-allowed'
                                : remoteStats
                                  ? isDark
                                    ? 'bg-teal-900/40 text-teal-300 border-teal-500/50 hover:bg-teal-900/60'
                                    : 'bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100'
                                  : isDark
                                    ? 'bg-amber-600/20 text-amber-300 border-amber-500/40 hover:bg-amber-600/30'
                                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            }`}
                            title="Выполнить SQL агрегацию по всему датасету из базы данных и обновить карточки"
                          >
                            {isFetchingRemote ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                <span>Загрузка...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3 h-3 shrink-0" />
                                <span>{remoteStats ? 'Обновлено' : 'Обновить по БД'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {remoteError && (
                    <div 
                      className="w-full text-red-600 dark:text-red-400 text-[11px] font-mono break-words p-1.5 rounded border border-slate-300 dark:border-slate-700 line-clamp-2 leading-tight max-h-[2.3rem] overflow-hidden cursor-help mt-1.5 shrink-0"
                      title={remoteError.length > 3000 ? remoteError.substring(0, 3000) + '...' : remoteError}
                    >
                      {remoteError}
                    </div>
                  )}
                </div>
              ) : (
                yAxisCol && colAnalysis[yAxisCol] && (
                  <div className={`text-[11px] flex items-center gap-2 flex-wrap ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {colAnalysis[yAxisCol].type === 'number' ? (
                      <>
                        <span>Количество: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].count}</b></span>
                        <span>Уникальных: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].uniqueCount}</b></span>
                        <span>Сумма: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].sum ?? 0}</b></span>
                        <span>Среднее: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].avg ?? 0}</b></span>
                        <span>Мин: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].min ?? 0}</b></span>
                        <span>Макс: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].max ?? 0}</b></span>
                        <span>Пустых: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].nullPct}%</b></span>
                      </>
                    ) : (
                      <>
                        <span>Количество: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].count}</b></span>
                        <span>Уникальных: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].uniqueCount}</b></span>
                        <span>Пустых: <b className="font-semibold text-teal-600 dark:text-teal-400">{colAnalysis[yAxisCol].nullPct}%</b> ({colAnalysis[yAxisCol].nullCount} из {colAnalysis[yAxisCol].count})</span>
                      </>
                    )}
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Row 2: Selectors for X, Y, Aggregation */}
        {!isSummarizeMode && !(chartType === 'list' && listSubMode === 'columns') && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* X Axis Selector & Category Limit Selector */}
            <div className="flex items-center gap-1.5">
              <span className="opacity-70">Ось X :</span>
              <select
                value={xAxisCol}
                onChange={(e) => setXAxisCol(e.target.value)}
                className={`px-2 py-1 rounded border font-medium focus:outline-hidden max-w-[220px] ${
                  isDark ? 'border-slate-600 text-slate-200 bg-slate-800' : 'border-slate-300 text-slate-800 bg-white'
                }`}
              >
                {columns.map((c) => (
                  <option key={c} value={c} className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>
                    {c} ({colAnalysis[c]?.type})
                  </option>
                ))}
              </select>

              {/* Category limit selector right after X axis (only for graphical charts) */}
              {chartType !== 'list' && (
                <select
                  value={categoryLimit}
                  onChange={(e) => setCategoryLimit(e.target.value)}
                  className={`px-1.5 py-1 rounded border text-xs font-medium focus:outline-hidden ${
                    isDark ? 'border-slate-600 text-slate-200 bg-slate-800' : 'border-slate-300 text-slate-800 bg-white'
                  }`}
                  title="Количество отображаемых категорий"
                >
                  <option value="all">Все ({totalCategoryCount})</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                </select>
              )}
            </div>

            {/* Y Axis Selector */}
            {chartType !== 'pie' && (
              <div className="flex items-center gap-1.5">
                <span className="opacity-70">Ось Y :</span>
                <select
                  value={yAxisCol}
                  onChange={(e) => handleYAxisChange(e.target.value)}
                  className={`px-2 py-1 rounded border font-medium focus:outline-hidden max-w-[220px] ${
                    isDark ? 'border-slate-600 text-slate-200 bg-slate-800' : 'border-slate-300 text-slate-800 bg-white'
                  }`}
                >
                  {columns.map((c) => (
                    <option key={c} value={c} className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>
                      {c} ({colAnalysis[c]?.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Aggregation Mode Selector */}
            <div className="flex items-center gap-1.5">
              <span className="opacity-70">Агрегация:</span>
              <select
                value={aggMode}
                onChange={(e) => setAggMode(e.target.value as any)}
                className={`px-2 py-1 rounded border font-medium focus:outline-hidden ${
                  isDark ? 'border-slate-600 text-slate-200 bg-slate-800' : 'border-slate-300 text-slate-800 bg-white'
                }`}
              >
                <option value="count" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>Кол-во (Count)</option>
                <option value="uniqueCount" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>Уникальных</option>
                <option value="sum" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>Сумма (Sum)</option>
                <option value="avg" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>Среднее (Avg)</option>
                <option value="min" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>Минимум (Min)</option>
                <option value="max" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>Максимум (Max)</option>
                <option value="nullPct" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>% пустых</option>
              </select>
            </div>

            {/* Category Sorting Selector */}
            <div className="flex items-center gap-1.5">
              <span className="opacity-70">Сортировка:</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                className={`px-2 py-1 rounded border font-medium focus:outline-hidden ${
                  isDark ? 'border-slate-600 text-slate-200 bg-slate-800' : 'border-slate-300 text-slate-800 bg-white'
                }`}
              >
                <option value="alphabet" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>По алфавиту</option>
                <option value="desc" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>По убыванию</option>
                <option value="asc" className={isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800'}>По возрастанию</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Chart Canvas / List */}
      <div className="flex-1 min-h-0 w-full relative" ref={chartContainerRef}>
        {!isSummarizeMode && chartType !== 'list' && (
          <button
            type="button"
            onClick={handleCopyChartAsImage}
            className={`absolute top-2 right-2 z-10 p-1.5 rounded-md border transition-all shadow-xs ${
              isDark
                ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600/60'
                : 'bg-white/90 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
            title={copiedChartImage ? "Скопировано в буфер (PNG)!" : "Скопировать график как PNG с прозрачным фоном"}
          >
            {copiedChartImage ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        {isSummarizeMode ? (
          <div className="h-full overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {summarizeList.map((info, idx) => {
                const isSelected = selectedColumns.includes(info.colName);
                const selectedIdx = selectedColumns.indexOf(info.colName);

                const numUniq = Number(info.uniqueCount);
                const totalRows = summarizeList[0]?.count || 1;
                const uniqPct = !isNaN(numUniq) && totalRows > 0
                  ? Math.min(100, Math.max(5, (numUniq / totalRows) * 100))
                  : 20;

                const minStr = formatStatVal(info.min);
                const maxStr = formatStatVal(info.max);
                const avgStr = formatStatVal(info.avg);
                const q50Str = formatStatVal(info.q50);

                return (
                  <div
                    key={info.colName + '_' + idx}
                    onClick={() => handleCardClick(info.colName)}
                    className={`relative flex flex-col px-3 py-1.5 rounded-lg border text-xs overflow-hidden cursor-pointer select-none transition-all gap-1.5 ${
                      isSelected
                        ? isDark
                          ? 'bg-amber-950/30 border-amber-500 ring-1 ring-amber-500/50 text-slate-100 shadow-xs'
                          : 'bg-amber-50/90 border-amber-500 ring-1 ring-amber-400/50 text-slate-900 shadow-xs'
                        : isDark
                          ? 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:border-amber-500/50'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-amber-400'
                    }`}
                  >
                    {/* Background Bar Fill */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all ${
                        isSelected
                          ? isDark ? 'bg-amber-500/25' : 'bg-amber-500/20'
                          : isDark ? 'bg-amber-500/15' : 'bg-amber-500/15'
                      }`}
                      style={{ width: `${uniqPct}%` }}
                    />

                    {/* Header: Column Name + Raw Type */}
                    <div className="relative z-10 flex items-center justify-between gap-2 border-b border-slate-500/15 pb-1">
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        {isSelected && (
                          <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-xs">
                            {selectedIdx + 1}
                          </span>
                        )}
                        <span className="font-semibold text-xs truncate opacity-95" title={info.colName}>
                          {info.colName}
                        </span>
                      </div>
                      <span 
                        className="text-[10px] opacity-75 font-mono px-1.5 py-0.5 rounded bg-slate-500/10 border border-slate-500/20 shrink-0 font-medium" 
                        title={info.rawType}
                      >
                        {formatColumnType(info.rawType)}
                      </span>
                    </div>

                    {/* Full Stats Grid: 3 in a row with inline labels and values */}
                    <div className="relative z-10 grid grid-cols-3 gap-x-2 gap-y-1 text-[11px] font-mono leading-tight">
                      {/* Row 1: Уникальных, Пустых, Среднее */}
                      <div className="flex items-center gap-1 min-w-0 truncate text-teal-600 dark:text-teal-400 font-medium" title={`Уникальных: ${info.uniqueCount}`}>
                        <span className="shrink-0">Уникальных:</span>
                        <b className="truncate font-semibold">{info.uniqueCount}</b>
                      </div>

                      <div className="flex items-center gap-1 min-w-0 truncate text-slate-800 dark:text-slate-100 font-medium" title={`Пустых: ${info.nullPct}%`}>
                        <span className="shrink-0">Пустых:</span>
                        <b className="truncate font-semibold" style={{ color: getNullPctColor(info.nullPct, isDark) }}>
                          {info.nullPct}%
                        </b>
                      </div>

                      <div className="flex items-center gap-1 min-w-0 truncate text-slate-800 dark:text-slate-100 font-medium" title={`Среднее: ${avgStr ?? '-'}`}>
                        <span className="shrink-0">Среднее:</span>
                        <b className="truncate font-semibold">{avgStr ?? '-'}</b>
                      </div>

                      {/* Row 2: Мин, Макс, Медиана */}
                      <div className="flex items-center gap-1 min-w-0 truncate text-slate-800 dark:text-slate-100 font-medium" title={`Мин: ${minStr ?? '-'}`}>
                        <span className="shrink-0">Мин:</span>
                        <b className="truncate font-semibold">{minStr ?? '-'}</b>
                      </div>

                      <div className="flex items-center gap-1 min-w-0 truncate text-slate-800 dark:text-slate-100 font-medium" title={`Макс: ${maxStr ?? '-'}`}>
                        <span className="shrink-0">Макс:</span>
                        <b className="truncate font-semibold">{maxStr ?? '-'}</b>
                      </div>

                      <div className="flex items-center gap-1 min-w-0 truncate text-slate-800 dark:text-slate-100 font-medium" title={`Медиана: ${q50Str ?? '-'}`}>
                        <span className="shrink-0">Медиана:</span>
                        <b className="truncate font-semibold">{q50Str ?? '-'}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : chartType === 'list' ? (
          <div className="h-full overflow-y-auto pr-1">
            {listSubMode === 'columns' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {columns.map((col) => {
                  const info = colAnalysis[col];
                  if (!info) return null;

                  const remoteCol = remoteStats?.[col];
                  const displayUnique = remoteCol ? remoteCol.uniqueCount : info.uniqueCount;
                  const displaySum = remoteCol ? (remoteCol.sum !== undefined ? remoteCol.sum : info.sum) : info.sum;
                  const displayNullPct = remoteCol ? remoteCol.nullPct : info.nullPct;
                  const totalCount = remoteCol ? remoteCol.count : data.length;

                  const uniqPct = Math.min(100, Math.max(2, ((typeof displayUnique === 'number' ? displayUnique : Number(displayUnique) || 0) / Math.max(1, totalCount)) * 100));
                  const selectedIdx = selectedColumns.indexOf(col);
                  const isSelected = selectedIdx !== -1;

                  return (
                    <div
                      key={col}
                      onClick={() => handleCardClick(col)}
                      className={`relative flex flex-col justify-between px-2.5 py-1 rounded border text-xs overflow-hidden transition-all gap-1 cursor-pointer select-none ${
                        isSelected
                          ? isDark
                            ? 'bg-amber-950/30 border-amber-500 ring-1 ring-amber-500/50 text-slate-100'
                            : 'bg-amber-50/90 border-amber-500 ring-1 ring-amber-400/50 text-slate-900'
                          : isDark
                            ? 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:border-amber-500/50'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-amber-400'
                      }`}
                    >
                      {/* Background Bar Fill for unique count visual */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all ${
                          isSelected
                            ? isDark ? 'bg-amber-500/25' : 'bg-amber-500/20'
                            : isDark ? 'bg-amber-500/15' : 'bg-amber-500/15'
                        }`}
                        style={{ width: `${uniqPct}%` }}
                      />
                      <div className="relative z-10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          {isSelected && (
                            <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-xs">
                              {selectedIdx + 1}
                            </span>
                          )}
                          <span className="font-semibold truncate opacity-90" title={col}>
                            {col}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span 
                            className="text-[10px] opacity-60 font-mono px-1 rounded border border-current"
                            title={columnTypes?.[col] || info.type}
                          >
                            {formatColumnType(columnTypes?.[col] || info.type)}
                          </span>
                        </div>
                      </div>
                      <div className="relative z-10 flex items-center justify-between gap-1 text-[11px]">
                        <span className="font-mono text-teal-600 dark:text-teal-400 font-medium">
                          Уникальных: <b>{displayUnique}</b>
                        </span>
                        <span className="font-mono opacity-80">
                          Сумма: <b>{displaySum !== undefined && displaySum !== null ? displaySum : '-'}</b>
                        </span>
                        <span className="font-mono opacity-80">
                          Пустых: <b className="font-semibold" style={{ color: getNullPctColor(displayNullPct, isDark) }}>{displayNullPct}%</b>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {chartData.map((item, idx) => {
                  const pct = Math.min(100, Math.max(2, (item.value / maxVal) * 100));
                  return (
                    <div
                      key={idx}
                      className={`relative flex items-center justify-between p-2 rounded border text-xs overflow-hidden transition-all ${
                        isDark
                          ? 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:border-teal-500/50'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-teal-400'
                      }`}
                    >
                      {/* Background Bar Fill */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all ${
                          isDark ? 'bg-teal-500/20' : 'bg-teal-500/15'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative z-10 font-medium truncate pr-2 opacity-90" title={item.name}>
                        {item.name}
                      </span>
                      <span className="relative z-10 font-mono font-bold text-teal-600 dark:text-teal-400 shrink-0">
                        {item.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart
                layout={barLayout}
                data={chartData}
                margin={
                  barLayout === 'vertical'
                    ? { top: 10, right: 30, left: 20, bottom: 10 }
                    : { top: 10, right: 20, left: 10, bottom: 25 }
                }
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                {barLayout === 'vertical' ? (
                  <>
                    <XAxis type="number" stroke={textColor} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke={textColor}
                      tick={{ fontSize: 11 }}
                      width={110}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey="name"
                      stroke={textColor}
                      tick={{ fontSize: 11 }}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis stroke={textColor} tick={{ fontSize: 11 }} />
                  </>
                )}
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }}
                  contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    borderColor: isDark ? '#475569' : '#cbd5e1',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="#0d9488"
                  radius={barLayout === 'vertical' ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  name={yAxisCol || 'Количество'}
                  isAnimationActive={false}
                />
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="name" stroke={textColor} tick={{ fontSize: 11 }} angle={-25} textAnchor="end" />
                <YAxis stroke={textColor} tick={{ fontSize: 11 }} />
                <Tooltip
                  cursor={{ stroke: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)', strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    borderColor: isDark ? '#475569' : '#cbd5e1',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} name={yAxisCol || 'Значение'} isAnimationActive={false} />
              </LineChart>
            ) : (
              <PieChart>
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    borderColor: isDark ? '#475569' : '#cbd5e1',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label isAnimationActive={false}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: '11px', color: textColor }} />
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
