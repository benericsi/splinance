/**
 * A small RFC 4180 reader: quoted fields may hold the delimiter, line breaks and doubled
 * quotes (`""`). Lines end in LF or CRLF; a leading byte order mark is dropped. Returns
 * rows of raw strings with the 1-based line each row starts on, skipping empty lines.
 */
export function readDelimited(
  text: string,
  delimiter: string,
): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    cells.push(cell);
    // A row with one empty cell is an empty line (the file's last line break, usually).
    if (cells.length > 1 || cells[0] !== '') rows.push({ line: rowLine, cells });
    cells = [];
    cell = '';
  };

  const input = text.startsWith('﻿') ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const char = input.charAt(i);
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += char;
    }
  }
  if (cell !== '' || cells.length > 0) endRow();
  return rows;
}

/** The first line of a file, for telling formats apart by their header. */
export function firstLine(text: string): string {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const end = input.search(/\r?\n/);
  return end === -1 ? input : input.slice(0, end);
}
