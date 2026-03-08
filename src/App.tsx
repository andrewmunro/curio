import { useState, useEffect, useCallback } from "react";
import type { Entry, Category } from "@/lib/types";
import { useEntries } from "@/hooks/useEntries";
import { useSearch } from "@/hooks/useSearch";
import { useCategorise } from "@/hooks/useCategorise";
import { Topbar } from "@/components/Topbar";
import { Sidebar } from "@/components/Sidebar";
import { EntryGrid } from "@/components/EntryGrid";
import { EntryDetailPanel } from "@/components/EntryDetailPanel";
import { AddItemModal } from "@/components/AddItemModal";
import { ImportModal } from "@/components/ImportModal";
import { Toast } from "@/components/Toast";
import * as googleDrive from "@/lib/googleDrive";
import type { DriveState } from "@/lib/googleDrive";

export default function App() {
  const { entries, loading, refresh, addEntry, editEntry, removeEntry } = useEntries();
  const { query, setQuery, results } = useSearch(entries);
  const { pending, categoriseAndCreate } = useCategorise();

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [skeletonCount, setSkeletonCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [driveState, setDriveState] = useState<DriveState>(googleDrive.getState());

  const filtered = results.filter((entry) => {
    if (selectedCategory && entry.category !== selectedCategory) return false;
    if (selectedSubcategory && entry.subcategory !== selectedSubcategory) return false;
    return true;
  });

  const handleAdd = useCallback(
    async (name: string) => {
      setAddModalOpen(false);
      setSkeletonCount((c) => c + 1);

      try {
        const { entry, confidence, relationships } = await categoriseAndCreate(name);
        if (confidence === "low") {
          entry.aiMetadata._confidence = "low";
        }
        const result = await addEntry(entry, relationships);
        setSkeletonCount((c) => c - 1);

        setRefreshKey((k) => k + 1);
        const linkedMsg = result.linkedTo.length > 0
          ? ` (linked to ${result.linkedTo.join(", ")})`
          : "";
        setToast({ message: `Added "${result.entry.name}" to ${result.entry.category}${linkedMsg}`, type: "success" });
      } catch {
        setSkeletonCount((c) => c - 1);
        setToast({ message: `Failed to add "${name}". Please try again.`, type: "error" });
      }
    },
    [categoriseAndCreate, addEntry]
  );

  const handleSave = useCallback(
    async (id: string, fields: Partial<Entry>) => {
      try {
        const updated = await editEntry(id, fields);
        setSelectedEntry(updated);
        setToast({ message: "Entry updated", type: "success" });
      } catch {
        setToast({ message: "Failed to save changes", type: "error" });
      }
    },
    [editEntry]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await removeEntry(id);
        setSelectedEntry(null);
        setRefreshKey((k) => k + 1);
        setToast({ message: "Entry deleted", type: "success" });
      } catch {
        setToast({ message: "Failed to delete entry", type: "error" });
      }
    },
    [removeEntry]
  );

  const handleReanalyse = useCallback(
    async (name: string) => {
      if (!selectedEntry) return;
      try {
        const { entry, confidence, relationships } = await categoriseAndCreate(name);
        const fields: Partial<Entry> = {
          category: entry.category,
          subcategory: entry.subcategory,
          tags: entry.tags,
          aiMetadata: { ...entry.aiMetadata, ...(confidence === "low" ? { _confidence: "low" } : {}) },
          edited: false,
        };
        const result = await editEntry(selectedEntry.id, fields, relationships);
        setSelectedEntry(result);
        setRefreshKey((k) => k + 1);
        const linkedMsg = result.linkedTo?.length
          ? ` (linked to ${result.linkedTo.join(", ")})`
          : "";
        setToast({ message: `Re-analysed successfully${linkedMsg}`, type: "success" });
      } catch {
        setToast({ message: "Re-analysis failed", type: "error" });
      }
    },
    [selectedEntry, categoriseAndCreate, editEntry]
  );

  const handleImported = useCallback(
    () => {
      refresh();
      setRefreshKey((k) => k + 1);
    },
    [refresh]
  );

  const handleTagClick = useCallback(
    (tag: string) => {
      setQuery(tag);
      setSelectedCategory(null);
      setSelectedSubcategory(null);
    },
    [setQuery]
  );

  const handleNavigateToEntry = useCallback(
    (entry: Entry) => {
      setSelectedEntry(entry);
    },
    []
  );

  useEffect(() => {
    return googleDrive.subscribe(setDriveState);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (driveState.status === "connected") {
          driveState.fileId
            ? googleDrive.saveToExistingFile()
            : googleDrive.saveToNewFile();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setAddModalOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [driveState]);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <Topbar query={query} onQueryChange={setQuery} onAddClick={() => setAddModalOpen(true)} onImportClick={() => setImportModalOpen(true)} driveState={driveState} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          entries={entries}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          onSelectCategory={(c) => {
            setSelectedCategory(c);
            setSelectedSubcategory(null);
          }}
          onSelectSubcategory={(_cat, sub) => setSelectedSubcategory(sub)}
        />

        <EntryGrid
          entries={filtered}
          loading={loading}
          skeletonCount={skeletonCount}
          query={query}
          refreshKey={refreshKey}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          onEntryClick={setSelectedEntry}
          onTagClick={handleTagClick}
          onQueryChange={setQuery}
        />
      </div>

      <AddItemModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAdd}
        pending={pending}
      />

      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={handleImported}
        existingEntryNames={entries.map((e) => e.name)}
      />

      {selectedEntry && (
        <EntryDetailPanel
          entry={selectedEntry}
          allEntries={entries}
          onClose={() => setSelectedEntry(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onReanalyse={handleReanalyse}
          onTagClick={handleTagClick}
          onNavigateToEntry={handleNavigateToEntry}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
