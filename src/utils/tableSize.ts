import { t } from './i18n';

// Бейдж размера таблицы в дереве схемы (байты или оценка строк).
export function getTableSizeBadge(columns: any[]): string | null {
  const firstCol = columns?.[0];
  if (firstCol?.table_bytes !== undefined && firstCol?.table_bytes !== null) {
    const b = Number(firstCol.table_bytes);
    if (!isNaN(b) && b > 0) {
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
      return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  } else if (firstCol?.estimated_rows !== undefined && firstCol?.estimated_rows !== null) {
    const r = Number(firstCol.estimated_rows);
    if (!isNaN(r) && r >= 0) {
      if (r < 1000) return `~${r}${t(" стр.")}`;
      if (r < 1000000) return `~${(r / 1000).toFixed(1)}k${t(" стр.")}`;
      return `~${(r / 1000000).toFixed(1)}M${t(" стр.")}`;
    }
  }
  return null;
}
