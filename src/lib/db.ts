import initSqlJs, { type Database, type SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { Entry, EntryNeighbour, SuggestedRelationship, GraphPayload, RelationshipType } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntryRow = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  tags: string;
  notes: string;
  rating: number | null;
  ai_metadata: string;
  date_added: string;
  edited: number;
};

export type RelationshipRow = {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  created_by: string;
};

export type NeighbourRow = EntryRow & {
  rel_id: string;
  rel_type: string;
  rel_source: string;
};

export type PendingLinkRow = {
  id: string;
  from_id: string;
  target_name: string;
  type: string;
};

// ---------------------------------------------------------------------------
// IndexedDB persistence
// ---------------------------------------------------------------------------

const IDB_NAME = "curio";
const IDB_STORE = "db";
const IDB_KEY = "curio-db";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  try {
    const idb = await openIdb();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  try {
    const idb = await openIdb();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(data, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore persistence errors
  }
}

// ---------------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------------

const writeListeners = new Set<() => void>();
const dbReplacedListeners = new Set<() => void>();

export function addWriteListener(cb: () => void): () => void {
  writeListeners.add(cb);
  return () => writeListeners.delete(cb);
}

export function onDbReplaced(cb: () => void): () => void {
  dbReplacedListeners.add(cb);
  return () => dbReplacedListeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Singleton DB instance
// ---------------------------------------------------------------------------

let db: Database;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS entries (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    subcategory  TEXT NOT NULL,
    tags         TEXT NOT NULL DEFAULT '[]',
    notes        TEXT NOT NULL DEFAULT '',
    rating       INTEGER,
    ai_metadata  TEXT NOT NULL DEFAULT '{}',
    date_added   TEXT NOT NULL,
    edited       INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS relationships (
    id          TEXT PRIMARY KEY,
    from_id     TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    to_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    created_by  TEXT NOT NULL DEFAULT 'ai'
  );
  CREATE TABLE IF NOT EXISTS pending_links (
    id            TEXT PRIMARY KEY,
    from_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    target_name   TEXT NOT NULL,
    type          TEXT NOT NULL
  );
`;

const DEDUP_RELATIONSHIPS = `
  DELETE FROM relationships WHERE rowid NOT IN (
    SELECT min(rowid) FROM relationships
    GROUP BY CASE WHEN from_id < to_id THEN from_id ELSE to_id END,
             CASE WHEN from_id < to_id THEN to_id ELSE from_id END
  );
`;

const ready: Promise<void> = (async () => {
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const saved = await loadFromIndexedDB();
  db = new SQL.Database(saved ?? undefined);
  db.run("PRAGMA foreign_keys = ON");
  db.run(SCHEMA);
  db.run(DEDUP_RELATIONSHIPS);
})();

export const ensureDbReady = () => ready;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjects<T extends Record<string, SqlValue>>(
  results: { columns: string[]; values: SqlValue[][] }[]
): T[] {
  if (!results.length) return [];
  const { columns, values } = results[0];
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])) as T
  );
}

function queryAll<T extends Record<string, SqlValue>>(sql: string): T[] {
  return toObjects<T>(db.exec(sql));
}

function queryOne<T extends Record<string, SqlValue>>(
  sql: string,
  params: SqlValue[]
): T | null {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? (stmt.getAsObject() as T) : null;
  stmt.free();
  return row;
}

function queryMany<T extends Record<string, SqlValue>>(
  sql: string,
  params: SqlValue[]
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function persistToIndexedDB(): void {
  saveToIndexedDB(db.export());
}

function afterWrite(): void {
  persistToIndexedDB();
  writeListeners.forEach((cb) => cb());
}

// ---------------------------------------------------------------------------
// Row <-> Entry mapping
// ---------------------------------------------------------------------------

export function rowToEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Entry["category"],
    subcategory: row.subcategory,
    tags: JSON.parse(row.tags),
    notes: row.notes,
    rating: row.rating as Entry["rating"],
    aiMetadata: JSON.parse(row.ai_metadata),
    dateAdded: row.date_added,
    edited: row.edited === 1,
  };
}

export function entryToRow(entry: Entry): EntryRow {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    subcategory: entry.subcategory,
    tags: JSON.stringify(entry.tags),
    notes: entry.notes,
    rating: entry.rating ?? null,
    ai_metadata: JSON.stringify(entry.aiMetadata),
    date_added: entry.dateAdded,
    edited: entry.edited ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Entry queries
// ---------------------------------------------------------------------------

export function getAllEntries(): EntryRow[] {
  return queryAll<EntryRow>("SELECT * FROM entries ORDER BY date_added DESC");
}

export function getEntryById(id: string): EntryRow | null {
  return queryOne<EntryRow>("SELECT * FROM entries WHERE id = ?", [id]);
}

export function createEntry(row: EntryRow): void {
  db.run(
    `INSERT INTO entries (id, name, category, subcategory, tags, notes, rating, ai_metadata, date_added, edited)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.name, row.category, row.subcategory, row.tags, row.notes, row.rating, row.ai_metadata, row.date_added, row.edited]
  );
  afterWrite();
}

export function updateEntry(id: string, fields: Partial<EntryRow>): void {
  const sets: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === "id") continue;
    sets.push(`${key} = ?`);
    values.push(value as SqlValue);
  }
  if (sets.length === 0) return;
  values.push(id);
  db.run(`UPDATE entries SET ${sets.join(", ")} WHERE id = ?`, values);
  afterWrite();
}

export function deleteEntry(id: string): void {
  db.run("DELETE FROM entries WHERE id = ?", [id]);
  afterWrite();
}

export function findEntryByNameFuzzy(name: string): EntryRow | null {
  return queryOne<EntryRow>(
    "SELECT * FROM entries WHERE lower(name) = lower(?)",
    [name]
  );
}

// ---------------------------------------------------------------------------
// Relationship queries
// ---------------------------------------------------------------------------

export function relationshipExists(fromId: string, toId: string): boolean {
  const row = queryOne(
    "SELECT 1 as x FROM relationships WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) LIMIT 1",
    [fromId, toId, toId, fromId]
  );
  return row !== null;
}

export function createRelationship(
  id: string,
  fromId: string,
  toId: string,
  type: string,
  createdBy: string
): void {
  if (relationshipExists(fromId, toId)) return;
  db.run(
    "INSERT OR IGNORE INTO relationships (id, from_id, to_id, type, created_by) VALUES (?, ?, ?, ?, ?)",
    [id, fromId, toId, type, createdBy]
  );
  afterWrite();
}

export function deleteRelationship(id: string): void {
  db.run("DELETE FROM relationships WHERE id = ?", [id]);
  afterWrite();
}

export function getNeighbours(entryId: string): NeighbourRow[] {
  return queryMany<NeighbourRow>(
    `SELECT e.*, r.id as rel_id, r.type as rel_type, r.created_by as rel_source
     FROM entries e
     JOIN relationships r ON (
       (r.to_id = e.id AND r.from_id = ?) OR
       (r.from_id = e.id AND r.to_id = ?)
     )
     WHERE e.id != ?`,
    [entryId, entryId, entryId]
  );
}

export function getAllRelationships(): RelationshipRow[] {
  return queryAll<RelationshipRow>("SELECT * FROM relationships");
}

// ---------------------------------------------------------------------------
// Pending link queries
// ---------------------------------------------------------------------------

export function createPendingLink(
  id: string,
  fromId: string,
  targetName: string,
  type: string
): void {
  db.run(
    "INSERT INTO pending_links (id, from_id, target_name, type) VALUES (?, ?, ?, ?)",
    [id, fromId, targetName, type]
  );
  afterWrite();
}

export function findPendingLinksForName(name: string): PendingLinkRow[] {
  return queryMany<PendingLinkRow>(
    "SELECT * FROM pending_links WHERE lower(target_name) = lower(?)",
    [name]
  );
}

export function deletePendingLink(id: string): void {
  db.run("DELETE FROM pending_links WHERE id = ?", [id]);
  afterWrite();
}

export function getAllPendingLinks(): PendingLinkRow[] {
  return queryAll<PendingLinkRow>("SELECT * FROM pending_links");
}

// ---------------------------------------------------------------------------
// Relationship resolution (ported from server/routes/entries.ts)
// ---------------------------------------------------------------------------

export function resolveRelationships(
  entryId: string,
  suggested: SuggestedRelationship[]
): string[] {
  const linked: string[] = [];
  for (const rel of suggested) {
    const match = findEntryByNameFuzzy(rel.targetName);
    if (match && match.id !== entryId) {
      createRelationship(crypto.randomUUID(), entryId, match.id, rel.type, "ai");
      linked.push(match.name);
    } else if (!match) {
      createPendingLink(crypto.randomUUID(), entryId, rel.targetName, rel.type);
    }
  }
  return linked;
}

export function resolvePendingForEntry(entry: Entry): string[] {
  const pending = findPendingLinksForName(entry.name);
  const linked: string[] = [];
  for (const p of pending) {
    if (p.from_id !== entry.id) {
      createRelationship(crypto.randomUUID(), p.from_id, entry.id, p.type, "ai");
      const fromEntry = getEntryById(p.from_id);
      if (fromEntry) linked.push(fromEntry.name);
    }
    deletePendingLink(p.id);
  }
  return linked;
}

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

export function getGraphData(): GraphPayload {
  const rows = getAllEntries();
  const rels = getAllRelationships();
  return {
    entries: rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category as Entry["category"],
      subcategory: r.subcategory,
      tags: JSON.parse(r.tags) as string[],
    })),
    relationships: rels,
  };
}

// ---------------------------------------------------------------------------
// Neighbours (formatted)
// ---------------------------------------------------------------------------

export function getNeighboursForEntry(entryId: string): {
  entry: Entry;
  neighbours: EntryNeighbour[];
} | null {
  const entryRow = getEntryById(entryId);
  if (!entryRow) return null;
  const neighbourRows = getNeighbours(entryId);
  return {
    entry: rowToEntry(entryRow),
    neighbours: neighbourRows.map((row) => ({
      entry: rowToEntry(row),
      relType: row.rel_type as RelationshipType,
      relSource: row.rel_source as "ai" | "user",
      relId: row.rel_id,
    })),
  };
}

// ---------------------------------------------------------------------------
// Resolve pending links (bulk scan)
// ---------------------------------------------------------------------------

export function resolveAllPending(): { resolved: number; remaining: number } {
  const pending = getAllPendingLinks();
  let resolved = 0;
  for (const p of pending) {
    const match = findEntryByNameFuzzy(p.target_name);
    if (match && match.id !== p.from_id) {
      createRelationship(crypto.randomUUID(), p.from_id, match.id, p.type, "ai");
      deletePendingLink(p.id);
      resolved++;
    }
  }
  const remaining = getAllPendingLinks().length;
  return { resolved, remaining };
}

// ---------------------------------------------------------------------------
// Export / Import for Google Drive
// ---------------------------------------------------------------------------

export function exportDb(): Uint8Array {
  return db.export();
}

export async function importDb(data: Uint8Array): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  db = new SQL.Database(data);
  db.run("PRAGMA foreign_keys = ON");
  db.run(SCHEMA);
  await saveToIndexedDB(db.export());
  dbReplacedListeners.forEach((cb) => cb());
}
