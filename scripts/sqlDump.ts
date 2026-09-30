import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

/** MySQL dump literals, including escaped apostrophes, commas and parentheses. */
export function* tuples(text: string): Generator<Array<string | number | null>> {
  let i = 0;
  while (i < text.length) {
    while (i < text.length && text[i] !== '(') i++;
    if (i === text.length) break;
    i++;
    const row: Array<string | number | null> = [];
    while (i < text.length) {
      while (/\s/.test(text[i] ?? '')) i++;
      let value = '';
      if (text[i] === "'") {
        i++;
        let closed = false;
        while (i < text.length) {
          const char = text[i++];
          if (char === '\\') {
            const escaped = text[i++];
            value += ({ '0': '\0', n: '\n', r: '\r', t: '\t', b: '\b', Z: '\x1a' } as Record<string, string>)[escaped] ?? escaped;
          } else if (char === "'") {
            if (text[i] === "'") { value += "'"; i++; }
            else { closed = true; break; }
          } else value += char;
        }
        if (!closed) throw new Error('Unterminated SQL string');
        row.push(value);
      } else {
        while (i < text.length && text[i] !== ',' && text[i] !== ')') value += text[i++];
        value = value.trim();
        row.push(value === 'NULL' ? null : Number(value));
      }
      while (/\s/.test(text[i] ?? '')) i++;
      const delimiter = text[i++];
      if (delimiter === ')') { yield row; break; }
      if (delimiter !== ',') throw new Error('Malformed SQL tuple');
    }
  }
}

export async function* dumpRows(path: string, table: string): AsyncGenerator<Record<string, string | number | null>> {
  const file = createReadStream(path);
  const stream = path.endsWith('.gz') ? file.pipe(createGunzip()) : file;
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const columns: string[] = [];
  let inSchema = false;
  let seen = false;
  try {
    for await (const line of lines) {
      if (line.startsWith(`CREATE TABLE \`${table}\``)) { inSchema = true; continue; }
      if (inSchema) {
        const column = line.match(/^\s+`([^`]+)`/);
        if (column) columns.push(column[1]);
        if (line.startsWith(')')) inSchema = false;
      }
      const insert = line.match(/^INSERT INTO `([^`]+)`(?:\s*\(([^)]+)\))? VALUES\s*/);
      if (!insert || insert[1] !== table) continue;
      const names = insert[2] ? insert[2].split(',').map(name => name.trim().replaceAll('`', '')) : columns;
      if (!names.length) throw new Error(`No CREATE TABLE or INSERT column list for ${table}`);
      for (const tuple of tuples(line.slice(insert[0].length))) {
        if (tuple.length !== names.length) throw new Error(`Column count mismatch in ${table}`);
        seen = true;
        yield Object.fromEntries(names.map((name, i) => [name, tuple[i]]));
      }
    }
  } finally { lines.close(); stream.destroy(); file.destroy(); }
  if (!seen) throw new Error(`No INSERT rows for ${table} in ${path}`);
}
