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
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      current += char;
      if (char === inString && str[i - 1] !== '\\') {
        inString = null;
      }
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
