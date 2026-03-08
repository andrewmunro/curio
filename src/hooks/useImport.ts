import { useState, useRef } from "react";
import type { Entry, SuggestedRelationship } from "@/lib/types";
import { CATEGORIES, type Category } from "@/lib/types";
import * as api from "@/lib/api";

const BATCH_SIZE = 5;
const MAX_RETRIES = 2;

type ImportItem = {
  name: string;
  rating?: 1 | 2 | 3 | 4 | 5;
};

export type ImportProgress = {
  phase: "idle" | "running" | "done";
  total: number;
  processed: number;
  created: number;
  skipped: number;
  linked: number;
  failed: number;
  batchIndex: number;
  batchCount: number;
  message: string;
};

const BATCH_PROMPT = `You are a categorisation assistant for a personal taste archive. Given a JSON array of item names, return a JSON array of the same length, where each element is a categorisation object for the item at that index.

Each object must have:
- name: the full, correct canonical title (fix abbreviations/shorthand)
- category: one of [Movies, Music, Books, Games, TV, Food, Art, Travel, Podcasts, People, Other]
- subcategory: always a genre or style label — never an entity name. Examples: "Sci-Fi", "Jazz", "Action RPG", "Pizza"
- parentName: the direct parent entity if one obviously exists, otherwise null
- tags: array of 3–6 strings — genre, mood, era, style
- aiMetadata: key-value object with relevant contextual info (director, year, author, etc.)
- confidence: "high" | "medium" | "low"
- relationships: array of { "targetName": string, "type": "related_to" }. Do NOT include parentName here. Max 3 per item. Empty array if none obvious.

Return ONLY a valid JSON array. No prose, no markdown.`;

function extractJSONArray(text: string): Record<string, unknown>[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function isValidCategory(val: unknown): val is Category {
  return typeof val === "string" && CATEGORIES.includes(val as Category);
}

function parseOneResult(
  item: ImportItem,
  parsed: Record<string, unknown>
): { entry: Entry; suggestedRelationships: SuggestedRelationship[] } {
  const category = isValidCategory(parsed.category) ? parsed.category : "Other";
  const subcategory = typeof parsed.subcategory === "string" ? parsed.subcategory : "Unknown";
  const tags = Array.isArray(parsed.tags)
    ? [...new Set(parsed.tags.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase().trim()))]
    : [];
  const aiMetadata =
    typeof parsed.aiMetadata === "object" && parsed.aiMetadata !== null
      ? Object.fromEntries(
          Object.entries(parsed.aiMetadata as Record<string, unknown>)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)])
        )
      : {};

  const rels: SuggestedRelationship[] = [];
  if (Array.isArray(parsed.relationships)) {
    for (const r of parsed.relationships) {
      if (
        typeof r === "object" && r !== null &&
        typeof (r as { targetName?: unknown }).targetName === "string" &&
        (r as { targetName: string }).targetName.trim().length > 0
      ) {
        rels.push({ targetName: (r as { targetName: string }).targetName.trim(), type: "related_to" });
      }
    }
  }

  const parentName = typeof parsed.parentName === "string" && parsed.parentName.trim()
    ? parsed.parentName.trim()
    : null;
  if (parentName) {
    rels.push({ targetName: parentName, type: "related_to" });
  }

  const resolvedName =
    typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : item.name;

  return {
    entry: {
      id: crypto.randomUUID(),
      name: resolvedName,
      category,
      subcategory,
      tags,
      notes: "",
      rating: item.rating,
      aiMetadata,
      dateAdded: new Date().toISOString(),
      edited: false,
    },
    suggestedRelationships: rels,
  };
}

async function callAI(names: string[]): Promise<string> {
  const response = await puter.ai.chat(
    [
      { role: "system", content: BATCH_PROMPT },
      { role: "user", content: JSON.stringify(names) },
    ],
    { model: "claude-sonnet-4" }
  );

  const content = response?.message?.content;
  return typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((b: { text?: string }) => b.text ?? "").join("")
      : String(response);
}

async function categoriseBatchWithRetry(
  batch: ImportItem[]
): Promise<{ entry: Entry; suggestedRelationships: SuggestedRelationship[] }[] | null> {
  const names = batch.map((item) => item.name);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const text = await callAI(names);
      console.log(`[import] batch response (attempt ${attempt + 1}):`, text);

      const parsed = extractJSONArray(text);
      if (parsed && parsed.length >= batch.length) {
        return batch.map((item, i) => parseOneResult(item, parsed[i] ?? {}));
      }
      if (parsed) {
        return batch.map((item, i) => parseOneResult(item, parsed[i] ?? {}));
      }
      console.warn(`[import] Failed to parse batch (attempt ${attempt + 1})`);
    } catch (err) {
      console.warn(`[import] AI call failed (attempt ${attempt + 1}):`, err);
    }
  }
  return null;
}

const INITIAL_PROGRESS: ImportProgress = {
  phase: "idle", total: 0, processed: 0, created: 0, skipped: 0,
  linked: 0, failed: 0, batchIndex: 0, batchCount: 0, message: "",
};

export function useImport() {
  const [progress, setProgress] = useState<ImportProgress>(INITIAL_PROGRESS);
  const abortRef = useRef(false);

  const reset = () => {
    abortRef.current = false;
    setProgress(INITIAL_PROGRESS);
  };

  const abort = () => { abortRef.current = true; };

  const runImport = async (
    items: ImportItem[],
    onBatchInserted?: (entries: Entry[]) => void
  ) => {
    abortRef.current = false;
    const total = items.length;

    const batches: ImportItem[][] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    const batchCount = batches.length;
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalLinked = 0;
    let totalFailed = 0;
    let totalProcessed = 0;

    setProgress({
      phase: "running", total, processed: 0, created: 0, skipped: 0,
      linked: 0, failed: 0, batchIndex: 0, batchCount,
      message: `Categorising batch 1 of ${batchCount}...`,
    });

    for (let bi = 0; bi < batches.length; bi++) {
      if (abortRef.current) break;
      const batch = batches[bi];

      setProgress((p) => ({
        ...p,
        batchIndex: bi,
        message: `Categorising batch ${bi + 1} of ${batchCount}...`,
      }));

      const categorised = await categoriseBatchWithRetry(batch);

      if (abortRef.current) break;

      if (!categorised) {
        totalFailed += batch.length;
        totalProcessed += batch.length;
        setProgress((p) => ({
          ...p, processed: totalProcessed, failed: totalFailed,
          message: `Batch ${bi + 1} failed, continuing...`,
        }));
        continue;
      }

      setProgress((p) => ({
        ...p, message: `Saving batch ${bi + 1} of ${batchCount}...`,
      }));

      try {
        const result = await api.bulkCreateEntries(categorised);
        totalCreated += result.created.length;
        totalSkipped += result.skipped.length;
        totalLinked += result.linked;
        totalProcessed += batch.length;

        if (onBatchInserted && result.created.length > 0) {
          onBatchInserted(result.created);
        }
      } catch (err) {
        console.warn(`[import] Failed to insert batch ${bi + 1}:`, err);
        totalFailed += batch.length;
        totalProcessed += batch.length;
      }

      setProgress({
        phase: "running", total, processed: totalProcessed,
        created: totalCreated, skipped: totalSkipped,
        linked: totalLinked, failed: totalFailed,
        batchIndex: bi + 1, batchCount,
        message: bi + 1 < batchCount ? `Categorising batch ${bi + 2} of ${batchCount}...` : "Finishing up...",
      });
    }

    setProgress({
      phase: "done", total, processed: totalProcessed,
      created: totalCreated, skipped: totalSkipped,
      linked: totalLinked, failed: totalFailed,
      batchIndex: batchCount, batchCount,
      message: "",
    });
  };

  return { progress, runImport, reset, abort };
}
