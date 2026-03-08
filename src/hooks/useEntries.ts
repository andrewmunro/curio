import { useState, useEffect, useCallback } from "react";
import type { Entry, SuggestedRelationship } from "@/lib/types";
import * as api from "@/lib/api";
import { onDbReplaced } from "@/lib/db";

export function useEntries() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.fetchEntries();
      setEntries(data);
    } catch (err) {
      console.error("Failed to load entries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return onDbReplaced(refresh);
  }, [refresh]);

  const addEntry = useCallback(async (entry: Entry, relationships?: SuggestedRelationship[]) => {
    const result = await api.createEntry(entry, relationships);
    setEntries((prev) => [result.entry, ...prev]);
    return result;
  }, []);

  const editEntry = useCallback(async (id: string, fields: Partial<Entry>, relationships?: SuggestedRelationship[]) => {
    const updated = await api.updateEntry(id, fields, relationships);
    setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    return updated;
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    await api.deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { entries, loading, refresh, addEntry, editEntry, removeEntry };
}
