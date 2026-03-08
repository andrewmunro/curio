import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import type { Entry } from "@/lib/types";

export function useSearch(entries: Entry[]) {
  const [query, setQuery] = useState("");

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: ["name", "subcategory", "tags", "notes", { name: "aiMetadataValues", getFn: (e) => Object.values(e.aiMetadata) }],
        threshold: 0.3,
        ignoreLocation: true,
      }),
    [entries]
  );

  const results = useMemo(() => {
    if (!query.trim()) return entries;
    return fuse.search(query).map((r) => r.item);
  }, [fuse, query, entries]);

  return { query, setQuery, results };
}
