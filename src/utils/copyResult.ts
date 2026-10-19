// Строка результата COPY ClickHouse (п. 3.4): та же форма, что раньше собиралась в четырёх местах App.tsx.

export interface CopyResultInput {
  kind: 'TO' | 'FROM';
  filePath: string;
  message: string;
  /** COPY TO: размер файла; не задан — столбец Bytes не выводится (веб-путь сообщает размер в тексте). */
  bytes?: number | string;
  /** COPY FROM: ответ сервера; пустой — `OK`. */
  response?: string;
}

export function copyResultRows(input: CopyResultInput): Record<string, string>[] {
  if (input.kind === 'TO') {
    const row: Record<string, string> = {
      Status: 'Success (COPY TO)',
      File: input.filePath,
      Message: input.message,
    };
    if (input.bytes !== undefined) row.Bytes = `${input.bytes} bytes`;
    return [row];
  }
  return [{
    Status: 'Success (COPY FROM)',
    File: input.filePath,
    Message: input.message,
    Response: input.response || 'OK',
  }];
}
