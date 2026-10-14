import { t } from './i18n';
import { splitBySemicolonIgnoringQuotes } from '../lib/sqlUtils';
import type { FormatterSettings } from '../components/SettingsModal';

// Чистые функции форматирования/сжатия SQL. Вынесены из App.tsx (этап A1) без изменения логики.
// Настройки форматтера и диалект теперь передаются параметрами, а не берутся из замыкания App.

export const convertInlineDashComments = (sql: string): string => {
  const lines = sql.split('\n');
  return lines
    .map((line) => {
      let inString: string | null = null;
      let inBlockComment = false;
      let codeFoundBeforeDash = false;
      let dashIndex = -1;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (inString) {
          if (char === inString && line[i - 1] !== '\\') {
            inString = null;
          }
        } else if (inBlockComment) {
          if (char === '*' && nextChar === '/') {
            inBlockComment = false;
            i++;
          }
        } else if (char === "'" || char === '"' || char === '`') {
          inString = char;
          codeFoundBeforeDash = true;
        } else if (char === '/' && nextChar === '*') {
          inBlockComment = true;
          i++;
        } else if (char === '-' && nextChar === '-') {
          dashIndex = i;
          break;
        } else if (char !== ' ' && char !== '\t' && char !== '\r') {
          codeFoundBeforeDash = true;
        }
      }

      if (dashIndex !== -1 && codeFoundBeforeDash) {
        const before = line.slice(0, dashIndex);
        const commentText = line.slice(dashIndex + 2);
        const safeCommentText = commentText.replace(/\*\//g, '* /');
        return `${before}/* ${safeCommentText.trim()} */`;
      }

      return line;
    })
    .join('\n');
};

export const compactSql = (text: string): string => {
  if (!text) return text;

  const preprocessed = convertInlineDashComments(text);
  const lines = preprocessed.split('\n');

  const chunks: Array<{ type: 'comment' | 'code'; lines: string[] }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const isStandaloneComment = trimmed.startsWith('--');

    if (isStandaloneComment) {
      chunks.push({ type: 'comment', lines: [trimmed] });
    } else {
      if (chunks.length > 0 && chunks[chunks.length - 1].type === 'code') {
        chunks[chunks.length - 1].lines.push(line);
      } else {
        chunks.push({ type: 'code', lines: [line] });
      }
    }
  }

  const resultLines: string[] = [];

  for (const chunk of chunks) {
    if (chunk.type === 'comment') {
      resultLines.push(chunk.lines[0]);
    } else {
      const codeBlock = chunk.lines.join('\n').trim();
      if (codeBlock) {
        const compacted = codeBlock.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
        resultLines.push(compacted);
      }
    }
  }

  return resultLines.join('\n');
};

export const formatSqlText = async (text: string, dialect: string, cfg: FormatterSettings): Promise<string> => {
  // sql-formatter тяжёлый: подгружаем при первом форматировании, а не при старте приложения
  const { format: formatSql } = await import('sql-formatter');
  const primaryLang =
    dialect === 'PostgreSQL' || dialect === 'Oracle' || dialect === 'Clickhouse' || dialect === 'DuckDB' ? 'postgresql' :
    dialect === 'MySQL' ? 'mysql' :
    dialect === 'SQLite' ? 'sqlite' : 'postgresql';

  const fallbackLangs = [primaryLang, 'postgresql', 'mysql', 'sqlite', 'sql'].filter(
    (lang, index, self) => self.indexOf(lang) === index
  );

  const smartSplitByComma = (str: string): string[] => {
    const result: string[] = [];
    let current = '';
    let parenDepth = 0;
    let inString: string | null = null;
    let inBlockComment = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const nextChar = str[i + 1];

      if (inString) {
        current += char;
        if (char === inString && str[i - 1] !== '\\') {
          inString = null;
        }
      } else if (inBlockComment) {
        current += char;
        if (char === '*' && nextChar === '/') {
          current += '/';
          inBlockComment = false;
          i++;
        }
      } else if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        current += '/*';
        i++;
      } else if (char === "'" || char === '"' || char === '`') {
        inString = char;
        current += char;
      } else if (char === '(' || char === '[' || char === '{') {
        parenDepth++;
        current += char;
      } else if (char === ')' || char === ']' || char === '}') {
        if (parenDepth > 0) parenDepth--;
        current += char;
      } else if (char === ',' && parenDepth === 0) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim().length > 0 || result.length > 0) {
      result.push(current.trim());
    }
    return result.filter(Boolean);
  };

  const cleanFormattedSql = (sql: string): string => {
    const statements = splitBySemicolonIgnoringQuotes(sql);
    const cleanedStatements = statements.map(stmt => {
      const trimmed = stmt.trim();
      if (!trimmed) return '';
      return trimmed.replace(/\n\s*\n/g, '\n');
    }).filter(Boolean);

    const hasSemicolon = sql.trim().endsWith(';');
    if (cleanedStatements.length === 0) return sql;
    return cleanedStatements.join(';\n\n') + (hasSemicolon ? ';' : '');
  };

  let preprocessedText = convertInlineDashComments(text);
  
  // sql-formatter doesn't support queries starting with FROM properly.
  // Hack: if query starts with FROM, prepend 'SELECT * ' and strip it after formatting.
  let isFromFirst = false;
  if (/^\s*FROM\b/i.test(preprocessedText)) {
    isFromFirst = true;
    preprocessedText = 'SELECT * \n' + preprocessedText;
  }

  for (const lang of fallbackLangs) {
    try {
      let formatted = formatSql(preprocessedText, {
        language: lang as any,
        keywordCase: cfg.keywordCase,
        tabWidth: cfg.tabWidth,
        useTabs: cfg.useTabs,
        expressionWidth: cfg.expressionWidth,
        denseOperators: cfg.denseOperators,
      });

      if (isFromFirst) {
        formatted = formatted.replace(/^SELECT\s+\*\s+/i, '');
      }

      // Apply custom clause line wrapping if expressionWidth >= 0
      if (cfg.expressionWidth >= 0) {
        const maxWidth = cfg.expressionWidth;
        const indent = cfg.useTabs ? '\t' : ' '.repeat(cfg.tabWidth || 2);

        // 1. Clean up WITH clause line breaks and align CTE definitions
        formatted = formatted.replace(
          /(^|\n)(\s*)WITH\s+([\s\S]+?)(?=\n\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|;|$))/gi,
          (match, prefix, baseIndent, body) => {
            const singleLineWith = `${baseIndent}WITH ${body.replace(/\s+/g, ' ')}`;
            if (singleLineWith.length <= maxWidth) {
              return prefix + singleLineWith;
            }
            const cleanedBody = body.replace(
              /^(\s*)([a-zA-Z0-9_"]+)\s+AS\s*\(/gim,
              (_, __, cteName) => `${baseIndent}${indent}${cteName} AS (`
            );
            return `${prefix}${baseIndent}WITH ${cleanedBody.trim()}`;
          }
        );

        // 1.5 Target parenthesized column and value lists in INSERT INTO and VALUES clauses
        formatted = formatted.replace(
          /((?:INSERT\s+INTO\s+[^(]+|\bVALUES\b[\s\S]*?|,\s*))\(([\s\S]+?)\)/gi,
          (match, prefix, inner) => {
            if (!/\b(INSERT|VALUES)\b/i.test(prefix) && !/^\s*,\s*$/.test(prefix)) {
              return match;
            }
            if (/\bSELECT\b/i.test(inner) || inner.includes('--')) {
              return match;
            }

            const prefixLines = prefix.split('\n');
            const lastPrefixLine = prefixLines[prefixLines.length - 1];
            const matchIndent = lastPrefixLine.match(/^(\s*)/)?.[1] || '';

            const items = smartSplitByComma(inner).map((s) => s.trim()).filter(Boolean);
            if (items.length === 0) return match;

            const singleLine = `(${items.join(', ')})`;
            if ((lastPrefixLine + singleLine).length <= maxWidth) {
              return `${prefix}${singleLine}`;
            }

            const useLeading = Boolean(cfg.leadingCommas);
            const packedLines: string[] = [];
            let current = '';
            const itemIndent = matchIndent + indent;

            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (useLeading) {
                if (i === 0) {
                  current = item;
                } else {
                  const candidateSameLine = current + ', ' + item;
                  if ((itemIndent + candidateSameLine).length <= maxWidth) {
                    current = candidateSameLine;
                  } else {
                    packedLines.push(current);
                    current = ', ' + item;
                  }
                }
              } else {
                const isLast = i === items.length - 1;
                const itemWithComma = item + (isLast ? '' : ',');

                if (!current) {
                  current = itemWithComma;
                } else if ((itemIndent + current + ' ' + itemWithComma).length <= maxWidth) {
                  current += ' ' + itemWithComma;
                } else {
                  packedLines.push(current);
                  current = itemWithComma;
                }
              }
            }
            if (current) packedLines.push(current);

            return `${prefix}(\n${packedLines.map((l) => itemIndent + l).join('\n')}\n${matchIndent})`;
          }
        );

        // 2. Custom clause line wrapping with baseIndent preservation, smartSplitByComma, and window function handling
        const clauseRegex =
          /(^|\n)(\s*)(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|CROSS JOIN|FULL JOIN|LEFT OUTER JOIN|RIGHT OUTER JOIN|FULL OUTER JOIN|ON|SET|VALUES|INSERT INTO|UPDATE|DELETE FROM|ARRAY JOIN|LEFT ARRAY JOIN|SETTINGS|FORMAT)\b([\s\S]+?)(?=\n\s*(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|CROSS JOIN|FULL JOIN|LEFT OUTER JOIN|RIGHT OUTER JOIN|FULL OUTER JOIN|ON|SET|VALUES|INSERT INTO|UPDATE|DELETE FROM|ARRAY JOIN|LEFT ARRAY JOIN|SETTINGS|FORMAT|WITH)|;|$)/gi;

        formatted = formatted.replace(
          clauseRegex,
          (match, prefix, baseIndent, keyword, items) => {
            if (/\bSELECT\b/i.test(items)) {
              return match;
            }

            const lines = items.split('\n').filter((l) => l.trim() !== '');
            const chunks: Array<{ type: 'code' | 'comment'; text: string }> = [];
            let currentCodeLines: string[] = [];

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('--')) {
                if (currentCodeLines.length > 0) {
                  chunks.push({ type: 'code', text: currentCodeLines.join('\n') });
                  currentCodeLines = [];
                }
                chunks.push({ type: 'comment', text: trimmed });
              } else {
                currentCodeLines.push(line);
              }
            }
            if (currentCodeLines.length > 0) {
              chunks.push({ type: 'code', text: currentCodeLines.join('\n') });
            }

            const hasCommentChunks = chunks.some((c) => c.type === 'comment');
            const formattedLines: string[] = [];
            const allProcessedItems: string[] = [];

            for (const chunk of chunks) {
              if (chunk.type === 'comment') {
                formattedLines.push(`${baseIndent}${indent}${chunk.text}`);
              } else {
                const rawItems = smartSplitByComma(chunk.text);
                if (rawItems.length === 0) continue;

                const processedItems = rawItems.map((item) => {
                  const collapsed = item.replace(/\s+/g, ' ').trim();
                  if (collapsed.length <= maxWidth && /\bOVER\s*\(/i.test(item)) {
                    return collapsed;
                  }
                  return item.trim();
                });
                allProcessedItems.push(...processedItems);

                const useLeading = Boolean(cfg.leadingCommas);
                let currentLine = `${baseIndent}${indent}`;
                let firstInChunk = true;

                for (let i = 0; i < processedItems.length; i++) {
                  const item = processedItems[i];
                  if (useLeading) {
                    if (firstInChunk) {
                      currentLine += item;
                      firstInChunk = false;
                    } else {
                      const candidateSameLine = currentLine + ', ' + item;
                      if (candidateSameLine.length <= maxWidth) {
                        currentLine = candidateSameLine;
                      } else {
                        formattedLines.push(currentLine);
                        currentLine = `${baseIndent}${indent}, ${item}`;
                      }
                    }
                  } else {
                    const isLast = i === processedItems.length - 1;
                    const itemWithComma = item + (isLast ? '' : ',');

                    if (firstInChunk) {
                      currentLine += itemWithComma;
                      firstInChunk = false;
                    } else if ((currentLine + ' ' + itemWithComma).length <= maxWidth) {
                      currentLine += ' ' + itemWithComma;
                    } else {
                      formattedLines.push(currentLine);
                      currentLine = `${baseIndent}${indent}${itemWithComma}`;
                    }
                  }
                }
                if (currentLine.trim()) {
                  formattedLines.push(currentLine);
                }
              }
            }

            if (formattedLines.length === 0) return match;

            if (!hasCommentChunks && allProcessedItems.length > 0) {
              const singleLine = `${baseIndent}${keyword} ${allProcessedItems.join(', ')}`;
              if (singleLine.length <= maxWidth) {
                return prefix + singleLine;
              }
            }

            return prefix + `${baseIndent}${keyword}\n${formattedLines.join('\n')}`;
          }
        );
      }
      return cleanFormattedSql(formatted);
    } catch (e) {
      // Ignore syntax errors, try next dialect
    }
  }
  throw new Error(t('Не удалось отформатировать (ошибка синтаксиса)'));
};
