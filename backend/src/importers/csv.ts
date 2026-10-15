import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** One CSV line into fields: quoted fields may hold commas, and "" is a quote inside one. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      fields.push(field);
      field = "";
    } else field += c;
  }
  fields.push(field);
  return fields;
}

/** Rows of a CSV file as objects keyed by its header, read line by line so large files stay out of memory. */
export async function* readCsv(path: string): AsyncGenerator<Record<string, string>> {
  let header: string[] | undefined;
  for await (const line of createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    if (!header) {
      header = fields.map((h) => h.replace(/^﻿/, ""));
      continue;
    }
    yield Object.fromEntries(header.map((h, i) => [h, fields[i] ?? ""]));
  }
}
