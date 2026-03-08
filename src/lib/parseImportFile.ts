export type ParsedRow = Record<string, string>;

export type ParsedFile = {
  columns: string[];
  rows: ParsedRow[];
};

function parseCSV(text: string): ParsedFile {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field.trim());
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        current.push(field.trim());
        if (current.some((f) => f.length > 0)) rows.push(current);
        current = [];
        field = "";
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }
  current.push(field.trim());
  if (current.some((f) => f.length > 0)) rows.push(current);

  if (rows.length < 2) return { columns: [], rows: [] };

  const columns = rows[0];
  const dataRows = rows.slice(1).map((r) => {
    const obj: ParsedRow = {};
    columns.forEach((col, i) => {
      obj[col] = r[i] ?? "";
    });
    return obj;
  });

  return { columns, rows: dataRows };
}

function parseJSON(text: string): ParsedFile {
  const data = JSON.parse(text);
  const arr: Record<string, unknown>[] = Array.isArray(data) ? data : data.items ?? data.entries ?? data.data ?? [];
  if (!Array.isArray(arr) || arr.length === 0) return { columns: [], rows: [] };

  const columns = [...new Set(arr.flatMap((item) => Object.keys(item)))];
  const rows = arr.map((item) => {
    const obj: ParsedRow = {};
    columns.forEach((col) => {
      const val = item[col];
      obj[col] = val != null ? String(val) : "";
    });
    return obj;
  });

  return { columns, rows };
}

export function guessNameColumn(columns: string[]): string | null {
  const lower = columns.map((c) => c.toLowerCase());
  const priority = ["name", "title", "film", "movie", "book", "song", "album", "artist", "item", "entry"];
  for (const p of priority) {
    const idx = lower.findIndex((c) => c === p);
    if (idx !== -1) return columns[idx];
  }
  for (const p of priority) {
    const idx = lower.findIndex((c) => c.includes(p));
    if (idx !== -1) return columns[idx];
  }
  return columns[0] ?? null;
}

export function guessRatingColumn(columns: string[]): string | null {
  const lower = columns.map((c) => c.toLowerCase());
  const keywords = ["rating", "score", "stars", "rate"];
  for (const k of keywords) {
    const idx = lower.findIndex((c) => c === k);
    if (idx !== -1) return columns[idx];
  }
  for (const k of keywords) {
    const idx = lower.findIndex((c) => c.includes(k));
    if (idx !== -1) return columns[idx];
  }
  return null;
}

export function normaliseRating(raw: string): 1 | 2 | 3 | 4 | 5 | undefined {
  const n = parseFloat(raw);
  if (isNaN(n) || n <= 0) return undefined;
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  if (n <= 3) return 3;
  if (n <= 4) return 4;
  return 5;
}

export function parseImportFile(fileName: string, text: string): ParsedFile {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "json") return parseJSON(text);
  return parseCSV(text);
}
