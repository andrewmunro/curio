import type { Entry } from "@/lib/types";
import { CATEGORY_ICONS } from "@/lib/types";
import { TagPill } from "./TagPill";

type EntryCardProps = {
  entry: Entry;
  onClick: () => void;
  onTagClick: (tag: string) => void;
};

export function EntryCard({ entry, onClick, onTagClick }: EntryCardProps) {
  const visibleTags = entry.tags.slice(0, 3);
  const remaining = entry.tags.length - 3;

  return (
    <div
      onClick={onClick}
      className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 cursor-pointer hover:border-zinc-600 hover:bg-zinc-800 transition-all group animate-in"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-zinc-100 text-sm leading-tight group-hover:text-indigo-300 transition-colors">
          {entry.name}
        </h3>
        {entry.aiMetadata._confidence === "low" && (
          <span className="text-amber-400 text-xs shrink-0" title="Low confidence AI result">
            ⚠
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-zinc-500">
          {CATEGORY_ICONS[entry.category]}
        </span>
        <span className="text-xs font-medium text-zinc-400 bg-zinc-700/50 px-2 py-0.5 rounded-full">
          {entry.subcategory}
        </span>
      </div>

      {visibleTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {visibleTags.map((tag) => (
            <TagPill
              key={tag}
              tag={tag}
              isAi
              onClick={() => onTagClick(tag)}
            />
          ))}
          {remaining > 0 && (
            <span className="text-xs text-zinc-500 self-center">+{remaining} more</span>
          )}
        </div>
      )}

      {entry.rating && (
        <div className="text-amber-400 text-xs tracking-wider">
          {"★".repeat(entry.rating)}
          {"☆".repeat(5 - entry.rating)}
        </div>
      )}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-zinc-700 rounded w-3/4 mb-3" />
      <div className="h-3 bg-zinc-700/60 rounded w-1/2 mb-3" />
      <div className="flex gap-1">
        <div className="h-5 bg-zinc-700/40 rounded-full w-16" />
        <div className="h-5 bg-zinc-700/40 rounded-full w-12" />
        <div className="h-5 bg-zinc-700/40 rounded-full w-20" />
      </div>
    </div>
  );
}
