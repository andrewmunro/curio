import type { Entry, EntryNeighbour, SuggestedRelationship, Relationship, RelationshipType, GraphPayload } from "./types";
import {
  ensureDbReady,
  getAllEntries, getEntryById, createEntry as dbCreateEntry, updateEntry as dbUpdateEntry,
  deleteEntry as dbDeleteEntry, findEntryByNameFuzzy,
  createRelationship as dbCreateRelationship, deleteRelationship as dbDeleteRelationship,
  getNeighboursForEntry, getGraphData, resolveAllPending,
  resolveRelationships, resolvePendingForEntry,
  rowToEntry, entryToRow,
} from "./db";

export async function fetchEntries(): Promise<Entry[]> {
  await ensureDbReady();
  return getAllEntries().map(rowToEntry);
}

export async function createEntry(
  entry: Entry,
  suggestedRelationships?: SuggestedRelationship[]
): Promise<{ entry: Entry; linkedTo: string[] }> {
  await ensureDbReady();
  dbCreateEntry(entryToRow(entry));
  const linked = resolveRelationships(entry.id, suggestedRelationships ?? []);
  const retroLinked = resolvePendingForEntry(entry);
  return { entry, linkedTo: [...linked, ...retroLinked] };
}

export async function updateEntry(
  id: string,
  fields: Partial<Entry>,
  suggestedRelationships?: SuggestedRelationship[]
): Promise<Entry & { linkedTo?: string[] }> {
  await ensureDbReady();
  const existing = getEntryById(id);
  if (!existing) throw new Error("Entry not found");

  const partial: Record<string, string | number | null> = {};
  if (fields.name !== undefined) partial.name = fields.name;
  if (fields.category !== undefined) partial.category = fields.category;
  if (fields.subcategory !== undefined) partial.subcategory = fields.subcategory;
  if (fields.tags !== undefined) partial.tags = JSON.stringify(fields.tags);
  if (fields.notes !== undefined) partial.notes = fields.notes;
  if (fields.rating !== undefined) partial.rating = fields.rating ?? null;
  if (fields.aiMetadata !== undefined) partial.ai_metadata = JSON.stringify(fields.aiMetadata);
  if (fields.edited !== undefined) partial.edited = fields.edited ? 1 : 0;

  dbUpdateEntry(id, partial);

  let linkedTo: string[] = [];
  if (suggestedRelationships?.length) {
    linkedTo = resolveRelationships(id, suggestedRelationships);
  }

  const updated = getEntryById(id)!;
  return { ...rowToEntry(updated), linkedTo };
}

export async function bulkCreateEntries(
  items: { entry: Entry; suggestedRelationships?: SuggestedRelationship[] }[]
): Promise<{ created: Entry[]; skipped: string[]; linked: number }> {
  await ensureDbReady();
  const created: Entry[] = [];
  const skipped: string[] = [];
  let linked = 0;

  for (const item of items) {
    const existing = findEntryByNameFuzzy(item.entry.name);
    if (existing) {
      skipped.push(item.entry.name);
      continue;
    }
    dbCreateEntry(entryToRow(item.entry));
    const l1 = resolveRelationships(item.entry.id, item.suggestedRelationships ?? []);
    const l2 = resolvePendingForEntry(item.entry);
    linked += l1.length + l2.length;
    created.push(item.entry);
  }

  return { created, skipped, linked };
}

export async function deleteEntry(id: string): Promise<void> {
  await ensureDbReady();
  dbDeleteEntry(id);
}

export async function fetchNeighbours(
  id: string
): Promise<{ entry: Entry; neighbours: EntryNeighbour[] }> {
  await ensureDbReady();
  const result = getNeighboursForEntry(id);
  if (!result) throw new Error("Entry not found");
  return result;
}

export async function addRelationship(
  entryId: string,
  targetId: string,
  type: RelationshipType
): Promise<Relationship> {
  await ensureDbReady();
  const relId = crypto.randomUUID();
  dbCreateRelationship(relId, entryId, targetId, type, "user");
  return { id: relId, fromId: entryId, toId: targetId, type, createdBy: "user" };
}

export async function deleteRelationship(relId: string): Promise<void> {
  await ensureDbReady();
  dbDeleteRelationship(relId);
}

export async function fetchGraphData(): Promise<GraphPayload> {
  await ensureDbReady();
  return getGraphData();
}

export async function resolvePending(): Promise<{ resolved: number; remaining: number }> {
  await ensureDbReady();
  return resolveAllPending();
}
