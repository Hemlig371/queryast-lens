export const formatColumnType = (type: string | undefined | null): string => {
  if (!type) return '';
  const t = type.trim();
  if (/Enum(8|16)?\s*\(/i.test(t)) {
    return t.replace(/(Enum(?:8|16)?)\s*\([\s\S]*?\)/gi, "$1(...)");
  }
  return t;
};

export const splitBySemicolonIgnoringQuotes = (str: string): string[] => {

  const statements: string[] = [];
  let current = '';
  let inString: string | null = null;
  let inSingleComment = false;
  let inMultiComment = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1] || '';
    if (inSingleComment) {
      current += char;
      if (char === '\n') {
        inSingleComment = false;
      }
    } else if (inMultiComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += nextChar;
        i++;
        inMultiComment = false;
      }
    } else if (inString) {
      current += char;
      if (char === inString && str[i - 1] !== '\\') {
        inString = null;
      }
    } else if (char === '-' && nextChar === '-') {
      inSingleComment = true;
      current += char + nextChar;
      i++;
    } else if (char === '/' && nextChar === '*') {
      inMultiComment = true;
      current += char + nextChar;
      i++;
    } else if (char === "'" || char === '"' || char === '`') {
      inString = char;
      current += char;
    } else if (char === ';') {
      statements.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) {
    statements.push(current);
  }
  return statements;
};
