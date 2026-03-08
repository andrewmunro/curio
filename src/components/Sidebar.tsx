import { useMemo, useState } from "react";
import type { Entry, Category } from "@/lib/types";
import { CATEGORIES, CATEGORY_ICONS } from "@/lib/types";

type SidebarProps = {
  entries: Entry[];
  selectedCategory: Category | null;
  selectedSubcategory: string | null;
  onSelectCategory: (c: Category | null) => void;
  onSelectSubcategory: (c: Category, sub: string | null) => void;
};

export function Sidebar({
  entries,
  selectedCategory,
  selectedSubcategory,
  onSelectCategory,
  onSelectSubcategory,
}: SidebarProps) {
  const [expanded, setExpanded] = useState<Set<Category>>(new Set());

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    const subcats: Record<string, Record<string, number>> = {};
    for (const e of entries) {
      map[e.category] = (map[e.category] || 0) + 1;
      if (!subcats[e.category]) subcats[e.category] = {};
      subcats[e.category][e.subcategory] = (subcats[e.category][e.subcategory] || 0) + 1;
    }
    return { category: map, subcategory: subcats };
  }, [entries]);

  const toggleExpand = (cat: Category) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <aside className="w-56 bg-zinc-900 border-r border-zinc-800 overflow-y-auto shrink-0">
      <nav className="p-3 space-y-0.5">
        <button
          onClick={() => onSelectCategory(null)}
          className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            selectedCategory === null
              ? "bg-indigo-600/20 text-indigo-300"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          All ({entries.length})
        </button>

        {CATEGORIES.map((cat) => {
          const count = counts.category[cat] || 0;
          if (count === 0) return null;

          const isActive = selectedCategory === cat && !selectedSubcategory;
          const isExpanded = expanded.has(cat);
          const subcats = counts.subcategory[cat] || {};

          return (
            <div key={cat}>
              <div className="flex items-center">
                <button
                  onClick={() => {
                    onSelectCategory(cat);
                    onSelectSubcategory(cat, null);
                  }}
                  className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-indigo-600/20 text-indigo-300 font-medium"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {CATEGORY_ICONS[cat]} {cat} ({count})
                </button>
                {Object.keys(subcats).length > 0 && (
                  <button
                    onClick={() => toggleExpand(cat)}
                    className="px-2 py-1 text-zinc-500 hover:text-zinc-300 text-xs"
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>
                )}
              </div>

              {isExpanded &&
                Object.entries(subcats)
                  .sort(([, a], [, b]) => b - a)
                  .map(([sub, subCount]) => (
                    <button
                      key={sub}
                      onClick={() => {
                        onSelectCategory(cat);
                        onSelectSubcategory(cat, sub);
                      }}
                      className={`w-full text-left pl-9 pr-3 py-1.5 text-xs rounded-md transition-colors ${
                        selectedCategory === cat && selectedSubcategory === sub
                          ? "bg-indigo-600/15 text-indigo-300"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                      }`}
                    >
                      {sub} ({subCount})
                    </button>
                  ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
