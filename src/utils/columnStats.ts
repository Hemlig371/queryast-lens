import { t } from './i18n';
import { formatCellValue } from './formatCellValue';

// Статистика по колонке результата (Count/Distinct/Null, для числовых — Sum/Min/Max/Avg/Median).
// Вынесено из App.tsx (этап A2) без изменения логики.
export function computeColumnStats(colKey: string, rows: any[]): string {
  if (!rows || rows.length === 0) return `${t("Количество (Count)")}: 0\n${t("Уникальных (Distinct)")}: 0\n${t("Пустых (Null/Empty)")}: 0`;

  const totalCount = rows.length;
  let nullOrEmptyCount = 0;
  const uniqueValues = new Set<string>();
  const numericValues: number[] = [];

  for (const row of rows) {
    const val = row[colKey];
    if (val === null || val === undefined || val === '') {
      nullOrEmptyCount++;
    } else {
      uniqueValues.add(formatCellValue(val));
      if (typeof val === 'number' && !isNaN(val)) {
        numericValues.push(val);
      } else if (typeof val === 'string' && val.trim() !== '') {
        const num = Number(val);
        if (!isNaN(num)) {
          numericValues.push(num);
        }
      }
    }
  }

  const distinctCount = uniqueValues.size;

  const formatInt = (n: number) => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  let result = `${t("Количество (Count)")}: ${formatInt(totalCount)}\n`;
  result += `${t("Уникальных (Distinct)")}: ${formatInt(distinctCount)}\n`;
  result += `${t("Пустых (Null/Empty)")}: ${formatInt(nullOrEmptyCount)}`;

  const nonNullCount = totalCount - nullOrEmptyCount;
  const isNumericCol = nonNullCount > 0 && numericValues.length >= Math.ceil(nonNullCount * 0.5);

  if (isNumericCol && numericValues.length > 0) {
    const sum = numericValues.reduce((acc, v) => acc + v, 0);
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const avg = sum / numericValues.length;

    const formatNum = (n: number) => {
      const isNeg = n < 0;
      const absN = Math.abs(n);
      const str = Number.isInteger(absN) ? absN.toString() : parseFloat(absN.toFixed(6)).toString();
      const parts = str.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return (isNeg ? '-' : '') + parts.join('.');
    };

    const sortedNum = [...numericValues].sort((a, b) => a - b);
    const mid = Math.floor(sortedNum.length / 2);
    const median = sortedNum.length % 2 !== 0 
      ? sortedNum[mid] 
      : (sortedNum[mid - 1] + sortedNum[mid]) / 2;

    result += `\n\n${t("Сумма (Sum)")}: ${formatNum(sum)}`;
    result += `\n${t("Мин. (Min)")}: ${formatNum(min)}`;
    result += `\n${t("Макс. (Max)")}: ${formatNum(max)}`;
    result += `\n${t("Среднее (Avg)")}: ${formatNum(avg)}`;
    result += `\n${t("Медиана (Median)")}: ${formatNum(median)}`;
  }

  return result;
}
