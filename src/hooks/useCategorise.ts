import { useState } from "react";
import type { Entry, CategoriseResponse, SuggestedRelationship } from "@/lib/types";
import { CATEGORIES, type Category } from "@/lib/types";

const RELATIONSHIP_TYPES = ["related_to"];

const SYSTEM_PROMPT = `You are a categorisation assistant for a personal taste archive. Given an item name, return a JSON object with the following fields. Be concise. Do not include explanation or markdown — return raw JSON only.

Fields:
- name: the full, correct title of the item (e.g. user types "always sunny" → name should be "It's Always Sunny in Philadelphia"). Fix abbreviations, shorthand, and missing words. Always use the canonical/official title.
- category: one of [Movies, Music, Books, Games, TV, Food, Art, Travel, Podcasts, People, Other]
- subcategory: always a genre or style label — never an entity name. Examples: "Pizza", "Sci-Fi", "Jazz", "Action RPG", "Fantasy", "Documentary", "Ramen"
- parentName: the direct parent entity if one obviously exists, otherwise null. Examples: "Pepperoni Pizza" → "Pizza", "Mort" → "Terry Pratchett", "The Fellowship of the Ring" → "Lord of the Rings", "Pizza" → null, "Star Wars" → null
- tags: array of 3–6 strings — mix of genre, mood, era, style. Examples: ["atmospheric", "90s", "cyberpunk", "noir"]
- aiMetadata: key-value object with relevant contextual info. For movies: director, year, country. For music: artist, genre, decade. For books: author, genre, year. For games: developer, platform, year. For food: cuisine, type. Omit irrelevant keys.
- confidence: "high" | "medium" | "low" — how confident you are in the categorisation
- relationships: array of related items. Each item: { "targetName": string, "type": "related_to" }. targetName should be the canonical name of a related item (an author, a franchise, a related work, etc.). Do NOT include the parentName here — it is handled separately. Max 5 relationships. Empty array if none obvious. Examples: "Mort" → [{"targetName": "Discworld", "type": "related_to"}]. "Terry Pratchett" → [{"targetName": "Discworld", "type": "related_to"}].

Return only valid JSON. No prose.`;

function extractJSON(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function isValidCategory(val: unknown): val is Category {
  return typeof val === "string" && CATEGORIES.includes(val as Category);
}

function parseRelationships(raw: unknown): SuggestedRelationship[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is { targetName: string; type: string } =>
        typeof r === "object" && r !== null &&
        typeof r.targetName === "string" && r.targetName.trim().length > 0 &&
        typeof r.type === "string" && RELATIONSHIP_TYPES.includes(r.type)
    )
    .slice(0, 5)
    .map((r) => ({ targetName: r.targetName.trim(), type: r.type as SuggestedRelationship["type"] }));
}

export function useCategorise() {
  const [pending, setPending] = useState(false);

  const categoriseAndCreate = async (
    name: string
  ): Promise<{ entry: Entry; confidence: CategoriseResponse["confidence"]; relationships: SuggestedRelationship[] }> => {
    setPending(true);
    try {
      const response = await puter.ai.chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: name.trim() },
        ],
        { model: "claude-sonnet-4" }
      );

      const content = response?.message?.content;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((b: { text?: string }) => b.text ?? "").join("")
            : String(response);
      console.log("[categorise] raw response:", text);

      const parsed = extractJSON(text);

      let result: CategoriseResponse;
      if (parsed && isValidCategory(parsed.category)) {
        const rels = parseRelationships(parsed.relationships);

        const parentName = typeof parsed.parentName === "string" && parsed.parentName.trim()
          ? parsed.parentName.trim()
          : null;
        if (parentName) {
          rels.push({ targetName: parentName, type: "related_to" });
        }

        result = {
          category: parsed.category,
          subcategory: typeof parsed.subcategory === "string" ? parsed.subcategory : "Unknown",
          tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === "string") : [],
          aiMetadata:
            typeof parsed.aiMetadata === "object" && parsed.aiMetadata !== null
              ? Object.fromEntries(
                  Object.entries(parsed.aiMetadata as Record<string, unknown>)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => [k, String(v)])
                )
              : {},
          confidence: ["high", "medium", "low"].includes(parsed.confidence as string)
            ? (parsed.confidence as CategoriseResponse["confidence"])
            : "medium",
          relationships: rels,
        };
      } else {
        console.warn("[categorise] failed to parse AI response:", text);
        result = {
          category: "Other",
          subcategory: "Unknown",
          tags: [],
          aiMetadata: {},
          confidence: "low",
          relationships: [],
        };
      }

      result.tags = [...new Set(result.tags.map((t) => t.toLowerCase().trim()))];

      const resolvedName =
        typeof parsed?.name === "string" && parsed.name.trim() ? parsed.name.trim() : name.trim();

      const entry: Entry = {
        id: crypto.randomUUID(),
        name: resolvedName,
        category: result.category,
        subcategory: result.subcategory,
        tags: result.tags,
        notes: "",
        aiMetadata: result.aiMetadata,
        dateAdded: new Date().toISOString(),
        edited: false,
      };

      return { entry, confidence: result.confidence, relationships: result.relationships ?? [] };
    } finally {
      setPending(false);
    }
  };

  return { pending, categoriseAndCreate };
}
