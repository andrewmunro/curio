import { useState } from "react";
import type { Entry, Category } from "@/lib/types";
import { EntryCard, SkeletonCard } from "./EntryCard";
import { CATEGORY_ICONS } from "@/lib/types";
import { GraphView } from "./GraphView";

type SortKey = "dateAdded" | "name" | "rating" | "category";
type ViewMode = "grid" | "list" | "graph";

type EntryGridProps = {
  entries: Entry[];
  loading: boolean;
  skeletonCount: number;
  query: string;
  refreshKey: number;
  selectedCategory: Category | null;
  selectedSubcategory: string | null;
  onEntryClick: (entry: Entry) => void;
  onTagClick: (tag: string) => void;
  onQueryChange: (q: string) => void;
};

export function EntryGrid({
  entries, loading, skeletonCount, query,
  refreshKey, selectedCategory, selectedSubcategory, onEntryClick, onTagClick, onQueryChange,
}: EntryGridProps) {
  const [sortBy, setSortBy] = useState<SortKey>("dateAdded");
  const [viewMode, setViewMode] = useState<ViewMode>("graph");

  const sorted = [...entries].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "rating":
        return (b.rating || 0) - (a.rating || 0);
      case "category":
        return a.category.localeCompare(b.category);
      default:
        return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    }
  });

  return (
    <div className={`flex-1 p-6 ${viewMode === "graph" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-zinc-400">
          {query ? (
            <>{sorted.length} result{sorted.length !== 1 ? "s" : ""} for "{query}"</>
          ) : (
            <>{sorted.length} items</>
          )}
        </div>

        <div className="flex items-center gap-3">
          {viewMode !== "graph" && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="dateAdded">Date added</option>
              <option value="name">Name (A-Z)</option>
              <option value="rating">Rating</option>
              <option value="category">Category</option>
            </select>
          )}

          <div className="flex bg-zinc-800 rounded-md border border-zinc-700 overflow-hidden">
            {(["grid", "list", "graph"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-1 text-xs transition-colors ${
                  viewMode === mode ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title={mode.charAt(0).toUpperCase() + mode.slice(1) + " view"}
              >
                {mode === "grid" ? "▦" : mode === "list" ? "☰" : "◉"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode !== "graph" && sorted.length === 0 && !loading && skeletonCount === 0 && (
        <div className="text-center py-20">
          {query ? (
            <>
              <p className="text-zinc-400 text-lg mb-1">No results for "{query}"</p>
              <p className="text-zinc-500 text-sm">Try different terms or clear the search</p>
            </>
          ) : (
            <>
              <p className="text-4xl mb-4">🗺️</p>
              <p className="text-zinc-300 text-lg font-medium mb-1">Start by adding something you love</p>
              <p className="text-zinc-500 text-sm">Hit Cmd+N or click "Add Item" to begin mapping your tastes</p>
            </>
          )}
        </div>
      )}

      {viewMode === "graph" ? (
        <div className="flex-1 min-h-0">
          <GraphView
            onEntryClick={onEntryClick}
            refreshKey={refreshKey}
            query={query}
            selectedCategory={selectedCategory}
            selectedSubcategory={selectedSubcategory}
            onQueryChange={onQueryChange}
          />
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <SkeletonCard key={`skel-${i}`} />
          ))}
          {sorted.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onClick={() => onEntryClick(entry)} onTagClick={onTagClick} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={`skel-${i}`} className="h-12 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
          {sorted.map((entry) => (
            <div key={entry.id} onClick={() => onEntryClick(entry)}
              className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors group">
              <span className="text-sm">{CATEGORY_ICONS[entry.category]}</span>
              <span className="font-medium text-sm text-zinc-200 group-hover:text-indigo-300 transition-colors flex-1">{entry.name}</span>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{entry.subcategory}</span>
              {entry.rating && <span className="text-amber-400 text-xs">{"★".repeat(entry.rating)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
