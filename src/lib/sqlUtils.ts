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
